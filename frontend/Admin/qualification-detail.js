const API = (window.OCTOBUDDY_API_BASE_URL || "https://studybuddy-bl8d.onrender.com/api/").replace(/\/?$/, "/");
const id = new URLSearchParams(location.search).get("id");
const token = localStorage.getItem("auth_token") || "";
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[ch]));

async function api(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return fetch(url, { ...options, headers });
}

function validQualificationName(name) {
    return name.length >= 2 && name.length <= 150 &&
        /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ &().,'/-]*$/.test(name);
}

function notify(message, type = "info") {
    if (window.Swal?.fire) {
        return Swal.fire({ title: type === "error" ? "Please check" : "Octo Buddy", text: message, icon: type, confirmButtonColor: "#0C6478" });
    }
    if (typeof window.octoAlert === "function") return window.octoAlert(message);
    alert(message);
}

async function load() {
    try {
        const [qualificationResponse, moduleResponse] = await Promise.all([
            api(`${API}admin/qualifications`),
            api(`${API}admin/modules?qualification_id=${encodeURIComponent(id)}`)
        ]);
        const qualificationData = await qualificationResponse.json();
        const moduleData = await moduleResponse.json();
        if (!qualificationResponse.ok || !moduleResponse.ok) {
            throw new Error(qualificationData.message || moduleData.message || "Could not load qualification.");
        }
        const qualification = (qualificationData.qualifications || []).find(item => String(item.id) === String(id));
        if (!qualification) throw new Error("Qualification not found.");

        document.getElementById("message").textContent = "Edit the qualification name and manage its modules.";
        document.getElementById("summary").innerHTML = `
            <div class="field"><label>Qualification ID</label><strong>${esc(qualification.id)}</strong></div>
            <div class="field"><label>Status</label><strong>${qualification.active ? "Active" : "Inactive"}</strong></div>`;
        document.getElementById("newName").value = qualification.name;

        const modules = moduleData.modules || [];
        document.getElementById("modules").innerHTML = modules.length
            ? [1, 2, 3, 4, 5, 6].map(year => {
                const list = modules.filter(item => Number(item.academic_year) === year);
                return list.length ? `
                    <section class="field" style="margin-top:12px">
                        <h3>Year ${year}</h3>
                        <div class="modules">
                            ${list.map(item => `
                                <div class="module-row" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin:8px 0">
                                    <span class="module">${esc(item.name)}</span>
                                    <button type="button" class="delete-module-btn" data-module-id="${item.id}"
                                        style="background:#b42318;color:#fff;border:0;border-radius:8px;padding:7px 12px;cursor:pointer">
                                        Delete
                                    </button>
                                </div>`).join("")}
                        </div>
                    </section>` : "";
            }).join("")
            : `<p class="muted">No modules are linked to this qualification yet.</p>`;

        document.querySelectorAll(".delete-module-btn").forEach(button => {
            button.addEventListener("click", async () => {
                const module = modules.find(item => Number(item.id) === Number(button.dataset.moduleId));
                if (!module) return;
                const confirmed = window.Swal?.fire
                    ? await Swal.fire({ title: "Delete module?", text: `Remove ${module.name} from this qualification? It will also be removed from Buddy module selections. Historical bookings will remain.`, icon: "warning", showCancelButton: true, confirmButtonText: "Delete module", confirmButtonColor: "#b42318" }).then(result => result.isConfirmed)
                    : confirm(`Delete ${module.name} from this qualification?`);
                if (!confirmed) return;
                try {
                    const response = await api(`${API}admin/modules/${module.id}`, { method: "DELETE" });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.message || "Could not delete module.");
                    await load();
                } catch (error) {
                    notify(error.message || "Could not delete module.", "error");
                }
            });
        });
    } catch (error) {
        document.getElementById("message").textContent = error.message || "Could not load qualification.";
    }
}

document.getElementById("addModule").addEventListener("submit", async event => {
    event.preventDefault();
    const name = document.getElementById("moduleName").value.trim();
    const year = Number(document.getElementById("moduleYear").value);
    try {
        const response = await api(`${API}admin/modules`, {
            method: "POST",
            body: JSON.stringify({ name, qualification_id: Number(id), academic_year: year })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Could not add module.");
        document.getElementById("moduleName").value = "";
        await load();
        notify("Module added successfully.", "success");
    } catch (error) {
        notify(error.message || "Could not add module.", "error");
    }
});

document.getElementById("saveName").addEventListener("click", async () => {
    const name = document.getElementById("newName").value.trim();
    if (!validQualificationName(name)) {
        notify("Qualification names must contain letters only. Numbers are not allowed.", "error");
        return;
    }
    try {
        const response = await api(`${API}admin/qualifications/${id}`, {
            method: "PUT",
            body: JSON.stringify({ name })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Could not update qualification.");
        await load();
        notify("Qualification updated successfully.", "success");
    } catch (error) {
        notify(error.message || "Could not update qualification.", "error");
    }
});

document.getElementById("newName").addEventListener("input", event => {
    event.target.setCustomValidity(/[0-9]/.test(event.target.value) ? "Numbers are not allowed in qualification names." : "");
});

load();
