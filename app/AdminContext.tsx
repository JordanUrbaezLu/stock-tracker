"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const ADMIN_COOKIE_PREFIX = "admin_auth_";

type AdminContextValue = {
  isAdmin: boolean;
  checking: boolean;
  setIsAdmin: (value: boolean) => void;
  refresh: () => void;
  todayKey: string;
  clearAdmin: () => Promise<void>;
};

function getTodayKey() {
  return `${ADMIN_COOKIE_PREFIX}${new Date().toISOString().split("T")[0]}`;
}

function hasTokenForToday(todayKey: string) {
  if (typeof document !== "undefined") {
    const hasCookie = document.cookie
      .split(";")
      .some((entry) => entry.trim().startsWith(`${todayKey}=`));
    if (hasCookie) return true;
  }
  if (typeof window !== "undefined") {
    const hasLocal = window.localStorage.getItem(todayKey) === "1";
    if (hasLocal) return true;
  }
  return false;
}

function clearStaleKeys(todayKey: string) {
  if (typeof document !== "undefined") {
    document.cookie.split(";").forEach((raw) => {
      const [name] = raw.split("=").map((s) => s.trim());
      if (name && name.startsWith(ADMIN_COOKIE_PREFIX) && name !== todayKey) {
        document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      }
    });
  }
  if (typeof window !== "undefined") {
    Object.keys(window.localStorage).forEach((key) => {
      if (key.startsWith(ADMIN_COOKIE_PREFIX) && key !== todayKey) {
        window.localStorage.removeItem(key);
      }
    });
  }
}

const AdminContext = createContext<AdminContextValue | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdminState] = useState(false);
  const [checking, setChecking] = useState(true);
  const todayKey = useMemo(() => getTodayKey(), []);

  const refresh = useCallback(() => {
    clearStaleKeys(todayKey);
    const has = hasTokenForToday(todayKey);
    setIsAdminState(has);
    setChecking(false);
  }, [todayKey]);

  useEffect(() => {
    // Run after mount to sync admin state without blocking render.
    setTimeout(() => refresh(), 0);
  }, [refresh]);

  const setIsAdmin = useCallback(
    (value: boolean) => {
      if (value && typeof window !== "undefined") {
        window.localStorage.setItem(todayKey, "1");
      }
      if (!value && typeof window !== "undefined") {
        window.localStorage.removeItem(todayKey);
      }
      setIsAdminState(value);
    },
    [todayKey],
  );

  const clearAdmin = useCallback(async () => {
    clearStaleKeys(todayKey);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(todayKey);
    }
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // ignore
    }
    setIsAdminState(false);
  }, [todayKey]);

  const value = useMemo(
    () => ({
      isAdmin,
      checking,
      setIsAdmin,
      refresh,
      todayKey,
      clearAdmin,
    }),
    [checking, isAdmin, refresh, setIsAdmin, clearAdmin, todayKey],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    throw new Error("useAdmin must be used within an AdminProvider");
  }
  return ctx;
}

export { ADMIN_COOKIE_PREFIX };
