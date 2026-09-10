import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/app-context";
import { toApiError } from "../lib/errors";
import { ms, relativeTime, stageLabels } from "../lib/format";
import { streamChat, type StreamEvent } from "../lib/stream";
import type { ApiError, Candidate, ChatMessage, Citation, Conversation } from "../lib/types";
import { AnswerBody } from "../components/chat/AnswerBody";
import { AnswerTrace } from "../components/chat/AnswerTrace";
import { CitationList } from "../components/chat/CitationList";
import { DocumentViewerDrawer } from "../components/documents/DocumentViewer";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  Kbd,
  LiveStatus,
  Modal,
  Select,
  Spinner,
  StatusDot,
  cx,
  useToast,
} from "../components/ui";

interface ViewerTarget {
  documentId: string;
  chunkId: string | null;
  page: number | null;
  filename: string;
}

/** The stages the backend actually reports, in the order it reports them.
 *  Nothing is displayed until the corresponding event arrives. */
const STAGE_ORDER = [
  "query_processing",
  "dense_retrieval",
  "sparse_retrieval",
  "hybrid_fusion",
  "reranking",
  "generation",
];

export function ChatPage() {
  const { activeKb, knowledgeBases, setActiveKb, health, healthState } = useApp();
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveStages, setLiveStages] = useState<string[]>([]);
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadConversations = useCallback(async () => {
    if (!activeKb) return;
    try {
      setConversations(await api.conversations(activeKb.id));
    } catch {
      /* the list is a convenience; failures are not blocking */
    }
  }, [activeKb]);

  useEffect(() => {
    setMessages([]);
    setConversationId(null);
    void loadConversations();
  }, [activeKb, loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, liveStages]);

  // The composer grows with its content instead of scrolling inside itself.
  useLayoutEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 200)}px`;
  }, [question]);

  const openConversation = async (id: string) => {
    try {
      const history = await api.messages(id);
      setMessages(history);
      setConversationId(id);
      setHistoryOpen(false);
    } catch (caught) {
      toast.push({
        tone: "error",
        title: "That conversation could not be opened.",
        body: toApiError(caught).message,
      });
    }
  };

  const removeConversation = async (id: string) => {
    try {
      await api.deleteConversation(id);
      if (id === conversationId) {
        setMessages([]);
        setConversationId(null);
      }
      void loadConversations();
    } catch (caught) {
      toast.push({ tone: "error", title: "Delete failed", body: toApiError(caught).message });
    }
  };

  const send = async () => {
    const text = question.trim();
    if (!text || !activeKb || busy) return;

    setQuestion("");
    setBusy(true);
    setLiveStages([]);

    const userMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text,
      citations: [],
      trace: null,
      confidence: null,
      abstained: false,
      model: null,
      latency_ms: 0,
      created_at: new Date().toISOString(),
    };
    const assistantId = `local-${Date.now() + 1}`;
    const assistant: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      citations: [],
      trace: null,
      confidence: null,
      abstained: false,
      model: null,
      latency_ms: 0,
      created_at: new Date().toISOString(),
      streaming: true,
      candidates: [],
    };
    setMessages((current) => [...current, userMessage, assistant]);

    const patch = (updater: (message: ChatMessage) => ChatMessage) =>
      setMessages((current) => current.map((message) => (message.id === assistantId ? updater(message) : message)));

    const controller = new AbortController();
    abortRef.current = controller;

    const onEvent = (event: StreamEvent) => {
      switch (event.type) {
        case "conversation":
          setConversationId(event.conversation_id);
          break;
        case "stage":
          setLiveStages((current) => [...current, event.stage.name]);
          break;
        case "confidence":
          patch((message) => ({ ...message, confidence: event.confidence }));
          break;
        case "candidates":
          patch((message) => ({ ...message, candidates: event.candidates }));
          break;
        case "token":
          patch((message) => ({ ...message, content: message.content + event.text }));
          break;
        case "done":
          patch((message) => ({
            ...message,
            content: event.answer ?? message.content,
            citations: event.citations,
            trace: event.trace,
            abstained: event.abstained,
            model: event.model,
            streaming: false,
          }));
          break;
        case "error":
          patch((message) => ({ ...message, streaming: false, error: event.error as ApiError }));
          break;
      }
    };

    try {
      await streamChat(
        { knowledge_base_id: activeKb.id, question: text, conversation_id: conversationId },
        onEvent,
        controller.signal,
      );
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") {
        patch((message) => ({
          ...message,
          streaming: false,
          error: { code: "stream_failed", message: "The answer stream was interrupted." },
        }));
      }
    } finally {
      setBusy(false);
      setLiveStages([]);
      abortRef.current = null;
      void loadConversations();
    }
  };

  const openCitation = (citation: Citation) =>
    setViewer({
      documentId: citation.document_id,
      chunkId: citation.chunk_id,
      page: citation.page,
      filename: citation.document_name,
    });

  const openCandidate = (candidate: Candidate) =>
    setViewer({
      documentId: candidate.document_id,
      chunkId: candidate.chunk_id,
      page: candidate.page,
      filename: candidate.document_name,
    });

  if (!activeKb) {
    return (
      <div>
        <h1 className="sr-only">Chat</h1>
        <EmptyState
          icon="chat"
          title="No knowledge base selected"
          body="Create one and index a document before asking questions."
        />
      </div>
    );
  }

  const llmDown = healthState !== "ok";

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header: which knowledge base, which model, and its state. */}
        <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-4 py-2.5 sm:px-5">
          <h1 className="text-[15px] font-semibold tracking-tight text-fg">Chat</h1>

          <label htmlFor="chat-kb" className="sr-only">
            Knowledge base
          </label>
          <Select
            id="chat-kb"
            className="max-w-[12rem]"
            value={activeKb.id}
            onChange={(event) => setActiveKb(event.target.value)}
          >
            {knowledgeBases.map((kb) => (
              <option key={kb.id} value={kb.id}>
                {kb.name}
              </option>
            ))}
          </Select>

          <span className="ml-auto flex items-center gap-2">
            <Badge tone={llmDown ? "warn" : "both"} className="hidden sm:inline-flex">
              <StatusDot
                state={llmDown ? "degraded" : "ok"}
                label={llmDown ? "Model unavailable" : "Model ready"}
              />
              {health?.llm.model ?? "no model"}
            </Badge>
            <Button size="sm" variant="ghost" icon="clock" onClick={() => setHistoryOpen(true)}>
              <span className="hidden sm:inline">History</span>
            </Button>
            <Button
              size="sm"
              icon="plus"
              onClick={() => {
                setMessages([]);
                setConversationId(null);
                inputRef.current?.focus();
              }}
            >
              <span className="hidden sm:inline">New chat</span>
            </Button>
          </span>
        </header>

        {llmDown && (
          <div className="shrink-0 border-b border-line px-4 py-3 sm:px-5">
            <ErrorState
              error={{
                code: "llm_unavailable",
                message: health?.llm.error ?? `The model '${health?.llm.model}' is not ready.`,
                remediation: health?.llm.remediation ?? "Start Ollama, then reload this page.",
              }}
            />
          </div>
        )}

        <div className="shell shell-workspace min-h-0 flex-1 overflow-y-auto py-5">
          {messages.length === 0 ? (
            <ConversationStarters
              kbName={activeKb.name}
              conversations={conversations}
              onOpen={openConversation}
              onAsk={(text) => {
                setQuestion(text);
                inputRef.current?.focus();
              }}
            />
          ) : (
            <div className="mx-auto w-full max-w-[min(100%,78ch)] space-y-7">
              {messages.map((message) =>
                message.role === "user" ? (
                  <div key={message.id} className="flex justify-end">
                    <p className="max-w-prose whitespace-pre-wrap rounded-xl rounded-br-sm border border-line bg-raised px-3.5 py-2.5 text-[14px] leading-relaxed text-fg">
                      {message.content}
                    </p>
                  </div>
                ) : (
                  <article key={message.id} className="rail rounded-r-lg">
                    {message.error ? (
                      <ErrorState error={message.error} />
                    ) : (
                      <>
                        {message.abstained && (
                          <div className="mb-2.5 flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/5 px-2.5 py-2">
                            <Icon name="alert" size={14} className="mt-px text-warn" />
                            <p className="text-2xs leading-relaxed text-muted">
                              <span className="font-medium text-fg">Not enough evidence.</span> EdgeRAG did not
                              find passages strong enough to answer from, so it declined rather than guessing.
                            </p>
                          </div>
                        )}

                        {message.streaming && message.content === "" ? (
                          <StageProgress stages={liveStages} />
                        ) : (
                          <AnswerBody
                            text={message.content}
                            citations={message.citations}
                            onCitation={openCitation}
                            streaming={message.streaming}
                          />
                        )}

                        <CitationList citations={message.citations} onOpen={openCitation} />

                        <AnswerTrace
                          trace={message.trace}
                          confidence={message.confidence}
                          candidates={message.candidates}
                          onOpenCandidate={openCandidate}
                        />

                        {message.trace && (
                          <p className="mt-2 flex flex-wrap items-center gap-x-2 font-mono text-2xs text-faint tnum">
                            <Icon name="cpu" size={11} />
                            {message.model}
                            <span aria-hidden="true">·</span>
                            {ms(message.trace.total_ms)}
                          </p>
                        )}
                      </>
                    )}
                  </article>
                ),
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-line bg-surface py-3">
          <div className="shell shell-workspace"><div className="mx-auto w-full max-w-[min(100%,78ch)]">
            <div
              className={cx(
                "rounded-xl border bg-ink transition-[border-color,box-shadow] duration-200",
                "border-line surface-1 focus-within:border-accent focus-within:shadow-[var(--depth-2)]",
              )}
            >
              <label htmlFor="chat-question" className="sr-only">
                Your question
              </label>
              <textarea
                id="chat-question"
                ref={inputRef}
                rows={1}
                value={question}
                disabled={busy}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder={`Ask something answerable from ${activeKb.name}…`}
                className="block max-h-[200px] w-full resize-none bg-transparent px-3.5 py-3 text-[14px] leading-relaxed text-fg placeholder:text-faint focus:outline-none disabled:opacity-60"
              />

              <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2">
                <p className="hidden items-center gap-1.5 text-2xs text-faint sm:flex">
                  <Kbd>↵</Kbd> to ask
                  <Kbd>⇧↵</Kbd> for a new line
                </p>
                <p className="text-2xs text-faint sm:hidden">Grounded in your documents</p>

                <div className="flex items-center gap-2">
                  {busy ? (
                    <Button size="sm" icon="stop" onClick={() => abortRef.current?.abort()}>
                      Stop
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      iconRight="send"
                      onClick={() => void send()}
                      disabled={!question.trim()}
                    >
                      Ask
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <p className="mt-2 text-center text-2xs text-faint">
              Answers are grounded in your indexed documents only. Citations open the exact passage.
            </p>
          </div></div>
        </div>
      </div>

      {viewer && (
        <DocumentViewerDrawer
          open
          documentId={viewer.documentId}
          chunkId={viewer.chunkId}
          page={viewer.page}
          filename={viewer.filename}
          onClose={() => setViewer(null)}
        />
      )}

      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Conversations"
        description={`Earlier questions asked against ${activeKb.name}.`}
        footer={<Button onClick={() => setHistoryOpen(false)}>Close</Button>}
      >
        {conversations.length === 0 ? (
          <EmptyState
            compact
            icon="chat"
            title="No conversations yet"
            body="Ask a question and it will be saved here."
          />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
            {conversations.map((conversation) => (
              <li key={conversation.id} className="flex items-center gap-2 bg-surface">
                <button
                  onClick={() => void openConversation(conversation.id)}
                  className="min-w-0 flex-1 px-3 py-2.5 text-left transition-colors hover:bg-raised"
                >
                  <span className="block truncate text-[13px] text-fg">{conversation.title}</span>
                  <span className="mt-0.5 block font-mono text-2xs text-faint tnum">
                    {conversation.message_count} messages · {relativeTime(conversation.updated_at)}
                  </span>
                </button>
                <IconButton
                  icon="trash"
                  label={`Delete ${conversation.title}`}
                  size="sm"
                  className="mr-2 hover:text-danger"
                  onClick={() => void removeConversation(conversation.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}

/** Retrieval progress while the answer is still being produced.
 *
 *  Each row appears only when its `stage` event has arrived from the backend —
 *  there is no timed animation pretending that work is happening. */
function StageProgress({ stages }: { stages: string[] }) {
  const seen = new Set(stages);
  const current = stages[stages.length - 1];
  const visible = STAGE_ORDER.filter((stage) => seen.has(stage));

  if (visible.length === 0) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-muted">
        <Spinner className="h-3.5 w-3.5" />
        Retrieving…
        <LiveStatus>Retrieving</LiveStatus>
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {visible.map((stage) => {
        const active = stage === current;
        return (
          <li key={stage} className="flex items-center gap-2 text-2xs">
            {active ? (
              <Spinner className="h-3 w-3 text-accent" />
            ) : (
              <Icon name="check" size={12} className="text-ok" />
            )}
            <span className={active ? "text-fg" : "text-muted"}>{stageLabels[stage] ?? stage}</span>
          </li>
        );
      })}
      <LiveStatus>{stageLabels[current] ?? current}</LiveStatus>
    </ul>
  );
}

function ConversationStarters({
  kbName,
  conversations,
  onOpen,
  onAsk,
}: {
  kbName: string;
  conversations: Conversation[];
  onOpen: (id: string) => void;
  onAsk: (text: string) => void;
}) {
  const prompts = [
    "What does this knowledge base cover?",
    "Summarise the main argument, with citations.",
    "What does it say about the trade-offs involved?",
  ];

  return (
    <div className="mx-auto w-full max-w-[min(100%,78ch)] pt-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-raised text-accent">
          <Icon name="chat" size={16} />
        </span>
        <div>
          <h2 className="text-section-title font-semibold text-fg">Ask a grounded question</h2>
          <p className="text-2xs text-muted">Answering from {kbName}</p>
        </div>
      </div>

      <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-muted">
        Every answer is built from passages retrieved out of your own documents. If the evidence is too thin,
        EdgeRAG says so instead of guessing.
      </p>

      <div className="mt-5 space-y-1.5">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onAsk(prompt)}
            className={cx(
              "lift group flex w-full items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 text-left",
              "text-[13px] text-muted",
              "hover:border-line-strong hover:bg-raised hover:text-fg",
            )}
          >
            <Icon name="search" size={13} className="text-faint" />
            <span className="min-w-0 flex-1">{prompt}</span>
            <Icon
              name="arrowRight"
              size={13}
              className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100"
            />
          </button>
        ))}
      </div>

      {conversations.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-2 text-2xs font-medium uppercase tracking-wider text-faint">Earlier conversations</h3>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
            {conversations.slice(0, 6).map((conversation) => (
              <li key={conversation.id}>
                <button
                  onClick={() => onOpen(conversation.id)}
                  className="flex w-full items-baseline justify-between gap-3 bg-surface px-3 py-2.5 text-left transition-colors hover:bg-raised"
                >
                  <span className="truncate text-[13px] text-fg">{conversation.title}</span>
                  <span className="shrink-0 font-mono text-2xs text-faint tnum">
                    {conversation.message_count} msgs
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
