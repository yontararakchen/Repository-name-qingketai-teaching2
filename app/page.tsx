"use client";

import { useState } from "react";

type Role = "teacher" | "student";
type Page = "overview" | "content" | "assignments" | "submissions" | "record";

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
  const nav = role === "teacher" ? teacherNav : studentNav;

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
      <main className="main-content">{role === "teacher" ? <TeacherView page={page} onCreate={() => setShowCreate(true)} /> : <StudentView page={page} submitted={submitted} onSubmit={() => setSubmitted(true)} />}</main>
    </div>
    {showCreate && <CreateAssignmentModal onClose={() => setShowCreate(false)} />}
  </div>;
}

function TeacherView({ page, onCreate }: { page: Page; onCreate: () => void }) {
  if (page === "content") return <TeacherContent onCreate={onCreate} />;
  if (page === "assignments") return <TeacherAssignments onCreate={onCreate} />;
  if (page === "submissions") return <TeacherSubmissions />;
  return <TeacherOverview onCreate={onCreate} />;
}

function TeacherOverview({ onCreate }: { onCreate: () => void }) {
  return <div className="page-stack"><div className="page-heading-row"><div><p className="breadcrumb">我的班级 / Python 基础班</p><h1>班级首页</h1><p className="page-description">今天也从一件小事开始，把课程内容和学生进度整理好。</p></div><button type="button" className="primary-button" onClick={onCreate}>＋ 发布新作业</button></div>
    <section className="class-hero"><div><div className="hero-label">本学期 · 课程班级</div><h2>Python 基础班</h2><p>王老师 · 36 名学生 · 班级码 <strong>PY2026</strong></p></div><button type="button" className="secondary-button">复制班级码</button></section>
    <div className="metric-grid"><Metric label="章节" value="3" detail="2 个已发布" /><Metric label="学生" value="36" detail="本学期成员" /><Metric label="待批改作业" value="12" detail="需要你的反馈" /><Metric label="本周提交率" value="78%" detail="较上周 +6%" /></div>
    <section className="content-section"><SectionTitle title="最近课程内容" description="从章节开始，继续准备你的下一次教学。" action={<button type="button" className="text-button">查看全部 →</button>} /><div className="chapter-list">{chapters.map((chapter, index) => <div className="chapter-row" key={chapter.name}><div className="chapter-number">0{index + 1}</div><div className="chapter-main"><h3>{chapter.name}</h3><p>{chapter.files} 个教学资料</p></div><Badge tone={chapter.status === "草稿" ? "amber" : "green"}>{chapter.status}</Badge><button type="button" className="row-action">进入章节 <span>→</span></button></div>)}</div></section>
    <section className="split-section"><div className="content-section compact-section"><SectionTitle title="待处理作业" description="最近需要你查看的提交。" action={<button type="button" className="text-button">全部作业 →</button>} /><div className="mini-list"><div className="mini-row"><span className="mini-avatar">张</span><div><strong>张三</strong><p>循环结构练习</p></div><Badge>待批改</Badge></div><div className="mini-row"><span className="mini-avatar">陈</span><div><strong>陈可</strong><p>条件判断练习</p></div><Badge>待批改</Badge></div><div className="mini-row"><span className="mini-avatar">赵</span><div><strong>赵六</strong><p>变量基础练习</p></div><Badge tone="green">已完成</Badge></div></div></div><div className="content-section compact-section next-step-card"><div className="next-step-mark">↗</div><p className="eyebrow">下一步建议</p><h3>为第 3 章准备一份作业</h3><p>你已经上传了 3 份资料，可以直接发布一份章节练习。</p><button type="button" className="secondary-button" onClick={onCreate}>开始创建</button></div></section>
  </div>;
}

function TeacherContent({ onCreate }: { onCreate: () => void }) {
  return <div className="page-stack"><div className="page-heading-row"><div><p className="breadcrumb">课程内容 / Python 基础班</p><h1>章节和资料</h1><p className="page-description">按章节整理课件，学生会在这里看到已发布的资料。</p></div><button type="button" className="primary-button">＋ 创建章节</button></div><section className="content-section"><SectionTitle title="章节目录" description="3 个章节 · 8 个资料" action={<button type="button" className="secondary-button">上传资料</button>} /><div className="chapter-list">{chapters.map((chapter, index) => <div className="chapter-row" key={chapter.name}><div className="chapter-number">0{index + 1}</div><div className="chapter-main"><h3>{chapter.name}</h3><p>{chapter.files} 个教学资料 · 最近更新昨天</p></div><Badge tone={chapter.status === "草稿" ? "amber" : "green"}>{chapter.status}</Badge><button type="button" className="row-action">管理资料 <span>→</span></button></div>)}</div></section><section className="content-section material-preview"><SectionTitle title="第 3 章 / 循环结构" description="当前章节资料预览" action={<button type="button" className="text-button">编辑章节</button>} /><div className="material-list"><MaterialRow name="循环结构讲义.pdf" type="PDF" size="2.4 MB" /><MaterialRow name="循环案例.pptx" type="PPT" size="6.8 MB" /><MaterialRow name="课堂练习说明.docx" type="DOC" size="1.2 MB" /></div><div className="upload-hint"><span>＋</span><div><strong>把资料拖到这里</strong><p>支持 PDF、PPT、图片和文档</p></div><button type="button" className="secondary-button">选择文件</button></div></section><div className="inline-note"><span className="info-mark">i</span>第一版只保存文件和基本信息，资料解析与知识点识别将在后续加入。</div><button type="button" className="text-button hidden-create" onClick={onCreate}>发布章节作业 →</button></div>;
}

