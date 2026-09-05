/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Used by VoiceConversationOverlay's phase-based animation (listening
      // breathe/rings, thinking dots, speaking equalizer bars) — see
      // components/chat/VoiceConversationOverlay.tsx.
      keyframes: {
        "voice-breathe": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.08)" },
        },
        "voice-ring": {
          "0%": { transform: "scale(0.85)", opacity: "0.55" },
          "100%": { transform: "scale(1.7)", opacity: "0" },
        },
        "voice-bar": {
          "0%, 100%": { transform: "scaleY(0.35)" },
          "50%": { transform: "scaleY(1)" },
        },
        "voice-dot": {
          "0%, 80%, 100%": { transform: "translateY(0)", opacity: "0.5" },
          "40%": { transform: "translateY(-6px)", opacity: "1" },
        },
      },
      animation: {
        "voice-breathe": "voice-breathe 2.4s ease-in-out infinite",
        "voice-ring": "voice-ring 2.2s ease-out infinite",
        "voice-bar": "voice-bar 0.9s ease-in-out infinite",
        "voice-dot": "voice-dot 1.1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
