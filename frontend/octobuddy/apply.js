
const API_URL = "https://studybuddy-bl8d.onrender.com/api";

document.addEventListener("DOMContentLoaded", function () {
    // This page is private: redirect to Login before exposing the application.
    const signedInUserId = localStorage.getItem("user_id");
    const signedInToken = localStorage.getItem("auth_token");
    if (!signedInUserId || !signedInToken) {
        const target = "../octobuddy/apply.html";
        window.location.replace(`../signin_login/login.html?next=${encodeURIComponent(target)}`);
        return;
    }

    // Enforce input rules while the student types.
    const studentNumberInput = document.getElementById("studentNumber");
    const motivationInput = document.getElementById("motivation");
    const motivationWordCount = document.getElementById("motivationWordCount");

    if (studentNumberInput) {
        studentNumberInput.addEventListener("input", function () {
            this.value = this.value.replace(/\D/g, "").slice(0, 9);
            this.setCustomValidity(this.value.length === 9 ? "" : "Enter exactly 9 digits.");
        });
    }

    function wordCount(value) {
        const trimmed = value.trim();
        return trimmed ? trimmed.split(/\s+/).length : 0;
    }
    if (motivationInput) {
        motivationInput.addEventListener("input", function () {
            const words = this.value.trim().split(/\s+/).filter(Boolean);
            if (words.length > 30) this.value = words.slice(0, 30).join(" ");
            const count = wordCount(this.value);
            if (motivationWordCount) motivationWordCount.textContent = `${count} / 30 words`;
            this.setCustomValidity(count > 30 ? "Motivation must be 30 words or fewer." : "");
        });
    }

    // Populate read-only academic details from the signed-in profile.
    try {
        const user = JSON.parse(localStorage.getItem("user") || "{}");
        const qualification = document.getElementById("qualification");
        const academicYear = document.getElementById("academicYear");
        const fullName = document.getElementById("fullName");
        if (qualification && user.course) qualification.value = user.course;
        if (academicYear && user.academic_year) academicYear.value = `Year ${user.academic_year}`;
        if (fullName && (user.first_name || user.last_name)) {
            fullName.value = `${user.first_name || ""} ${user.last_name || ""}`.trim();
            fullName.readOnly = true;
        }
        const year = Number(user.academic_year || 1);
        document.querySelectorAll('input[name="modules"][data-year]').forEach(input => {
            const available = Number(input.dataset.year) <= year;
            input.disabled = !available;
            if (!available) input.checked = false;
            const label = input.closest('.module-option');
            if (label) label.hidden = !available;
        });
    } catch (error) { console.warn("Could not load profile details", error); }

    const form = document.getElementById("buddyApplicationForm");
    const submitButton = form.querySelector('button[type="submit"]');
    const statusBadge = document.querySelector(".status-badge");

    // Display messages using SweetAlert2 if available.
    function showMessage(options) {
        if (window.Swal) {
            return Swal.fire({
                confirmButtonColor: "#159A78",
                ...options
            });
        }

        alert(
            (options.title ? options.title + "\n\n" : "") +
            (options.text || "")
        );

        return Promise.resolve({ isConfirmed: true });
    }

    // Submit the Octo Buddy application.
    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        // The student must be logged in.
        const userId = localStorage.getItem("user_id");

        if (!userId) {
            showMessage({
                icon: "warning",
                title: "Login required",
                text: "Please log in to your Octo Buddy account before submitting an application."
            });
            return;
        }

        // Collect the selected modules and available days.
        const modules = Array.from(
            document.querySelectorAll('input[name="modules"]:checked')
        ).map(input => input.value);

        const availability = Array.from(
            document.querySelectorAll('input[name="availability"]:checked')
        ).map(input => input.value);

        const dailyLimit = document.querySelector(
            'input[name="dailyLimit"]:checked'
        );

        // Validate the application.
        if (modules.length === 0) {
            showMessage({
                icon: "warning",
                title: "Select your modules",
                text: "Please select at least one module you can tutor."
            });
            return;
        }

        if (availability.length === 0) {
            showMessage({
                icon: "warning",
                title: "Select your availability",
                text: "Please select at least one day you are available."
            });
            return;
        }

        if (!dailyLimit) {
            showMessage({
                icon: "warning",
                title: "Daily limit required",
                text: "Please choose your daily tutoring limit."
            });
            return;
        }

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        // Prepare the information expected by the Flask backend.
        const applicationData = {
            user_id: userId,
            full_name: document.getElementById("fullName").value.trim(),
            student_number: document.getElementById("studentNumber").value.trim(),
            qualification: document.getElementById("qualification").value.trim(),
            academic_year: document.getElementById("academicYear").value.trim(),
            modules: modules,
            availability: availability,
            daily_limit: Number(dailyLimit.value),
            motivation: document.getElementById("motivation").value.trim()
        };

        const motivationWords = applicationData.motivation.split(/\s+/).filter(Boolean);
        if (!/^[0-9]{9}$/.test(applicationData.student_number)) {
            showMessage({ icon: "warning", title: "Check student number", text: "Student number must contain exactly 9 digits and numbers only." });
            studentNumberInput?.focus();
            return;
        }
        if (motivationWords.length > 30) {
            showMessage({ icon: "warning", title: "Motivation too long", text: "Your motivation must be no more than 30 words." });
            motivationInput?.focus();
            return;
        }

        if (
            !applicationData.full_name ||
            !applicationData.student_number ||
            !applicationData.motivation
        ) {
            showMessage({
                icon: "warning",
                title: "Missing information",
                text: "Please complete all required fields."
            });
            return;
        }

        // Prevent duplicate clicks while submitting.
        submitButton.disabled = true;
        submitButton.textContent = "Submitting...";
        submitButton.style.opacity = "0.7";

        try {
            const response = await fetch(
                `${API_URL}/buddy-applications`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(applicationData)
                }
            );

            const data = await response.json();

            if (!response.ok || data.status !== "success") {
                throw new Error(
                    data.message || "Your application could not be submitted."
                );
            }

            // The backend creates the application with Pending status.
            if (statusBadge) {
                statusBadge.textContent = "PENDING";
            }

            await showMessage({
                icon: "success",
                title: "Application submitted!",
                text: "Your Octo Buddy application has been sent for admin approval. You will be notified once it has been reviewed.",
                confirmButtonText: "Okay",
                allowOutsideClick: false
            });

            // Prevent accidentally submitting the same application again.
            form.reset();

            // Keep the application marked as pending on the page.
            if (statusBadge) {
                statusBadge.textContent = "PENDING";
            }

        } catch (error) {
            console.error("Buddy application error:", error);

            showMessage({
                icon: "error",
                title: "Submission unsuccessful",
                text: error.message ||
                    "We could not submit your application. Please try again.",
                confirmButtonText: "Okay"
            });

        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = "Submit Application →";
            submitButton.style.opacity = "1";
        }
    });

    // Profile dropdown.
    const profileBtn = document.getElementById("profileBtn");
    const profileDropdown = document.getElementById("profileDropdown");

    if (profileBtn && profileDropdown) {
        profileBtn.addEventListener("click", function (event) {
            event.stopPropagation();

            const isVisible =
                profileDropdown.style.display === "block";

            profileDropdown.style.display =
                isVisible ? "none" : "block";
        });

        document.addEventListener("click", function (event) {
            if (
                !profileDropdown.contains(event.target) &&
                !profileBtn.contains(event.target)
            ) {
                profileDropdown.style.display = "none";
            }
        });
    }
});
