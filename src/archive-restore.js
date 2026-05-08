const fs = require("fs");
const path = require("path");

const ARCHIVE_MANIFEST = "manifest.json";

function readArchiveManifestFromDirectory(archivePath) {
  const manifestPath = path.join(archivePath, ARCHIVE_MANIFEST);
  if (!fs.existsSync(manifestPath)) {
    throw new Error("归档包缺少 manifest.json，不能执行结构化恢复");
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function validateArchiveManifest(manifest) {
  if (!manifest || manifest.archiveVersion !== 1 || manifest.archiveType !== "task-project") {
    return { ok: false, error: "归档清单版本不受支持" };
  }
  if (!manifest.taskId || !manifest.taskSnapshot) {
    return { ok: false, error: "归档清单缺少任务快照" };
  }
  return { ok: true };
}

function buildArchiveRestorePlan(manifest, options = {}) {
  const validation = validateArchiveManifest(manifest);
  if (!validation.ok) return validation;
  return {
    ok: true,
    mode: options.mode || "reuse-task-id",
    taskId: manifest.taskId,
    fileCount: (manifest.files || []).length,
    commentCount: (manifest.comments || []).length,
    remarkCount: (manifest.remarkRecords || []).length,
    needsImplementation: true,
  };
}

async function restoreTaskFromArchivePackage() {
  throw new Error("归档包结构化恢复接口已预留，尚未启用：后续需要接入 zip 解包、文件重建、任务/留言/备注重建事务");
}

module.exports = {
  ARCHIVE_MANIFEST,
  buildArchiveRestorePlan,
  readArchiveManifestFromDirectory,
  restoreTaskFromArchivePackage,
  validateArchiveManifest,
};
