/* =========================================================
   OCTO BUDDY APPLICATION
   This file sends the application to the Flask backend so an
   admin can review it from the Admin dashboard.
========================================================= */

const API_BASE_URL = "http://127.0.0.1:5000/api";

document.addEventListener("DOMContentLoaded", () => {
    setupApplicationForm();
    loadExistingApplication();
});


/* =========================================================
   FORM SUBMISSION
========================================================= */

function setupApplicationForm() {
    const applicationForm =
        document.getElementById("buddyApplicationForm");

    if (!applicationForm) return;

    applicationForm.addEventListener("submit", async event => {
        event.preventDefault();

        const userId = localStorage.getItem("user_id");

        if (!userId) {
            alert("Please log in before applying to become an Octo Buddy.");
            window.location.href = "../signin_login/project.html";
            return;
        }

        const fullName =
            document.getElementById("fullName").value.trim();

        const studentNumber =
            document.getElementById("studentNumber").value.trim();

        const qualification =
            document.getElementById("qualification").value.trim();

        const academicYear =
            document.getElementById("academicYear").value.trim();

        const motivation =
            document.getElementById("motivation").value.trim();

        const selectedModules =
            [...document.querySelectorAll(
                'input[name="modules"]:checked'
            )].map(input => input.value);

        const availability =
            [...document.querySelectorAll(
                'input[name="availability"]:checked'
            )].map(input => input.value);

        const dailyLimitElement =
            document.querySelector(
                'input[name="dailyLimit"]:checked'
            );

        const dailyLimit =
            dailyLimitElement
                ? Number(dailyLimitElement.value)
                : 3;

        if (!fullName) {
            alert("Please enter your full name.");
            return;
        }

        if (!studentNumber) {
            alert("Please enter your student number.");
            return;
        }

        if (selectedModules.length === 0) {
            alert("Please select at least one module you can tutor.");
            return;
        }

        if (availability.length === 0) {
            alert("Please select at least one day you are available.");
            return;
        }

        if (!motivation) {
            alert("Please explain why you would like to become an Octo Buddy.");
            return;
        }

        const submitButton =
            applicationForm.querySelector(".submit-btn");

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Submitting...";
        }

        try {
            const response =
                await fetch(`${API_BASE_URL}/buddy-applications`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        user_id: Number(userId),
                        full_name: fullName,
                        student_number: studentNumber,
                        qualification,
                        academic_year: academicYear,
                        modules: selectedModules,
                        availability,
                        daily_limit: dailyLimit,
                        motivation
                    })
                });

            const data = await response.json();

            if (!response.ok) {
                alert(data.message || "Could not submit application.");
                return;
            }

            // Store only the application ID/status locally as a convenience.
            localStorage.setItem(
                "octoBuddyApplication",
                JSON.stringify(data.application)
            );

            showSuccessMessage();

            // Disable the form after a successful submission.
            applicationForm
                .querySelectorAll("input, textarea, button")
                .forEach(element => {
                    element.disabled = true;
                });

            const statusBadge =
                document.querySelector(".status-badge");

            if (statusBadge) {
                statusBadge.textContent = "PENDING";
            }

            if (submitButton) {
                submitButton.textContent = "Application Submitted ✓";
            }

        } catch (error) {
            console.error("Application error:", error);

            alert(
                "Could not connect to the backend server. " +
                "Make sure app.py is running."
            );

            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = "Submit Application →";
            }
        }
    });
}


/* =========================================================
   SUCCESS MESSAGE
========================================================= */

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


/* =========================================================
   EXISTING APPLICATION
========================================================= */

async function loadExistingApplication() {
    const userId = localStorage.getItem("user_id");

    if (!userId) return;

    try {
        const response =
            await fetch(`${API_BASE_URL}/buddy-applications`);

        if (!response.ok) return;

        const data = await response.json();

        const application =
            (data.applications || []).find(
                item => Number(item.user_id) === Number(userId)
            );

        if (!application) return;

        localStorage.setItem(
            "octoBuddyApplication",
            JSON.stringify(application)
        );

        const statusBadge =
            document.querySelector(".status-badge");

        if (statusBadge) {
            statusBadge.textContent =
                application.status.toUpperCase();
        }

        // Pending or approved applications should not be resubmitted.
        if (
            application.status === "Pending" ||
            application.status === "Approved"
        ) {
            const form =
                document.getElementById("buddyApplicationForm");

            if (form) {
                form.querySelectorAll(
                    "input, textarea, button"
                ).forEach(element => {
                    element.disabled = true;
                });
            }

            const submitButton =
                form?.querySelector(".submit-btn");

            if (submitButton) {
                submitButton.textContent =
                    application.status === "Approved"
                        ? "Application Approved ✓"
                        : "Application Submitted ✓";
            }

            if (application.status === "Pending") {
                showSuccessMessage();
            }
        }

    } catch (error) {
        console.warn("Could not load existing application:", error);
    }
}
