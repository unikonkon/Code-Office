/**
 * แปลง transcript JSONL ของ Claude Code (~/.claude/projects/...) → Markdown สรุป
 * Parser เขียนแบบ tolerant: บรรทัดที่รูปแบบไม่ตรงคาดจะถูกข้าม ไม่ทำให้ export ล้ม
 */

type Turn = {
  user: string[];
  assistant: string[];
  tools: string[];
  filesChanged: Set<string>;
};

const WRITE_TOOLS = new Set(["Edit", "Write", "NotebookEdit", "MultiEdit"]);

export type TranscriptMeta = {
  id: string;
  title: string;
  createdAt: string;
  model?: string;
};

export function formatTranscript(jsonlRaw: string, meta: TranscriptMeta): string {
  const turns: Turn[] = [];
  let current: Turn | null = null;
  let model: string | undefined = meta.model;

  const newTurn = (): Turn => {
    const t: Turn = { user: [], assistant: [], tools: [], filesChanged: new Set() };
    turns.push(t);
    return t;
  };

  for (const line of jsonlRaw.split("\n")) {
    if (!line.trim()) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const type = entry.type as string;
    const message = entry.message as
      | { role?: string; model?: string; content?: unknown }
      | undefined;
    if (!message) continue;

    if (type === "user") {
      const texts = extractText(message.content);
      if (texts.length === 0) continue; // tool_result ล้วนๆ — ไม่ใช่ข้อความผู้ใช้จริง
      current = newTurn();
      current.user.push(...texts);
    } else if (type === "assistant") {
      if (message.model) model = message.model;
      if (!current) current = newTurn();
      current.assistant.push(...extractText(message.content));
      for (const tu of extractToolUses(message.content)) {
        const target = tu.filePath ? `(${tu.filePath})` : "";
        current.tools.push(`${tu.name}${target}`);
        if (WRITE_TOOLS.has(tu.name) && tu.filePath) {
          current.filesChanged.add(tu.filePath);
        }
      }
    }
  }

  const lines: string[] = [
    `# Session ${meta.id} — ${meta.title}`,
    `- created: ${meta.createdAt}   model: ${model ?? "unknown"}`,
    "",
  ];
  turns.forEach((t, i) => {
    lines.push(`## Turn ${i + 1}`);
    if (t.user.length) lines.push(`**User:** ${t.user.join("\n\n")}`);
    if (t.assistant.length) lines.push(`**Assistant:** ${t.assistant.join("\n\n")}`);
    if (t.tools.length) lines.push(`**Tools:** ${t.tools.join(", ")}`);
    if (t.filesChanged.size)
      lines.push(`**Files changed:** ${[...t.filesChanged].join(", ")}`);
    lines.push("");
  });
  return lines.join("\n");
}

function extractText(content: unknown): string[] {
  if (typeof content === "string") return content.trim() ? [content.trim()] : [];
  if (!Array.isArray(content)) return [];
  const out: string[] = [];
  for (const block of content) {
    if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
      const text = (block as { text?: string }).text?.trim();
      if (text) out.push(text);
    }
  }
  return out;
}

function extractToolUses(content: unknown): { name: string; filePath?: string }[] {
  if (!Array.isArray(content)) return [];
  const out: { name: string; filePath?: string }[] = [];
  for (const block of content) {
    if (block && typeof block === "object" && (block as { type?: string }).type === "tool_use") {
      const b = block as { name?: string; input?: { file_path?: string; notebook_path?: string } };
      if (!b.name) continue;
      out.push({ name: b.name, filePath: b.input?.file_path ?? b.input?.notebook_path });
    }
  }
  return out;
}
