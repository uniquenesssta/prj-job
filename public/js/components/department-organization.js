function mountDepartmentOrganization(view) {
  if (view !== "account" || state.accountModal !== "departments") return;
  enhanceDepartmentOrganizationForm();
  enhanceDepartmentPreviewTree();
}

function enhanceDepartmentOrganizationForm() {
  const formGrid = document.querySelector(".department-form-grid");
  if (!formGrid || document.querySelector("#departmentOrgFields")) return;
  const editing = state.departmentEditingId ? state.departments.find((item) => item.id === state.departmentEditingId) : null;
  const managerOptions = state.users
    .filter((user) => !user.disabledAt && !user.deletedAt)
    .map((user) => `<option value="${user.id}" ${editing?.managerId === user.id ? "selected" : ""}>${escapeHtml(user.name)} · ${roleLabels[user.role] || user.role}</option>`)
    .join("");
  const parentOptions = renderParentDepartmentOptions(editing);
  const directChildOptions = renderDirectChildDepartmentOptions(editing);
  const childScopeOptions = renderChildDepartmentScopeOptions(editing);
  formGrid.insertAdjacentHTML(
    "beforeend",
    `
      <div class="department-org-fields wide-field" id="departmentOrgFields">
        <section class="department-child-scope">
          <strong>上级部门</strong>
          <p>一个部门可以同时归属多个上级部门；不勾选表示没有上级部门。</p>
          <div>${parentOptions || '<span class="muted-text">暂无可选上级部门</span>'}</div>
        </section>
        <label>
          <span>部门主管</span>
          <select name="managerId">
            <option value="">暂不指定</option>
            ${managerOptions}
          </select>
        </label>
        <section class="department-child-scope">
          <strong>直属下级部门</strong>
          <p>在编辑上级部门时多选它下面的直属下级部门；保存后当前部门会成为这些部门的其中一个上级。</p>
          <div>${directChildOptions || '<span class="muted-text">新增部门保存后可分配直属下级</span>'}</div>
        </section>
        <label class="department-org-check">
          <input type="checkbox" name="allowViewOwnDepartmentTasks" value="true" ${normalizeDepartmentFlag(editing?.allowViewOwnDepartmentTasks) ? "checked" : ""} />
          <span>允许查看本部门任务</span>
        </label>
        <label class="department-org-check">
          <input type="checkbox" name="allowViewChildDepartmentTasks" value="true" ${normalizeDepartmentFlag(editing?.allowViewChildDepartmentTasks) ? "checked" : ""} />
          <span>允许查看下级部门任务</span>
        </label>
        <section class="department-child-scope">
          <strong>可查看的下级部门范围</strong>
          <p>这是权限范围，不是组织归属。不勾选时默认查看全部下级；勾选后只查看选中部门及其子部门。</p>
          <div>${childScopeOptions || '<span class="muted-text">当前没有下级部门可选</span>'}</div>
        </section>
      </div>
    `
  );
}

function renderParentDepartmentOptions(editing) {
  const currentId = editing?.id || "";
  const selected = new Set(departmentParents(editing));
  return state.departments
    .filter((department) => department.id !== currentId && !department.deletedAt && (!currentId || !isDepartmentDescendant(currentId, department.id)))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "zh-Hans-CN"))
    .map((department) => `
      <label class="department-org-check child-scope-check">
        <input type="checkbox" name="parentDepartmentIds" value="${department.id}" ${selected.has(department.id) ? "checked" : ""} />
        <span>${escapeHtml(department.name)}</span>
      </label>
    `).join("");
}

function renderDirectChildDepartmentOptions(editing) {
  if (!editing?.id) return "";
  const candidates = state.departments
    .filter((department) => department.id !== editing.id && !department.deletedAt && !isDepartmentDescendant(department.id, editing.id))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "zh-Hans-CN"));
  return candidates.map((department) => {
    const parents = departmentParents(department);
    const parentNames = parents.filter((id) => id !== editing.id).map(departmentNameById).filter(Boolean);
    return `
      <label class="department-org-check child-scope-check">
        <input type="checkbox" name="directChildDepartmentIds" value="${department.id}" ${parents.includes(editing.id) ? "checked" : ""} />
        <span>${escapeHtml(department.name)}${parentNames.length ? `（其它上级：${escapeHtml(parentNames.join("、"))}）` : ""}</span>
      </label>
    `;
  }).join("");
}

function renderChildDepartmentScopeOptions(editing) {
  if (!editing?.id) return "";
  const selected = new Set(parseJsonArray(editing.childDepartmentScope));
  return flattenDepartmentTree(buildDepartmentTree())
    .filter((item) => item.department.id !== editing.id && isDepartmentDescendant(editing.id, item.department.id))
    .map((item) => {
      const prefix = "　".repeat(Math.max(0, item.depth - 1)) + (item.depth ? "└ " : "");
      return `
        <label class="department-org-check child-scope-check">
          <input type="checkbox" name="childDepartmentScope" value="${item.department.id}" ${selected.has(item.department.id) ? "checked" : ""} />
          <span>${prefix}${escapeHtml(item.department.name)}</span>
        </label>
      `;
    })
    .join("");
}

