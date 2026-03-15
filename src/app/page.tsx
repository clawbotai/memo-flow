export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center space-y-8">
          <h1 className="text-4xl font-bold">
            🧠 MemoAI
          </h1>
          <p className="text-xl text-muted-foreground">
            AI 驱动的内容分析与创作助手
          </p>
          
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="relative">
              <input
                type="text"
                placeholder="粘贴 YouTube/小宇宙/小红书链接..."
                className="w-full px-6 py-4 rounded-lg border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button className="w-full px-6 py-4 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity">
              开始分析
            </button>
          </div>

          <div className="pt-16">
            <h2 className="text-2xl font-semibold mb-8">最近分析</h2>
            <div className="space-y-4 text-left">
              <div className="p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors cursor-pointer">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📺</span>
                    <div>
                      <h3 className="font-medium">AI 趋势分析</h3>
                      <p className="text-sm text-muted-foreground">YouTube • 2026-03-15</p>
                    </div>
                  </div>
                  <span className="text-primary">查看 →</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
