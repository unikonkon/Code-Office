import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Browse โฟลเดอร์ในเครื่องสำหรับเมนู "เพิ่มโฟลเดอร์" — จำกัดขอบเขตใต้ home directory
 * เท่านั้น (R6: server bind loopback อยู่แล้ว แต่ยัง validate path ซ้ำกัน traversal)
 */
export const IMPORT_ROOT = os.homedir();

/** คืน absolute path ถ้าอยู่ใต้ home (หรือเป็น home เอง) — นอกนั้นคืน null */
export function resolveWithinRoot(p: string): string | null {
  const resolved = path.resolve(p);
  if (resolved === IMPORT_ROOT || resolved.startsWith(IMPORT_ROOT + path.sep)) {
    return resolved;
  }
  return null;
}

export type FolderEntry = { name: string; path: string };

/** list เฉพาะโฟลเดอร์ (ข้าม dotfiles และ entry ที่อ่านไม่ได้) */
export async function listFolders(dirPath: string): Promise<FolderEntry[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const folders: FolderEntry[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    let isDir = entry.isDirectory();
    if (!isDir && entry.isSymbolicLink()) {
      try {
        isDir = (await fs.stat(path.join(dirPath, entry.name))).isDirectory();
      } catch {
        continue; // symlink เสีย/ไม่มีสิทธิ์
      }
    }
    if (isDir) folders.push({ name: entry.name, path: path.join(dirPath, entry.name) });
  }
  folders.sort((a, b) => a.name.localeCompare(b.name, "th"));
  return folders;
}
