/* =========================================================
   OCTO BUDDY - CAMPUS ADMIN DASHBOARD
   ---------------------------------------------------------
   This file connects the existing admin design to the Flask API.
   The HTML/CSS layout is intentionally kept intact.

   Main responsibilities:
   - Load real database information
   - Review Buddy applications
   - Display students and Buddies
   - Schedule tutoring sessions
   - Render the real weekly schedule
   - Build reports and leaderboard data
   - Keep simple qualification/module settings in localStorage
   - Handle logout and admin-page protection
========================================================= */

const API_BASE_URL = (window.OCTOBUDDY_API_BASE_URL || "https://studybuddy-bl8d.onrender.com/api/").replace(/\/?$/, "/");

async function apiFetch(url, options = {}) {
    const token = localStorage.getItem("auth_token") || "";
    const headers = new Headers(options.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        clearLogin();
        window.location.href = "../signin_login/project.html";
    }
    return response;
}

let allUsers = [];
let allBuddies = [];
let allSessions = [];
let allAdminBookings = [];
let currentWeekStart = startOfWeek(new Date());

/* Run all page setup once the HTML has loaded. */
document.addEventListener("DOMContentLoaded", async () => {
    if (!checkAdminLogin()) return;

    setupNavigation();
    setupApplicationActions();
    setupStudentSearch();
    setupFilters();
    setupSessionModal();
    setupCalendarButtons();
    setupQualificationButtons();
    setupAdminActions();
    setupMobileMenu();
    setupAdminManagementControls();

    await refreshAdminData();
});

/* =========================================================
   BASIC ADMIN ACCESS CHECK
========================================================= */

function checkAdminLogin() {
    const storedUser = localStorage.getItem("user");
    const storedRole = (localStorage.getItem("role") || "").toLowerCase();

    // If the admin page is opened directly without logging in,
    // send the visitor back to the normal login page.
    if (!storedUser || storedRole !== "admin" || !localStorage.getItem("auth_token")) {
        alert(storedUser ? "You do not have Campus Manager access." : "Please log in to continue.");
        window.location.href = "../signin_login/project.html";
        return false;
    }
    return true;
}

/* Refresh everything that comes from the database. */
async function refreshAdminData() {
    await Promise.all([
        loadAdminDashboard(),
        loadApplications(),
        loadStudents(),
        loadBuddies(),
        loadSchedule(),
        loadAdminBookings(),
        loadLeaderboard(),
        loadReports()
    ]);
}

/* =========================================================
   SECTION NAVIGATION
========================================================= */