function MaterialRow({ name, type, size }: { name: string; type: string; size: string }) {
  return <div className="material-row"><span className="file-icon">{type}</span><div className="material-name"><strong>{name}</strong><p>{size} · 昨天更新</p></div><button type="button" className="text-button">下载</button><button type="button" className="row-menu" aria-label={`更多操作：${name}`}>•••</button></div>;
}

function TeacherAssignments({ onCreate }: { onCreate: () => void }) {
  return <div className="page-stack"><div className="page-heading-row"><div><p className="breadcrumb">我的班级 / 作业</p><h1>作业管理</h1><p className="page-description">创建作业、设置截止时间，并查看学生完成情况。</p></div><button type="button" className="primary-button" onClick={onCreate}>＋ 发布新作业</button></div><section className="content-section"><div className="table-toolbar"><div className="filter-tabs"><button type="button" className="filter-active">全部 <span>3</span></button><button type="button">进行中 <span>1</span></button><button type="button">草稿 <span>1</span></button></div><button type="button" className="secondary-button">筛选 ▾</button></div><div className="assignment-table"><div className="table-head"><span>作业名称</span><span>所属章节</span><span>截止时间</span><span>提交情况</span><span>状态</span><span /></div>{assignments.map((assignment) => <div className="table-row" key={assignment.name}><div className="table-title"><strong>{assignment.name}</strong><p>普通作业 · 可重复提交</p></div><span>{assignment.chapter}</span><span>{assignment.deadline}</span><span>{assignment.submitted}</span><Badge tone={assignment.status === "进行中" ? "blue" : assignment.status === "草稿" ? "amber" : "gray"}>{assignment.status}</Badge><button type="button" className="row-menu" aria-label={`打开 ${assignment.name}`}>•••</button></div>)}</div></section></div>;
}

function TeacherSubmissions() {
  return <div className="page-stack"><div className="page-heading-row"><div><p className="breadcrumb">学生提交 / 循环结构练习</p><h1>学生提交</h1><p className="page-description">已提交 28 人 · 未提交 8 人 · 点击学生查看内容并评分。</p></div><button type="button" className="secondary-button">导出列表</button></div><section className="content-section"><div className="submission-summary"><div><span className="summary-dot blue-dot" />已提交 <strong>28</strong></div><div><span className="summary-dot amber-dot" />待批改 <strong>12</strong></div><div><span className="summary-dot gray-dot" />未提交 <strong>8</strong></div></div><div className="submission-table"><div className="table-head"><span>学生</span><span>提交时间</span><span>状态</span><span>分数</span><span /></div>{students.map((student) => <div className="table-row" key={student.name}><div className="student-cell"><span className="mini-avatar">{student.initials}</span><strong>{student.name}</strong></div><span>{student.submitted}</span><Badge tone={student.state === "已批改" ? "green" : student.state === "待批改" ? "amber" : "gray"}>{student.state}</Badge><span className="score-text">{student.score}</span><button type="button" className="row-action">查看 <span>→</span></button></div>)}</div></section></div>;
}

function StudentView({ page, submitted, onSubmit }: { page: Page; submitted: boolean; onSubmit: () => void }) {
  if (page === "content") return <StudentContent />;
  if (page === "assignments") return <StudentAssignments submitted={submitted} onSubmit={onSubmit} />;
  if (page === "record") return <StudentRecord />;
  return <StudentOverview submitted={submitted} onSubmit={onSubmit} />;
}

function StudentOverview({ submitted, onSubmit }: { submitted: boolean; onSubmit: () => void }) {
  return <div className="page-stack"><div className="page-heading-row"><div><p className="breadcrumb">我的班级 / Python 基础班</p><h1>你好，张三</h1><p className="page-description">继续完成你的学习任务，保持每周的小进步。</p></div><button type="button" className="primary-button" onClick={onSubmit}>{submitted ? "已提交作业" : "去完成作业"}</button></div><section className="class-hero student-hero"><div><div className="hero-label">当前课程</div><h2>Python 基础班</h2><p>王老师 · 本学期 · 36 名学生</p></div><span className="student-progress">本周完成 <strong>2/3</strong></span></section><div className="student-grid"><section className="content-section"><SectionTitle title="最近学习内容" description="从上次学习的地方继续。" /><div className="learning-card"><div className="learning-icon">03</div><div><span className="eyebrow">正在学习</span><h3>第 3 章 循环结构</h3><p>3 个资料 · 1 个待完成作业</p></div><button type="button" className="secondary-button">查看章节</button></div></section><section className="content-section"><SectionTitle title="我的作业" description="按时完成作业，及时查看反馈。" /><div className="mini-list"><div className="mini-row"><span className="file-icon">作</span><div><strong>条件判断练习</strong><p>截止 09-18</p></div><Badge tone="green">已评分 88</Badge></div><div className="mini-row"><span className="file-icon">作</span><div><strong>循环结构练习</strong><p>截止时间未设置</p></div><Badge tone={submitted ? "green" : "amber"}>{submitted ? "已提交" : "待完成"}</Badge></div></div></section></div><div className="inline-note"><span className="info-mark">i</span>提交后仍可再次上传，系统会保留你的提交记录，教师会以最后一次提交为准。</div></div>;
}

