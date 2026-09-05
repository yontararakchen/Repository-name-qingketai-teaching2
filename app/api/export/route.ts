import { NextResponse } from "next/server";
import { getIdentity, resolveClassId } from "@/db/auth";
import { ensureSchema, getDatabase, seedDemoData } from "@/db/database";

export const dynamic = "force-dynamic";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const db = getDatabase();
  if (!db) return new NextResponse("", { status: 503 });
  await ensureSchema(db); await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后导出数据" }, { status: 401 });
  if (identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以导出数据" }, { status: 403 });
  const classId = await resolveClassId(db, identity); if (!classId) return NextResponse.json({ error: "当前账号尚未加入任何班级" }, { status: 403 });
  const type = new URL(request.url).searchParams.get("type") ?? "submissions";
  if (type === "audit") {
    const rows = await db.prepare("SELECT al.action, al.object_type, al.object_id, al.detail, al.created_at, COALESCE(u.name, al.user_id, '系统') AS user_name FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id ORDER BY al.created_at DESC LIMIT 200").all<{ action: string; object_type: string; object_id: string | null; detail: string; created_at: string; user_name: string }>();
    const header = ["操作人", "操作", "对象类型", "对象编号", "说明", "时间"];
    const body = rows.results.map((row) => [row.user_name, row.action, row.object_type, row.object_id, row.detail, row.created_at].map(csvCell).join(","));
    return new NextResponse([header.map(csvCell).join(","), ...body].join("\r\n") + "\r\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=qingketai-audit.csv" } });
  }
  const rows = await db.prepare("SELECT a.name AS assignment_name, c.name AS chapter_name, st.name AS student_name, s.status, s.score, s.feedback, s.submitted_at, s.updated_at FROM submissions s JOIN assignments a ON a.id = s.assignment_id JOIN students st ON st.id = s.student_id LEFT JOIN chapters c ON c.id = a.chapter_id WHERE a.class_id = ? ORDER BY s.submitted_at DESC").bind(classId).all<{ assignment_name: string; chapter_name: string | null; student_name: string; status: string; score: string | null; feedback: string | null; submitted_at: string; updated_at: string }>();
  const header = ["作业", "章节", "学生", "状态", "分数", "教师评语", "提交时间", "更新时间"];
  const body = rows.results.map((row) => [row.assignment_name, row.chapter_name, row.student_name, row.status, row.score, row.feedback, row.submitted_at, row.updated_at].map(csvCell).join(","));
  return new NextResponse("\uFEFF" + [header.map(csvCell).join(","), ...body].join("\r\n") + "\r\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=qingketai-submissions.csv" } });
}
