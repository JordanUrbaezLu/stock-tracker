"use client";

import Link from "next/link";
import { FormEvent, useState, useEffect } from "react";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<
    "checking" | "idle" | "success" | "error" | "loading" | "hasCookie"
  >("checking");

  useEffect(() => {
    const hasCookie = document.cookie.split(";").some((c) => c.trim().startsWith("admin_auth="));
    const hasLocal =
      typeof window !== "undefined" &&
      window.localStorage.getItem("admin_auth") === "1";
    if (hasCookie || hasLocal) {
      setStatus("hasCookie");
    } else {
      setStatus("idle");
    }
  }, []);

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
      setStatus("success");
      if (typeof window !== "undefined") {
        window.localStorage.setItem("admin_auth", "1");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-black text-slate-100">
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-5 py-12">
        <header className="space-y-2 text-center">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="text-xs font-semibold text-cyan-200 underline-offset-4 hover:underline"
            >
              ← Back to summary
            </Link>
          </div>
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">
            Admin
          </p>
          <h1 className="text-3xl font-semibold text-white">Admin login</h1>
          <p className="text-sm text-slate-400">
            Enter the password to set your admin cookie. This is temporary until
            the DB-backed admin is ready.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-cyan-500/20 bg-slate-900/70 p-6 shadow-lg shadow-cyan-500/20"
        >
          <label className="block space-y-2 text-sm text-slate-200">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-slate-100 outline-none ring-2 ring-transparent transition focus:border-cyan-500 focus:ring-cyan-900"
              placeholder="Enter password"
              disabled={status === "hasCookie"}
            />
          </label>
          <button
            type="submit"
            disabled={status === "loading" || status === "hasCookie" || status === "checking"}
            className="h-11 w-full cursor-pointer rounded-lg bg-cyan-500 text-sm font-semibold text-cyan-950 transition hover:-translate-y-0.5 hover:bg-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-700/60"
          >
            {status === "loading" ? "Setting cookie..." : "Set admin cookie"}
          </button>
          {status === "success" && (
            <p className="text-sm text-emerald-400">
              Admin cookie set. You can now access protected admin features.
            </p>
          )}
          {status === "hasCookie" && (
            <p className="text-sm text-emerald-400">
              You already have admin access. Feel free to continue.
            </p>
          )}
          {status === "error" && (
            <p className="text-sm text-rose-300">Incorrect password.</p>
          )}
        </form>
      </main>
    </div>
  );
}
