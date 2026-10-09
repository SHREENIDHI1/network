import { ReactFlowProvider } from '@xyflow/react';
import { useState } from 'react';
import { TopologyCanvas } from './ui/canvas/TopologyCanvas';
import { BottomDock } from './ui/dock/BottomDock';
import { LimitationsPanel } from './ui/LimitationsPanel';
import { LinkDialog } from './ui/LinkDialog';
import { Notices } from './ui/Notices';
import { Palette } from './ui/Palette';
import { PropertiesPanel } from './ui/PropertiesPanel';
import { StatusBar } from './ui/StatusBar';
import { Toolbar } from './ui/Toolbar';

export default function App() {
  const [showLimitations, setShowLimitations] = useState(false);

  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col">
        <Toolbar onShowLimitations={() => setShowLimitations(true)} />
        <div className="flex min-h-0 flex-1">
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
