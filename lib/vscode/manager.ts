import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import {
  CLAUDE_BIN,
  VSCODE_BIN,
  VSCODE_EXT_DIR,
  VSCODE_HOST,
  VSCODE_PORT,
  VSCODE_USER_DIR,
  WORKSPACE_DIR,
} from "../config";

/**
 * จัดการ process ของ code-server (VS Code จริง) — รัน loopback บนพอร์ตภายใน
 * แล้วให้ server.ts reverse-proxy /vscode/ มาที่นี่ (same-origin)
 *
 * ใช้ใน server.ts (custom server) เท่านั้น — singleton ระดับ module
 */
class VSCodeManager {
  private proc?: ChildProcess;
  private starting?: Promise<void>;
  private ready = false;

  /** เตรียม workspace + tasks.json (auto-run claude) + user settings ของ code-server */
  private async ensureWorkspace(): Promise<void> {
    const vscodeDir = path.join(WORKSPACE_DIR, ".vscode");
    await fs.mkdir(vscodeDir, { recursive: true });

    // auto-run `claude` ใน integrated terminal เมื่อเปิด folder
    const tasks = {
      version: "2.0.0",
      tasks: [
        {
          label: "claude",
          type: "shell",
          command: CLAUDE_BIN,
          runOptions: { runOn: "folderOpen" },
          presentation: {
            reveal: "always",
            panel: "dedicated",
            focus: true,
            clear: false,
          },
          problemMatcher: [],
        },
      ],
    };
    await fs.writeFile(
      path.join(vscodeDir, "tasks.json"),
      JSON.stringify(tasks, null, 2),
      "utf8",
    );

    // user settings: ปิด workspace trust + อนุญาต automatic task (ไม่งั้น prompt ค้างตอนเปิด)
    const userDir = path.join(VSCODE_USER_DIR, "User");
    await fs.mkdir(userDir, { recursive: true });
    const settingsFile = path.join(userDir, "settings.json");
    try {
      await fs.access(settingsFile); // มีแล้วไม่ทับ (ผู้ใช้อาจแก้เอง)
    } catch {
      const settings = {
        "security.workspace.trust.enabled": false,
        "task.allowAutomaticTasks": "on",
        "workbench.startupEditor": "none",
        "telemetry.telemetryLevel": "off",
        "workbench.colorTheme": "Default Dark Modern",
      };
      await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2), "utf8");
    }
  }

  async start(): Promise<void> {
    if (this.ready) return;
    if (this.starting) return this.starting;
    this.starting = this.doStart();
    try {
      await this.starting;
    } finally {
      this.starting = undefined;
    }
  }

  private async doStart(): Promise<void> {
    // binary ต้องมี (ดาวน์โหลดไว้ใน vendor/ ตอน setup)
    try {
      await fs.access(VSCODE_BIN);
    } catch {
      throw new Error(
        `code-server binary not found at ${VSCODE_BIN} — รัน "npm run setup:vscode" ก่อน`,
      );
    }
    await this.ensureWorkspace();
    await fs.mkdir(VSCODE_EXT_DIR, { recursive: true });

    const args = [
      "--bind-addr", `${VSCODE_HOST}:${VSCODE_PORT}`,
      "--auth", "none", // R6: กันด้วยการ bind loopback + proxy same-origin แทน
      "--disable-telemetry",
      "--disable-update-check",
      "--disable-workspace-trust",
      // browser อยู่ที่ localhost:3000 แต่ proxy ไปหา code-server — ปิด origin check ของ host หน้าบ้าน
      "--trusted-origins", "localhost:3000,127.0.0.1:3000",
      "--user-data-dir", VSCODE_USER_DIR,
      "--extensions-dir", VSCODE_EXT_DIR,
      "--app-name", "Code Office",
      WORKSPACE_DIR,
    ];

    this.proc = spawn(VSCODE_BIN, args, {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.proc.stdout?.on("data", (d) => process.stdout.write(`[code-server] ${d}`));
    this.proc.stderr?.on("data", (d) => process.stderr.write(`[code-server] ${d}`));
    this.proc.on("exit", (code) => {
      console.log(`[code-server] exited (code ${code})`);
      this.proc = undefined;
      this.ready = false;
    });

    await this.waitHealthy();
    this.ready = true;
  }

  /** poll จน code-server ตอบ HTTP (สูงสุด ~30 วิ) */
  private waitHealthy(): Promise<void> {
    const deadline = Date.now() + 30_000;
    return new Promise((resolve, reject) => {
      const tick = () => {
        const req = http.get(
          { host: VSCODE_HOST, port: VSCODE_PORT, path: "/", timeout: 2000 },
          (res) => {
            res.resume();
            if (res.statusCode && res.statusCode < 500) resolve();
            else retry();
          },
        );
        req.on("error", retry);
        req.on("timeout", () => {
          req.destroy();
          retry();
        });
      };
      const retry = () => {
        if (!this.proc) return reject(new Error("code-server exited during startup"));
        if (Date.now() > deadline) return reject(new Error("code-server health check timed out"));
        setTimeout(tick, 500);
      };
      tick();
    });
  }

  isReady(): boolean {
    return this.ready;
  }

  async stop(): Promise<void> {
    this.proc?.kill();
    this.proc = undefined;
    this.ready = false;
  }
}

export const vscodeManager = new VSCodeManager();
