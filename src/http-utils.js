function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function readBody(req, limit = Infinity) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (Number.isFinite(limit) && size > limit) {
        reject(new Error("请求内容过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req) {
  if (req.__jsonBody !== undefined) return req.__jsonBody;
  const body = await readBody(req, 2 * 1024 * 1024);
  req.__jsonBody = body.length ? JSON.parse(body.toString("utf8")) : {};
  return req.__jsonBody;
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((item) => item.trim().split("="))
      .filter((pair) => pair.length === 2)
  );
}

module.exports = {
  parseCookies,
  readBody,
  readJson,
  sendError,
  sendJson,
};
