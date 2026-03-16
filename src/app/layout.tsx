import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: 'MemoFlow - AI 内容分析与创作助手',
    template: '%s | MemoFlow'
  },
  description: '让灵感自然流淌。AI 驱动的内容分析与创作助手，支持 YouTube、小宇宙、小红书等多平台内容解析与笔记生成。',
  keywords: ['AI', '内容分析', '笔记工具', '创作助手', 'YouTube 解析', '播客转文字', '小红书'],
  authors: [{ name: 'MemoFlow Team' }],
  creator: 'MemoFlow',
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    url: 'https://memo-flow.vercel.app',
    title: 'MemoFlow - AI 内容分析与创作助手',
    description: '让灵感自然流淌。AI 驱动的内容分析与创作助手。',
    siteName: 'MemoFlow',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'MemoFlow',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MemoFlow',
    description: 'AI 内容分析与创作助手',
    images: ['/og-image.png'],
    creator: '@memoflow',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0F172A' },
  ],
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
        {children}
      </body>
    </html>
  );
}
