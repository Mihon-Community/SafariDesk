const http = require("node:http");

// The already-running ngrok agent forwards to localhost:8000, while SafariDesk
// listens on 3001. Forward only the authenticated AT callback routes so this
// bridge does not expose the rest of the backend through that tunnel.
const bridgePort = Number(process.env.AT_NGROK_BRIDGE_PORT || 8000);
const backendPort = Number(process.env.PORT || 3001);
const callbackPaths = new Set([
  "/ussd",
  "/webhook/incoming",
  "/api/webhooks/africastalking/sms-status",
]);

function handleCallback(req, res) {
  const path = (req.url || "/").split("?", 1)[0];
  if (req.method !== "POST" || !callbackPaths.has(path)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found.");
    return;
  }

  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;

  const upstream = http.request(
    {
      host: "127.0.0.1",
      port: backendPort,
      method: req.method,
      path: req.url,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    }
    res.end("Callback backend is unavailable.");
  });
  req.on("aborted", () => upstream.destroy());
  req.pipe(upstream);
}

function listen(host, ipv6Only = false) {
  const server = http.createServer(handleCallback);
  server.on("error", (error) => {
    // Avoid printing request URLs, query tokens, headers, or callback bodies.
    process.stderr.write(`Africa's Talking callback bridge failed (${error.code || "startup_error"}).\n`);
    process.exitCode = 1;
  });
  server.listen({ host, port: bridgePort, ...(ipv6Only ? { ipv6Only: true } : {}) }, () => {
    process.stdout.write(`Africa's Talking callback bridge listening on ${host}:${bridgePort}.\n`);
  });
}

listen("127.0.0.1");
listen("::1", true);
