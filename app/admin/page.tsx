"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { motion } from "motion/react";
import { useAdmin } from "../AdminContext";
import { useSound } from "../SoundContext";
import { AppShell } from "@/app/ui/AppShell";
import { Button } from "@/app/ui/Button";
import { Card } from "@/app/ui/Card";
import { Field, Input } from "@/app/ui/Field";
import { FlapDisplay } from "@/app/ui/FlapDisplay";
import { Stamp } from "@/app/ui/Stamp";
import { IconCheck, IconInfo, IconLock, IconUnlock } from "@/app/ui/icons";
import { cx } from "@/app/ui/cx";

type Status = "checking" | "idle" | "success" | "error" | "loading";

/** Bouncy "pop" spring from DESIGN.md §1. */
const POP = { type: "spring", stiffness: 420, damping: 18 } as const;

export default function AdminPage() {
  const { isAdmin, setIsAdmin, refresh, clearAdmin } = useAdmin();
  const { play } = useSound();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("checking");
  // Presentation only: the Lock key says "Locking…" while the logout request
  // is in flight (clearAdmin itself is unchanged).
  const [locking, setLocking] = useState(false);

  useEffect(() => {
    refresh();
    setStatus("idle");
  }, [refresh]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        throw new Error("Invalid password");
      }
      setIsAdmin(true);
      setStatus("success");
      play("success");
    } catch {
      setStatus("error");
      play("error");
    }
  };

  const handleLock = async () => {
    if (locking) return;
    setLocking(true);
    try {
      await clearAdmin();
    } finally {
      setLocking(false);
    }
  };

  const failed = status === "error";
  const busy = status === "loading";

  return (
    <AppShell width="narrow" back hero={<Hero isAdmin={isAdmin} />}>
      {/* The whole object shakes its head at a wrong password. */}
      <motion.div
        className="relative -mt-14"
        initial={false}
        animate={failed ? "shake" : "rest"}
        variants={{
          rest: { x: 0 },
          shake: { x: [0, -10, 9, -6, 4, 0], transition: { duration: 0.45 } },
        }}
      >
        <Padlock open={isAdmin} rattle={failed} />

        <Card as="section" padding="lg" raised aria-label="Admin password">
          {/* While a login is in flight the form swallows further submits —
              the original did this by disabling the submit button. */}
          <form
            onSubmit={busy ? (event) => event.preventDefault() : handleSubmit}
            aria-busy={busy || undefined}
            className="flex flex-col gap-4"
          >
            <Field label="Password" htmlFor="admin-password">
              <Input
                id="admin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                disabled={isAdmin || status === "checking"}
                invalid={failed}
                aria-describedby={failed ? "admin-error" : undefined}
              />
            </Field>

            {/* pb-1 leaves room for the key's lip above whatever follows. */}
            <div className="pb-1">
              <Button
                type="submit"
                size="lg"
                fullWidth
                // While loading the key stays amber and keeps focus, and says
                // what is happening in words: a spinner plus "Unlocking…".
                icon={busy ? <KeySpinner /> : <IconUnlock />}
                disabled={isAdmin || status === "checking"}
                className={busy ? "cursor-progress!" : undefined}
              >
                {busy ? "Unlocking…" : "Unlock admin"}
              </Button>
            </div>

            {status === "success" && isAdmin && (
              <Callout tone="gain">
                Admin unlocked for today. Editing tools now appear across the app.
              </Callout>
            )}
            {status !== "success" && isAdmin && (
              <Callout tone="gain">You already have admin access today.</Callout>
            )}
            {failed && (
              <Callout tone="loss" id="admin-error">
                That password didn’t work. Check it and try again.
              </Callout>
            )}

            {isAdmin && (
              <div className="border-t border-line pt-4">
                <Button
                  variant="secondary"
                  fullWidth
                  icon={locking ? <KeySpinner /> : <IconLock />}
                  className={locking ? "cursor-progress!" : undefined}
                  onClick={() => void handleLock()}
                >
                  {locking ? "Locking…" : "Lock admin"}
                </Button>
                <p className="mt-4 text-[13px] leading-relaxed text-muted text-pretty">
                  This clears the admin key on this device. You’ll need the password to unlock
                  again.
                </p>
              </div>
            )}
          </form>
        </Card>
      </motion.div>
    </AppShell>
  );
}

/* ── Scoreboard hero ─────────────────────────────────────────────────────── */

