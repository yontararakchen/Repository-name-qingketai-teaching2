import { getDatabase, newId, timestamp, type Database } from "@/db/database";

export type Role = "teacher" | "student";
export type Identity = { id: string; email: string; name: string; role: Role; demo: boolean };

/**
 * Sites forwards the signed-in workspace identity in request headers. Local
 * development and the backend test script intentionally use a demo identity.
 */
export async function getIdentity(request: Request): Promise<Identity | null> {
  const demoRole = request.headers.get("x-demo-role");
  if (demoRole === "teacher" || demoRole === "student") return { id: `demo-${demoRole}`, email: `${demoRole}@example.com`, name: demoRole === "teacher" ? "王老师" : "张三", role: demoRole, demo: true };
  const userId = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email")?.toLowerCase() ?? "";
  const fullName = request.headers.get("oai-authenticated-user-full-name");
  if (!userId && !email) return { id: "demo-teacher", email: "teacher@example.com", name: "王老师", role: "teacher", demo: true };
  const db = getDatabase();
  if (!db) return null;
  const existing = await db.prepare("SELECT id, email, name, role FROM users WHERE id = ? OR email = ? LIMIT 1").bind(userId ?? "", email).first<{ id: string; email: string; name: string; role: Role }>();
  if (existing) return { ...existing, demo: false };
  const role: Role = email.includes("student") ? "student" : "teacher";
  const name = fullName && request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8" ? decodeURIComponent(fullName) : (email.split("@")[0] || "用户");
  const id = userId ?? newId("user");
  await db.prepare("INSERT OR IGNORE INTO users (id, email, name, role, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, email || `${id}@workspace.local`, name, role, timestamp()).run();
  return { id, email: email || `${id}@workspace.local`, name, role, demo: false };
}

export async function writeAudit(db: Database, identity: Identity, action: string, objectType: string, objectId: string | null, detail = "") {
  await db.prepare("INSERT INTO audit_logs (id, user_id, action, object_type, object_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(newId("audit"), identity.id, action, objectType, objectId, detail, timestamp()).run();
}

export async function writeLearningEvent(db: Database, input: { classId: string; studentId?: string | null; sessionId?: string | null; eventType: string; objectType: string; objectId?: string | null; payload?: Record<string, unknown> }) {
  await db.prepare("INSERT INTO learning_events (id, class_id, student_id, session_id, event_type, object_type, object_id, payload, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(newId("event"), input.classId, input.studentId ?? null, input.sessionId ?? null, input.eventType, input.objectType, input.objectId ?? null, JSON.stringify(input.payload ?? {}), timestamp()).run();
}
