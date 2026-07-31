"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAdmin } from "../AdminContext";
import { useSound } from "../SoundContext";
import { BackButton } from "../BackButton";

export default function AdminPage() {
  const { isAdmin, setIsAdmin, refresh, clearAdmin } = useAdmin();
  const { play } = useSound();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"checking" | "idle" | "success" | "error" | "loading">(
    "checking",
  );

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

  return (
    <div className="app-backdrop min-h-dvh pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-slate-100">
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 pb-[max(3rem,calc(env(safe-area-inset-bottom)+1.5rem))] pt-[max(3rem,env(safe-area-inset-top))] sm:px-6">
        <div>
          <BackButton className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:-translate-y-0.5 hover:border-cyan-300/50 hover:text-white" />
        </div>

        <div className="glass rounded-3xl p-6 shadow-2xl shadow-black/30 sm:p-8">
          <header className="space-y-3 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-linear-to-br from-cyan-400 via-fuchsia-500 to-indigo-500 text-2xl shadow-lg shadow-fuchsia-500/20">
              🔐
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-300">
              Admin
            </p>
            <h1 className="gradient-text text-3xl font-bold tracking-tight">
              Admin Login
            </h1>
            <p className="text-sm text-slate-400">
              Enter the password to locally set your admin key for today.
            </p>
          </header>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block space-y-2 text-sm text-slate-200">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 text-base text-slate-100 outline-none transition focus:border-cyan-400"
                placeholder="Enter password"
                disabled={isAdmin || status === "checking"}
              />
            </label>
            <button
              type="submit"
              disabled={status === "loading" || isAdmin || status === "checking"}
              className="h-12 w-full cursor-pointer rounded-xl bg-linear-to-r from-cyan-500 to-fuchsia-500 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "loading" ? "Setting key..." : "Set admin key"}
            </button>
            {status === "success" && (
              <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                Admin access granted for today. You can now access protected admin features.
              </p>
            )}
            {status !== "success" && isAdmin && (
              <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                You already have admin access for today. Feel free to continue.
              </p>
            )}
            {status === "error" && (
              <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                Incorrect password.
              </p>
            )}
            {isAdmin && (
              <div className="border-t border-white/5 pt-4">
                <button
                  type="button"
                  onClick={() => void clearAdmin()}
                  className="h-11 w-full cursor-pointer rounded-xl border border-rose-400/50 bg-rose-500/10 text-sm font-semibold text-rose-100 transition hover:-translate-y-0.5 hover:border-rose-300 hover:text-white"
                >
                  Remove admin access
                </button>
                <p className="mt-2 text-xs text-slate-400">
                  This clears your local admin key; you’ll need to re-enter the password to regain access.
                </p>
              </div>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}
