'use client';

import { Outlet } from "react-router-dom";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { WhisperSettings } from "@/components/whisper-settings";
import { DesktopSidebar } from "@desktop/components/DesktopSidebar";
import { DesktopTopBar } from "@desktop/components/DesktopTopBar";

export function DesktopAppShell() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <>
      <div className="flex h-screen bg-background">
        <DesktopTopBar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        />
        <DesktopSidebar
          open={sidebarOpen}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <main
          className={cn(
            "flex-1 overflow-auto pt-11 transition-[margin] duration-300 ease-out",
            sidebarOpen ? "md:ml-60" : "md:ml-0",
          )}
        >
          <Outlet />
        </main>
      </div>
      <WhisperSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
