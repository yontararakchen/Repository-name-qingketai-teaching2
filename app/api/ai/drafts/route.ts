import { NextResponse } from "next/server";
import { getIdentity } from "@/db/auth";

export const dynamic = "force-dynamic";

type DraftQuestion = { id: string; prompt: string; options: string[]; answer: string; reason: string };

function buildDraft(materialName: string, materialType: string, text: string): { summary: string; knowledgePoints: string[]; questions: DraftQuestion[] } {
  const source = `${materialName} ${text}`.toLowerCase();
  if (/(线性代数|矩阵|行列式|特征值|特征向量|向量|线性相关|线性无关|秩)/i.test(source)) {
    return {
      summary: `已从“${materialName}”识别出线性代数主题，建议围绕矩阵运算、特征值和线性关系检查理解。`,
      knowledgePoints: ["矩阵与线性变换", "特征值", "线性相关性"],
      questions: [
        { id: "linear-algebra-1", prompt: "设 A = [[1, 2], [2, 1]]，则矩阵 A 的特征值是？", options: ["-1 和 3", "1 和 2", "0 和 3", "-2 和 2"], answer: "-1 和 3", reason: "材料包含矩阵与特征值主题；A 的特征多项式为 (1-λ)^2-4。" },
        { id: "linear-algebra-2", prompt: "下列哪组向量在线性代数中称为线性无关？", options: ["只有零向量的一组", "不存在不全为零的线性组合使结果为零", "所有向量都相等", "向量个数一定大于维数"], answer: "不存在不全为零的线性组合使结果为零", reason: "检查材料中线性无关的定义。" },
      ],
    };
  }
  if (/(循环|for|while|range)/i.test(source)) {
    return {
      summary: `已从“${materialName}”识别出循环结构主题，建议围绕遍历、次数和循环变量检查理解。`,
      knowledgePoints: ["循环结构", "遍历与次数", "循环变量"],
      questions: [
        { id: "loop-1", prompt: "下面哪一项最适合遍历一个列表中的每个元素？", options: ["for 循环", "if 判断", "import 导入", "return 返回"], answer: "for 循环", reason: "材料主题包含循环结构，优先检查循环用途。" },
        { id: "loop-2", prompt: "range(3) 通常会产生几个数字？", options: ["2 个", "3 个", "4 个", "无限个"], answer: "3 个", reason: "检查材料中 range 的起止规则与循环次数。" },
      ],
    };
  }
  if (/(条件|if|elif|else|判断)/i.test(source)) {
    return {
      summary: `已从“${materialName}”识别出条件判断主题，建议检查条件分支和布尔表达式。`,
      knowledgePoints: ["条件判断", "布尔表达式", "分支执行"],
      questions: [{ id: "condition-1", prompt: "当 if 条件为 False 且存在 else 时，程序会执行哪一段？", options: ["if 分支", "else 分支", "两段都执行", "程序一定报错"], answer: "else 分支", reason: "检查材料中条件为假时的分支路径。" }],
    };
  }
  if (/(变量|类型|string|字符串|整数|float|bool)/i.test(source)) {
    return {
      summary: `已从“${materialName}”识别出变量与数据类型主题，建议检查值、类型和转换。`,
      knowledgePoints: ["变量", "数据类型", "类型转换"],
      questions: [{ id: "type-1", prompt: "下面哪一个值的类型是字符串？", options: ["42", "3.14", "'hello'", "True"], answer: "'hello'", reason: "检查材料中字符串、数字和布尔值的区分。" }],
    };
  }
  return {
    summary: `已读取“${materialName}”（${materialType}）的基本信息，生成一份待教师核验的通用理解题草稿。`,
    knowledgePoints: ["核心概念", "关键定义", "应用理解"],
    questions: [{ id: "general-1", prompt: `关于“${materialName}”的核心内容，下列哪项表述最准确？`, options: ["材料中明确说明的定义", "与材料无关的猜测", "完全相反的结论", "无法从材料判断"], answer: "材料中明确说明的定义", reason: "未检测到明确主题，先生成通用理解题，教师应结合原文修改。" }],
  };
}

export async function POST(request: Request) {
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后生成题目草稿" }, { status: 401 });
  if (identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以生成题目草稿" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { materialName?: string; materialType?: string; text?: string };
  const materialName = String(body.materialName ?? "未命名材料").trim().slice(0, 160) || "未命名材料";
  const materialType = String(body.materialType ?? "FILE").trim().slice(0, 20) || "FILE";
  const text = String(body.text ?? "").trim().slice(0, 12000);
  const draft = buildDraft(materialName, materialType, text);
  return NextResponse.json({ draft: { ...draft, sourceName: materialName, sourceType: materialType, status: "draft", engine: "demo-material-parser" } });
}
