import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Create account" };
export default function SignupPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Create your account</h1>
      <p className="mb-6 text-sm text-muted">Track any goal – running, studying, reading, habits – in one place.</p>
      <AuthForm mode="signup" />
    </>
  );
}
