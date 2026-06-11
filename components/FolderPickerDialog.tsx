"use client";

import { useCallback, useEffect, useState } from "react";

type FolderEntry = { name: string; path: string };
type ListResponse = {
  path: string;
  parent: string | null;
  root: string;
  folders: FolderEntry[];
};

/**
 * Modal เลือกโฟลเดอร์ในเครื่อง (browse ทีละชั้นใต้ home) + ช่องค้นหากรองชั้นปัจจุบัน
 * เลือกแล้ว POST /api/workspace/import → symlink เข้า data/workspace
 * (VS Code Explorer เห็น symlink ใหม่เองผ่าน file watcher ไม่ต้อง reload iframe)
 */
export function FolderPickerDialog({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<ListResponse | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);

  // dir.path = โฟลเดอร์ที่กำลังเปิดดู (undefined = home) — effect ด้านล่าง fetch ตามค่านี้
  // ห่อเป็น object ใหม่ทุกครั้งเพื่อให้ navigate ไป path เดิมซ้ำ (เช่น retry หลัง error) ก็ refetch
  const [dir, setDir] = useState<{ path?: string }>({});

  const load = useCallback((p?: string) => {
    setLoading(true);
    setError(null);
    setDir({ path: p });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = dir.path ? `?path=${encodeURIComponent(dir.path)}` : "";
        const res = await fetch(`/api/folders/list${qs}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || res.statusText);
        setData(json as ListResponse);
        setQuery("");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "โหลดรายการโฟลเดอร์ไม่สำเร็จ");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dir]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const importFolder = async (p: string) => {
    setImporting(p);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/workspace/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: p }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      setNotice(
        json.already
          ? `"${json.name}" อยู่ใน workspace อยู่แล้ว`
          : `นำเข้า "${json.name}" แล้ว — เปิดดูได้ใน Explorer ของ VS Code`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "นำเข้าโฟลเดอร์ไม่สำเร็จ");
    } finally {
      setImporting(null);
    }
  };

  const folders = (data?.folders ?? []).filter((f) =>
    f.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const displayPath = data
    ? data.path === data.root
      ? "~"
      : `~${data.path.slice(data.root.length)}`
    : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-[560px] flex-col rounded-lg border border-zinc-700 bg-[#252526] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* หัว dialog: path ปัจจุบัน + ปุ่มขึ้นชั้นบน */}
        <div className="flex items-center gap-2 border-b border-black/40 px-4 py-3">
          <button
            className="rounded border border-zinc-600 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
            disabled={!data?.parent || loading}
            onClick={() => data?.parent && void load(data.parent)}
            title="ขึ้นชั้นบน"
          >
            ↑
          </button>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-400" title={data?.path}>
            {displayPath}
          </span>
          <button
            className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-700"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาโฟลเดอร์ในชั้นนี้…"
            className="w-full rounded border border-zinc-600 bg-[#1e1e1e] px-2 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-400 focus:outline-none"
          />
        </div>

        {/* รายการโฟลเดอร์: คลิกชื่อ = เข้าไปดูข้างใน, ปุ่มนำเข้า = symlink เข้า workspace */}
        <div className="min-h-[200px] flex-1 overflow-y-auto px-2 pb-2">
          {loading ? (
            <p className="px-2 py-4 text-sm text-zinc-500">กำลังโหลด…</p>
          ) : folders.length === 0 ? (
            <p className="px-2 py-4 text-sm text-zinc-500">
              {query ? "ไม่พบโฟลเดอร์ที่ตรงกับคำค้น" : "ไม่มีโฟลเดอร์ย่อย"}
            </p>
          ) : (
            folders.map((f) => (
              <div
                key={f.path}
                className="group flex items-center gap-2 rounded px-2 py-1 hover:bg-zinc-700/50"
              >
                <button
                  className="min-w-0 flex-1 truncate text-left text-sm text-zinc-200"
                  onClick={() => void load(f.path)}
                  title={`เปิดดู ${f.name}`}
                >
                  📁 {f.name}
                </button>
                <button
                  className="shrink-0 rounded border border-zinc-600 px-2 py-0.5 text-xs text-zinc-300 opacity-0 hover:bg-zinc-600 group-hover:opacity-100 disabled:opacity-40"
                  disabled={importing !== null}
                  onClick={() => void importFolder(f.path)}
                >
                  {importing === f.path ? "กำลังนำเข้า…" : "นำเข้า"}
                </button>
              </div>
            ))
          )}
        </div>

        {/* แถบสถานะ + นำเข้าโฟลเดอร์ที่เปิดอยู่ */}
        <div className="flex items-center gap-2 border-t border-black/40 px-4 py-3">
          <span className="min-w-0 flex-1 truncate text-xs">
            {error ? (
              <span className="text-red-400">{error}</span>
            ) : notice ? (
              <span className="text-emerald-400">{notice}</span>
            ) : null}
          </span>
          <button
            className="shrink-0 rounded border border-zinc-600 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
            disabled={!data || data.path === data.root || importing !== null || loading}
            onClick={() => data && void importFolder(data.path)}
          >
            นำเข้าโฟลเดอร์นี้
          </button>
        </div>
      </div>
    </div>
  );
}
