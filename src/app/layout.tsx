import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import "@/styles/globals.css";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/app-shell";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({ subsets: ["latin"] });
const lora = Lora({ subsets: ["latin"], weight: ['400', '500', '600', '700'] });

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
          "min-h-screen bg-background font-serif antialiased text-foreground relative overflow-hidden",
          lora.className
        )}
      >
        {/* Organic background elements */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          {/* Soft organic shapes */}
          <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-primary/5 blur-3xl"></div>
          <div className="absolute bottom-1/3 right-1/3 w-72 h-72 rounded-full bg-secondary/5 blur-3xl"></div>

          {/* Subtle leaf-like patterns */}
          <div className="absolute top-1/3 right-1/4 w-16 h-16 rotate-45 rounded-full bg-primary/10 blur-xl"></div>
          <div className="absolute bottom-1/4 left-1/3 w-12 h-12 -rotate-12 rounded-full bg-secondary/10 blur-xl"></div>
        </div>

        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
