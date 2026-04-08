'use client';

import { cn } from "@/lib/utils";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

interface DesktopTopBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function DesktopTopBar({ sidebarOpen, onToggleSidebar }: DesktopTopBarProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 h-11">
      <div
        data-tauri-drag-region
        className="relative flex h-full items-center bg-background/90 backdrop-blur-xl"
      >
        <div
          className={cn(
            "absolute inset-y-0 left-0 bg-card/92 transition-[width] duration-300 ease-out",
            sidebarOpen ? "w-60" : "w-0",
          )}
        />
        

        <div className="relative z-10 flex h-full items-center pl-[92px]">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? "收起边栏" : "展开边栏"}
            aria-pressed={sidebarOpen}
            data-tauri-drag-region="false"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[9px] bg-background/96 transition-colors hover:bg-muted"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
