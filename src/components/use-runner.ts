"use client";
import { useRouter } from "next/navigation";
import * as React from "react";
import type { ActionResult } from "@/app/actions/util";
import { useToast } from "@/components/ui/toast";

/**
 * Runs a server action and reports the outcome honestly: success toasts appear only after the
 * backend returned `{ ok: true }`; any failure (validation, auth, network) surfaces as an error.
 */
export function useRunner() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);

  const exec = React.useCallback(
    async <T,>(fn: () => Promise<ActionResult<T>>, opts: { success?: string | ((d: T) => string); onOk?: (d: T) => void; silentError?: boolean } = {}) => {
      setPending(true);
      try {
        const res = await fn();
        if (!res.ok) {
          if (res.unauthenticated) router.push("/login");
          if (!opts.silentError) toast.error(res.error);
          return res;
        }
        if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(res.data) : opts.success);
        opts.onOk?.(res.data);
        router.refresh();
        return res;
      } catch {
        const failed: ActionResult<T> = { ok: false, error: "We couldn't reach the server. Nothing was saved – please try again." };
        if (!opts.silentError) toast.error(failed.error);
        return failed;
      } finally {
        setPending(false);
      }
    },
    [router, toast],
  );

  return { exec, pending };
}
