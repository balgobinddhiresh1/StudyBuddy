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

/* =========================================================
   OCTO BUDDY - TUTOR DASHBOARD
   Connects the existing Buddy dashboard to the Flask backend.
========================================================= */

const API_BASE_URL = "https://studybuddy-bl8d.onrender.com/api/";
let jitsiApi = null;


document.addEventListener("DOMContentLoaded", () => {
    displayCurrentDate();
    loadBuddyProfile();
    loadBuddySessions();
    loadBuddyStudents();
    window.setInterval(() => { loadBuddySessions(); loadBuddyStudents(); }, 30000);
});


/* =========================================================
   CURRENT DATE
========================================================= */

function displayCurrentDate() {
    const dateElement =
        document.getElementById("currentDate");

    if (!dateElement) return;

    dateElement.textContent =
        new Date().toLocaleDateString(
            "en-ZA",
            {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric"
            }
        );
}


/* =========================================================
   MOBILE MENU
========================================================= */
/* =========================================================
   MOBILE MENU
========================================================= */

function toggleMobileMenu() {
    const navLinks =
        document.getElementById("navLinks");

    const hamburgerBtn =
        document.getElementById("hamburgerBtn");

    const overlay =
        document.getElementById("mobileNavOverlay");

    if (!navLinks || !hamburgerBtn) return;

    navLinks.classList.toggle("mobile-open");
    hamburgerBtn.classList.toggle("open");

    if (overlay) {
        overlay.classList.toggle("show");
    }

    document.body.style.overflow =
        navLinks.classList.contains("mobile-open")
            ? "hidden"
            : "";
}


window.addEventListener("resize", () => {
    if (window.innerWidth <= 850) return;

    const navLinks =
        document.getElementById("navLinks");

    const hamburgerBtn =
        document.getElementById("hamburgerBtn");

    const overlay =
        document.getElementById("mobileNavOverlay");

    if (navLinks) navLinks.classList.remove("mobile-open");
    if (hamburgerBtn) hamburgerBtn.classList.remove("open");
    if (overlay) overlay.classList.remove("show");

    document.body.style.overflow = "";
});
/* =========================================================
   BOTTOM MOBILE NAV
========================================================= */

document.addEventListener('DOMContentLoaded', function () {

    const bottomNav = document.getElementById('bottomNav');
    const circle = document.getElementById('bottomNavCircle');

    if (bottomNav && circle) {

        const bottomItems = bottomNav.querySelectorAll('.bottom-nav-item');

        function cxForIndex(index) {
            return ((index + 0.5) / bottomItems.length) * 100;
        }

        function setCirclePosition(cx) {
            circle.style.left = `calc(${cx}% - 38px)`;
        }

        function fillCircleWithIcon(item) {
            const iconMarkup = item.querySelector('.bottom-nav-icon').innerHTML;
            circle.innerHTML = `<span class="bottom-nav-icon">${iconMarkup}</span>`;
        }

        const activeIndex = Array.from(bottomItems).findIndex(i => i.classList.contains('active'));
        const startIndex = activeIndex >= 0 ? activeIndex : 0;

        setCirclePosition(cxForIndex(startIndex));
        fillCircleWithIcon(bottomItems[startIndex]);

        bottomItems.forEach((item, index) => {
            item.addEventListener('click', function () {
                bottomItems.forEach(i => i.classList.remove('active'));
                this.classList.add('active');

                setCirclePosition(cxForIndex(index));
                fillCircleWithIcon(this);
            });
        });

        window.addEventListener('resize', () => {
            const active = Array.from(bottomItems).findIndex(i => i.classList.contains('active'));
            setCirclePosition(cxForIndex(active >= 0 ? active : 0));
        });
    }

});
/* =========================================================
   PROFILE
========================================================= */

async function loadBuddyProfile() {
    const userId = localStorage.getItem("user_id");

    if (!userId) {
        updateDOMProfile({
            first_name: "Buddy",
            last_name: "",
            role: "buddy"
        });
        return;
    }

    try {
        const response =
            await fetch(`${API_BASE_URL}user/${userId}`);

        if (!response.ok) {
            throw new Error("Profile could not be loaded.");
        }

        const user = await response.json();

        localStorage.setItem("user", JSON.stringify(user));
        localStorage.setItem("first_name", user.first_name || "");
        localStorage.setItem("last_name", user.last_name || "");
        localStorage.setItem("role", user.role || "buddy");

        updateDOMProfile(user);

    } catch (error) {
        console.warn("Profile API unavailable:", error);

        updateDOMProfile({
            first_name:
                localStorage.getItem("first_name") || "Buddy",
            last_name:
                localStorage.getItem("last_name") || "",
            role:
                localStorage.getItem("role") || "buddy"
        });
    }
}


