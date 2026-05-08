const fs = require("fs");
const path = require("path");
const { PUBLIC_DIR } = require("./config");
const { sendError } = require("./http-utils");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".psd": "application/octet-stream",
  ".ai": "application/postscript",
};

function serveStatic(req, res, pathname) {
  let cleanPath;
  try {
    cleanPath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  } catch {
    sendError(res, 400, "访问路径不正确");
    return;
  }
  const filePath = path.resolve(PUBLIC_DIR, `.${cleanPath}`);
  const relative = path.relative(PUBLIC_DIR, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    sendError(res, 403, "无权访问该文件");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendError(res, 404, "页面不存在");
      return;
    }
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(data);
  });
}

module.exports = { serveStatic };
