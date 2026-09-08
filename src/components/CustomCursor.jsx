import React, { useEffect, useState } from "react";

export default function CustomCursor() {
  const [position, setPosition] = useState({ x: -100, y: -100 });
  const [isPointer, setIsPointer] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const onMouseMove = (e) => {
      setPosition({ x: e.clientX, y: e.clientY });
      setIsVisible(true);

      const target = e.target;
      if (target) {
        const isClickable =
          target.closest("button") ||
          target.closest("a") ||
          target.closest(".feature-card") ||
          target.closest(".nav-item") ||
          target.closest(".recent-item") ||
          target.closest(".action-pill-btn") ||
          target.closest(".tool-circle-btn") ||
          target.closest(".model-selector-pill") ||
          target.closest(".model-dropdown-item") ||
          target.closest("input") ||
          target.closest("textarea") ||
          target.closest(".clickable");
        setIsPointer(Boolean(isClickable));
      }
    };

    const onMouseDown = () => setIsPressed(true);
    const onMouseUp = () => setIsPressed(false);
    const onMouseLeave = () => setIsVisible(false);
    const onMouseEnter = () => setIsVisible(true);

    window.addEventListener("pointermove", onMouseMove, { passive: true });
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mousedown", onMouseDown, { passive: true });
    window.addEventListener("mouseup", onMouseUp, { passive: true });
    document.addEventListener("mouseleave", onMouseLeave);
    document.addEventListener("mouseenter", onMouseEnter);

    return () => {
      window.removeEventListener("pointermove", onMouseMove);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("mouseenter", onMouseEnter);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div
      className={`custom-cursor ${isPointer ? "pointer" : ""}`}
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0) ${
          isPressed ? "scale(0.92) rotate(-5deg)" : isPointer ? "scale(1.15)" : "scale(1)"
        }`,
      }}
    >
      {/* Luxury Brass Fountain Pen Nib SVG */}
      <svg
        width="26"
        height="26"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M3 3L11 25L15 17L23 21L25 11L17 15L3 3Z"
          fill="url(#pen_body)"
          stroke="#5c4412"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d="M3 3L13 13"
          stroke="#2b1f09"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <circle cx="13" cy="13" r="1.5" fill="#2b1f09" />
        <defs>
          <linearGradient id="pen_body" x1="3" y1="3" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f7dc8d" />
            <stop offset="0.5" stopColor="#cfa53b" />
            <stop offset="1" stopColor="#87651a" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
