const http = require("http");
const os = require("os");
const { PORT, REMARK_IMAGE_DIR, UPLOAD_DIR } = require("./config");
const { scheduleDailyOperationLogArchive } = require("./operation-log-archive");
const route = require("./router");
const { ensureStorage } = require("./storage");

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => `http://${item.address}:${PORT}`);
}

ensureStorage();
scheduleDailyOperationLogArchive();
http.createServer(route).listen(PORT, "0.0.0.0", () => {
  console.log(`设计任务执行台已启动：http://localhost:${PORT}`);
  getLanAddresses().forEach((address) => console.log(`局域网访问：${address}`));
  console.log(`上传目录：${UPLOAD_DIR}`);
  console.log(`备注图片目录：${REMARK_IMAGE_DIR}`);
  console.log("默认管理员：admin / admin123");
  console.log("默认客服：kefu / service123");
  console.log("默认设计师：aming / design123，ayan / design123，aqi / design123");
});
