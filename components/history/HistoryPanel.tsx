"use client";

import { useEffect, useState } from "react";

type TranscriptEntry = { id: string; mtime: string; sizeBytes: number };

type Props = {
  refreshKey: number; // เปลี่ยนค่าเพื่อสั่งโหลดรายการใหม่
};

export function HistoryPanel({ refreshKey }: Props) {
  const [sessions, setSessions] = useState<TranscriptEntry[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/history/list");
        const body = await res.json();
        if (active && res.ok) setSessions(body.sessions ?? []);
      } catch {
        // เงียบไว้ — panel ประวัติไม่ควรทำให้หน้าหลักล้ม
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const openTranscript = async (id: string) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setTranscript("กำลังโหลด…");
    const res = await fetch(`/api/history/get?id=${encodeURIComponent(id)}`);
    const body = await res.json();
    setTranscript(res.ok ? body.transcript : `โหลดไม่ได้: ${body.error}`);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-black/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        ประวัติแชท Claude (จาก workspace)
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {sessions.length === 0 && (
          <div className="px-3 py-2 text-sm text-zinc-500">
            ยังไม่มี session — เปิด VS Code terminal แล้วคุยกับ claude ก่อน
          </div>
        )}
        {sessions.map((s) => (
          <div key={s.id} className="border-b border-black/30">
            <div className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <button
                className="min-w-0 flex-1 truncate text-left font-mono text-zinc-300 hover:underline"
                onClick={() => openTranscript(s.id)}
                title={s.id}
              >
                {s.id.slice(0, 8)}
              </button>
              <span className="shrink-0 text-xs text-zinc-500">
                {s.mtime.slice(0, 16).replace("T", " ")}
              </span>
            </div>
            {openId === s.id && (
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap border-t border-black/30 bg-[#111] p-2 text-xs text-zinc-300">
                {transcript}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
