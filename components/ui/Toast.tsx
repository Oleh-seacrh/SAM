// components/ui/Toast.tsx
"use client";

import { useEffect, useState } from "react";

type ToastProps = {
  message: string;
  type?: "success" | "error" | "info";
  duration?: number; // ms
  onClose?: () => void;
};

export function Toast({ message, type = "success", duration = 500, onClose }: ToastProps) {
  const [visible, setVisible] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => {
        setVisible(false);
        onClose?.();
      }, 200); // Fade out duration
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!visible) return null;

  // Colors and icons based on type
  const styles = {
    success: {
      bgColor: "bg-orange-500/10 border-orange-500/40",
      textColor: "text-orange-400",
      icon: "✓"
    },
    error: {
      bgColor: "bg-red-500/10 border-red-500/40",
      textColor: "text-red-400",
      icon: "✕"
    },
    info: {
      bgColor: "bg-blue-500/10 border-blue-500/40",
      textColor: "text-blue-400",
      icon: "i"
    }
  };

  const currentStyle = styles[type];

  return (
    <div className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[70] ${
      fadeOut ? "animate-fade-out" : "animate-fade-in"
    }`}>
      <div className={`${currentStyle.bgColor} border rounded-xl px-6 py-3 shadow-2xl backdrop-blur-sm flex items-center gap-3`}>
        <span className={`text-2xl ${currentStyle.textColor}`}>{currentStyle.icon}</span>
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

