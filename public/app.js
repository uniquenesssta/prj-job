function loadOptionalAsset(tagName, attributes) {
  return new Promise((resolve, reject) => {
    const selector = attributes.src ? `${tagName}[src="${attributes.src}"]` : `${tagName}[href="${attributes.href}"]`;
    if (document.querySelector(selector)) {
      resolve();
      return;
    }
    const element = document.createElement(tagName);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    element.addEventListener("load", resolve, { once: true });
    element.addEventListener("error", reject, { once: true });
    document.head.appendChild(element);
  });
}

async function loadAccountDisableTransferAssets() {
  await loadOptionalAsset("link", { rel: "stylesheet", href: "css/account-disable-transfer.css" });
  await loadOptionalAsset("script", { src: "js/components/account-disable-transfer-modal.js" });
}

async function boot() {
  bindStaticEvents();
  try {
    await loadAccountDisableTransferAssets();
    const me = await api("/api/me");
    state.user = me.user;
    await loadData();
    showApp();
    connectEvents();
  } catch {
    showLogin();
  }
}

function showLogin() {
  loginForm.reset();
  loginView.hidden = false;
  appView.hidden = true;
}

function showApp() {
  loginView.hidden = true;
  appView.hidden = false;
  document.querySelector("#currentUser").textContent = `${state.user.name} · ${roleLabels[state.user.role]}`;
  resetAdminTabs();
  render();
}

function ensureMaintenanceTab() {
  if (document.querySelector('[data-admin-view="maintenance"]')) return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.adminView = "maintenance";
  button.textContent = "维护";
  adminTabs.appendChild(button);
}

function resetAdminTabs() {
  if (state.user.role !== "owner") {
    const buttons = [
      '<button class="active" type="button" data-workspace-home="1">工作台</button>',
      userHasPermission("views.other_designers") ? '<button type="button" data-peer-view="designers">其他设计师</button>' : "",
      userHasPermission("views.other_services") ? '<button type="button" data-peer-view="services">其他客服</button>' : "",
    ].filter(Boolean);
    adminTabs.innerHTML = buttons.join("");
    adminTabs.hidden = buttons.length <= 1;
    return;
  }
  adminTabs.innerHTML = `
    <button class="${state.adminView === "overview" ? "active" : ""}" type="button" data-admin-view="overview">总览</button>
    <button class="${state.adminView === "archived" ? "active" : ""}" type="button" data-admin-view="archived">归档</button>
    <button class="${["maintenance", "account"].includes(state.adminView) ? "active" : ""}" type="button" data-admin-view="maintenance">维护</button>
  `;
  adminTabs.hidden = false;
}

boot();
