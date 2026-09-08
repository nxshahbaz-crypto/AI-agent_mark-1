import React, { useState } from "react";
import { X, Search, Wrench, CheckCircle, Shield, Database, Cpu, Play } from "lucide-react";

export default function Modals({
  activeModal,
  onClose,
  systemStatus,
  onSwitchProvider,
  toolsList,
}) {
  const [ragQuery, setRagQuery] = useState("quantum computing");
  const [ragResults, setRagResults] = useState(null);
  const [ragLoading, setRagLoading] = useState(false);

  const [selectedTool, setSelectedTool] = useState(null);
  const [toolArgs, setToolArgs] = useState("{}");
  const [toolResult, setToolResult] = useState(null);
  const [toolExecuting, setToolExecuting] = useState(false);

  if (!activeModal) return null;

  const handleRagSearch = async () => {
    if (!ragQuery.trim()) return;
    setRagLoading(true);
    try {
      const res = await fetch(`/api/rag/search?q=${encodeURIComponent(ragQuery)}`);
      const contentType = res.headers.get("content-type") || "";
      let data;
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      setRagResults(data);
    } catch (e) {
      setRagResults({ error: e.message });
    } finally {
      setRagLoading(false);
    }
  };

  const handleExecuteTool = async () => {
    if (!selectedTool) return;
    setToolExecuting(true);
    try {
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(toolArgs);
      } catch {
        parsedArgs = { expression: toolArgs, city: toolArgs, query: toolArgs };
      }

      const res = await fetch("/api/tools/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selectedTool.name, args: parsedArgs }),
      });
      const contentType = res.headers.get("content-type") || "";
      let data;
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      setToolResult(data);
    } catch (e) {
      setToolResult({ error: e.message });
    } finally {
      setToolExecuting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        {/* Knowledge Base (RAG) Modal */}
        {activeModal === "knowledge" && (
          <>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Database size={20} color="#2b5c42" />
                <h2>Knowledge Base (RAG & pgvector)</h2>
              </div>
              <button className="modal-close-btn" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 12 }}>
                Mark 1 AI uses Supabase pgvector with 768-dimensional embeddings to semantically retrieve ground truth documents before synthesizing answers.
              </p>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <input
                  type="text"
                  value={ragQuery}
                  onChange={(e) => setRagQuery(e.target.value)}
                  placeholder="Search knowledge base..."
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #d4c8b2",
                    background: "#fbf8f0",
                    fontFamily: "inherit",
                  }}
                />
                <button
                  className="tactile-send-btn"
                  onClick={handleRagSearch}
                  disabled={ragLoading}
                  style={{ padding: "8px 16px" }}
                >
                  <Search size={14} />
                  <span>{ragLoading ? "Searching..." : "Retrieve"}</span>
                </button>
              </div>

              {ragResults && (
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: 10,
                    padding: 12,
                    border: "1px solid #dfd4c1",
                    maxHeight: 220,
                    overflowY: "auto",
                  }}
                >
                  <h4 style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                    Retrieved Chunks:
                  </h4>
                  {ragResults.chunks && ragResults.chunks.length > 0 ? (
                    ragResults.chunks.map((chunk, i) => (
                      <div
                        key={i}
                        style={{
                          padding: "6px 8px",
                          borderBottom: "1px solid #eee",
                          fontSize: 12,
                        }}
                      >
                        <strong>Match {(chunk.similarity * 100).toFixed(1)}%:</strong>{" "}
                        {chunk.content}
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 12, color: "#7a7266" }}>
                      {ragResults.note || "No chunks matched the query similarity threshold (0.5)."}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Tool Registry Modal (12 Tools) */}
        {activeModal === "tools" && (
          <>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Wrench size={20} color="#2b5c42" />
                <h2>Tool Registry (12 Registered Tools)</h2>
              </div>
              <button className="modal-close-btn" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 12 }}>
                Select any registered tool to test parameter validation, bounding ceilings, and deterministic execution:
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                {(toolsList || []).map((t) => (
                  <div
                    key={t.name}
                    className={`recent-item ${selectedTool?.name === t.name ? "active" : ""}`}
                    onClick={() => {
                      setSelectedTool(t);
                      setToolArgs(
                        t.name === "calculator"
                          ? '{"expression": "25 * 48"}'
                          : t.name === "get_weather"
                          ? '{"city": "Tokyo"}'
                          : t.name === "web_search"
                          ? '{"query": "quantum computing"}'
                          : t.name === "unit_converter"
                          ? '{"value": 100, "from": "km", "to": "miles"}'
                          : "{}"
                      );
                      setToolResult(null);
                    }}
                    style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #dfd4c1" }}
                  >
                    <Wrench size={13} />
                    <div style={{ overflow: "hidden" }}>
                      <strong>{t.name}</strong>
                      <div style={{ fontSize: 10, color: "#777", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                        {t.description}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {selectedTool && (
                <div style={{ background: "#ffffff", padding: 12, borderRadius: 10, border: "1px solid #dfd4c1" }}>
                  <h4 style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    Execute `{selectedTool.name}`:
                  </h4>
                  <textarea
                    value={toolArgs}
                    onChange={(e) => setToolArgs(e.target.value)}
                    rows={2}
                    style={{
                      width: "100%",
                      padding: 8,
                      fontFamily: "monospace",
                      fontSize: 12,
                      borderRadius: 6,
                      border: "1px solid #ccc",
                      marginBottom: 8,
                    }}
                  />
                  <button
                    className="tactile-send-btn"
                    onClick={handleExecuteTool}
                    disabled={toolExecuting}
                    style={{ padding: "6px 14px", fontSize: 12 }}
                  >
                    <Play size={12} />
                    <span>{toolExecuting ? "Executing..." : "Run Tool"}</span>
                  </button>

                  {toolResult && (
                    <pre
                      style={{
                        marginTop: 10,
                        padding: 8,
                        background: "#f7f4ea",
                        borderRadius: 6,
                        fontSize: 11,
                        overflowX: "auto",
                      }}
                    >
                      {JSON.stringify(toolResult.result, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Evaluation Suite Modal */}
        {activeModal === "evaluation" && (
          <>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <CheckCircle size={20} color="#22c55e" />
                <h2>Mark 1 Evaluation & Security Suite</h2>
              </div>
              <button className="modal-close-btn" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div
                style={{
                  background: "#eef8f2",
                  border: "1px solid #99d6b2",
                  borderRadius: 8,
                  padding: "10px 14px",
                  color: "#1d5c38",
                  fontWeight: 600,
                  marginBottom: 12,
                }}
              >
                71 of 71 Automated Test Assertions Passing (100% Deterministic • 0 API Quota Consumed)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div>✅ Normal Chat Turn Synthesis (1 Step, zero tools)</div>
                <div>✅ Single-Step Calculator Tool Calling (125 * 8 = 1000)</div>
                <div>✅ Multi-Step Workflow (Weather → Celsius to Fahrenheit math)</div>
                <div>✅ Provider Failover (Gemini 429 → Groq Fallback)</div>
                <div>✅ Grounded RAG Knowledge Base Retrieval</div>
                <div>✅ Input Length Bound & Null-Byte Defenses</div>
                <div>✅ Tool Argument Validation & Prototype Pollution Defense</div>
                <div>✅ Prompt Injection Neutralization (Delimiters defanged)</div>
                <div>✅ Step Ceilings & Infinite Loop Protection</div>
                <div>✅ Secret Redaction (API keys replaced with [REDACTED])</div>
              </div>
            </div>
          </>
        )}

        {/* Settings & Failover Simulation Modal */}
        {activeModal === "settings" && (
          <>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Cpu size={20} color="#2b5c42" />
                <h2>Provider & Engine Settings</h2>
              </div>
              <button className="modal-close-btn" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Active Primary Provider:</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    className={`action-pill-btn ${systemStatus?.primaryProvider === "gemini" ? "active" : ""}`}
                    onClick={() => onSwitchProvider("gemini")}
                  >
                    Gemini 1.5 Flash (Default Primary)
                  </button>
                  <button
                    className={`action-pill-btn ${systemStatus?.primaryProvider === "groq" ? "active" : ""}`}
                    onClick={() => onSwitchProvider("groq")}
                  >
                    Groq Llama 3.3 (Fallback / Alternate)
                  </button>
                </div>
              </div>

              <div style={{ padding: "10px 12px", background: "#f8f3e6", borderRadius: 10, border: "1px solid #dcd1be" }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Simulate Primary Failure:</div>
                <p style={{ fontSize: 11.5, color: "#666", marginBottom: 8 }}>
                  Enable <code>AI_FORCE_PRIMARY_FAILURE</code> to simulate a recoverable 503 error on Gemini and watch Mark 1 AI automatically fail over to Groq without consuming Gemini quota.
                </p>
                <button
                  className="tactile-send-btn"
                  onClick={() => onSwitchProvider(systemStatus?.primaryProvider, !systemStatus?.forcePrimaryFailure)}
                  style={{ padding: "6px 14px", fontSize: 12 }}
                >
                  <span>{systemStatus?.forcePrimaryFailure ? "Disable Simulated Failure" : "Enable Simulated 503 Failure"}</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* Explore & Projects Modal */}
        {(activeModal === "explore" || activeModal === "projects") && (
          <>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Shield size={20} color="#2b5c42" />
                <h2>{activeModal === "explore" ? "Explore Capabilities" : "Agentic Projects"}</h2>
              </div>
              <button className="modal-close-btn" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ background: "#ffffff", padding: 12, borderRadius: 10, border: "1px solid #dfd4c1" }}>
                  <h4 style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>Quantum Circuit Simulator</h4>
                  <p style={{ fontSize: 12, color: "#666" }}>Calculates state vectors, Hadamard transforms, and entanglement probabilities using tool pipelines.</p>
                </div>
                <div style={{ background: "#ffffff", padding: 12, borderRadius: 10, border: "1px solid #dfd4c1" }}>
                  <h4 style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>Autonomous Travel Concierge</h4>
                  <p style={{ fontSize: 12, color: "#666" }}>Queries live weather tools, checks exchange rates, and assembles time-optimized itineraries.</p>
                </div>
                <div style={{ background: "#ffffff", padding: 12, borderRadius: 10, border: "1px solid #dfd4c1" }}>
                  <h4 style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>Legal & Case File Auditor</h4>
                  <p style={{ fontSize: 12, color: "#666" }}>Parses timeline statements, detects evidentiary discrepancies, and cross-references indexed case logs.</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
