import { ReactFlowProvider } from '@xyflow/react';
import { lazy, Suspense, useState } from 'react';
import { useAppMode } from './store/appModeStore';
import { TopologyCanvas } from './ui/canvas/TopologyCanvas';
import { BottomDock } from './ui/dock/BottomDock';
import { LimitationsPanel } from './ui/LimitationsPanel';
import { LinkDialog } from './ui/LinkDialog';
import { Notices } from './ui/Notices';
import { Palette } from './ui/Palette';
import { PropertiesPanel } from './ui/PropertiesPanel';
import { StatusBar } from './ui/StatusBar';
import { Toolbar } from './ui/Toolbar';

const LearnView = lazy(() => import('./ui/learn/LearnView'));
const LabPlaceholder = lazy(() => import('./ui/learn/LabPlaceholder'));

export default function App() {
  const [showLimitations, setShowLimitations] = useState(false);
  const mode = useAppMode((s) => s.mode);

  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col">
        <Toolbar onShowLimitations={() => setShowLimitations(true)} />
        {mode !== 'sandbox' && (
          <div className="min-h-0 flex-1">
            <Suspense fallback={<p className="p-6 text-slate-500">Loading…</p>}>{mode === 'learn' ? <LearnView /> : <LabPlaceholder />}</Suspense>
          </div>
        )}
        <div className={`min-h-0 flex-1 ${mode === 'sandbox' ? 'flex' : 'hidden'}`}>
          <Palette />
          <div className="flex min-w-0 flex-1 flex-col">
            <main className="relative min-h-0 flex-1">
              <TopologyCanvas />
            </main>
            <BottomDock />
          </div>
          <PropertiesPanel />
        </div>
        <StatusBar />
      </div>
      <LinkDialog />
      <Notices />
      {showLimitations && <LimitationsPanel onClose={() => setShowLimitations(false)} />}
    </ReactFlowProvider>
  );
}
