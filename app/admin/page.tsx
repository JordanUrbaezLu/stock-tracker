"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useAdmin } from "../AdminContext";

export default function AdminPage() {
  const { isAdmin, setIsAdmin, refresh, clearAdmin } = useAdmin();
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
            Enter the password to locally set your admin key for today.
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
              disabled={isAdmin || status === "checking"}
            />
          </label>
          <button
            type="submit"
            disabled={status === "loading" || isAdmin || status === "checking"}
            className="h-11 w-full cursor-pointer rounded-lg bg-cyan-500 text-sm font-semibold text-cyan-950 transition hover:-translate-y-0.5 hover:bg-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-700/60"
          >
            {status === "loading" ? "Setting key..." : "Set admin key"}
          </button>
          {status === "success" && (
            <p className="text-sm text-emerald-400">
              Admin access granted for today. You can now access protected admin features.
            </p>
          )}
          {status !== "success" && isAdmin && (
            <p className="text-sm text-emerald-400">
              You already have admin access for today. Feel free to continue.
            </p>
          )}
          {status === "error" && (
            <p className="text-sm text-rose-300">Incorrect password.</p>
          )}
          {isAdmin && (
            <div className="pt-3">
              <button
                type="button"
                onClick={() => void clearAdmin()}
                className="h-10 w-full cursor-pointer rounded-lg border border-rose-400/50 bg-rose-900/40 text-sm font-semibold text-rose-100 transition hover:-translate-y-0.5 hover:border-rose-300 hover:text-white"
              >
                Remove admin access
              </button>
              <p className="mt-2 text-xs text-slate-400">
                This clears your local admin key; you’ll need to re-enter the password to regain access.
              </p>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
