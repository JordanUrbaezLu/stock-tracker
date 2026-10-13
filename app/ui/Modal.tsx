"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { lockBodyScroll, unlockBodyScroll } from "../scrollLock";
import { IconButton } from "./Button";
import { IconClose } from "./icons";
import { cx } from "./cx";
import { POP } from "./motion";

// The sheet pops in on the pop spring, tempered slightly so a tall form
// doesn't wobble.
const SHEET = { ...POP, damping: 22 } as const;

const SIZE = {
  sm: "max-w-[380px]",
  md: "max-w-[448px]",
  lg: "max-w-[520px]",
} as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const FIRST_FIELD =
  'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])';

// True only after hydration, so the portal never renders on the server.
const noopSubscribe = () => () => {};
const useIsClient = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

export type ModalProps = {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  /** Pinned under the scrolling body — usually <ModalActions>. A submit
   *  button here needs form="<form id>" to submit a form in the body. */
  footer?: ReactNode;
  /** max-width 380 · 448 (default) · 520px. */
  size?: keyof typeof SIZE;
  /** false = overlay click, ESC and the close button do nothing (pass while
   *  saving). Default true. */
  dismissible?: boolean;
  /** Muted line under the title; becomes aria-describedby. */
  description?: ReactNode;
};

/**
 * The one modal. Portals to <body> (always hall-themed), locks page scroll
 * (iOS-safe), traps Tab, closes on ESC, and hands focus back on close.
 * Phones: top-anchored so the iOS keyboard never covers it; ≥640 centered.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = "md",
  dismissible = true,
  description,
}: ModalProps) {
  const isClient = useIsClient();
  const reduce = useReducedMotion();
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Close on overlay clicks only when the press also started on the overlay —
  // a text selection dragged out of the panel shouldn't dismiss it.
  const pressStartedOnOverlay = useRef(false);

  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [open]);

  const onEscape = useEffectEvent((e: globalThis.KeyboardEvent) => {
    // A Menu inside the panel marks its own ESC handled.
    if (e.key !== "Escape" || e.defaultPrevented || !dismissible) return;
    e.preventDefault();
    onClose();
  });

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => onEscape(e);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Focus the first field (else the panel) on open; restore it on close.
  // Waits for isClient because a modal open at hydration has no panel yet.
  useEffect(() => {
    if (!open || !isClient) return;
    const returnTo =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    // Touch devices: focusing a field pops the keyboard over the sheet the
    // instant it opens — focus the panel and let people tap the field.
    const fine = window.matchMedia?.("(pointer: fine)").matches ?? true;
    const target =
      (fine ? panel?.querySelector<HTMLElement>(FIRST_FIELD) : null) ?? panel;
    target?.focus({ preventScroll: true });
    return () => {
      if (returnTo?.isConnected) returnTo.focus({ preventScroll: true });
    };
  }, [open, isClient]);

  const trapTab = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.getClientRects().length > 0,
    );
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!isClient) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal-overlay"
          className="fixed inset-0 z-50 flex items-start justify-center bg-seam/55 px-4 dark:bg-seam/75 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:py-8"
          initial={{ opacity: 0 }}
          // pointerEvents: the overlay stays mounted until the panel's exit
          // spring settles (~0.4s) — invisible, but it would still swallow
          // taps on the page. Off the moment it starts closing; back on if
          // it is reopened mid-exit.
          animate={{ opacity: 1, pointerEvents: "auto" }}
          exit={{ opacity: 0, pointerEvents: "none" }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          onPointerDown={(e) => {
            pressStartedOnOverlay.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            const fromOverlay = pressStartedOnOverlay.current && e.target === e.currentTarget;
            pressStartedOnOverlay.current = false;
            if (fromOverlay && dismissible) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description != null ? descriptionId : undefined}
            tabIndex={-1}
            onKeyDown={trapTab}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
            transition={
              reduce
                ? { duration: 0.15 }
                : { ...SHEET, opacity: { duration: 0.16, ease: "easeOut" } }
            }
            // The panel is only focused as a fallback target; an outline
            // around the whole sheet reads as an error, not focus. Inline so
            // it beats the unlayered global :focus-visible rule without
            // touching descendants.
            style={{ outline: "none" }}
            className={cx(
              "flex max-h-[85dvh] w-full flex-col rounded-[28px] border border-line bg-surface shadow-pop dark:border-line-strong",
              SIZE[size],
            )}
          >
            <div className="flex shrink-0 items-start gap-3 pt-4 pr-4 pb-4 pl-5 md:pl-6">
              <div className="min-w-0 flex-1 pt-2">
                <h2 id={titleId} className="type-title text-[22px] leading-tight text-ink">
                  {title}
                </h2>
                {description != null && (
                  <div
                    id={descriptionId}
                    className="mt-1.5 text-[15px] leading-snug text-muted"
                  >
                    {description}
                  </div>
                )}
              </div>
              <IconButton
                label="Close"
                variant="secondary"
                onClick={onClose}
                disabled={!dismissible}
              >
                <IconClose strokeWidth={2.25} />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 md:px-6">
              {children}
            </div>
            {/* A tray the action keys rest on; pb leaves room for their lips. */}
            {footer != null && (
              <div className="shrink-0 rounded-b-[27px] border-t border-line bg-surface-2 px-5 pt-4 pb-5 md:px-6">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Right-aligned action row; on phones the buttons share the row equally. */
export function ModalActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-wrap items-center justify-end gap-2 max-sm:*:flex-1",
        className,
      )}
    >
      {children}
    </div>
  );
}
