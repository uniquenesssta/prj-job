function render() {
  const view = currentView();
  renderHeader(view);
  renderToolbar(view);
  renderMetrics(view);
  if (view === "overview") renderOverviewPage();
  if (view === "account") renderAccountPage();
  if (view === "designer") renderDesignerPage();
  if (view === "service") renderServicePage();
  if (view === "archived") renderArchivedPage();
  if (view === "maintenance") renderMaintenancePage();
  if (typeof renderPeerViewModal === "function") {
    workspace.insertAdjacentHTML("beforeend", renderPeerViewModal());
    bindPeerViewEvents();
  }
  if (typeof renderTaskDetailModal === "function") {
    const detailModal = renderTaskDetailModal();
    if (detailModal) {
      workspace.insertAdjacentHTML("beforeend", detailModal);
      bindDetailEvents();
    }
  }
}
