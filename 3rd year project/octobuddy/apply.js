/* =========================================================
   OCTO BUDDY APPLICATION
   APPLY.JS
========================================================= */

document.addEventListener("DOMContentLoaded", function () {

    const applicationForm =
        document.getElementById("buddyApplicationForm");

    if (!applicationForm) {
        return;
    }


    /* =====================================================
       FORM SUBMISSION
    ===================================================== */

    applicationForm.addEventListener("submit", function (event) {

        event.preventDefault();


        /* ================================================
           GET FORM VALUES
        ================================================ */

        const fullName =
            document.getElementById("fullName").value.trim();

        const studentNumber =
            document.getElementById("studentNumber").value.trim();

        const qualification =
            document.getElementById("qualification").value;

        const academicYear =
            document.getElementById("academicYear").value;

        const motivation =
            document.getElementById("motivation").value.trim();


        /* =================================================
           GET SELECTED MODULES
        ================================================= */

        const selectedModules = [];

        document
            .querySelectorAll('input[name="modules"]:checked')
            .forEach(function (checkbox) {

                selectedModules.push(checkbox.value);

            });


        /* =================================================
           GET AVAILABILITY
        ================================================= */

        const availability = [];

        document
            .querySelectorAll('input[name="availability"]:checked')
            .forEach(function (checkbox) {

                availability.push(checkbox.value);

            });


        /* =================================================
           GET DAILY LIMIT
        ================================================= */

        const dailyLimitElement =
            document.querySelector(
                'input[name="dailyLimit"]:checked'
            );

        const dailyLimit =
            dailyLimitElement
                ? dailyLimitElement.value
                : "3";


        /* =================================================
           VALIDATION
        ================================================= */

        if (fullName === "") {

            alert("Please enter your full name.");

            return;
        }


        if (studentNumber === "") {

            alert("Please enter your student number.");

            return;
        }


        if (selectedModules.length === 0) {

            alert(
                "Please select at least one module you can tutor."
            );

            return;
        }


        if (availability.length === 0) {

            alert(
                "Please select at least one day you are available."
            );

            return;
        }


        if (motivation === "") {

            alert(
                "Please explain why you would like to become an Octo Buddy."
            );

            return;
        }


        /* =================================================
           APPLICATION OBJECT
           
           This is frontend-only for now.
           Flask + MySQL will eventually replace this
           localStorage section.
        ================================================= */

        const application = {

            id: "APP-" + Date.now(),

            fullName: fullName,

            studentNumber: studentNumber,

            qualification: qualification,

            academicYear: academicYear,

            modules: selectedModules,

            availability: availability,

            dailyLimit: Number(dailyLimit),

            motivation: motivation,

            status: "Pending",

            submittedAt: new Date().toISOString()

        };


        /* =================================================
           SAVE APPLICATION
        ================================================= */

        localStorage.setItem(
            "octoBuddyApplication",
            JSON.stringify(application)
        );


        /* =================================================
           SAVE USER ROLE
           
           The user remains a Student while waiting
           for admin approval.
        ================================================= */

        localStorage.setItem(
            "octoBuddyRole",
            "Student"
        );


        /* =================================================
           SHOW SUCCESS MESSAGE
        ================================================= */

        showSuccessMessage();


        /* =================================================
           DISABLE FORM AFTER SUBMISSION
        ================================================= */

        applicationForm
            .querySelectorAll("input, textarea, button")
            .forEach(function (element) {

                element.disabled = true;

            });


        /* =================================================
           CHANGE STATUS BADGE
        ================================================= */

        const statusBadge =
            document.querySelector(".status-badge");

        if (statusBadge) {

            statusBadge.textContent = "PENDING";

        }


        /* =================================================
           CHANGE SUBMIT BUTTON
        ================================================= */

        const submitButton =
            applicationForm.querySelector(".submit-btn");

        if (submitButton) {

            submitButton.textContent =
                "Application Submitted ✓";

        }

    });


    /* =====================================================
       SUCCESS MESSAGE FUNCTION
    ===================================================== */

    function showSuccessMessage() {

        const existingMessage =
            document.querySelector(".application-success");

        if (existingMessage) {

            existingMessage.classList.add("show");

            return;
        }


        const message =
            document.createElement("div");

        message.className =
            "application-success show";

        message.innerHTML = `
            <strong>Application submitted successfully!</strong><br>
            Your Octo Buddy application has been sent to the
            Campus Manager for review. Your account will remain
            a Student account until your application is approved.
        `;


        const cardHeading =
            document.querySelector(".card-heading");

        if (cardHeading) {

            cardHeading.insertAdjacentElement(
                "afterend",
                message
            );

        }

    }


    /* =====================================================
       CHECK FOR EXISTING APPLICATION
       
       If the student refreshes the page after submitting,
       their application remains stored in the browser.
    ===================================================== */

    const savedApplication =
        localStorage.getItem("octoBuddyApplication");

    if (savedApplication) {

        try {

            const application =
                JSON.parse(savedApplication);


            if (application.status === "Pending") {

                const statusBadge =
                    document.querySelector(".status-badge");

                if (statusBadge) {

                    statusBadge.textContent = "PENDING";

                }

            }

        } catch (error) {

            console.error(
                "Could not read saved Octo Buddy application:",
                error
            );

        }

    }

});