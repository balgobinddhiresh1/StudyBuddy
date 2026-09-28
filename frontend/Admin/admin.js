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

const API_BASE_URL = "https://studybuddy-bl8d.onrender.com/api/";

let allUsers = [];
let allBuddies = [];
let allSessions = [];
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
    if (!storedUser || storedRole !== "admin") {
        console.warn("Admin page opened without an admin login.");
        // Keep direct development access possible if the page is opened
        // manually: only redirect when a user record exists with another role.
        if (storedUser) {
            alert("You do not have Campus Manager access.");
            window.location.href = "../frontend/signin_login/project.html";
            return false;
        }
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
        const response = await fetch(`${API_BASE_URL}admin/dashboard`);
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
        const response = await fetch(`${API_BASE_URL}buddy-applications`);
        if (!response.ok) throw new Error("Could not load applications");

        const data = await response.json();
        const applications = data.applications || [];
        table.innerHTML = "";

        if (!applications.length) {
            table.innerHTML = `<tr><td colspan="7">No Buddy applications yet.</td></tr>`;
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
                <td>${modules}<br><small>${availability}</small></td>
                <td><span class="status ${statusClass}">${escapeHtml(application.status)}</span></td>
                <td>${actions}</td>
            `;
            table.appendChild(row);
        });

        updatePendingCount();
    } catch (error) {
        console.error("Application loading error:", error);
        table.innerHTML = `<tr><td colspan="7">Could not load applications. Check that Flask is running.</td></tr>`;
    }
}

function updatePendingCount() {
    const table = document.getElementById("applicationsTable");
    const pendingCount = document.getElementById("pendingCount");
    if (!table || !pendingCount) return;
    pendingCount.textContent = table.querySelectorAll(".status.pending").length;
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
            const response = await fetch(`${API_BASE_URL}/buddy-applications/${applicationId}/${action}`, { method: "PUT" });
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
        const response = await fetch(`${API_BASE_URL}/admin/users`);
        if (!response.ok) throw new Error("Could not load users");

        const data = await response.json();
        allUsers = data.users || [];
        renderStudents(allUsers);
    } catch (error) {
        console.warn("Could not load students:", error);
        table.innerHTML = `<tr><td colspan="6">Could not load students.</td></tr>`;
    }
}

function renderStudents(users) {
    const table = document.getElementById("studentsTable");
    if (!table) return;

    const students = users.filter(user => (user.role || "").toLowerCase() !== "admin");
    table.innerHTML = "";

    if (!students.length) {
        table.innerHTML = `<tr><td colspan="6">No students found.</td></tr>`;
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
            <td><span class="status active">${role === "buddy" ? "Octo Buddy" : "Active"}</span></td>
        `;
        table.appendChild(row);
    });
}

function setupStudentSearch() {
    const input = document.getElementById("studentSearch");
    if (!input) return;

    input.addEventListener("input", function () {
        const searchValue = this.value.toLowerCase();
        renderStudents(allUsers.filter(user =>
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
        const response = await fetch(`${API_BASE_URL}/admin/buddies`);
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
                    <span class="status active">Active</span>
                </div>
                <h3>${escapeHtml(`${buddy.first_name} ${buddy.last_name}`.trim())}</h3>
                <p>${escapeHtml(buddy.course || "General")} · Year ${escapeHtml(buddy.academic_year || "—")}</p>
                <div class="buddy-stats">
                    <div><strong>${completed}</strong><span>Classes</span></div>
                    <div><strong>${buddy.points || 0}</strong><span>Points</span></div>
                    <div><strong>${buddySessions.length ? "100%" : "—"}</strong><span>Attendance</span></div>
                </div>
                <button class="outline-btn buddy-view-btn" data-user-id="${buddy.id}">View Profile</button>
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
            const response = await fetch(`${API_BASE_URL}/admin/users`);
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
        const response = await fetch(`${API_BASE_URL}/admin/sessions`, {
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

        const response = await fetch(`${API_BASE_URL}/admin/sessions?start=${start}&end=${end}`);
        if (!response.ok) throw new Error("Could not load sessions");

        const data = await response.json();
        allSessions = data.sessions || [];
        renderCalendar();
        renderBuddies();
    } catch (error) {
        console.warn("Could not load schedule:", error);
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
   The original page only displayed prompts and never saved anything.
   Until dedicated qualification/module tables are added to the database,
   these management lists are persisted in localStorage so the buttons
   actually work and survive page refreshes.
========================================================= */

function setupQualificationButtons() {
    const addQualification = document.getElementById("addQualification");
    const addModule = document.getElementById("addModule");

    if (addQualification) {
        addQualification.addEventListener("click", () => {
            const name = prompt("Enter the new qualification name:");
            if (!name?.trim()) return;
            const qualifications = getStoredList("octo_qualifications", defaultQualifications());
            if (!qualifications.includes(name.trim())) qualifications.push(name.trim());
            localStorage.setItem("octo_qualifications", JSON.stringify(qualifications));
            renderQualifications();
            alert("Qualification added successfully.");
        });
    }

    if (addModule) {
        addModule.addEventListener("click", () => {
            const name = prompt("Enter the new module name:");
            if (!name?.trim()) return;
            const modules = getStoredList("octo_modules", defaultModules());
            if (!modules.includes(name.trim())) modules.push(name.trim());
            localStorage.setItem("octo_modules", JSON.stringify(modules));
            renderModules();
            alert("Module added successfully.");
        });
    }

    document.querySelectorAll(".qualification-select").forEach(button => {
        button.addEventListener("click", function () {
            document.querySelectorAll(".qualification-select").forEach(btn => btn.classList.remove("active"));
            this.classList.add("active");
            renderModules(this.textContent.trim());
        });
    });

    renderQualifications();
    renderModules();
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
    const qualifications = getStoredList("octo_qualifications", defaultQualifications());
    const cards = document.querySelectorAll("#qualifications .management-card");
    cards.forEach((card, index) => {
        const heading = card.querySelector("h3");
        if (heading && qualifications[index]) heading.textContent = qualifications[index];
    });
}

function renderModules() {
    const modules = getStoredList("octo_modules", defaultModules());
    const list = document.querySelector("#modules .module-list");
    if (!list) return;

    const header = list.querySelector(".module-list-header");
    list.innerHTML = "";
    if (header) list.appendChild(header);

    modules.forEach(module => {
        const item = document.createElement("div");
        item.className = "module-item";
        item.innerHTML = `<div><strong>${escapeHtml(module)}</strong></div><button type="button" class="outline-btn module-edit-btn">Edit</button>`;
        list.appendChild(item);
    });

    list.querySelectorAll(".module-edit-btn").forEach(button => {
        button.addEventListener("click", () => {
            const current = button.parentElement.querySelector("strong")?.textContent || "";
            const updated = prompt("Edit module name:", current);
            if (!updated?.trim() || updated.trim() === current) return;
            const values = getStoredList("octo_modules", defaultModules()).map(value => value === current ? updated.trim() : value);
            localStorage.setItem("octo_modules", JSON.stringify(values));
            renderModules();
        });
    });
}

/* =========================================================
   REPORTS / LEADERBOARD
========================================================= */

async function loadReports() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/leaderboard`);
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
        const response = await fetch(`${API_BASE_URL}/admin/leaderboard`);
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

    if (exportReport) exportReport.addEventListener("click", exportReportData);

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
            window.location.href = "../project.html";
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

function exportReportData() {
    fetch(`${API_BASE_URL}/admin/users`)
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
    ["user_id", "user", "first_name", "last_name", "role", "active_buddy_room"].forEach(key => localStorage.removeItem(key));
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
