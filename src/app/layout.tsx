import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { cn } from "@/lib/utils";
import Link from 'next/link';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MemoFlow - 播客转录工具",
  description: "小宇宙播客一键转录为文字",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased text-foreground",
          inter.className
        )}
      >
        <div className="min-h-screen flex flex-col">
          {/* Navigation Bar */}
          <nav className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
            <div className="container mx-auto px-4">
              <div className="flex items-center h-16">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🌊</span>
                  <Link href="/" className="text-xl font-bold bg-gradient-to-r from-primary to-primary-light bg-clip-text text-transparent">
                    MemoFlow
                  </Link>
                </div>
              </div>
            </div>
          </nav>

          {/* Main Content */}
          <main className="flex-1">
            {children}
          </main>

          {/* Footer */}
          <footer className="border-t py-8">
            <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
              <p>&copy; {new Date().getFullYear()} MemoFlow - 播客转录工具</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
