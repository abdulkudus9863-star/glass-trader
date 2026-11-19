import { AlertTriangle, RotateCw, RefreshCw, ChevronDown } from "lucide-react";
import React from "react";

interface Props {
  children: React.ReactNode;
  /** Short label shown in the recovery screen, e.g. "Admin dashboard". */
  scope?: string;
  /** Called once when the user presses Retry, before the subtree re-mounts. */
  onRetry?: () => void;
}

interface State {
  error: Error | null;
  componentStack: string;
  attempt: number;
}

/**
 * Application error boundary.
 *
 * A crash inside one panel must never blank the whole app: the boundary shows
 * a professional recovery screen with the technical details (logged to the
 * console as well) and a Retry button that re-mounts the subtree. User data is
 * untouched — Convex state lives on the server and only transient form state
 * inside the crashed subtree is lost.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, componentStack: "", attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? "" });
    // Never hide the error: full details stay available for debugging.
    console.error(
      `[GlassTrader] Render crash${this.props.scope ? ` in ${this.props.scope}` : ""}:`,
      error,
      info.componentStack,
    );
  }

  private retry = () => {
    this.props.onRetry?.();
    this.setState((s) => ({
      error: null,
      componentStack: "",
      attempt: s.attempt + 1,
    }));
  };

  private hardReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return (
        <React.Fragment key={this.state.attempt}>
          {this.props.children}
        </React.Fragment>
      );
    }

    const { error, componentStack } = this.state;
    const details = [error.stack, componentStack].filter(Boolean).join("\n\n");

    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center bg-[#050811] p-6">
        <div className="w-full max-w-lg rounded-2xl border border-[#1B263B] bg-[#0D1424] p-6 shadow-xl">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 ring-1 ring-amber-400/25">
              <AlertTriangle className="size-5 text-amber-300" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#F4C430]">
                {this.props.scope ?? "Application"}
              </p>
              <h2 className="font-display text-lg font-bold text-foreground">
                Something went wrong
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                This panel stopped rendering. Your account, wallet and saved
                data are safe on the server. Retry to reload this view.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2">
            <p className="break-words font-mono text-[11px] leading-5 text-amber-200/90">
              {error.message || "Unknown runtime error"}
            </p>
          </div>

          {details && (
            <details className="mt-3 group">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-slate-200">
                <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
                Technical details
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[#1B263B] bg-black/30 p-3 font-mono text-[10px] leading-4 text-slate-400">
                {details}
              </pre>
            </details>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.retry}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-[#F4C430] px-4 font-display text-xs font-bold text-[#0a0e1a] transition-colors hover:bg-[#F4C430]/85"
            >
              <RotateCw className="size-3.5" />
              Retry
            </button>
            <button
              type="button"
              onClick={this.hardReload}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-[#1B263B] bg-white/[0.03] px-4 font-display text-xs font-bold text-slate-300 transition-colors hover:text-white"
            >
              <RefreshCw className="size-3.5" />
              Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
