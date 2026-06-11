import fs from "node:fs/promises";
import path from "node:path";
import { CLAUDE_PROJECTS_DIR, WORKSPACE_DIR } from "../config";
import { formatTranscript } from "./format";

/**
 * ประวัติแชท (R4): claude รันใน integrated terminal ของ VS Code โดยใช้ cwd = WORKSPACE_DIR
 * และเขียน transcript JSONL ของตัวเองที่
 *   ~/.claude/projects/<encoded WORKSPACE_DIR>/<session-uuid>.jsonl
 * เราอ่านโฟลเดอร์นั้น → list + แปลงเป็น Markdown ให้ดูในแอป (ไม่ต้อง spawn claude เอง)
 */

export type TranscriptEntry = {
  id: string; // ชื่อไฟล์ไม่รวม .jsonl (= session uuid ของ claude)
  mtime: string;
  sizeBytes: number;
};

/** โฟลเดอร์ที่ claude เก็บ transcript ของ workspace นี้ */
function projectDir(): string {
  const encoded = WORKSPACE_DIR.replace(/[/.]/g, "-");
  return path.join(CLAUDE_PROJECTS_DIR, encoded);
}

export async function listTranscripts(): Promise<TranscriptEntry[]> {
  const dir = projectDir();
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return []; // ยังไม่เคยมี session ใน workspace นี้
  }
  const entries: TranscriptEntry[] = [];
  for (const name of names) {
    if (!name.endsWith(".jsonl")) continue;
    try {
      const st = await fs.stat(path.join(dir, name));
      entries.push({
        id: name.slice(0, -".jsonl".length),
        mtime: st.mtime.toISOString(),
        sizeBytes: st.size,
      });
    } catch {
      // ข้ามไฟล์ที่ stat ไม่ได้
    }
  }
  entries.sort((a, b) => b.mtime.localeCompare(a.mtime));
  return entries;
}

export async function getTranscriptMarkdown(id: string): Promise<string | null> {
  // กัน path traversal — id ต้องเป็นชื่อ uuid ปกติเท่านั้น
  if (!/^[0-9a-fA-F-]{8,}$/.test(id)) return null;
  const file = path.join(projectDir(), `${id}.jsonl`);
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
  const st = await fs.stat(file).catch(() => null);
  return formatTranscript(raw, {
    id,
    title: id.slice(0, 8),
    createdAt: st ? st.birthtime.toISOString() : new Date(0).toISOString(),
  });
}
