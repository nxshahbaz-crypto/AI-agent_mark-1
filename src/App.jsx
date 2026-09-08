import React, { useState, useEffect } from "react";
import LeftSidebar from "./components/LeftSidebar";
import RightSidebar from "./components/RightSidebar";
import CenterHero from "./components/CenterHero";
import Modals from "./components/Modals";
import CustomCursor from "./components/CustomCursor";
import SkeuomorphicToast from "./components/SkeuomorphicToast";
import { generateConversationTitle } from "./utils/titleGenerator";

export default function App() {
  const [currentNav, setCurrentNav] = useState("Home");
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [searchWebActive, setSearchWebActive] = useState(false);
  const [activeModel, setActiveModel] = useState("Mark 1 AI");
  const [activeModal, setActiveModal] = useState(null);
  const [toast, setToast] = useState(null);

  const [systemStatus, setSystemStatus] = useState({
    status: "Online",
    primaryProvider: "gemini",
    fallbackProvider: "groq",
    forcePrimaryFailure: false,
    metrics: { latencyMs: 520, tokensPerSec: 12.4 },
  });

  const [liveMetrics, setLiveMetrics] = useState({ latencyMs: 520, tokensPerSec: 12.4 });
  const [toolsList, setToolsList] = useState([]);

  const [liveActivity, setLiveActivity] = useState([
    { title: "Ready", desc: "Agent initialized", active: true },
    { title: "Knowledge base connected", desc: "Supabase", active: false },
    { title: "Tools loaded", desc: "12 tools available", active: false },
    { title: "Memory ready", desc: "Conversation history enabled", active: false },
    { title: "Waiting for your input...", desc: "Idle", active: false },
  ]);

  const showToast = ({ title, message, type = "info", duration = 4500 }) => {
    setToast({ title, message, type, duration });
  };

  // Initial Data Fetch
  useEffect(() => {
    fetchStatus();
    fetchConversations();
    fetchTools();
  }, []);

  // Keyboard shortcut: ⌘ K for New Chat
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      setSystemStatus(data);
      if (data.primaryProvider === "gemini") {
        setActiveModel(data.forcePrimaryFailure ? "Mark 1 AI (Auto Failover)" : "Mark 1 AI · Gemini");
      } else if (data.primaryProvider === "groq") {
        setActiveModel("Mark 1 AI · Groq");
      }
      if (data.metrics) setLiveMetrics(data.metrics);
    } catch {
      // Fallback
    }
  };

  const fetchConversations = async () => {
    try {
      const res = await fetch("/api/conversations");
      const data = await res.json();
      if (data.conversations && data.conversations.length > 0) {
        setConversations(data.conversations);
        if (!activeConversationId) {
          setActiveConversationId(data.conversations[0].id);
        }
      }
    } catch {
      // Fallback
    }
  };

  const fetchTools = async () => {
    try {
      const res = await fetch("/api/tools");
      const data = await res.json();
      if (data.tools) setToolsList(data.tools);
    } catch {
      // Fallback
    }
  };

  const handleSelectConversation = async (id) => {
    setActiveConversationId(id);
    try {
      const res = await fetch(`/api/conversations/${id}/messages`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {
      setMessages([]);
    }
  };

  const handleNewChat = () => {
    const newId = "conv-" + Date.now();
    const newConv = {
      id: newId,
      title: "New Conversation",
      category: "Today",
      created_at: new Date().toISOString(),
      messages: [],
    };
    setConversations([newConv, ...conversations]);
    setActiveConversationId(newId);
    setMessages([]);
    setInputPrompt("");
    showToast({
      title: "New Chat Started",
      message: "Ready for your query. Ask Mark 1 AI anything.",
      type: "info",
      duration: 3000,
    });
  };

  const handleSendMessage = async (userText) => {
    if (!userText.trim() || isLoading) return;

    const trimmedInput = userText.trim();
    const newMsg = { role: "user", content: trimmedInput };
    setMessages((prev) => [...prev, newMsg]);
    setInputPrompt("");
    setIsLoading(true);

    // ChatGPT-like automatic title generation from first message
    const currentConv = conversations.find((c) => c.id === activeConversationId);
    const isFirstMessage =
      !currentConv ||
      currentConv.title === "New Conversation" ||
      currentConv.title === "Untitled Conversation" ||
      messages.length === 0;

    let generatedTitle = null;
    if (isFirstMessage) {
      generatedTitle = generateConversationTitle(trimmedInput);
      // Immediately update title in recent conversations list
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversationId ? { ...c, title: generatedTitle } : c
        )
      );
    }

    // Update Live Activity steps
    setLiveActivity([
      { title: "Input validated", desc: "Security guardrails checked", active: true },
      { title: "Knowledge search", desc: "Querying pgvector...", active: true },
      { title: "Planning loop", desc: "Determining tool requirements", active: true },
      { title: "Executing tools", desc: "Evaluating response", active: true },
      { title: "Synthesizing answer", desc: "Streaming response", active: true },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmedInput,
          conversationId: activeConversationId,
          title: generatedTitle,
          searchWeb: searchWebActive,
        }),
      });

      const data = await res.json();

      if (data.stats) {
        setLiveMetrics({
          latencyMs: data.stats.latencyMs || 480,
          tokensPerSec: data.stats.tokensPerSec || 14.2,
        });
      }

      // If backend confirmed or refined the conversation title, update it
      if (data.conversationTitle) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConversationId
              ? { ...c, title: data.conversationTitle }
              : c
          )
        );
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          content: data.reply || "Done.",
          toolCalls: data.toolCalls || [],
          steps: data.steps,
          provider: data.provider,
        },
      ]);

      // Reset activity to ready state
      setLiveActivity([
        { title: "Ready", desc: `Handled by ${data.provider || "Gemini"}`, active: true },
        { title: "Knowledge base connected", desc: "Supabase pgvector", active: false },
        { title: "Tools loaded", desc: "12 tools ready", active: false },
        { title: "Memory ready", desc: "Conversation saved", active: false },
        { title: "Waiting for your input...", desc: "Idle", active: false },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          content: `Error communicating with backend: ${err.message}. Check that the API server is running on port 3001.`,
        },
      ]);
      showToast({
        title: "Communication Error",
        message: err.message,
        type: "warning",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchProvider = async (providerOverride, forceFailureOverride) => {
    try {
      const nextProvider =
        providerOverride ||
        (systemStatus?.primaryProvider === "gemini" ? "groq" : "gemini");

      const res = await fetch("/api/provider/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: nextProvider,
          forceFailure: forceFailureOverride,
        }),
      });
      const data = await res.json();
      setSystemStatus((prev) => ({
        ...prev,
        primaryProvider: data.primaryProvider,
        fallbackProvider: data.fallbackProvider,
        forcePrimaryFailure: data.forcePrimaryFailure,
      }));
    } catch {
      // Fallback
    }
  };

  const handleSelectModel = async (modelKey) => {
    if (modelKey === "gemini") {
      setActiveModel("Mark 1 AI · Gemini");
      await handleSwitchProvider("gemini", false);
      showToast({
        title: "Provider Switched",
        message: "Active provider set to Gemini 1.5 Flash (Primary).",
        type: "success",
      });
    } else if (modelKey === "groq") {
      setActiveModel("Mark 1 AI · Groq");
      await handleSwitchProvider("groq", false);
      showToast({
        title: "Provider Switched",
        message: "Active provider set to Groq Llama 3.3 (70B).",
        type: "success",
      });
    } else if (modelKey === "failover") {
      setActiveModel("Mark 1 AI (Auto Failover)");
      await handleSwitchProvider("gemini", true);
      showToast({
        title: "Auto Failover Active",
        message: "Gemini primary active with simulated Groq failover on errors.",
        type: "feature",
      });
    }
  };

  const handleActionClick = (actionName) => {
    switch (actionName) {
      case "Reason":
        setInputPrompt("Analyze step-by-step: Why is pgvector HNSW indexing faster than IVFFlat?");
        break;
      case "Search":
        setSearchWebActive(true);
        setInputPrompt("What are the latest benchmarks for multimodal AI agents?");
        break;
      case "Code":
        setInputPrompt("Write a resilient Node.js circuit breaker class for Gemini and Groq API calls.");
        break;
      case "Analyze":
        setInputPrompt("Compare token latency and throughput between Gemini 1.5 Flash and Groq Llama-3.3-70b.");
        break;
      case "Create":
        setInputPrompt("Create a 4-week architectural roadmap to scale our agentic tool execution pipeline.");
        break;
      case "Plan":
        setInputPrompt("Generate a comprehensive test matrix for multi-turn conversational agents with tool failover.");
        break;
      case "Summarize":
        setInputPrompt("Summarize the key architectural benefits of RAG chunking and context budget trimming.");
        break;
      case "Convert Units":
        setInputPrompt("What is 100 kilometers in miles and 28 Celsius in Fahrenheit?");
        break;
      case "Security Scan":
        setInputPrompt("Check how prototype pollution and prompt injection attempts are neutralized.");
        break;
      default:
        break;
    }
  };

  const handleFeatureCardClick = (featureKey) => {
    switch (featureKey) {
      case "reasoning":
        setInputPrompt("Break down and solve: A train travels at 90 km/h for 2.5 hours, then 120 km/h for 1.5 hours. What is the total distance and average speed?");
        break;
      case "knowledge":
        setActiveModal("knowledge");
        break;
      case "tools":
        setActiveModal("tools");
        break;
      case "memory":
        showToast({
          title: "Persistent Memory Active",
          message: "Conversations and messages are automatically preserved in Supabase and retrieved for contextual turns.",
          type: "success",
        });
        break;
      case "failover":
        setActiveModal("settings");
        break;
      default:
        break;
    }
  };

  return (
    <div className="app-container">
      {/* Custom Fountain Pen Cursor */}
      <CustomCursor />

      {/* In-App Skeuomorphic Toast Notification */}
      <SkeuomorphicToast toast={toast} onClose={() => setToast(null)} />

      {/* Left Navigation Sidebar */}
      <LeftSidebar
        currentNav={currentNav}
        setCurrentNav={setCurrentNav}
        onNewChat={handleNewChat}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onOpenModal={(modal) => setActiveModal(modal)}
      />

      {/* Center Main Workspace & Input Console */}
      <CenterHero
        inputPrompt={inputPrompt}
        setInputPrompt={setInputPrompt}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        messages={messages}
        onActionClick={handleActionClick}
        onFeatureCardClick={handleFeatureCardClick}
        searchWebActive={searchWebActive}
        setSearchWebActive={setSearchWebActive}
        activeModel={activeModel}
        onSelectModel={handleSelectModel}
        onShowToast={showToast}
      />

      {/* Right Sidebar Status & Activity Tracker */}
      <RightSidebar
        systemStatus={systemStatus}
        onSwitchProvider={() => handleSwitchProvider()}
        onOpenModal={(modal) => setActiveModal(modal)}
        liveActivity={liveActivity}
        liveMetrics={liveMetrics}
      />

      {/* Modals */}
      <Modals
        activeModal={activeModal}
        onClose={() => setActiveModal(null)}
        systemStatus={systemStatus}
        onSwitchProvider={handleSwitchProvider}
        toolsList={toolsList}
      />
    </div>
  );
}
