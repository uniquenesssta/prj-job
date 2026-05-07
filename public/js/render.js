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
}
