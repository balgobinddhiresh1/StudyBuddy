/* =========================================================
   OCTO BUDDY - STUDENT DASHBOARD JAVASCRIPT
========================================================= */

const API_BASE_URL = "http://127.0.0.1:5000/api";
let jitsiApi = null;


/* =========================================================
   MOBILE HAMBURGER MENU
========================================================= */

function toggleMobileMenu() {

    const navLinks = document.getElementById("navLinks");
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const overlay = document.getElementById("mobileNavOverlay");

    if (!navLinks || !hamburgerBtn) {
        return;
    }

    navLinks.classList.toggle("mobile-open");
    hamburgerBtn.classList.toggle("open");

    if (overlay) {
        overlay.classList.toggle("show");
    }

    document.body.style.overflow =
        navLinks.classList.contains("mobile-open") ? "hidden" : "";
}

document.addEventListener("DOMContentLoaded", function () {

    const navLinks = document.getElementById("navLinks");

    if (!navLinks) {
        return;
    }

    const links = navLinks.querySelectorAll("a");

    links.forEach(function (link) {

        link.addEventListener("click", function () {

            if (navLinks.classList.contains("mobile-open")) {
                toggleMobileMenu();
            }

        });

    });

});

window.addEventListener("resize", function () {

    const navLinks = document.getElementById("navLinks");
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const overlay = document.getElementById("mobileNavOverlay");

    if (!navLinks || !hamburgerBtn) {
        return;
    }

    if (window.innerWidth > 850 && navLinks.classList.contains("mobile-open")) {
        navLinks.classList.remove("mobile-open");
        hamburgerBtn.classList.remove("open");

        if (overlay) {
            overlay.classList.remove("show");
        }

        document.body.style.overflow = "";
    }

});


/* =========================================================
   LOGGED-IN USER / REAL PROFILE DATA
   (ported from dashboard.html so this page also reflects
   the actual logged-in student instead of a hardcoded name)
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    loadLoggedInUser();
});

async function loadLoggedInUser() {
    const userId = localStorage.getItem('user_id') || sessionStorage.getItem('user_id');

    if (userId) {
        try {
            const response = await fetch(`${API_BASE_URL}/user/${userId}`);
            if (response.ok) {
                const data = await response.json();
                localStorage.setItem('first_name', data.first_name);
                localStorage.setItem('last_name', data.last_name);
                localStorage.setItem('role', data.role);

                updateDOMProfile(data);
                return;
            }
        } catch (err) {
            console.warn("Backend unavailable, loading cached profile from storage:", err);
        }
    }

    // Fallback storage sync (used if the backend can't be reached)
    let user = JSON.parse(sessionStorage.getItem('user')) || JSON.parse(localStorage.getItem('user')) || {};
    const fallbackData = {
        first_name: user.first_name || localStorage.getItem('first_name') || sessionStorage.getItem('first_name') || 'Student',
        last_name: user.last_name || localStorage.getItem('last_name') || sessionStorage.getItem('last_name') || '',
        role: user.role || localStorage.getItem('role') || sessionStorage.getItem('role') || 'student',
        email: user.email || '',
        course: user.course || 'General',
        academic_year: user.academic_year || '',
        points: user.points || 0
    };

    updateDOMProfile(fallbackData);
}

function updateDOMProfile(data) {
    const firstName = data.first_name || 'Student';
    const lastName = data.last_name || '';
    const role = data.role || 'student';

    const navUserName = document.getElementById('navUserName');
    const navUserInitials = document.getElementById('navUserInitials');
    const welcomeFirstName = document.getElementById('welcomeFirstName');
    const navroleDisplay = document.getElementById('navroleDisplay');

    if (welcomeFirstName) welcomeFirstName.textContent = firstName;
    if (navUserName) navUserName.textContent = `${firstName} ${lastName}`.trim();
    if (navroleDisplay) navroleDisplay.textContent = `@${role.replace(/^@/, '')}`;

    const firstInitial = firstName ? firstName.charAt(0).toUpperCase() : 'S';
    const lastInitial = lastName ? lastName.charAt(0).toUpperCase() : '';
    if (navUserInitials) navUserInitials.textContent = `${firstInitial}${lastInitial}`;

    // Profile section fields
    const profileFullName = document.getElementById('profileFullName');
    const profileEmail = document.getElementById('profileEmail');
    const profileCourse = document.getElementById('profileCourse');
    const profileYear = document.getElementById('profileYear');
    const profileRole = document.getElementById('profileRole');
    const profilePoints = document.getElementById('profilePoints');

    if (profileFullName) profileFullName.textContent = `${firstName} ${lastName}`.trim();
    if (profileEmail) profileEmail.textContent = data.email || '—';
    if (profileCourse) profileCourse.textContent = data.course || '—';
    if (profileYear) profileYear.textContent = data.academic_year ? `Year ${data.academic_year}` : '—';
    if (profileRole) profileRole.textContent = role.charAt(0).toUpperCase() + role.slice(1);
    if (profilePoints) profilePoints.textContent = data.points ?? 0;
}


/* =========================================================
   UPDATE PROFILE MODAL
   (same pattern as dashboard.html's modal, only first/last
   name are editable here — role changes are not exposed on
   the student side)
========================================================= */

