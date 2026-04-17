'use client';

import * as React from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ExportIntegrationsPanel } from "@/components/app-settings/export-integrations-panel";
import { LanguageModelSettingsPanel } from "@/components/language-model-settings-panel";
import { GeneralSettingsPanel } from "@/components/app-settings/general-settings-panel";
import { SettingsSidebar } from "@/components/app-settings/settings-sidebar";
import type { SettingsSection as SettingsSectionType } from "@/components/app-settings/shared";
import { TranscriptionEnginePanel } from "@/components/app-settings/transcription-engine-panel";
import { WhisperPanel } from "@/components/app-settings/whisper-panel";
import { PageScene } from "@desktop/components/PageScene";
import { Card, CardContent } from "@/components/ui/card";

export function DesktopSettingsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialSection = (searchParams.get("section") as SettingsSectionType) || "general";
  const [activeSection, setActiveSection] = React.useState<SettingsSectionType>(initialSection);

  React.useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  const handleSectionChange = (section: SettingsSectionType) => {
    setActiveSection(section);
    navigate(`/settings?section=${section}`, { replace: true });
  };

  return (
    <PageScene
      containerClassName="max-w-none"
      contentClassName="h-[calc(100vh-44px)] max-h-[calc(100vh-44px)] overflow-y-auto px-5 py-5"
    >
      <div className="mx-auto max-w-5xl">
        <Card className="flex h-full min-h-[560px] flex-col overflow-hidden">
          <div className="grid h-full grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)]">
            <SettingsSidebar
              activeSection={activeSection}
              onSectionChange={handleSectionChange}
            />

            <div className="min-h-0 overflow-y-auto bg-background px-4 py-4 sm:px-5 sm:py-5">
              <GeneralSettingsPanel visible={activeSection === "general"} />
              <LanguageModelSettingsPanel visible={activeSection === "language-models"} />
              <TranscriptionEnginePanel visible={activeSection === "transcription"} />
              <ExportIntegrationsPanel visible={activeSection === "export"} />
              <WhisperPanel
                open={true}
                visible={activeSection === "whisper"}
                onClose={() => navigate("/settings?section=general")}
              />
            </div>
          </div>
        </Card>
      </div>
    </PageScene>
  );
}
