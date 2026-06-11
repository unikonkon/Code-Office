/**
 * Custom server (รันด้วย tsx): http + Next handler + reverse-proxy /vscode/ → code-server
 *
 * ฝัง VS Code จริง (code-server) แบบ same-origin:
 *   browser → localhost:3000/vscode/* → (strip /vscode) → code-server 127.0.0.1:3001
 * รวม WebSocket upgrade ด้วย เพื่อให้ editor/terminal ของ VS Code ทำงานครบ
 *
 * โหมดรันหลัก: npm run build && npm start
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import next from "next";
import httpProxy from "http-proxy";
import { HOST, PORT, VSCODE_BASE_PATH, VSCODE_HOST, VSCODE_PORT } from "./lib/config";
import { vscodeManager } from "./lib/vscode/manager";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, hostname: HOST, port: PORT });
const handle = app.getRequestHandler();

const VSCODE_ORIGIN = `http://${VSCODE_HOST}:${VSCODE_PORT}`;
const proxy = httpProxy.createProxyServer({
  target: VSCODE_ORIGIN,
  ws: true,
  changeOrigin: true, // Host → 127.0.0.1:3001
});
// เขียน Origin ให้ตรงกับ code-server เอง → origin check (กัน CSRF/WS hijack) มองเป็น same-origin
proxy.on("proxyReq", (proxyReq) => {
  if (proxyReq.getHeader("origin")) proxyReq.setHeader("origin", VSCODE_ORIGIN);
});
proxy.on("proxyReqWs", (proxyReq) => {
  proxyReq.setHeader("origin", VSCODE_ORIGIN);
});
proxy.on("error", (err, _req, res) => {
  console.error("[vscode proxy]", err.message);
  if (res && "writeHead" in res && !res.headersSent) {
    (res as ServerResponse).writeHead(502, { "Content-Type": "text/plain" });
    (res as ServerResponse).end("code-server unavailable");
  }
});

/** ตัด prefix /vscode ออกจาก url ก่อนส่งให้ code-server (assets เป็น relative path) */
function stripBase(url: string | undefined): string {
  const stripped = (url ?? "").replace(new RegExp(`^${VSCODE_BASE_PATH}`), "");
  return stripped === "" ? "/" : stripped;
}

function isVscodePath(pathname: string): boolean {
  return pathname === VSCODE_BASE_PATH || pathname.startsWith(`${VSCODE_BASE_PATH}/`);
}

app.prepare().then(async () => {
  // สตาร์ท code-server (ดาวน์โหลด binary ไว้แล้วใน vendor/) — รอจน healthy
  try {
    await vscodeManager.start();
    console.log("> code-server ready (embedded VS Code)");
  } catch (err) {
    console.error("> code-server failed to start:", err instanceof Error ? err.message : err);
    console.error("> /vscode/ จะใช้ไม่ได้ — ตรวจว่ารัน setup ดาวน์โหลด binary แล้ว");
  }

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const pathname = new URL(req.url ?? "/", `http://${HOST}:${PORT}`).pathname;
    if (isVscodePath(pathname)) {
      req.url = stripBase(req.url);
      proxy.web(req, res);
      return;
    }
    void handle(req, res);
  });

  // Next ใช้ ws ของตัวเองสำหรับ HMR ใน dev — ส่ง upgrade ที่ไม่ใช่ /vscode ต่อให้มัน
  const nextUpgrade = (
    app as unknown as {
      getUpgradeHandler?: () => (req: IncomingMessage, socket: unknown, head: Buffer) => void;
    }
  ).getUpgradeHandler?.();

  server.on("upgrade", (req, socket, head) => {
    const pathname = new URL(req.url ?? "/", `http://${HOST}:${PORT}`).pathname;
    if (isVscodePath(pathname)) {
      req.url = stripBase(req.url);
      proxy.ws(req, socket, head);
      return;
    }
    if (nextUpgrade) nextUpgrade(req, socket, head);
    else socket.destroy();
  });

  // R6: bind loopback เท่านั้น
  server.listen(PORT, HOST, () => {
    console.log(`> Code Office ready on http://${HOST}:${PORT} (${dev ? "dev" : "production"})`);
  });

  const shutdown = async () => {
    await vscodeManager.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
});
