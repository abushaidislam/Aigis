import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Mail, ShieldCheck } from "lucide-react";
import {
  AegisScreen,
  BrandBar,
  Display,
  Eyebrow,
  Field,
  GhostButton,
  GoogleIcon,
  HeroIcon,
  Lede,
  MUTED,
  Notice,
  PrimaryButton,
  TextLink,
  BORDER,
  CHARCOAL,
  inputClass,
  inputStyle,
  soft,
} from "@/components/aegis/chrome";
import { PasswordField, StrengthMeter, scoreStrength } from "@/components/aegis/password-field";

const LAST_EMAIL_KEY = "aegis.auth.lastEmail";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center p-6 text-sm">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Not found</div>,
});

type Mode = "signin" | "signup" | "reset";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    try {
      const last = window.localStorage.getItem(LAST_EMAIL_KEY);
      if (last) setEmail(last);
    } catch {
      /* ignore */
    }
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/", replace: true });
    });
  }, [navigate]);


  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/auth/callback" },
        });
        if (error) throw error;
        setNotice({ kind: "info", text: "Account created. You can sign in now." });
        setMode("signin");
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/", replace: true });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/auth/reset-password",
        });
        if (error) throw error;
        setNotice({ kind: "info", text: "Check your inbox for a reset link." });
      }
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setNotice(null);
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/auth/callback",
      });
      if (result.error) throw new Error(result.error.message ?? "Google sign-in failed");
      if (result.redirected) return;
      navigate({ to: "/", replace: true });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Google sign-in failed." });
      setLoading(false);
    }
  };

  const eyebrow = mode === "signup" ? "Create account" : mode === "reset" ? "Reset access" : "Sign in";
  const title =
    mode === "signup" ? "Create your Aegis." : mode === "reset" ? "Reset your password." : "Welcome back.";
  const subtitle =
    mode === "signup"
      ? "One account, every one-time code — quietly protected."
      : mode === "reset"
        ? "We'll email you a secure link to set a new password."
        : "Sign in to unlock your vault.";

  return (
    <AegisScreen>
      <BrandBar />
      <div className="flex flex-1 flex-col justify-center gap-6 pt-2">
        <div className="flex flex-col items-start gap-4">
          <HeroIcon Icon={ShieldCheck} />
          <div className="flex flex-col gap-2.5">
            <Eyebrow>{eyebrow}</Eyebrow>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={mode + "-title"}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={soft}
                className="flex flex-col gap-2"
              >
                <Display>{title}</Display>
                <Lede>{subtitle}</Lede>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <form onSubmit={handleEmail} className="flex flex-col gap-2.5">
          <Field icon={<Mail className="h-4 w-4" strokeWidth={1.6} />} delay={0.05}>
            <input
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              style={inputStyle}
            />
          </Field>

          <AnimatePresence initial={false}>
            {mode !== "reset" && (
              <motion.div
                key="pw"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={soft}
                className="overflow-hidden"
              >
                <Field icon={<Lock className="h-4 w-4" strokeWidth={1.6} />} delay={0.1}>
                  <input
                    type="password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required
                    minLength={8}
                    placeholder={mode === "signup" ? "Create a strong password" : "Your password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    style={inputStyle}
                  />
                </Field>
              </motion.div>
            )}
          </AnimatePresence>

          {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

          <div className="pt-1">
            <PrimaryButton type="submit" loading={loading}>
              {mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}
            </PrimaryButton>
          </div>
        </form>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1" style={{ background: BORDER }} />
          <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: MUTED }}>or</span>
          <div className="h-px flex-1" style={{ background: BORDER }} />
        </div>

        <GhostButton onClick={handleGoogle} disabled={loading} icon={<GoogleIcon />}>
          Continue with Google
        </GhostButton>

        <div className="flex flex-col items-center gap-1.5 pt-1 text-[13px]" style={{ color: MUTED }}>
          {mode === "signin" && (
            <>
              <TextLink onClick={() => setMode("reset")}>Forgot your password?</TextLink>
              <div>
                New to Aegis?{" "}
                <button onClick={() => setMode("signup")} className="underline underline-offset-[3px]" style={{ color: CHARCOAL }}>
                  Create an account
                </button>
              </div>
            </>
          )}
          {mode === "signup" && (
            <div>
              Already have an account?{" "}
              <button onClick={() => setMode("signin")} className="underline underline-offset-[3px]" style={{ color: CHARCOAL }}>
                Sign in
              </button>
            </div>
          )}
          {mode === "reset" && <TextLink onClick={() => setMode("signin")}>Back to sign in</TextLink>}
        </div>
      </div>
    </AegisScreen>
  );
}
