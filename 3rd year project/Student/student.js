/* =========================================================
   OCTO BUDDY - STUDENT DASHBOARD JAVASCRIPT
========================================================= */


/* =========================================================
   PROFILE DROPDOWN
========================================================= */

function toggleProfileMenu() {

    const menu = document.getElementById("profileMenu");

    if (menu) {
        menu.classList.toggle("show");
    }

}


/* Close profile menu when clicking somewhere else */

document.addEventListener("click", function (event) {

    const profile = document.querySelector(".profile");
    const menu = document.getElementById("profileMenu");

    if (!profile || !menu) {
        return;
    }

    if (!profile.contains(event.target)) {
        menu.classList.remove("show");
    }

});


/* =========================================================
   BOOKING FORM
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


/* =========================================================
   JOIN SESSION
========================================================= */

function joinSession(module) {

    /*
        FRONTEND DEMO

        Later this button will open the unique
        Jitsi room generated by the Flask backend.

        Example backend room:

        studybuddy_session_101

        The final version will use:

        https://meet.jit.si/ROOM_NAME
    */


    const confirmed = confirm(
        "You are about to join your " +
        module +
        " tutoring session.\n\n" +
        "Continue to the online classroom?"
    );


    if (!confirmed) {
        return;
    }


    /*
        Temporary frontend behaviour.

        Replace this with the Jitsi integration
        once the Flask backend is connected.
    */

    window.open(
        "https://meet.jit.si/OctoBuddyDemoSession",
        "_blank"
    );

}


/* =========================================================
   STUDENT NAME
========================================================= */

document.addEventListener("DOMContentLoaded", function () {

    /*
        Temporary frontend student.

        Later Flask/MySQL will provide the
        logged-in student's actual name.
    */

    const studentName =
        document.getElementById("studentName");


    if (studentName) {

        const savedName =
            localStorage.getItem("octoBuddyStudentName");


        if (savedName) {

            studentName.textContent = savedName;

        }

    }

});


/* =========================================================
   DEMO LOGIN NAME HELPER
========================================================= */

/*
    This allows us to test the frontend.

    Example in browser console:

    localStorage.setItem(
        "octoBuddyStudentName",
        "Kyle"
    );

    Then refresh the page.
*/
