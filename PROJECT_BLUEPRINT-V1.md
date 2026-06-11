# Project Blueprint — Code Office (PTY Terminal Core)

> เว็บคอนโซลรันบน **localhost เท่านั้น** — ฝัง **terminal จริงของ Claude Code** (interactive ผ่าน PTY)
> ไว้ในเบราว์เซอร์ด้วย xterm.js ให้เหมือนนั่งใช้ Claude Code ใน terminal ทุกประการ
> พร้อม file browser ทั้งเครื่อง + คัดลอก path + write guard เฉพาะไฟล์ที่เลือก + บันทึกประวัติแชทเป็นไฟล์

เอกสารนี้เป็น *blueprint สรุปเฉพาะที่จำเป็น* เพื่อให้รีวิวก่อนเริ่ม implement
สถานะ: **ยังไม่ implement**

---

## 0. ทำไมใช้ PTY interactive (ไม่ใช้ `claude -p`)

| ประเด็น | `claude -p` + stream-json | PTY interactive (เลือกแบบนี้) |
|---|---|---|
| **Billing (เหตุผลหลัก)** | ตั้งแต่ **15 มิ.ย. 2026** การรัน `claude -p` บนแผน Pro/Max หักจาก **เครดิต Agent SDK รายเดือน** ($20/Pro, $100–200/Max) หมดแล้วคิดราคา API | โหมด interactive (ไม่มี `-p`) นับเป็น **quota ปกติของ subscription** เหมือนใช้ใน terminal — เกณฑ์แบ่งคือ flag `-p` ไม่ใช่สภาพแวดล้อมที่รัน |
| ประสบการณ์ใช้งาน | Chat UI จำลอง ไม่มี TUI/slash command/permission prompt แบบ realtime | **Claude Code ตัวจริง 100%** — slash commands, `@file` autocomplete, permission prompt ตอบในจอได้เลย |
| โปรเซส | spawn ใหม่ทุกเทิร์น + `--resume` (มี cold start) | โปรเซสเดียวค้างตลอด session |
| ข้อแลกเปลี่ยน | ได้ structured event stream | ไม่มี structured event → chat UI แบบแยก component เป็นออปชันภายหลัง (Phase 5) |

หมายเหตุ: R5 write guard ใช้ `PreToolUse` hook ผูกผ่าน `--settings` ซึ่งทำงานในโหมด interactive ได้ปกติ /
R4 ใช้ transcript JSONL ที่ Claude Code เก็บเองที่ `~/.claude/projects/` เป็น source of truth

---

## 1. เป้าหมาย (Requirements ที่ตกลงแล้ว)

| # | ความต้องการ | สรุปที่ยืนยันแล้ว |
|---|---|---|
| R1 | เข้าถึง/list ไฟล์ทั้งเครื่อง | Browse ได้ตั้งแต่ root `/` แบบ lazy (เปิดทีละโฟลเดอร์) |
| R2 | ปุ่มคัดลอก path | คัดลอก absolute path ลง clipboard และ/หรือ inject เข้า terminal |
| R3 | เชื่อม Claude Code | **Spawn `claude` interactive ใน PTY (`node-pty`) → render terminal จริงในเบราว์เซอร์ด้วย xterm.js ผ่าน WebSocket** |
| R4 | บันทึกประวัติแชท | กำหนด `--session-id` เอง → อ่าน JSONL ของ Claude Code ที่ `~/.claude/projects/` → export เป็น Markdown ลง `data/` |
| R5 | แก้ไขเฉพาะไฟล์ที่เลือก | อ่านได้ทั้งเครื่อง แต่ **เขียน/แก้ได้เฉพาะไฟล์ใน allow-list ของ session** (PreToolUse hook) |
| R6 | ความปลอดภัย | bind `127.0.0.1` เท่านั้น, ไม่เปิดออกเครือข่าย |

