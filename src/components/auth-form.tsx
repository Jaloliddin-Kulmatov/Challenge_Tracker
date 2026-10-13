"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { authClient } from "@/lib/auth/client";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    if (mode === "signup" && !name) return setError("Please enter your name.");
    if (!email) return setError("Please enter your email address.");
    if (mode === "signup" && password.length < 8) return setError("Use a password with at least 8 characters.");
    setPending(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const res =
        mode === "signup"
          ? await authClient.signUp.email({ name, email, password, timezone } as Parameters<typeof authClient.signUp.email>[0])
          : await authClient.signIn.email({ email, password });
      if (res.error) {
        const status = (res.error as { status?: number }).status ?? 0;
        setError(
          status >= 500
            ? `The server hit a problem (error ${status}), so nothing was saved. Please try again shortly.`
            : res.error.message || (mode === "login" ? "Email or password is incorrect." : "We couldn't create your account."),
        );
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {mode === "signup" && (
        <Field label="Your name" htmlFor="name">
          <Input id="name" name="name" autoComplete="name" required />
        </Field>
      )}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
        <Input id="password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 8 : undefined} />
      </Field>
      {error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p>}
      <Button type="submit" size="lg" className="w-full" loading={pending}>{mode === "signup" ? "Create account" : "Log in"}</Button>
      <p className="text-center text-sm text-muted">
        {mode === "signup" ? (<>Already have an account? <Link href="/login" className="font-semibold text-primary">Log in</Link></>) : (<>New here? <Link href="/signup" className="font-semibold text-primary">Create an account</Link></>)}
      </p>
    </form>
  );
}
