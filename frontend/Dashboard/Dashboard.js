/* =========================================================
   OCTO BUDDY - TUTOR DASHBOARD
   Connects the existing Buddy dashboard to the Flask backend.
========================================================= */

const API_BASE_URL = "http://127.0.0.1:5000/api";
let jitsiApi = null;


document.addEventListener("DOMContentLoaded", () => {
    displayCurrentDate();
    loadBuddyProfile();
    loadBuddySessions();
    loadBuddyStudents();
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
            await fetch(`${API_BASE_URL}/user/${userId}`);

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


/* =========================================================
   PROFILE EDIT
========================================================= */

function openEditModal() {
    const modal =
        document.getElementById("editModal");

    if (!modal) return;

    document.getElementById("editFirstName").value =
        localStorage.getItem("first_name") || "";

    document.getElementById("editLastName").value =
        localStorage.getItem("last_name") || "";

    modal.style.display = "flex";
}


function closeEditModal() {
    const modal =
        document.getElementById("editModal");

    if (modal) {
        modal.style.display = "none";
    }
}


async function saveProfileChanges() {
    const userId =
        localStorage.getItem("user_id");

    const firstName =
        document.getElementById("editFirstName").value.trim();

    const lastName =
        document.getElementById("editLastName").value.trim();

    if (!userId || !firstName) {
        alert("A valid user and first name are required.");
        return;
    }

    try {
        const response =
            await fetch(`${API_BASE_URL}/user/${userId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    first_name: firstName,
                    last_name: lastName
                })
            });

        const data = await response.json();

        if (!response.ok) {
            alert(data.message || "Could not update profile.");
            return;
        }

        localStorage.setItem("first_name", firstName);
        localStorage.setItem("last_name", lastName);

        closeEditModal();
        updateDOMProfile(data.user);

    } catch (error) {
        console.error("Profile update error:", error);
        alert("Could not connect to the backend server.");
    }
}


/* =========================================================
   BUDDY SESSIONS
========================================================= */

async function loadBuddySessions() {
    const userId =
        localStorage.getItem("user_id");

    if (!userId) return;

    try {
        const response =
            await fetch(`${API_BASE_URL}/sessions/buddy/${userId}`);

        if (!response.ok) return;

        const data = await response.json();
        const sessions = data.sessions || [];

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

        const firstUpcoming =
            sessions.find(
                session => session.status === "Confirmed"
            );

        if (firstUpcoming) {
            setText(
                "assignedStudentName",
                firstUpcoming.student || "Student"
            );

            setText(
                "assignedRoomCode",
                firstUpcoming.room_code
            );

            localStorage.setItem(
                "active_buddy_room",
                firstUpcoming.room_code
            );
        }

    } catch (error) {
        console.warn("Could not load Buddy sessions:", error);
    }
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
            await fetch(`${API_BASE_URL}/sessions/buddy/${userId}`);

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
    const students =
        window.myBuddyStudents || [];

    if (students.length === 0) {
        alert(
            "My Students\n\n" +
            "You currently have no assigned students."
        );
        return;
    }

    alert(
        "My Students\n\n" +
        students.map(
            (student, index) =>
                `${index + 1}. ${student}`
        ).join("\n")
    );
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
    const room =
        localStorage.getItem("active_buddy_room");

    if (!room) {
        alert("You do not currently have an active session.");
        return;
    }

    launchJitsiCall(room);
}


function joinCustomRoomPrompt() {
    const room =
        prompt(
            "Enter the Room Code for this session:",
            localStorage.getItem("active_buddy_room") || ""
        );

    if (!room || !room.trim()) return;

    launchJitsiCall(
        room.trim().replace(/\s+/g, "_")
    );
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
        videoConferenceLeft: closeJitsiSession
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
    localStorage.removeItem("user_id");
    localStorage.removeItem("user");
    localStorage.removeItem("first_name");
    localStorage.removeItem("last_name");
    localStorage.removeItem("role");
    localStorage.removeItem("active_buddy_room");

    window.location.href = "../signin_login/project.html";
}
