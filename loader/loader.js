/* =========================================
   OCTO BUDDY GLOBAL LOADER
========================================= */

(function () {

    /* -----------------------------------------
       CREATE LOADER
    ----------------------------------------- */

    const loader = document.createElement("div");

    loader.id = "octoBuddyLoader";

    loader.innerHTML = `
        <div class="octo-loader-content">

            <img
                src="../loader/loader.png"
                alt="Octo Buddy"
                class="octo-loader-image"
            >

            <div class="octo-loader-text">
                Loading Octo Buddy
            </div>

            <div class="octo-loader-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>

        </div>
    `;

    document.body.prepend(loader);


    /* -----------------------------------------
       HIDE INITIAL LOADER
       The homepage should not stay loading.
    ----------------------------------------- */

    window.addEventListener("load", function () {

        loader.classList.add("loader-hidden");

    });


    /* -----------------------------------------
       NAVIGATION LOADER
    ----------------------------------------- */

    document.addEventListener("click", function (event) {

        const link = event.target.closest("a");

        if (!link) return;

        const href = link.getAttribute("href");

        /* Ignore links that don't navigate */
        if (!href || href === "#") return;

        /* Ignore same-page sections */
        if (href.startsWith("#")) return;

        /* Ignore external websites */
        if (
            href.startsWith("http://") ||
            href.startsWith("https://") ||
            href.startsWith("//")
        ) {
            return;
        }

        /* Ignore new tabs */
        if (link.target === "_blank") return;

        /* Ignore downloads */
        if (link.hasAttribute("download")) return;


        /* -----------------------------------------
           SHOW LOADER
        ----------------------------------------- */

        loader.classList.remove("loader-hidden");


        /* -----------------------------------------
           FORCE MINIMUM 1 SECOND
        ----------------------------------------- */

        event.preventDefault();

        const destination = link.href;

        setTimeout(function () {

            window.location.href = destination;

        }, 1000);

    });


})();