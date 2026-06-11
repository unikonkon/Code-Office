import path from "node:path";
import os from "node:os";

export const HOST = "127.0.0.1";
export const PORT = parseInt(process.env.PORT || "3000", 10);

export const PROJECT_ROOT = process.cwd();
export const DATA_DIR = path.join(PROJECT_ROOT, "data");
// โฟลเดอร์ที่ VS Code เปิดให้ + cwd ของ claude (transcript เก็บใต้ ~/.claude/projects/<encoded>)
export const WORKSPACE_DIR = path.join(DATA_DIR, "workspace");

export const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
export const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

// ── code-server (VS Code จริงใน iframe) ──
export const VSCODE_BIN = path.join(PROJECT_ROOT, "vendor", "code-server", "bin", "code-server");
export const VSCODE_HOST = "127.0.0.1";
export const VSCODE_PORT = parseInt(process.env.VSCODE_PORT || "3001", 10);
// path ที่ฝัง VS Code (same-origin ผ่าน reverse proxy ใน server.ts)
export const VSCODE_BASE_PATH = "/vscode";
// แยก user-data/extensions ของ code-server ไว้ใน data/ (gitignored)
export const VSCODE_USER_DIR = path.join(DATA_DIR, "code-server", "user");
export const VSCODE_EXT_DIR = path.join(DATA_DIR, "code-server", "ext");
