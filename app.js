const STORAGE_KEY = "triplettes.tournamentData";
const SESSION_KEY = "triplettes.adminToken";
const MAX_TEAMS = 16;
const BYE = "Exempt";
const TBD = "À déterminer";

// Les données vivent dans data.json, versionné dans le dépôt GitHub : chaque
// enregistrement est un commit. Les admins se connectent avec un jeton
// d'accès « fine-grained » limité à ce dépôt (permission Contents en
// lecture/écriture), distribué comme un mot de passe.
const REPO_API = "https://api.github.com/repos/vinylourson/Les-Triplettes-de-Jaur-s";
const DATA_API = `${REPO_API}/contents/data.json`;
const BRANCH = "main";
const POLL_INTERVAL_MS = 60000;
const SAVE_DEBOUNCE_MS = 1500;

const defaultData = {
  teams: [
    { name: "Cochonnet Crew", members: ["Alice", "Bruno"] },
    { name: "Les Pointilleux", members: ["Chloé", "David"] },
    { name: "La Triplette Verte", members: ["Emma", "Farid", "Gaspard"] },
    { name: "Tir de Précision", members: ["Hugo", "Inès"] },
    { name: "Les Rafleurs", members: ["Jules", "Kenza"] },
    { name: "Carreau Club", members: ["Lina", "Malo", "Nina"] },
    { name: "Bouchon d'Or", members: ["Omar", "Paula"] },
    { name: "Les Inséparables", members: ["Quentin", "Rania"] },
    { name: "Pointeurs Solidaires", members: ["Sam", "Tina"] },
    { name: "Les Mènes", members: ["Ugo", "Violette"] },
    { name: "Doublette Plus", members: ["Wassim", "Xena"] },
    { name: "Le Cercle Bleu", members: ["Yann", "Zoé"] },
    { name: "Les Fanny", members: ["Arthur", "Binta"] },
    { name: "La Boule Noire", members: ["Cyril", "Diane"] },
    { name: "Petanq'Attack", members: ["Eli", "Fiona"] },
    { name: "Les Finalistes", members: ["Gaël", "Hana"] }
  ]
};

function makeMatch(id, teamA, teamB) {
  return { id, teamA, teamB, scoreA: 0, scoreB: 0, winner: "" };
}

function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function roundLabel(matchCount) {
  if (matchCount === 1) return "Finale";
  if (matchCount === 2) return "1/2 finale";
  return `1/${matchCount} de finale`;
}

// Tirage au sort complet : paires du tour de chauffe et placement dans le
// tableau final. La taille du tableau est la puissance de 2 immédiatement
// supérieure au nombre d'équipes ; les places vacantes sont des exemptions
// (« Exempt ») réparties au plus une par match et qualifient d'office.
function buildSchedule(teamNames) {
  const warmupOrder = shuffle(teamNames);
  if (warmupOrder.length % 2 === 1) {
    warmupOrder.push(BYE);
  }
  const warmup = [];
  for (let i = 0; i < warmupOrder.length; i += 2) {
    warmup.push(makeMatch(`warmup-${i / 2 + 1}`, warmupOrder[i], warmupOrder[i + 1]));
  }

  let size = 2;
  while (size < teamNames.length) {
    size *= 2;
  }
  const order = shuffle(teamNames);
  const byes = size - order.length;
  const firstRound = [];
  let cursor = 0;
  for (let m = 0; m < size / 2; m++) {
    if (m < byes) {
      firstRound.push(makeMatch("", order[cursor++], BYE));
    } else {
      firstRound.push(makeMatch("", order[cursor++], order[cursor++]));
    }
  }
  const mixed = shuffle(firstRound);
  mixed.forEach((match) => {
    if (match.teamB === BYE) {
      match.winner = match.teamA;
    }
  });

  const rounds = [];
  let current = mixed;
  let teamsLeft = size;
  for (;;) {
    current.forEach((match, i) => {
      match.id = `r${teamsLeft}-${i + 1}`;
    });
    rounds.push({ id: `round-${teamsLeft}`, label: roundLabel(current.length), matches: current });
    if (current.length === 1) {
      break;
    }
    teamsLeft /= 2;
    current = Array.from({ length: current.length / 2 }, () => makeMatch("", TBD, TBD));
  }

  return { warmup, rounds };
}

