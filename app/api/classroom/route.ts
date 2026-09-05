import { NextResponse } from "next/server";
import { ensureSchema, getDatabase, seedDemoData } from "@/db/database";

export const dynamic = "force-dynamic";

type ChapterRow = { id: string; name: string; files_count: number; status: string; sort_order: number };
type MaterialRow = { id: string; chapter_id: string; name: string; file_type: string; size_label: string; download_url: string | null };
type AssignmentRow = { id: string; name: string; chapter_id: string | null; deadline: string; status: string; description: string; submitted_count: number; total_students: number };
type StudentRow = { id: string; name: string; initials: string };
type SubmissionRow = { id: string; assignment_id: string; student_id: string; content: string; status: string; score: string | null; feedback: string | null; submitted_at: string };

const demoData = {
  class: { id: "class_python", name: "Python 基础班", courseName: "Python 程序设计", term: "2026 春季学期", joinCode: "PY2026", teacherName: "王老师" },
  chapters: [
    { id: "chapter_1", name: "第 1 章 变量与数据类型", files: 3, status: "已发布" },
    { id: "chapter_2", name: "第 2 章 条件判断", files: 2, status: "已发布" },
    { id: "chapter_3", name: "第 3 章 循环结构", files: 3, status: "草稿" },
  ],
  materials: [],
  assignments: [
    { id: "assignment_1", name: "变量基础练习", chapter: "第 1 章", chapterId: "chapter_1", deadline: "09-12", status: "已结束", submitted: "36/36", description: "完成变量与数据类型练习。" },
    { id: "assignment_2", name: "条件判断练习", chapter: "第 2 章", chapterId: "chapter_2", deadline: "09-18", status: "进行中", submitted: "28/36", description: "完成条件判断基础练习。" },
    { id: "assignment_3", name: "循环结构练习", chapter: "第 3 章", chapterId: "chapter_3", deadline: "未设置", status: "草稿", submitted: "0/36", description: "请完成三个循环练习，并上传代码或截图。" },
  ],
  students: [{ id: "student_1", name: "张三", initials: "张" }, { id: "student_2", name: "李四", initials: "李" }, { id: "student_3", name: "王五", initials: "王" }, { id: "student_4", name: "赵六", initials: "赵" }, { id: "student_5", name: "陈可", initials: "陈" }],
  submissions: [],
};

const assignmentStatus: Record<string, string> = { draft: "草稿", active: "进行中", closed: "已结束" };

export async function GET() {
  const db = getDatabase();
  if (!db) return NextResponse.json({ ...demoData, source: "local-fallback" });

  try {
    await ensureSchema(db);
    await seedDemoData(db);
    const classRow = await db.prepare("SELECT id, name, course_name, term, join_code, teacher_name FROM classes ORDER BY created_at LIMIT 1").first<{ id: string; name: string; course_name: string; term: string; join_code: string; teacher_name: string }>();
    if (!classRow) return NextResponse.json({ ...demoData, source: "empty" });
    const [chapterRows, materialRows, assignmentRows, studentRows, submissionRows] = await Promise.all([
      db.prepare("SELECT id, name, files_count, status, sort_order FROM chapters WHERE class_id = ? ORDER BY sort_order").bind(classRow.id).all<ChapterRow>(),
      db.prepare("SELECT m.id, m.chapter_id, m.name, m.file_type, m.size_label, m.download_url FROM materials m JOIN chapters c ON c.id = m.chapter_id WHERE c.class_id = ? ORDER BY m.created_at").bind(classRow.id).all<MaterialRow>(),
      db.prepare("SELECT a.id, a.name, a.chapter_id, a.deadline, a.status, a.description, COUNT(s.id) AS submitted_count, (SELECT COUNT(*) FROM students st WHERE st.class_id = a.class_id) AS total_students FROM assignments a LEFT JOIN submissions s ON s.assignment_id = a.id WHERE a.class_id = ? GROUP BY a.id ORDER BY a.created_at DESC").bind(classRow.id).all<AssignmentRow>(),
      db.prepare("SELECT id, name, initials FROM students WHERE class_id = ? ORDER BY created_at").bind(classRow.id).all<StudentRow>(),
      db.prepare("SELECT s.id, s.assignment_id, s.student_id, s.content, s.status, s.score, s.feedback, s.submitted_at FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE a.class_id = ? ORDER BY s.submitted_at DESC").bind(classRow.id).all<SubmissionRow>(),
    ]);
    return NextResponse.json({
      class: { id: classRow.id, name: classRow.name, courseName: classRow.course_name, term: classRow.term, joinCode: classRow.join_code, teacherName: classRow.teacher_name },
      chapters: chapterRows.results.map((row) => ({ id: row.id, name: row.name, files: row.files_count, status: row.status === "published" ? "已发布" : "草稿" })),
      materials: materialRows.results.map((row) => ({ id: row.id, chapterId: row.chapter_id, name: row.name, type: row.file_type, size: row.size_label, downloadUrl: row.download_url })),
      assignments: assignmentRows.results.map((row) => ({ id: row.id, name: row.name, chapterId: row.chapter_id, chapter: row.chapter_id ? (chapterRows.results.find((chapter) => chapter.id === row.chapter_id)?.name ?? "未分类") : "未分类", deadline: row.deadline, status: assignmentStatus[row.status] ?? row.status, submitted: `${row.submitted_count}/${row.total_students}`, description: row.description })),
      students: studentRows.results,
      submissions: submissionRows.results,
      source: "d1",
    });
  } catch (error) {
    console.error("classroom_read_failed", error);
    return NextResponse.json({ ...demoData, source: "error-fallback" }, { status: 200 });
  }
}
