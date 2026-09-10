import { lazy } from "react";
import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { AppProvider } from "./lib/app-context";
import { AppShell } from "./components/layout/AppShell";
import { ToastProvider } from "./components/ui";
import { LandingPage } from "./pages/LandingPage";

/** Workspace pages are code-split: the landing page is what most first visits
 *  load, and there is no reason for it to carry the document viewer, the
 *  pipeline diagram and the settings forms with it. `AppShell` renders the
 *  Suspense boundary these resolve into. */
const OverviewPage = lazy(() => import("./pages/OverviewPage").then((m) => ({ default: m.OverviewPage })));
const KnowledgeBasesPage = lazy(() =>
  import("./pages/KnowledgeBasesPage").then((m) => ({ default: m.KnowledgeBasesPage })),
);
const DocumentsPage = lazy(() => import("./pages/DocumentsPage").then((m) => ({ default: m.DocumentsPage })));
const ChatPage = lazy(() => import("./pages/ChatPage").then((m) => ({ default: m.ChatPage })));
const ExplorerPage = lazy(() => import("./pages/ExplorerPage").then((m) => ({ default: m.ExplorerPage })));
const PipelinePage = lazy(() => import("./pages/PipelinePage").then((m) => ({ default: m.PipelinePage })));
const EvaluationsPage = lazy(() => import("./pages/EvaluationsPage").then((m) => ({ default: m.EvaluationsPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));

export default function App() {
  return (
    <Router>
      <ToastProvider>
        <AppProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/app" element={<AppShell />}>
              <Route index element={<OverviewPage />} />
              <Route path="knowledge-bases" element={<KnowledgeBasesPage />} />
              <Route path="documents" element={<DocumentsPage />} />
              <Route path="chat" element={<ChatPage />} />
              <Route path="explorer" element={<ExplorerPage />} />
              <Route path="pipeline" element={<PipelinePage />} />
              <Route path="evaluations" element={<EvaluationsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppProvider>
      </ToastProvider>
    </Router>
  );
}
