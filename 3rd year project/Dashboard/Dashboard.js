/* =========================================
   OCTO BUDDY - TUTOR (OCTO BUDDY) DASHBOARD JS
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
   MOBILE HAMBURGER MENU
========================================= */

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

    // Prevent background scrolling while the mobile menu is open
    document.body.style.overflow =
        navLinks.classList.contains("mobile-open") ? "hidden" : "";
}

/* Close the mobile menu automatically if a nav link is clicked */

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

/* Close the mobile menu if the window is resized back to desktop width */

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


/* =========================================
   MY SCHEDULE
   (no backend route exists yet for a tutor's
   assigned sessions — this is a placeholder
   until the admin-side scheduling is wired up)
========================================= */

function openMySchedule() {

    window.location.href = "../sessions/sessions.html";

}


/* =========================================
   MY STUDENTS
   (placeholder until a backend route exists
   returning the students assigned to this buddy)
========================================= */

function viewMyStudents() {

    alert(
        "My Students\n\n" +
        "This will list the students currently " +
        "assigned to you once the scheduling " +
        "system is connected to the backend."
    );

}