'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, type = 'info', duration = 3000, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const types = {
    success: 'bg-green-500 text-white',
    error: 'bg-red-500 text-white',
    info: 'bg-primary text-white'
  };

  const icons = {
    success: '✅',
    error: '❌',
    info: '💡'
  };

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-slide-up z-50',
        types[type]
      )}
    >
      <span>{icons[type]}</span>
      <span>{message}</span>
      <button
        onClick={onClose}
        className="ml-2 hover:opacity-70 transition-opacity"
      >
        ✕
      </button>
    </div>
  );
}

interface ToastManagerProps {
  message: string | null;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
}

export function ToastManager({ message, type = 'info', onClose }: ToastManagerProps) {
  if (!message) return null;

  return (
    <Toast
      message={message}
      type={type}
      onClose={onClose}
    />
  );
}
