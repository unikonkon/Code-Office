"use client";

import { useState } from "react";
import { VSCodePanel } from "./vscode/VSCodePanel";
import { HistoryPanel } from "./history/HistoryPanel";

/**
 * Layout 2 ฝั่ง: VS Code จริง (iframe) เป็นหลัก + History panel ด้านขวา (พับเก็บได้)
 *
 * หมายเหตุ: ฟีเจอร์ FileTree / write-guard / inject-path ของเดิมถูกตัดออก
 * เพราะ VS Code มี Explorer/Editor/Terminal ครบในตัว และให้ผู้ใช้แก้ไฟล์ได้อิสระ
 */
export function Workspace() {
  const [showHistory, setShowHistory] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  return (
    <div className="flex h-dvh flex-col bg-[#1e1e1e] text-zinc-100">
      {/* แถบหัวบางๆ */}
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-black/40 bg-[#252526] px-3">
        <span className="text-sm font-semibold tracking-tight text-zinc-200">Code Office</span>
        <span className="font-mono text-xs text-zinc-500">VS Code + Claude</span>
        <button
          className="ml-auto rounded border border-zinc-600 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-700"
          onClick={() => {
            setShowHistory((s) => !s);
            setHistoryKey((k) => k + 1);
          }}
        >
          {showHistory ? "ซ่อนประวัติ" : "ประวัติแชท"}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1">
          <VSCodePanel />
        </main>
        {showHistory && (
          <aside className="w-[360px] shrink-0 border-l border-black/40 bg-[#1e1e1e]">
            <HistoryPanel refreshKey={historyKey} />
          </aside>
        )}
      </div>
    </div>
  );
}