function updateDOMProfile(data) {
    const firstName = data.first_name || "Buddy";
    const lastName = data.last_name || "";
    const role = (data.role || "buddy").toLowerCase();

    const navUserName =
        document.getElementById("navUserName");

    const navUserInitials =
        document.getElementById("navUserInitials");

    const welcomeFirstName =
        document.getElementById("welcomeFirstName");

    const navroleDisplay =
        document.getElementById("navroleDisplay");

    if (welcomeFirstName) {
        welcomeFirstName.textContent = firstName;
    }

    if (navUserName) {
        navUserName.textContent =
            `${firstName} ${lastName}`.trim();
    }

    if (navroleDisplay) {
        navroleDisplay.textContent = `@${role}`;
    }

    if (navUserInitials) {
        navUserInitials.textContent =
            `${firstName.charAt(0)}${lastName.charAt(0) || ""}`
                .toUpperCase();
    }

    setText("statPoints", data.points || 0);
}


function setText(id, value) {
    const element =
        document.getElementById(id);

    if (element) {
        element.textContent = value;
    }
}


/* Buddy profiles are read-only. */

document.addEventListener('DOMContentLoaded', function () {
    const profileBtn = document.getElementById('profileBtn');
    const profileDropdown = document.getElementById('profileDropdown');

    if (profileBtn && profileDropdown) {
        profileBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            profileDropdown.classList.toggle('show');
        });

        document.addEventListener('click', function (e) {
            if (!profileDropdown.contains(e.target) && e.target !== profileBtn) {
                profileDropdown.classList.remove('show');
            }
        });
    }
});
/* =========================================================
   BUDDY SESSIONS
========================================================= */

async function loadBuddySessions() {
    const userId =
        localStorage.getItem("user_id");

    if (!userId) return;

    try {
        const response =
            await fetch(`${API_BASE_URL}sessions/buddy/${userId}`);

        if (!response.ok) return;

        const data = await response.json();
        const sessions = data.sessions || [];
        renderBuddySchedule(sessions);

        setText(
            "statUpcoming",
            sessions.filter(
                session => session.status === "Confirmed"
            ).length
        );

        setText(
            "statCompleted",
            sessions.filter(
                session => session.status === "Completed"
            ).length
        );

        const now = new Date();
        const futureSessions = sessions
            .filter(session => ["pending", "confirmed"].includes(String(session.status || "").toLowerCase()))
            .filter(session => {
                const dateValue = String(session.date || session.session_date || session.sessionDate || "").slice(0, 10);
                const timeValue = String(session.time || session.session_time || "00:00").slice(0, 5);
                if (!dateValue) return false;
                const start = new Date(`${dateValue.slice(0, 10)}T${timeValue}:00`);
                return !Number.isNaN(start.getTime()) && start >= now;
            })
            .sort((a, b) => `${a.date || a.session_date} ${a.time || a.session_time}`.localeCompare(`${b.date || b.session_date} ${b.time || b.session_time}`));

        renderNextBuddySession(futureSessions[0]);

    } catch (error) {
        console.warn("Could not load Buddy sessions:", error);
    }
}



function buddyEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[char]));
}

