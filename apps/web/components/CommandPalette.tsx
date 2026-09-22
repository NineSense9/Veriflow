"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProblemListItem, api } from "@/lib/api";
import { applyTheme, readTheme } from "@/lib/theme";

type ActionItem = {
  id: string;
  category: "功能导航" | "精课题库" | "快捷指令";
  title: string;
  subtitle?: string;
  badge?: string;
  action: () => void;
};

const STATIC_PAGES = [
  { title: "题库训练", path: "/problems", category: "功能导航" as const, desc: "32 道竞赛题库与难度筛选" },
  { title: "沙箱判题", path: "/status", category: "功能导航" as const, desc: "实时评测记录与反例捕获" },
  { title: "智能对拍", path: "/stress", category: "功能导航" as const, desc: "双程序沙箱 Fuzzing 模糊测试" },
  { title: "出题质检", path: "/report", category: "功能导航" as const, desc: "AI 出题时序图论全链路质检" },
  { title: "需求出题", path: "/compose", category: "功能导航" as const, desc: "自然语言编译为可验证出题流水线" },
  { title: "竞赛题单", path: "/sets", category: "功能导航" as const, desc: "ACM 体系化进阶题单分类" },
  { title: "评测基准", path: "/benchmark", category: "功能导航" as const, desc: "55 组全量验证与变异评测" },
  { title: "证据链分析", path: "/evidence", category: "功能导航" as const, desc: "缺陷溯源与最小反例轨迹" },
  { title: "算法矩阵", path: "/algorithms", category: "功能导航" as const, desc: "确定性验证器与监控器定义" },
  { title: "系统架构", path: "/architecture", category: "功能导航" as const, desc: "模块交互与数据流向地图" },
  { title: "个人中心", path: "/account", category: "功能导航" as const, desc: "难度攻克看板与算法图谱" },
  { title: "系统设置", path: "/settings", category: "功能导航" as const, desc: "编辑器偏好与运行环境设置" },
];

export default function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [problems, setProblems] = useState<ProblemListItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
      if (problems.length === 0) {
        api.problems().then((res) => setProblems(res.problems || [])).catch(() => {});
      }
    }
  }, [open, problems.length]);

  const items = useMemo<ActionItem[]>(() => {
    const q = query.trim().toLowerCase();
    const result: ActionItem[] = [];

    // 1. Static Pages
    for (const p of STATIC_PAGES) {
      if (!q || p.title.toLowerCase().includes(q) || p.path.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)) {
        result.push({
          id: `page-${p.path}`,
          category: "功能导航",
          title: p.title,
          subtitle: p.desc,
          badge: p.path,
          action: () => {
            onClose();
            router.push(p.path);
          },
        });
      }
    }

    // 2. Problems
    for (const prob of problems) {
      const match =
        !q ||
        prob.id.toLowerCase().includes(q) ||
        prob.title.toLowerCase().includes(q) ||
        prob.tags.some((t) => t.toLowerCase().includes(q));
      if (match) {
        result.push({
          id: `prob-${prob.id}`,
          category: "精课题库",
          title: `${prob.id} · ${prob.title}`,
          subtitle: `难度 ${prob.difficulty} · 标签: ${prob.tags.slice(0, 3).join(", ")}`,
          badge: `难度 ${prob.difficulty}`,
          action: () => {
            onClose();
            router.push(`/problems/${prob.id}`);
          },
        });
      }
    }

    // 3. Quick Actions
    if (!q || "主题暗黑明亮白天夜间theme".includes(q)) {
      result.push({
        id: "action-theme",
        category: "快捷指令",
        title: "切换界面明暗主题",
        subtitle: `当前: ${readTheme() === "dark" ? "深色模式" : "浅色模式"}`,
        badge: "Theme",
        action: () => {
          const next = readTheme() === "dark" ? "light" : "dark";
          applyTheme(next);
          onClose();
        },
      });
    }

    if (!q || "退出登录登出logout".includes(q)) {
      result.push({
        id: "action-logout",
        category: "快捷指令",
        title: "退出登录",
        subtitle: "清除本地会话并返回登录页",
        badge: "Auth",
        action: () => {
          onClose();
          api.logout().catch(() => {});
          sessionStorage.clear();
          router.push("/login");
        },
      });
    }

    return result.slice(0, 15);
  }, [query, problems, onClose, router]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (items.length ? (prev + 1) % items.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (items.length ? (prev - 1 + items.length) % items.length : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (items[selectedIndex]) {
          items[selectedIndex].action();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, items, selectedIndex, onClose]);

  if (!open) return null;

  return (
    <div
      className="vf-cmd-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="全局指令搜索盘"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="vf-cmd-dialog">
        <div className="vf-cmd-head">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            className="vf-cmd-input"
            placeholder="搜索题号 (VF1001)、算法、页面或指令..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="vf-cmd-close" onClick={onClose} aria-label="关闭">
            <kbd>ESC</kbd>
          </button>
        </div>

        <div className="vf-cmd-list">
          {items.length === 0 ? (
            <div className="vf-cmd-empty">未找到匹配的题目或页面</div>
          ) : (
            items.map((item, idx) => (
              <div
                key={item.id}
                className={`vf-cmd-item ${idx === selectedIndex ? "active" : ""}`}
                onClick={item.action}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div className="vf-cmd-item-main">
                  <span className="vf-cmd-item-category">{item.category}</span>
                  <strong className="vf-cmd-item-title">{item.title}</strong>
                  {item.subtitle ? <span className="vf-cmd-item-sub">{item.subtitle}</span> : null}
                </div>
                {item.badge ? <span className="vf-cmd-item-badge">{item.badge}</span> : null}
              </div>
            ))
          )}
        </div>

        <div className="vf-cmd-foot">
          <span><code>↑</code> <code>↓</code> 导航</span>
          <span><code>↵</code> 直达</span>
          <span><code>ESC</code> 退出</span>
        </div>
      </div>
    </div>
  );
}
