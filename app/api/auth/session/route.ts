import { NextResponse } from "next/server";
import { getIdentity } from "@/db/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ authenticated: false, error: "请先登录轻课台" }, { status: 401 });
  return NextResponse.json({
    authenticated: true,
    demo: identity.demo,
    user: { id: identity.id, email: identity.email, name: identity.name, role: identity.role },
  });
}
