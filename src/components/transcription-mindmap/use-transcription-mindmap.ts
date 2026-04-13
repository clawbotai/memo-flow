'use client';

import { useEffect, useRef, useState } from "react";
import {
  fetchTranscriptionMindMap,
  generateTranscriptionMindMap,
} from "@/lib/mindmap";
import { fetchLanguageModelSettings } from "@/lib/language-model-settings";
import { getEnabledLanguageModelOptions } from "@/lib/language-models";
import type { MindMapDocument } from "@/types/mindmap";
import { buildMindMapPath, serializeOutline, type ProviderOption, type ToastType, type TranscriptionMindMapProps } from "./shared";
import { useMindMapOverlay } from "./use-mindmap-overlay";
import { useSimpleMindMapInstance } from "./use-simple-mind-map-instance";

export function useTranscriptionMindMap({ record, onRecordPatch }: TranscriptionMindMapProps) {
  const lastLoadedRecordIdRef = useRef<string>("");

  const [mindMapDocument, setMindMapDocument] = useState<MindMapDocument | null>(null);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const isCompleted = record.status === "completed";
  const hasMindMap = Boolean(mindMapDocument);
  const selectedProviderOption = providers.find((item) => item.value === selectedProvider) ?? null;
  const canGenerate = isCompleted && providers.length > 0 && Boolean(selectedProviderOption) && !generating;

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
  };

  const dismissToast = () => {
    setToast(null);
  };

  const overlay = useMindMapOverlay({
    enabled: hasMindMap && !loadingDocument,
  });

  const mindMapInstance = useSimpleMindMapInstance({
    record,
    editMode,
    fullscreen: overlay.fullscreen,
    overlayFrame: overlay.overlayFrame,
    portalReady: overlay.shouldRenderPortal,
    mindMapDocument,
    setMindMapDocument,
    onRecordPatch,
    onRequireEditMode: () => setEditMode(true),
    showToast,
  });

  const handleToggleEditMode = () => {
    setEditMode((prev) => !prev);
  };

  const handleCopyOutline = async () => {
    if (!mindMapDocument) return;
    try {
      await navigator.clipboard.writeText(serializeOutline(mindMapDocument.root).join("\n"));
      showToast("已复制脑图大纲", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "复制失败", "error");
    }
  };

  const loadProviders = async () => {
    const requestRecordId = record.id;
    setLoadingProviders(true);

    try {
      const settings = await fetchLanguageModelSettings();
      if (lastLoadedRecordIdRef.current !== requestRecordId) {
        return;
      }

      const nextProviders = getEnabledLanguageModelOptions(settings);

      setProviders(nextProviders);
      setSelectedProvider((prev) => {
        if (record.mindmapGenerator?.providerId) {
          const matched = nextProviders.find((item) =>
            item.providerId === record.mindmapGenerator?.providerId
            && (!record.mindmapGenerator?.modelId || item.modelId === record.mindmapGenerator.modelId),
          );
          if (matched) {
            return matched.value;
          }
        }

        if (prev && nextProviders.some((item) => item.value === prev)) {
          return prev;
        }
        return nextProviders[0]?.value ?? "";
      });
    } catch (error) {
      if (lastLoadedRecordIdRef.current === requestRecordId) {
        showToast(error instanceof Error ? error.message : "读取模型配置失败", "error");
      }
    } finally {
      if (lastLoadedRecordIdRef.current === requestRecordId) {
        setLoadingProviders(false);
      }
    }
  };

  const loadMindMap = async () => {
    const requestRecordId = record.id;
    if (!record.mindmapPath && record.mindmapStatus !== "ready") {
      return;
    }

    setLoadingDocument(true);
    try {
      const nextDocument = await fetchTranscriptionMindMap(record.id);
      if (lastLoadedRecordIdRef.current !== requestRecordId) {
        return;
      }
      setMindMapDocument(nextDocument);
    } catch (error) {
      if (lastLoadedRecordIdRef.current === requestRecordId && record.mindmapStatus === "ready") {
        showToast(error instanceof Error ? error.message : "读取思维导图失败", "error");
      }
    } finally {
      if (lastLoadedRecordIdRef.current === requestRecordId) {
        setLoadingDocument(false);
      }
    }
  };

  const handleGenerate = async () => {
    if (!selectedProviderOption) return;

    const requestRecordId = record.id;
    const requestProviderId = selectedProviderOption.providerId;
    const requestModelId = selectedProviderOption.modelId;
    setGenerating(true);
    onRecordPatch({
      mindmapStatus: "generating",
      mindmapError: undefined,
    });

    try {
      const nextDocument = await generateTranscriptionMindMap(record.id, {
        providerId: requestProviderId,
        modelId: requestModelId,
      });
      if (lastLoadedRecordIdRef.current !== requestRecordId) {
        return;
      }
      setMindMapDocument(nextDocument);
      onRecordPatch({
        mindmapStatus: "ready",
        mindmapUpdatedAt: new Date(),
        mindmapPath: buildMindMapPath(record.savedPath),
        mindmapError: undefined,
        mindmapGenerator: {
          providerId: requestProviderId,
          providerName: selectedProviderOption.providerName,
          modelId: requestModelId,
          model: selectedProviderOption.model,
        },
      });
      showToast("思维导图已生成", "success");
    } catch (error) {
      if (lastLoadedRecordIdRef.current === requestRecordId) {
        onRecordPatch({
          mindmapStatus: hasMindMap ? "ready" : "error",
          mindmapError: error instanceof Error ? error.message : "思维导图生成失败",
        });
        showToast(error instanceof Error ? error.message : "思维导图生成失败", "error");
      }
    } finally {
      if (lastLoadedRecordIdRef.current === requestRecordId) {
        setGenerating(false);
      }
    }
  };

  useEffect(() => {
    lastLoadedRecordIdRef.current = record.id;
    setMindMapDocument(null);
    setEditMode(false);
    setGenerating(false);
    overlay.resetOverlay();
    mindMapInstance.destroyMindMap();
    void loadProviders();
    void loadMindMap();

    return () => {
      lastLoadedRecordIdRef.current = "";
      overlay.resetOverlay();
      mindMapInstance.destroyMindMap();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id]);

  return {
    anchorRef: overlay.anchorRef,
    viewportRef: mindMapInstance.viewportRef,
    canvasRef: mindMapInstance.canvasRef,
    providers,
    selectedProvider,
    loadingProviders,
    loadingDocument,
    generating,
    saving: mindMapInstance.saving,
    editMode,
    fullscreen: overlay.fullscreen,
    overlayFrame: overlay.overlayFrame,
    selectedNode: mindMapInstance.selectedNode,
    toast,
    isCompleted,
    hasMindMap,
    canGenerate,
    shouldRenderPortal: overlay.shouldRenderPortal,
    setSelectedProvider,
    dismissToast,
    handleGenerate,
    handleCopyOutline,
    handleDownload: mindMapInstance.handleDownload,
    handleToggleFullscreen: overlay.handleToggleFullscreen,
    handleRenameNode: mindMapInstance.handleRenameNode,
    handleAddChildNode: mindMapInstance.handleAddChildNode,
    handleAddSiblingNode: mindMapInstance.handleAddSiblingNode,
    handleDeleteNode: mindMapInstance.handleDeleteNode,
    handleZoomOut: mindMapInstance.handleZoomOut,
    handleZoomIn: mindMapInstance.handleZoomIn,
    handleResetZoom: mindMapInstance.handleResetZoom,
    handleToggleEditMode,
  };
}
