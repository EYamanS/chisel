import OpenAI from "openai";
import { TOOLS } from "@/lib/scene/tools";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response("OPENAI_API_KEY is not set. Add it to .env.local and restart.", { status: 500 });
  }

  let body: { messages?: OpenAI.Chat.Completions.ChatCompletionMessageParam[] };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }
  if (!body.messages || !Array.isArray(body.messages)) {
    return new Response("Missing 'messages'.", { status: 400 });
  }

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || "gpt-4o";

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: body.messages,
      tools: TOOLS,
      tool_choice: "auto",
      parallel_tool_calls: true,
      temperature: 0.4,
    });
    return Response.json(completion.choices[0].message);
  } catch (err) {
    const e = err as Error;
    return new Response(`Model error: ${e.message}`, { status: 502 });
  }
}
