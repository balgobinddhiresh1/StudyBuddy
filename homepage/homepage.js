document.addEventListener('DOMContentLoaded', function () {

    /* =========================================
       SCROLL SPY (underline active nav link)
    ========================================= */

    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-links a');

    function updateActiveLink() {
        let current = '';

        sections.forEach(section => {
            const sectionTop = section.offsetTop - 150; // adjust for navbar height
            if (window.scrollY >= sectionTop) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');

            const href = link.getAttribute('href');

            if (href === `#${current}`) {
                link.classList.add('active');
            } else if (current === '' && href === 'homepage.html') {
                link.classList.add('active');
            }
        });
    }

    window.addEventListener('scroll', updateActiveLink);
    updateActiveLink();


    /* =========================================
       PROFILE DROPDOWN
    ========================================= */

    const profileBtn = document.getElementById('profileBtn');
    const profileDropdown = document.getElementById('profileDropdown');

    if (profileBtn && profileDropdown) {
        profileBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            profileDropdown.classList.toggle('show');
        });

        document.addEventListener('click', function (e) {
            if (!profileDropdown.contains(e.target) && e.target !== profileBtn) {
                profileDropdown.classList.remove('show');
            }
        });
    }


    /* =========================================
       NAVBAR SHOW/HIDE ON SCROLL
    ========================================= */

    let lastScrollY = window.scrollY;
    const siteHeader = document.querySelector('header');

    window.addEventListener('scroll', function () {
        const currentScrollY = window.scrollY;

        if (currentScrollY > lastScrollY && currentScrollY > 100) {
            siteHeader.classList.add('nav-hidden');
        } else {
            siteHeader.classList.remove('nav-hidden');
        }

        lastScrollY = currentScrollY;
    });


    /* =========================================
       BOTTOM MOBILE NAV
    ========================================= */

    const bottomNav = document.getElementById('bottomNav');
    const circle = document.getElementById('bottomNavCircle');

    if (bottomNav && circle) {

        const bottomItems = bottomNav.querySelectorAll('.bottom-nav-item');

        function cxForIndex(index) {
            return ((index + 0.5) / bottomItems.length) * 100;
        }

        function setCirclePosition(cx) {
            circle.style.left = `calc(${cx}% - 28px)`;
        }

        function fillCircleWithIcon(item) {
            const iconMarkup = item.querySelector('.bottom-nav-icon').innerHTML;
            circle.innerHTML = `<span class="bottom-nav-icon">${iconMarkup}</span>`;
        }

        const activeIndex = Array.from(bottomItems).findIndex(i => i.classList.contains('active'));
        const startIndex = activeIndex >= 0 ? activeIndex : 0;

        setCirclePosition(cxForIndex(startIndex));
        fillCircleWithIcon(bottomItems[startIndex]);

        bottomItems.forEach((item, index) => {
            item.addEventListener('click', function () {
                bottomItems.forEach(i => i.classList.remove('active'));
                this.classList.add('active');

                setCirclePosition(cxForIndex(index));
                fillCircleWithIcon(this);
            });
        });

        window.addEventListener('resize', () => {
            const active = Array.from(bottomItems).findIndex(i => i.classList.contains('active'));
            setCirclePosition(cxForIndex(active >= 0 ? active : 0));
        });
    }

    const bottomNavProfileBtn = document.getElementById('bottomNavProfileBtn');

    if (bottomNavProfileBtn && profileDropdown) {
        bottomNavProfileBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            profileDropdown.classList.toggle('show');
        });
    }

});
let lastScrollY = window.scrollY;
const siteHeader = document.querySelector('header');

window.addEventListener('scroll', function () {
    const currentScrollY = window.scrollY;

    if (currentScrollY > lastScrollY && currentScrollY > 100) {
        siteHeader.classList.add('nav-hidden');
    } else {
        siteHeader.classList.remove('nav-hidden');
    }

    lastScrollY = currentScrollY;
});