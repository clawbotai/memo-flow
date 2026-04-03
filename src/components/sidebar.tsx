'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Home, Mic, FileSearch, Library, Settings, Info, Menu, X, History } from 'lucide-react';
import { useRouter } from 'next/navigation';

export type PageId = 'home' | 'podcast' | 'analyze' | 'knowledge' | 'history';

interface MenuItem {
  id: PageId;
  label: string;
  icon: React.ReactNode;
  available: boolean;
}

interface BottomMenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

interface SidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  onOpenSettings: () => void;
}

const mainMenuItems: MenuItem[] = [
  { id: 'home', label: '首页', icon: <Home className="w-4 h-4" />, available: true },
  { id: 'podcast', label: '播客转录', icon: <Mic className="w-4 h-4" />, available: true },
  { id: 'history', label: '转录历史', icon: <History className="w-4 h-4" />, available: true },
  { id: 'analyze', label: '内容解析', icon: <FileSearch className="w-4 h-4" />, available: false },
  { id: 'knowledge', label: '知识库', icon: <Library className="w-4 h-4" />, available: false },
];

export function Sidebar({ activePage, onNavigate, onOpenSettings }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const router = useRouter();

  const bottomMenuItems: BottomMenuItem[] = [
    { id: 'settings', label: '设置', icon: <Settings className="w-4 h-4" />, onClick: onOpenSettings },
    { id: 'about', label: '关于', icon: <Info className="w-4 h-4" />, onClick: () => {} },
  ];

  const handleNavigate = (item: MenuItem) => {
    if (!item.available) return;

    // 根据菜单项 ID 处理不同的导航逻辑
    const routeMap: Record<string, string> = {
      home: '/',
      podcast: '/podcast',
      history: '/transcriptions',
    };

    const route = routeMap[item.id];
    if (route) {
      router.push(route);
      setMobileOpen(false);
    } else {
      // 其他菜单项使用状态管理
      onNavigate(item.id);
      setMobileOpen(false);
    }
  };

  const sidebarContent = (
    <>
      {/* Logo 区域 */}
      <div className="p-6">
        <h1 className="font-semibold text-xl bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
          MemoFlow
        </h1>
      </div>

      {/* 主菜单区域 */}
      <div className="flex-1 px-3 py-2">
        <nav className="space-y-1">
          {mainMenuItems.map((item) => {
            const isActive = activePage === item.id;
            const isAvailable = item.available;

            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item)}
                disabled={!isAvailable}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors',
                  isActive
                    ? 'bg-gradient-to-r from-accent/30 to-primary/20 text-foreground font-medium rounded-xl'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground rounded-xl',
                  !isAvailable && 'opacity-60 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground'
                )}
              >
                {item.icon}
                <span className="flex-1 text-left">{item.label}</span>
                {!isAvailable && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    即将推出
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* 底部菜单区域 */}
      <div className="mt-auto px-3 py-4 border-t">
        <nav className="space-y-1">
          {bottomMenuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                item.onClick();
                setMobileOpen(false);
              }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors',
                'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {item.icon}
              <span className="flex-1 text-left">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </>
  );

  return (
    <>
      {/* 移动端汉堡按钮 */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 md:hidden p-2 rounded-lg bg-background border shadow-sm"
        aria-label="打开菜单"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* 桌面端侧边栏 */}
      <aside className="hidden md:flex w-60 h-screen flex-col border-r bg-background fixed left-0 top-0">
        {sidebarContent}
      </aside>

      {/* 移动端侧边栏 */}
      {mobileOpen && (
        <>
          {/* 遮罩层 */}
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          {/* 侧边栏 */}
          <aside className="fixed left-0 top-0 w-60 h-screen flex-col border-r bg-background z-50 md:hidden animate-in slide-in-from-left">
            <div className="flex items-center justify-between p-6">
              <h1 className="font-semibold text-xl bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                MemoFlow
              </h1>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1 rounded-md hover:bg-accent"
                aria-label="关闭菜单"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 px-3 py-2 overflow-y-auto">
              <nav className="space-y-1">
                {mainMenuItems.map((item) => {
                  const isActive = activePage === item.id;
                  const isAvailable = item.available;

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavigate(item)}
                      disabled={!isAvailable}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors',
                        isActive
                          ? 'bg-gradient-to-r from-accent/30 to-primary/20 text-foreground font-medium rounded-xl'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground rounded-xl',
                        !isAvailable && 'opacity-60 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground'
                      )}
                    >
                      {item.icon}
                      <span className="flex-1 text-left">{item.label}</span>
                      {!isAvailable && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          即将推出
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
            <div className="mt-auto px-3 py-4 border-t">
              <nav className="space-y-1">
                {bottomMenuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      item.onClick();
                      setMobileOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors',
                      'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    {item.icon}
                    <span className="flex-1 text-left">{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </aside>
        </>
      )}
    </>
  );
}

export default Sidebar;
