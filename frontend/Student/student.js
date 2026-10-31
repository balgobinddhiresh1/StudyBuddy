
async function loadAvailableTutors() {
    // This roster is independent of the booking form and loads on page entry.
    const listPanel = document.getElementById("availableTutorsList");
    if (!listPanel) return;
    listPanel.innerHTML = "<p>Loading available Octo Buddies…</p>";

    try {
        const token = localStorage.getItem("auth_token") || "";
        const response = await fetch(`${API_BASE_URL}available-tutors`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Could not load Octo Buddies.");

        const tutors = Array.isArray(data.tutors) ? data.tutors : [];
        if (!tutors.length) {
            listPanel.innerHTML = `
              <p>No approved Octo Buddies currently match your saved qualification and academic year.</p>
              <p><strong>${escapeHtml(data.qualification || "Qualification not set")}</strong> · Year ${escapeHtml(String(data.academic_year || "—"))}</p>`;
            return;
        }

        const rows = tutors.flatMap(tutor => (tutor.modules || []).map(moduleName => {
            const dates = (tutor.available_dates || []).map(value => {
                const parsed = new Date(`${value}T00:00:00`);
                return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
            });
            return `<tr>
              <td>${escapeHtml(`${tutor.first_name || ""} ${tutor.last_name || ""}`.trim())}</td>
              <td>${escapeHtml(moduleName)}</td>
              <td>${escapeHtml((tutor.available_days || []).join(", ") || "Not published")}</td>
              <td>${escapeHtml(dates.length ? dates.join(", ") : "No upcoming dates available")}</td>
            </tr>`;
        }));

        listPanel.innerHTML = `
          <p>Automatically matched to <strong>${escapeHtml(data.qualification || "your qualification")}</strong>, Year <strong>${escapeHtml(String(data.academic_year || "—"))}</strong>. No booking-form details are needed to view this list.</p>
          <div class="available-tutors-scroll" style="max-height:340px;overflow:auto;border:1px solid #dbe7ee;border-radius:10px;background:#fff">
            <table class="available-tutors-table" style="width:100%;border-collapse:collapse;min-width:650px">
              <thead style="position:sticky;top:0;background:#eef6fa;z-index:1"><tr>
                <th style="text-align:left;padding:12px;border-bottom:1px solid #dbe7ee">Octo Buddy</th>
                <th style="text-align:left;padding:12px;border-bottom:1px solid #dbe7ee">Module</th>
                <th style="text-align:left;padding:12px;border-bottom:1px solid #dbe7ee">Available days</th>
                <th style="text-align:left;padding:12px;border-bottom:1px solid #dbe7ee">Available dates (next 30 days)</th>
              </tr></thead>
              <tbody>${rows.join("")}</tbody>
            </table>
          </div>`;
    } catch (error) {
        listPanel.innerHTML = `<p>${escapeHtml(error.message || "Could not load Octo Buddies. Please sign in again and refresh the page.")}</p>`;
    }
}

function updateAvailableTimes() {
    const buddyField = document.getElementById("buddyId");
    const timeField = document.getElementById("time");
    if (!buddyField || !timeField) return;
    const option = buddyField.selectedOptions[0];
    const times = option?.dataset?.times ? JSON.parse(option.dataset.times) : [];
    timeField.replaceChildren(new Option(times.length ? "Select an available time" : "No times available", ""));
    times.forEach(time => timeField.add(new Option(time, time)));
    timeField.disabled = !times.length;
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("buddyId")?.addEventListener("change", updateAvailableTimes);
});

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
   OCTO BUDDY - STUDENT DASHBOARD
   All student-side interactions live in this file.

   The page design is unchanged. This JavaScript connects the
   existing HTML controls to the Flask API so the dashboard
   behaves like a real web application.
========================================================= */

const API_BASE_URL = "https://studybuddy-bl8d.onrender.com/api/";

