/** Reads the chat SSE stream and hands back typed events. */
import { api } from "./api";
import type { ApiError, Candidate, Citation, Confidence, Stage, Trace } from "./types";

export type StreamEvent =
  | { type: "conversation"; conversation_id: string }
  | { type: "stage"; stage: Stage }
  | { type: "confidence"; confidence: Confidence }
  | { type: "candidates"; candidates: Candidate[] }
  | { type: "generation_started"; model: string }
  | { type: "token"; text: string }
  | {
      type: "done";
      abstained: boolean;
      answer?: string;
      citations: Citation[];
      trace: Trace;
      model: string;
      citation_coverage?: number;
    }
  | { type: "error"; error: ApiError };

export async function streamChat(
  body: { knowledge_base_id: string; question: string; conversation_id?: string | null; overrides?: Record<string, number> },
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(api.chatStreamUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    let error: ApiError = { code: "stream_failed", message: "The answer stream could not be opened." };
    try {
      const parsed = await response.json();
      if (parsed?.error) error = parsed.error;
    } catch {
      /* the body was not JSON; keep the generic message */
    }
    onEvent({ type: "error", error });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith("data:")) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()) as StreamEvent);
      } catch {
        /* ignore a partial frame */
      }
    }
  }
}
