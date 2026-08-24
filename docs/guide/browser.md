# The agent's browser

Optional. Nothing here is installed, pulled or shown unless you ask for it.

A real browser, in its own container, with a profile that stays signed in. You
log into it once by hand; every run after that finds the accounts already there.
**No password ever passes through the model.**

## Turning it on

```bash
docker compose --profile browser up -d
```

Without `--profile browser` the service does not exist: no 4.6GB image, no
container, and the portal hides its Browser page. `docker compose up -d` on an
existing deployment leaves it alone either way.

Set a password first — this thing holds live sessions for the agent's accounts:

```
BROWSER_USER=agent
BROWSER_PASSWORD=<something long>
BROWSER_PORT=3010
BROWSER_HTTPS_PORT=3011
```

## Logging in

**Browser → Open browser** in the portal, or `https://<host>:3011` directly.
That is a full Chromium in a web page: sign into whatever the agent should have,
then close the tab. The profile lives on its own volume and survives restarts.

::: warning HTTPS, and only HTTPS
The VNC client needs a secure context — browsers only expose clipboard and
pointer-lock over HTTPS or on localhost — so the HTTP port answers with
*"This application requires a secure connection"* and nothing else. The
certificate is self-signed; accept it once.
:::

Give the agent **its own accounts** rather than sharing yours. That is what
makes it a teammate rather than a proxy, and it keeps a colleague's request from
reaching your personal mail.

## Letting the agent drive it

The browser reaches the agent as MCP tools. Add one server in
[Settings → MCP](/guide/mcp):

```json
{
  "browser": {
    "command": "npx",
    "args": ["-y", "@playwright/mcp@latest", "--cdp-endpoint", "http://127.0.0.1:9222"]
  }
}
```

`--cdp-endpoint` is the whole trick: it **attaches to the running browser**
instead of launching one. A Playwright MCP server without it starts its own
throwaway Chromium, which is signed into nothing.

::: warning Do not run both
A second, headless Playwright server is a way around everything on this page —
its own browser, no profile, no allowlist. If you have one, remove it.
:::

## Who may drive it

Off by default, everywhere. Turned on per session and per routine — a routine's
own page has the switch.

Deliberately **not** gated on who is speaking. The agent has its own accounts and
uses them as itself, including when it is helping a colleague. What balances
that is visibility: every page it opens is recorded in [Audit](/guide/security).

## Where it may go

**Browser → Where it may go** takes one domain per line, `*.example.com` for
subdomains. Empty means no restriction — the per-session switch is the gate, and
a list nobody filled in should not quietly block everything.

::: warning This is a check, not a wall
It is applied when the agent asks for a URL. A page that redirects itself is not
covered, and neither is a request the agent makes through the debugging protocol
rather than by navigating. Real enforcement is a filtering proxy in front of the
browser, which is not built yet.
:::

## The debugging port

Chromium exposes `127.0.0.1:9222`, and that port is **unauthenticated**. Whoever
reaches it owns every account the browser is signed into.

Host networking is what keeps it to the box. Never publish it, never put it
behind a reverse proxy, and treat the profile volume as the secret it is.
