/** Typed API client. Every network call in the app goes through here. */
import type {
  AppSettings, ChatMessage, ChunkRecord, Conversation, DocumentRecord, EvalCase, EvalRun,
  KnowledgeBase, Overview, SearchResponse, SystemHealth,
} from "./types";
import { ApiFailure } from "./errors";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: init?.body instanceof FormData ? init?.headers : { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiFailure({
      code: "network_error",
      message: "The EdgeRAG server is not responding.",
      remediation: "Check that the backend is running, then try again.",
    });
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiFailure(
      body?.error ?? {
        code: "http_error",
        message: body?.detail
          ? typeof body.detail === "string"
            ? body.detail
            : "The request was rejected as invalid."
          : `Request failed with status ${response.status}.`,
      },
    );
  }
  return body as T;
}

export const api = {
  health: () => request<{ status: string; version: string; components: SystemHealth }>("/health"),
  overview: () => request<Overview>("/overview"),
  models: () => request<{ llm: { provider: string; active: string; installed: string[]; available: boolean } }>("/models"),

  settings: () => request<AppSettings>("/settings"),
  patchSettings: (patch: Record<string, unknown>) =>
    request<{ saved: boolean; reindex_required: boolean; settings: AppSettings }>("/settings", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  knowledgeBases: () => request<KnowledgeBase[]>("/knowledge-bases"),
  knowledgeBase: (id: string) => request<KnowledgeBase>(`/knowledge-bases/${id}`),
  createKnowledgeBase: (body: { name: string; description?: string }) =>
    request<KnowledgeBase>("/knowledge-bases", { method: "POST", body: JSON.stringify(body) }),
  updateKnowledgeBase: (id: string, body: { name?: string; description?: string }) =>
    request<KnowledgeBase>(`/knowledge-bases/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteKnowledgeBase: (id: string) => request<void>(`/knowledge-bases/${id}`, { method: "DELETE" }),
  duplicateKnowledgeBase: (id: string) => request<KnowledgeBase>(`/knowledge-bases/${id}/duplicate`, { method: "POST" }),
  exportKnowledgeBase: (id: string) => request<unknown>(`/knowledge-bases/${id}/export`),

  documents: (kbId: string) => request<DocumentRecord[]>(`/knowledge-bases/${kbId}/documents`),
  document: (id: string) => request<DocumentRecord>(`/documents/${id}`),
  documentChunks: (id: string) => request<ChunkRecord[]>(`/documents/${id}/chunks`),
  documentFileUrl: (id: string) => `${BASE}/documents/${id}/file`,
  uploadDocument: (kbId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<DocumentRecord>(`/knowledge-bases/${kbId}/documents`, { method: "POST", body: form });
  },
  reindexDocument: (id: string) => request<DocumentRecord>(`/documents/${id}/reindex`, { method: "POST" }),
  cancelDocument: (id: string) => request<DocumentRecord>(`/documents/${id}/cancel`, { method: "POST" }),
  deleteDocument: (id: string) => request<void>(`/documents/${id}`, { method: "DELETE" }),

  search: (body: { knowledge_base_id: string; query: string; overrides?: Record<string, number> }) =>
    request<SearchResponse>("/search", { method: "POST", body: JSON.stringify(body) }),

  conversations: (kbId?: string) =>
    request<Conversation[]>(`/conversations${kbId ? `?knowledge_base_id=${kbId}` : ""}`),
  messages: (id: string) => request<ChatMessage[]>(`/conversations/${id}/messages`),
  deleteConversation: (id: string) => request<void>(`/conversations/${id}`, { method: "DELETE" }),

  evalCases: (kbId: string) => request<EvalCase[]>(`/evaluation/cases?knowledge_base_id=${kbId}`),
  createEvalCase: (kbId: string, body: Partial<EvalCase>) =>
    request<EvalCase>(`/evaluation/cases?knowledge_base_id=${kbId}`, { method: "POST", body: JSON.stringify(body) }),
  deleteEvalCase: (id: string) => request<void>(`/evaluation/cases/${id}`, { method: "DELETE" }),
  evalRuns: (kbId: string) => request<EvalRun[]>(`/evaluation/runs?knowledge_base_id=${kbId}`),
  evalRun: (id: string) => request<EvalRun>(`/evaluation/runs/${id}`),
  startEvalRun: (body: { knowledge_base_id: string; retrieval_only?: boolean }) =>
    request<{ id: string; status: string }>("/evaluation/runs", { method: "POST", body: JSON.stringify(body) }),

  chatStreamUrl: () => `${BASE}/chat/stream`,
};
