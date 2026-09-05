from pathlib import Path
from docx import Document
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from pptx import Presentation
from pptx.util import Inches, Pt
import json

root = Path(__file__).resolve().parents[1] / "体验材料" / "线性代数综合测试"
root.mkdir(parents=True, exist_ok=True)
(root / "学生名单_两位.csv").write_text("姓名,邮箱\n林晓,linxiao@example.com\n周宁,zhouning@example.com\n", encoding="utf-8-sig")

questions = [
    {"id":"LA-2026-01","type":"综合计算题","score":50,"stem":"设 A(t)= [[1,2,1],[2,4,t],[1,1,0]]。\n(1) 求 t 取何值时 rank(A(t))=2，并说明理由；\n(2) 在 rank(A(t))=2 时，求齐次方程 A(t)x=0 的基础解系；\n(3) 取 t=3，判断方程 A(3)x=(1,2,1)^T 是否有解，并求出通解。","answer":"行变换：R2-2R1=(0,0,t-2)，R3-R1=(0,-1,-1)。当 t=2 时第三行与第二行独立且第二行不为零，rank=2；当 t≠2 时三行满秩，rank=3。t=2 时方程组给出 x2+x3=0、x1+2x2+x3=0，基础解系可取 (1,-1,1)^T。t=3 时 det(A)=t-2=1≠0，唯一解为 x=(1,0,0)^T。","rubric":["参数分类与秩的证明 20分","基础解系 15分","非齐次方程判断与通解 15分"]},
    {"id":"LA-2026-02","type":"证明与计算题","score":50,"stem":"设实对称矩阵 B=[[2,1,0],[1,2,1],[0,1,2]]。\n(1) 求 B 的全部特征值；\n(2) 为每个特征值求一个单位特征向量，并写出正交矩阵 Q；\n(3) 验证 B=QΛQ^T，并说明这对二次型 x^TBx 的意义。","answer":"特征多项式为 (2-λ)((2-λ)^2-1)，故 λ1=2+√2、λ2=2、λ3=2-√2。可取单位特征向量分别为 (1/2,√2/2,1/2)^T、(1/√2,0,-1/√2)^T、(1/2,-√2/2,1/2)^T。令 Q 以三向量为列，Λ=diag(2+√2,2,2-√2)，则 Q^TQ=I 且 B=QΛQ^T；二次型经正交变换化为 (2+√2)y1^2+2y2^2+(2-√2)y3^2。","rubric":["特征值 15分","单位特征向量与正交性 20分","谱分解及二次型解释 15分"]}
]
(root / "线性代数综合测试_两道题.json").write_text(json.dumps({"title":"大学线性代数综合测试","duration":"90分钟","total":100,"questions":questions}, ensure_ascii=False, indent=2), encoding="utf-8")

doc = Document(); doc.add_heading("大学线性代数综合测试", 0); doc.add_paragraph("第1章—第3章综合 · 考试时间 90 分钟 · 满分 100 分"); doc.add_paragraph("要求：写出关键推导步骤，结论需说明理由。")
for i,q in enumerate(questions,1): doc.add_heading(f"第{i}题（{q['score']}分）{q['type']}",1); doc.add_paragraph(q['stem'])
doc.add_paragraph("—— 试卷结束 ——"); doc.save(root / "大学线性代数综合测试_试卷.docx")

pdfmetrics.registerFont(TTFont("SimHei", "C:/Windows/Fonts/simhei.ttf")); c=canvas.Canvas(str(root/"大学线性代数综合测试_试卷.pdf"),pagesize=A4); w,h=A4; y=h-55; c.setFont("SimHei",18); c.drawString(50,y,"大学线性代数综合测试"); y-=28; c.setFont("SimHei",10)
lines=["第1章—第3章综合 · 90分钟 · 满分100分","要求：写出关键推导步骤，结论需说明理由。","","第1题（50分） 综合计算题"]
lines += questions[0]["stem"].splitlines() + ["","第2题（50分） 证明与计算题"] + questions[1]["stem"].splitlines()
for line in lines:
    for chunk in [line[i:i+44] for i in range(0,len(line),44)] or [""]:
        c.drawString(50,y,chunk); y-=16
        if y<55: c.showPage(); c.setFont("SimHei",10); y=h-55
c.save()

def answer_doc(filename, student, wrong=False):
    d=Document(); d.add_heading("大学线性代数综合测试｜学生答卷",0); d.add_paragraph(f"学生：{student}");
    if not wrong:
        d.add_heading("第1题",1); d.add_paragraph("R2-2R1=(0,0,t-2)，R3-R1=(0,-1,-1)。t=2 时秩为2；基础解系可取 (1,-1,1)^T。t=3 时 det=1，唯一解 x=(1,0,0)^T。")
        d.add_heading("第2题",1); d.add_paragraph("特征值为 2+√2、2、2-√2。对应单位特征向量可取 (1/2,√2/2,1/2)^T、(1/√2,0,-1/√2)^T、(1/2,-√2/2,1/2)^T，组成正交矩阵 Q，且 B=QΛQ^T。")
    else:
        d.add_heading("第1题",1); d.add_paragraph("我认为 t=2 时 rank(A)=3，因为三行看起来都不相同；齐次方程只有零解。t=3 时我用消元得到 x=(1,0,0)^T。")
        d.add_heading("第2题",1); d.add_paragraph("我计算特征值为 1、2、3，并把 (1,0,0)^T、(0,1,0)^T、(0,0,1)^T 作为特征向量，因此 Q 是单位矩阵。")
        d.add_heading("仍需订正",1); d.add_paragraph("需要重新检查参数秩判断、特征多项式和特征向量验证。")
    d.save(root/filename)
answer_doc("学生1_林晓_正确答案.docx","林晓",False); answer_doc("学生2_周宁_故意错误答案.docx","周宁",True)

prs=Presentation(); prs.slide_width=Inches(13.333); prs.slide_height=Inches(7.5)
for title,body in [("大学线性代数综合测试","两道综合题 · 90分钟 · 满分100分"),("第1题：参数矩阵与线性方程组","讨论 rank(A(t)) 的参数分类\n求基础解系与非齐次方程通解\n重点：行变换、秩、解空间"),("第2题：实对称矩阵与谱分解","求特征值和单位特征向量\n验证 B=QΛQᵀ\n解释二次型正交化"),("提交与批改","两位学生提交：一份正确答案、一份故意错误答案\n教师按评分细则批改并回写掌握度")]:
    s=prs.slides.add_slide(prs.slide_layouts[1]); s.shapes.title.text=title; s.placeholders[1].text=body
    for p in s.placeholders[1].text_frame.paragraphs: p.font.size=Pt(24)
prs.save(root/"大学线性代数综合测试_课堂课件.pptx")
print(root)
