"use client";

import { useEffect, useState } from "react";

type Role = "teacher" | "student";
type Page = "overview" | "content" | "assignments" | "submissions" | "record";
type Chapter = { id: string; name: string; files: number; status: string };
type Assignment = { id: string; name: string; chapter: string; chapterId: string | null; deadline: string; status: string; submitted: string; description: string };
type Student = { id: string; name: string; initials: string };
type Submission = { id: string; assignment_id: string; student_id: string; content: string; status: string; score: string | null; feedback: string | null; submitted_at: string };
type ClassroomData = { class: { id: string; name: string; courseName: string; term: string; joinCode: string; teacherName: string }; chapters: Chapter[]; materials: { id: string; chapterId: string; name: string; type: string; size: string; downloadUrl: string | null }[]; assignments: Assignment[]; students: Student[]; submissions: Submission[] };

const chapters = [
  { name: "第 1 章 变量与数据类型", files: 3, status: "已发布" },
  { name: "第 2 章 条件判断", files: 2, status: "已发布" },
  { name: "第 3 章 循环结构", files: 3, status: "草稿" },
];

const assignments = [
  { name: "变量基础练习", chapter: "第 1 章", deadline: "09-12", status: "已结束", submitted: "36/36" },
  { name: "条件判断练习", chapter: "第 2 章", deadline: "09-18", status: "进行中", submitted: "28/36" },
  { name: "循环结构练习", chapter: "第 3 章", deadline: "未设置", status: "草稿", submitted: "-" },
];

const students = [
  { name: "张三", initials: "张", state: "待批改", score: "-", submitted: "09-10 20:31" },
  { name: "李四", initials: "李", state: "已批改", score: "88", submitted: "09-10 21:05" },
  { name: "王五", initials: "王", state: "未提交", score: "-", submitted: "-" },
  { name: "赵六", initials: "赵", state: "已批改", score: "92", submitted: "09-11 08:42" },
];

const fallbackData: ClassroomData = {
  class: { id: "class_python", name: "Python 基础班", courseName: "Python 程序设计", term: "2026 春季学期", joinCode: "PY2026", teacherName: "王老师" },
  chapters: chapters.map((chapter, index) => ({ id: `chapter_${index + 1}`, name: chapter.name, files: chapter.files, status: chapter.status })),
  materials: [{ id: "material_1", chapterId: "chapter_3", name: "循环结构讲义.pdf", type: "PDF", size: "2.4 MB", downloadUrl: null }, { id: "material_2", chapterId: "chapter_3", name: "循环案例.pptx", type: "PPT", size: "6.8 MB", downloadUrl: null }, { id: "material_3", chapterId: "chapter_3", name: "课堂练习说明.docx", type: "DOC", size: "1.2 MB", downloadUrl: null }],
  assignments: assignments.map((assignment, index) => ({ id: `assignment_${index + 1}`, ...assignment, chapterId: `chapter_${index + 1}`, description: "请完成本章节练习。" })),
  students: students.map((student, index) => ({ id: `student_${index + 1}`, name: student.name, initials: student.initials })),
  submissions: [],
};

const teacherNav: { id: Page; label: string; icon: string }[] = [
  { id: "overview", label: "班级首页", icon: "⌂" },
  { id: "content", label: "课程内容", icon: "▤" },
  { id: "assignments", label: "作业管理", icon: "✓" },
  { id: "submissions", label: "学生提交", icon: "◌" },
];

const studentNav: { id: Page; label: string; icon: string }[] = [
  { id: "overview", label: "班级首页", icon: "⌂" },
  { id: "content", label: "课程内容", icon: "▤" },
  { id: "assignments", label: "我的作业", icon: "✓" },
  { id: "record", label: "学习记录", icon: "◷" },
];

function Badge({ children, tone = "blue" }: { children: React.ReactNode; tone?: "blue" | "green" | "amber" | "gray" }) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="metric-card"><p className="eyebrow">{label}</p><p className="metric-value">{value}</p><p className="metric-detail">{detail}</p></div>;
}

