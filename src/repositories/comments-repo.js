const { getDatabase } = require("../database");

function listComments(db = getDatabase()) {
  return db.prepare("SELECT * FROM comments ORDER BY createdAt, rowid").all();
}

function insertComments(comments, db = getDatabase()) {
  const insert = db.prepare("INSERT INTO comments (id, taskId, authorId, text, createdAt) VALUES (?, ?, ?, ?, ?)");
  (comments || []).forEach((comment) => {
    insert.run(comment.id, comment.taskId, comment.authorId, comment.text || "", comment.createdAt || new Date().toISOString());
  });
}

function replaceComments(comments, db = getDatabase()) {
  db.exec("DELETE FROM comments");
  insertComments(comments, db);
}

module.exports = {
  insertComments,
  listComments,
  replaceComments,
};
