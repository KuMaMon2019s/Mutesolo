const state = {
  projects: [],
  selectedProject: "",
  selectedRequirement: "",
  discordText: "",
};

const el = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }
  return data;
}

async function loadState() {
  const data = await api("/api/state");
  state.projects = data.projects || [];
  const cfg = data.config || {};
  el("openclawUrl").value = cfg.openclaw_base_url || "";
  el("openclawToken").value = cfg.openclaw_token || "";
  el("githubRepo").value = cfg.github_repo || "";
  el("discordUrl").value = cfg.discord_url || "";
  el("clawhubUrl").value = cfg.clawhub_base_url || "";
  el("llmUrl").value = cfg.llm_base_url || "";
  renderProjects();
}

function renderProjects() {
  const list = el("projectsList");
  const select = el("projectSelect");
  list.innerHTML = "";
  select.innerHTML = "";
  if (!state.projects.length) {
    list.className = "projectList empty";
    list.textContent = "No projects yet";
    return;
  }
  list.className = "projectList";
  for (const project of state.projects) {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    select.append(option);

    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `<strong>${escapeHtml(project.name)}</strong><span>${escapeHtml(project.description || "")}</span>`;
    const reqs = document.createElement("div");
    reqs.className = "muted";
    reqs.textContent = `${(project.requirements || []).length} requirement point(s)`;
    item.append(reqs);
    item.addEventListener("click", () => {
      select.value = project.id;
      state.selectedProject = project.id;
      renderRequirementOptions();
    });
    list.append(item);
  }
  state.selectedProject = select.value || state.projects[0].id;
  renderRequirementOptions();
  renderBoard();
}

function renderRequirementOptions() {
  const project = currentProject();
  if (!project) return;
  const latest = (project.requirements || []).at(-1);
  state.selectedRequirement = latest ? latest.id : "";
  renderBoard();
}

async function saveConfig() {
  await api("/api/config", {
    method: "PUT",
    body: JSON.stringify({
      openclaw_base_url: el("openclawUrl").value.trim(),
      openclaw_token: el("openclawToken").value.trim(),
      github_repo: el("githubRepo").value.trim(),
      discord_url: el("discordUrl").value.trim(),
      clawhub_base_url: el("clawhubUrl").value.trim(),
      llm_base_url: el("llmUrl").value.trim(),
    }),
  });
  await refreshConnections();
}

async function refreshConnections() {
  const dot = el("openclawDot");
  const text = el("openclawText");
  const meta = el("openclawMeta");
  try {
    const status = await api("/api/openclaw/status");
    dot.className = `dot ${status.online ? "ok" : "bad"}`;
    text.textContent = status.online ? "OpenClaw online" : "OpenClaw offline";
    meta.textContent = status.online
      ? `${status.name || "agent"} ${status.version || ""} ${status.agent_id || ""}`.trim()
      : status.error || "not reachable";
  } catch (error) {
    dot.className = "dot bad";
    text.textContent = "OpenClaw offline";
    meta.textContent = error.message;
  }

  try {
    const skills = await api("/api/clawhub/skills");
    const list = el("skillsList");
    list.innerHTML = "";
    if (!skills.length) {
      list.className = "list empty";
      list.textContent = "No skills loaded";
      return;
    }
    list.className = "list";
    for (const skill of skills) {
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `<strong>${escapeHtml(skill.name || skill.id)}</strong><span>${escapeHtml((skill.capabilities || []).join(", "))}</span>`;
      list.append(item);
    }
  } catch (error) {
    el("skillsList").className = "list empty";
    el("skillsList").textContent = error.message;
  }

  try {
    const runtimes = await api("/api/plugin-runtimes");
    const list = el("runtimeList");
    list.innerHTML = "";
    list.className = "list";
    for (const runtime of runtimes) {
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `<strong>${escapeHtml(runtime.name)}</strong><span>${escapeHtml((runtime.extensions || []).join(", "))}</span>`;
      list.append(item);
    }
  } catch (error) {
    el("runtimeList").className = "list empty";
    el("runtimeList").textContent = error.message;
  }
}