function loadCachedData() {
  const fromStorage = localStorage.getItem(STORAGE_KEY);
  if (fromStorage) {
    return JSON.parse(fromStorage);
  }

  const schedule = buildSchedule(defaultData.teams.map((team) => team.name));
  return { teams: defaultData.teams, warmup: schedule.warmup, rounds: schedule.rounds, drawCount: defaultData.teams.length };
}

let state = loadCachedData();

function getToken() {
  return sessionStorage.getItem(SESSION_KEY) || "";
}

function isAdmin() {
  return Boolean(getToken());
}

function drawIsStale() {
  return state.drawCount !== undefined && state.drawCount !== state.teams.length;
}

/* ---------- Synchronisation GitHub ---------- */

let remoteSha = null;
let remoteEtag = null;

function decodeContent(base64) {
  return new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
}

function encodeContent(text) {
  let binary = "";
  new TextEncoder().encode(text).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function apiHeaders() {
  const headers = { Accept: "application/vnd.github+json" };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

// Lit data.json ; en mode conditionnel, renvoie null si rien n'a changé
// (réponse 304, qui ne compte pas dans le quota d'API anonyme).
async function fetchRemoteData({ conditional = false } = {}) {
  const headers = apiHeaders();
  if (conditional && remoteEtag) {
    headers["If-None-Match"] = remoteEtag;
  }
  const response = await fetch(`${DATA_API}?ref=${BRANCH}`, { headers, cache: "no-store" });
  if (response.status === 304) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`GitHub ${response.status}`);
  }
  remoteEtag = response.headers.get("ETag");
  const payload = await response.json();
  remoteSha = payload.sha;
  return JSON.parse(decodeContent(payload.content));
}

// Écrit data.json (un commit par enregistrement). En cas de conflit de SHA
// (un autre admin a enregistré entre-temps), on récupère le SHA à jour et on
// réessaie une fois : dernière écriture gagne.
async function pushRemoteData() {
  if (remoteSha === null) {
    await fetchRemoteData();
  }

  const body = {
    message: "Mise à jour des résultats via le back-office",
    content: encodeContent(JSON.stringify(state, null, 2)),
    branch: BRANCH,
    sha: remoteSha
  };
  const put = () =>
    fetch(DATA_API, { method: "PUT", headers: apiHeaders(), body: JSON.stringify(body) });

  let response = await put();
  if (response.status === 409 || response.status === 422) {
    await fetchRemoteData();
    body.sha = remoteSha;
    response = await put();
  }
  if (!response.ok) {
    throw new Error(`GitHub ${response.status}`);
  }
  const payload = await response.json();
  remoteSha = payload.content.sha;
  remoteEtag = null;
}

let saveTimer;
let saving = false;
let pendingSave = false;

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (!isAdmin()) {
    return;
  }
  setSaveStatus("pending");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveRemote();
  }, SAVE_DEBOUNCE_MS);
}

async function saveRemote() {
  if (saving) {
    pendingSave = true;
    return;
  }
  saving = true;
  try {
    await pushRemoteData();
    setSaveStatus("saved");
  } catch (error) {
    setSaveStatus("error");
  } finally {
    saving = false;
    if (pendingSave) {
      pendingSave = false;
      saveRemote();
    }
  }
}

// Les visiteurs (écran du tournoi inclus) récupèrent les mises à jour
// périodiquement. Pas de pull côté admin : il est la source des écritures.
async function refreshFromRemote() {
  if (isAdmin()) {
    return;
  }
  try {
    const remote = await fetchRemoteData({ conditional: true });
    if (remote) {
      state = remote;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderChart();
      renderTeams();
    }
  } catch (error) {
    // hors-ligne ou quota API : on garde l'affichage courant
  }
}

