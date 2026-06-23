const state = {
  projects: [],
  selectedProject: "",
  selectedRequirement: "",
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
  el("githubRepo").value = cfg.github_repo || "";
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
}

function renderRequirementOptions() {
  const project = currentProject();
  if (!project) return;
  const latest = (project.requirements || []).at(-1);
  state.selectedRequirement = latest ? latest.id : "";
}

async function saveConfig() {
  await api("/api/config", {
    method: "PUT",
    body: JSON.stringify({
      openclaw_base_url: el("openclawUrl").value.trim(),
      github_repo: el("githubRepo").value.trim(),
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
  const requirement = (project.requirements || []).at(-1);
  if (!requirement) throw new Error("Add a requirement first");
  const result = await api(`/api/projects/${project.id}/prompt`, {
    method: "POST",
    body: JSON.stringify({ requirement_id: requirement.id }),
  });
  el("artifactPath").textContent = result.artifact_path;
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

async function pushGitHub() {
  const result = await api("/api/github/push", { method: "POST", body: "{}" });
  alert(result.status);
}

function currentProject() {
  const selected = el("projectSelect").value || state.selectedProject;
  return state.projects.find((project) => project.id === selected) || state.projects[0];
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
bind("pushBtn", pushGitHub);

loadState().then(refreshConnections).catch((error) => alert(error.message));