function isDepartmentDescendant(parentId, departmentId) {
  const queue = [departmentId];
  const visited = new Set();
  while (queue.length) {
    const cursor = queue.shift();
    if (visited.has(cursor)) continue;
    visited.add(cursor);
    const department = state.departments.find((dept) => dept.id === cursor);
    const parents = departmentParents(department);
    if (parents.includes(parentId)) return true;
    queue.push(...parents);
  }
  return false;
}

function departmentParents(department) {
  const parents = parseJsonArray(department?.parentDepartmentIds);
  if (department?.parentId && !parents.includes(department.parentId)) parents.unshift(department.parentId);
  return [...new Set(parents.filter(Boolean))];
}

function departmentNameById(id) {
  return state.departments.find((department) => department.id === id)?.name || "未知部门";
}

function enhanceDepartmentPreviewTree() {
  const preview = document.querySelector(".department-preview");
  if (!preview || preview.dataset.organizationEnhanced === "1") return;
  preview.dataset.organizationEnhanced = "1";
  preview.querySelectorAll(":scope > article").forEach((node) => node.remove());
  const tree = buildDepartmentTree();
  preview.insertAdjacentHTML("beforeend", renderDepartmentTree(tree));
}

function buildDepartmentTree() {
  const departments = [...state.departments].sort((a, b) => String(a.name).localeCompare(String(b.name), "zh-Hans-CN"));
  const hasParent = (department) => departmentParents(department).length > 0;
  const visitedPath = new Set();
  const build = (parentId = "", depth = 0) => departments
    .filter((department) => parentId ? departmentParents(department).includes(parentId) : !hasParent(department))
    .map((department) => {
      const key = `${parentId}:${department.id}`;
      if (visitedPath.has(key)) return null;
      visitedPath.add(key);
      return { department, depth, children: build(department.id, depth + 1) };
    })
    .filter(Boolean);
  return build("");
}

function flattenDepartmentTree(nodes) {
  return nodes.flatMap((node) => [{ department: node.department, depth: node.depth }, ...flattenDepartmentTree(node.children)]);
}

function renderDepartmentTree(nodes) {
  if (!nodes.length) return '<div class="empty">暂无部门</div>';
  return `<div class="department-org-tree">${nodes.map(renderDepartmentTreeNode).join("")}</div>`;
}

function renderDepartmentTreeNode(node) {
  const dept = node.department;
  const manager = state.users.find((user) => user.id === dept.managerId);
  const scopedCount = parseJsonArray(dept.childDepartmentScope).length;
  const parents = departmentParents(dept).map(departmentNameById).filter(Boolean);
  return `
    <article class="department-org-node ${dept.disabledAt ? "disabled" : ""}" style="--dept-depth:${node.depth}">
      <div>
        <strong>${escapeHtml(dept.name)}</strong>
        <span>${escapeHtml(dept.description || "暂无说明")}</span>
        <small>上级：${parents.length ? escapeHtml(parents.join("、")) : "无"} · 默认角色：${departmentRoleLabel(dept)} · 主管：${manager ? escapeHtml(manager.name) : "未指定"}</small>
        <small>${normalizeDepartmentFlag(dept.allowViewOwnDepartmentTasks) ? "可看本部门" : "不可看本部门"} · ${normalizeDepartmentFlag(dept.allowViewChildDepartmentTasks) ? `可看下级${scopedCount ? `（已选 ${scopedCount} 个范围）` : "（全部）"}` : "不可看下级"}</small>
      </div>
      <div class="account-actions">
        <button type="button" data-department-action="edit" data-department-id="${dept.id}">编辑</button>
        <button type="button" data-department-action="toggle" data-department-id="${dept.id}">${dept.disabledAt ? "启用" : "禁用"}</button>
      </div>
    </article>
    ${node.children.map(renderDepartmentTreeNode).join("")}
  `;
}

function normalizeDepartmentFlag(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function parseJsonArray(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value || "[]") : value;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function handleDepartmentSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const departmentId = form.get("id");
  const parentDepartmentIds = form.getAll("parentDepartmentIds");
  const body = {
    name: form.get("name"),
    description: form.get("description"),
    defaultRole: form.get("defaultRole"),
    customRoleName: form.get("customRoleName"),
    disabled: form.get("disabled"),
    parentId: parentDepartmentIds[0] || "",
    parentDepartmentIds: JSON.stringify(parentDepartmentIds),
    managerId: form.get("managerId"),
    allowViewOwnDepartmentTasks: form.has("allowViewOwnDepartmentTasks") ? "true" : "false",
    allowViewChildDepartmentTasks: form.has("allowViewChildDepartmentTasks") ? "true" : "false",
    directChildDepartmentIds: JSON.stringify(form.getAll("directChildDepartmentIds")),
    childDepartmentScope: JSON.stringify(form.getAll("childDepartmentScope")),
    permissionPreset: JSON.stringify(normalizePermissionFormData(form)),
  };
  const message = document.querySelector("#departmentMessage");
  if (message) message.textContent = "";
  try {
    if (departmentId) {
      await api(`/api/departments/${departmentId}`, { method: "PATCH", body });
    } else {
      await api("/api/departments", { method: "POST", body });
    }
    await refreshDepartments();
    state.departmentEditingId = "";
    render();
  } catch (error) {
    if (message) {
      message.style.color = "#cf4d40";
      message.textContent = error.message;
    }
  }
}
