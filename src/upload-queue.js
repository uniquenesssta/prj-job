let uploadQueue = Promise.resolve();
let pendingUploads = 0;

function enqueueUpload(work) {
  pendingUploads += 1;
  const run = uploadQueue.then(work, work);
  uploadQueue = run.catch(() => {});
  return run.finally(() => {
    pendingUploads -= 1;
  });
}

function getUploadQueueStatus() {
  return { pendingUploads };
}

module.exports = {
  enqueueUpload,
  getUploadQueueStatus,
};
