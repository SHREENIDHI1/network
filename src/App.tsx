import { ReactFlowProvider } from '@xyflow/react';
import { useState } from 'react';
import { TopologyCanvas } from './ui/canvas/TopologyCanvas';
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
          <main className="relative min-w-0 flex-1">
            <TopologyCanvas />
          </main>
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
