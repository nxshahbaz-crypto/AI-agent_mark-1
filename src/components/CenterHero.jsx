import React, { useState, useRef, useEffect } from "react";
import {
  Paperclip,
  Globe,
  Send,
  Brain,
  BookOpen,
  Wrench,
  Archive,
  RefreshCw,
  Clock,
  Search,
  Code,
  BarChart,
  Edit3,
  ListTodo,
  ChevronDown,
  Sparkles,
  Zap,
  Check,
} from "lucide-react";

export default function CenterHero({
  inputPrompt,
  setInputPrompt,
  onSendMessage,
  isLoading,
  messages,
  onActionClick,
  onFeatureCardClick,
  searchWebActive,
  setSearchWebActive,
  activeModel,
  onSelectModel,
  onShowToast,
}) {
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);

  // Close model dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setModelDropdownOpen(false);
      }
    };

    if (modelDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [modelDropdownOpen]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        140
      )}px`;
    }
  }, [inputPrompt]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (inputPrompt.trim() && !isLoading) {
        onSendMessage(inputPrompt);
      }
    }
  };

  const hasMessages = messages && messages.length > 0;

  return (
    <div className="center-workspace">
      {/* Pinned Wooden Plaque at Top */}
      <div className="hanging-plaque-wrapper">
        <div className="hanging-plaque">
          <div className="hanging-plaque-text">
            GOOD IDEAS
            <br />
            SOLVE REAL PROBLEMS.
          </div>
        </div>
      </div>

      <div className="hero-stage-container">
        {/* Sticky Note Top Left */}
        <div className="sticky-note-yellow">
          <div>Think</div>
          <div>Create</div>
          <div>Automate</div>
          <div>Repeat</div>
          <div className="signature">— Mark 1</div>
        </div>

        {/* Handwritten Accent Top Right */}
        <div className="handwritten-callout-right">
          <div className="callout-text">
            From
            <br />
            Ideas
            <br />
            to
            <br />
            Impact
          </div>
          <svg
            className="handwritten-arrow-svg"
            viewBox="0 0 50 60"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M38 5C38 5 35 25 22 36C12 45 6 48 6 48"
              stroke="#3a3224"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M3 40C3 40 5 49 7 49C9 49 17 46 17 46"
              stroke="#3a3224"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Hero Title & Subtitle */}
        <div className="hero-heading-group">
          <h1 className="hero-title">Mark 1 AI</h1>
          <div className="hero-subtitle-wrapper">
            <span className="hero-subtitle">Your Agentic Partner.</span>
            <svg
              className="underline-swoosh"
              viewBox="0 0 130 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M3 9C28 3 75 3 127 10"
                stroke="#2f6e4a"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* Chat History if conversation is active */}
        {hasMessages && (
          <div className="chat-stream-container">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`chat-bubble ${msg.role === "user" ? "user" : "model"}`}
              >
                <div className="chat-bubble-author">
                  {msg.role === "user" ? "You" : "Mark 1 AI"}
                </div>
                <div className="chat-bubble-content">{msg.content}</div>
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div style={{ marginTop: "8px" }}>
                    {msg.toolCalls.map((tc, tIdx) => (
                      <span key={tIdx} className="tool-badge-pill">
                        <Wrench size={11} />
                        {tc}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Central Input Console (Beveled Machine) */}
        <div className="input-console-outer">
          <div className="input-console-inner">
            <textarea
              ref={textareaRef}
              className="prompt-textarea"
              placeholder="Ask Mark 1 AI anything..."
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />

            <div className="console-control-bar">
              <div className="console-tools-left">
                {/* Paperclip Button */}
                <button
                  className="tool-circle-btn"
                  title="Attach file or document"
                  onClick={() => {
                    if (onShowToast) {
                      onShowToast({
                        title: "Document Ingestion",
                        message:
                          "Document ingestion is available via Knowledge Base / RAG. Open Knowledge Base to search or upload context.",
                        type: "info",
                      });
                    }
                  }}
                >
                  <Paperclip size={15} />
                </button>

                {/* Web Search Toggle Button */}
                <button
                  className={`tool-circle-btn ${
                    searchWebActive ? "active" : ""
                  }`}
                  title={
                    searchWebActive
                      ? "Web search active (grounding queries with latest web context)"
                      : "Click to enable web search grounding"
                  }
                  onClick={() => setSearchWebActive(!searchWebActive)}
                >
                  <Globe size={15} />
                </button>

                {/* Model Selector Pill */}
                <div ref={dropdownRef} style={{ position: "relative" }}>
                  <button
                    className="model-selector-pill"
                    onClick={() => setModelDropdownOpen((prev) => !prev)}
                    title="Select AI Model & Provider"
                  >
                    <div
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "#22c55e",
                        boxShadow: "0 0 6px rgba(34, 197, 94, 0.7)",
                      }}
                    />
                    <span>{activeModel || "Mark 1 AI"}</span>
                    <ChevronDown
                      size={13}
                      style={{
                        transform: modelDropdownOpen
                          ? "rotate(180deg)"
                          : "rotate(0deg)",
                        transition: "transform 0.15s ease",
                      }}
                    />
                  </button>

                  {modelDropdownOpen && (
                    <div className="model-dropdown-popover">
                      <div className="model-dropdown-header">
                        Active Provider & Model
                      </div>

                      <div
                        className={`model-dropdown-item ${
                          activeModel?.includes("Gemini") ? "active" : ""
                        }`}
                        onClick={() => {
                          onSelectModel("gemini");
                          setModelDropdownOpen(false);
                        }}
                      >
                        <Sparkles
                          size={15}
                          color="#2b5c42"
                          style={{ marginTop: 2, flexShrink: 0 }}
                        />
                        <div className="model-item-content">
                          <h4>Gemini 1.5 Flash</h4>
                          <p>
                            Google primary provider · Deep context & multi-step tools
                          </p>
                        </div>
                        {activeModel?.includes("Gemini") && (
                          <Check size={14} className="model-item-check" />
                        )}
                      </div>

                      <div
                        className={`model-dropdown-item ${
                          activeModel?.includes("Groq") ? "active" : ""
                        }`}
                        onClick={() => {
                          onSelectModel("groq");
                          setModelDropdownOpen(false);
                        }}
                      >
                        <Zap
                          size={15}
                          color="#c69b35"
                          style={{ marginTop: 2, flexShrink: 0 }}
                        />
                        <div className="model-item-content">
                          <h4>Groq Llama 3.3 (70B)</h4>
                          <p>
                            Ultra-fast LPU inference · Low-latency tool synthesis
                          </p>
                        </div>
                        {activeModel?.includes("Groq") && (
                          <Check size={14} className="model-item-check" />
                        )}
                      </div>

                      <div
                        className={`model-dropdown-item ${
                          activeModel?.includes("Failover") ? "active" : ""
                        }`}
                        onClick={() => {
                          onSelectModel("failover");
                          setModelDropdownOpen(false);
                        }}
                      >
                        <RefreshCw
                          size={15}
                          color="#1b3b2b"
                          style={{ marginTop: 2, flexShrink: 0 }}
                        />
                        <div className="model-item-content">
                          <h4>Auto Failover Mode</h4>
                          <p>
                            Gemini primary → automatic Groq fallback on 429/5xx
                          </p>
                        </div>
                        {activeModel?.includes("Failover") && (
                          <Check size={14} className="model-item-check" />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Large Tactile 3D Send Button */}
              <button
                className="tactile-send-btn"
                disabled={!inputPrompt.trim() || isLoading}
                onClick={() => onSendMessage(inputPrompt)}
              >
                <Send size={15} />
                <span>{isLoading ? "Thinking..." : "Send"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Quick Action Pills Below Input Console */}
        <div className="action-pills-row">
          <button
            className="action-pill-btn"
            onClick={() => onActionClick("Reason")}
          >
            <Clock size={12} />
            <span>Reason</span>
          </button>

          <button
            className="action-pill-btn"
            onClick={() => onActionClick("Search")}
          >
            <Search size={12} />
            <span>Search</span>
          </button>

          <button
            className="action-pill-btn"
            onClick={() => onActionClick("Code")}
          >
            <Code size={12} />
            <span>&lt;/&gt; Code</span>
          </button>

          <button
            className="action-pill-btn"
            onClick={() => onActionClick("Analyze")}
          >
            <BarChart size={12} />
            <span>Analyze</span>
          </button>

          <button
            className="action-pill-btn"
            onClick={() => onActionClick("Create")}
          >
            <Edit3 size={12} />
            <span>Create</span>
          </button>

          <button
            className="action-pill-btn"
            onClick={() => onActionClick("Plan")}
          >
            <ListTodo size={12} />
            <span>Plan</span>
          </button>

          <div style={{ position: "relative" }}>
            <button
              className="action-pill-btn"
              onClick={() => setShowMoreActions(!showMoreActions)}
            >
              <span>More</span>
              <ChevronDown size={11} />
            </button>
            {showMoreActions && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: 6,
                  background: "#faf6ee",
                  border: "1px solid #dcd1be",
                  borderRadius: 10,
                  boxShadow: "0 6px 18px rgba(0,0,0,0.15)",
                  padding: 6,
                  zIndex: 50,
                  minWidth: 150,
                }}
              >
                <div
                  className="recent-item"
                  onClick={() => {
                    onActionClick("Summarize");
                    setShowMoreActions(false);
                  }}
                >
                  Summarize text
                </div>
                <div
                  className="recent-item"
                  onClick={() => {
                    onActionClick("Convert Units");
                    setShowMoreActions(false);
                  }}
                >
                  Unit converter
                </div>
                <div
                  className="recent-item"
                  onClick={() => {
                    onActionClick("Security Scan");
                    setShowMoreActions(false);
                  }}
                >
                  Security check
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 5 Physical Feature Cards */}
        <div className="feature-cards-row">
          {/* 1. Agentic Reasoning */}
          <div
            className="feature-card"
            onClick={() => onFeatureCardClick("reasoning")}
          >
            <div className="feature-card-header">
              <div className="feature-icon-wrapper">
                <Brain size={16} />
              </div>
              <div className="feature-card-title">
                Agentic
                <br />
                Reasoning
              </div>
            </div>
            <p className="feature-card-desc">
              Breaks down complex problems and takes actions.
            </p>
          </div>

          {/* 2. Knowledge Retrieval */}
          <div
            className="feature-card"
            onClick={() => onFeatureCardClick("knowledge")}
          >
            <div className="feature-card-header">
              <div className="feature-icon-wrapper">
                <BookOpen size={16} />
              </div>
              <div className="feature-card-title">
                Knowledge
                <br />
                Retrieval
              </div>
            </div>
            <p className="feature-card-desc">
              Searches your data and the web.
            </p>
          </div>

          {/* 3. Tool Execution */}
          <div
            className="feature-card"
            onClick={() => onFeatureCardClick("tools")}
          >
            <div className="feature-card-header">
              <div className="feature-icon-wrapper">
                <Wrench size={16} />
              </div>
              <div className="feature-card-title">
                Tool
                <br />
                Execution
              </div>
            </div>
            <p className="feature-card-desc">
              Uses powerful tools to get real work done.
            </p>
          </div>

          {/* 4. Persistent Memory */}
          <div
            className="feature-card"
            onClick={() => onFeatureCardClick("memory")}
          >
            <div className="feature-card-header">
              <div className="feature-icon-wrapper">
                <Archive size={16} />
              </div>
              <div className="feature-card-title">
                Persistent
                <br />
                Memory
              </div>
            </div>
            <p className="feature-card-desc">
              Remembers what matters to you.
            </p>
          </div>

          {/* 5. Auto Failover */}
          <div
            className="feature-card"
            onClick={() => onFeatureCardClick("failover")}
          >
            <div className="feature-card-header">
              <div className="feature-icon-wrapper">
                <RefreshCw size={16} />
              </div>
              <div className="feature-card-title">
                Auto
                <br />
                Failover
              </div>
            </div>
            <p className="feature-card-desc">
              Switches between Gemini and Groq automatically.
            </p>
          </div>
        </div>

        {/* Center Bottom Quote */}
        <div className="center-bottom-quote">
          <div>“A more capable you, for a more open tomorrow.”</div>
          <div className="attribution">— Mark 1 AI</div>
        </div>

        {/* Bottom Desk Still Life Artwork Strip */}
        <div className="desk-still-life-foreground">
          <img
            src="/assets/desk_still_life.jpg"
            alt="Warm rustic desk with leather journal Ideas Plans Progress, gold fountain pen, ceramic mug, and brass globe"
            className="desk-still-life-image"
          />
        </div>
      </div>
    </div>
  );
}
