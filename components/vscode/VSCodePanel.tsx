"use client";

import { useState } from "react";

/**
 * ฝัง VS Code จริง (code-server) ผ่าน iframe same-origin ที่ /vscode/
 * โฟลเดอร์ workspace ถูกเปิดให้อัตโนมัติ และ tasks.json รัน `claude` ใน integrated terminal
 *
 * allow="clipboard-read; clipboard-write" จำเป็นสำหรับ copy/paste ใน VS Code
 * (same-origin จึงไม่ติดข้อจำกัด cross-origin อยู่แล้ว แต่ใส่ไว้ให้ครบ)
 */
export function VSCodePanel() {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative flex h-full flex-col bg-[#1e1e1e]">
      {!loaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-3 font-mono text-sm text-zinc-400">
          <span className="h-2 w-2 animate-ping rounded-full bg-[#28c840]" />
          กำลังโหลด VS Code (code-server)…
        </div>
      )}
      <iframe
        src="/vscode/"
        title="VS Code"
        className="h-full w-full border-0"
        allow="clipboard-read; clipboard-write; cross-origin-isolated"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
