'use client';

import * as React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  FileSearch,
  History,
  Home,
  Info,
  Library,
  Menu,
  Mic,
  Settings,
  X,
} from "lucide-react";

type PageId = "home" | "podcast" | "analyze" | "knowledge" | "history";

interface DesktopSidebarProps {
  open: boolean;
  onOpenSettings: () => void;
}

interface MenuItem {
  id: PageId;
  label: string;
  icon: React.ReactNode;
  available: boolean;
}

const mainMenuItems: MenuItem[] = [
  { id: "home", label: "首页", icon: <Home className="w-4 h-4" />, available: true },
  { id: "podcast", label: "播客转录", icon: <Mic className="w-4 h-4" />, available: true },
  { id: "history", label: "转录历史", icon: <History className="w-4 h-4" />, available: true },
  { id: "analyze", label: "内容解析", icon: <FileSearch className="w-4 h-4" />, available: false },
  { id: "knowledge", label: "知识库", icon: <Library className="w-4 h-4" />, available: false },
];

function getActivePage(pathname: string): PageId {
  if (pathname === "/transcriptions" || pathname.startsWith("/transcriptions/")) {
    return "history";
  }

  if (pathname === "/podcast") {
    return "podcast";
  }

  return "home";
}

export function DesktopSidebar({ open, onOpenSettings }: DesktopSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const activePage = getActivePage(location.pathname);

  const handleNavigate = (item: MenuItem) => {
    if (!item.available) {
      return;
    }

    const routeMap: Record<PageId, string> = {
      home: "/",
      podcast: "/podcast",
      history: "/transcriptions",
      analyze: "#",
      knowledge: "#",
    };

    const route = routeMap[item.id];
    if (route !== "#") {
      navigate(route);
    }
    setMobileOpen(false);
  };

  const sidebarContent = (
    <>
      <div className="px-6 pb-4 pt-5">
        <h1 className="bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-xl font-semibold text-transparent">
          Linksy
        </h1>
      </div>

      <div className="flex-1 px-3 py-2">
        <nav className="space-y-1">
          {mainMenuItems.map((item) => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item)}
                disabled={!item.available}
                className={cn(
                  "w-full rounded-xl px-3 py-2.5 text-sm transition-colors",
                  "flex items-center gap-3",
                  isActive
                    ? "bg-gradient-to-r from-accent/30 to-primary/20 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  !item.available &&
                    "cursor-not-allowed opacity-60 hover:bg-transparent hover:text-muted-foreground",
                )}
              >
                {item.icon}
                <span className="flex-1 text-left">{item.label}</span>
                {!item.available && (
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                    即将推出
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto px-3 pb-4 pt-2">
        <nav className="space-y-1 rounded-2xl bg-background/55 p-2">
          <button
            type="button"
            onClick={() => {
              onOpenSettings();
              setMobileOpen(false);
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Settings className="w-4 h-4" />
            <span className="flex-1 text-left">设置</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Info className="w-4 h-4" />
            <span className="flex-1 text-left">关于</span>
          </button>
        </nav>
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-50 rounded-lg border bg-background p-2 shadow-sm md:hidden"
        aria-label="打开菜单"
      >
        <Menu className="w-5 h-5" />
      </button>

      <aside
        className={cn(
          "fixed left-0 top-0 hidden h-screen w-60 flex-col bg-card/92 pt-11 backdrop-blur-xl transition-transform duration-300 ease-out md:flex",
          open ? "translate-x-0" : "-translate-x-full pointer-events-none",
        )}
        aria-hidden={!open}
      >
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed left-0 top-0 z-50 flex h-screen w-60 flex-col bg-card/95 backdrop-blur-xl md:hidden">
            <div className="flex items-center justify-end p-4">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1 hover:bg-accent"
                aria-label="关闭菜单"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
}