function Hero({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="pb-6">
      <h1 className="type-eyebrow text-amber">Admin access</h1>

      {/* The flap sizes itself to its parent, so its block gets a definite
          width: 8 tiles ("UNLOCKED" ≈ 5.4em of the lg flap size). A
          shrink-wrapped block would keep the 6-tile width and squeeze the
          re-flip. The stamp lands beside it the moment the lock opens. */}
      <div className="mt-3 flex min-h-[52px] items-center gap-3 md:gap-5">
        <div className="w-[calc(clamp(30px,7.5vw,52px)*5.5)] min-w-0">
          <FlapDisplay
            size="lg"
            value={isAdmin ? "UNLOCKED" : "LOCKED"}
            tone={isAdmin ? "amber" : "ink"}
            label={isAdmin ? "Admin is unlocked" : "Admin is locked"}
            sound
          />
        </div>
        {isAdmin && (
          <span
            aria-hidden
            className="inline-block shrink-0 origin-left max-[374px]:scale-[0.85] md:scale-[1.2]"
          >
            <Stamp tone="amber" rotate={-7}>
              Unlocked
            </Stamp>
          </span>
        )}
      </div>

      <p className="mt-4 max-w-[36ch] pr-16 text-[15px] leading-relaxed text-muted text-pretty md:pr-0">
        {isAdmin
          ? "Editing is unlocked on this device for today."
          : "Enter the admin password to unlock editing on this device for today."}
      </p>
    </div>
  );
}

/** The Button's own spinner, sized for the icon slot so the label stays. */
function KeySpinner() {
  return (
    <span
      aria-hidden
      className="size-[1.1em] shrink-0 animate-spin rounded-full border-[2.5px] border-current border-r-transparent motion-reduce:animate-[spin_1.6s_linear_infinite]"
    />
  );
}

/* ── Callout ─────────────────────────────────────────────────────────────── */

function Callout({
  tone,
  id,
  children,
}: {
  tone: "gain" | "loss";
  id?: string;
  children: ReactNode;
}) {
  const good = tone === "gain";
  return (
    <motion.div
      id={id}
      role={good ? "status" : "alert"}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={POP}
      className={cx(
        "flex items-start gap-3 rounded-2xl border px-4 py-3",
        good ? "border-gain/25 bg-gain-soft" : "border-loss/30 bg-loss-soft",
      )}
    >
      <span
        aria-hidden
        className={cx(
          "mt-px grid size-6 shrink-0 place-items-center rounded-full text-surface",
          good ? "bg-gain" : "bg-loss",
        )}
      >
        {good ? <IconCheck size={14} /> : <IconInfo size={14} />}
      </span>
      <p className="min-w-0 text-[15px] font-medium leading-snug text-ink text-pretty">
        {children}
      </p>
    </motion.div>
  );
}

/* ── Padlock ─────────────────────────────────────────────────────────────────
   A brass padlock hung on the card's top edge, half on the scoreboard. Its
   shackle springs open when admin unlocks and it rattles at a wrong password.
   Decorative: the flap and the callouts carry the state in words. */

function Padlock({ open, rattle }: { open: boolean; rattle: boolean }) {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute -top-11 right-5 z-10 w-14 md:right-6"
      style={{ originX: 0.5, originY: 0.2 }}
      initial={false}
      animate={rattle ? "rattle" : "still"}
      variants={{
        still: { rotate: 6 },
        rattle: { rotate: [6, -8, 14, -2, 10, 6], transition: { duration: 0.5 } },
      }}
    >
      {/* Shackle: steel loop, pivots on its left leg. */}
      <motion.div
        className="mx-auto h-9 w-9 rounded-t-full border-[7px] border-b-0 border-board-muted"
        style={{ originX: 0.1, originY: 1 }}
        initial={false}
        animate={open ? { y: 1, rotate: -26 } : { y: 6, rotate: 0 }}
        transition={POP}
      />
      {/* Body: brass, with the same solid lip as the keys. */}
      <motion.div
        className="relative grid h-11 w-14 place-items-center rounded-[14px] bg-amber-bright shadow-[0_4px_0_var(--amber-lip)]"
        initial={false}
        animate={open ? { scale: [1, 1.14, 1] } : { scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <span className="absolute inset-x-2 top-1.5 h-1.5 rounded-full bg-board-ink/40" />
        <span className="flex flex-col items-center">
          <span className="size-2.5 rounded-full bg-board" />
          <span className="-mt-0.5 h-2.5 w-1.5 rounded-b-sm bg-board" />
        </span>
      </motion.div>
    </motion.div>
  );
}
