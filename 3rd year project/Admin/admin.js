document.addEventListener("DOMContentLoaded", function () {

    /* =====================================================
       SECTION NAVIGATION
    ===================================================== */

    const navItems = document.querySelectorAll(".nav-item");
    const sections = document.querySelectorAll(".content-section");
    const pageTitle = document.getElementById("pageTitle");


    function showSection(sectionId) {

        sections.forEach(section => {
            section.classList.remove("active-section");
        });

        const selectedSection = document.getElementById(sectionId);

        if (selectedSection) {
            selectedSection.classList.add("active-section");
        }


        navItems.forEach(item => {

            item.classList.remove("active");

            if (item.dataset.section === sectionId) {
                item.classList.add("active");
            }

        });


        const activeNav = document.querySelector(
            `.nav-item[data-section="${sectionId}"]`
        );

        if (activeNav) {

            const text = activeNav.innerText
                .replace(/\d+/g, "")
                .trim();

            pageTitle.textContent = text;

        }

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }


    navItems.forEach(item => {

        item.addEventListener("click", function () {

            showSection(this.dataset.section);

        });

    });


    /* =====================================================
       BUTTONS THAT OPEN SECTIONS
    ===================================================== */

    const sectionLinks = document.querySelectorAll(
        "[data-section-link]"
    );

    sectionLinks.forEach(button => {

        button.addEventListener("click", function () {

            const section = this.dataset.sectionLink;

            showSection(section);

        });

    });


    /* =====================================================
       APPLICATION APPROVAL
    ===================================================== */

    const applicationsTable =
        document.getElementById("applicationsTable");

    const pendingCount =
        document.getElementById("pendingCount");


    function updatePendingCount() {

        const pendingApplications =
            applicationsTable.querySelectorAll(
                ".status.pending"
            ).length;

        pendingCount.textContent =
            pendingApplications;

    }


    document.addEventListener("click", function (event) {


        /* APPROVE */

        if (event.target.classList.contains("approve-btn")) {

            const row =
                event.target.closest("tr");

            if (!row) return;


            const status =
                row.querySelector(".status");

            status.textContent = "Approved";

            status.className =
                "status active";


            const actionButtons =
                row.querySelector(".action-buttons");

            actionButtons.innerHTML =
                `<span class="status active">Approved</span>`;


            updatePendingCount();


            alert(
                "Application approved. The student is now an Octo Buddy."
            );

        }


        /* REJECT */

        if (event.target.classList.contains("reject-btn")) {

            const row =
                event.target.closest("tr");

            if (!row) return;


            const status =
                row.querySelector(".status");

            status.textContent = "Rejected";

            status.className =
                "status rejected";


            const actionButtons =
                row.querySelector(".action-buttons");

            actionButtons.innerHTML =
                `<span class="status rejected">Rejected</span>`;


            updatePendingCount();


            alert(
                "Application rejected."
            );

        }

    });


    /* =====================================================
       STUDENT SEARCH
    ===================================================== */

    const studentSearch =
        document.getElementById("studentSearch");

    if (studentSearch) {

        studentSearch.addEventListener(
            "input",
            function () {

                const searchValue =
                    this.value.toLowerCase();

                const rows =
                    document.querySelectorAll(
                        "#studentsTable tr"
                    );


                rows.forEach(row => {

                    const text =
                        row.innerText.toLowerCase();

                    row.style.display =
                        text.includes(searchValue)
                            ? ""
                            : "none";

                });

            }
        );

    }


    /* =====================================================
       FILTER BUTTONS
    ===================================================== */

    const filterButtons =
        document.querySelectorAll(".filter-btn");

    filterButtons.forEach(button => {

        button.addEventListener("click", function () {

            filterButtons.forEach(btn => {
                btn.classList.remove("active");
            });

            this.classList.add("active");

        });

    });


    /* =====================================================
       CALENDAR
    ===================================================== */

    const timeSlots =
        document.querySelectorAll(".time-slot.available");


    timeSlots.forEach(slot => {

        slot.addEventListener("click", function () {

            openModal();

        });

    });


    /* =====================================================
       SESSION MODAL
    ===================================================== */

    const sessionModal =
        document.getElementById("sessionModal");

    const newSessionBtn =
        document.getElementById("newSessionBtn");

    const closeModal =
        document.getElementById("closeModal");

    const saveSession =
        document.getElementById("saveSession");


    function openModal() {

        sessionModal.classList.add("show");

    }


    function closeSessionModal() {

        sessionModal.classList.remove("show");

    }


    if (newSessionBtn) {

        newSessionBtn.addEventListener(
            "click",
            openModal
        );

    }


    if (closeModal) {

        closeModal.addEventListener(
            "click",
            closeSessionModal
        );

    }


    sessionModal.addEventListener(
        "click",
        function (event) {

            if (event.target === sessionModal) {

                closeSessionModal();

            }

        }
    );


    if (saveSession) {

        saveSession.addEventListener(
            "click",
            function () {

                closeSessionModal();

                alert(
                    "Tutoring session scheduled successfully."
                );

            }
        );

    }


    /* =====================================================
       CALENDAR WEEK BUTTONS
    ===================================================== */

    const previousWeek =
        document.getElementById("previousWeek");

    const nextWeek =
        document.getElementById("nextWeek");

    const calendarTitle =
        document.getElementById("calendarTitle");


    let currentWeek =
        0;


    if (previousWeek) {

        previousWeek.addEventListener(
            "click",
            function () {

                currentWeek--;

                calendarTitle.textContent =
                    "Previous Week";

            }
        );

    }


    if (nextWeek) {

        nextWeek.addEventListener(
            "click",
            function () {

                currentWeek++;

                calendarTitle.textContent =
                    "Next Week";

            }
        );

    }


    /* =====================================================
       QUALIFICATION BUTTON
    ===================================================== */

    const addQualification =
        document.getElementById(
            "addQualification"
        );


    if (addQualification) {

        addQualification.addEventListener(
            "click",
            function () {

                const qualification =
                    prompt(
                        "Enter the new qualification name:"
                    );


                if (qualification) {

                    alert(
                        qualification +
                        " has been added to the qualification list."
                    );

                }

            }
        );

    }


    /* =====================================================
       MODULE BUTTON
    ===================================================== */

    const addModule =
        document.getElementById("addModule");


    if (addModule) {

        addModule.addEventListener(
            "click",
            function () {

                const module =
                    prompt(
                        "Enter the new module name:"
                    );


                if (module) {

                    alert(
                        module +
                        " has been added to the selected qualification."
                    );

                }

            }
        );

    }


    /* =====================================================
       QUALIFICATION SELECTOR
    ===================================================== */

    const qualificationButtons =
        document.querySelectorAll(
            ".qualification-select"
        );


    qualificationButtons.forEach(button => {

        button.addEventListener(
            "click",
            function () {

                qualificationButtons.forEach(
                    btn => btn.classList.remove("active")
                );

                this.classList.add("active");

            }
        );

    });


    /* =====================================================
       EXPORT REPORT
    ===================================================== */

    const exportReport =
        document.getElementById(
            "exportReport"
        );


    if (exportReport) {

        exportReport.addEventListener(
            "click",
            function () {

                alert(
                    "Report export will be connected to the Flask backend later."
                );

            }
        );

    }


    /* =====================================================
       SAVE SETTINGS
    ===================================================== */

    const saveSettings =
        document.getElementById(
            "saveSettings"
        );


    if (saveSettings) {

        saveSettings.addEventListener(
            "click",
            function () {

                alert(
                    "Settings saved successfully."
                );

            }
        );

    }


    /* =====================================================
       LOGOUT
    ===================================================== */

    const logoutBtn =
        document.getElementById("logoutBtn");


    if (logoutBtn) {

        logoutBtn.addEventListener(
            "click",
            function () {

                const confirmLogout =
                    confirm(
                        "Are you sure you want to logout?"
                    );


                if (confirmLogout) {

                    /*
                       Later this will redirect to
                       the real login page.
                    */

                    window.location.href =
                        "../Homepage/homepage.html";

                }

            }
        );

    }


    /* =====================================================
       MOBILE MENU
    ===================================================== */

    const mobileMenu =
        document.getElementById("mobileMenu");

    const sidebar =
        document.querySelector(".sidebar");


    if (mobileMenu) {

        mobileMenu.addEventListener(
            "click",
            function () {

                sidebar.classList.toggle("open");

            }
        );

    }


    /* =====================================================
       CLOSE MOBILE SIDEBAR AFTER NAVIGATION
    ===================================================== */

    navItems.forEach(item => {

        item.addEventListener(
            "click",
            function () {

                sidebar.classList.remove("open");

            }
        );

    });

});