function sessionStart(session) {
    const dateValue = String(session.date || session.session_date || session.sessionDate || "").slice(0, 10);
    const timeValue = String(session.time || session.session_time || "00:00").slice(0, 5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return null;
    const result = new Date(`${dateValue}T${timeValue}:00`);
    return Number.isNaN(result.getTime()) ? null : result;
}

function renderNextBuddySession(session) {
    const card = document.querySelector(".upcoming-card");
    if (!card) return;
    const dateBox = card.querySelector(".session-date");
    const info = card.querySelector(".session-info");
    const badge = card.querySelector(".status-badge");
    const actions = card.querySelector(".session-actions");
    if (!session) {
        if (dateBox) dateBox.innerHTML = '<span class="day">NEXT</span><strong>—</strong><span class="month">SESSION</span>';
        if (info) info.innerHTML = '<h3>No upcoming session</h3><p>Your next booked session will appear here.</p>';
        if (badge) badge.textContent = "No upcoming session";
        if (actions) actions.style.display = "none";
        localStorage.removeItem("active_buddy_room");
        return;
    }
    const start = sessionStart(session);
    if (dateBox) dateBox.innerHTML = `<span class="day">${start ? buddyEscape(start.toLocaleDateString("en-ZA", {weekday:"short"}).toUpperCase()) : "DATE"}</span><strong>${start ? start.getDate() : "—"}</strong><span class="month">${start ? buddyEscape(start.toLocaleDateString("en-ZA", {month:"short"}).toUpperCase()) : ""}</span>`;
    if (info) info.innerHTML = `<h3>${buddyEscape(session.module || "Tutoring session")}</h3><p>Student: <strong>${buddyEscape(session.student || "Student")}</strong></p><p>${buddyEscape(String(session.time || session.session_time || "Time not specified").slice(0,5))}</p><p>Room: <strong>${buddyEscape(session.room_code || "Not assigned")}</strong></p>`;
    if (badge) badge.textContent = session.status || "Confirmed";
    if (actions) {
        const isConfirmed = String(session.status || "").toLowerCase() === "confirmed";
        const canEnter = isConfirmed && start && new Date() >= start && start.toDateString() === new Date().toDateString();
        actions.innerHTML = isConfirmed && session.room_code
            ? `<button class="primary-button" ${canEnter ? `onclick="joinTutorRoom('${buddyEscape(session.room_code)}')"` : "disabled"}>Enter Session →</button>`
            : `<p>Waiting for your approval</p>`;
        actions.style.display = "flex";
    }
    if (session.room_code) localStorage.setItem("active_buddy_room", session.room_code);
    else localStorage.removeItem("active_buddy_room");
}

function renderBuddySchedule(sessions) {
    const list = document.querySelector(".schedule-list");
    if (!list) return;
    const upcoming = (sessions || [])
        .filter(session => !["cancelled", "completed"].includes(String(session.status || "").toLowerCase()))
        .sort((a, b) => `${a.date || a.session_date} ${a.time || a.session_time}`.localeCompare(`${b.date || b.session_date} ${b.time || b.session_time}`));
    const note = document.querySelector(".schedule-card .schedule-note");
    if (!upcoming.length) {
        list.innerHTML = '<p class="schedule-note">No tutoring sessions have been scheduled yet.</p>';
        if (note) note.remove();
        return;
    }
    if (note) note.remove();
    list.innerHTML = upcoming.slice(0, 6).map(session => {
        const start = sessionStart(session);
        const dateLabel = start ? start.toLocaleDateString("en-ZA", {weekday:"short", day:"numeric", month:"long", year:"numeric"}) : (session.date || session.session_date || "Date not set");
        const timeText = String(session.time || session.session_time || "Time not set").slice(0,5);
        const status = String(session.status || "Pending");
        const controls = status.toLowerCase() === "pending"
            ? `<div class="buddy-session-actions"><button type="button" onclick="respondToBooking(${Number(session.id)}, 'Confirmed')">Approve</button><button type="button" onclick="respondToBooking(${Number(session.id)}, 'Rejected')">Reject</button></div>`
            : status.toLowerCase() === "confirmed"
                ? `<div class="buddy-session-actions">${session.room_code ? `<button type="button" onclick="joinTutorRoom('${buddyEscape(session.room_code)}')" ${start && (new Date() < start) ? "disabled" : ""}>Enter session</button>` : ""}</div>`
                : "";
        return `<div class="schedule-row"><div class="schedule-time"><strong>${buddyEscape(timeText)}</strong><span>${buddyEscape(dateLabel)}</span></div><div class="schedule-info"><strong>${buddyEscape(session.module || "Tutoring session")}</strong><p>${buddyEscape(session.student || "Student")} · ${buddyEscape(status)}</p></div><div class="schedule-controls"><span class="status-badge">${buddyEscape(status)}</span>${controls}</div></div>`;
    }).join("");
}

async function respondToBooking(sessionId, status) {
    const verb = status === "Confirmed" ? "approve" : "reject";
    if (!confirm(`Are you sure you want to ${verb} this session request?`)) return;
    try {
        const response = await fetch(`${API_BASE_URL}sessions/${sessionId}/status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || `Could not ${verb} request.`);
        await loadBuddySessions();
        alert(status === "Confirmed" ? "Session approved. The student has been notified." : "Session request rejected.");
    } catch (error) { alert(error.message || "Could not update the session."); }
}

/* =========================================================
   MY STUDENTS
========================================================= */

async function loadBuddyStudents() {
    const userId =
        localStorage.getItem("user_id");

    if (!userId) return;

    try {
        const response =
            await fetch(`${API_BASE_URL}sessions/buddy/${userId}`);

        if (!response.ok) return;

        const data = await response.json();

        window.myBuddyStudents =
            [...new Set(
                (data.sessions || [])
                    .map(session => session.student)
                    .filter(Boolean)
            )];

    } catch (error) {
        console.warn("Could not load students:", error);
    }
}


function viewMyStudents() {
    window.location.href = "my-students.html";
}

/* =========================================================
   MY SCHEDULE
========================================================= */

function openMySchedule() {
    window.location.href =
        "../sessions/sessions.html";
}


/* =========================================================
   JOIN SESSION
========================================================= */

function joinBuddyRoom() {
    const room = localStorage.getItem("active_buddy_room");
    if (!room) {
        alert("There is no approved session available to enter.");
        return;
    }
    // Always ask the backend to validate approval and scheduled start time.
    joinTutorRoom(room);
}


async function joinTutorRoom(roomName) {
    if (!roomName) { alert("This session does not have a video room yet."); return; }
    try {
        const token = localStorage.getItem("auth_token") || "";
        const response = await fetch(`${API_BASE_URL}sessions/room/${encodeURIComponent(roomName)}/join`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Could not start this session.");
        localStorage.setItem("octo_active_buddy_room", roomName);
        launchJitsiCall(roomName);
    } catch (error) { alert(error.message || "Could not join the session."); }
}


function launchJitsiCall(roomName) {
    const firstName =
        localStorage.getItem("first_name") || "Buddy";

    const lastName =
        localStorage.getItem("last_name") || "";

    const displayName =
        `${firstName} ${lastName}`.trim();

    const modal =
        document.getElementById("jitsiModal");

    const container =
        document.getElementById("jitsiContainer");

    const title =
        document.getElementById("jitsiModalTitle");

    if (!modal || !container) {
        window.open(
            `https://meet.jit.si/${encodeURIComponent(roomName)}`,
            "_blank"
        );
        return;
    }

    if (title) {
        title.textContent =
            `Octo Buddy Room: ${roomName}`;
    }

    modal.style.display = "flex";
    container.innerHTML = "";

    if (typeof JitsiMeetExternalAPI === "undefined") {
        window.open(
            `https://meet.jit.si/${encodeURIComponent(roomName)}`,
            "_blank"
        );
        return;
    }

    jitsiApi =
        new JitsiMeetExternalAPI(
            "meet.jit.si",
            {
                roomName,
                width: "100%",
                height: "100%",
                parentNode: container,
                userInfo: {
                    displayName
                },
                configOverwrite: {
                    startWithAudioMuted: false,
                    startWithVideoMuted: false,
                    prejoinPageEnabled: false
                }
            }
        );

    jitsiApi.addEventListeners({
        videoConferenceLeft: async () => {
            const room = localStorage.getItem("octo_active_buddy_room");
            if (room) {
                try {
                    const token = localStorage.getItem("auth_token") || "";
                    await fetch(`${API_BASE_URL}sessions/room/${encodeURIComponent(room)}/end`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
                } catch (error) { console.warn("Could not record session end."); }
                localStorage.removeItem("octo_active_buddy_room");
            }
            closeJitsiSession();
            loadBuddySessions();
        }
    });
}


function closeJitsiSession() {
    if (jitsiApi) {
        jitsiApi.dispose();
        jitsiApi = null;
    }

    const modal =
        document.getElementById("jitsiModal");

    if (modal) {
        modal.style.display = "none";
    }
}


/* =========================================================
   LOGOUT
========================================================= */

function logout() {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user");
    localStorage.removeItem("first_name");
    localStorage.removeItem("last_name");
    localStorage.removeItem("role");
    localStorage.removeItem("active_buddy_room");

    window.location.href = "../signin_login/project.html";
}
    let lastScrollY = window.scrollY;
    const siteHeader = document.querySelector('header');

    window.addEventListener('scroll', function () {
        const currentScrollY = window.scrollY;

        if (currentScrollY > lastScrollY && currentScrollY > 100) {
            siteHeader.classList.add('nav-hidden');
        } else {
            siteHeader.classList.remove('nav-hidden');
        }

        lastScrollY = currentScrollY;

        let lastScrollY = window.scrollY;
const siteHeader = document.querySelector('header');

window.addEventListener('scroll', function () {
    const currentScrollY = window.scrollY;

    if (currentScrollY > lastScrollY && currentScrollY > 100) {
        siteHeader.classList.add('nav-hidden');
    } else {
        siteHeader.classList.remove('nav-hidden');
    }

    lastScrollY = currentScrollY;
});
    });
    