const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

const groups = [
  {
    label: "测试组 A · 全员提交",
    assignment: { name: `测试组A-${runId}-循环基础`, chapterId: "chapter_3", description: "验证全员提交和提交数量统计。", deadline: "10-01" },
    submissions: ["student_1", "student_2", "student_3"].map((studentId) => ({ studentId, content: `测试组 A：${studentId} 已完成全部练习。` })),
  },
  {
    label: "测试组 B · 部分提交",
    assignment: { name: `测试组B-${runId}-条件判断`, chapterId: "chapter_2", description: "验证部分学生提交和未提交状态。", deadline: "10-02" },
    submissions: ["student_1", "student_3"].map((studentId) => ({ studentId, content: `测试组 B：${studentId} 已完成部分练习。` })),
  },
  {
    label: "测试组 C · 重复提交",
    assignment: { name: `测试组C-${runId}-变量复习`, chapterId: "chapter_1", description: "验证同一学生重复提交时只保留一条有效记录。", deadline: "10-03" },
    submissions: [
      { studentId: "student_2", content: "测试组 C：第一次提交。" },
      { studentId: "student_2", content: "测试组 C：第二次提交，应该覆盖第一次。" },
    ],
  },
];
const teacherHeaders = { "Content-Type": "application/json", "x-demo-role": "teacher" };
const studentHeaders = { "Content-Type": "application/json", "x-demo-role": "student" };

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(`测试失败：${message}`);
}

const initial = await request("/api/classroom");
assert(initial.response.ok, "班级接口应返回 200");
assert(initial.body.source === "d1", "测试应连接到 D1 数据库");
assert(initial.body.students.length >= 3, "测试数据需要至少 3 名学生");

const created = [];
for (const group of groups) {
  const assignmentResult = await request("/api/assignments", {
    method: "POST",
    headers: teacherHeaders,
    body: JSON.stringify(group.assignment),
  });
  assert(assignmentResult.response.status === 201, `${group.label}创建作业应返回 201`);
  assert(assignmentResult.body.source === "d1", `${group.label}作业应写入 D1`);
  const assignmentId = assignmentResult.body.assignment.id;
  created.push({ ...group, assignmentId });

  for (const submission of group.submissions) {
    const submissionResult = await request("/api/submissions", {
      method: "POST",
      headers: studentHeaders,
      body: JSON.stringify({ assignmentId, ...submission }),
    });
    assert(submissionResult.response.status === 201, `${group.label}提交应返回 201`);
    assert(submissionResult.body.source === "d1", `${group.label}提交应写入 D1`);
  }
}

const invalidAssignment = await request("/api/assignments", {
  method: "POST",
  headers: teacherHeaders,
  body: JSON.stringify({ chapterId: "chapter_3" }),
});
assert(invalidAssignment.response.status === 400, "空作业名称应返回 400");

const invalidSubmission = await request("/api/submissions", {
  method: "POST",
  headers: studentHeaders,
  body: JSON.stringify({ studentId: "student_1" }),
});
assert(invalidSubmission.response.status === 400, "缺少作业编号应返回 400");

const latest = await request("/api/classroom");
assert(latest.response.ok, "写入后班级接口应返回 200");
for (const group of created) {
  const assignment = latest.body.assignments.find((item) => item.id === group.assignmentId);
  assert(assignment, `${group.label}应出现在班级作业列表`);
  const rows = latest.body.submissions.filter((item) => item.assignment_id === group.assignmentId);
  const expectedUniqueStudents = new Set(group.submissions.map((item) => item.studentId)).size;
  assert(rows.length === expectedUniqueStudents, `${group.label}应有 ${expectedUniqueStudents} 条有效提交`);
  if (group.label.includes("重复提交")) {
    assert(rows[0]?.content.includes("第二次提交"), "重复提交应覆盖为最后一次内容");
  }
}

const gradedSubmission = latest.body.submissions.find((item) => item.assignment_id === created[0].assignmentId);
assert(gradedSubmission, "评分测试需要一条提交记录");
const gradeResult = await request("/api/submissions", {
  method: "PATCH",
  headers: teacherHeaders,
  body: JSON.stringify({ submissionId: gradedSubmission.id, score: "95", feedback: "回答完整，继续保持。" }),
});
assert(gradeResult.response.status === 200, "教师评分应返回 200");
assert(gradeResult.body.source === "d1", "评分应写入 D1");
assert(gradeResult.body.submission.status === "graded" && gradeResult.body.submission.score === "95", "评分结果应保存为已批改");

const invalidGrade = await request("/api/submissions", {
  method: "PATCH",
  headers: teacherHeaders,
  body: JSON.stringify({ submissionId: gradedSubmission.id, score: "101" }),
});
assert(invalidGrade.response.status === 400, "超出范围的分数应返回 400");

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  runId,
  groups: created.map((group) => ({ label: group.label, assignmentId: group.assignmentId, submissions: new Set(group.submissions.map((item) => item.studentId)).size })),
  validations: ["读取班级数据", "创建 3 份作业", "写入全员提交", "写入部分提交", "验证重复提交覆盖", "教师评分和评语", "校验非法请求"],
}, null, 2));
