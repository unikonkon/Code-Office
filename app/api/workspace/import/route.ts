import fs from "node:fs/promises";
import path from "node:path";
import { WORKSPACE_DIR } from "../../../../lib/config";
import { IMPORT_ROOT, resolveWithinRoot } from "../../../../lib/folders";

/**
 * POST /api/workspace/import {path} — "นำเข้า" โฟลเดอร์ด้วยการสร้าง symlink
 * ใต้ data/workspace → โผล่ใน Explorer ของ VS Code ทันที และ claude เข้าถึงได้
 * โดยไม่ copy/ย้ายไฟล์จริง (แก้ผ่าน symlink = แก้ไฟล์ต้นทาง)
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "body ต้องเป็น JSON" }, { status: 400 });
  }
  const requested = (body as { path?: unknown })?.path;
  const target = typeof requested === "string" ? resolveWithinRoot(requested) : null;
  if (!target) {
    return Response.json({ error: "path ไม่ถูกต้อง (ต้องอยู่ใต้ home directory)" }, { status: 400 });
  }
  if (target === IMPORT_ROOT) {
    return Response.json({ error: "นำเข้า home directory ทั้งหมดไม่ได้" }, { status: 400 });
  }
  if (target === WORKSPACE_DIR || target.startsWith(WORKSPACE_DIR + path.sep)) {
    return Response.json({ error: "โฟลเดอร์นี้อยู่ใน workspace อยู่แล้ว" }, { status: 400 });
  }

  try {
    const st = await fs.stat(target);
    if (!st.isDirectory()) {
      return Response.json({ error: "path ที่เลือกไม่ใช่โฟลเดอร์" }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "ไม่พบโฟลเดอร์ที่เลือก" }, { status: 404 });
  }

  await fs.mkdir(WORKSPACE_DIR, { recursive: true });

  // ใช้ชื่อโฟลเดอร์ต้นทางเป็นชื่อ link — ถ้าชนกับของเดิม ลองต่อท้าย -2, -3, …
  const base = path.basename(target);
  for (let i = 1; i <= 50; i++) {
    const name = i === 1 ? base : `${base}-${i}`;
    const linkPath = path.join(WORKSPACE_DIR, name);
    const existing = await fs.lstat(linkPath).catch(() => null);
    if (!existing) {
      await fs.symlink(target, linkPath, "dir");
      return Response.json({ ok: true, name });
    }
    if (existing.isSymbolicLink()) {
      const dest = await fs.readlink(linkPath).catch(() => null);
      if (dest && path.resolve(path.dirname(linkPath), dest) === target) {
        return Response.json({ ok: true, name, already: true });
      }
    }
  }
  return Response.json({ error: "หาชื่อ link ว่างไม่ได้ (ชนกันเกิน 50 ชื่อ)" }, { status: 500 });
}
