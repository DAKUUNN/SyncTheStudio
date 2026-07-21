import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Top-level safety net — without this, any render error anywhere in the
 *  tree (a bad chunk, a null-check miss, a third-party lib throwing) blanks
 *  the entire app instead of just failing visibly. React's Suspense only
 *  covers the loading state of lazy imports; it does not catch render
 *  errors, so this class component (the only way to implement
 *  getDerivedStateFromError) is still required alongside it. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            height: "100vh",
            display: "grid",
            placeItems: "center",
            background: "linear-gradient(160deg, #0a0a0b, #131316 65%, #0a0a0b)",
            color: "#e2e8f0",
            padding: 24,
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 440 }}>
            <h1 style={{ color: "#fff", marginBottom: 8 }}>Etwas ist schiefgelaufen</h1>
            <p style={{ opacity: 0.7, marginBottom: 20, fontSize: "0.9rem" }}>
              {this.state.error.message || "Unbekannter Fehler"}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: "linear-gradient(135deg, #8d6bff, #a652ff)",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "10px 22px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Neu laden
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
