import { useEffect, useRef, useState } from "react";
import {
  LuCircleAlert,
  LuExternalLink,
  LuGlobe,
  LuMaximize,
  LuMonitor,
  LuRefreshCw,
  LuShieldCheck,
} from "react-icons/lu";
import { api, type BrowserStatus } from "../api";

/**
 * The agent's browser.
 *
 * A real one, in its own container, with a profile that stays signed in. You
 * log into it once by hand through the link here; every run after that finds
 * the accounts already there, and no password ever reaches the model.
 */
export function BrowserPage({ onOpenSession }: { onOpenSession: (id: string) => void }) {
  const [status, setStatus] = useState<BrowserStatus | null>(null);
  const [allowlist, setAllowlist] = useState("");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const frameWrap = useRef<HTMLDivElement>(null);

  const load = () =>
    api
      .browser()
      .then((s) => {
        setStatus(s);
        if (!dirty) setAllowlist(s.allowlist);
      })
      .catch((e) => setError((e as Error).message));

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [dirty]);

  if (!status) {
    return (
      <div className="h-full overflow-y-auto px-4 py-6">
        <p className="mx-auto flex w-full max-w-3xl items-center gap-2 text-sm text-fg-subtle">
          <LuRefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading…
        </p>
      </div>
    );
  }

  // Built here rather than server-side: the portal does not reliably know what
  // hostname you reached it on, and the browser you are reading this in does.
  // A frame is only a secure context if every ancestor is one, so over plain
  // HTTP the client refuses to start whichever route it is reached by.
  const embeddable = window.isSecureContext;

  // Through the portal when that is secure — one certificate, one password, and
  // the frame inherits the context. Otherwise straight at the browser's own
  // HTTPS port, which is a secure context on its own. Pointing the fallback at
  // the proxy would have offered a link to the same dead end.
  const uiUrl = embeddable
    ? "/browser-ui/"
    : `https://${window.location.hostname}:${status.uiPort}/`;

  return (
    <div className="h-full overflow-y-auto px-4 py-6">
      <div className="mx-auto w-full max-w-3xl">
        {error && (
          <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <header className="mb-5 rounded-2xl border border-line bg-gradient-to-br from-accent/10 via-transparent to-transparent px-5 py-5">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">
              <LuGlobe className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-fg">Browser</h2>
              <p className="mt-0.5 max-w-xl text-sm text-fg-muted">
                A real browser with a profile that stays logged in. Sign into it once here; every
                run after that finds the accounts already there, and no password reaches the
                model.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs ${
                status.running ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {status.running ? (status.version ?? "running") : "not running"}
            </span>
            {embeddable && (
              <button
                onClick={() => setShown((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent/12 px-3 py-1.5 text-xs text-accent ring-1 ring-inset ring-accent/25 transition hover:bg-accent/20"
              >
                <LuMonitor className="h-3.5 w-3.5" /> {shown ? "Hide browser" : "Open browser"}
              </button>
            )}
            <a
              href={uiUrl}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition ${
                embeddable
                  ? "bg-fg/5 text-fg-muted hover:bg-fg/10"
                  : "bg-accent/12 text-accent ring-1 ring-inset ring-accent/25 hover:bg-accent/20"
              }`}
            >
              <LuExternalLink className="h-3.5 w-3.5" />
              {embeddable ? "New tab" : "Open browser"}
            </a>
          </div>
        </header>

        {status.unprotected && (
          <div className="mb-5 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-fg-muted">
            <LuCircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <span>
              <strong className="text-danger">This browser has no password.</strong> Anyone who can
              reach it drives a browser signed into the agent's accounts. Set{" "}
              <span className="font-mono">BROWSER_PASSWORD</span> in <span className="font-mono">.env</span>{" "}
              and recreate the container.
            </span>
          </div>
        )}

        {!embeddable && (
          <div className="mb-5 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs text-fg-muted">
            <LuCircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <span>
              The portal is on plain HTTP, so the browser cannot be embedded — a frame only counts
              as secure when every page above it does. <strong>Open browser</strong> still works:
              it goes straight to the browser's own HTTPS port, which is secure on its own. Give
              the portal a certificate and it embeds here instead.
            </span>
          </div>
        )}

        {shown && embeddable && (
          <section className="mb-6">
            <div
                ref={frameWrap}
                // The height lives on the wrapper so fullscreen can override
                // it. On the iframe it stayed at 32rem and left the bottom of
                // the screen black.
                className="relative h-[32rem] overflow-hidden rounded-xl border border-line bg-black [&:fullscreen]:h-screen [&:fullscreen]:rounded-none [&:fullscreen]:border-0"
              >
                <iframe
                  src={uiUrl}
                  title="The agent's browser"
                  className="h-full w-full border-0"
                  // The VNC client wants the keyboard and the clipboard.
                  allow="clipboard-read; clipboard-write; fullscreen"
                />
                <button
                  onClick={() => frameWrap.current?.requestFullscreen?.()}
                  className="absolute right-2 top-2 rounded-lg bg-canvas/80 px-2 py-1 text-[11px] text-fg-muted backdrop-blur transition hover:text-fg"
                >
                  <LuMaximize className="mr-1 inline h-3 w-3" /> Fullscreen
                </button>
              </div>
          </section>
        )}

        {status.pages.length > 0 && (
          <section className="mb-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              Open now
            </h3>
            <ul className="space-y-1">
              {status.pages.map((p, i) => (
                <li
                  key={i}
                  className="rounded-xl border border-line bg-raised/40 px-3 py-2"
                >
                  <p className="truncate text-sm text-fg">{p.title || "Untitled"}</p>
                  <p className="truncate font-mono text-[11px] text-fg-faint">{p.url}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mb-6">
          <div className="mb-1.5 flex items-center gap-2">
            <LuShieldCheck className="h-3.5 w-3.5 text-fg-faint" />
            <h3 className="text-sm font-medium text-fg">Where it may go</h3>
            {dirty && (
              <button
                onClick={async () => {
                  try {
                    await api.setBrowserAllowlist(allowlist);
                    setDirty(false);
                    await load();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
                className="ml-auto rounded-lg bg-accent/12 px-3 py-1.5 text-xs text-accent ring-1 ring-inset ring-accent/25 transition hover:bg-accent/20"
              >
                Save
              </button>
            )}
          </div>
          <p className="mb-2 text-[11px] text-fg-faint">
            One domain per line. <span className="font-mono">*.example.com</span> covers its
            subdomains. Leave it empty for no restriction — the per-session switch is the gate,
            and a list nobody filled in should not quietly block everything.
          </p>
          <textarea
            rows={4}
            value={allowlist}
            onChange={(e) => {
              setAllowlist(e.target.value);
              setDirty(true);
            }}
            placeholder={"*.google.com\ngithub.com"}
            className="w-full rounded-lg border border-line bg-raised/60 px-3 py-2 font-mono text-xs outline-none transition placeholder:text-fg-faint focus:border-accent/60"
          />
          <p className="mt-1.5 text-[11px] text-fg-faint">
            Checked when the agent asks for a URL, and every allowed one is recorded in Audit. A
            page that redirects itself is not covered — that needs a filtering proxy, which is not
            built yet.
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium text-fg">Who may drive it</h3>
          {status.sessions.length === 0 && status.routines.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-3 py-5 text-center text-xs text-fg-faint">
              Nobody yet. The browser is off by default; turn it on for a session under the chat
              box, or for a routine on its own page.
            </p>
          ) : (
            <ul className="space-y-1">
              {status.sessions.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => onOpenSession(s.id)}
                    className="flex w-full items-center gap-2 rounded-xl border border-line bg-raised/40 px-3 py-2 text-left transition hover:bg-fg/5"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">{s.title}</span>
                    <span className="shrink-0 text-[11px] text-fg-faint">{s.kind}</span>
                  </button>
                </li>
              ))}
              {status.routines.map((r) => (
                <li
                  key={r.slug}
                  className="flex items-center gap-2 rounded-xl border border-line bg-raised/40 px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{r.name}</span>
                  <span className="shrink-0 text-[11px] text-fg-faint">routine</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {!status.running && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs text-fg-muted">
            <LuCircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            The browser container is not answering. It is a separate service —{" "}
            <span className="font-mono">docker compose up -d browser</span> on the host that runs
            the portal.
          </p>
        )}
      </div>
    </div>
  );
}
