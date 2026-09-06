import { NextResponse } from "next/server";
import { getIdentity, resolveClassId, writeAudit } from "@/db/auth";
import { ensureSchema, getDatabase, newId, seedDemoData, timestamp } from "@/db/database";

export const dynamic = "force-dynamic";

type DraftQuestion = { id: string; prompt: string; options: string[]; answer: string; reason: string };
type DraftType = "insight" | "activity";

function buildActivityDraft(materialName: string, materialType: string, text: string): { summary: string; knowledgePoints: string[]; questions: DraftQuestion[] } {
  const source = `${materialName} ${text}`.toLowerCase();
  if (/(线性代数|矩阵|行列式|特征值|特征向量|向量|线性相关|线性无关|秩)/i.test(source)) return { summary: `已从“${materialName}”识别出线性代数主题，建议围绕矩阵运算、特征值和线性关系检查理解。`, knowledgePoints: ["矩阵与线性变换", "特征值", "线性相关性"], questions: [{ id: "linear-algebra-1", prompt: "设 A = [[1, 2], [2, 1]]，则矩阵 A 的特征值是？", options: ["-1 和 3", "1 和 2", "0 和 3", "-2 和 2"], answer: "-1 和 3", reason: "材料包含矩阵与特征值主题；A 的特征多项式为 (1-λ)^2-4。" }, { id: "linear-algebra-2", prompt: "下列哪组向量在线性代数中称为线性无关？", options: ["只有零向量的一组", "不存在不全为零的线性组合使结果为零", "所有向量都相等", "向量个数一定大于维数"], answer: "不存在不全为零的线性组合使结果为零", reason: "检查材料中线性无关的定义。" }] };
  if (/(循环|for|while|range)/i.test(source)) return { summary: `已从“${materialName}”识别出循环结构主题，建议围绕遍历、次数和循环变量检查理解。`, knowledgePoints: ["循环结构", "遍历与次数", "循环变量"], questions: [{ id: "loop-1", prompt: "下面哪一项最适合遍历一个列表中的每个元素？", options: ["for 循环", "if 判断", "import 导入", "return 返回"], answer: "for 循环", reason: "材料主题包含循环结构，优先检查循环用途。" }, { id: "loop-2", prompt: "range(3) 通常会产生几个数字？", options: ["2 个", "3 个", "4 个", "无限个"], answer: "3 个", reason: "检查材料中 range 的起止规则与循环次数。" }] };
  if (/(条件|if|elif|else|判断)/i.test(source)) return { summary: `已从“${materialName}”识别出条件判断主题，建议检查条件分支和布尔表达式。`, knowledgePoints: ["条件判断", "布尔表达式", "分支执行"], questions: [{ id: "condition-1", prompt: "当 if 条件为 False 且存在 else 时，程序会执行哪一段？", options: ["if 分支", "else 分支", "两段都执行", "程序一定报错"], answer: "else 分支", reason: "检查材料中条件为假时的分支路径。" }] };
  if (/(变量|类型|string|字符串|整数|float|bool)/i.test(source)) return { summary: `已从“${materialName}”识别出变量与数据类型主题，建议检查值、类型和转换。`, knowledgePoints: ["变量", "数据类型", "类型转换"], questions: [{ id: "type-1", prompt: "下面哪一个值的类型是字符串？", options: ["42", "3.14", "'hello'", "True"], answer: "'hello'", reason: "检查材料中字符串、数字和布尔值的区分。" }] };
  return { summary: `已读取“${materialName}”（${materialType}）的基本信息，生成一份待教师核验的通用理解题草稿。`, knowledgePoints: ["核心概念", "关键定义", "应用理解"], questions: [{ id: "general-1", prompt: `关于“${materialName}”的核心内容，下列哪项表述最准确？`, options: ["材料中明确说明的定义", "与材料无关的猜测", "完全相反的结论", "无法从材料判断"], answer: "材料中明确说明的定义", reason: "未检测到明确主题，先生成通用理解题，教师应结合原文修改。" }] };
}

async function getContext(db: NonNullable<ReturnType<typeof getDatabase>>, identity: NonNullable<Awaited<ReturnType<typeof getIdentity>>>) {
  const classId = await resolveClassId(db, identity); if (!classId) return null;
  const course = await db.prepare("SELECT course_id FROM course_classes WHERE class_id = ? LIMIT 1").bind(classId).first<{ course_id: string }>();
  return { classId, courseId: course?.course_id ?? "course_python" };
}

