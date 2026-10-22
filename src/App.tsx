import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { ConfirmProvider, ToastProvider } from './components/ui/feedback';
import { Spinner } from './components/ui/primitives';
import { AppDataProvider } from './state/AppData';
import { applyTheme, usePrefs } from './lib/storage';
import { DashboardPage } from './pages/DashboardPage';

// Route-level code splitting keeps the first load small; PDF.js is only fetched on the upload screens.
const SetsPage = lazy(() => import('./pages/SetsPage'));
const SetDetailPage = lazy(() => import('./pages/SetDetailPage'));
const SetEditorPage = lazy(() => import('./pages/SetEditorPage'));
const UploadPage = lazy(() => import('./pages/UploadPage'));
const ImportReviewPage = lazy(() => import('./pages/ImportReviewPage'));
const ReviewDuePage = lazy(() => import('./pages/ReviewDuePage'));
const ProgressPage = lazy(() => import('./pages/ProgressPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const StudyPage = lazy(() => import('./pages/StudyPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function ThemeSync() {
  const { theme } = usePrefs();
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);
  return null;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function PageFallback() {
  return (
    <div className="flex justify-center py-24">
      <Spinner />
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppDataProvider>
          <ThemeSync />
          <HashRouter>
            <ScrollToTop />
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route element={<AppLayout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="sets" element={<SetsPage />} />
                  <Route path="sets/new" element={<SetEditorPage />} />
                  <Route path="sets/:setId" element={<SetDetailPage />} />
                  <Route path="sets/:setId/edit" element={<SetEditorPage />} />
                  <Route path="upload" element={<UploadPage />} />
                  <Route path="upload/:importId" element={<ImportReviewPage />} />
                  <Route path="review" element={<ReviewDuePage />} />
                  <Route path="progress" element={<ProgressPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
                <Route path="study/:mode" element={<StudyPage />} />
              </Routes>
            </Suspense>
          </HashRouter>
        </AppDataProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
