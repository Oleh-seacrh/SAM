// components/ui/Toast.tsx
"use client";

import { useEffect, useState } from "react";

type ToastProps = {
  message: string;
  type?: "success" | "error" | "info";
  duration?: number; // ms
  onClose?: () => void;
};

export function Toast({ message, type = "success", duration = 2000, onClose }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onClose?.(), 300); // Wait for fade out animation
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!visible) return null;

  const bgColor = 
    type === "success" ? "bg-emerald-500/20 border-emerald-500/40" :
    type === "error" ? "bg-red-500/20 border-red-500/40" :
    "bg-blue-500/20 border-blue-500/40";

  const icon =
    type === "success" ? "✓" :
    type === "error" ? "✕" :
    "ℹ";

  return (
    <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 animate-fade-in">
      <div className={`${bgColor} border rounded-xl px-6 py-3 shadow-2xl backdrop-blur-sm flex items-center gap-3`}>
        <span className="text-2xl">{icon}</span>
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>
  );
}

// Global toast container hook
export function useToast() {
  const [toast, setToast] = useState<{ message: string; type: ToastProps["type"] } | null>(null);

  const showToast = (message: string, type: ToastProps["type"] = "success") => {
    setToast({ message, type });
  };

  const ToastContainer = () => {
    if (!toast) return null;
    return (
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(null)}
      />
    );
  };

  return { showToast, ToastContainer };
}