function setupNavigation() {
    const navItems = document.querySelectorAll(".nav-item");
    const sections = document.querySelectorAll(".content-section");
    const pageTitle = document.getElementById("pageTitle");

    function showSection(sectionId) {
        sections.forEach(section => section.classList.remove("active-section"));

        const selectedSection = document.getElementById(sectionId);
        if (selectedSection) selectedSection.classList.add("active-section");

        navItems.forEach(item => {
            item.classList.toggle("active", item.dataset.section === sectionId);
        });

        const activeNav = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
        if (activeNav && pageTitle) {
            pageTitle.textContent = activeNav.innerText.replace(/\d+/g, "").trim();
        }

        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    navItems.forEach(item => {
        item.addEventListener("click", () => showSection(item.dataset.section));
    });

    document.querySelectorAll("[data-section-link]").forEach(button => {
        button.addEventListener("click", () => showSection(button.dataset.sectionLink));
    });
}

/* =========================================================
   DASHBOARD
========================================================= */

async function loadAdminDashboard() {
    try {
        const response = await apiFetch(`${API_BASE_URL}admin/dashboard`);
        if (!response.ok) throw new Error("Dashboard request failed");

        const data = await response.json();
        const stats = data.stats || {};

        setText("pendingCount", stats.pending_applications || 0);

        // The original dashboard did not give the stat numbers IDs.
        // Select the five cards in their existing visual order.
        const statValues = document.querySelectorAll("#dashboard .stat-card strong");
        if (statValues.length >= 5) {
            statValues[0].textContent = stats.pending_applications || 0;
            statValues[1].textContent = stats.students || 0;
            statValues[2].textContent = stats.buddies || 0;
            statValues[3].textContent = stats.today_sessions || 0;
            statValues[4].textContent = stats.completed_sessions || 0;
        }

        // Replace the static application preview with real applications.
        const preview = document.querySelector("#dashboard .application-preview");
        if (preview) {
            const applications = data.recent_applications || [];
            preview.innerHTML = applications.length
                ? applications.map(application => `
                    <div class="application-row">
                        <div class="person-avatar">${escapeHtml(initials(application.full_name))}</div>
                        <div class="person-info">
                            <strong>${escapeHtml(application.full_name)}</strong>
                            <span>${escapeHtml(application.qualification || "")}</span>
                        </div>
                        <span class="status ${escapeHtml(application.status.toLowerCase())}">
                            ${escapeHtml(application.status)}
                        </span>
                    </div>
                `).join("")
                : `<div class="application-row"><span>No Buddy applications yet.</span></div>`;
        }
    } catch (error) {
        console.warn("Could not load admin statistics:", error);
    }
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

/* =========================================================
   BUDDY APPLICATIONS
========================================================= */

async function loadApplications() {
    const table = document.getElementById("applicationsTable");
    if (!table) return;

    try {
        const response = await apiFetch(`${API_BASE_URL}buddy-applications`);
        if (!response.ok) throw new Error("Could not load applications");

        const data = await response.json();
        const applications = data.applications || [];
        table.innerHTML = "";

        if (!applications.length) {
            table.innerHTML = `<tr><td colspan="8">No Buddy applications yet.</td></tr>`;
            updatePendingCount();
            return;
        }

        applications.forEach(application => {
            const row = document.createElement("tr");
            const modules = (application.modules || [])
                .map(module => `<span class="module-tag">${escapeHtml(module)}</span>`).join(" ");
            const availability = (application.availability || [])
                .map(day => escapeHtml(day.slice(0, 3))).join(" · ");
            const statusClass = (application.status || "pending").toLowerCase();

            const actions = application.status === "Pending"
                ? `<div class="action-buttons">
                    <button class="approve-btn" data-application-id="${application.id}">Approve</button>
                    <button class="reject-btn" data-application-id="${application.id}">Reject</button>
                   </div>`
                : `<div class="action-buttons"><span class="status ${statusClass}">${escapeHtml(application.status)}</span></div>`;

            row.innerHTML = `
                <td><div class="table-person">
                    <div class="small-avatar">${escapeHtml(initials(application.full_name))}</div>
                    <strong>${escapeHtml(application.full_name)}</strong>
                </div></td>
                <td>${escapeHtml(application.student_number)}</td>
                <td>${escapeHtml(application.qualification)}</td>
                <td>${escapeHtml(application.academic_year)}</td>
                <td>${modules}<br><small>Available: ${availability || "Not specified"}</small></td>
                <td><button type="button" class="details-btn" data-details-id="${application.id}">Read application</button><div class="application-motivation" id="applicationDetails${application.id}" hidden>${escapeHtml(application.motivation || "No motivation supplied.")}<br><small>Daily limit: ${escapeHtml(String(application.daily_limit ?? "Not specified"))}</small></div></td>
                <td><span class="status ${statusClass}">${escapeHtml(application.status)}</span></td>
                <td>${actions}</td>
            `;
            table.appendChild(row);
        });

        updatePendingCount();
    } catch (error) {
        console.error("Application loading error:", error);
        table.innerHTML = `<tr><td colspan="8">Could not load applications. Check that Flask is running.</td></tr>`;
    }
}

function updatePendingCount() {
    const table = document.getElementById("applicationsTable");
    const pendingCount = document.getElementById("pendingCount");
    if (!table || !pendingCount) return;
    const pending = table.querySelectorAll(".status.pending").length;
    pendingCount.textContent = String(pending);
    document.querySelectorAll('.notification').forEach(badge => {
        badge.textContent = String(pending);
        badge.hidden = pending === 0;
    });
    const topNotification = document.querySelector('.notification-btn span');
    if (topNotification) {
        topNotification.textContent = String(pending);
        topNotification.parentElement.setAttribute('aria-label', `${pending} pending Buddy applications`);
        topNotification.parentElement.hidden = pending === 0;
    }
}

function setupApplicationActions() {
    document.addEventListener("click", async event => {
        const approveButton = event.target.closest(".approve-btn");
        const rejectButton = event.target.closest(".reject-btn");
        const button = approveButton || rejectButton;
        if (!button) return;

        const applicationId = button.dataset.applicationId;
        const action = approveButton ? "approve" : "reject";
        if (!applicationId) return;

        const message = action === "approve"
            ? "Approve this Octo Buddy application?"
            : "Reject this Octo Buddy application?";
        if (!confirm(message)) return;

        try {
            const response = await apiFetch(`${API_BASE_URL}buddy-applications/${applicationId}/${action}`, { method: "PUT" });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Could not update application.");

            alert(data.message);
            await refreshAdminData();
        } catch (error) {
            console.error("Application action error:", error);
            alert(error.message || "Could not connect to the backend server.");
        }
    });
}

/* =========================================================
   STUDENTS
========================================================= */

async function loadStudents() {
    const table = document.getElementById("studentsTable");
    if (!table) return;

    try {
        const response = await apiFetch(`${API_BASE_URL}admin/users`);
        if (!response.ok) throw new Error("Could not load users");

        const data = await response.json();
        allUsers = data.users || [];
        populateQualificationFilters();
        renderStudents(allUsers);
    } catch (error) {
        console.warn("Could not load students:", error);
        table.innerHTML = `<tr><td colspan="7">Could not load users.</td></tr>`;
    }
}

function renderStudents(users) {
    const table = document.getElementById("studentsTable");
    if (!table) return;

    const students = users.filter(user => (user.role || "").toLowerCase() !== "admin");
    table.innerHTML = "";

    if (!students.length) {
        table.innerHTML = `<tr><td colspan="7">No users found.</td></tr>`;
        return;
    }

    students.forEach(user => {
        const role = (user.role || "student").toLowerCase();
        const row = document.createElement("tr");
        row.innerHTML = `
            <td><div class="table-person">
                <div class="small-avatar">${escapeHtml(initials(`${user.first_name} ${user.last_name}`))}</div>
                <strong>${escapeHtml(`${user.first_name} ${user.last_name}`.trim())}</strong>
            </div></td>
            <td>${escapeHtml(user.email)}</td>
            <td>${escapeHtml(user.course || "General")}</td>
            <td>Year ${escapeHtml(user.academic_year || "—")}</td>
            <td>${escapeHtml(user.points || 0)}</td>
            <td><span class="status ${user.is_suspended ? "rejected" : "active"}">${user.is_suspended ? "Suspended" : (role === "buddy" ? "Octo Buddy" : "Active")}</span></td>
            <td><button type="button" class="outline-btn user-status-btn" data-user-id="${user.id}" data-suspended="${user.is_suspended ? "true" : "false"}">${user.is_suspended ? "Reactivate" : "Suspend"}</button></td>
        `;
        table.appendChild(row);
    });
}

function setupStudentSearch() {
    const input = document.getElementById("studentSearch");
    if (!input) return;

    input.addEventListener("input", function () {
        const searchValue = this.value.toLowerCase();
        if (document.getElementById("studentStatusFilter")) applyStudentFilters();
        else renderStudents(allUsers.filter(user =>
            `${user.first_name} ${user.last_name} ${user.email} ${user.course}`
                .toLowerCase().includes(searchValue)
        ));
    });
}

/* =========================================================
   APPLICATION FILTERS
========================================================= */

function setupFilters() {
    document.querySelectorAll(".filter-btn").forEach(button => {
        button.addEventListener("click", function () {
            document.querySelectorAll(".filter-btn").forEach(btn => btn.classList.remove("active"));
            this.classList.add("active");

            const filter = this.textContent.trim().toLowerCase();
            document.querySelectorAll("#applicationsTable tr").forEach(row => {
                const status = row.querySelector(".status");
                if (!status || filter === "all") {
                    row.style.display = "";
                    return;
                }
                row.style.display = status.textContent.trim().toLowerCase() === filter ? "" : "none";
            });
        });
    });
}

/* =========================================================
   OCTO BUDDIES
========================================================= */

async function loadBuddies() {
    try {
        const response = await apiFetch(`${API_BASE_URL}admin/buddies`);
        if (!response.ok) throw new Error("Could not load Buddies");

        const data = await response.json();
        allBuddies = data.buddies || [];
        window.octoBuddies = allBuddies;
        renderBuddies();
        populateBuddySelect();
    } catch (error) {
        console.warn("Could not load Buddies:", error);
    }
}

function renderBuddies() {
    const grid = document.querySelector("#buddies .buddy-grid");
    if (!grid) return;

    if (!allBuddies.length) {
        grid.innerHTML = `<div class="buddy-card"><h3>No approved Octo Buddies yet</h3><p>Approved Buddies will appear here automatically.</p></div>`;
        return;
    }

    grid.innerHTML = allBuddies.map(buddy => {
        const buddySessions = allSessions.filter(session => session.buddy_id === buddy.id);
        const completed = buddySessions.filter(session => session.status === "Completed").length;
        return `
            <div class="buddy-card">
                <div class="buddy-card-top">
                    <div class="large-avatar">${escapeHtml(initials(`${buddy.first_name} ${buddy.last_name}`))}</div>
                    <span class="status ${buddy.is_suspended ? "rejected" : "active"}">${buddy.is_suspended ? "Suspended" : "Active"}</span>
                </div>
                <h3>${escapeHtml(`${buddy.first_name} ${buddy.last_name}`.trim())}</h3>
                <p>${escapeHtml(buddy.course || "General")} · Year ${escapeHtml(buddy.academic_year || "—")}</p>
                <div class="buddy-stats">
                    <div><strong>${completed}</strong><span>Classes</span></div>
                    <div><strong>${buddy.points || 0}</strong><span>Points</span></div>
                    <div><strong>${buddySessions.length ? "100%" : "—"}</strong><span>Attendance</span></div>
                </div>
                <button class="outline-btn buddy-view-btn" data-user-id="${buddy.id}">View Profile</button>
                <button class="outline-btn buddy-deactivate-btn" data-user-id="${buddy.id}">Deactivate Buddy</button>
            </div>`;
    }).join("");
}

/* =========================================================
   SESSION SCHEDULING
========================================================= */

function setupSessionModal() {
    const modal = document.getElementById("sessionModal");
    const newSessionBtn = document.getElementById("newSessionBtn");
    const closeModal = document.getElementById("closeModal");
    const saveSession = document.getElementById("saveSession");

    if (newSessionBtn) newSessionBtn.addEventListener("click", openSessionModal);
    if (closeModal) closeModal.addEventListener("click", closeSessionModal);
    if (modal) modal.addEventListener("click", event => {
        if (event.target === modal) closeSessionModal();
    });
    if (saveSession) saveSession.addEventListener("click", saveScheduledSession);

    populateStudentSelect();
    populateBuddySelect();
}

function openSessionModal() {
    const modal = document.getElementById("sessionModal");
    if (modal) modal.classList.add("show");
    populateStudentSelect();
    populateBuddySelect();
}

function closeSessionModal() {
    const modal = document.getElementById("sessionModal");
    if (modal) modal.classList.remove("show");
}

async function populateStudentSelect() {
    const select = document.getElementById("sessionStudent");
    if (!select) return;

    try {
        if (!allUsers.length) {
            const response = await apiFetch(`${API_BASE_URL}admin/users`);
            if (response.ok) allUsers = (await response.json()).users || [];
        }

        const students = allUsers.filter(user => (user.role || "").toLowerCase() === "student");
        select.innerHTML = students.length ? "" : `<option value="">No students available</option>`;

        students.forEach(user => {
            const option = document.createElement("option");
            option.value = user.id;
            option.textContent = `${user.first_name} ${user.last_name}`.trim();
            select.appendChild(option);
        });
    } catch (error) {
        console.warn("Could not populate student list:", error);
    }
}

function populateBuddySelect() {
    const select = document.getElementById("sessionBuddy");
    if (!select) return;

    select.innerHTML = allBuddies.length ? "" : `<option value="">No approved Buddies available</option>`;
    allBuddies.forEach(buddy => {
        const option = document.createElement("option");
        option.value = buddy.id;
        option.textContent = `${buddy.first_name} ${buddy.last_name}`.trim();
        select.appendChild(option);
    });
}

async function saveScheduledSession() {
    const studentId = document.getElementById("sessionStudent")?.value;
    const module = document.getElementById("sessionModule")?.value.trim();
    const buddyId = document.getElementById("sessionBuddy")?.value;
    const sessionDate = document.getElementById("sessionDate")?.value;
    const sessionTime = document.getElementById("sessionTime")?.value;

    if (!studentId || !module || !buddyId || !sessionDate || !sessionTime) {
        alert("Please complete all session fields.");
        return;
    }

    try {
        const response = await apiFetch(`${API_BASE_URL}admin/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                student_id: Number(studentId),
                module,
                buddy_id: Number(buddyId),
                date: sessionDate,
                time: sessionTime
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Could not schedule session.");

        alert("Tutoring session scheduled successfully.");
        closeSessionModal();
        await loadSchedule();
        await loadAdminDashboard();
        await loadReports();
    } catch (error) {
        console.error("Schedule error:", error);
        alert(error.message || "Could not connect to the backend server.");
    }
}

/* =========================================================
   REAL WEEKLY SCHEDULE
========================================================= */

async function loadSchedule() {
    try {
        const start = formatDate(currentWeekStart);
        const endDate = new Date(currentWeekStart);
        endDate.setDate(endDate.getDate() + 4); // Monday-Friday
        const end = formatDate(endDate);

        const response = await apiFetch(`${API_BASE_URL}admin/sessions?start=${start}&end=${end}`);
        if (!response.ok) throw new Error("Could not load sessions");

        const data = await response.json();
        allSessions = data.sessions || [];
        renderCalendar();
        renderAdminBookings();
        renderBuddies();
    } catch (error) {
        console.warn("Could not load schedule:", error);
    }
}

async function loadAdminBookings() {
    try {
        const response = await apiFetch(`${API_BASE_URL}admin/sessions`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Could not load bookings.");
        allAdminBookings = data.sessions || [];
        renderAdminBookings();
    } catch (error) {
        const table = document.getElementById("adminBookingsTable");
        if (table) table.innerHTML = `<tr><td colspan="8">${escapeHtml(error.message || "Could not load bookings.")}</td></tr>`;
    }
}

function renderCalendar() {
    const calendar = document.querySelector("#schedule .calendar");
    const title = document.getElementById("calendarTitle");
    if (!calendar) return;

    const end = new Date(currentWeekStart);
    end.setDate(end.getDate() + 4);
    if (title) {
        title.textContent = `${currentWeekStart.toLocaleDateString(undefined, { month: "long", day: "numeric" })} - ${end.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`;
    }

    const hours = ["09:00", "10:00", "11:00", "12:00"];
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

    calendar.innerHTML = days.map((dayName, index) => {
        const day = new Date(currentWeekStart);
        day.setDate(day.getDate() + index);
        const dateString = formatDate(day);

        return `
            <div class="calendar-day">
                <div class="day-header">${dayName}<span>${day.getDate()}</span></div>
                ${hours.map(hour => {
                    const session = allSessions.find(item =>
                        item.session_date === dateString && item.session_time === hour
                    );
                    return session
                        ? `<button class="time-slot booked" type="button" title="${escapeHtml(session.status)}">
                            <span>${escapeHtml(hour)}</span>
                            ${escapeHtml(session.student_name || "Student")} · ${escapeHtml(session.module)}
                           </button>`
                        : `<button class="time-slot available" type="button" data-date="${dateString}" data-time="${hour}">
                            <span>${hour}</span>Available
                           </button>`;
                }).join("")}
            </div>`;
    }).join("");

    calendar.querySelectorAll(".time-slot.available").forEach(slot => {
        slot.addEventListener("click", () => {
            openSessionModal();
            const date = document.getElementById("sessionDate");
            const time = document.getElementById("sessionTime");
            if (date) date.value = slot.dataset.date;
            if (time) time.value = slot.dataset.time;
        });
    });
}

function setupCalendarButtons() {
    const previousWeek = document.getElementById("previousWeek");
    const nextWeek = document.getElementById("nextWeek");

    if (previousWeek) previousWeek.addEventListener("click", async () => {
        currentWeekStart.setDate(currentWeekStart.getDate() - 7);
        await loadSchedule();
    });

    if (nextWeek) nextWeek.addEventListener("click", async () => {
        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
        await loadSchedule();
    });
}

/* =========================================================
   QUALIFICATIONS / MODULES
   ---------------------------------------------------------
   Qualification and module changes are stored in the backend database,
   so they are shared across administrators and survive redeployments.
========================================================= */

let managedQualifications = [];
let managedModules = [];

async function setupQualificationButtons() {
    const addQualification = document.getElementById("addQualification");
    const addModule = document.getElementById("addModule");

    if (addQualification) {
        addQualification.addEventListener("click", async () => {
            const name = prompt("Enter the new qualification name:");
            if (!name?.trim()) return;
            try {
                const response = await apiFetch(`${API_BASE_URL}admin/qualifications`, {
                    method: "POST", body: JSON.stringify({ name: name.trim() })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || "Could not add qualification.");
                await loadManagedCatalogue();
                alert("Qualification added successfully.");
            } catch (error) { alert(error.message || "Could not add qualification."); }
        });
    }

    if (addModule) {
        addModule.addEventListener("click", async () => {
            if (!managedQualifications.length) await loadManagedCatalogue();
            const selectedButton = document.querySelector("#modules .qualification-select.active");
            const selectedName = selectedButton?.textContent.trim() || "";
            const qualification = managedQualifications.find(item => item.name === selectedName) || managedQualifications[0];
            if (!qualification) { alert("Add a qualification before adding modules."); return; }
            const name = prompt("Enter the module name:");
            if (!name?.trim()) return;
            const yearText = prompt("Enter the academic year for this module (1–6):", "1");
            if (yearText === null) return;
            const year = Number(yearText);
            if (!Number.isInteger(year) || year < 1 || year > 6) { alert("Academic year must be a whole number from 1 to 6."); return; }
            try {
                const response = await apiFetch(`${API_BASE_URL}admin/modules`, {
                    method: "POST",
                    body: JSON.stringify({ name: name.trim(), qualification_id: qualification.id, academic_year: year })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || "Could not add module.");
                await loadManagedCatalogue();
                alert("Module added successfully.");
            } catch (error) { alert(error.message || "Could not add module."); }
        });
    }

    document.querySelectorAll("#qualifications .management-card button").forEach(button => {
        button.addEventListener("click", async () => {
            const card = button.closest(".management-card");
            const currentName = card?.querySelector("h3")?.textContent?.trim();
            const qualification = managedQualifications.find(item => item.name === currentName);
            if (!qualification) { alert("Qualification catalogue is not available yet. Please try again."); return; }
            const updatedName = prompt("Edit qualification name:", qualification.name);
            if (!updatedName?.trim() || updatedName.trim() === qualification.name) return;
            try {
                const response = await apiFetch(`${API_BASE_URL}admin/qualifications/${qualification.id}`, {
                    method: "PUT", body: JSON.stringify({ name: updatedName.trim() })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || "Could not update qualification.");
                await loadManagedCatalogue();
                await loadAuditLogs();
                alert("Qualification updated successfully.");
            } catch (error) { alert(error.message || "Could not update qualification."); }
        });
    });

    const moduleSidebar = document.querySelector("#modules .module-sidebar");
    if (moduleSidebar && !moduleSidebar.dataset.selectionHandler) {
        moduleSidebar.dataset.selectionHandler = "true";
        moduleSidebar.addEventListener("click", event => {
            const button = event.target.closest(".qualification-select");
            if (!button) return;
            document.querySelectorAll(".qualification-select").forEach(btn => btn.classList.remove("active"));
            button.classList.add("active");
            renderModules();
        });
    }

    await loadManagedCatalogue();
}

async function loadManagedCatalogue() {
    try {
        const [qualificationResponse, moduleResponse] = await Promise.all([
            apiFetch(`${API_BASE_URL}admin/qualifications`),
            apiFetch(`${API_BASE_URL}admin/modules`)
        ]);
        const qualificationData = await qualificationResponse.json();
        const moduleData = await moduleResponse.json();
        if (!qualificationResponse.ok) throw new Error(qualificationData.message || "Could not load qualifications.");
        if (!moduleResponse.ok) throw new Error(moduleData.message || "Could not load modules.");
        managedQualifications = (qualificationData.qualifications || []).filter(item => item.active);
        managedModules = (moduleData.modules || []).filter(item => item.active);
        renderQualifications();
        renderModules();
    } catch (error) {
        console.warn("Could not load managed qualification/module catalogue:", error);
        // The page keeps its existing branding and static fallback if the API is unavailable.
        renderQualifications();
        renderModules();
    }
}

function defaultQualifications() {
    return ["Diploma in Information Technology", "Bachelor of Business Administration", "Bachelor of Science in IT", "Higher Certificate in IT"];
}

function defaultModules() {
    return ["Programming", "Database Systems", "Networks", "Machine Learning", "Data Manipulation & Visualisation"];
}

function getStoredList(key, fallback) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || "null");
        return Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

function renderQualifications() {
    const names = managedQualifications.length ? managedQualifications.map(item => item.name) : defaultQualifications();
    const cards = document.querySelectorAll("#qualifications .management-card");
    cards.forEach((card, index) => {
        const heading = card.querySelector("h3");
        if (heading && names[index]) heading.textContent = names[index];
    });

    const sidebar = document.querySelector("#modules .module-sidebar");
    if (sidebar) {
        const existingButtons = [...sidebar.querySelectorAll(".qualification-select")];
        names.forEach((name, index) => {
            let button = existingButtons[index];
            if (!button) {
                button = document.createElement("button");
                button.type = "button";
                button.className = "qualification-select";
                sidebar.appendChild(button);
            }
            button.textContent = name;
            button.dataset.qualificationId = managedQualifications[index]?.id || "";
            button.hidden = false;
            if (index === 0 && !sidebar.querySelector(".qualification-select.active")) button.classList.add("active");
        });
        existingButtons.slice(names.length).forEach(button => button.hidden = true);
    }
}

async function renderModules() {
    const list = document.querySelector("#modules .module-list");
    if (!list) return;

    if (!managedModules.length) {
        // Keep the original module list visible if the server catalogue could not load.
        const fallback = getStoredList("octo_modules", defaultModules());
        const header = list.querySelector(".module-list-header");
        list.innerHTML = "";
        if (header) list.appendChild(header);
        fallback.forEach(module => {
            const item = document.createElement("div");
            item.className = "module-item";
            item.innerHTML = `<div><strong>${escapeHtml(module)}</strong></div><span class="status">Catalogue unavailable</span>`;
            list.appendChild(item);
        });
        return;
    }

    const selectedButton = document.querySelector("#modules .qualification-select.active");
    const selectedId = Number(selectedButton?.dataset.qualificationId || managedQualifications[0]?.id);
    const modules = managedModules.filter(module => module.qualification_id === selectedId);
    const header = list.querySelector(".module-list-header");
    const headerTitle = header?.querySelector("h3");
    const selectedQualification = managedQualifications.find(item => item.id === selectedId);
    if (headerTitle && selectedQualification) headerTitle.textContent = selectedQualification.name;
    list.innerHTML = "";
    if (header) list.appendChild(header);

    modules.forEach(module => {
        const item = document.createElement("div");
        item.className = "module-item";
        item.innerHTML = `<div><strong>${escapeHtml(module.name)}</strong><small>${escapeHtml(module.qualification)} · Year ${escapeHtml(module.academic_year)}</small></div><button type="button" class="outline-btn module-edit-btn" data-module-id="${module.id}">Edit</button>`;
        list.appendChild(item);
    });
    if (!modules.length) {
        const empty = document.createElement("div");
        empty.className = "module-item";
        empty.textContent = "No modules for this qualification yet.";
        list.appendChild(empty);
    }

    list.querySelectorAll(".module-edit-btn").forEach(button => {
        button.addEventListener("click", async () => {
            const module = managedModules.find(item => Number(item.id) === Number(button.dataset.moduleId));
            if (!module) return;
            const updated = prompt("Edit module name:", module.name);
            if (!updated?.trim() || updated.trim() === module.name) return;
            try {
                const response = await apiFetch(`${API_BASE_URL}admin/modules/${module.id}`, {
                    method: "PUT", body: JSON.stringify({ name: updated.trim() })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || "Could not update module.");
                await loadManagedCatalogue();
                alert("Module updated successfully.");
            } catch (error) { alert(error.message || "Could not update module."); }
        });
    });
}

/* =========================================================
   REPORTS / LEADERBOARD
========================================================= */

async function loadReports() {
    try {
        const response = await apiFetch(`${API_BASE_URL}admin/leaderboard`);
        if (!response.ok) return;
        const data = await response.json();
        renderReportTable(data.buddies || []);
    } catch (error) {
        console.warn("Could not load reports:", error);
    }
}

function renderReportTable(buddies) {
    const table = document.querySelector("#reports .report-table-panel tbody");
    if (!table) return;

    table.innerHTML = buddies.length ? buddies.map(buddy => `
        <tr>
            <td>${escapeHtml(buddy.name)}</td>
            <td>${buddy.completed_sessions}</td>
            <td>${buddy.attendance}</td>
            <td>${buddy.points}</td>
            <td><span class="performance ${buddy.completed_sessions >= 10 ? "excellent" : "good"}">${buddy.completed_sessions >= 10 ? "Excellent" : "Good"}</span></td>
        </tr>`).join("") : `<tr><td colspan="5">No Buddy performance data yet.</td></tr>`;
}

async function loadLeaderboard() {
    try {
        const response = await apiFetch(`${API_BASE_URL}admin/leaderboard`);
        if (!response.ok) return;
        const data = await response.json();
        renderLeaderboard(data.buddies || []);
    } catch (error) {
        console.warn("Could not load leaderboard:", error);
    }
}

function renderLeaderboard(buddies) {
    const container = document.querySelector("#leaderboard .leaderboard-card");
    if (!container) return;

    if (!buddies.length) {
        container.innerHTML = `<div class="leaderboard-header"><h3>No Buddy points yet</h3></div>`;
        return;
    }

    container.innerHTML = `
        <div class="leaderboard-header"><h3>Top Octo Buddies</h3></div>
        ${buddies.map((buddy, index) => `
            <div class="leaderboard-row ${index === 0 ? "first" : ""}">
                <div class="rank">${index + 1}</div>
                <div class="leader-avatar">${escapeHtml(initials(buddy.name))}</div>
                <div class="leader-info"><strong>${escapeHtml(buddy.name)}</strong><span>${buddy.completed_sessions} completed sessions</span></div>
                <strong class="leader-points">${buddy.points} pts</strong>
            </div>`).join("")}`;
}

function setupAdminActions() {
    const exportReport = document.getElementById("exportReport");
    const saveSettings = document.getElementById("saveSettings");
    const logoutBtn = document.getElementById("logoutBtn");

    if (exportReport) exportReport.addEventListener("click", downloadFilteredReport);

    if (saveSettings) {
        saveSettings.addEventListener("click", () => {
            const toggles = [...document.querySelectorAll("#settings input[type='checkbox']")].map(input => ({
                label: input.closest("label")?.innerText?.trim() || "setting",
                enabled: input.checked
            }));
            localStorage.setItem("octo_admin_settings", JSON.stringify(toggles));
            alert("Settings saved successfully.");
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            if (!confirm("Are you sure you want to logout?")) return;
            clearLogin();
           window.location.href = "../signin_login/project.html";
        });
    }

    // Buttons that previously did nothing now show useful information.
    document.addEventListener("click", event => {
        const buddyButton = event.target.closest(".buddy-view-btn");
        if (buddyButton) {
            const buddy = allBuddies.find(item => Number(item.id) === Number(buddyButton.dataset.userId));
            if (buddy) alert(`${buddy.first_name} ${buddy.last_name}\n${buddy.email}\n${buddy.course || "General"}\nPoints: ${buddy.points || 0}`);
        }
    });
}


function setupAdminManagementControls() {
    // Add filters inside existing section headings to preserve the current visual design.
    const studentHeading = document.querySelector("#students .section-heading");
    if (studentHeading && !document.getElementById("studentStatusFilter")) {
        const controls = document.createElement("div");
        controls.className = "search-box admin-filter-controls";
        controls.innerHTML = `<select id="studentStatusFilter" aria-label="Filter users by status"><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option></select>
            <select id="studentQualificationFilter" aria-label="Filter users by qualification"><option value="">All qualifications</option></select>
            <select id="studentYearFilter" aria-label="Filter users by academic year"><option value="">All years</option><option value="1">Year 1</option><option value="2">Year 2</option><option value="3">Year 3</option><option value="4">Year 4</option><option value="5">Year 5</option><option value="6">Year 6</option></select>`;
        studentHeading.appendChild(controls);
        controls.querySelectorAll("select").forEach(select => select.addEventListener("change", applyStudentFilters));
    }

    const reportsHeading = document.querySelector("#reports .section-heading");
    if (reportsHeading && !document.getElementById("reportTypeFilter")) {
        const controls = document.createElement("div");
        controls.className = "search-box admin-filter-controls";
        controls.innerHTML = `<select id="reportTypeFilter" aria-label="Report type"><option value="users">User accounts</option><option value="applications">Buddy applications</option><option value="bookings">Bookings</option></select>
          <select id="reportStatusFilter" aria-label="Report status"><option value="">All statuses</option><option>Pending</option><option>Approved</option><option>Rejected</option><option>Confirmed</option><option>Completed</option><option>Cancelled</option><option value="active">Active</option><option value="suspended">Suspended</option></select>
          <select id="reportQualificationFilter" aria-label="Filter report by qualification"><option value="">All qualifications</option></select>
          <select id="reportYearFilter" aria-label="Filter report by academic year"><option value="">All years</option><option value="1">Year 1</option><option value="2">Year 2</option><option value="3">Year 3</option><option value="4">Year 4</option><option value="5">Year 5</option><option value="6">Year 6</option></select>
          <input id="reportStartDate" type="date" aria-label="Report start date"><input id="reportEndDate" type="date" aria-label="Report end date">`;
        reportsHeading.appendChild(controls);
        controls.querySelectorAll("select,input").forEach(el => el.addEventListener("change", refreshReportFilters));
    }


    const scheduleSection = document.getElementById("schedule");
    if (scheduleSection && !document.getElementById("adminBookingPanel")) {
        const panel = document.createElement("div");
        panel.id = "adminBookingPanel";
        panel.className = "table-panel";
        panel.style.marginTop = "24px";
        panel.innerHTML = `<div class="section-heading"><div><h2>Booking management</h2><p>Filter bookings and update their status when resolving issues.</p></div>
          <div class="search-box"><select id="bookingStatusFilter" aria-label="Filter bookings by status"><option value="">All statuses</option><option>Pending</option><option>Confirmed</option><option>Completed</option><option>Cancelled</option><option>Rejected</option></select>
          <select id="bookingQualificationFilter" aria-label="Filter bookings by qualification"><option value="">All qualifications</option></select>
          <select id="bookingYearFilter" aria-label="Filter bookings by academic year"><option value="">All years</option><option value="1">Year 1</option><option value="2">Year 2</option><option value="3">Year 3</option><option value="4">Year 4</option><option value="5">Year 5</option><option value="6">Year 6</option></select>
          <input id="bookingStartDate" type="date" aria-label="Booking start date"><input id="bookingEndDate" type="date" aria-label="Booking end date"></div></div>
          <div class="table-wrapper"><table><thead><tr><th>Student</th><th>Octo Buddy</th><th>Module</th><th>Date</th><th>Time</th><th>Qualification</th><th>Status</th><th>Update status</th></tr></thead><tbody id="adminBookingsTable"><tr><td colspan="8">Loading bookings…</td></tr></tbody></table></div>`;
        scheduleSection.appendChild(panel);
        panel.querySelectorAll("select,input").forEach(control => control.addEventListener("change", renderAdminBookings));
    }

    const settings = document.getElementById("settings");
    if (settings && !document.getElementById("auditLogPanel")) {
        const panel = document.createElement("div");
        panel.id = "auditLogPanel";
        panel.className = "table-panel";
        panel.style.marginTop = "24px";
        panel.innerHTML = `<div class="section-heading"><div><h2>Administrator audit log</h2><p>Recent sensitive changes recorded by the system.</p></div><button type="button" class="outline-btn" id="refreshAuditLogs">Refresh logs</button></div>
          <div class="table-wrapper"><table><thead><tr><th>Time</th><th>Administrator</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody id="auditLogsTable"><tr><td colspan="5">Open Settings to load audit logs.</td></tr></tbody></table></div>`;
        settings.appendChild(panel);
        document.getElementById("refreshAuditLogs").addEventListener("click", loadAuditLogs);
    }

    // Append action header without changing the existing table's styling.
    const studentHeader = document.querySelector("#students thead tr");
    if (studentHeader && !studentHeader.querySelector(".user-actions-header")) {
        const th = document.createElement("th");
        th.className = "user-actions-header";
        th.textContent = "Actions";
        studentHeader.appendChild(th);
    }

    document.addEventListener("click", async event => {
        const statusButton = event.target.closest(".user-status-btn");
        if (statusButton) {
            const userId = statusButton.dataset.userId;
            const suspended = statusButton.dataset.suspended !== "true";
            if (!confirm(suspended ? "Suspend this account? The user will no longer be able to sign in." : "Reactivate this account?")) return;
            try {
                const response = await apiFetch(`${API_BASE_URL}admin/users/${userId}/status`, {
                    method: "PUT", body: JSON.stringify({ suspended })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || "Could not update account.");
                await Promise.all([loadStudents(), loadAdminDashboard(), loadAuditLogs()]);
                alert(data.message);
            } catch (error) { alert(error.message || "Could not update account."); }
        }

        const deactivateButton = event.target.closest(".buddy-deactivate-btn");
        if (deactivateButton) {
            const id = deactivateButton.dataset.userId;
            if (!confirm("Deactivate this Buddy's tutoring role? Their account will remain a student account.")) return;
            try {
                const response = await apiFetch(`${API_BASE_URL}admin/buddies/${id}/deactivate`, { method: "PUT" });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || "Could not deactivate Buddy.");
                await Promise.all([loadBuddies(), loadStudents(), loadAuditLogs()]);
                alert(data.message);
            } catch (error) { alert(error.message || "Could not deactivate Buddy."); }
        }
    });

    const settingsNav = document.querySelector('.nav-item[data-section="settings"]');
    if (settingsNav) settingsNav.addEventListener("click", loadAuditLogs);
}


function renderAdminBookings() {
    const table = document.getElementById("adminBookingsTable");
    if (!table) return;
    const statusFilter = document.getElementById("bookingStatusFilter")?.value || "";
    const qualification = document.getElementById("bookingQualificationFilter")?.value || "";
    const year = document.getElementById("bookingYearFilter")?.value || "";
    const start = document.getElementById("bookingStartDate")?.value || "";
    const end = document.getElementById("bookingEndDate")?.value || "";
    const sessions = allAdminBookings.filter(item =>
        (!statusFilter || item.status === statusFilter) &&
        (!qualification || item.qualification === qualification) &&
        (!year || String(item.academic_year) === year) &&
        (!start || item.session_date >= start) &&
        (!end || item.session_date <= end)
    );
    table.innerHTML = sessions.length ? sessions.map(session => `<tr>
      <td>${escapeHtml(session.student_name || session.student || "Student")}</td>
      <td>${escapeHtml(session.buddy_name || "Unassigned")}</td>
      <td>${escapeHtml(session.module || "")}</td>
      <td>${escapeHtml(session.session_date || "")}</td>
      <td>${escapeHtml(session.session_time || "")}</td>
      <td>${escapeHtml(session.qualification || "—")} · Year ${escapeHtml(session.academic_year || "—")}</td>
      <td><span class="status ${escapeHtml((session.status || "").toLowerCase())}">${escapeHtml(session.status || "Pending")}</span></td>
      <td><select class="booking-status-update" data-session-id="${session.id}" aria-label="Update booking ${session.id} status">
        ${["Pending","Confirmed","Completed","Cancelled","Rejected"].map(status => `<option ${session.status === status ? "selected" : ""}>${status}</option>`).join("")}
      </select></td></tr>`).join("") : `<tr><td colspan="8">No bookings match this filter.</td></tr>`;
    table.querySelectorAll(".booking-status-update").forEach(select => select.addEventListener("change", async () => {
        const id = select.dataset.sessionId;
        const status = select.value;
        if (!confirm(`Change booking #${id} to ${status}?`)) { renderAdminBookings(); return; }
        try {
            const response = await apiFetch(`${API_BASE_URL}admin/sessions/${id}/status`, {
                method: "PUT", body: JSON.stringify({ status })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Could not update booking.");
            await Promise.all([loadSchedule(), loadAdminBookings(), loadAuditLogs()]);
            alert("Booking status updated.");
        } catch (error) {
            alert(error.message || "Could not update booking.");
            renderAdminBookings();
        }
    }));
}

function populateQualificationFilters() {
    const names = [...new Set(allUsers.map(user => user.course).filter(Boolean))].sort();
    ["studentQualificationFilter", "reportQualificationFilter", "bookingQualificationFilter"].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const previous = select.value;
        select.innerHTML = `<option value="">All qualifications</option>` + names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
        if (names.includes(previous)) select.value = previous;
    });
}

function applyStudentFilters() {
    const status = document.getElementById("studentStatusFilter")?.value || "";
    const year = document.getElementById("studentYearFilter")?.value || "";
    const qualification = document.getElementById("studentQualificationFilter")?.value || "";
    const search = document.getElementById("studentSearch")?.value.toLowerCase() || "";
    renderStudents(allUsers.filter(user => {
        const matchesSearch = `${user.first_name} ${user.last_name} ${user.email} ${user.course}`.toLowerCase().includes(search);
        const matchesStatus = !status || (status === "suspended" ? user.is_suspended : !user.is_suspended);
        const matchesYear = !year || String(user.academic_year) === year;
        const matchesQualification = !qualification || user.course === qualification;
        return matchesSearch && matchesStatus && matchesYear && matchesQualification;
    }));
}

async function downloadFilteredReport() {
    const type = document.getElementById("reportTypeFilter")?.value || "users";
    const status = document.getElementById("reportStatusFilter")?.value || "";
    const start = document.getElementById("reportStartDate")?.value || "";
    const end = document.getElementById("reportEndDate")?.value || "";
    const qualification = document.getElementById("reportQualificationFilter")?.value || "";
    const year = document.getElementById("reportYearFilter")?.value || "";
    const params = new URLSearchParams({ type });
    if (status) params.set("status", status);
    if (qualification) params.set("qualification", qualification);
    if (year) params.set("year", year);
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    try {
        const response = await apiFetch(`${API_BASE_URL}admin/reports.csv?${params.toString()}`);
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || "Could not export report.");
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `octobuddy-${type}-report.csv`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
        alert(error.message || "Could not export report.");
    }
}

async function refreshReportFilters() {
    const button = document.getElementById("exportReport");
    if (button) button.title = "Export a CSV using the selected filters";
}

async function loadAuditLogs() {
    const table = document.getElementById("auditLogsTable");
    if (!table) return;
    try {
        const response = await apiFetch(`${API_BASE_URL}admin/audit-logs`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Could not load audit logs.");
        const logs = data.logs || [];
        table.innerHTML = logs.length ? logs.map(log => `<tr>
          <td>${escapeHtml(new Date(log.created_at).toLocaleString())}</td>
          <td>${escapeHtml(log.admin)}</td><td>${escapeHtml(log.action.replaceAll("_", " "))}</td>
          <td>${escapeHtml(log.target_type)} #${escapeHtml(log.target_id || "")}</td>
          <td>${escapeHtml(log.details || "")}</td></tr>`).join("") : `<tr><td colspan="5">No administrator actions have been recorded yet.</td></tr>`;
    } catch (error) {
        table.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message || "Could not load audit logs.")}</td></tr>`;
    }
}

function exportReportData() {
    apiFetch(`${API_BASE_URL}admin/users`)
        .then(response => response.json())
        .then(data => {
            const users = data.users || [];
            const rows = [["Name", "Email", "Role", "Course", "Academic Year", "Points"]];
            users.forEach(user => rows.push([
                `${user.first_name} ${user.last_name}`.trim(), user.email, user.role,
                user.course, user.academic_year, user.points
            ]));

            const csv = rows.map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "octo-buddy-users-report.csv";
            link.click();
            URL.revokeObjectURL(url);
        })
        .catch(error => {
            console.error("Report error:", error);
            alert("Could not generate report.");
        });
}

function clearLogin() {
    ["auth_token", "user_id", "user", "first_name", "last_name", "role", "active_buddy_room"].forEach(key => localStorage.removeItem(key));
}

/* =========================================================
   MOBILE SIDEBAR
========================================================= */

function setupMobileMenu() {
    const mobileMenu = document.getElementById("mobileMenu");
    const sidebar = document.querySelector(".sidebar");
    if (!mobileMenu || !sidebar) return;

    mobileMenu.addEventListener("click", () => sidebar.classList.toggle("open"));
    document.querySelectorAll(".nav-item").forEach(item => {
        item.addEventListener("click", () => sidebar.classList.remove("open"));
    });
}

/* =========================================================
   SMALL HELPERS
========================================================= */

function startOfWeek(value) {
    const dateValue = new Date(value);
    const day = dateValue.getDay();
    const difference = day === 0 ? -6 : 1 - day;
    dateValue.setDate(dateValue.getDate() + difference);
    dateValue.setHours(0, 0, 0, 0);
    return dateValue;
}

function formatDate(value) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function initials(value) {
    return String(value || "")
        .split(/\s+/)
        .filter(Boolean)
        .map(part => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

document.addEventListener("click", function (event) {
    const detailsButton = event.target.closest("[data-details-id]");
    if (!detailsButton) return;
    const details = document.getElementById(`applicationDetails${detailsButton.dataset.detailsId}`);
    if (!details) return;
    details.hidden = !details.hidden;
    detailsButton.textContent = details.hidden ? "Read application" : "Hide details";
});


// The notification bell opens the live pending-application list.
document.addEventListener("DOMContentLoaded", function () {
    const bell = document.querySelector(".notification-btn");
    if (bell) bell.addEventListener("click", function () {
        const applicationsNav = document.querySelector('.nav-item[data-section="applications"]');
        if (applicationsNav) applicationsNav.click();
        if (typeof loadApplications === "function") loadApplications();
    });
});
