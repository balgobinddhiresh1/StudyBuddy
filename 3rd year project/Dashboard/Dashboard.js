/* =========================================
   OCTO BUDDY - STUDENT DASHBOARD JS
========================================= */


/* =========================================
   CURRENT DATE
========================================= */

function displayCurrentDate() {

    const dateElement = document.getElementById("currentDate");

    if (!dateElement) {
        return;
    }

    const today = new Date();

    const options = {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    };

    dateElement.textContent =
        today.toLocaleDateString("en-ZA", options);
}

displayCurrentDate();


/* =========================================
   BOOK TUTORING
========================================= */

function bookTutoring() {

    alert(
        "Tutoring Booking\n\n" +
        "The booking system will show Octo Buddies " +
        "who match your course, academic year, module " +
        "and availability."
    );

    // Later this will open the real booking page.
}


/* =========================================
   ACADEMIC TRACKER
========================================= */

function openAcademicTracker() {

    alert(
        "Academic Tracker\n\n" +
        "Here you will be able to enter your marks " +
        "and receive tutoring recommendations."
    );

}


/* =========================================
   BECOME OCTO BUDDY
========================================= */

function becomeOctoBuddy() {

    window.location.href =
        "../octobuddy/octobuddy.html";

}


/* =========================================
   PROFILE
========================================= */

function openProfile() {

    alert(
        "Student Profile\n\n" +
        "Your profile contains your name, " +
        "student number, campus, qualification " +
        "and academic year."
    );

}


/* =========================================
   VIEW SESSIONS
========================================= */

function viewSessions() {

    alert(
        "Upcoming Sessions\n\n" +
        "Your scheduled tutoring sessions will " +
        "appear here."
    );

}


/* =========================================
   JOIN JITSI SESSION
========================================= */

function joinSession() {

    const roomName =
        "octobuddy_programming_session_001";

    const jitsiURL =
        "https://meet.jit.si/" + roomName;

    const confirmJoin = confirm(
        "You are about to join your Programming " +
        "tutoring session through Jitsi Meet.\n\n" +
        "Continue?"
    );

    if (confirmJoin) {

        window.open(
            jitsiURL,
            "_blank"
        );

    }

}