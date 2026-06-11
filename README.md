# Code Office

เว็บคอนโซลรันบน **localhost เท่านั้น** — ฝัง **VS Code จริง (code-server)** ใน iframe แบบ same-origin
ผ่าน reverse-proxy `/vscode/` เปิด `claude` ใน integrated terminal ของ VS Code อัตโนมัติ
พร้อม panel ประวัติแชทของ Claude

> สถาปัตยกรรมเดิม (PTY + xterm.js + write guard) ถูกแทนด้วยการฝัง VS Code เต็มตัวตามที่ตกลง
> ผลคือได้ editor + terminal + explorer จริงของ VS Code — แต่ **ไม่มี write guard** (ผู้ใช้แก้ไฟล์ไหนก็ได้)

## ความต้องการ
- Node.js 20+ (ทดสอบบน 24)
- `claude` CLI ติดตั้งแล้วและ login (Pro/Max) — โหมด interactive ใน VS Code terminal นับ quota ปกติ
- `code-server` binary (ดาวน์โหลดครั้งเดียว — ดูด้านล่าง)

## ติดตั้ง + รัน
```bash
npm install
npm run setup:vscode      # ดาวน์โหลด code-server ลง vendor/ (ครั้งเดียว, ~150MB)
npm run build
npm start                  # bind 127.0.0.1:3000, สตาร์ท code-server ที่ 3001 อัตโนมัติ
```
เปิด http://127.0.0.1:3000

## โครงสร้าง
- **หลัก** — VS Code จริง (code-server) ใน iframe: Explorer + Editor + integrated terminal
  - เปิด workspace `data/workspace/` ให้อัตโนมัติ
  - `.vscode/tasks.json` (`runOn: folderOpen`) รัน `claude` ใน terminal ตอนเปิด
- **ขวา (พับได้)** — History panel: อ่าน transcript JSONL ที่ Claude เก็บที่ `~/.claude/projects/<workspace>/` แล้วแปลงเป็น Markdown

## สถาปัตยกรรม
```
browser localhost:3000
  ├── /            → Next.js (Workspace UI + iframe)
  ├── /vscode/*    → reverse-proxy (strip prefix, rewrite Origin) → code-server 127.0.0.1:3001
  │                   (รวม WebSocket upgrade — editor/terminal ของ VS Code)
  └── /api/history → อ่าน ~/.claude/projects/<workspace>/*.jsonl

server.ts (custom server): http + Next handler + http-proxy + spawn/stop code-server
```

จุดสำคัญของ proxy: code-server ใช้ **relative asset paths** จึง strip `/vscode` ส่งให้ root ได้ตรงๆ
และต้อง **rewrite Origin header** เป็น origin ของ code-server เอง เพื่อให้ผ่าน CSRF/WS origin check

## ความปลอดภัย (R6)
- Next + code-server bind `127.0.0.1` เท่านั้น, code-server `--auth none` (กันด้วย loopback + same-origin)
- ⚠️ ไม่มี write guard — VS Code ให้ผู้ใช้แก้/รันอะไรก็ได้เต็มที่

## ข้อมูลรันไทม์ (gitignored)
- `vendor/code-server/` — binary (จาก `npm run setup:vscode`)
- `data/workspace/` — โฟลเดอร์ที่ VS Code เปิด + cwd ของ claude
- `data/code-server/` — user-data + extensions ของ code-server