function StudentContent() {
  return <div className="page-stack"><div className="page-heading-row"><div><p className="breadcrumb">课程内容 / Python 基础班</p><h1>课程内容</h1><p className="page-description">按章节查看老师发布的学习资料。</p></div></div><section className="content-section"><SectionTitle title="章节目录" description="3 个章节 · 8 个资料" /><div className="chapter-list">{chapters.map((chapter, index) => <div className="chapter-row" key={chapter.name}><div className="chapter-number">0{index + 1}</div><div className="chapter-main"><h3>{chapter.name}</h3><p>{chapter.files} 个教学资料 · {index === 2 ? "包含待完成作业" : "已完成"}</p></div><Badge tone={index === 2 ? "blue" : "green"}>{index === 2 ? "学习中" : "已完成"}</Badge><button type="button" className="row-action">查看章节 <span>→</span></button></div>)}</div></section></div>;
}

function StudentAssignments({ submitted, onSubmit }: { submitted: boolean; onSubmit: () => void }) {
  return <div className="page-stack"><div className="page-heading-row"><div><p className="breadcrumb">我的作业 / 第 3 章</p><h1>作业详情</h1><p className="page-description">循环结构练习 · 截止时间未设置</p></div><Badge tone={submitted ? "green" : "amber"}>{submitted ? "已提交" : "待完成"}</Badge></div><section className="assignment-detail"><div className="detail-heading"><div><span className="eyebrow">第 3 章 循环结构</span><h2>循环结构练习</h2></div><span className="deadline-label">可重复提交</span></div><div className="detail-description"><p>请完成以下三个循环练习，并上传代码或截图。提交后可以继续修改并重新上传。</p></div><label className="form-label" htmlFor="answer">我的回答</label><textarea id="answer" className="answer-box" placeholder="输入文字回答，或粘贴你的代码……" defaultValue={submitted ? "我已经完成了三个循环练习。" : ""} /><div className="upload-row"><div className="upload-box"><span className="upload-plus">＋</span><div><strong>添加附件</strong><p>支持代码、图片和文档</p></div></div><span className="upload-example">示例：循环练习.py</span></div><div className="form-actions"><button type="button" className="secondary-button">保存草稿</button><button type="button" className="primary-button" onClick={onSubmit}>{submitted ? "再次提交" : "提交作业"}</button></div></section><div className="inline-note"><span className="info-mark">i</span>教师评分后，你可以在“学习记录”里查看分数和评语。</div></div>;
}

function StudentRecord() {
  return <div className="page-stack"><div className="page-heading-row"><div><p className="breadcrumb">我的学习 / Python 基础班</p><h1>学习记录</h1><p className="page-description">查看作业提交、成绩和教师反馈。</p></div></div><section className="content-section"><div className="record-list"><div className="record-row"><div className="record-date">09-10</div><div className="record-main"><strong>条件判断练习</strong><p>第 2 章 · 教师评语：思路清晰，注意边界条件。</p></div><span className="record-score">88 分</span></div><div className="record-row"><div className="record-date">09-08</div><div className="record-main"><strong>变量基础练习</strong><p>第 1 章 · 教师评语：基础掌握良好。</p></div><span className="record-score">92 分</span></div><div className="record-row"><div className="record-date">09-06</div><div className="record-main"><strong>课程加入</strong><p>加入 Python 基础班</p></div><Badge tone="gray">已完成</Badge></div></div></section></div>;
}

function CreateAssignmentModal({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">新建任务</p><h2 id="create-title">发布作业</h2></div><button type="button" className="close-button" aria-label="关闭" onClick={onClose}>×</button></div><label className="form-label" htmlFor="assignment-name">作业名称</label><input id="assignment-name" className="form-input" placeholder="例如：循环结构练习" /><label className="form-label" htmlFor="assignment-chapter">所属章节</label><select id="assignment-chapter" className="form-input" defaultValue="chapter3"><option value="chapter3">第 3 章 循环结构</option><option value="chapter2">第 2 章 条件判断</option></select><label className="form-label" htmlFor="assignment-description">作业说明</label><textarea id="assignment-description" className="answer-box small-answer" placeholder="写下学生需要完成的内容……" /><div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>保存草稿</button><button type="button" className="primary-button" onClick={onClose}>发布作业</button></div></div></div>;
}
