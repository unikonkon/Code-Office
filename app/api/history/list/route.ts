import { listTranscripts } from "../../../../lib/history/store";

export async function GET() {
  return Response.json({ sessions: await listTranscripts() });
}
