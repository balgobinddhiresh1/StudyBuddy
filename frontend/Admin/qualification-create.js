const API = (window.OCTOBUDDY_API_BASE_URL || "https://studybuddy-bl8d.onrender.com/api/").replace(/\/?$/, "/");
const form = document.getElementById("createQualification");
const nameInput = document.getElementById("qualificationName");
const message = document.getElementById("message");

function validQualificationName(name) {
    return name.length >= 2 && name.length <= 150 &&
        /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ &().,'/-]*$/.test(name);
}

nameInput.addEventListener("input", () => {
    nameInput.setCustomValidity(/[0-9]/.test(nameInput.value) ? "Numbers are not allowed in qualification names." : "");
});

form.addEventListener("submit", async event => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!validQualificationName(name)) {
        message.textContent = "Qualification names must contain letters only. Numbers are not allowed.";
        nameInput.focus();
        return;
    }

    const token = localStorage.getItem("auth_token") || "";
    message.textContent = "Creating qualification…";
    try {
        const response = await fetch(`${API}admin/qualifications`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ name })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Could not create qualification.");
        message.textContent = "Qualification created. Opening its module catalogue…";
        location.href = `qualification-detail.html?id=${data.qualification.id}`;
    } catch (error) {
        message.textContent = error.message || "Could not create qualification.";
    }
});
