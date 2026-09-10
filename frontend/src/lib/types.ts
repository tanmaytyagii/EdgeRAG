export type HealthState = "ok" | "degraded" | "unavailable";

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  embedding_model: string;
  document_count: number;
  chunk_count: number;
  ready_document_count: number;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  last_indexed_at: string | null;
}

export type DocumentStatus = "pending" | "processing" | "ready" | "failed" | "cancelled";

export interface DocumentRecord {
  id: string;
  knowledge_base_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  page_count: number;
  chunk_count: number;
  status: DocumentStatus;
  stage: string;
  progress: number;
  error: string | null;
  logs: { at: string; message: string }[];
  metadata: Record<string, unknown>;
  created_at: string;
  indexed_at: string | null;
}

export interface Candidate {
  chunk_id: string;
  document_id: string;
  document_name: string;
  page: number | null;
  ordinal: number;
  char_start: number;
  char_end: number;
  text: string | null;
  preview: string;
  source: "dense" | "sparse" | "hybrid";
  retrievers: string[];
  dense_score: number | null;
  dense_rank: number | null;
  sparse_score: number | null;
  sparse_rank: number | null;
  fusion_score: number | null;
  fusion_rank: number | null;
  rerank_score: number | null;
  rerank_rank: number | null;
}

export interface Stage {
  name: string;
  duration_ms: number;
  metrics: Record<string, unknown>;
}

export interface Trace {
  trace_id: string;
  query: string;
  stages: Stage[];
  total_ms: number;
}

export interface Citation {
  index: number;
  chunk_id: string;
  document_id: string;
  document_name: string;
  page: number | null;
  excerpt: string;
  char_start: number;
  char_end: number;
  score: number | null;
}

export interface Confidence {
  score: number;
  should_answer: boolean;
  signals: Record<string, number>;
  reason: string;
}

export interface SearchResponse {
  query: string;
  knowledge_base: { id: string; name: string };
  dense: Candidate[];
  sparse: Candidate[];
  fused: Candidate[];
  reranked: Candidate[];
  selected: Candidate[];
  reranker_applied: boolean;
  trace: Trace;
  config: Record<string, number>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  trace: Trace | null;
  confidence: Confidence | null;
  abstained: boolean;
  model: string | null;
  latency_ms: number;
  created_at: string;
  streaming?: boolean;
  candidates?: Candidate[];
  error?: ApiError | null;
}

export interface Conversation {
  id: string;
  knowledge_base_id: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ApiError {
  code: string;
  message: string;
  remediation?: string;
  details?: unknown;
}

export interface Overview {
  counts: { knowledge_bases: number; documents: number; chunks: number; conversations: number };
  indexing: { in_progress: number; failed: number; last_indexed_at: string | null };
  storage: { bytes: number };
  stack: { embedding_model: string; llm_model: string; vector_store: string; retrieval: string };
  health: SystemHealth;
  recent_documents: Pick<DocumentRecord, "id" | "filename" | "status" | "chunk_count" | "knowledge_base_id" | "created_at">[];
  recent_conversations: { id: string; title: string; knowledge_base_id: string; updated_at: string }[];
  activity: { id: string; kind: string; summary: string; created_at: string; payload: Record<string, unknown> }[];
}

export interface SystemHealth {
  embeddings: { provider: string; model: string; loaded: boolean; dimensions?: number; warning?: string };
  reranker: { provider: string; model: string | null; loaded: boolean; warning?: string };
  llm: {
    provider: string;
    model: string;
    available: boolean;
    model_installed?: boolean;
    base_url: string;
    models?: string[];
    error?: string;
    remediation?: string | null;
  };
  vector_store: { provider: string; [key: string]: unknown };
  storage: { data_dir: string };
}

export interface AppSettings {
  chunking: { chunk_size: number; chunk_overlap: number; splitter: string; min_chunk_chars: number };
  embedding: { provider: string; model: string; dimensions: number; batch_size: number; normalize: boolean };
  vector_store: { provider: string; collection_prefix: string };
  retrieval: {
    dense_top_k: number; sparse_top_k: number; fusion_top_k: number; rerank_top_k: number;
    context_top_k: number; rrf_k: number; dense_weight: number; sparse_weight: number;
  };
  reranker: { provider: string; model: string; batch_size: number };
  llm: { provider: string; model: string; base_url: string; temperature: number; max_tokens: number; timeout_seconds: number; strip_reasoning_tags: boolean };
  confidence: { enabled: boolean; min_top_score: number; min_supporting_chunks: number; min_confidence: number; abstain_message: string };
  context: { max_context_chars: number; max_chars_per_chunk: number };
  uploads: { max_file_bytes: number; allowed_extensions: string[] };
  privacy: { local_only: boolean; telemetry_enabled: boolean; note: string };
  developer_mode: boolean;
  /** True on the hosted public demo, where writes are refused server-side. */
  demo_mode?: boolean;
}

export interface EvalCase {
  id: string;
  knowledge_base_id: string;
  question: string;
  expected_answer: string;
  expected_keywords: string[];
  expected_documents: string[];
  created_at: string;
}

export interface EvalRun {
  id: string;
  status: string;
  config: Record<string, unknown>;
  created_at: string;
  summary: {
    cases: number;
    failed: number;
    abstained: number;
    mean_latency_ms: number | null;
    mean_citation_coverage: number | null;
    retrieval_only: boolean;
    metrics: Record<string, number | null>;
  };
  results?: EvalResult[];
}

export interface EvalResult {
  case_id: string;
  question: string;
  answer: string;
  abstained: boolean;
  latency_ms: number;
  stage_ms: Record<string, number>;
  citation_count: number;
  citation_coverage: number | null;
  retrieved: { document: string; page: number | null; score: number | null }[];
  metrics: Record<string, number | null>;
  error: string | null;
}

export interface ChunkRecord {
  id: string;
  document_id: string;
  document_name: string;
  text: string;
  page: number | null;
  ordinal: number;
  char_start: number;
  char_end: number;
}