// Actualisation manuelle (bouton du Tableau) : récupération forcée, sans
// rechargement de page. Inactive si un enregistrement admin est en attente,
// pour ne pas écraser une saisie en cours.
async function manualRefresh() {
  const button = document.getElementById("refresh-button");
  if (saving || pendingSave || saveTimer) {
    setRefreshStatus("Enregistrement en cours…");
    return;
  }
  button.disabled = true;
  setRefreshStatus("Actualisation…");
  try {
    const remote = await fetchRemoteData();
    if (remote) {
      state = remote;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderChart();
      renderTeams();
    }
    setRefreshStatus(`À jour — ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`);
  } catch (error) {
    setRefreshStatus("⚠ Échec de l'actualisation");
  } finally {
    button.disabled = false;
  }
}

function setRefreshStatus(text) {
  document.getElementById("refresh-status").textContent = text;
}

const SAVE_MESSAGES = {
  pending: { text: "Enregistrement…", className: "save-status" },
  saved: { text: "✓ Enregistré sur GitHub", className: "save-status save-status--ok" },
  error: { text: "⚠ Échec de l'enregistrement — vérifiez le jeton ou la connexion", className: "save-status save-status--error" }
};

let saveStatusTimer;
function setSaveStatus(kind) {
  const status = document.getElementById("save-status");
  const config = SAVE_MESSAGES[kind];
  status.textContent = config.text;
  status.className = config.className;
  clearTimeout(saveStatusTimer);
  if (kind === "saved") {
    saveStatusTimer = setTimeout(() => {
      status.textContent = "";
    }, 3000);
  }
}

/* ---------- Vues publiques ---------- */

function renderChart() {
  const warmupContainer = document.getElementById("warmup-list");
  warmupContainer.innerHTML = state.warmup.map(renderMatchCard).join("");

  const bracketContainer = document.getElementById("bracket-container");
  bracketContainer.innerHTML = renderBracket();
}

// Tableau symétrique générique : pour R tours, 2R-1 colonnes — chaque tour
// est partagé moitié gauche / moitié droite autour de la finale.
function renderBracket() {
  const rounds = state.rounds;
  const total = rounds.length;

  const slot = (match) => `<div class="match-slot">${renderMatchCard(match)}</div>`;
  const pairs = (matches) => {
    const blocks = [];
    for (let i = 0; i < matches.length; i += 2) {
      blocks.push(`<div class="bracket-pair">${slot(matches[i])}${slot(matches[i + 1])}</div>`);
    }
    return blocks.join("");
  };
  const column = (label, content, side) =>
    `<section class="bracket-column ${side}"><h3>${label}</h3><div class="bracket-matches">${content}</div></section>`;

  const leftColumns = [];
  const rightColumns = [];
  for (let r = 0; r < total - 1; r++) {
    const matches = rounds[r].matches;
    const left = matches.slice(0, matches.length / 2);
    const right = matches.slice(matches.length / 2);
    const feeds = r === total - 2 ? " feeds-final" : "";
    leftColumns.push(column(rounds[r].label, left.length === 1 ? slot(left[0]) : pairs(left), `side-left${feeds}`));
    rightColumns.unshift(column(rounds[r].label, right.length === 1 ? slot(right[0]) : pairs(right), `side-right${feeds}`));
  }

  const final = rounds[total - 1];
  const columns = [...leftColumns, column(final.label, slot(final.matches[0]), "final-column"), ...rightColumns];

  return `<div class="bracket" style="grid-template-columns: repeat(${columns.length}, minmax(150px, 1fr));">${columns.join("")}</div>`;
}

function renderMatchCard(match) {
  const line = (team, score) => {
    const classes = [match.winner && match.winner === team ? "winner" : "", team === BYE ? "bye" : ""]
      .filter(Boolean)
      .join(" ");
    return `<div class="${classes}">${team === BYE ? BYE : `${team} : ${score}`}</div>`;
  };
  return `<article class="match-card">${line(match.teamA, match.scoreA)}${line(match.teamB, match.scoreB)}</article>`;
}

function renderTeams() {
  document.getElementById("teams-list").innerHTML = state.teams
    .map(
      (team) => `<article class="team-card"><h3>${team.name}</h3><ul>${team.members
        .map((member) => `<li>${member}</li>`)
        .join("")}</ul></article>`
    )
    .join("");
}

/* ---------- Back-office ---------- */

