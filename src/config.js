const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const CONFIG_FILE = path.join(ROOT, "config", "config.json");
const CONFIG = loadConfig();
const DATA_DIR = resolvePath(CONFIG.dataDir, "data");
const UPLOAD_DIR = resolvePath(CONFIG.uploadDir, path.join("data", "uploads"));
const DB_FILE = path.join(DATA_DIR, "db.json");
const COMMENT_FILE = path.join(DATA_DIR, "comments.json");
const ARCHIVE_DIR = resolvePath(CONFIG.archiveDir, path.join("data", "archives"));

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch (error) {
    console.warn(`config.json 读取失败，将使用默认配置：${error.message}`);
    return {};
  }
}

function resolvePath(value, fallback) {
  const raw = String(value || "").trim() || fallback;
  return path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
}

module.exports = {
  ARCHIVE_DIR,
  COMMENT_FILE,
  CONFIG,
  CONFIG_FILE,
  DATA_DIR,
  DB_FILE,
  PORT,
  PUBLIC_DIR,
  ROOT,
  UPLOAD_DIR,
};