async function configureBookingModules(user) {
    const select = document.getElementById("module");
    if (!select) return;
    const course = String(user?.course || "General").toLowerCase();
    const fallbackCatalog = ["Programming", "Database Systems", "Networking", "Web Development"];
    let modules = fallbackCatalog;
    try {
        const token = localStorage.getItem("auth_token") || "";
        const response = await fetch(`${API_BASE_URL}modules`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data.modules)) modules = data.modules;
        } else if (course.includes("computer science")) modules = ["Programming", "Database Systems", "Networking"];
        else if (course.includes("business administration")) modules = [];
    } catch (error) {
        console.warn("Could not load the managed module catalogue; using fallback modules.", error);
        if (course.includes("computer science")) modules = ["Programming", "Database Systems", "Networking"];
        else if (course.includes("business administration")) modules = [];
    }
    const previous = select.value;
    select.replaceChildren(new Option("Select a module", ""));
    modules.forEach(name => select.add(new Option(name, name)));
    if (modules.includes(previous)) select.value = previous;
    if (!modules.length) {
        select.add(new Option("No matching modules are configured for this qualification/year", ""));
        select.disabled = true;
    } else select.disabled = false;
}

let jitsiApi = null;


/* =========================================================
   PAGE STARTUP
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    // Resolve saved qualification/year before requesting the tutor roster.
    loadLoggedInUser().finally(() => loadAvailableTutors());
    loadUpcomingSessions();
    setupBookingForm();
    setupMarksForm();
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
   LOGGED-IN USER
========================================================= */

/**
 * Load the current student from the backend.
 * localStorage is used only to remember which user logged in.
 */
async function loadLoggedInUser() {
    const userId =
        localStorage.getItem("user_id") ||
        sessionStorage.getItem("user_id");

    if (!userId) {
        updateDOMProfile({
            first_name: "Student",
            last_name: "",
            role: "student"
        });
        return;
    }

    try {
        const response =
            await fetch(`${API_BASE_URL}user/${userId}`);

        if (!response.ok) {
            throw new Error("Could not load user profile.");
        }

        const user = await response.json();

        // Keep a local copy so the page still has basic identity
        // information if the API is temporarily unavailable.
        localStorage.setItem("user", JSON.stringify(user));
        localStorage.setItem("first_name", user.first_name || "");
        localStorage.setItem("last_name", user.last_name || "");
        localStorage.setItem("role", user.role || "student");

        updateDOMProfile(user);
        configureBookingModules(user);

    } catch (error) {
        console.warn("Could not reach profile API:", error);

        const cached =
            JSON.parse(localStorage.getItem("user") || "{}");

        const cachedProfile = {
            first_name:
                cached.first_name ||
                localStorage.getItem("first_name") ||
                "Student",
            last_name:
                cached.last_name ||
                localStorage.getItem("last_name") ||
                "",
            role:
                cached.role ||
                localStorage.getItem("role") ||
                "student",
            email: cached.email || "",
            course: cached.course || "General",
            academic_year: cached.academic_year || "",
            points: cached.points || 0
        };
        updateDOMProfile(cachedProfile);
        configureBookingModules(cachedProfile);
    }
}


/**
 * Put user information into all profile areas on the page.
 */
function updateDOMProfile(data) {
    const firstName = data.first_name || "Student";
    const lastName = data.last_name || "";
    const role = (data.role || "student").toLowerCase();

    const navUserName = document.getElementById("navUserName");
    const navUserInitials = document.getElementById("navUserInitials");
    const welcomeFirstName = document.getElementById("welcomeFirstName");
    const navroleDisplay = document.getElementById("navroleDisplay");

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

    const firstInitial =
        firstName.charAt(0).toUpperCase() || "S";

    const lastInitial =
        lastName.charAt(0).toUpperCase() || "";

    if (navUserInitials) {
        navUserInitials.textContent =
            `${firstInitial}${lastInitial}`;
    }

    // Profile card
    const profileFullName =
        document.getElementById("profileFullName");

    const profileEmail =
        document.getElementById("profileEmail");

    const profileCourse =
        document.getElementById("profileCourse");

    const profileYear =
        document.getElementById("profileYear");

    const profileRole =
        document.getElementById("profileRole");

    const profilePoints =
        document.getElementById("profilePoints");

    if (profileFullName) {
        profileFullName.textContent =
            `${firstName} ${lastName}`.trim();
    }

    if (profileEmail) {
        profileEmail.textContent = data.email || "—";
    }

    if (profileCourse) {
        profileCourse.textContent = data.course || "—";
    }

    if (profileYear) {
        profileYear.textContent =
            data.academic_year
                ? `Year ${data.academic_year}`
                : "—";
    }

    if (profileRole) {
        profileRole.textContent =
            role.charAt(0).toUpperCase() + role.slice(1);
    }

    if (profilePoints) {
        profilePoints.textContent = data.points ?? 0;
    }
}