function renderAdmin() {
  const authContainer = document.getElementById("auth-container");
  const adminPanel = document.getElementById("admin-panel");

  if (!isAdmin()) {
    authContainer.classList.remove("hidden");
    adminPanel.classList.add("hidden");
    return;
  }

  authContainer.classList.add("hidden");
  adminPanel.classList.remove("hidden");

  renderAdminTeams();
  renderAdminMatches();
}

function renderAdminTeams() {
  const rows = state.teams.map((team, index) => renderTeamRow(team, index)).join("");
  const addBlock =
    state.teams.length >= MAX_TEAMS
      ? `<p class="admin-note">Nombre maximum d'équipes atteint (${MAX_TEAMS}).</p>`
      : `<form class="team-row team-form--new">
          <input type="text" name="name" aria-label="Nom de la nouvelle équipe" placeholder="Nouvelle équipe" required />
          <input type="text" name="members" aria-label="Joueurs de la nouvelle équipe" placeholder="Joueurs (séparés par des virgules)" />
          <button type="submit">Ajouter</button>
        </form>`;

  document.getElementById("admin-teams").innerHTML = `<div class="team-row team-row--head" aria-hidden="true">
      <span>Nom de l'équipe</span><span>Joueurs (séparés par des virgules)</span><span></span>
    </div>${rows}${addBlock}`;

  document.getElementById("rebuild-schedule-button").disabled = state.teams.length < 2;
}

function renderTeamRow(team, index) {
  return `<div class="team-row" data-index="${index}">
      <input type="text" name="name" value="${team.name}" aria-label="Nom de l'équipe ${index + 1}" required />
      <input type="text" name="members" value="${team.members.join(", ")}" aria-label="Joueurs de l'équipe ${index + 1}" />
      <button type="button" class="team-delete" data-index="${index}" aria-label="Supprimer ${team.name}">Supprimer</button>
    </div>`;
}

function renderAdminMatches() {
  const focused = captureAdminFocus();
  const staleNote = drawIsStale()
    ? `<p class="admin-note">Le nombre d'équipes (${state.teams.length}) a changé depuis le tirage au sort (${state.drawCount}) — refaites le tirage.</p>`
    : "";

  document.getElementById("admin-warmup").innerHTML =
    staleNote + `<div class="admin-grid">${state.warmup.map((match) => renderMatchForm(match, "warmup")).join("")}</div>`;

  document.getElementById("admin-bracket").innerHTML =
    staleNote +
    state.rounds
      .map(
        (round) =>
          `<div class="round-block"><h4>${round.label}</h4><div class="admin-grid">${round.matches
            .map((match) => renderMatchForm(match, round.id))
            .join("")}</div></div>`
      )
      .join("");

  restoreAdminFocus(focused);
}

// La saisie est conservée au clavier : si un champ de match avait le focus
// avant un re-rendu (propagation des vainqueurs), on le lui redonne.
function captureAdminFocus() {
  const active = document.activeElement;
  const form = active && active.closest ? active.closest(".result-form") : null;
  return form ? { matchId: form.dataset.matchId, field: active.name } : null;
}

function restoreAdminFocus(focused) {
  if (!focused) {
    return;
  }
  const el = document.querySelector(`.result-form[data-match-id="${focused.matchId}"] [name="${focused.field}"]`);
  if (el) {
    el.focus();
  }
}

function renderMatchForm(match, section) {
  if (match.teamA === BYE || match.teamB === BYE) {
    const qualified = match.teamA === BYE ? match.teamB : match.teamA;
    const note = section === "warmup" ? "Exempt pour ce tour" : "Exempt — qualifié d'office";
    return `<div class="form-card bye-card"><p class="match-title"><strong>${qualified}</strong></p><p>${note}</p></div>`;
  }

  const winnerOptions = ["", match.teamA, match.teamB]
    .map((teamName) => `<option ${teamName === match.winner ? "selected" : ""} value="${teamName}">${teamName || "Aucun"}</option>`)
    .join("");

  return `<form class="result-form form-card" data-section="${section}" data-match-id="${match.id}">
      <p class="match-title"><strong>${match.teamA}</strong> vs <strong>${match.teamB}</strong></p>
      <div class="score-row">
        <label>Score
          <input type="number" min="0" name="scoreA" value="${match.scoreA}" aria-label="Score ${match.teamA}" required />
        </label>
        <label>Score
          <input type="number" min="0" name="scoreB" value="${match.scoreB}" aria-label="Score ${match.teamB}" required />
        </label>
      </div>
      <label>Vainqueur
        <select name="winner">${winnerOptions}</select>
      </label>
    </form>`;
}

