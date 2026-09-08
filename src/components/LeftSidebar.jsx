import React from "react";
import {
  Home,
  Compass,
  BookOpen,
  Grid,
  Folder,
  Settings,
  Search,
  FileText,
  Plus,
  ChevronLeft,
} from "lucide-react";

export default function LeftSidebar({
  currentNav,
  setCurrentNav,
  onNewChat,
  conversations,
  activeConversationId,
  onSelectConversation,
  onOpenModal,
}) {
  // Separate into Today and Yesterday if not categorized
  const todayList = conversations.filter(
    (c) => !c.category || c.category === "Today"
  );
  const yesterdayList = conversations.filter(
    (c) => c.category === "Yesterday"
  );

  return (
    <aside className="left-sidebar-wrapper">
      <div className="left-sidebar-wood">
        {/* Window Control Buttons */}
        <div className="window-dots">
          <div className="window-dot close" title="Close" />
          <div className="window-dot minimize" title="Minimize" />
          <div className="window-dot maximize" title="Zoom" />
        </div>

        {/* Pinned Parchment Paper Card */}
        <div className="left-sidebar-paper">
          {/* Brand Header */}
          <div className="brand-header">
            <div className="brand-left">
              <div className="brand-badge">M</div>
              <div className="brand-text">
                <h1>Mark 1 AI</h1>
                <p>Think · Search · Build · Solve</p>
              </div>
            </div>
            <button className="brand-collapse-btn" title="Collapse sidebar">
              <ChevronLeft size={16} />
            </button>
          </div>

          {/* Tactile "+ New Chat" Button */}
          <button className="new-chat-btn" onClick={onNewChat}>
            <div className="btn-left">
              <Plus size={16} />
              <span>New Chat</span>
            </div>
            <span className="shortcut-badge">⌘ K</span>
          </button>

          {/* Navigation Items */}
          <nav className="nav-menu">
            <div
              className={`nav-item ${currentNav === "Home" ? "active" : ""}`}
              onClick={() => setCurrentNav("Home")}
            >
              <Home size={16} />
              <span>Home</span>
            </div>

            <div
              className={`nav-item ${currentNav === "Explore" ? "active" : ""}`}
              onClick={() => {
                setCurrentNav("Explore");
                onOpenModal("explore");
              }}
            >
              <Compass size={16} />
              <span>Explore</span>
            </div>

            <div
              className={`nav-item ${currentNav === "Knowledge Base" ? "active" : ""}`}
              onClick={() => {
                setCurrentNav("Knowledge Base");
                onOpenModal("knowledge");
              }}
            >
              <BookOpen size={16} />
              <span>Knowledge Base</span>
            </div>

            <div
              className={`nav-item ${currentNav === "Tools" ? "active" : ""}`}
              onClick={() => {
                setCurrentNav("Tools");
                onOpenModal("tools");
              }}
            >
              <Grid size={16} />
              <span>Tools</span>
            </div>

            <div
              className={`nav-item ${currentNav === "Projects" ? "active" : ""}`}
              onClick={() => {
                setCurrentNav("Projects");
                onOpenModal("projects");
              }}
            >
              <Folder size={16} />
              <span>Projects</span>
            </div>

            <div
              className={`nav-item ${currentNav === "Settings" ? "active" : ""}`}
              onClick={() => {
                setCurrentNav("Settings");
                onOpenModal("settings");
              }}
            >
              <Settings size={16} />
              <span>Settings</span>
            </div>
          </nav>

          {/* Recent Conversations */}
          <div className="recents-header">
            <span>Recent Conversations</span>
            <button className="recents-search-btn" title="Search chats">
              <Search size={14} />
            </button>
          </div>

          {/* Today Group */}
          <div className="recent-group-title">Today</div>
          {todayList.map((conv) => (
            <div
              key={conv.id}
              className={`recent-item ${
                activeConversationId === conv.id ? "active" : ""
              }`}
              onClick={() => onSelectConversation(conv.id)}
              title={conv.title}
            >
              <FileText size={13} />
              <span>{conv.title}</span>
            </div>
          ))}

          {/* Yesterday Group */}
          {yesterdayList.length > 0 && (
            <>
              <div className="recent-group-title">Yesterday</div>
              {yesterdayList.map((conv) => (
                <div
                  key={conv.id}
                  className={`recent-item ${
                    activeConversationId === conv.id ? "active" : ""
                  }`}
                  onClick={() => onSelectConversation(conv.id)}
                  title={conv.title}
                >
                  <FileText size={13} />
                  <span>{conv.title}</span>
                </div>
              ))}
            </>
          )}

          {/* Pinned Polaroid Mountain Photo Card */}
          <div className="polaroid-card-wrapper">
            <div className="polaroid-card">
              <div className="brass-pushpin" />
              <img
                src="/assets/mountain_polaroid.jpg"
                alt="Scenic sunlit mountain ridge"
                className="polaroid-photo"
              />
              <div className="polaroid-caption">
                “Better questions lead to a brighter world.”
              </div>
            </div>
          </div>

          {/* Version Indicator */}
          <div className="sidebar-version">
            <span>Mark 1 AI</span>
            <span>v1.0.0</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
