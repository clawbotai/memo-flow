'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar, type PageId } from './sidebar'
import { WhisperSettings } from './whisper-settings'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()
  const [activePage, setActivePage] = useState<PageId>('home')
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 根据当前路由同步 activePage 状态
  useEffect(() => {
    if (pathname === '/transcriptions' || pathname.startsWith('/transcriptions/')) {
      setActivePage('history')
    } else if (pathname === '/podcast') {
      setActivePage('podcast')
    } else if (pathname === '/') {
      setActivePage('home')
    }
  }, [pathname])

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {/* 主内容区域，md 以上时左侧留出 sidebar 宽度 */}
      <main className="flex-1 md:ml-60 overflow-auto">
        {children}
      </main>
      <WhisperSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
