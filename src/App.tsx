import { ReactFlowProvider } from '@xyflow/react';
import { lazy, Suspense, useState } from 'react';
import { useAppMode } from './store/appModeStore';
import { useDetail } from './store/detailStore';
import { useLabStore } from './store/labStore';
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
const LabBrowser = lazy(() => import('./ui/lab/LabBrowser'));
const LabPanel = lazy(() => import('./ui/lab/LabPanel'));
const DeviceDetail = lazy(() => import('./ui/detail/DeviceDetail'));

export default function App() {
  const [showLimitations, setShowLimitations] = useState(false);
  const mode = useAppMode((s) => s.mode);
  const detailOpen = useDetail((s) => s.target !== null);
  const lab = useLabStore((s) => s.lab);
  // The canvas is shown in Sandbox, and in Lab mode while a lab is open.
  const canvas = mode === 'sandbox' || (mode === 'lab' && lab !== null);

  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col">
        <Toolbar onShowLimitations={() => setShowLimitations(true)} />
        {!canvas && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Suspense fallback={<p className="p-6 text-slate-500">Loading…</p>}>{mode === 'learn' ? <LearnView /> : <LabBrowser />}</Suspense>
          </div>
        )}
        <div className={`min-h-0 flex-1 ${canvas ? 'flex' : 'hidden'}`}>
          {mode === 'lab' && lab ? (
            <Suspense fallback={<div className="w-[22rem] shrink-0 border-r border-slate-800" />}>
              <LabPanel lab={lab} />
            </Suspense>
          ) : (
            <Palette />
          )}
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
      {detailOpen && (
        <Suspense fallback={null}>
          <DeviceDetail />
        </Suspense>
      )}
      {showLimitations && <LimitationsPanel onClose={() => setShowLimitations(false)} />}
    </ReactFlowProvider>
  );
}