async function createProject() {
  const project = await api("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: el("projectName").value.trim(),
      description: el("projectDesc").value.trim(),
      plan: el("projectPlan").value.trim(),
      docs: el("projectDocs").value.trim(),
    }),
  });
  state.selectedProject = project.id;
  await loadState();
}

async function addRequirement() {
  const project = currentProject();
  if (!project) throw new Error("Create or select a project first");
  const req = await api(`/api/projects/${project.id}/requirements`, {
    method: "POST",
    body: JSON.stringify({
      title: el("reqTitle").value.trim(),
      description: el("reqDesc").value.trim(),
    }),
  });
  state.selectedRequirement = req.id;
  await loadState();
}

async function generatePrompt() {
  const project = currentProject();
  if (!project) throw new Error("Create or select a project first");
  const requirement = currentRequirement(project);
  if (!requirement) throw new Error("Add a requirement first");
  const result = await api(`/api/projects/${project.id}/prompt`, {
    method: "POST",
    body: JSON.stringify({ requirement_id: requirement.id }),
  });
  el("artifactPath").textContent = result.artifact_path;
  state.discordText = result.discord_text || result.segments.join("\n\n");
  const segments = el("segments");
  segments.innerHTML = "";
  segments.className = "segments";
  result.segments.forEach((segment, index) => {
    const node = document.createElement("div");
    node.className = "segment";
    node.innerHTML = `<strong>Segment ${index + 1}</strong><pre>${escapeHtml(segment)}</pre>`;
    segments.append(node);
  });
}

async function copyDiscordPrompt() {
  if (!state.discordText) {
    await generatePrompt();
  }
  await navigator.clipboard.writeText(state.discordText);
  alert("Copied Discord prompt");
}

function openDiscord() {
  const url = el("discordUrl").value.trim() || "https://discord.com/app";
  window.open(url, "_blank", "noopener");
}

async function pushGitHub() {
  const result = await api("/api/github/push", { method: "POST", body: "{}" });
  alert(result.status);
}

function currentProject() {
  const selected = el("projectSelect").value || state.selectedProject;
  return state.projects.find((project) => project.id === selected) || state.projects[0];
}

function currentRequirement(project) {
  const requirements = project.requirements || [];
  return requirements.find((req) => req.id === state.selectedRequirement) || requirements.at(-1);
}

function renderBoard() {
  const list = el("boardList");
  if (!list) return;
  const project = currentProject();
  const requirements = project ? project.requirements || [] : [];
  list.innerHTML = "";
  if (!requirements.length) {
    list.className = "list empty";
    list.textContent = "No requirements";
    return;
  }
  list.className = "list";
  for (const req of requirements) {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="itemRow">
        <input type="checkbox" data-req-id="${escapeHtml(req.id)}" />
        <div>
          <strong>${escapeHtml(req.title)}</strong>
          <span>${escapeHtml(req.status || "draft")}${req.commit_id ? ` · ${escapeHtml(req.commit_id)}` : ""}</span>
        </div>
      </div>`;
    list.append(item);
  }
}

async function closeSelected() {
  const project = currentProject();
  if (!project) throw new Error("Create or select a project first");
  const ids = [...document.querySelectorAll("[data-req-id]:checked")].map((node) => node.dataset.reqId);
  if (!ids.length) throw new Error("Select at least one requirement");
  const commitId = el("commitId").value.trim();
  if (!commitId) throw new Error("Paste OpenClaw A commit sha first");
  await api(`/api/projects/${project.id}/board`, {
    method: "POST",
    body: JSON.stringify({ requirement_ids: ids, commit_id: commitId, status: "closed" }),
  });
  await loadState();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function bind(id, fn) {
  el(id).addEventListener("click", async () => {
    try {
      await fn();
    } catch (error) {
      alert(error.message);
    }
  });
}

bind("refreshBtn", async () => {
  await loadState();
  await refreshConnections();
});
bind("saveConfigBtn", saveConfig);
bind("createProjectBtn", createProject);
bind("addReqBtn", addRequirement);
bind("promptBtn", generatePrompt);
bind("copyDiscordBtn", copyDiscordPrompt);
bind("openDiscordBtn", async () => openDiscord());
bind("pushBtn", pushGitHub);
bind("closeSelectedBtn", closeSelected);

loadState().then(refreshConnections).catch((error) => alert(error.message));
