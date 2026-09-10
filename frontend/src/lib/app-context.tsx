/** Application state: which knowledge base is selected, plus the shared
 *  health and settings snapshots that several pages read. */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { toApiError } from "./errors";
import type { AppSettings, ApiError, KnowledgeBase, SystemHealth } from "./types";

const KB_STORAGE_KEY = "edgerag.activeKnowledgeBase";
const THEME_STORAGE_KEY = "edgerag.theme";

interface AppState {
  knowledgeBases: KnowledgeBase[];
  activeKb: KnowledgeBase | null;
  setActiveKb: (id: string) => void;
  refreshKnowledgeBases: () => Promise<KnowledgeBase[]>;
  health: SystemHealth | null;
  healthState: "ok" | "degraded" | "unavailable" | "loading";
  refreshHealth: () => Promise<void>;
  settings: AppSettings | null;
  refreshSettings: () => Promise<void>;
  loading: boolean;
  error: ApiError | null;
  theme: "dark" | "light";
  toggleTheme: () => void;
}

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}

/** An explicit choice wins; otherwise follow the operating system. The same
 *  rule runs as an inline script in `index.html` so the first paint already has
 *  the right theme. */
function readInitialTheme(): "dark" | "light" {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* fall through to the system preference */
  }
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() => localStorage.getItem(KB_STORAGE_KEY));
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [healthState, setHealthState] = useState<AppState["healthState"]>("loading");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">(readInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* private browsing can refuse storage; the theme still applies for this session */
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const refreshKnowledgeBases = useCallback(async () => {
    try {
      const rows = await api.knowledgeBases();
      setKnowledgeBases(rows);
      setError(null);
      setActiveId((current) => {
        if (current && rows.some((kb) => kb.id === current)) return current;
        return rows[0]?.id ?? null;
      });
      return rows;
    } catch (caught) {
      setError(toApiError(caught));
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      const body = await api.health();
      setHealth(body.components);
      setHealthState(body.status as AppState["healthState"]);
    } catch {
      setHealth(null);
      setHealthState("unavailable");
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      setSettings(await api.settings());
    } catch {
      /* settings are optional for rendering; the Settings page reports failures */
    }
  }, []);

  useEffect(() => {
    void refreshKnowledgeBases();
    void refreshHealth();
    void refreshSettings();
    const timer = setInterval(() => void refreshHealth(), 30000);
    return () => clearInterval(timer);
  }, [refreshKnowledgeBases, refreshHealth, refreshSettings]);

  useEffect(() => {
    if (!activeId) return;
    try {
      localStorage.setItem(KB_STORAGE_KEY, activeId);
    } catch {
      /* the selection simply will not survive a reload */
    }
  }, [activeId]);

  const value = useMemo<AppState>(
    () => ({
      knowledgeBases,
      activeKb: knowledgeBases.find((kb) => kb.id === activeId) ?? null,
      setActiveKb: setActiveId,
      refreshKnowledgeBases,
      health,
      healthState,
      refreshHealth,
      settings,
      refreshSettings,
      loading,
      error,
      theme,
      toggleTheme,
    }),
    [knowledgeBases, activeId, health, healthState, settings, loading, error, theme, toggleTheme, refreshKnowledgeBases, refreshHealth, refreshSettings],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