export async function GET(request: Request) {
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后查看 AI 草稿" }, { status: 401 });
  if (identity.role !== "teacher") return NextResponse.json({ error: "学生暂不能查看教师 AI 草稿" }, { status: 403 });
  const db = getDatabase(); if (!db) return NextResponse.json({ drafts: [], source: "local-fallback" });
  await ensureSchema(db); await seedDemoData(db); const ctx = await getContext(db, identity); if (!ctx) return NextResponse.json({ error: "当前账号尚未加入任何班级" }, { status: 403 });
  const rows = await db.prepare("SELECT id, chapter_id, draft_type, title, summary, payload, source_refs, status, created_at, updated_at, reviewed_at FROM ai_drafts WHERE class_id = ? ORDER BY updated_at DESC LIMIT 30").bind(ctx.classId).all<{ id: string; chapter_id: string | null; draft_type: DraftType; title: string; summary: string; payload: string; source_refs: string; status: string; created_at: string; updated_at: string; reviewed_at: string | null }>();
  return NextResponse.json({ drafts: rows.results.map((row) => ({ id: row.id, chapterId: row.chapter_id, type: row.draft_type, title: row.title, summary: row.summary, payload: JSON.parse(row.payload || "{}"), sourceRefs: JSON.parse(row.source_refs || "[]"), status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, reviewedAt: row.reviewed_at })), source: "d1" });
}