function openEditModal() {
    const modal = document.getElementById('editModal');
    const firstName = localStorage.getItem('first_name') || 'Student';
    const lastName = localStorage.getItem('last_name') || '';

    document.getElementById('editFirstName').value = firstName;
    document.getElementById('editLastName').value = lastName;

    modal.style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
}

async function saveProfileChanges() {
    const firstName = document.getElementById('editFirstName').value.trim();
    const lastName = document.getElementById('editLastName').value.trim();
    const userId = localStorage.getItem('user_id') || sessionStorage.getItem('user_id');

    if (!firstName) {
        alert("First name is required");
        return;
    }

    if (userId) {
        try {
            const res = await fetch(`${API_BASE_URL}/user/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    first_name: firstName,
                    last_name: lastName
                })
            });

            if (!res.ok) {
                const err = await res.json();
                alert(`Update failed: ${err.message}`);
                return;
            }
        } catch (err) {
            console.error("Failed to update profile on backend:", err);
        }
    }

    localStorage.setItem('first_name', firstName);
    localStorage.setItem('last_name', lastName);

    loadLoggedInUser();
    closeEditModal();
}


/* =========================================================
   JITSI - JOIN TUTORING SESSION
   (the student needs to join the SAME room as their Octo
   Buddy, so this mirrors the join logic in dashboard.html)
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    loadUpcomingSessionRoom();
});

function loadUpcomingSessionRoom() {
    const activeRoom = localStorage.getItem('active_buddy_room') || 'OctoBuddy_Daniel_Prog101';
    const roomDisplay = document.getElementById('assignedRoomCode');
    if (roomDisplay) roomDisplay.textContent = activeRoom;
}

function joinTutorRoom() {
    const roomName = localStorage.getItem('active_buddy_room') || 'OctoBuddy_Daniel_Prog101';
    launchJitsiCall(roomName);
}

function launchJitsiCall(roomName) {
    const firstName = localStorage.getItem('first_name') || sessionStorage.getItem('first_name') || 'Student';
    const lastName = localStorage.getItem('last_name') || sessionStorage.getItem('last_name') || '';
    const displayName = `${firstName} ${lastName}`.trim();

    const modal = document.getElementById('jitsiModal');
    const container = document.getElementById('jitsiContainer');
    const title = document.getElementById('jitsiModalTitle');

    if (!modal || !container) {
        // Fallback if the modal markup isn't present for some reason
        window.open(`https://meet.jit.si/${encodeURIComponent(roomName)}`, '_blank');
        return;
    }

    if (title) title.textContent = `Octo Buddy Room: ${roomName}`;
    modal.style.display = 'flex';
    container.innerHTML = '';

    if (typeof JitsiMeetExternalAPI !== 'undefined') {
        const domain = 'meet.jit.si';
        const options = {
            roomName: roomName,
            width: '100%',
            height: '100%',
            parentNode: container,
            userInfo: {
                displayName: displayName
            },
            configOverwrite: {
                startWithAudioMuted: false,
                startWithVideoMuted: false,
                prejoinPageEnabled: false
            }
        };

        jitsiApi = new JitsiMeetExternalAPI(domain, options);

        jitsiApi.addEventListeners({
            videoConferenceLeft: function () {
                closeJitsiSession();
            }
        });
    } else {
        window.open(`https://meet.jit.si/${encodeURIComponent(roomName)}`, '_blank');
        closeJitsiSession();
    }
}

function closeJitsiSession() {
    if (jitsiApi) {
        jitsiApi.dispose();
        jitsiApi = null;
    }
    const modal = document.getElementById('jitsiModal');
    if (modal) modal.style.display = 'none';
}


/* =========================================================
   BOOKING FORM
   (kept exactly as before — this is still a frontend demo
   only, since app.py has no booking/session route yet)
========================================================= */

const bookingForm = document.getElementById("bookingForm");

if (bookingForm) {

    bookingForm.addEventListener("submit", function (event) {

        event.preventDefault();

        const module =
            document.getElementById("module").value;

        const date =
            document.getElementById("date").value;

        const time =
            document.getElementById("time").value;


        if (!module || !date || !time) {

            alert("Please complete all booking fields.");

            return;
        }


        /*
            FRONTEND DEMO

            Later the Flask backend will:

            1. Check the student's qualification
            2. Check the student's academic year
            3. Find matching Octo Buddies
            4. Check availability
            5. Check the daily tutor limit
            6. Create the booking
        */


        alert(
            "Tutoring request submitted!\n\n" +
            "Module: " + module + "\n" +
            "Date: " + date + "\n" +
            "Time: " + time +
            "\n\nAn administrator will schedule your session."
        );


        bookingForm.reset();

    });

}


/* =========================================================
   ACADEMIC TRACKER
   (kept exactly as before — purely frontend logic, no
   backend route exists to store marks yet)
========================================================= */

const marksForm = document.getElementById("marksForm");

if (marksForm) {

    marksForm.addEventListener("submit", function (event) {

        event.preventDefault();


        const subject =
            document.getElementById("subject").value.trim();

        const score =
            Number(document.getElementById("score").value);

        const result =
            document.getElementById("academicResult");


        if (!subject || isNaN(score)) {

            alert("Please enter a subject and score.");

            return;
        }


        /* ===========================
           URGENT HELP
        =========================== */

        if (score < 40) {

            result.innerHTML = `

                <div class="result-icon">
                    🚨
                </div>

                <h3>
                    Urgent Academic Support
                </h3>

                <p>
                    Your score for
                    <strong>${subject}</strong>
                    is ${score}%.
                </p>

                <p>
                    We strongly recommend booking an
                    Octo Buddy for this subject.
                </p>

                <a href="#book" class="primary-btn">
                    Book Tutoring →
                </a>

            `;

        }


        /* ===========================
           NEEDS HELP
        =========================== */

        else if (score < 50) {

            result.innerHTML = `

                <div class="result-icon">
                    ⚠️
                </div>

                <h3>
                    Academic Support Recommended
                </h3>

                <p>
                    Your score for
                    <strong>${subject}</strong>
                    is ${score}%.
                </p>

                <p>
                    We recommend booking an Octo Buddy
                    to help you improve your understanding.
                </p>

                <a href="#book" class="primary-btn">
                    Find Support →
                </a>

            `;

        }


        /* ===========================
           GOOD PROGRESS
        =========================== */

        else {

            result.innerHTML = `

                <div class="result-icon">
                    🎉
                </div>

                <h3>
                    Good Progress!
                </h3>

                <p>
                    Your score for
                    <strong>${subject}</strong>
                    is ${score}%.
                </p>

                <p>
                    Keep working hard and continue
                    monitoring your academic progress.
                </p>

            `;

        }

    });

}