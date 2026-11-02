/* Octo Buddy shared page protection, role-aware navigation and logout. */
(function () {
  const LOGIN_PATH = "../signin_login/project.html";
  const role = () => String(localStorage.getItem("role") || localStorage.getItem("user_role") || "").toLowerCase();
  const hasSession = () => Boolean(localStorage.getItem("auth_token") && localStorage.getItem("user_id"));

  const path = window.location.pathname.toLowerCase();
  let allowed = null;
  if (path.includes("/student/student.html")) allowed = ["student"];
  else if (path.includes("/dashboard/dashboard.html") || path.includes("/dashboard/my-students.html")) allowed = ["buddy", "octo buddy"];
  else if (path.includes("/octobuddy/apply.html")) allowed = ["student"];
  else if (path.includes("/admin/admin.html")) allowed = ["admin"];
  else if (path.includes("/sessions/sessions.html")) allowed = ["student", "buddy", "octo buddy"];

  if (allowed && (!hasSession() || !allowed.includes(role()))) {
    window.location.replace(LOGIN_PATH);
    return;
  }

  function dashboardForRole() {
    const currentRole = role();
    if (currentRole === "admin") return "../Admin/admin.html";
    if (currentRole === "buddy" || currentRole === "octo buddy") return "../Dashboard/Dashboard.html";
    return "../Student/student.html";
  }

  function clearOctoSession() {
    [
      "auth_token", "user_id", "user", "first_name", "last_name",
      "role", "user_role", "active_buddy_room", "access_token"
    ].forEach(key => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
    window.location.replace(LOGIN_PATH);
  }

  window.octoLogout = clearOctoSession;
  window.octoDashboardPath = dashboardForRole;

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('a[href*="Dashboard.html"], a[href*="student.html"], a[href*="admin.html"]').forEach(link => {
      if (link.closest("#adminSidebar")) return;
      link.setAttribute("href", dashboardForRole());
    });
    document.querySelectorAll('a[href*="Logout"], a[href*="logout"], a[data-octo-logout]').forEach(link => {
      link.addEventListener("click", event => {
        event.preventDefault();
        clearOctoSession();
      });
    });
  });
})();
