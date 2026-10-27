/* Shared API auth helper: attach the stored bearer token to protected API requests. */
(() => {
    if (window.__octoApiFetchAuthInstalled) return;
    window.__octoApiFetchAuthInstalled = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        if (!url.includes("/api/")) return originalFetch(input, init);
        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
        const token = localStorage.getItem("auth_token");
        if (token && !headers.has("Authorization")) {
            headers.set("Authorization", `Bearer ${token}`);
        }
        return originalFetch(input, { ...init, headers });
    };
})();


const API_URL = "https://studybuddy-bl8d.onrender.com/api";
let visibleMonth = new Date();
let loadedSessions = [];

document.addEventListener("DOMContentLoaded", () => {
    loadSessions();
    window.setInterval(loadSessions, 30000);
    const buttons = document.querySelectorAll(".calendar-buttons button");
    if (buttons[0]) buttons[0].addEventListener("click", previousMonth);
    if (buttons[1]) buttons[1].addEventListener("click", nextMonth);
});

async function loadSessions() {
    const container = document.querySelector(".upcoming-card");

    if (!container) {
        console.error("Could not find the upcoming sessions section.");
        return;
    }

    // Remove the example sessions from the HTML.
    container.querySelectorAll(".session").forEach(session => session.remove());

    const userId = localStorage.getItem("user_id");

    if (!userId) {
        showMessage(container, "Please log in to view your tutoring sessions.");
        return;
    }

    try {
        const role = (localStorage.getItem("user_role") || localStorage.getItem("role") || "student").toLowerCase();
        const endpoint = role === "buddy" || role === "octo buddy"
            ? `sessions/buddy/${encodeURIComponent(userId)}`
            : `sessions/student/${encodeURIComponent(userId)}`;
        const response = await fetch(`${API_URL}/${endpoint}`);

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }

        const data = await response.json();

        if (data.status !== "success") {
            throw new Error(data.message || "Could not load sessions.");
        }

        loadedSessions = data.sessions || [];
        renderMonthCalendar();
        if (!data.sessions || data.sessions.length === 0) {
            showMessage(container, "You have no tutoring sessions booked yet.");
            return;
        }

        data.sessions.forEach(session => {
            container.appendChild(createSessionCard(session));
        });

    } catch (error) {
        console.error("Error loading tutoring sessions:", error);
        showMessage(
            container,
            "Unable to load your sessions. Please try again later."
        );
    }
}


function renderMonthCalendar() {
    const title = document.querySelector(".calendar-card .card-header h2");
    const grid = document.querySelector(".calendar-days");
    if (!grid) return;
    if (title) title.textContent = visibleMonth.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const first = new Date(year, month, 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date(); today.setHours(0,0,0,0);
    const cells = [];
    for (let i = 0; i < mondayOffset; i++) cells.push('<div class="empty"></div>');
    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${year}-${String(month + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
        const sessions = loadedSessions.filter(item => {
            const bookedDate = String(item.date || item.session_date || item.sessionDate || "").slice(0, 10);
            return bookedDate === dateKey && String(item.status || "").toLowerCase() !== "cancelled";
        });
        const todayClass = new Date(year, month, day).getTime() === today.getTime() ? " today" : "";
        const sessionClass = sessions.length ? " session-day" : "";
        const sessionMarkup = sessions.length ? `<span class="calendar-session-dot" title="${sessions.length} booked session${sessions.length === 1 ? "" : "s"}"></span>` : "";
        const detailMarkup = sessions.map(item => `<small class="calendar-session">${escapeHtml(String(item.time || item.session_time || "").slice(0,5))} ${escapeHtml(item.module || "Session")}</small>`).join("");
        cells.push(`<div class="calendar-date${todayClass}${sessionClass}" data-date="${dateKey}" title="${sessions.length ? sessions.map(item => `${item.module || "Session"} ${item.time || item.session_time || ""}`).join("; ") : ""}"><strong>${day}</strong>${sessionMarkup}${detailMarkup}</div>`);
    }
    while (cells.length % 7) cells.push('<div class="empty"></div>');
    grid.innerHTML = cells.join("");
}

function createSessionCard(session) {
    const card = document.createElement("div");
    card.className = "session";

    const date = parseSessionDate(session.date || session.session_date);
    const dayName = date
        ? date.toLocaleDateString("en-ZA", { weekday: "short" }).toUpperCase()
        : "DATE";

    const dayNumber = date
        ? date.getDate()
        : "--";

    const buddyName = getPersonName(session.buddy) ||
        session.buddy_name || session.buddy ||
        "Your Octo Buddy";

    const status = String(session.status || "pending").toLowerCase();
    const canJoin = Boolean(session.room_code) &&
        ["confirmed", "approved", "booked", "scheduled"].includes(status);

    const dateBox = document.createElement("div");
    dateBox.className = "session-date";

    const weekday = document.createElement("span");
    weekday.textContent = dayName;

    const day = document.createElement("strong");
    day.textContent = dayNumber;

    dateBox.append(weekday, day);

    const info = document.createElement("div");
    info.className = "session-info";

    const moduleName = document.createElement("h3");
    moduleName.textContent = session.module || "Tutoring Session";

    const time = document.createElement("p");
    time.textContent = formatSessionTime(session.time || session.session_time);

    const buddy = document.createElement("p");
    buddy.textContent = `Octo Buddy: ${buddyName}`;

    const statusLine = document.createElement("p");
    statusLine.textContent =
        `Status: ${session.status || "Pending"}`;

    info.append(moduleName, time, buddy, statusLine);

    const action = document.createElement("div");
    action.className = "session-action";

    const statusBadge = document.createElement("span");
    statusBadge.className = `status ${status}`;
    statusBadge.textContent = session.status || "Pending";

    action.appendChild(statusBadge);

    if (canJoin) {
        const joinButton = document.createElement("button");
        joinButton.className = "join-btn";
        joinButton.textContent = "Join Session →";

        joinButton.addEventListener("click", () => {
            const roomUrl =
                `https://meet.jit.si/${encodeURIComponent(session.room_code)}`;

            window.open(roomUrl, "_blank", "noopener,noreferrer");
        });

        action.appendChild(joinButton);
    } else {
        const message = document.createElement("p");
        message.className = "session-message";
        message.textContent = session.room_code
            ? "Waiting for confirmation"
            : "Meeting room not available yet";

        action.appendChild(message);
    }

    card.append(dateBox, info, action);
    return card;
}

function parseSessionDate(value) {
    if (!value) return null;

    // Avoid timezone shifting a date-only value.
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (match) {
        return new Date(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3])
        );
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatSessionTime(value) {
    if (!value) return "Time not specified";

    // Supports times such as "10:00", "10:00:00" or "14:00".
    const match = String(value).match(/^(\d{1,2}):(\d{2})/);

    if (!match) return String(value);

    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    const start = new Date();
    start.setHours(hours, minutes, 0, 0);

    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const format = date =>
        date.toLocaleTimeString("en-ZA", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true
        });

    return `${format(start)} – ${format(end)}`;
}

function getPersonName(person) {
    if (!person) return "";
    if (typeof person === "string") return person;

    return [
        person.first_name,
        person.last_name
    ].filter(Boolean).join(" ");
}

function showMessage(container, message) {
    const element = document.createElement("p");
    element.className = "session-message";
    element.textContent = message;
    container.appendChild(element);
}


function previousMonth() {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
    renderMonthCalendar();
}

function nextMonth() {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
    renderMonthCalendar();
}
