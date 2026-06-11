# Code Office — เอกสารสรุปภาพรวม

อัปเดต: 2026-06-11 · สถานะ: **implement แล้ว + ทดสอบ end-to-end ผ่าน**

---

## 1. โปรเจกต์นี้คืออะไร

เว็บคอนโซลรันบน **localhost เท่านั้น** ที่ฝัง **VS Code จริง (code-server)** ไว้ในเบราว์เซอร์
ผ่าน iframe แบบ same-origin โดยเปิด `claude` (Claude Code CLI) ใน integrated terminal ของ
VS Code ให้อัตโนมัติ — ได้ประสบการณ์ editor + terminal + file explorer ครบของ VS Code
พร้อม panel แสดงประวัติแชทของ Claude

**เป้าหมายเดิม (จาก requirement):** ขับ Claude Code ผ่านเว็บให้เหมือนนั่งใช้ terminal จริง
+ จัดการไฟล์ + เก็บประวัติ โดยใช้ login เดิม (subscription) ไม่ต้องใส่ API key

---

## 2. เส้นทางการตัดสินใจ (ทำไมจึงมาจบที่ VS Code embed)

โปรเจกต์ผ่านการพิจารณา 3 สถาปัตยกรรม เรียงตามลำดับเวลา:

### v1 — `claude -p` + stream-json + SSE (เคยทำ แล้วเลิก)
- Backend spawn `claude -p` ส่ง prompt ทีละเทิร์น แล้ว parse NDJSON มาทำ chat UI เอง
- **ปัญหา billing:** ตั้งแต่ **15 มิ.ย. 2026** การรัน `claude -p` บนแผน Pro/Max หักจาก
  **เครดิต Agent SDK รายเดือน** ($20/Pro, $100–200/Max) ไม่ใช่ quota ปกติ → ไม่คุ้ม
- ไม่ใช่ terminal จริง (เป็น chat UI จำลอง)

### v2 — PTY + xterm.js (interactive Claude Code จริง)
- spawn `claude` **interactive** (ไม่มี `-p`) ผ่าน `node-pty` แล้ว render ด้วย `xterm.js`
- **billing นับ quota ปกติ** (เกณฑ์แบ่งคือ flag `-p` ไม่ใช่สภาพแวดล้อม)
- xterm.js + node-pty = **engine เดียวกับ VS Code integrated terminal** (ของ Microsoft/VS Code team)
- มี **write guard (R5)**: PreToolUse hook คุมให้ claude แก้ได้เฉพาะไฟล์ใน allow-list
- ทำครบ + ทดสอบผ่าน (รวมพิสูจน์ write guard บล็อกไฟล์นอกขอบเขตได้จริง)

### v3 — ฝัง VS Code จริง (code-server) ใน iframe ← **ปัจจุบัน**
- ผู้ใช้ต้องการ "เปิด Claude Code ผ่าน terminal ของ VS Code จริง" ไม่ใช่สร้าง terminal เอง
- ตัดสินใจ: ฝัง VS Code เต็มตัว, **ยอมทิ้ง write guard**, เชื่อมแบบ reverse-proxy same-origin
- **ข้อจำกัดที่เจอ:** openvscode-server (ตัวที่ตั้งใจ) **ไม่มี build สำหรับ macOS** →
  สลับเป็น **code-server** (Coder, MIT เหมือนกัน, ได้ VS Code จริงเหมือนกัน, subpath ดีกว่า)

> **ข้อเท็จจริงสำคัญ:** ทั้ง v2 และ v3 ใช้ "terminal ของ VS Code" เหมือนกัน เพราะ xterm.js+node-pty
> คือ engine ของ VS Code อยู่แล้ว สิ่งที่ v3 เพิ่มคือ **editor + extension** ของ VS Code (ซึ่งแลกด้วย
> RAM ~10 เท่า และเสีย write guard) — ไม่ใช่ terminal ที่ "จริงกว่า"

---

## 3. สถาปัตยกรรมปัจจุบัน (v3)

```
┌─ Browser localhost:3000 ─────────────────────────────────────┐
│  Next.js (Workspace UI)                                       │
│  ┌────────────────────────────────┬──────────────────────┐  │
│  │  <iframe src="/vscode/">        │  History panel       │  │
│  │  = VS Code จริง (code-server)   │  (พับเก็บได้)         │  │
│  │  Explorer+Editor+Terminal       │  อ่าน transcript     │  │
│  │  → auto-run `claude`            │  ของ claude          │  │
│  └────────────────────────────────┴──────────────────────┘  │
└───────┬───────────────────────┬──────────────────────────────┘
        │ /vscode/* (HTTP+WS)   │ /api/history
        ▼                       ▼
┌─ server.ts (custom server, 127.0.0.1:3000) ──────────────────┐
│  reverse-proxy /vscode/  ──strip prefix + rewrite Origin──┐  │
│  Next handler  + /api/history (อ่านไฟล์)                  │  │
└───────────────────────────────────────────────────────────┼──┘
                                                             ▼
                              code-server (VS Code) 127.0.0.1:3001
                              --auth none, เปิด data/workspace
                              .vscode/tasks.json → รัน claude
                                          │
                                          ▼
                          ~/.claude/projects/<workspace>/*.jsonl
                          (transcript → History panel อ่านมาแปลง .md)
```

### กลไกสำคัญ 2 จุด (เคล็ดที่ทำให้ embed สำเร็จ)
1. **Strip prefix proxy ได้** เพราะ code-server ใช้ **relative asset paths** (`./_static/…`,
   `stable-xxx/static/…`) — `/vscode/foo` → strip → code-server `/foo` ตรงๆ
