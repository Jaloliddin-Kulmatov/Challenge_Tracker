import { getSessionUser, ctxFor } from "@/lib/auth/session";
import { exportUserData } from "@/lib/services/profile";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  const data = await exportUserData(ctxFor(user));
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="challenge-tracker-export.json"', "Cache-Control": "no-store" },
  });
}
