import { NextResponse } from "next/server";
import { getIdentity, resolveClassId } from "@/db/auth";
import { ensureSchema, getDatabase, seedDemoData } from "@/db/database";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = getDatabase();
  if (!db) return NextResponse.json({ logs: [], source: "local-fallback" });
  await ensureSchema(db); await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后查看操作记录" }, { status: 401 });
  if (identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以查看操作记录" }, { status: 403 });
  if (!(await resolveClassId(db, identity))) return NextResponse.json({ error: "当前账号尚未加入任何班级" }, { status: 403 });
  const rows = await db.prepare("SELECT al.id, COALESCE(u.name, al.user_id, '系统') AS user_name, al.action, al.object_type, al.object_id, al.detail, al.created_at FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id ORDER BY al.created_at DESC LIMIT 30").all<{ id: string; user_name: string; action: string; object_type: string; object_id: string | null; detail: string; created_at: string }>();
  const actionLabels: Record<string, string> = { create: "创建", update: "更新", grade: "评分", submit: "提交", generate: "生成", publish: "发布", reject: "拒绝", link: "关联", relate: "建立关系", join: "加入", import: "导入" };
  const objectLabels: Record<string, string> = { assignment: "作业", personalized_assignment: "个性化作业", ai_draft: "AI 草稿", knowledge_point: "知识点", class: "班级", class_members: "班级成员", learning_task: "学习任务", activity: "课堂活动", submission: "提交记录" };
  return NextResponse.json({ logs: rows.results.map((row) => ({ id: row.id, userName: row.user_name, action: actionLabels[row.action] ?? row.action, objectType: objectLabels[row.object_type] ?? row.object_type, objectId: row.object_id, detail: row.detail, createdAt: row.created_at })), source: "d1" });
}
