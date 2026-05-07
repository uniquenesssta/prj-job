const { URL } = require("url");
const { sendError } = require("./http-utils");
const { handleArchiveDoneTasks, handleArchiveOneTask } = require("./archive");
const {
  handleCreateUser,
  handleLogin,
  handleLogout,
  handleMe,
  handleUpdateUser,
  handleUsers,
  requireUser,
} = require("./auth");
const { handleCreateComment, handleGetComments } = require("./comments");
const { handleCreateDepartment, handleGetDepartments, handleUpdateDepartment } = require("./departments");
const { handleEvents } = require("./events");
const { handleDeleteFile, handleDownload, handleInlineFile, handleUpload } = require("./files");
const {
  handleArchiveOperationLogs,
  handleCleanMissingFiles,
  handleMaintenanceSummary,
  handleOperationLogs,
  handleScanMissingFiles,
  handleScanOrphanFiles,
} = require("./maintenance");
const { handleGetPersonalNote, handlePutPersonalNote } = require("./notes");
const { handleCreateRemark } = require("./remarks");
const { serveStatic } = require("./static");
const {
  handleCreateTask,
  handleDeleteTask,
  handleGetTasks,
  handleRestoreTask,
  handleUpdateTask,
} = require("./tasks");

function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  Promise.resolve()
    .then(async () => {
      if (req.method === "POST" && pathname === "/api/login") return handleLogin(req, res);
      if (req.method === "POST" && pathname === "/api/logout") return handleLogout(req, res);
      if (req.method === "GET" && pathname === "/api/me") return handleMe(req, res);
      if (req.method === "GET" && pathname === "/api/events") {
        const user = requireUser(req, res);
        if (!user) return;
        return handleEvents(req, res);
      }
      if (req.method === "GET" && pathname === "/api/users") return handleUsers(req, res);
      if (req.method === "POST" && pathname === "/api/users") return handleCreateUser(req, res);
      if (req.method === "GET" && pathname === "/api/departments") return handleGetDepartments(req, res);
      if (req.method === "POST" && pathname === "/api/departments") return handleCreateDepartment(req, res);
      const departmentUpdate = pathname.match(/^\/api\/departments\/([^/]+)$/);
      if (req.method === "PATCH" && departmentUpdate) return handleUpdateDepartment(req, res, departmentUpdate[1]);
      const userUpdate = pathname.match(/^\/api\/users\/([^/]+)$/);
      if (req.method === "PATCH" && userUpdate) return handleUpdateUser(req, res, userUpdate[1]);
      if (req.method === "GET" && pathname === "/api/maintenance/summary") return handleMaintenanceSummary(req, res);
      if (req.method === "POST" && pathname === "/api/maintenance/scan-missing-files") return handleScanMissingFiles(req, res);
      if (req.method === "POST" && pathname === "/api/maintenance/clean-missing-files") return handleCleanMissingFiles(req, res);
      if (req.method === "POST" && pathname === "/api/maintenance/scan-orphan-files") return handleScanOrphanFiles(req, res);
      if (req.method === "POST" && pathname === "/api/maintenance/archive-operation-logs") return handleArchiveOperationLogs(req, res);
      if (req.method === "GET" && pathname === "/api/operation-logs") return handleOperationLogs(req, res);
      if (req.method === "POST" && pathname === "/api/archive") return handleArchiveDoneTasks(req, res);
      if (req.method === "GET" && pathname === "/api/tasks") return handleGetTasks(req, res);
      if (req.method === "POST" && pathname === "/api/tasks") return handleCreateTask(req, res);
      const taskArchive = pathname.match(/^\/api\/tasks\/([^/]+)\/archive$/);
      if (req.method === "POST" && taskArchive) return handleArchiveOneTask(req, res, taskArchive[1]);
      const taskRestore = pathname.match(/^\/api\/tasks\/([^/]+)\/restore$/);
      if (req.method === "POST" && taskRestore) return handleRestoreTask(req, res, taskRestore[1]);
      const taskUpdate = pathname.match(/^\/api\/tasks\/([^/]+)$/);
      if (req.method === "PATCH" && taskUpdate) return handleUpdateTask(req, res, taskUpdate[1]);
      if (req.method === "DELETE" && taskUpdate) return handleDeleteTask(req, res, taskUpdate[1]);
      const upload = pathname.match(/^\/api\/tasks\/([^/]+)\/upload$/);
      if (req.method === "POST" && upload) return handleUpload(req, res, upload[1]);
      const remark = pathname.match(/^\/api\/tasks\/([^/]+)\/remarks$/);
      if (req.method === "POST" && remark) return handleCreateRemark(req, res, remark[1]);
      const comment = pathname.match(/^\/api\/tasks\/([^/]+)\/comments$/);
      if (req.method === "GET" && comment) return handleGetComments(req, res, comment[1]);
      if (req.method === "POST" && comment) return handleCreateComment(req, res, comment[1]);
      const personalNote = pathname.match(/^\/api\/tasks\/([^/]+)\/personal-note$/);
      if (req.method === "GET" && personalNote) return handleGetPersonalNote(req, res, personalNote[1]);
      if (req.method === "PUT" && personalNote) return handlePutPersonalNote(req, res, personalNote[1]);
      const inlineFile = pathname.match(/^\/api\/files\/([^/]+)\/inline$/);
      if (req.method === "GET" && inlineFile) return handleInlineFile(req, res, inlineFile[1]);
      const download = pathname.match(/^\/api\/files\/([^/]+)$/);
      if (req.method === "GET" && download) return handleDownload(req, res, download[1]);
      if (req.method === "DELETE" && download) return handleDeleteFile(req, res, download[1]);
      if (req.method === "GET") return serveStatic(req, res, pathname);
      sendError(res, 405, "不支持的请求");
    })
    .catch((error) => {
      console.error(error);
      if (!res.headersSent) sendError(res, 500, error.message || "服务器错误");
    });
}

module.exports = route;
