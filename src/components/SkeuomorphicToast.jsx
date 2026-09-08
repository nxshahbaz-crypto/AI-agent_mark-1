import React, { useEffect } from "react";
import { X, Info, CheckCircle2, ShieldAlert, Sparkles } from "lucide-react";

export default function SkeuomorphicToast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onClose();
    }, toast.duration || 4500);

    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const getIcon = () => {
    switch (toast.type) {
      case "success":
        return <CheckCircle2 size={16} color="#22c55e" />;
      case "warning":
        return <ShieldAlert size={16} color="#eab308" />;
      case "feature":
        return <Sparkles size={16} color="#c69b35" />;
      default:
        return <Info size={16} color="#2b5c42" />;
    }
  };

  return (
    <div className="skeuomorphic-toast-container">
      <div className="skeuomorphic-toast-card">
        {/* Brass pushpin accent */}
        <div className="toast-pin" />

        <div className="toast-icon-box">{getIcon()}</div>

        <div className="toast-content">
          <div className="toast-title">{toast.title || "Notice"}</div>
          <div className="toast-message">{toast.message}</div>
        </div>

        <button
          className="toast-close-btn"
          onClick={onClose}
          title="Dismiss notification"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
