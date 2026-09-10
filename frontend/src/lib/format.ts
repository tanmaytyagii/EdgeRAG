export function bytes(value: number): string {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const scaled = value / 1024 ** index;
  return `${scaled >= 100 || index === 0 ? Math.round(scaled) : scaled.toFixed(1)} ${units[index]}`;
}

export function ms(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value < 1) return "<1 ms";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

export function count(value: number): string {
  return value.toLocaleString("en-US");
}

export function score(value: number | null | undefined, digits = 3): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

export function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const then = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`).getTime();
  const diff = Date.now() - then;
  if (Number.isNaN(diff)) return "unknown";
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
}

export const stageLabels: Record<string, string> = {
  query_processing: "Query processing",
  dense_retrieval: "Dense retrieval",
  sparse_retrieval: "BM25 retrieval",
  hybrid_fusion: "Hybrid fusion",
  reranking: "Reranking",
  generation: "Generation",
};
