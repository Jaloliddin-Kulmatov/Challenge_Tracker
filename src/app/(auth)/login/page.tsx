import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Log in" };
export default function LoginPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Welcome back</h1>
      <p className="mb-6 text-sm text-muted">Log in to pick up where you left off.</p>
      <AuthForm mode="login" />
    </>
  );
}
