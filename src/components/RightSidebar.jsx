import React from "react";
import {
  Settings,
  Sparkles,
  Zap,
  ArrowRight,
  Leaf,
  Users,
  BarChart2,
} from "lucide-react";

export default function RightSidebar({
  systemStatus,
  onSwitchProvider,
  onOpenModal,
  liveActivity,
  liveMetrics,
}) {
  const isOnline = systemStatus?.status === "Online";
  const primaryProviderName = systemStatus?.primaryProvider === "gemini" ? "Gemini 1.5 Flash" : "Groq Llama 3.3";
  const latency = liveMetrics?.latencyMs || systemStatus?.metrics?.latencyMs || 520;
  const tokensPerSec = liveMetrics?.tokensPerSec || systemStatus?.metrics?.tokensPerSec || 12.4;

  return (
    <aside className="right-sidebar-wrapper">
      <div className="right-sidebar-paper">
        {/* User / Profile Header */}
        <div className="user-profile-header">
          <div className="user-profile-info">
            <div className="user-avatar-circle">S</div>
            <div className="user-profile-text">
              <h3>Shahbaz</h3>
              <p>Builder Mode 🟢</p>
            </div>
          </div>
          <button
            className="user-gear-btn"
            title="Settings"
            onClick={() => onOpenModal("settings")}
          >
            <Settings size={16} />
          </button>
        </div>

        {/* Agent Status Card */}
        <div className="status-card">
          <div className="status-card-header-label">Agent Status</div>
          <div className="agent-status-row">
            <div className="agent-status-left">
              <div
                className="status-led"
                style={{
                  background: isOnline ? "#22c55e" : "#eab308",
                  boxShadow: isOnline
                    ? "0 0 8px rgba(34, 197, 94, 0.8)"
                    : "0 0 8px rgba(234, 179, 8, 0.8)",
                }}
              />
              <div className="agent-status-text">
                <h4>{systemStatus?.status || "Online"}</h4>
                <p>Ready to help you</p>
              </div>
            </div>
            {/* Live Audio Waveform */}
            <div className="audio-waveform" title="Agent audio engine online">
              <div className="waveform-bar" />
              <div className="waveform-bar" />
              <div className="waveform-bar" />
              <div className="waveform-bar" />
              <div className="waveform-bar" />
            </div>
          </div>
        </div>

        {/* Active Provider Card */}
        <div className="status-card">
          <div className="status-card-header-label">Active Provider</div>
          <div className="provider-row">
            <div className="provider-info-left">
              <Sparkles size={14} color="#2b5c42" />
              <span>{primaryProviderName}</span>
            </div>
            <button
              className="provider-switch-btn"
              onClick={onSwitchProvider}
              title="Switch primary provider"
            >
              Switch
            </button>
          </div>
          <div className="provider-metrics-row">
            <div>
              Latency: <strong>{latency} ms</strong>
            </div>
            <div>
              Response: <strong>{tokensPerSec} tokens/s</strong>
            </div>
          </div>
        </div>

        {/* System Modules Card with Pinned Kraft Tag */}
        <div className="status-card" style={{ overflow: "visible" }}>
          <div className="status-card-header-label">System Modules</div>

          {/* Pinned Kraft Tag */}
          <div className="pinned-kraft-tag">
            <div className="kraft-pin" />
            <div className="pinned-kraft-tag-text">
              BUILT
              <br />
              TO MAKE
              <br />A DIFF.
            </div>
          </div>

          <div className="modules-list">
            <div
              className="module-item"
              onClick={() => onOpenModal("knowledge")}
              style={{ cursor: "pointer" }}
              title="Click to view RAG configuration"
            >
              <div className="module-dot" />
              <span>RAG (Supabase)</span>
            </div>

            <div
              className="module-item"
              onClick={() => onOpenModal("tools")}
              style={{ cursor: "pointer" }}
              title="Click to inspect 12 registered tools"
            >
              <div className="module-dot" />
              <span>Tool Registry</span>
            </div>

            <div className="module-item">
              <div className="module-dot" />
              <span>Memory (Conversations)</span>
            </div>

            <div className="module-item">
              <div className="module-dot" />
              <span>Security Guardrails</span>
            </div>

            <div
              className="module-item"
              onClick={() => onOpenModal("evaluation")}
              style={{ cursor: "pointer" }}
              title="Click to view evaluation suite"
            >
              <div className="module-dot" />
              <span>Evaluation Suite</span>
            </div>
          </div>
        </div>

        {/* Live Activity Timeline Card */}
        <div className="status-card">
          <div className="status-card-header-label">Live Activity</div>
          <div className="activity-timeline">
            {liveActivity.map((act, index) => (
              <div key={index} className="timeline-step">
                <div
                  className={`timeline-node ${act.active ? "active" : ""}`}
                />
                <div className="timeline-content">
                  <h5>{act.title}</h5>
                  <p>{act.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA Card */}
        <div
          className="cta-leather-card"
          onClick={() => onOpenModal("projects")}
        >
          <div className="cta-leather-header">
            <div className="cta-title-group">
              <Zap size={14} className="cta-lightning-icon" />
              <span>Build Without Limits</span>
            </div>
            <ArrowRight size={14} />
          </div>
          <p className="cta-desc">
            Turn ideas into real-world solutions with Mark 1 AI.
          </p>
        </div>

        {/* Footer Metric Tags */}
        <div className="right-footer-tags">
          <div className="footer-tag">
            <Leaf size={12} color="#3d6e53" />
            <span>People</span>
          </div>
          <div className="footer-tag">
            <Users size={12} color="#3d6e53" />
            <span>Problems</span>
          </div>
          <div className="footer-tag">
            <BarChart2 size={12} color="#3d6e53" />
            <span>Progress</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
