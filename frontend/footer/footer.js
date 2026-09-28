document.addEventListener("DOMContentLoaded", function () {

    const footerContainer = document.getElementById("footer-container");

    if (!footerContainer) return;

    // Resolve all footer links from the footer.js location, not from the page
    // currently being viewed. This keeps the footer working from any folder.
    const footerScript = document.currentScript || Array.from(document.scripts).find(s => s.src.includes("footer.js"));
    const frontendRoot = footerScript
        ? new URL("../", footerScript.src).href
        : new URL("../", window.location.href).href;
    const page = path => new URL(path, frontendRoot).href;


    /* ===========================
       FOOTER STYLES
    =========================== */

    if (!document.getElementById("octobuddy-footer-styles")) {

        const style = document.createElement("style");

        style.id = "octobuddy-footer-styles";

        style.textContent = `

            .site-footer {
                background: #213A57;
                color: #ffffff;
                padding: 70px 8% 0;
                font-family: 'Poppins', sans-serif;
            }


            .footer-container {
                max-width: 1400px;
                margin: auto;

                display: grid;

                grid-template-columns:
                    2fr
                    1fr
                    1fr
                    1fr;

                gap: 60px;

                padding-bottom: 60px;
            }


            .footer-brand {
                max-width: 380px;
            }


            .footer-logo {
                width: 190px;
                height: auto;
                display: block;
                margin-bottom: 25px;
            }


            .footer-description {
                font-size: 15px;
                line-height: 1.8;
                color: #dcebed;
                margin-bottom: 20px;
            }


            .footer-company {
                font-size: 15px;
                color: #80ED99;
            }


            .footer-company strong {
                color: #80ED99;
            }


            .footer-column {
                display: flex;
                flex-direction: column;
            }


            .footer-column h3 {
                font-size: 18px;
                margin-bottom: 25px;
                color: #45DFB1;
                font-weight: 600;
            }


            .footer-column a {
                color: #ffffff;
                text-decoration: none;
                font-size: 14px;
                margin-bottom: 15px;
                transition: 0.3s ease;
            }


            .footer-column a:hover {
                color: #80ED99;
                transform: translateX(4px);
            }


            .footer-bottom {
                max-width: 1400px;
                margin: auto;

                border-top:
                    1px solid
                    rgba(255, 255, 255, 0.15);

                min-height: 75px;

                display: flex;
                justify-content: space-between;
                align-items: center;

                gap: 20px;

                color: #c8d8dc;

                font-size: 13px;
            }


            @media (max-width: 900px) {

                .footer-container {
                    grid-template-columns: 1fr 1fr;
                    gap: 45px;
                }

            }


            @media (max-width: 600px) {

                .site-footer {
                    padding: 50px 25px 0;
                }


                .footer-container {
                    grid-template-columns: 1fr;
                    gap: 35px;
                }


                .footer-brand {
                    max-width: 100%;
                }


                .footer-logo {
                    width: 170px;
                }


                .footer-bottom {
                    flex-direction: column;
                    justify-content: center;
                    text-align: center;
                    padding: 25px 0;
                }

            }

        `;

        document.head.appendChild(style);
    }


    /* ===========================
       FOOTER
    =========================== */

    footerContainer.innerHTML = `

        <footer class="site-footer">


            <div class="footer-container">


                <!-- BRAND -->

                <div class="footer-brand">

                    <img
                        src="${page("LOGIN.png")}"
                        alt="Octo Buddy Logo"
                        class="footer-logo"
                    >

                    <p class="footer-description">

                        Octo Buddy connects Richfield students with
                        fellow students who can provide academic support,
                        guidance and peer-to-peer learning.

                    </p>


                    <p class="footer-company">

                        A platform by
                        <strong>Alpha Tech Corp.</strong>

                    </p>

                </div>


                <!-- OCTO BUDDY -->

                <div class="footer-column">

                    <h3>Octo Buddy</h3>

                    <a href="${page("homepage/homepage.html")}">
                        Home
                    </a>

                    <a href="${page("homepage/homepage.html#about")}">
                        About Us
                    </a>

                    <a href="${page("Dashboard/Dashboard.html")}">
                        Student Dashboard
                    </a>

                    <a href="${page("octobuddy/apply.html")}">
                        Become an Octo Buddy
                    </a>

                </div>


                <!-- PLATFORM -->

                <div class="footer-column">

                    <h3>Platform</h3>

                    <a href="${page("Dashboard/Dashboard.html")}">
                        Student Dashboard
                    </a>

                    <a href="${page("sessions/sessions.html")}">
                        Book a Session
                    </a>

                    <a href="${page("octobuddy/apply.html")}">
                        Become an Octo Buddy
                    </a>

                    <a href="${page("homepage/homepage.html#about")}">
                        Academic Support
                    </a>

                </div>


                <!-- SUPPORT -->

                <div class="footer-column">

                    <h3>Support</h3>

                    <a href="#">
                        Help Centre
                    </a>

                    <a href="#">
                        Contact Us
                    </a>

                    <a href="#">
                        Privacy Policy
                    </a>

                    <a href="#">
                        Terms & Conditions
                    </a>

                </div>


            </div>


            <!-- FOOTER BOTTOM -->

            <div class="footer-bottom">

                <p>
                    © 2026 Alpha Tech Corp.
                    All rights reserved.
                </p>

                <p>
                    Octo Buddy — Richfield Student Support Platform
                </p>

            </div>


        </footer>

    `;

});