import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** 将 whisper timestamp（HH:MM:SS 格式）格式化为 MM:SS */
export function formatWhisperTimestamp(ts: string): string {
  const match = ts.match(/(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return '00:00';
  const totalMinutes = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  return `${String(totalMinutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
