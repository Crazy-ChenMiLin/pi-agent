import http from "node:http";
import https from "node:https";
import type { Duplex } from "node:stream";
import type { Express } from "express";

/**
 * The agent's browser, served through the portal.
 *
 * Two reasons this is a proxy rather than a link to port 3011:
 *
 * The VNC client refuses to run outside a secure context, and a secure context
 * needs every ancestor to be trustworthy — so an HTTPS iframe inside the portal
 * is only secure if the portal itself is. Same-origin means it inherits
 * whatever the portal has instead of needing its own.
 *
 * And it removes a second credential and a second certificate: the portal has
 * already decided who you are, so it holds the browser's password rather than
 * asking you for it again.
 */

const UPSTREAM_HOST = process.env.BROWSER_HOST || "127.0.0.1";
const UPSTREAM_PORT = Number(process.env.BROWSER_HTTPS_PORT || 3011);
const PREFIX = "/browser-ui";

const auth = () => {
  const user = process.env.BROWSER_USER || "agent";
  const pass = process.env.BROWSER_PASSWORD || "";
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
};

/** Self-signed upstream on loopback: verifying it would mean pinning our own cert. */
const agent = new https.Agent({ rejectUnauthorized: false });

const upstreamPath = (url: string) => url.slice(PREFIX.length) || "/";

export function mountBrowserProxy(app: Express, server: http.Server): void {
  app.use(PREFIX, (req, res) => {
    const proxied = https.request(
      {
        host: UPSTREAM_HOST,
        port: UPSTREAM_PORT,
        // Express strips the mount path from req.url, so it is already relative.
        path: req.url || "/",
        method: req.method,
        headers: { ...req.headers, host: `${UPSTREAM_HOST}:${UPSTREAM_PORT}`, authorization: auth() },
        agent,
      },
      (upstream) => {
        res.writeHead(upstream.statusCode ?? 502, upstream.headers);
        upstream.pipe(res);
      }
    );
    proxied.on("error", (e) => {
      if (!res.headersSent) res.status(502);
      res.end(`The browser is not answering: ${e.message}`);
    });
    req.pipe(proxied);
  });

  // The VNC stream itself. Express never sees an upgrade, so it is handled on
  // the server: without this the page loads and then shows a blank screen.
  server.on("upgrade", (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!req.url?.startsWith(PREFIX)) return;
    const proxied = https.request({
      host: UPSTREAM_HOST,
      port: UPSTREAM_PORT,
      path: upstreamPath(req.url),
      method: "GET",
      headers: { ...req.headers, host: `${UPSTREAM_HOST}:${UPSTREAM_PORT}`, authorization: auth() },
      agent,
    });
    proxied.end();

    proxied.on("upgrade", (upstreamRes, upstreamSocket, upstreamHead) => {
      const lines = Object.entries(upstreamRes.headers).map(([k, v]) => `${k}: ${v}`);
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${lines.join("\r\n")}\r\n\r\n`);
      if (upstreamHead?.length) socket.unshift(upstreamHead);
      if (head?.length) upstreamSocket.unshift(head);
      upstreamSocket.pipe(socket).pipe(upstreamSocket);
      const close = () => {
        upstreamSocket.destroy();
        socket.destroy();
      };
      socket.on("error", close);
      upstreamSocket.on("error", close);
    });
    proxied.on("error", () => socket.destroy());
  });
}
