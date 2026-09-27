/* =========================================================
   OCTO BUDDY - SESSIONS PAGE
   Shows the logged-in user's real tutoring sessions and
   keeps the existing calendar controls working.
========================================================= */

const API_BASE_URL = "http://127.0.0.1:5000/api";

let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();


document.addEventListener("DOMContentLoaded", () => {
    updateCalendarHeader();
    loadSessions();
});


/* =========================================================
   LOAD REAL SESSIONS
========================================================= */

async function loadSessions() {
    const userId =
        localStorage.getItem("user_id");

    if (!userId) return;

    const role =
        (localStorage.getItem("role") || "student")
            .toLowerCase();

    const endpoint =
        role === "buddy"
            ? `${API_BASE_URL}/sessions/buddy/${userId}`
            : `${API_BASE_URL}/sessions/student/${userId}`;

    try {
        const response =
            await fetch(endpoint);

        if (!response.ok) return;

        const data = await response.json();

        renderSessions(data.sessions || []);

    } catch (error) {
        console.warn("Could not load sessions:", error);
    }
}


/**
 * Replace the example session cards with real sessions.
 * The surrounding page structure and CSS classes are preserved.
 */
function renderSessions(sessions) {
    // The page's three example session cards all use ".session".
    const existingSessions =
        document.querySelectorAll(".session");

    if (!existingSessions.length) return;

    // Remove the static demo cards.
    existingSessions.forEach(session => session.remove());

    const calendarLayout =
        document.querySelector(".session-layout");

    if (!calendarLayout) return;

    // Find the element that originally contained the sessions.
    // The sessions section is the second major card after the calendar.
    const sessionSection =
        document.querySelector(".upcoming-card");

    if (!sessionSection) return;

    let list =
        sessionSection.querySelector(".sessions-list");

    if (!list) {
        list = document.createElement("div");
        list.className = "sessions-list";
        sessionSection.appendChild(list);
    }

    if (!sessions.length) {
        list.innerHTML = `
            <div class="session">
                <div class="session-info">
                    <h3>No sessions scheduled</h3>
                    <p>Your confirmed tutoring sessions will appear here.</p>
                </div>
            </div>
        `;
        return;
    }

    sessions.forEach(session => {
        const card =
            document.createElement("div");

        card.className = "session";

        const sessionDate =
            new Date(`${session.date}T00:00:00`);

        const day =
            sessionDate.getDate();

        const weekday =
            sessionDate
                .toLocaleDateString("en-ZA", {
                    weekday: "short"
                })
                .toUpperCase();

        const otherPerson =
            roleIsBuddy()
                ? session.student
                : session.buddy;

        const action =
            session.status === "Confirmed"
                ? `
                    <button
                        class="join-btn"
                        onclick="joinSession('${escapeJs(session.room_code)}')">
                        Join Session →
                    </button>
                `
                : `
                    <span class="status pending">
                        ${escapeHtml(session.status)}
                    </span>
                `;

        card.innerHTML = `
            <div class="session-date">
                <span>${escapeHtml(weekday)}</span>
                <strong>${day}</strong>
            </div>

            <div class="session-info">
                <h3>${escapeHtml(session.module)}</h3>
                <p>${escapeHtml(session.time)}</p>
                <p>${roleIsBuddy() ? "Student" : "Octo Buddy"}: ${escapeHtml(otherPerson || "—")}</p>
            </div>

            <div class="session-action">
                ${action}
                <button
                    class="details-btn"
                    onclick="viewSessionDetails(
                        '${escapeJs(session.module)}',
                        '${escapeJs(session.date)}',
                        '${escapeJs(session.time)}',
                        '${escapeJs(session.student || "")}',
                        '${escapeJs(session.buddy || "")}'
                    )">
                    View Details
                </button>
            </div>
        `;

        list.appendChild(card);
    });
}


function roleIsBuddy() {
    return (
        localStorage.getItem("role") || "student"
    ).toLowerCase() === "buddy";
}


/* =========================================================
   JOIN SESSION
========================================================= */

function joinSession(roomName) {
    if (!roomName) {
        alert("This session does not have a video room yet.");
        return;
    }

    window.open(
        `https://meet.jit.si/${encodeURIComponent(roomName)}`,
        "_blank"
    );
}


/* =========================================================
   CALENDAR
========================================================= */

function previousMonth() {
    currentMonth--;

    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    }

    updateCalendarHeader();
}


function nextMonth() {
    currentMonth++;

    if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }

    updateCalendarHeader();
}


function updateCalendarHeader() {
    const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December"
    ];

    const monthTitle =
        document.querySelector(
            ".calendar-card .card-header h2"
        );

    if (monthTitle) {
        monthTitle.textContent =
            `${monthNames[currentMonth]} ${currentYear}`;
    }
}


/* =========================================================
   SESSION DETAILS
========================================================= */

function viewSessionDetails(
    module,
    date,
    time,
    student,
    buddy
) {
    alert(
        "Session Details\n\n" +
        `Module: ${module}\n` +
        `Date: ${date}\n` +
        `Time: ${time}\n` +
        `Student: ${student || "—"}\n` +
        `Octo Buddy: ${buddy || "—"}`
    );
}


/* =========================================================
   HELPERS
========================================================= */

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function escapeJs(value) {
    return String(value ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'");
}
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