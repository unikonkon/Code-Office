import { getTranscriptMarkdown } from "../../../../lib/history/store";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const transcript = await getTranscriptMarkdown(id);
  if (transcript === null) {
    return Response.json({ error: "transcript not found" }, { status: 404 });
  }
  return Response.json({ transcript });
}
