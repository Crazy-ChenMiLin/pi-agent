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
  // Served through the portal, so it is same-origin: one certificate, one
  // password, and the frame inherits whatever security context the portal has.
  const uiUrl = "/browser-ui/";
  // A frame is only a secure context if every ancestor is one, so over plain
  // HTTP the client refuses to start. Saying that is better than embedding a
  // frame that renders one error.
  const embeddable = window.isSecureContext;

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
            <button
              onClick={() => setShown((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent/12 px-3 py-1.5 text-xs text-accent ring-1 ring-inset ring-accent/25 transition hover:bg-accent/20"
            >
              <LuMonitor className="h-3.5 w-3.5" /> {shown ? "Hide browser" : "Open browser"}
            </button>
            <a
              href={uiUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-fg/5 px-3 py-1.5 text-xs text-fg-muted transition hover:bg-fg/10"
            >
              <LuExternalLink className="h-3.5 w-3.5" /> New tab
            </a>
          </div>
        </header>

        {shown && (
          <section className="mb-6">
            {embeddable ? (
              <div
                ref={frameWrap}
                className="relative overflow-hidden rounded-xl border border-line bg-black"
              >
                <iframe
                  src={uiUrl}
                  title="The agent's browser"
                  className="h-[32rem] w-full border-0"
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
            ) : (
              <div className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs text-fg-muted">
                <LuCircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                <span>
                  The portal is being served over plain HTTP, and the VNC client refuses to run
                  outside a secure context — a frame only counts as secure if every page above it
                  does. Reach the portal over HTTPS and it embeds here; until then,{" "}
                  <a href={uiUrl} target="_blank" rel="noreferrer" className="text-accent underline">
                    open it in a tab
                  </a>
                  .
                </span>
              </div>
            )}
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
