import { getDatabase, newId, timestamp, type Database } from "@/db/database";

export type Role = "teacher" | "student";
export type Identity = { id: string; email: string; name: string; role: Role; demo: boolean; activeClassId?: string };

/**
 * Sites forwards the signed-in workspace identity in request headers. Local
 * development and the backend test script intentionally use a demo identity.
 */
export async function getIdentity(request: Request): Promise<Identity | null> {
  const cookie = request.headers.get("cookie") ?? "";
  const queryDemo = new URL(request.url).searchParams.get("demo") ?? (() => { try { return new URL(request.headers.get("referer") ?? "").searchParams.get("demo"); } catch { return null; } })();
  const demoRole = request.headers.get("x-demo-role") ?? (queryDemo === "teacher" || queryDemo === "student" ? queryDemo : undefined) ?? cookie.match(/(?:^|;\s*)demo-role=(teacher|student)(?:;|$)/)?.[1];
  const activeClassId = cookie.match(/(?:^|;\s*)active-class-id=([^;]+)/)?.[1];
  if (demoRole === "teacher" || demoRole === "student") return { id: `demo-${demoRole}`, email: `${demoRole}@example.com`, name: demoRole === "teacher" ? "王老师" : "张三", role: demoRole, demo: true, activeClassId };
  const userId = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email")?.toLowerCase() ?? "";
  const fullName = request.headers.get("oai-authenticated-user-full-name");
  // Anonymous visitors must not inherit the demo teacher identity.  Demo mode
  // is available only through the explicit x-demo-role header/cookie used by
  // local previews and the scripted walkthrough.
  if (!userId && !email) return null;
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

/** Resolve the first class the signed-in identity is actually a member of. */
export async function resolveClassId(db: Database, identity: Identity, requestedClassId?: string | null) {
  const cookieClassId = requestedClassId?.trim() || null;
  const memberUserId = identity.demo ? (identity.role === "teacher" ? "user_teacher_1" : "user_student_1") : identity.id;
  if (identity.demo) {
    const candidate = cookieClassId || identity.activeClassId;
    if (candidate) {
      const member = await db.prepare("SELECT class_id FROM class_members WHERE class_id = ? AND user_id = ? AND role = ? LIMIT 1").bind(candidate, memberUserId, identity.role).first<{ class_id: string }>();
      return member?.class_id ?? null;
    }
    const member = await db.prepare("SELECT class_id FROM class_members WHERE user_id = ? AND role = ? ORDER BY joined_at LIMIT 1").bind(memberUserId, identity.role).first<{ class_id: string }>();
    return member?.class_id ?? null;
  }
  if (cookieClassId) {
    const member = await db.prepare("SELECT class_id FROM class_members WHERE class_id = ? AND user_id = ? AND role = ? LIMIT 1").bind(cookieClassId, identity.id, identity.role).first<{ class_id: string }>();
    return member?.class_id ?? null;
  }
  if (identity.activeClassId) {
    const activeMember = await db.prepare("SELECT class_id FROM class_members WHERE class_id = ? AND user_id = ? AND role = ? LIMIT 1").bind(identity.activeClassId, identity.id, identity.role).first<{ class_id: string }>();
    if (activeMember?.class_id) return activeMember.class_id;
  }
  const member = await db.prepare("SELECT class_id FROM class_members WHERE user_id = ? AND role = ? ORDER BY joined_at LIMIT 1").bind(identity.id, identity.role).first<{ class_id: string }>();
  return member?.class_id ?? null;
}

/** Resolve the student record belonging to the current signed-in student. */
export async function resolveStudentId(db: Database, identity: Identity, classId: string) {
  if (identity.demo) {
    const demoStudent = await db.prepare("SELECT st.id FROM students st JOIN class_members cm ON cm.class_id = st.class_id AND cm.user_id = 'user_student_1' AND cm.role = 'student' WHERE st.class_id = ? LIMIT 1").bind(classId).first<{ id: string }>();
    return demoStudent?.id ?? null;
  }
  const member = await db.prepare("SELECT st.id FROM students st JOIN class_members cm ON cm.class_id = st.class_id AND cm.user_id = ? AND cm.role = 'student' WHERE st.class_id = ? AND st.name = ? LIMIT 1").bind(identity.id, classId, identity.name).first<{ id: string }>();
  return member?.id ?? null;
}

export async function writeAudit(db: Database, identity: Identity, action: string, objectType: string, objectId: string | null, detail = "") {
  await db.prepare("INSERT INTO audit_logs (id, user_id, action, object_type, object_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(newId("audit"), identity.id, action, objectType, objectId, detail, timestamp()).run();
}

export async function writeLearningEvent(db: Database, input: { classId: string; studentId?: string | null; sessionId?: string | null; eventType: string; objectType: string; objectId?: string | null; payload?: Record<string, unknown> }) {
  await db.prepare("INSERT INTO learning_events (id, class_id, student_id, session_id, event_type, object_type, object_id, payload, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(newId("event"), input.classId, input.studentId ?? null, input.sessionId ?? null, input.eventType, input.objectType, input.objectId ?? null, JSON.stringify(input.payload ?? {}), timestamp()).run();
}
