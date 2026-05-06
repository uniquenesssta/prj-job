async function boot() {
  bindStaticEvents();
  try {
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
  adminTabs.hidden = state.user.role !== "owner";
  render();
}

boot();
