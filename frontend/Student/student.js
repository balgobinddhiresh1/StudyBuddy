/* =========================================================
   OCTO BUDDY - STUDENT DASHBOARD
   All student-side interactions live in this file.

   The page design is unchanged. This JavaScript connects the
   existing HTML controls to the Flask API so the dashboard
   behaves like a real web application.
========================================================= */

const API_BASE_URL = "https://studybuddy-bl8d.onrender.com";
let jitsiApi = null;


/* =========================================================
   PAGE STARTUP
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    loadLoggedInUser();
    loadUpcomingSessions();
    setupBookingForm();
    setupMarksForm();
});


/* =========================================================
   MOBILE NAVIGATION
========================================================= */

function toggleMobileMenu() {
    const navLinks = document.getElementById("navLinks");
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const overlay = document.getElementById("mobileNavOverlay");

    if (!navLinks || !hamburgerBtn) return;

    navLinks.classList.toggle("mobile-open");
    hamburgerBtn.classList.toggle("open");

    if (overlay) {
        overlay.classList.toggle("show");
    }

    document.body.style.overflow =
        navLinks.classList.contains("mobile-open") ? "hidden" : "";
}


window.addEventListener("resize", () => {
    const navLinks = document.getElementById("navLinks");
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const overlay = document.getElementById("mobileNavOverlay");

    if (!navLinks || !hamburgerBtn) return;

    if (window.innerWidth > 850) {
        navLinks.classList.remove("mobile-open");
        hamburgerBtn.classList.remove("open");

        if (overlay) overlay.classList.remove("show");

        document.body.style.overflow = "";
    }
});


document.addEventListener("DOMContentLoaded", () => {
    const navLinks = document.getElementById("navLinks");

    if (!navLinks) return;

    navLinks.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", () => {
            if (navLinks.classList.contains("mobile-open")) {
                toggleMobileMenu();
            }
        });
    });
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
            await fetch(`${API_BASE_URL}/user/${userId}`);

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

    } catch (error) {
        console.warn("Could not reach profile API:", error);

        const cached =
            JSON.parse(localStorage.getItem("user") || "{}");

        updateDOMProfile({
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
        });
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
    const modal = document.getElementById("editModal");

    if (!modal) return;

    document.getElementById("editFirstName").value =
        localStorage.getItem("first_name") || "";

    document.getElementById("editLastName").value =
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
    const firstName =
        document.getElementById("editFirstName").value.trim();

    const lastName =
        document.getElementById("editLastName").value.trim();

    const course =
        document.getElementById("editCourse")?.value.trim() || "";

    const academicYear =
        document.getElementById("editAcademicYear")?.value || "";

    const userId =
        localStorage.getItem("user_id") ||
        sessionStorage.getItem("user_id");

    if (!firstName) {
        alert("First name is required.");
        return;
    }

    if (!userId) {
        alert("Your login session could not be found. Please log in again.");
        return;
    }

    try {
        const response = await fetch(
            `${API_BASE_URL}/user/${userId}`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
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
            await fetch(`${API_BASE_URL}/sessions/student/${userId}`);

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
    const container =
        document.querySelector(".sessions-container");

    if (!container) return;

    // Remove old dynamically generated session cards.
    container
        .querySelectorAll(".dynamic-session")
        .forEach(card => card.remove());

    const futureSessions = sessions
        .filter(session => session.status !== "Cancelled")
        .filter(session => {
            const dateTime =
                new Date(`${session.date}T${session.time}`);

            return dateTime >= new Date();
        })
        .slice(0, 5);

    const noSession = container.querySelector(".no-session");

    if (futureSessions.length === 0) {
        if (noSession) noSession.style.display = "";
        return;
    }

    if (noSession) noSession.style.display = "none";

    futureSessions.forEach(session => {
        const card = document.createElement("div");
        card.className = "session-card dynamic-session";

        const sessionDate = new Date(
            `${session.date}T00:00:00`
        );

        const day =
            String(sessionDate.getDate()).padStart(2, "0");

        const month =
            sessionDate
                .toLocaleDateString("en-ZA", { month: "short" })
                .toUpperCase();

        card.innerHTML = `
            <div class="session-date">
                <span class="day">${day}</span>
                <span class="month">${month}</span>
            </div>

            <div class="session-info">
                <h3>${escapeHtml(session.module)}</h3>
                <p>🕙 ${escapeHtml(session.time)}</p>
                <p>🐙 Octo Buddy: ${escapeHtml(session.buddy || "Assigned Buddy")}</p>
                <p>Room: <strong>${escapeHtml(session.room_code)}</strong></p>
            </div>

            <div class="session-status">
                ${escapeHtml(session.status)}
            </div>

            <button
                class="join-btn"
                onclick="joinTutorRoom('${escapeJs(session.room_code)}')">
                Join Session
            </button>
        `;

        container.insertBefore(card, container.firstChild);
    });
}


/**
 * Join a Jitsi room assigned by the backend.
 */
function joinTutorRoom(roomName) {
    if (!roomName) {
        alert("This session does not have a video room yet.");
        return;
    }

    launchJitsiCall(roomName);
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
                await fetch(`${API_BASE_URL}/bookings`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        user_id: Number(userId),
                        module,
                        date,
                        time
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
                "Tutoring session booked successfully!\n\n" +
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

        if (!subject || Number.isNaN(score)) {
            alert("Please enter a subject and score.");
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
