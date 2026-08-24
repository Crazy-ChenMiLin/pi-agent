import express, { type Router } from "express";
import { browserAllowlist, getDb, setBrowserAllowlist, type SessionRow } from "../db.js";

/**
 * The agent's browser: whether it is up, who may drive it, and where to.
 *
 * The browser itself runs in its own container with its own profile — a human
 * logs into it once and every later run finds itself already signed in. The
 * portal owns none of that; it owns the question of which sessions may reach it.
 */

const CDP = process.env.BROWSER_CDP_URL || "http://127.0.0.1:9222";
/**
 * The HTTPS port, not the HTTP one.
 *
 * KasmVNC refuses to run outside a secure context — it needs clipboard and
 * pointer-lock, which browsers only expose over HTTPS or on localhost. Over
 * plain HTTP from a LAN address it renders one error and nothing else.
 */
const UI_PORT = process.env.BROWSER_HTTPS_PORT || "3011";

export function browserRouter(): Router {
  const router = express.Router();

  router.get("/browser", async (_req, res) => {
    let version: string | null = null;
    let pages: { title: string; url: string }[] = [];
    try {
      const v = await fetch(`${CDP}/json/version`, { signal: AbortSignal.timeout(4000) });
      version = ((await v.json()) as { Browser?: string }).Browser ?? null;
      const l = await fetch(`${CDP}/json/list`, { signal: AbortSignal.timeout(4000) });
      pages = ((await l.json()) as { type: string; title: string; url: string }[])
        .filter((t) => t.type === "page")
        .map((t) => ({ title: t.title, url: t.url }));
    } catch {
      // Not running is a normal state rather than an error: the sidecar is
      // optional, and the portal works without it.
    }

    const sessions = getDb()
      .prepare("SELECT * FROM sessions WHERE browser = 1 ORDER BY updated_at DESC")
      .all() as SessionRow[];
    const routines = getDb()
      .prepare("SELECT slug, name FROM routines WHERE browser = 1")
      .all() as { slug: string; name: string }[];

    res.json({
      running: Boolean(version),
      version,
      pages,
      uiPort: UI_PORT,
      allowlist: browserAllowlist().join("\n"),
      sessions: sessions.map((s) => ({ id: s.id, title: s.title, kind: s.kind })),
      routines,
    });
  });

  /** Domains the browser may be pointed at. Empty means no restriction. */
  router.put("/browser/allowlist", (req, res) => {
    const domains = req.body?.domains;
    if (typeof domains !== "string") return res.status(400).json({ error: "domains required" });
    setBrowserAllowlist(domains);
    res.json({ allowlist: browserAllowlist().join("\n") });
  });

  /**
   * Turn the browser on or off for one session. Takes effect on its next
   * launch: the tool list is fixed when pi starts.
   */
  router.put("/sessions/:id/browser", (req, res) => {
    const on = Boolean(req.body?.enabled);
    const row = getDb().prepare("SELECT id FROM sessions WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });
    getDb().prepare("UPDATE sessions SET browser = ? WHERE id = ?").run(on ? 1 : 0, req.params.id);
    res.json({ enabled: on });
  });

  return router;
}