function SectionTitle({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <div className="section-title-row"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}

export default function Home() {
  const [role, setRole] = useState<Role>("teacher");
  const [page, setPage] = useState<Page>("overview");
  const [showCreate, setShowCreate] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [data, setData] = useState<ClassroomData>(fallbackData);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const nav = role === "teacher" ? teacherNav : studentNav;

  async function refreshData() {
    const response = await fetch("/api/classroom", { cache: "no-store" });
    if (!response.ok) throw new Error("classroom_fetch_failed");
    setData(await response.json() as ClassroomData);
  }

  useEffect(() => {
    refreshData().catch(() => setNotice("当前使用本地演示数据，后端连接稍后重试。")).finally(() => setLoading(false));
  }, []);

  async function handleCreateAssignment(payload: { name: string; chapterId: string; description: string; deadline: string }) {
    const response = await fetch("/api/assignments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error("assignment_create_failed");
    await refreshData();
    setShowCreate(false);
    setNotice("作业已保存到后端数据库。");
  }

  async function handleSubmit() {
    const assignment = data.assignments.find((item) => item.name.includes("循环")) ?? data.assignments[0];
    const student = data.students[0];
    if (!assignment || !student) return;
    const response = await fetch("/api/submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignmentId: assignment.id, studentId: student.id, content: "我已经完成了三个循环练习。" }) });
    if (!response.ok) throw new Error("submission_create_failed");
    await refreshData();
    setSubmitted(true);
    setNotice("作业提交已保存。");
  }

  function switchRole(nextRole: Role) {
    setRole(nextRole);
    setPage("overview");
    setShowCreate(false);
  }

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-lockup"><div className="brand-mark">教</div><div><p className="brand-name">轻课台</p><p className="brand-subtitle">轻量智能教学系统</p></div></div>
      <div className="topbar-center"><label className="class-switcher-label" htmlFor="class-switcher">当前班级</label><select id="class-switcher" className="class-switcher" defaultValue="python"><option value="python">Python 基础班</option><option value="math">高等数学 1 班</option></select></div>
      <div className="topbar-actions"><div className="role-toggle" aria-label="预览角色"><button type="button" className={role === "teacher" ? "role-active" : ""} onClick={() => switchRole("teacher")}>教师端</button><button type="button" className={role === "student" ? "role-active" : ""} onClick={() => switchRole("student")}>学生端</button></div><div className="user-chip"><span className="avatar">{role === "teacher" ? "王" : "张"}</span><span className="user-name">{role === "teacher" ? "王老师" : "张三"}</span><span className="chevron">⌄</span></div></div>
    </header>
    <div className="app-body">
      <aside className="sidebar"><div className="sidebar-heading">{role === "teacher" ? "教师工作台" : "我的学习"}</div><nav className="sidebar-nav" aria-label="主导航">{nav.map((item) => <button key={item.id} type="button" className={`nav-item ${page === item.id ? "nav-active" : ""}`} onClick={() => setPage(item.id)}><span className="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span></button>)}</nav><div className="sidebar-footer"><button type="button" className="nav-item"><span className="nav-icon">⚙</span><span>班级设置</span></button><div className="sidebar-note"><span className="note-dot" />数据随时保存</div></div></aside>
      <main className="main-content">{loading && <div className="sync-line"><span className="sync-dot" />正在同步班级数据…</div>}{role === "teacher" ? <TeacherView page={page} onCreate={() => setShowCreate(true)} data={data} /> : <StudentView page={page} data={data} submitted={submitted} onSubmit={() => { void handleSubmit().catch(() => setNotice("提交失败，请稍后重试。")); }} />}</main>
    </div>
    {notice && <button type="button" className="toast" onClick={() => setNotice("")} aria-label="关闭提示">{notice}<span>×</span></button>}
    {showCreate && <CreateAssignmentModal onClose={() => setShowCreate(false)} onSubmit={(payload) => { void handleCreateAssignment(payload).catch(() => setNotice("保存失败，请稍后重试。")); }} />}
  </div>;
}

function TeacherView({ page, onCreate, data }: { page: Page; onCreate: () => void; data: ClassroomData }) {
  if (page === "content") return <TeacherContent onCreate={onCreate} data={data} />;
  if (page === "assignments") return <TeacherAssignments onCreate={onCreate} data={data} />;
  if (page === "submissions") return <TeacherSubmissions data={data} />;
  return <TeacherOverview onCreate={onCreate} data={data} />;
}

function TeacherOverview({ onCreate, data }: { onCreate: () => void; data: ClassroomData }) {
  const pending = data.submissions.filter((item) => item.status !== "graded").length;
  return <div className="page-stack"><div className="page-heading-row"><div><p className="breadcrumb">我的班级 / {data.class.name}</p><h1>班级首页</h1><p className="page-description">今天也从一件小事开始，把课程内容和学生进度整理好。</p></div><button type="button" className="primary-button" onClick={onCreate}>＋ 发布新作业</button></div>
    <section className="class-hero"><div><div className="hero-label">{data.class.term} · 课程班级</div><h2>{data.class.name}</h2><p>{data.class.teacherName} · {data.students.length} 名学生 · 班级码 <strong>{data.class.joinCode}</strong></p></div><button type="button" className="secondary-button">复制班级码</button></section>
    <div className="metric-grid"><Metric label="章节" value={String(data.chapters.length)} detail={`${data.chapters.filter((item) => item.status === "已发布").length} 个已发布`} /><Metric label="学生" value={String(data.students.length)} detail="本学期成员" /><Metric label="待批改作业" value={String(pending || 12)} detail="需要你的反馈" /><Metric label="本周提交率" value="78%" detail="较上周 +6%" /></div>
    <section className="content-section"><SectionTitle title="最近课程内容" description="从章节开始，继续准备你的下一次教学。" action={<button type="button" className="text-button">查看全部 →</button>} /><div className="chapter-list">{data.chapters.map((chapter, index) => <div className="chapter-row" key={chapter.id}><div className="chapter-number">0{index + 1}</div><div className="chapter-main"><h3>{chapter.name}</h3><p>{chapter.files} 个教学资料</p></div><Badge tone={chapter.status === "草稿" ? "amber" : "green"}>{chapter.status}</Badge><button type="button" className="row-action">进入章节 <span>→</span></button></div>)}</div></section>
    <section className="split-section"><div className="content-section compact-section"><SectionTitle title="待处理作业" description="最近需要你查看的提交。" action={<button type="button" className="text-button">全部作业 →</button>} /><div className="mini-list"><div className="mini-row"><span className="mini-avatar">张</span><div><strong>张三</strong><p>循环结构练习</p></div><Badge>待批改</Badge></div><div className="mini-row"><span className="mini-avatar">陈</span><div><strong>陈可</strong><p>条件判断练习</p></div><Badge>待批改</Badge></div><div className="mini-row"><span className="mini-avatar">赵</span><div><strong>赵六</strong><p>变量基础练习</p></div><Badge tone="green">已完成</Badge></div></div></div><div className="content-section compact-section next-step-card"><div className="next-step-mark">↗</div><p className="eyebrow">下一步建议</p><h3>为第 3 章准备一份作业</h3><p>你已经上传了 3 份资料，可以直接发布一份章节练习。</p><button type="button" className="secondary-button" onClick={onCreate}>开始创建</button></div></section>
  </div>;
}

function TeacherContent({ onCreate, data }: { onCreate: () => void; data: ClassroomData }) {
  const currentChapter = data.chapters[data.chapters.length - 1];
  const materials = data.materials.filter((item) => item.chapterId === currentChapter?.id);
  return <div className="page-stack"><div className="page-heading-row"><div><p className="breadcrumb">课程内容 / {data.class.name}</p><h1>章节和资料</h1><p className="page-description">按章节整理课件，学生会在这里看到已发布的资料。</p></div><button type="button" className="primary-button">＋ 创建章节</button></div><section className="content-section"><SectionTitle title="章节目录" description={`${data.chapters.length} 个章节 · ${data.materials.length} 个资料`} action={<button type="button" className="secondary-button">上传资料</button>} /><div className="chapter-list">{data.chapters.map((chapter, index) => <div className="chapter-row" key={chapter.id}><div className="chapter-number">0{index + 1}</div><div className="chapter-main"><h3>{chapter.name}</h3><p>{chapter.files} 个教学资料 · 最近更新昨天</p></div><Badge tone={chapter.status === "草稿" ? "amber" : "green"}>{chapter.status}</Badge><button type="button" className="row-action">管理资料 <span>→</span></button></div>)}</div></section><section className="content-section material-preview"><SectionTitle title={currentChapter?.name ?? "当前章节"} description="当前章节资料预览" action={<button type="button" className="text-button">编辑章节</button>} /><div className="material-list">{materials.map((material) => <MaterialRow key={material.id} name={material.name} type={material.type} size={material.size} />)}</div><div className="upload-hint"><span>＋</span><div><strong>把资料拖到这里</strong><p>支持 PDF、PPT、图片和文档</p></div><button type="button" className="secondary-button">选择文件</button></div></section><div className="inline-note"><span className="info-mark">i</span>第一版只保存文件和基本信息，资料解析与知识点识别将在后续加入。</div><button type="button" className="text-button hidden-create" onClick={onCreate}>发布章节作业 →</button></div>;
}

function MaterialRow({ name, type, size }: { name: string; type: string; size: string }) {
  return <div className="material-row"><span className="file-icon">{type}</span><div className="material-name"><strong>{name}</strong><p>{size} · 昨天更新</p></div><button type="button" className="text-button">下载</button><button type="button" className="row-menu" aria-label={`更多操作：${name}`}>•••</button></div>;
}

function TeacherAssignments({ onCreate, data }: { onCreate: () => void; data: ClassroomData }) {
  return <div className="page-stack"><div className="page-heading-row"><div><p className="breadcrumb">我的班级 / 作业</p><h1>作业管理</h1><p className="page-description">创建作业、设置截止时间，并查看学生完成情况。</p></div><button type="button" className="primary-button" onClick={onCreate}>＋ 发布新作业</button></div><section className="content-section"><div className="table-toolbar"><div className="filter-tabs"><button type="button" className="filter-active">全部 <span>{data.assignments.length}</span></button><button type="button">进行中 <span>{data.assignments.filter((item) => item.status === "进行中").length}</span></button><button type="button">草稿 <span>{data.assignments.filter((item) => item.status === "草稿").length}</span></button></div><button type="button" className="secondary-button">筛选 ▾</button></div><div className="assignment-table"><div className="table-head"><span>作业名称</span><span>所属章节</span><span>截止时间</span><span>提交情况</span><span>状态</span><span /></div>{data.assignments.map((assignment) => <div className="table-row" key={assignment.id}><div className="table-title"><strong>{assignment.name}</strong><p>普通作业 · 可重复提交</p></div><span>{assignment.chapter}</span><span>{assignment.deadline}</span><span>{assignment.submitted}</span><Badge tone={assignment.status === "进行中" ? "blue" : assignment.status === "草稿" ? "amber" : "gray"}>{assignment.status}</Badge><button type="button" className="row-menu" aria-label={`打开 ${assignment.name}`}>•••</button></div>)}</div></section></div>;
}

function TeacherSubmissions({ data }: { data: ClassroomData }) {
  const assignment = data.assignments.find((item) => item.name.includes("循环")) ?? data.assignments[0];
  const rows = data.students.map((student) => {
    const submission = data.submissions.find((item) => item.assignment_id === assignment?.id && item.student_id === student.id);
    return { student, submission };
  });
  const submittedCount = rows.filter((row) => row.submission).length;
  return <div className="page-stack"><div className="page-heading-row"><div><p className="breadcrumb">学生提交 / {assignment?.name ?? "作业"}</p><h1>学生提交</h1><p className="page-description">已提交 {submittedCount} 人 · 未提交 {Math.max(data.students.length - submittedCount, 0)} 人 · 点击学生查看内容并评分。</p></div><button type="button" className="secondary-button">导出列表</button></div><section className="content-section"><div className="submission-summary"><div><span className="summary-dot blue-dot" />已提交 <strong>{submittedCount}</strong></div><div><span className="summary-dot amber-dot" />待批改 <strong>{rows.filter((row) => row.submission?.status !== "graded" && row.submission).length}</strong></div><div><span className="summary-dot gray-dot" />未提交 <strong>{Math.max(data.students.length - submittedCount, 0)}</strong></div></div><div className="submission-table"><div className="table-head"><span>学生</span><span>提交时间</span><span>状态</span><span>分数</span><span /></div>{rows.map(({ student, submission }) => <div className="table-row" key={student.id}><div className="student-cell"><span className="mini-avatar">{student.initials}</span><strong>{student.name}</strong></div><span>{submission?.submitted_at ? new Date(submission.submitted_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}</span><Badge tone={submission?.status === "graded" ? "green" : submission ? "amber" : "gray"}>{submission?.status === "graded" ? "已批改" : submission ? "待批改" : "未提交"}</Badge><span className="score-text">{submission?.score ?? "-"}</span><button type="button" className="row-action">查看 <span>→</span></button></div>)}</div></section></div>;
}

function StudentView({ page, data, submitted, onSubmit }: { page: Page; data: ClassroomData; submitted: boolean; onSubmit: () => void }) {
  if (page === "content") return <StudentContent data={data} />;
  if (page === "assignments") return <StudentAssignments data={data} submitted={submitted} onSubmit={onSubmit} />;
  if (page === "record") return <StudentRecord data={data} />;
  return <StudentOverview data={data} submitted={submitted} onSubmit={onSubmit} />;
}

function StudentOverview({ data, submitted, onSubmit }: { data: ClassroomData; submitted: boolean; onSubmit: () => void }) {
  const currentChapter = data.chapters[data.chapters.length - 1];
  return <div className="page-stack"><div className="page-heading-row"><div><p className="breadcrumb">我的班级 / {data.class.name}</p><h1>你好，张三</h1><p className="page-description">继续完成你的学习任务，保持每周的小进步。</p></div><button type="button" className="primary-button" onClick={onSubmit}>{submitted ? "已提交作业" : "去完成作业"}</button></div><section className="class-hero student-hero"><div><div className="hero-label">当前课程</div><h2>{data.class.name}</h2><p>{data.class.teacherName} · {data.class.term} · {data.students.length} 名学生</p></div><span className="student-progress">本周完成 <strong>2/3</strong></span></section><div className="student-grid"><section className="content-section"><SectionTitle title="最近学习内容" description="从上次学习的地方继续。" /><div className="learning-card"><div className="learning-icon">03</div><div><span className="eyebrow">正在学习</span><h3>{currentChapter?.name ?? "课程内容"}</h3><p>{currentChapter?.files ?? 0} 个资料 · 1 个待完成作业</p></div><button type="button" className="secondary-button">查看章节</button></div></section><section className="content-section"><SectionTitle title="我的作业" description="按时完成作业，及时查看反馈。" /><div className="mini-list"><div className="mini-row"><span className="file-icon">作</span><div><strong>条件判断练习</strong><p>截止 09-18</p></div><Badge tone="green">已评分 88</Badge></div><div className="mini-row"><span className="file-icon">作</span><div><strong>循环结构练习</strong><p>截止时间未设置</p></div><Badge tone={submitted ? "green" : "amber"}>{submitted ? "已提交" : "待完成"}</Badge></div></div></section></div><div className="inline-note"><span className="info-mark">i</span>提交后仍可再次上传，系统会保留你的提交记录，教师会以最后一次提交为准。</div></div>;
}

function StudentContent({ data }: { data: ClassroomData }) {
  return <div className="page-stack"><div className="page-heading-row"><div><p className="breadcrumb">课程内容 / {data.class.name}</p><h1>课程内容</h1><p className="page-description">按章节查看老师发布的学习资料。</p></div></div><section className="content-section"><SectionTitle title="章节目录" description={`${data.chapters.length} 个章节 · ${data.materials.length} 个资料`} /><div className="chapter-list">{data.chapters.map((chapter, index) => <div className="chapter-row" key={chapter.id}><div className="chapter-number">0{index + 1}</div><div className="chapter-main"><h3>{chapter.name}</h3><p>{chapter.files} 个教学资料 · {index === data.chapters.length - 1 ? "包含待完成作业" : "已完成"}</p></div><Badge tone={index === data.chapters.length - 1 ? "blue" : "green"}>{index === data.chapters.length - 1 ? "学习中" : "已完成"}</Badge><button type="button" className="row-action">查看章节 <span>→</span></button></div>)}</div></section></div>;
}

function StudentAssignments({ data, submitted, onSubmit }: { data: ClassroomData; submitted: boolean; onSubmit: () => void }) {
  const assignment = data.assignments.find((item) => item.name.includes("循环")) ?? data.assignments[0];
  return <div className="page-stack"><div className="page-heading-row"><div><p className="breadcrumb">我的作业 / {assignment?.chapter ?? "课程"}</p><h1>作业详情</h1><p className="page-description">{assignment?.name ?? "作业"} · 截止时间 {assignment?.deadline ?? "未设置"}</p></div><Badge tone={submitted ? "green" : "amber"}>{submitted ? "已提交" : "待完成"}</Badge></div><section className="assignment-detail"><div className="detail-heading"><div><span className="eyebrow">{assignment?.chapter ?? "当前章节"}</span><h2>{assignment?.name ?? "作业"}</h2></div><span className="deadline-label">可重复提交</span></div><div className="detail-description"><p>{assignment?.description ?? "请完成本章节练习。"} 提交后可以继续修改并重新上传。</p></div><label className="form-label" htmlFor="answer">我的回答</label><textarea id="answer" className="answer-box" placeholder="输入文字回答，或粘贴你的代码……" defaultValue={submitted ? "我已经完成了三个循环练习。" : ""} /><div className="upload-row"><div className="upload-box"><span className="upload-plus">＋</span><div><strong>添加附件</strong><p>支持代码、图片和文档</p></div></div><span className="upload-example">示例：循环练习.py</span></div><div className="form-actions"><button type="button" className="secondary-button">保存草稿</button><button type="button" className="primary-button" onClick={onSubmit}>{submitted ? "再次提交" : "提交作业"}</button></div></section><div className="inline-note"><span className="info-mark">i</span>教师评分后，你可以在“学习记录”里查看分数和评语。</div></div>;
}

function StudentRecord({ data }: { data: ClassroomData }) {
  const records = data.submissions.filter((submission) => submission.student_id === data.students[0]?.id);
  return <div className="page-stack"><div className="page-heading-row"><div><p className="breadcrumb">我的学习 / {data.class.name}</p><h1>学习记录</h1><p className="page-description">查看作业提交、成绩和教师反馈。</p></div></div><section className="content-section"><div className="record-list">{records.length === 0 ? <div className="empty-record">还没有作业提交记录，完成一次作业后会显示在这里。</div> : records.map((record) => { const assignment = data.assignments.find((item) => item.id === record.assignment_id); return <div className="record-row" key={record.id}><div className="record-date">{new Date(record.submitted_at).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}</div><div className="record-main"><strong>{assignment?.name ?? "作业"}</strong><p>{assignment?.chapter ?? "课程"} · {record.feedback ?? "等待教师反馈"}</p></div>{record.score ? <span className="record-score">{record.score} 分</span> : <Badge tone="amber">待批改</Badge>}</div>; })}</div></section></div>;
}

function CreateAssignmentModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (payload: { name: string; chapterId: string; description: string; deadline: string }) => void }) {
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({ name: String(form.get("name") ?? ""), chapterId: String(form.get("chapterId") ?? "chapter_3"), description: String(form.get("description") ?? ""), deadline: String(form.get("deadline") ?? "") });
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><form className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-title" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}><div className="modal-header"><div><p className="eyebrow">新建任务</p><h2 id="create-title">发布作业</h2></div><button type="button" className="close-button" aria-label="关闭" onClick={onClose}>×</button></div><label className="form-label" htmlFor="assignment-name">作业名称</label><input id="assignment-name" name="name" className="form-input" placeholder="例如：循环结构练习" required /><label className="form-label" htmlFor="assignment-chapter">所属章节</label><select id="assignment-chapter" name="chapterId" className="form-input" defaultValue="chapter_3"><option value="chapter_3">第 3 章 循环结构</option><option value="chapter_2">第 2 章 条件判断</option></select><label className="form-label" htmlFor="assignment-description">作业说明</label><textarea id="assignment-description" name="description" className="answer-box small-answer" placeholder="写下学生需要完成的内容……" /><label className="form-label" htmlFor="assignment-deadline">截止时间（可选）</label><input id="assignment-deadline" name="deadline" className="form-input" placeholder="例如：09-20" /><div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button type="submit" className="primary-button">保存作业</button></div></form></div>;
}
