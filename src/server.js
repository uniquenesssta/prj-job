const http = require("http");
const os = require("os");
const { enforceCreateAccountPolicy, enforceUpdateAccountPolicy } = require("./account-api-policy");
const { PORT, REMARK_IMAGE_DIR, UPLOAD_DIR } = require("./config");
const { sendError } = require("./http-utils");
const { scheduleDailyOperationLogArchive } = require("./operation-log-archive");
const route = require("./router");
const { ensureStorage } = require("./storage");

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => `http://${item.address}:${PORT}`);
}

async function routeWithPolicies(req, res) {
  try {
    if (req.method === "POST" && req.url.split("?")[0] === "/api/users") {
      if (!(await enforceCreateAccountPolicy(req, res))) return;
    }
    const userUpdate = req.url.split("?")[0].match(/^\/api\/users\/([^/]+)$/);
    if (req.method === "PATCH" && userUpdate) {
      if (!(await enforceUpdateAccountPolicy(req, res, userUpdate[1]))) return;
    }
    return route(req, res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendError(res, 500, error.message || "服务器错误");
  }
}

ensureStorage();
scheduleDailyOperationLogArchive();
http.createServer(routeWithPolicies).listen(PORT, "0.0.0.0", () => {
  console.log(`设计任务执行台已启动：http://localhost:${PORT}`);
  getLanAddresses().forEach((address) => console.log(`局域网访问：${address}`));
  console.log(`上传目录：${UPLOAD_DIR}`);
  console.log(`备注图片目录：${REMARK_IMAGE_DIR}`);
  console.log("默认管理员：admin / admin123");
  console.log("默认客服：kefu / service123");
  console.log("默认设计师：aming / design123，ayan / design123，aqi / design123");
});
