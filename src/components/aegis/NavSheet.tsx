import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Menu, X, ChevronRight, Lock, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lockVault } from "@/lib/vault-session";
import {
  BORDER,
  Backdrop,
  CHARCOAL,
  CREAM_SOFT,
  Eyebrow,
  GhostButton,
  INSET_SHADOW,
  IconChip,
  MUTED,
  soft,
  spring,
} from "./chrome";
import { NAV_ITEMS } from "./nav-items";

interface Props {
  userEmail?: string | null;
}

/**
 * A single drop-in menu: renders the hamburger button (fits the BrandBar `right`
 * slot) plus the portalled slide-in sheet. Manages its own open state.
 */
export function AegisMenu({ userEmail }: Props) {
  const [open, setOpen] = useState(false);

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full"
        style={{
          background: CREAM_SOFT,
          border: `1px solid ${BORDER}`,
          color: CHARCOAL,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
        }}
      >
        <Menu className="h-4 w-4" strokeWidth={1.8} />
      </motion.button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && <NavSheet userEmail={userEmail} onClose={() => setOpen(false)} />}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

function NavSheet({ userEmail, onClose }: { userEmail?: string | null; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const closeThen = (fn: () => void) => {
    onClose();
    // let the exit animation start before the route change swaps the page
    window.setTimeout(fn, 120);
  };

  const lockNow = () =>
    closeThen(() => {
      lockVault();
      navigate({ to: "/lock" });
    });

  const signOut = () =>
    closeThen(async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
      lockVault();
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true });
    });

  return (
    <div className="fixed inset-0 z-[100]">
      {/* backdrop */}
      <motion.button
        aria-label="Close menu"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: "rgba(28,28,28,0.28)", backdropFilter: "blur(6px)" }}
      />

      {/* panel */}
      <motion.aside
        role="dialog"
        aria-label="Menu"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={spring}
        className="absolute right-0 top-0 flex h-full w-full max-w-[360px] flex-col overflow-hidden"
      >
        <Backdrop />
        <div
          className="relative z-10 flex h-full flex-col px-6 pt-[max(20px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]"
          style={{ borderLeft: `1px solid ${BORDER}` }}
        >
          <div className="flex items-center justify-between pb-6">
            <Eyebrow>Menu</Eyebrow>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              aria-label="Close menu"
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{
                background: CREAM_SOFT,
                border: `1px solid ${BORDER}`,
                color: CHARCOAL,
              }}
            >
              <X className="h-4 w-4" strokeWidth={1.8} />
            </motion.button>
          </div>

          <nav className="flex flex-col gap-2">
            {NAV_ITEMS.map((item, i) => {
              const active =
                item.to === "/vault"
                  ? pathname === "/vault"
                  : pathname === item.to || pathname.startsWith(item.to + "/");
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...soft, delay: 0.05 + i * 0.04 }}
                >
                  <Link
                    to={item.to}
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-[14px] px-3 py-3"
                    style={{
                      background: active ? CHARCOAL : CREAM_SOFT,
                      border: `1px solid ${active ? "transparent" : BORDER}`,
                      color: active ? CREAM_SOFT : CHARCOAL,
                      boxShadow: active ? INSET_SHADOW : "inset 0 1px 0 rgba(255,255,255,0.5)",
                    }}
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                      style={{
                        background: active ? "rgba(255,255,255,0.1)" : CREAM_SOFT,
                        border: `1px solid ${active ? "rgba(255,255,255,0.15)" : BORDER}`,
                        color: active ? CREAM_SOFT : CHARCOAL,
                      }}
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.8} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-[14.5px]" style={{ fontWeight: 500 }}>
                          {item.label}
                        </span>
                        {active && (
                          <span
                            className="rounded-full px-1.5 py-[1px] text-[9px] uppercase tracking-[0.14em]"
                            style={{
                              background: "rgba(255,255,255,0.15)",
                              color: CREAM_SOFT,
                              fontWeight: 500,
                            }}
                          >
                            Current
                          </span>
                        )}
                      </div>
                      <div
                        className="truncate text-[12px]"
                        style={{ color: active ? "rgba(252,251,248,0.7)" : MUTED }}
                      >
                        {item.description}
                      </div>
                    </div>
                    <ChevronRight
                      className="h-4 w-4 shrink-0"
                      style={{ color: active ? "rgba(252,251,248,0.6)" : "rgba(28,28,28,0.35)" }}
                      strokeWidth={1.8}
                    />
                  </Link>
                </motion.div>
              );
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-3 pt-6">
            {userEmail && (
              <div
                className="flex items-center gap-3 rounded-[12px] px-3 py-2.5"
                style={{ background: CREAM_SOFT, border: `1px solid ${BORDER}` }}
              >
                <IconChip size={32}>
                  <span className="text-[11px] font-semibold">
                    {(userEmail[0] ?? "?").toUpperCase()}
                  </span>
                </IconChip>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px]" style={{ color: CHARCOAL, fontWeight: 500 }}>
                    Signed in
                  </div>
                  <div className="truncate text-[11.5px]" style={{ color: MUTED }}>
                    {userEmail}
                  </div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <GhostButton onClick={lockNow} icon={<Lock className="h-3.5 w-3.5" strokeWidth={1.8} />}>
                Lock
              </GhostButton>
              <GhostButton onClick={signOut} icon={<LogOut className="h-3.5 w-3.5" strokeWidth={1.8} />}>
                Sign out
              </GhostButton>
            </div>
          </div>
        </div>
      </motion.aside>
    </div>
  );
}
