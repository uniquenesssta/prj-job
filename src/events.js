const eventClients = new Set();

function broadcast(type, payload = {}) {
  const data = `event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`;
  for (const res of eventClients) {
    res.write(data);
  }
}

function handleEvents(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  eventClients.add(res);
  req.on("close", () => {
    eventClients.delete(res);
  });
}

module.exports = { broadcast, handleEvents };