/* ---------- Actions back-office ---------- */

function setupAdmin() {
  const teamsContainer = document.getElementById("admin-teams");

  // Édition en ligne : chaque champ s'enregistre dès qu'il est modifié
  // (Tab ou clic ailleurs), sans bouton à presser.
  teamsContainer.addEventListener("change", (event) => {
    const row = event.target.closest(".team-row[data-index]");
    if (!row) {
      return;
    }
    const team = state.teams[Number(row.dataset.index)];

    if (event.target.name === "name") {
      const name = event.target.value.trim();
      if (!name) {
        event.target.value = team.name;
        return;
      }
      if (name !== team.name) {
        renameTeamInMatches(team.name, name);
        team.name = name;
        renderChart();
        renderAdminMatches();
      }
    } else {
      team.members = event.target.value
        .split(",")
        .map((member) => member.trim())
        .filter(Boolean);
    }

    persist();
    renderTeams();
  });

  teamsContainer.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    const name = form.elements.name.value.trim();
    if (!name || state.teams.length >= MAX_TEAMS) {
      return;
    }
    const members = form.elements.members.value
      .split(",")
      .map((member) => member.trim())
      .filter(Boolean);

    state.teams.push({ name, members });
    persist();
    renderTeams();
    renderAdminTeams();
    renderAdminMatches();

    const nextInput = teamsContainer.querySelector('.team-form--new input[name="name"]');
    if (nextInput) {
      nextInput.focus();
    }
  });

  teamsContainer.addEventListener("click", (event) => {
    const button = event.target.closest(".team-delete");
    if (button) {
      deleteTeam(Number(button.dataset.index));
    }
  });

  ["admin-warmup", "admin-bracket"].forEach((id) => {
    document.getElementById(id).addEventListener("change", (event) => {
      const form = event.target.closest(".result-form");
      if (form && form.checkValidity()) {
        applyMatchForm(form);
      }
    });
  });

  document.getElementById("rebuild-schedule-button").addEventListener("click", rebuildSchedule);
}

function applyMatchForm(form) {
  const section = form.dataset.section;
  const matches = section === "warmup" ? state.warmup : state.rounds.find((round) => round.id === section).matches;
  const match = matches.find((item) => item.id === form.dataset.matchId);

  if (!match) {
    return;
  }

  const winner = form.elements.winner.value;
  if (winner && winner !== match.teamA && winner !== match.teamB) {
    return;
  }

  match.scoreA = Number(form.elements.scoreA.value);
  match.scoreB = Number(form.elements.scoreB.value);
  match.winner = winner;

  if (section !== "warmup") {
    propagateWinners();
    renderAdminMatches();
  }

  persist();
  renderChart();
}

function deleteTeam(index) {
  const team = state.teams[index];
  if (!confirm(`Supprimer l'équipe « ${team.name} » ?`)) {
    return;
  }

  state.teams.splice(index, 1);
  clearTeamFromMatches(team.name);
  propagateWinners();

  persist();
  renderTeams();
  renderChart();
  renderAdminTeams();
  renderAdminMatches();
}

function renameTeamInMatches(oldName, newName) {
  const allMatches = [...state.warmup, ...state.rounds.flatMap((round) => round.matches)];
  allMatches.forEach((match) => {
    if (match.teamA === oldName) match.teamA = newName;
    if (match.teamB === oldName) match.teamB = newName;
    if (match.winner === oldName) match.winner = newName;
  });
}