ขอบเขตชัดเจน: **อ่าน = ทั้งเครื่อง, เขียน = เฉพาะที่เลือก** — ไฟล์ที่ไม่ได้เลือกจะไม่ถูกแตะ

---

## 2. Tech Stack

**เลือก: Next.js + custom server (กระบวนการเดียว)** — PTY ต้องการ stream สองทางแบบ realtime
(keystroke ขาเข้า + output ขาออก + resize) ซึ่ง Route Handler ของ Next.js ไม่รองรับ WebSocket
→ ใช้ **custom server** (`server.ts`: `http.createServer` + Next handler + `ws` upgrade) ในโปรเซสเดียว

| ชั้น | เทคโนโลยี | เหตุผล |
|---|---|---|
| UI | Next.js 16 App Router + React 19 | scaffold เดิม (อ่านคู่มือใน `node_modules/next/dist/docs/` ก่อนเขียนโค้ด — เวอร์ชันนี้มี breaking changes) |
| Styling | Tailwind CSS 4 | ติดตั้งแล้ว |
| Terminal UI | **`@xterm/xterm` + `@xterm/addon-fit`** | มาตรฐาน de facto สำหรับ terminal ในเบราว์เซอร์ |
| Transport terminal | **WebSocket (`ws`) บน custom server** path `/ws/term` | สองทาง realtime; SSE ใช้ไม่ได้กับ keystroke ขาเข้า |
| REST อื่นๆ (fs/history/session) | Route Handlers | งาน request/response ปกติ |
| รัน Claude | **`node-pty`** spawn `claude` (interactive, **ไม่ใส่ `-p`**) | ได้ TUI จริง + billing เป็น quota ปกติ |
| State | `SessionManager` singleton ถือ PTY ต่อ session | ถือโปรเซสข้าม request ในโปรเซสเดียวของ server |
| เก็บข้อมูล | JSONL ของ Claude Code (`~/.claude/projects/`) เป็น source of truth + export `.md` ลง `data/` | ตาม R4 ไม่ต้องมี DB |

**ข้อควรระวัง:**
- `node-pty` เป็น native module — ต้อง rebuild ตามเวอร์ชัน Node ที่ใช้รัน (`npm rebuild node-pty`)
- `next dev` hot-reload ทำ PTY ที่ค้างหลุดได้ — โหมดหลักคือ build แล้วรัน `node server.js`
- ตั้ง `TERM=xterm-256color` ใน env ของ PTY และส่ง resize (`cols`/`rows`) จาก addon-fit ทุกครั้งที่หน้าต่างเปลี่ยนขนาด มิฉะนั้น TUI จะเพี้ยน

---

## 3. สถาปัตยกรรมระดับสูง

