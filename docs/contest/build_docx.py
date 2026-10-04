"""Generate the six contest documents as docx with a Word TOC field."""

from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from docx_content_design import blocks as design_blocks
from docx_content_rest import deploy, manual, requirements, script, test_report
from docx_engine import build_document

KICKER = "第八届 AIC 算法创新赛 · 赛题 2「AI+软件创新」"
DESKTOP = Path(r"C:\Users\57219\Desktop\VeriFlow参赛文档") / "docx"
LOCAL = HERE / "docx"


def meta(doc_title, subtitle, kind):
    return {
        "kicker": KICKER,
        "doc_title": doc_title,
        "subtitle": subtitle,
        "header": f"VeriFlow {doc_title.replace('VeriFlow ', '')}" if False else doc_title,
        "meta_lines": [
            "赛题：第八届 AIC 算法创新赛 · 赛题 2「AI+软件创新」",
            f"文档类型：{kind}",
            "技术架构：Next.js + FastAPI + Python 验证器 + Docker 沙箱",
        ],
    }


DOCS = [
    (
        "VeriFlow 软件功能需求分析文档",
        meta("VeriFlow 软件功能需求分析文档", "面向大模型出题工作流的规格验证、门禁与算法训练判题", "需求分析"),
        requirements(),
    ),
    (
        "VeriFlow 软件功能设计文档",
        meta("VeriFlow 软件功能设计文档", "规格编译、多维验证、受约束修复与沙箱判题的设计说明", "功能设计"),
        design_blocks(),
    ),
    (
        "VeriFlow 软件产品说明书",
        meta("VeriFlow 软件产品说明书", "按页面按钮说明控制台、出题质检、沙箱判题和评测基准", "产品说明"),
        manual(),
    ),
    (
        "VeriFlow 软件功能测试报告",
        meta("VeriFlow 软件功能测试报告", "自动化测试、合成变异基准、消融与未运行项的验收记录", "测试报告"),
        test_report(),
    ),
    (
        "VeriFlow 安装包及部署文档",
        meta("VeriFlow 安装包及部署文档", "公网 8081 演示、本机开发与按提交号发布前端", "安装部署"),
        deploy(),
    ),
    (
        "VeriFlow 演示视频脚本",
        meta("VeriFlow 演示视频脚本", "约 4 分 50 秒，展示拦截、规则修复、模拟轨迹和沙箱反例", "演示视频分镜"),
        script(),
    ),
]


def sync_markdown():
    """Keep the five prose documents in sync with their structured DOCX source."""
    filenames = ["01-功能需求分析.md", "02-功能设计.md", "03-产品说明书.md", "04-功能测试报告.md", "05-安装部署.md"]
    for (name, info, blocks), filename in zip(DOCS, filenames):
        lines = [f"# {name}", "", f"- 副标题：{info['subtitle']}", "- 核对日期：2026年10月05日", ""]
        for block in blocks:
            kind = block[0]
            if kind in {"h1", "h2", "h3"}:
                lines.append("#" * (int(kind[1]) + 1) + " " + block[1])
            elif kind in {"p", "cap"}:
                lines.append(block[1])
            elif kind == "code":
                lines.extend(["```", block[1], "```"])
            elif kind == "table":
                lines.append("| " + " | ".join(block[1]) + " |")
                lines.append("|" + "|".join(["---"] * len(block[1])) + "|")
                lines.extend("| " + " | ".join(row) + " |" for row in block[2])
            lines.append("")
        (HERE / filename).write_text("\n".join(lines), encoding="utf-8")


def main():
    sync_markdown()
    written = []
    for name, info, blocks in DOCS:
        for folder in (LOCAL, DESKTOP):
            path = folder / f"{name}.docx"
            build_document(info, blocks, path)
            written.append(path)
            print(path)
    return written


if __name__ == "__main__":
    main()
