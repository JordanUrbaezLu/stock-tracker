#!/usr/bin/env node
/**
 * Screenshot helper for visual QA — drives the system Google Chrome through
 * playwright-core (no browser download). Run against `npm run dev`.
 *
 *   node scripts/screenshot.mjs [options] <path> [<path> ...]
 *
 * Options
 *   --base <url>        default http://localhost:3000
 *   --out <dir>         default ./.screenshots (git-ignored)
 *   --widths <list>     default 390,834,1440 (390=iPhone, 834=iPad, else desktop)
 *   --scheme <s>        light | dark (prefers-color-scheme), default light
 *   --viewer <slug>     preset the "Who's checking in?" identity (or "guest")
 *   --admin             show admin UI (client flag only — NEVER submit mutations)
 *   --click <selector>  click after load; repeatable, runs in order
 *   --wait <ms>         settle time after network idle, default 2500
 *   --viewport          capture the viewport only (default: full page)
 *   --reduce-motion     emulate prefers-reduced-motion
 *   --name <prefix>     filename prefix, default derived from the path
 *
 * Prints one line per file plus any console errors / page errors.
 * Example: node scripts/screenshot.mjs --viewer guest / /stocks /investor/alexa
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const opts = {
  base: "http://localhost:3000",
  out: ".screenshots",
  widths: [390, 834, 1440],
  scheme: "light",
  viewer: null,
  admin: false,
  clicks: [],
  wait: 2500,
  fullPage: true,
  reduceMotion: false,
  name: null,
};
const paths = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const next = () => args[++i];
  if (a === "--base") opts.base = next();
  else if (a === "--out") opts.out = next();
  else if (a === "--widths") opts.widths = next().split(",").map(Number);
  else if (a === "--scheme") opts.scheme = next();
  else if (a === "--viewer") opts.viewer = next();
  else if (a === "--admin") opts.admin = true;
  else if (a === "--click") opts.clicks.push(next());
  else if (a === "--wait") opts.wait = Number(next());
  else if (a === "--viewport") opts.fullPage = false;
  else if (a === "--reduce-motion") opts.reduceMotion = true;
  else if (a === "--name") opts.name = next();
  else paths.push(a);
}
if (paths.length === 0) paths.push("/");

function device(width) {
  if (width <= 480)
    return { viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  if (width <= 1100)
    return { viewport: { width, height: 1194 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  return { viewport: { width, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
}

const outDir = resolve(opts.out);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
let failures = 0;

for (const path of paths) {
  for (const width of opts.widths) {
    const context = await browser.newContext({
      ...device(width),
      colorScheme: opts.scheme === "dark" ? "dark" : "light",
      reducedMotion: opts.reduceMotion ? "reduce" : "no-preference",
    });
    // Seed device-local state before any app script runs: muted sounds, no
    // install nudge, optional viewer identity, optional admin flag.
    await context.addInitScript(
      ({ viewer, admin }) => {
        try {
          localStorage.setItem("sound_enabled", "0");
          localStorage.setItem("pulse:nudge-dismissed", "1");
          if (viewer) localStorage.setItem("pulse:viewer", viewer);
          const key = `admin_auth_${new Date().toISOString().split("T")[0]}`;
          if (admin) localStorage.setItem(key, "1");
          else localStorage.removeItem(key);
        } catch {}
      },
      { viewer: opts.viewer, admin: opts.admin },
    );
    const page = await context.newPage();
    const errors = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 300)}`);
    });
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 300)}`));
    try {
      await page.goto(opts.base + path, { waitUntil: "load", timeout: 60000 });
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(opts.wait);
      for (const sel of opts.clicks) {
        await page.locator(sel).first().click({ timeout: 10000 });
        await page.waitForTimeout(900);
      }
      const slug = opts.name ?? (path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home");
      const file = join(outDir, `${slug}-${width}-${opts.scheme}.png`);
      // html and body both clip horizontally, so the root never reports
      // overflow — the body's own scroll width still does.
      const overflow = await page.evaluate(
        () => document.body.scrollWidth - window.innerWidth,
      );
      const warn = overflow > 0 ? `  ⚠ horizontal overflow ${overflow}px` : "";
      if (!opts.fullPage) {
        await page.screenshot({ path: file });
        console.log(file + warn);
      } else {
        // Full-page capture never scrolls, so in-view entrances (stickers,
        // stamps, podium) below the fold would stay hidden — scroll through
        // first, then return to the top.
        const vh = device(width).viewport.height;
        const total = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < total; y += Math.round(vh * 0.6)) {
          await page.evaluate((top) => window.scrollTo(0, top), y);
          await page.waitForTimeout(250);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(600);
        // Chrome tiles/repeats captures taller than ~16k device px; slice them.
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        const dpr = device(width).deviceScaleFactor;
        const slice = Math.floor(15000 / dpr);
        if (height <= slice) {
          await page.screenshot({ path: file, fullPage: true });
          console.log(file + warn);
        } else {
          for (let i = 0, y = 0; y < height; i++, y += slice) {
            const part = file.replace(/\.png$/, `-part${i + 1}.png`);
            await page.screenshot({
              path: part,
              fullPage: true,
              clip: { x: 0, y, width, height: Math.min(slice, height - y) },
            });
            console.log(part + (i === 0 ? warn : ""));
          }
        }
      }
    } catch (e) {
      failures++;
      console.log(`FAILED ${path} @${width}: ${String(e).split("\n")[0]}`);
    }
    for (const err of errors) console.log(`  ${err}`);
    await context.close();
  }
}
await browser.close();
process.exit(failures ? 1 : 0);
