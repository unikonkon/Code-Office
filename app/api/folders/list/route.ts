import path from "node:path";
import { IMPORT_ROOT, listFolders, resolveWithinRoot } from "../../../../lib/folders";

/** GET /api/folders/list?path=… — list โฟลเดอร์ลูกของ path (default = home) */
export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("path") || IMPORT_ROOT;
  const dir = resolveWithinRoot(requested);
  if (!dir) {
    return Response.json({ error: "เข้าถึงได้เฉพาะโฟลเดอร์ใต้ home directory" }, { status: 400 });
  }
  try {
    const folders = await listFolders(dir);
    return Response.json({
      path: dir,
      parent: dir === IMPORT_ROOT ? null : path.dirname(dir),
      root: IMPORT_ROOT,
      folders,
    });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const message =
      code === "EACCES" || code === "EPERM"
        ? "ไม่มีสิทธิ์อ่านโฟลเดอร์นี้"
        : code === "ENOENT"
          ? "ไม่พบโฟลเดอร์"
          : "อ่านโฟลเดอร์ไม่สำเร็จ";
    return Response.json({ error: message }, { status: code === "ENOENT" ? 404 : 500 });
  }
}
