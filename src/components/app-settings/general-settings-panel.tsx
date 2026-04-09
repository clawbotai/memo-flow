"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { THEME_OPTIONS } from "@/components/app-settings/shared";

interface GeneralSettingsPanelProps {
  visible: boolean;
}

export function GeneralSettingsPanel({ visible }: GeneralSettingsPanelProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = mounted ? (theme ?? "system") : "system";

  return (
    <section aria-hidden={!visible} className={cn("space-y-6", !visible && "hidden")}>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">通用</h3>
        <p className="text-sm text-muted-foreground">
          管理应用的主题外观。主题切换会立即生效并自动保存。
        </p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm shadow-primary/5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-sm font-medium">主题</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              选择 Linksy 的显示模式。
              {mounted && resolvedTheme && (
                <span className="ml-1">当前实际显示为{resolvedTheme === "dark" ? "深色" : "浅色"}。</span>
              )}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = currentTheme === option.id;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setTheme(option.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left transition-all",
                  selected
                    ? "border-primary bg-primary/8 shadow-sm shadow-primary/10"
                    : "border-border/60 bg-background/80 hover:border-primary/35 hover:bg-accent/20",
                )}
                disabled={!mounted}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border",
                      selected
                        ? "border-primary/30 bg-primary/12 text-primary"
                        : "border-border/60 bg-card text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{option.label}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{option.description}</div>
                  </div>
                </div>

                <div
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30",
                  )}
                >
                  {selected && <Check className="h-3 w-3" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