// Équipe supprimée : ses matchs redeviennent à jouer, sans vainqueur fantôme.
function clearTeamFromMatches(name) {
  const allMatches = [...state.warmup, ...state.rounds.flatMap((round) => round.matches)];
  allMatches.forEach((match) => {
    if (match.teamA !== name && match.teamB !== name) {
      return;
    }
    if (match.teamA === name) match.teamA = TBD;
    if (match.teamB === name) match.teamB = TBD;
    match.scoreA = 0;
    match.scoreB = 0;
    match.winner = "";
  });
}

// Reporte les vainqueurs de chaque tour dans le tour suivant : le vainqueur
// du match i va dans le match ⌊i/2⌋, côté A si i est pair, côté B sinon.
// Si l'occupant d'un créneau change, le résultat en aval est invalidé et la
// correction se propage de tour en tour.
function propagateWinners() {
  for (let r = 0; r < state.rounds.length - 1; r++) {
    state.rounds[r].matches.forEach((match, i) => {
      const target = state.rounds[r + 1].matches[Math.floor(i / 2)];
      const side = i % 2 === 0 ? "teamA" : "teamB";
      const scoreKey = i % 2 === 0 ? "scoreA" : "scoreB";
      const advancing = match.winner || TBD;
      if (target[side] !== advancing) {
        if (target.winner === target[side]) {
          target.winner = "";
        }
        target[side] = advancing;
        target[scoreKey] = 0;
      }
    });
  }
}

function rebuildSchedule() {
  if (state.teams.length < 2) {
    return;
  }
  if (!confirm("Tirer au sort le tour de chauffe et le tableau final ? Tous les scores seront remis à zéro.")) {
    return;
  }

  const schedule = buildSchedule(state.teams.map((team) => team.name));
  state.warmup = schedule.warmup;
  state.rounds = schedule.rounds;
  state.drawCount = state.teams.length;
  propagateWinners();

  persist();
  renderChart();
  renderAdminMatches();
}

/* ---------- Navigation & authentification ---------- */

function setupNavigation() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      document.querySelectorAll(".nav-button").forEach((btn) => btn.classList.toggle("active", btn === button));
      document.querySelectorAll(".view").forEach((section) => {
        section.classList.toggle("hidden", section.id !== `${view}-view`);
      });
      if (view === "admin") {
        renderAdmin();
      }
    });
  });
}

function setupAuth() {
  const feedback = document.getElementById("auth-feedback");

  document.getElementById("auth-container").addEventListener("submit", async (event) => {
    event.preventDefault();
    const tokenInput = document.getElementById("password");
    const token = tokenInput.value.trim();
    if (!token) {
      return;
    }

    feedback.textContent = "Vérification du jeton…";
    try {
      const response = await fetch(REPO_API, {
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` },
        cache: "no-store"
      });
      if (!response.ok) {
        feedback.textContent = "Jeton invalide.";
        return;
      }
      const repo = await response.json();
      if (!repo.permissions || !repo.permissions.push) {
        feedback.textContent = "Ce jeton n'a pas le droit d'écriture sur le dépôt.";
        return;
      }
    } catch (error) {
      feedback.textContent = "Impossible de joindre GitHub — vérifiez la connexion.";
      return;
    }

    sessionStorage.setItem(SESSION_KEY, token);
    tokenInput.value = "";
    feedback.textContent = "";

    // Repartir de la version du dépôt avant d'éditer (SHA à jour inclus).
    try {
      const remote = await fetchRemoteData();
      if (remote) {
        state = remote;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        renderChart();
        renderTeams();
      }
    } catch (error) {
      // data.json absent ou illisible : on gardera l'état local, le premier
      // enregistrement le publiera
    }
    renderAdmin();
  });

  document.getElementById("logout-button").addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    renderAdmin();
  });
}

async function bootstrap() {
  renderChart();
  renderTeams();
  setupNavigation();
  setupAuth();
  setupAdmin();
  document.getElementById("refresh-button").addEventListener("click", manualRefresh);
  renderAdmin();

  try {
    const remote = await fetchRemoteData();
    if (remote) {
      state = remote;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderChart();
      renderTeams();
      if (isAdmin()) {
        renderAdmin();
      }
    }
  } catch (error) {
    // hors-ligne ou quota API : on affiche le cache local
  }

  setInterval(refreshFromRemote, POLL_INTERVAL_MS);
}

bootstrap();