export async function POST(request: Request) {
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后生成 AI 草稿" }, { status: 401 });
  if (identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以生成 AI 草稿" }, { status: 403 });
  const db = getDatabase(); if (!db) return NextResponse.json({ error: "演示模式暂不支持保存 AI 草稿" }, { status: 503 });
  await ensureSchema(db); await seedDemoData(db); const ctx = await getContext(db, identity); if (!ctx) return NextResponse.json({ error: "当前账号尚未加入任何班级" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { draftType?: DraftType; chapterId?: string | null; materialName?: string; materialType?: string; text?: string };
  const draftType: DraftType = body.draftType === "insight" ? "insight" : "activity";
  let title = "材料活动草稿"; let summary = ""; let payload: Record<string, unknown> = {}; let sourceRefs: Array<Record<string, string>> = [];
  if (draftType === "activity") {
    const materialName = String(body.materialName ?? "未命名材料").trim().slice(0, 160) || "未命名材料"; const materialType = String(body.materialType ?? "FILE").trim().slice(0, 20) || "FILE"; const text = String(body.text ?? "").trim().slice(0, 12000);
    const draft = buildActivityDraft(materialName, materialType, text); title = `活动草稿 · ${materialName}`; summary = draft.summary; payload = { ...draft, sourceName: materialName, sourceType: materialType, engine: "demo-material-parser" }; sourceRefs = [{ type: "material", label: materialName }];
  } else {
    const chapter = body.chapterId ? await db.prepare("SELECT id, name FROM chapters WHERE id = ? AND class_id = ? LIMIT 1").bind(body.chapterId, ctx.classId).first<{ id: string; name: string }>() : await db.prepare("SELECT id, name FROM chapters WHERE class_id = ? ORDER BY sort_order LIMIT 1").bind(ctx.classId).first<{ id: string; name: string }>();
    const students = await db.prepare("SELECT COUNT(*) AS count FROM students WHERE class_id = ?").bind(ctx.classId).first<{ count: number }>(); const pointCount = chapter ? await db.prepare("SELECT COUNT(*) AS count FROM knowledge_points WHERE chapter_id = ? AND status = 'active'").bind(chapter.id).first<{ count: number }>() : { count: 0 };
    const scored = await db.prepare("SELECT AVG(CAST(s.score AS REAL)) AS average, COUNT(*) AS count FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE a.class_id = ? AND a.chapter_id = ? AND s.score IS NOT NULL AND s.score != ''").bind(ctx.classId, chapter?.id ?? "").first<{ average: number | null; count: number }>();
    const activity = await db.prepare("SELECT COUNT(DISTINCT a.id) AS activities, COUNT(ar.id) AS responses FROM activities a JOIN lesson_sessions ls ON ls.id = a.session_id LEFT JOIN activity_responses ar ON ar.activity_id = a.id WHERE ls.class_id = ? AND ls.chapter_id = ?").bind(ctx.classId, chapter?.id ?? "").first<{ activities: number; responses: number }>();
    const average = scored?.average === null || scored?.average === undefined ? null : Math.round(Number(scored.average) * 10) / 10; const chapterName = chapter?.name ?? "当前课程";
    title = `学情摘要 · ${chapterName}`; summary = average === null ? `${chapterName} 当前有 ${students?.count ?? 0} 名学生、${pointCount?.count ?? 0} 个知识点，暂时没有已评分作业，建议先通过课堂活动收集理解证据。` : `${chapterName} 当前有 ${students?.count ?? 0} 名学生、${pointCount?.count ?? 0} 个知识点，已评分作业平均 ${average} 分。建议优先关注低于班级平均的学生，并用一题课堂活动核对薄弱知识点。`; payload = { chapterName, studentCount: students?.count ?? 0, knowledgePointCount: pointCount?.count ?? 0, averageScore: average, scoredSubmissionCount: scored?.count ?? 0, activityCount: activity?.activities ?? 0, responseCount: activity?.responses ?? 0, suggestions: ["查看对应知识点的证据明细", "针对低分知识点发布一道课堂核查题", "课后安排一次短复习任务"] }; sourceRefs = [{ type: "chapter", id: chapter?.id ?? "", label: chapterName }, { type: "knowledge_points", id: chapter?.id ?? "", label: `${pointCount?.count ?? 0} 个知识点` }, { type: "submissions", id: chapter?.id ?? "", label: `${scored?.count ?? 0} 条已评分提交` }];
  }
  const id = newId("ai_draft"); const now = timestamp(); const createdBy = identity.demo ? "user_teacher_1" : identity.id; await db.prepare("INSERT INTO ai_drafts (id, class_id, chapter_id, created_by, draft_type, title, summary, payload, source_refs, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)").bind(id, ctx.classId, body.chapterId || null, createdBy, draftType, title, summary, JSON.stringify(payload), JSON.stringify(sourceRefs), now, now).run(); await writeAudit(db, identity, "generate", "ai_draft", id, title);
  return NextResponse.json({ draft: { id, chapterId: body.chapterId ?? null, type: draftType, title, summary, payload, sourceRefs, status: "draft", createdAt: now, updatedAt: now, ...(draftType === "activity" ? payload : {}) } }, { status: 201 });
}

export async function PATCH(request: Request) {
  const identity = await getIdentity(request); if (!identity) return NextResponse.json({ error: "需要登录后审核 AI 草稿" }, { status: 401 }); if (identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以审核 AI 草稿" }, { status: 403 });
  const db = getDatabase(); if (!db) return NextResponse.json({ error: "演示模式暂不支持审核 AI 草稿" }, { status: 503 }); await ensureSchema(db); await seedDemoData(db); if (!(await resolveClassId(db, identity))) return NextResponse.json({ error: "当前账号尚未加入任何班级" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { draftId?: string; status?: string; summary?: string; payload?: Record<string, unknown> }; const status = body.status; if (!body.draftId || !["draft", "confirmed", "rejected"].includes(status ?? "")) return NextResponse.json({ error: "审核状态不正确" }, { status: 400 });
  const now = timestamp(); const reviewedAt = status === "draft" ? null : now; const reviewedBy = status === "draft" ? null : (identity.demo ? "user_teacher_1" : identity.id); await db.prepare("UPDATE ai_drafts SET status = ?, summary = COALESCE(?, summary), payload = COALESCE(?, payload), updated_at = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?").bind(status, body.summary?.trim() || null, body.payload ? JSON.stringify(body.payload) : null, now, reviewedAt, reviewedBy, body.draftId).run(); await writeAudit(db, identity, status === "confirmed" ? "confirm" : status === "rejected" ? "reject" : "edit", "ai_draft", body.draftId, status);
  return NextResponse.json({ updated: true, status, updatedAt: now }, { status: 200 });
}

export async function DELETE(request: Request) {
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后删除 AI 草稿" }, { status: 401 });
  if (identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以删除 AI 草稿" }, { status: 403 });
  const db = getDatabase(); if (!db) return NextResponse.json({ deleted: 0, source: "local-fallback" });
  await ensureSchema(db); await seedDemoData(db);
  const classId = await resolveClassId(db, identity); if (!classId) return NextResponse.json({ error: "当前账号尚未加入任何班级" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { draftId?: string; draftIds?: string[] };
  const draftIds = [...new Set([...(body.draftIds ?? []), ...(body.draftId ? [body.draftId] : [])].map((id) => String(id).trim()).filter(Boolean))];
  if (!draftIds.length) return NextResponse.json({ error: "请选择要删除的草稿" }, { status: 400 });
  const rows = await db.prepare("SELECT id, title FROM ai_drafts WHERE class_id = ? AND id IN (" + draftIds.map(() => "?").join(",") + ")").bind(classId, ...draftIds).all<{ id: string; title: string }>();
  if (!rows.results.length) return NextResponse.json({ error: "草稿不存在或无权删除" }, { status: 404 });
  await db.prepare("DELETE FROM ai_drafts WHERE class_id = ? AND id IN (" + draftIds.map(() => "?").join(",") + ")").bind(classId, ...draftIds).run();
  for (const row of rows.results) await writeAudit(db, identity, "delete", "ai_draft", row.id, row.title);
  return NextResponse.json({ deleted: rows.results.length, draftIds: rows.results.map((row) => row.id), source: "d1" });
}