/* =========================================================
   PROFILE EDIT MODAL
========================================================= */

function openEditModal() {
    const role = (localStorage.getItem("user_role") || localStorage.getItem("role") || "").toLowerCase();
    if (role === "buddy" || role === "octo buddy") {
        alert("Octo Buddy profiles cannot be edited.");
        return;
    }
    const modal = document.getElementById("editModal");

    if (!modal) return;

    document.getElementById("editFirstName").textContent =
        localStorage.getItem("first_name") || "";

    document.getElementById("editLastName").textContent =
        localStorage.getItem("last_name") || "";

    // Load the student's current qualification and year into the form.
    const cachedUser = JSON.parse(localStorage.getItem("user") || "{}");
    const courseSelect = document.getElementById("editCourse");
    const yearSelect = document.getElementById("editAcademicYear");

    if (courseSelect) {
        courseSelect.value = cachedUser.course || "";
    }

    if (yearSelect) {
        yearSelect.value = String(cachedUser.academic_year || "1");
    }

    modal.style.display = "flex";
}


function closeEditModal() {
    const modal = document.getElementById("editModal");

    if (modal) {
        modal.style.display = "none";
    }
}


/**
 * Save the profile through the API and refresh the page data.
 */
async function saveProfileChanges() {
    const namePattern = /^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[ '\u2019-][A-Za-zÀ-ÖØ-öø-ÿ]+)*$/;
    const cachedProfile = JSON.parse(localStorage.getItem("user") || "{}");
    const firstName = cachedProfile.first_name || localStorage.getItem("first_name") || "";
    const lastName = cachedProfile.last_name || localStorage.getItem("last_name") || "";

    const course =
        document.getElementById("editCourse")?.value.trim() || "";

    const academicYear =
        document.getElementById("editAcademicYear")?.value || "";

    const userId =
        localStorage.getItem("user_id") ||
        sessionStorage.getItem("user_id");

    if (!userId) {
        alert("Your login session could not be found. Please log in again.");
        return;
    }

    try {
        const response = await fetch(
            `${API_BASE_URL}user/${userId}`,
            {
                method: "PUT",
                
headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${localStorage.getItem("auth_token") || ""}`
},

                body: JSON.stringify({
                    first_name: firstName,
                    last_name: lastName,
                    course: course,
                    academic_year: Number(academicYear)
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            alert(data.message || "Could not update your profile.");
            return;
        }

        localStorage.setItem("first_name", firstName);
        localStorage.setItem("last_name", lastName);

        // Store the complete updated profile so the dashboard and future
        // visits immediately show the new qualification and year.
        if (data.user) {
            localStorage.setItem("user", JSON.stringify(data.user));
        }

        closeEditModal();
        await loadLoggedInUser();

    } catch (error) {
        console.error("Profile update error:", error);
        alert("Could not connect to the backend server.");
    }
}


/* =========================================================
   TUTORING SESSIONS
========================================================= */

/**
 * Load real sessions for the logged-in student.
 */
async function loadUpcomingSessions() {
    const userId = localStorage.getItem("user_id");

    if (!userId) return;

    try {
        const response =
            await fetch(`${API_BASE_URL}sessions/student/${userId}`);

        if (!response.ok) {
            throw new Error("Could not load sessions.");
        }

        const data = await response.json();

        renderUpcomingSessions(data.sessions || []);

    } catch (error) {
        console.warn("Could not load sessions:", error);
    }
}


/**
 * Update the existing session card without changing its design.
 */
function renderUpcomingSessions(sessions) {
    const container = document.querySelector(".sessions-container");
    if (!container) return;
    container.querySelectorAll(".dynamic-session").forEach(card => card.remove());

    const now = new Date();
    const futureSessions = (sessions || [])
        .filter(session => !["Cancelled", "Rejected"].includes(String(session.status || "").toLowerCase()))
        .filter(session => {
            const start = new Date(`${String(session.date || "").slice(0,10)}T${String(session.time || "00:00").slice(0,5)}:00`);
            return !Number.isNaN(start.getTime()) && start >= now;
        })
        .sort((a,b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
        .slice(0,5);

    const noSession = container.querySelector(".no-session");
    if (!futureSessions.length) {
        if (noSession) noSession.style.display = "";
        return;
    }
    if (noSession) noSession.style.display = "none";

    futureSessions.forEach(session => {
        const start = new Date(`${session.date}T${session.time || "00:00"}`);
        const card = document.createElement("div");
        card.className = "session-card dynamic-session";
        const canJoin = String(session.status || "").toLowerCase() === "confirmed" &&
            start.toDateString() === now.toDateString() && now >= start && Boolean(session.room_code);
        const dateLabel = start.toLocaleDateString("en-ZA", { day:"2-digit", month:"long", year:"numeric" });
        card.innerHTML = `
            <div class="session-date"><span class="day">${String(start.getDate()).padStart(2,"0")}</span><span class="month">${escapeHtml(start.toLocaleDateString("en-ZA",{month:"long"}))}</span></div>
            <div class="session-info">
                <h3>${escapeHtml(session.module || "Tutoring session")}</h3>
                <p>🗓️ ${escapeHtml(dateLabel)}</p>
                <p>🕙 ${escapeHtml(session.time || "Time not set")}</p>
                <p>🐙 Octo Buddy: ${escapeHtml(session.buddy || "Assigned Buddy")}</p>
                <p>Status: <strong>${escapeHtml(session.status || "Pending")}</strong></p>
            </div>
            <div class="session-actions">
                ${String(session.status).toLowerCase() === "confirmed" ? `<button class="join-btn" type="button" ${canJoin ? "" : "disabled"}>${canJoin ? "Enter session" : "Enter session (not yet available)"}</button>` : `<p>Waiting for Octo Buddy approval</p>`}
                <button class="cancel-session-btn" type="button" data-session-id="${Number(session.id)}">Cancel booking</button>
            </div>`;
        const join = card.querySelector(".join-btn");
        if (join) join.addEventListener("click", () => joinTutorRoom(session.room_code));
        card.querySelector(".cancel-session-btn").addEventListener("click", () => cancelStudentSession(Number(session.id)));
        container.insertBefore(card, container.firstChild);
    });
}

async function cancelStudentSession(sessionId) {
    if (!confirm("Cancel this tutoring session request?")) return;
    try {
        const response = await fetch(`${API_BASE_URL}sessions/${sessionId}/status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "Cancelled" })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Could not cancel this session.");
        await loadUpcomingSessions();
        alert("Your session has been cancelled.");
    } catch (error) { alert(error.message || "Could not cancel the session."); }
}

/**
 * Join a Jitsi room assigned by the backend.
 */
async function joinTutorRoom(roomName) {
    if (!roomName) { alert("This session does not have a video room yet."); return; }
    try {
        const token = localStorage.getItem("auth_token") || "";
        const response = await fetch(`${API_BASE_URL}sessions/room/${encodeURIComponent(roomName)}/join`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Your Octo Buddy has not started the session yet.");
        launchJitsiCall(roomName);
    } catch (error) { alert(error.message || "Could not join the session."); }
}


/**
 * Backwards-compatible helper for the original static page.
 */
function loadUpcomingSessionRoom() {
    const activeRoom =
        localStorage.getItem("active_buddy_room");

    const roomDisplay =
        document.getElementById("assignedRoomCode");

    if (roomDisplay && activeRoom) {
        roomDisplay.textContent = activeRoom;
    }
}


/* =========================================================
   JITSI VIDEO CALL
========================================================= */

function launchJitsiCall(roomName) {
    const firstName =
        localStorage.getItem("first_name") || "Student";

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

    if (typeof JitsiMeetExternalAPI !== "undefined") {
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
            videoConferenceLeft: closeJitsiSession
        });

    } else {
        window.open(
            `https://meet.jit.si/${encodeURIComponent(roomName)}`,
            "_blank"
        );
    }
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
   BOOKING
========================================================= */

/**
 * Send the student's booking request to Flask.
 * The backend finds an approved, available Buddy automatically.
 */
function setupBookingForm() {
    const bookingForm =
        document.getElementById("bookingForm");

    if (!bookingForm) return;

    const dateField = document.getElementById("date");
    const timeField = document.getElementById("time");
    const setMinimumBookingDate = () => {
        if (dateField) {
            const now = new Date();
            dateField.min = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
        }
    };
    setMinimumBookingDate();
    dateField?.addEventListener("change", () => {
        if (!dateField.value || !timeField) return;
        const now = new Date();
        const selected = new Date(`${dateField.value}T${timeField.value || "00:00"}`);
        if (dateField.value === dateField.min && selected <= now) timeField.value = "";
    });

    bookingForm.addEventListener("submit", async event => {
        event.preventDefault();

        const module =
            document.getElementById("module").value;

        const date =
            document.getElementById("date").value;

        const time =
            document.getElementById("time").value;

        const userId =
            localStorage.getItem("user_id");

        if (!module || !date || !time) {
            alert("Please complete all booking fields.");
            return;
        }

        const now = new Date();
        const selectedStart = new Date(`${date}T${time}:00`);
        if (selectedStart <= now) {
            alert("Please choose a time in the future. You cannot book a time that has already passed.");
            return;
        }

        if (!userId) {
            alert("Please log in before booking a tutoring session.");
            return;
        }

        const submitButton =
            bookingForm.querySelector("button[type='submit']");

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Finding Octo Buddy...";
        }

        try {
            const response =
                await fetch(`${API_BASE_URL}bookings`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        user_id: Number(userId),
                        module,
                        date,
                        time,
                        buddy_id: Number(document.getElementById("buddyId")?.value || 0) || null
                    })
                });

            const data = await response.json();

            if (!response.ok) {
                alert(data.message || "Booking failed.");
                return;
            }

            // Keep the room available for older page elements.
            if (data.session && data.session.room_code) {
                localStorage.setItem(
                    "active_buddy_room",
                    data.session.room_code
                );
            }

            alert(
                "Your session request has been sent to the Octo Buddy. It will remain Pending until they approve it.\n\n" +
                `Module: ${module}\n` +
                `Date: ${date}\n` +
                `Time: ${time}\n` +
                `Octo Buddy: ${data.session.buddy}`
            );

            bookingForm.reset();
            await loadUpcomingSessions();

        } catch (error) {
            console.error("Booking error:", error);
            alert(
                "Could not connect to the backend server. " +
                "Make sure app.py is running."
            );

        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = "Request Tutoring";
            }
        }
    });
}


