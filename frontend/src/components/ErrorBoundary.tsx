import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global error boundary — if any child component crashes during render,
 * this catches the error, logs it to the console, and shows a friendly
 * message instead of a blank screen.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log the full error + component stack to the browser console
    console.error("ErrorBoundary caught an error:", error);
    console.error("Component stack:", info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#F4F6FA",
            fontFamily: "'Inter', system-ui, sans-serif",
            padding: 24,
          }}
        >
          <div
            style={{
              background: "#fff",
              border: "1px solid #E2E8F0",
              borderRadius: 16,
              padding: "32px 40px",
              maxWidth: 480,
              textAlign: "center",
              boxShadow: "0 4px 24px rgba(15,42,74,0.08)",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F2A4A", margin: 0, marginBottom: 8 }}>
              Бір нәрсе дұрыс жұмыс істемеді
            </h1>
            <p style={{ fontSize: 14, color: "#64748B", margin: 0, marginBottom: 20, lineHeight: 1.5 }}>
              Бетті жаңартып көріңіз (F5). Қате толығымен консольге жазылды.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: "#0F2A4A",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 24px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Бетті жаңарту
            </button>
            {this.state.error && (
              <pre
                style={{
                  marginTop: 20,
                  fontSize: 11,
                  color: "#DC2626",
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: 8,
                  padding: 12,
                  overflow: "auto",
                  maxHeight: 120,
                  textAlign: "left",
                }}
              >
                {this.state.error.message}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
