'use client';

import { Outlet } from "react-router-dom";
import { useState } from "react";
import { WhisperSettings } from "@/components/whisper-settings";
import { DesktopSidebar } from "@desktop/components/DesktopSidebar";

export function DesktopAppShell() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <div className="flex h-screen bg-background">
        <DesktopSidebar onOpenSettings={() => setSettingsOpen(true)} />
        <main className="flex-1 overflow-auto md:ml-60">
          <Outlet />
        </main>
      </div>
      <WhisperSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
