'use client';

import { Outlet } from "react-router-dom";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { WhisperSettings, type SettingsSection } from "@/components/whisper-settings";
import { DesktopSidebar } from "@desktop/components/DesktopSidebar";
import { DesktopTopBar } from "@desktop/components/DesktopTopBar";

export interface DesktopShellContext {
  openSettings: (section?: SettingsSection) => void;
}

export function DesktopAppShell() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");

  const openSettings = (section: SettingsSection = "general") => {
    setSettingsSection(section);
    setSettingsOpen(true);
  };

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-background">
        <DesktopTopBar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        />
        <DesktopSidebar
          open={sidebarOpen}
          onOpenSettings={() => openSettings("general")}
        />
        <main
          className={cn(
            "flex-1 overflow-auto overscroll-none pt-11 transition-[margin] duration-300 ease-out",
            sidebarOpen ? "md:ml-60" : "md:ml-0",
          )}
        >
          <Outlet context={{ openSettings } satisfies DesktopShellContext} />
        </main>
      </div>
      <WhisperSettings
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initialSection={settingsSection}
      />
    </>
  );
}