/* =========================================================
   ACADEMIC TRACKER
========================================================= */

/**
 * The academic tracker remains client-side because it is an
 * immediate calculation rather than a stored academic record.
 */
function setupMarksForm() {
    const marksForm =
        document.getElementById("marksForm");

    if (!marksForm) return;

    marksForm.addEventListener("submit", event => {
        event.preventDefault();

        const subject =
            document.getElementById("subject").value.trim();

        const score =
            Number(document.getElementById("score").value);

        const result =
            document.getElementById("academicResult");

        if (!subject || !/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ &’'\-]*$/.test(subject)) {
            alert("Please enter a module name using letters and spaces only. Numbers are not allowed.");
            return;
        }

        if (!Number.isFinite(score) || document.getElementById("score").value.trim() === "") {
            alert("Please enter a valid score.");
            return;
        }

        if (score < 0 || score > 100) {
            alert("Score must be between 0 and 100.");
            return;
        }

        if (score < 40) {
            result.innerHTML = `
                <div class="result-icon">🚨</div>
                <h3>Urgent Academic Support</h3>
                <p>Your score for <strong>${escapeHtml(subject)}</strong> is ${score}%.</p>
                <p>We strongly recommend booking an Octo Buddy for this subject.</p>
                <a href="#book" class="primary-btn">Book Tutoring →</a>
            `;

        } else if (score < 50) {
            result.innerHTML = `
                <div class="result-icon">⚠️</div>
                <h3>Academic Support Recommended</h3>
                <p>Your score for <strong>${escapeHtml(subject)}</strong> is ${score}%.</p>
                <p>We recommend booking an Octo Buddy to help you improve your understanding.</p>
                <a href="#book" class="primary-btn">Find Support →</a>
            `;

        } else {
            result.innerHTML = `
                <div class="result-icon">🎉</div>
                <h3>Good Progress!</h3>
                <p>Your score for <strong>${escapeHtml(subject)}</strong> is ${score}%.</p>
                <p>Keep working hard and continue monitoring your academic progress.</p>
            `;
        }
    });
}


/* =========================================================
   SMALL SECURITY HELPERS
========================================================= */

/**
 * Escape text before inserting backend data into HTML.
 */
function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


/**
 * Escape a string before placing it inside an onclick attribute.
 */
function escapeJs(value) {
    return String(value ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'");
}


/* =========================================================
   PROFILE DROPDOWN
========================================================= */

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
   NAVBAR SHOW/HIDE ON SCROLL
========================================================= */

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