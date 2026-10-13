import type { Metadata } from "next";
import { AccountActions, NotificationsForm, ProfileForm } from "@/components/settings-forms";
import { requireCtx } from "@/lib/auth/session";
import { getNotificationPrefs } from "@/lib/services/profile";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { ctx, user } = await requireCtx();
  const prefs = await getNotificationPrefs(ctx);
  const zones = Intl.supportedValuesOf("timeZone");
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <ProfileForm name={user.name} email={user.email} timezone={user.timezone} zones={zones} />
      <NotificationsForm prefs={prefs} />
      <AccountActions />
    </div>
  );
}
