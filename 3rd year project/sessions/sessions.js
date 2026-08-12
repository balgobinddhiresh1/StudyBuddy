/* ===========================
   OCTO BUDDY SESSIONS JS
=========================== */


/* ===========================
   JOIN SESSION
=========================== */

function joinSession(roomName) {

    if (!roomName) {
        alert("This session does not have a video room yet.");
        return;
    }

    const jitsiURL = "https://meet.jit.si/" + roomName;

    window.open(
        jitsiURL,
        "_blank"
    );
}


/* ===========================
   CALENDAR
=========================== */

let currentMonth = 7;
let currentYear = 2026;


/* ===========================
   PREVIOUS MONTH
=========================== */

function previousMonth() {

    currentMonth--;

    if (currentMonth < 0) {

        currentMonth = 11;
        currentYear--;

    }

    updateCalendarHeader();
}


/* ===========================
   NEXT MONTH
=========================== */

function nextMonth() {

    currentMonth++;

    if (currentMonth > 11) {

        currentMonth = 0;
        currentYear++;

    }

    updateCalendarHeader();
}


/* ===========================
   UPDATE CALENDAR HEADER
=========================== */

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

    const monthTitle = document.querySelector(
        ".calendar-card .card-header h2"
    );

    if (monthTitle) {

        monthTitle.textContent =
            monthNames[currentMonth] +
            " " +
            currentYear;

    }

}


/* ===========================
   SESSION DETAILS
=========================== */

function viewSessionDetails(
    module,
    date,
    time,
    student,
    buddy
) {

    alert(
        "Session Details\n\n" +

        "Module: " + module + "\n" +
        "Date: " + date + "\n" +
        "Time: " + time + "\n" +
        "Student: " + student + "\n" +
        "Octo Buddy: " + buddy
    );

}


/* ===========================
   PAGE LOAD
=========================== */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        updateCalendarHeader();

    }
);