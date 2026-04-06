'use client';

import type { TranscriptionRecord } from '@/types/transcription-history';

const CACHE_KEY = 'linksy-transcription-history-cache';

function normalizeRecord(record: TranscriptionRecord): TranscriptionRecord {
  return {
    ...record,
    segments: Array.isArray(record.segments) ? record.segments : [],
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

function mergeRecords(records: TranscriptionRecord[]): TranscriptionRecord[] {
  const map = new Map<string, TranscriptionRecord>();

  for (const record of records) {
    const normalized = normalizeRecord(record);
    const existing = map.get(normalized.id);

    if (!existing || normalized.updatedAt.getTime() >= existing.updatedAt.getTime()) {
      map.set(normalized.id, normalized);
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
}

export function readCachedTranscriptionHistory(): TranscriptionRecord[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as TranscriptionRecord[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return mergeRecords(parsed);
  } catch {
    return [];
  }
}

export function writeCachedTranscriptionHistory(records: TranscriptionRecord[]): TranscriptionRecord[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const merged = mergeRecords(records);
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(merged));
  return merged;
}

export function mergeCachedTranscriptionHistory(records: TranscriptionRecord[]): TranscriptionRecord[] {
  return writeCachedTranscriptionHistory([
    ...readCachedTranscriptionHistory(),
    ...records,
  ]);
}

export function upsertCachedTranscriptionRecord(record: TranscriptionRecord): TranscriptionRecord[] {
  return mergeCachedTranscriptionHistory([record]);
}

export function removeCachedTranscriptionRecord(id: string): TranscriptionRecord[] {
  const next = readCachedTranscriptionHistory().filter((record) => record.id !== id);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  }
  return next;
}

export function getCachedTranscriptionRecord(id: string): TranscriptionRecord | null {
  return readCachedTranscriptionHistory().find((record) => record.id === id) ?? null;
}