```
┌────────────────────────── Browser (localhost:3000) ──────────────────────────┐
│  [File Tree Panel]      [Terminal Panel (xterm.js)]   [History Panel]         │
│   - lazy browse /        - Claude Code TUI จริง        - รายการ session        │
│   - ปุ่ม Copy Path        - พิมพ์/ตอบ permission ในจอ   - เปิดดู .md ย้อนหลัง   │
│   - เลือกเข้า allow-list   - ปุ่มไฟล์ → inject path      │                      │
└───────┬──────────────────────┬───────────────────────────┬───────────────────┘
        │ fetch (REST)         │ WebSocket /ws/term         │ fetch
        │                      │ (keystrokes ⇅ output,      │
        ▼                      │  resize)                   ▼
┌──────────────────── server.ts (custom server, 127.0.0.1) ────────────────────┐
│  Next handler: /api/fs/*  /api/session/*  /api/history/*                      │
│        │                       │                                              │
│        ▼                       ▼                                              │
│  FsService              SessionManager ──node-pty──► `claude --session-id U \ │
│  (read-only,             (ถือ PTY, allow-list,          --add-dir / ...`      │
│   path-guard)             lifecycle)                        │                 │
│                                │                            │ PreToolUse hook │
│                                │◄───────────────────────────┤ เช็ค allow-list │
│                          TranscriptExporter                 │ ก่อน Edit/Write │
│                          (อ่าน ~/.claude/projects/          ▼                 │
│                           <cwd>/<U>.jsonl → .md)   ไฟล์ในเครื่อง (อ่านทั้งระบบ│
└──────────────────────────────────────────────────  / เขียนเฉพาะ allow-list)  ┘
```

---

## 4. โครงสร้างโค้ด (Project Code Structure)

```
code-office/
├── server.ts                       # custom server: http + Next handler + ws upgrade (/ws/term)
├── app/
│   ├── layout.tsx / page.tsx       # หน้าหลัก: 3-panel (FileTree | Terminal | History)
│   ├── globals.css
│   │
│   └── api/                        # ── Backend (Route Handlers) ──
│       ├── fs/
│       │   ├── list/route.ts       # GET ?path=...  → list ไฟล์/โฟลเดอร์ (lazy, read-only)
│       │   └── read/route.ts       # GET ?path=...  → อ่านเนื้อไฟล์ (เพื่อ preview)
│       ├── session/
│       │   ├── start/route.ts      # POST {allowFiles[], resumeId?} → spawn PTY, คืน {sessionId}
│       │   ├── stop/route.ts       # POST → ปิด PTY + trigger export ประวัติ
│       │   └── allowlist/route.ts  # POST → เพิ่ม/ลบไฟล์ใน allowlist.txt กลาง session (มีผลทันที)
│       └── history/
│           ├── list/route.ts       # GET → รายการ session ที่เซฟไว้
│           └── get/route.ts        # GET ?id=... → เนื้อหา transcript (.md)
│
├── lib/                            # ── โดเมนลอจิก (เทสได้แยกจาก HTTP) ──
│   ├── fs/
│   │   ├── browse.ts               # อ่านไดเรกทอรี + metadata (size/mtime/type)
│   │   └── path-guard.ts           # normalize/กัน traversal; แยกสิทธิ์ READ vs WRITE
│   ├── claude/
│   │   ├── session-manager.ts      # singleton: สร้าง/ถือ/ปิด PTY ต่อ session; ต่อ ws ↔ pty
│   │   ├── spawn.ts                # ประกอบ argv ของ `claude` (interactive) + env + cwd
│   │   ├── transcript-locator.ts   # หา path JSONL จาก cwd+sessionId ใน ~/.claude/projects/
│   │   └── permission-hook.ts      # เขียน allowlist.txt + settings ต่อ session
│   ├── history/
│   │   ├── export.ts               # อ่าน JSONL ของ Claude Code → transcript.md + index
│   │   └── format.ts               # แปลง event → Markdown สรุป
│   └── config.ts                   # ค่าคงที่: HOST=127.0.0.1, paths, ขนาดสูงสุด ฯลฯ
│
├── components/
│   ├── file-tree/
│   │   ├── FileTree.tsx            # tree แบบ lazy expand จาก /
│   │   ├── FileNode.tsx            # แถวไฟล์/โฟลเดอร์ + ปุ่ม Copy Path + เช็คบ็อกซ์เลือก
│   │   └── useFileTree.ts          # โหลด/แคชเนื้อโฟลเดอร์
│   ├── terminal/
│   │   ├── TerminalPanel.tsx       # xterm.js + addon-fit + toolbar (New/Stop/Export)
│   │   └── useTerminalSocket.ts    # ต่อ ws: onData→send, onMessage→term.write, observe resize
│   ├── history/
│   │   └── HistoryPanel.tsx        # รายการ + viewer ของ transcript ที่เซฟ
│   └── ui/                         # shadcn primitives (button, scroll-area, ...)
│
├── claude-hooks/
│   └── enforce-write-allowlist.sh  # PreToolUse hook: บล็อก Edit/Write นอก allow-list
│
├── data/                           # ผลลัพธ์รันไทม์ (gitignore)
│   ├── sessions/<id>/meta.json     # { id, title, createdAt, cwd, jsonlPath }
│   ├── sessions/<id>/transcript.md # export จาก JSONL ของ Claude Code
│   ├── sessions/<id>/allowlist.txt # ไฟล์ที่ session นี้แก้ได้ (hook อ่านไฟล์นี้)
│   └── index.json                  # ดัชนี session ทั้งหมด
│
└── PROJECT_BLUEPRINT.md            # เอกสารนี้
```

---

## 5. โฟลว์การทำงานหลัก

### 5.1 Browse + Copy Path (R1, R2)
1. UI เรียก `GET /api/fs/list?path=/` → `lib/fs/browse.ts` คืนรายการ (ชื่อ, type, size, mtime)
2. กดโฟลเดอร์ = เรียก `list` ต่อแบบ lazy (ไม่ดึงทั้งเครื่องทีเดียว)
3. ปุ่ม **Copy Path** → คัดลอก absolute path
4. ปุ่ม **เลือกไฟล์นี้** → `POST /api/session/allowlist` (เข้า allow-list ทันที) + inject path เป็นข้อความลงใน terminal ที่ตำแหน่ง cursor (พฤติกรรมเดียวกับลากไฟล์ลง Terminal.app)

### 5.2 Terminal session (R3, R5)
1. ผู้ใช้กด **New Session** (เลือกไฟล์เริ่มต้นได้) → `POST /api/session/start { allowFiles[], resumeId? }`
2. `SessionManager`:
   - gen `sessionId` (UUID) เอง → เขียน `data/sessions/<id>/allowlist.txt` + settings ของ session
   - spawn ผ่าน **node-pty**:
     ```
     claude --session-id <UUID> \
       --add-dir / \                    # อ่านได้ทั้งเครื่อง
       --permission-mode acceptEdits \  # edit ที่ผ่าน hook ไม่ต้องถามซ้ำ
       --settings <session-settings.json>   # ผูก PreToolUse hook + permissions.deny
       [--resume <UUID-เดิม>]           # เปิด session เก่าต่อ
     ```
     **ไม่มี `-p`** — โหมด interactive, env มี `TERM=xterm-256color`, cwd = workspace กลาง
   - การกำหนด `--session-id` เองทำให้รู้ตำแหน่ง transcript ล่วงหน้า:
     `~/.claude/projects/<cwd ที่ encode แล้ว>/<UUID>.jsonl`
3. UI เปิด WebSocket `/ws/term?sessionId=<id>`:
   - `xterm.onData` (keystroke) → ws → `pty.write()`
   - `pty.onData` (output) → ws → `term.write()`
   - resize (addon-fit) → ws `{type:"resize", cols, rows}` → `pty.resize()`
4. Permission prompt ของ Claude Code **แสดงใน terminal และผู้ใช้ตอบในจอได้เลย** (y/n/เลือกตัวเลือก)

### 5.3 บันทึกประวัติ (R4)
- Claude Code เขียน transcript JSONL ของตัวเองตลอด session ที่ `~/.claude/projects/<encoded-cwd>/<UUID>.jsonl` — ใช้เป็น **source of truth**
- เมื่อกด **Export** หรือปิด session (`POST /api/session/stop` หรือ PTY exit):
  `lib/history/export.ts` อ่าน JSONL → แปลงด้วย `format.ts` → `data/sessions/<id>/transcript.md` + อัปเดต `index.json`
- ใช้ `claude --resume <UUID>` เปิด session เก่ากลับมาคุยต่อใน terminal ได้ตรงๆ

---

## 6. โมเดลความปลอดภัย (Security Model)

| ภัย | การป้องกัน |
|---|---|
| เปิดออกเครือข่าย | bind `127.0.0.1` เท่านั้น (`server.ts` listen เฉพาะ loopback), ws ตรวจ `Origin` เป็น `http://localhost:3000` |
| Path traversal ตอนอ่าน | `path-guard.ts` normalize + ตรวจ symlink; ทุก path เป็น absolute ที่ผ่านการ resolve |
| แก้ไฟล์นอกขอบเขต (R5) | **PreToolUse hook** เช็ค target ของ `Edit`/`Write`/Bash-mutating กับ `allowlist.txt`; ไม่อยู่ในลิสต์ → exit 2 (block) — ผูกผ่าน `--settings` ทำงานในโหมด interactive ได้ปกติ |
| ลบ/เขียนทับโดยไม่ตั้งใจ | hook เป็น *deny-by-default* สำหรับ write; READ อนุญาตกว้าง |
| รั่ว credential | ใช้ login เดิมของเครื่อง (subscription) ไม่ต้องใส่ API key; PTY สืบทอด credential ที่ cache ไว้ |
| **Billing** | โหมด interactive นับ **quota ปกติ** ของ Pro/Max — **ห้ามใช้ `claude -p`** ใน path ใดๆ ของแอป (เช่น script ภายใน) เพราะจะหักเครดิต Agent SDK รายเดือนแทน (นโยบายมีผล 15 มิ.ย. 2026) |

**กลไกบังคับ "แก้เฉพาะที่เลือก" (สำคัญสุด):**
- `PreToolUse` hook อ่าน `allowlist.txt` แบบไดนามิกต่อ session (`claude-hooks/enforce-write-allowlist.sh`)
- เสริมด้วย `permissions.deny` ใน settings สำหรับ path อ่อนไหว (`.env*`, `.git/**`, credential)
- `--permission-mode acceptEdits` ลด prompt สำหรับไฟล์ใน allow-list — การกรองจริงอยู่ที่ hook
- ข้อดีของโหมด interactive: ถ้า hook block, ข้อความ block จะแสดงใน terminal ให้ผู้ใช้เห็นทันที
  และถ้าอยากอนุญาตเพิ่มก็กด "เลือกไฟล์นี้" ใน FileTree (มีผลทันที — hook อ่านไฟล์ใหม่ทุกครั้ง)

ตัวอย่าง hook (สาระสำคัญ):
```bash
#!/bin/bash
# stdin = JSON ของ tool call; ดึง tool_name + file path ออกมา
case "$TOOL_NAME" in
  Edit|Write|NotebookEdit)
    grep -qxF "$FILE_PATH" "$ALLOWLIST_FILE" && exit 0   # อยู่ในลิสต์ = อนุญาต
    echo '{"decision":"block","reason":"file not in session allow-list"}' >&2
    exit 2 ;;                                            # ไม่อยู่ = บล็อก
  *) exit 0 ;;                                           # tool อื่น (Read ฯลฯ) ผ่าน
esac
```

---

## 7. การจัดการ Permission

- โหมด interactive ทำให้ **permission prompt แสดงใน TUI และตอบในจอได้โดยตรง** — ไม่ต้องมี API ตอบ permission แยก
- `/api/session/allowlist` ใช้สำหรับเพิ่ม/ลบไฟล์เข้า write allow-list ผ่าน UI (มีผลทันทีกับเทิร์นถัดไป)
- ลำดับการกรอง write: `permissions.deny` (path อ่อนไหว) → `PreToolUse` hook (allow-list) →
  ถ้าผ่านทั้งคู่และเป็นไฟล์ใน allow-list → `acceptEdits` ไม่ถามซ้ำ

---

## 8. โมเดลข้อมูลประวัติแชท (R4)

```
~/.claude/projects/<encoded-cwd>/<UUID>.jsonl   # source of truth (Claude Code เขียนเอง)
                      │
                      ▼ export (จบ session / กดปุ่ม)
data/sessions/<sessionId>/
├── meta.json        # { id, title, createdAt, cwd, jsonlPath, model }
├── transcript.md    # สรุปอ่านง่าย: user / assistant / tool calls / files changed
└── allowlist.txt    # absolute path ที่ session นี้แก้ได้
data/index.json      # [{ id, title, createdAt, lastTurnAt }] สำหรับ History panel
```

`transcript.md` (รูปแบบ):
```markdown
# Session <id> — <title>
- created: 2026-06-10T...   model: ...
## Turn 1
**User:** ...
**Assistant:** ...
**Tools:** Edit(/path/a.ts), Read(/path/b.ts)
**Files changed:** /path/a.ts
```

หมายเหตุ: ถ้าต้องการสำเนา raw เพื่อ portability ให้ copy ไฟล์ JSONL ต้นทางมาไว้ใน
`data/sessions/<id>/` ตอน export

---

## 9. แผนเป็นเฟส

| Phase | ขอบเขต | ผลลัพธ์ |
|---|---|---|
| **0 Blueprint** | เอกสารนี้ | ✅ |
| **1 File browser** | `/api/fs/*` + FileTree + Copy Path + เลือกไฟล์ | browse ทั้งเครื่อง, คัดลอก/เลือกได้ |
| **2 Custom server + PTY core** | `server.ts` (http + Next + ws) + `node-pty` + `SessionManager` + `/api/session/*` | spawn Claude Code interactive ได้ |
| **3 Terminal UI** | `TerminalPanel` (xterm.js + addon-fit) + `useTerminalSocket` + inject path จาก FileTree | ใช้ Claude Code ในเบราว์เซอร์ได้จริง |
| **4 Write guard** | PreToolUse hook + allow-list + ปุ่มเพิ่มไฟล์กลาง session | แก้เฉพาะไฟล์ที่เลือกได้จริง |
| **5 History** | `transcript-locator` + `export.ts` (JSONL → .md) + HistoryPanel + `--resume` | เซฟ/เปิดประวัติ + คุยต่อ session เก่า |
| **6 (ออปชัน)** | (a) chat UI แบบ structured ด้วย stream-json/Agent SDK — *ยอมรับว่าหักเครดิต Agent SDK*; (b) Electron/Tauri เพื่อลากไฟล์จาก Finder ได้ absolute path; (c) หลาย session ขนาน | — |

---

## 10. การตัดสินใจ (ตกลงแล้ว — implement ตามนี้ทั้งหมด)

1. ✅ **cwd ของ `claude`** = `code-office/data/workspace` + `--add-dir /` เพื่ออ่านทั้งเครื่อง
2. ✅ **ขอบเขต "แก้ไฟล์"** = รวม Bash ที่เขียน/ลบไฟล์ — hook deny pattern เช่น `rm`/`mv`/`sed -i`/redirect `>`
3. ✅ **ที่เก็บประวัติ** = `code-office/data/` (gitignored)
4. ✅ **คอนเคอร์เรนซี** = ทีละ 1 session (1 PTY) ออกแบบ SessionManager ให้ขยายได้
5. ✅ **ไฟล์ซ่อน/ระบบ** = แสดงทั้งหมด (`SHOW_HIDDEN = true`) ไม่กรอง
6. ✅ **ห้ามใช้ `-p` ใน path หลัก** — ทุกการเรียก `claude` ของแอปต้องเป็น interactive เพื่อให้นับ quota ปกติ
7. ✅ **กำหนด `--session-id` (UUID) เองทุกครั้ง** — เพื่อ map ไปยัง JSONL transcript ได้แน่นอน
8. ✅ **"เลือกไฟล์นี้" ทำ 2 อย่างพร้อมกัน**: เพิ่มเข้า allow-list + inject path ลง terminal ที่ cursor
9. ✅ **โหมดรันหลัก** = `npm run build && node server.js` (bind `127.0.0.1`) — ไม่ใช้ `next dev` กับ PTY

---

## 11. สถานะการ Implement

- ⬜ Phase 1 File browser (`/api/fs/*` + FileTree)
- ⬜ Phase 2 custom server + node-pty + SessionManager
- ⬜ Phase 3 TerminalPanel (xterm.js) + inject path
- ⬜ Phase 4 write-guard (hook + allow-list)
- ⬜ Phase 5 history export จาก `~/.claude/projects/`