2. **Rewrite Origin header** เป็น origin ของ code-server เอง → ผ่าน CSRF/WebSocket origin check
   (ถ้าไม่ทำ WS จะ hang up = editor/terminal ใช้ไม่ได้)

---

## 4. โครงสร้างโค้ด

```
code-office/
├── server.ts                     # custom server: http + Next + http-proxy(/vscode/) + คุม code-server
├── app/
│   ├── page.tsx / layout.tsx     # หน้าหลัก = <Workspace/>
│   └── api/history/
│       ├── list/route.ts         # GET → list transcript ใน ~/.claude/projects/<workspace>
│       └── get/route.ts          # GET ?id= → transcript เป็น Markdown
├── components/
│   ├── Workspace.tsx             # layout: iframe VS Code + History panel
│   ├── vscode/VSCodePanel.tsx    # <iframe src="/vscode/">
│   └── history/HistoryPanel.tsx  # list + viewer ของ transcript
├── lib/
│   ├── config.ts                 # ค่าคงที่: HOST/PORT, VSCODE_*, paths
│   ├── vscode/manager.ts         # spawn/stop code-server + health check + เตรียม workspace/tasks.json
│   └── history/
│       ├── store.ts              # อ่าน/ลิสต์ JSONL ของ claude
│       └── format.ts             # JSONL → Markdown
├── scripts/setup-code-server.sh  # ดาวน์โหลด code-server (รองรับ mac/linux arm64/x64)
├── vendor/code-server/           # binary (gitignored)
└── data/                         # รันไทม์ (gitignored)
    ├── workspace/                # โฟลเดอร์ที่ VS Code เปิด + cwd ของ claude
    │   └── .vscode/tasks.json    # runOn:folderOpen → claude
    └── code-server/{user,ext}/   # user-data + extensions
```

**Dependencies (เหลือน้อย):** runtime = `http-proxy, next, react, react-dom`

---

## 5. การ map กับ Requirement เดิม

| Req | เดิม (v2 ตั้งใจไว้) | สถานะใน v3 (VS Code embed) |
|---|---|---|
| R1 file browser ทั้งเครื่อง | FileTree เอง | ใช้ Explorer ของ VS Code (scope = workspace) — *FileTree เดิมถูกตัด* |
| R2 copy path | ปุ่มเอง | VS Code มี "Copy Path" ในตัว |
| R3 terminal เชื่อม Claude | xterm.js | integrated terminal ของ VS Code (auto-run claude) ✅ |
| R4 บันทึกประวัติ | เซฟ .md เอง | History panel อ่าน JSONL ของ claude → .md ✅ |
| **R5 write guard** | hook คุม allow-list | ⚠️ **ถูกตัดทิ้ง** — VS Code ให้ผู้ใช้แก้ไฟล์ไหนก็ได้ |
| R6 localhost only | bind 127.0.0.1 | bind 127.0.0.1 ทั้ง Next + code-server ✅ |

---

## 6. การ build/รัน + ทดสอบที่ผ่าน

```bash
npm install
npm run setup:vscode      # ดาวน์โหลด code-server → vendor/ (ครั้งเดียว)
npm run build
npm start                  # 127.0.0.1:3000 (สตาร์ท code-server :3001 อัตโนมัติ)
```

**ผลทดสอบ end-to-end (ผ่านทั้งหมด):**
- Proxy HTTP: workbench HTML + `workbench.js` (16.7MB) + `manifest.json` ผ่าน `/vscode/` → 200
- Proxy WebSocket: **101 handshake สำเร็จ** (editor/terminal ของ VS Code ทำงาน)
- code-server lifecycle: สตาร์ท/health check/ปิด อัตโนมัติ; base RSS ~43MB
- History: ลิสต์ + แปลง JSONL → Markdown ได้
- `npm run build` + `eslint` สะอาด

---

## 7. ข้อแลกเปลี่ยน / สิ่งที่ต้องรู้

| ประเด็น | รายละเอียด |
|---|---|
| **ไม่มี write guard** | VS Code ให้ผู้ใช้แก้/รันไฟล์ไหนก็ได้ — เหมาะกับใช้คนเดียวบนเครื่องตัวเองเท่านั้น |
| **RAM** | base ~40MB แต่ขึ้นเป็น ~150–400MB เมื่อ editor + extension host โหลดเต็ม (โตตามขนาด workspace) |
| **Binary ใหญ่** | code-server ~515MB เมื่อแตกไฟล์ (gitignored, ต้อง `setup:vscode`) |
| **Billing** | claude รัน interactive ใน VS Code terminal → นับ quota subscription ปกติ (อย่าใช้ `-p`) |
| **ToS** | ใช้ subscription ส่วนตัวขับเว็บแบบ single-user/บนเครื่องตัวเองได้ — ห้ามทำ multi-user/เชิงพาณิชย์ |
| **macOS** | ต้องใช้ code-server (openvscode-server ไม่มี build mac) |

---

## 8. งานที่ต่อยอดได้ (ถ้าต้องการ)

- เปิด VS Code ที่ folder อื่นได้ (ปัจจุบัน fix ที่ `data/workspace/`)
- ปุ่ม "เปิด session เก่าต่อ" จาก History (claude `--resume <id>` ใน terminal)
- ถ้าต้องการ write guard กลับมา: ต้องกลับไปสาย v2 (PTY) หรือทำ VS Code extension เป็น bridge
- ถ้าจะ multi-user/แชร์: ต้องเพิ่ม auth (code-server `--auth password`) + ทบทวน ToS (ควรใช้ API key)
```
