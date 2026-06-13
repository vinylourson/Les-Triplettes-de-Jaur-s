const STORAGE_KEY = "triplettes.tournamentData";
const SESSION_KEY = "triplettes.adminToken";
const SCHEMA_VERSION = 2;
const TEAM_COUNT = 12;
const FIELDS = 8; // nombre de terrains
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

const defaultTeams = [
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
  { name: "Le Cercle Bleu", members: ["Yann", "Zoé"] }
];

// Tour de chauffe : 3 matchs, appariements fixés par la position (A..L) des
// équipes — A = teams[0] … L = teams[11].
const WARMUP_ROUNDS = [
  { label: "Match 1", pairs: [[0, 11], [1, 10], [2, 9], [3, 8], [4, 7], [5, 6]] },
  { label: "Match 2", pairs: [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11]] },
  { label: "Match 3", pairs: [[0, 6], [1, 7], [2, 8], [3, 9], [4, 10], [5, 11]] }
];

// Phase finale : structure fixe à 12 équipes, têtes de série issues du
// classement (1er vs 12e, 2e vs 11e…). Le côté droit étant plus court, la
// demi-finale droite accueille un défi ajouté (vainqueur tournoi ado ou
// meilleur perdant des 1/4).
const BRACKET = {
  sources: {
    e1: { a: { seed: 1 }, b: { seed: 12 } },
    e2: { a: { seed: 2 }, b: { seed: 11 } },
    e3: { a: { seed: 3 }, b: { seed: 10 } },
    e4: { a: { seed: 4 }, b: { seed: 9 } },
    e5: { a: { seed: 5 }, b: { seed: 8 } },
    e6: { a: { seed: 6 }, b: { seed: 7 } },
    q1: { a: { win: "e1" }, b: { win: "e2" } },
    q2: { a: { win: "e3" }, b: { win: "e4" } },
    q3: { a: { win: "e5" }, b: { win: "e6" } },
    s1: { a: { win: "q1" }, b: { win: "q2" } },
    s2: { a: { win: "q3" }, b: { extra: true } },
    final: { a: { win: "s1" }, b: { win: "s2" } }
  },
  order: ["e1", "e2", "e3", "e4", "e5", "e6", "q1", "q2", "q3", "s1", "s2", "final"],
  fields: { e1: 1, e2: 2, e3: 3, e4: 4, e5: 5, e6: 6, q1: 1, q2: 2, q3: 3, s1: 1, s2: 2, final: 1 },
  // Colonnes pour l'affichage en éventail (gauche → finale → droite).
  columns: [
    { side: "left", label: "1/8 de finale", ids: ["e1", "e2", "e3", "e4"], pair: true },
    { side: "left", label: "1/4 de finale", ids: ["q1", "q2"], pair: true },
    { side: "left", label: "1/2 finale", ids: ["s1"], feeds: true },
    { side: "final", label: "Finale", ids: ["final"] },
    { side: "right", label: "1/2 finale", ids: ["s2"], feeds: true },
    { side: "right", label: "1/4 de finale", ids: ["q3"] },
    { side: "right", label: "1/8 de finale", ids: ["e5", "e6"], pair: true }
  ],
  // Regroupement par tour pour la saisie au back-office.
  adminRounds: [
    { label: "1/8 de finale", ids: ["e1", "e2", "e3", "e4", "e5", "e6"] },
    { label: "1/4 de finale", ids: ["q1", "q2", "q3"] },
    { label: "1/2 finale", ids: ["s1", "s2"] },
    { label: "Finale", ids: ["final"] }
  ]
};

/* ---------- Construction de l'état ---------- */

function buildWarmup(teamNames) {
  return WARMUP_ROUNDS.map((round, ri) => ({
    id: `wu-${ri + 1}`,
    label: round.label,
    matches: round.pairs.map(([a, b], mi) => ({
      id: `wu${ri + 1}-${mi + 1}`,
      teamA: teamNames[a],
      teamB: teamNames[b],
      scoreA: 0,
      scoreB: 0,
      field: mi + 1
    }))
  }));
}

function createEmptyBracket() {
  const matches = {};
  Object.keys(BRACKET.sources).forEach((id) => {
    matches[id] = { teamA: TBD, teamB: TBD, scoreA: 0, scoreB: 0, winner: "", field: BRACKET.fields[id] };
  });
  return { seeds: Array(TEAM_COUNT).fill(""), extra: "", matches };
}

function buildFreshState(teams) {
  const fresh = {
    version: SCHEMA_VERSION,
    teams,
    warmup: { rounds: [], generatedCount: 0 },
    bracket: createEmptyBracket(),
    seededCount: 0
  };
  if (teams.length === TEAM_COUNT) {
    fresh.warmup.rounds = buildWarmup(teams.map((t) => t.name));
    fresh.warmup.generatedCount = TEAM_COUNT;
    seedBracket(fresh);
    fresh.seededCount = TEAM_COUNT;
  }
  return fresh;
}

// Tolère les anciens formats (bêta) en reconstruisant à partir des équipes.
function normalizeState(raw) {
  if (raw && raw.version === SCHEMA_VERSION && raw.warmup && raw.warmup.rounds && raw.bracket && raw.bracket.matches) {
    return raw;
  }
  const teams =
    raw && Array.isArray(raw.teams) && raw.teams.length && raw.teams[0] && raw.teams[0].name
      ? raw.teams.map((t) => ({ name: t.name, members: Array.isArray(t.members) ? t.members : [] }))
      : defaultTeams.map((t) => ({ name: t.name, members: [...t.members] }));
  return buildFreshState(teams);
}

function loadCachedData() {
  const fromStorage = localStorage.getItem(STORAGE_KEY);
  if (fromStorage) {
    return normalizeState(JSON.parse(fromStorage));
  }
  return buildFreshState(defaultTeams.map((t) => ({ name: t.name, members: [...t.members] })));
}

let state = loadCachedData();

/* ---------- Logique tournoi ---------- */

function matchPlayed(match) {
  return match.scoreA + match.scoreB > 0;
}

function warmupResult(match) {
  if (!matchPlayed(match)) return null;
  if (match.scoreA > match.scoreB) return "A";
  if (match.scoreB > match.scoreA) return "B";
  return "draw";
}

// Classement du tour de chauffe : victoire 2 pts, nul 1 pt, défaite 0 ;
// départage au goal-average (points marqués − points encaissés).
function computeStandings(st) {
  const index = new Map(st.teams.map((t, i) => [t.name, i]));
  const rows = st.teams.map((t, i) => ({
    name: t.name,
    order: i,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    points: 0,
    scored: 0,
    conceded: 0,
    ga: 0
  }));
  st.warmup.rounds.forEach((round) =>
    round.matches.forEach((m) => {
      const res = warmupResult(m);
      if (!res) return;
      const ai = index.get(m.teamA);
      const bi = index.get(m.teamB);
      if (ai === undefined || bi === undefined) return;
      const A = rows[ai];
      const B = rows[bi];
      A.played++;
      B.played++;
      A.scored += m.scoreA;
      A.conceded += m.scoreB;
      B.scored += m.scoreB;
      B.conceded += m.scoreA;
      if (res === "A") {
        A.points += 2;
        A.wins++;
        B.losses++;
      } else if (res === "B") {
        B.points += 2;
        B.wins++;
        A.losses++;
      } else {
        A.points++;
        B.points++;
        A.draws++;
        B.draws++;
      }
    })
  );
  rows.forEach((r) => {
    r.ga = r.scored - r.conceded;
  });
  const sorted = [...rows].sort((x, y) => y.points - x.points || y.ga - x.ga || x.order - y.order);
  sorted.forEach((r, i) => {
    r.rank = i + 1;
  });
  return sorted;
}

function slotName(st, src) {
  if (src.seed) return st.bracket.seeds[src.seed - 1] || TBD;
  if (src.win) return st.bracket.matches[src.win].winner || TBD;
  if (src.extra) return st.bracket.extra || TBD;
  return TBD;
}

// Résout teamA/teamB de chaque match à partir des têtes de série, des
// vainqueurs des tours précédents et du défi ; invalide un vainqueur devenu
// incohérent (la correction se propage de tour en tour).
function resolveBracket(st) {
  BRACKET.order.forEach((id) => {
    const m = st.bracket.matches[id];
    const a = slotName(st, BRACKET.sources[id].a);
    const b = slotName(st, BRACKET.sources[id].b);
    m.teamA = a;
    m.teamB = b;
    if (m.winner && m.winner !== a && m.winner !== b) {
      m.winner = "";
      m.scoreA = 0;
      m.scoreB = 0;
    }
  });
}

function seedBracket(st) {
  if (st.teams.length !== TEAM_COUNT) return;
  const standings = computeStandings(st);
  st.bracket.seeds = standings.map((r) => r.name);
  resolveBracket(st);
}

// Meilleur perdant des 1/4 (au goal-average du classement) — suggestion pour
// le défi de la demi-finale droite.
function bestQuarterLoser(st) {
  const standings = computeStandings(st);
  const rowByName = new Map(standings.map((r) => [r.name, r]));
  const losers = ["q1", "q2", "q3"]
    .map((id) => {
      const m = st.bracket.matches[id];
      if (!m.winner) return null;
      const loser = m.winner === m.teamA ? m.teamB : m.teamA;
      return loser && loser !== TBD ? loser : null;
    })
    .filter(Boolean);
  if (!losers.length) return null;
  losers.sort((x, y) => {
    const rx = rowByName.get(x) || { points: 0, ga: 0 };
    const ry = rowByName.get(y) || { points: 0, ga: 0 };
    return ry.points - rx.points || ry.ga - rx.ga;
  });
  return losers[0];
}

function warmupReady() {
  return state.teams.length === TEAM_COUNT;
}

function warmupGenerated() {
  return state.warmup.rounds.length > 0;
}

function warmupStale() {
  return warmupGenerated() && state.warmup.generatedCount !== state.teams.length;
}

/* ---------- Synchronisation GitHub ---------- */

function getToken() {
  return sessionStorage.getItem(SESSION_KEY) || "";
}

function isAdmin() {
  return Boolean(getToken());
}

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
  return normalizeState(JSON.parse(decodeContent(payload.content)));
}

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
  const put = () => fetch(DATA_API, { method: "PUT", headers: apiHeaders(), body: JSON.stringify(body) });

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

async function refreshFromRemote() {
  if (isAdmin()) {
    return;
  }
  try {
    const remote = await fetchRemoteData({ conditional: true });
    if (remote) {
      state = remote;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderPublic();
    }
  } catch (error) {
    // hors-ligne ou quota API : on garde l'affichage courant
  }
}

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
      renderPublic();
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

function renderPublic() {
  renderWarmupRounds();
  renderStandings();
  renderBracket();
  renderTeams();
}

function renderWarmupRounds() {
  const container = document.getElementById("warmup-rounds");
  if (!warmupGenerated()) {
    container.innerHTML = `<p class="empty-note">Le tour de chauffe n'a pas encore été généré.</p>`;
    return;
  }
  container.innerHTML = state.warmup.rounds
    .map(
      (round) =>
        `<section class="warmup-round"><h3>${round.label}</h3><div class="match-grid">${round.matches
          .map((m) => matchCard(m))
          .join("")}</div></section>`
    )
    .join("");
}

function renderStandings() {
  const container = document.getElementById("standings");
  if (!warmupGenerated()) {
    container.innerHTML = "";
    return;
  }
  const rows = computeStandings(state);
  container.innerHTML = `<table class="standings-table">
      <thead><tr><th>Rang</th><th>Équipe</th><th>J</th><th>Pts</th><th>Goal-average</th></tr></thead>
      <tbody>${rows
        .map(
          (r) =>
            `<tr><td class="rank">${r.rank}</td><td class="team">${r.name}</td><td>${r.played}</td><td class="pts">${r.points}</td><td>${r.ga > 0 ? "+" : ""}${r.ga}</td></tr>`
        )
        .join("")}</tbody>
    </table>`;
}

function renderBracket() {
  const column = (col) => {
    let inner;
    if (col.pair) {
      const blocks = [];
      for (let i = 0; i < col.ids.length; i += 2) {
        blocks.push(`<div class="bracket-pair">${slot(col.ids[i])}${slot(col.ids[i + 1])}</div>`);
      }
      inner = blocks.join("");
    } else {
      inner = col.ids.map(slot).join("");
    }
    const feeds = col.feeds ? " feeds-final" : "";
    return `<section class="bracket-column side-${col.side}${feeds}"><h3>${col.label}</h3><div class="bracket-matches">${inner}</div></section>`;
  };
  function slot(id) {
    return `<div class="match-slot">${matchCard(state.bracket.matches[id], id)}</div>`;
  }
  document.getElementById("bracket-container").innerHTML = `<div class="bracket bracket-12">${BRACKET.columns
    .map(column)
    .join("")}</div>`;
}

function matchCard(match, id) {
  const result = id ? (match.winner ? (match.winner === match.teamA ? "A" : "B") : null) : warmupResult(match);
  const sideClass = (side) => {
    if (result === "draw") return "draw";
    if (!result) return "";
    return result === side ? "winner" : "loser";
  };
  const challenger = id === "s2" ? `<span class="challenger-tag">défi</span>` : "";
  return `<article class="match-card">
    <div class="match-field">Terrain ${match.field}${challenger}</div>
    <div class="${sideClass("A")}">${match.teamA} : ${match.scoreA}</div>
    <div class="${sideClass("B")}">${match.teamB} : ${match.scoreB}</div>
    ${result === "draw" ? `<div class="draw-note">Match nul</div>` : ""}
  </article>`;
}

function renderTeams() {
  document.getElementById("teams-list").innerHTML = state.teams
    .map(
      (team, i) =>
        `<article class="team-card"><h3><span class="team-letter">${String.fromCharCode(65 + i)}</span>${team.name}</h3><ul>${team.members
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
  renderAdminWarmup();
  renderAdminStandings();
  renderAdminBracket();
}

function renderAdminTeams() {
  const rows = state.teams.map((team, index) => renderTeamRow(team, index)).join("");
  const addBlock =
    state.teams.length >= TEAM_COUNT
      ? `<p class="admin-note">Nombre d'équipes complet (${TEAM_COUNT}).</p>`
      : `<form class="team-row team-form--new">
          <input type="text" name="name" aria-label="Nom de la nouvelle équipe" placeholder="Nouvelle équipe" required />
          <input type="text" name="members" aria-label="Joueurs de la nouvelle équipe" placeholder="Joueurs (séparés par des virgules)" />
          <button type="submit">Ajouter</button>
        </form>`;

  const count = state.teams.length;
  const countNote =
    count === TEAM_COUNT
      ? ""
      : `<p class="admin-note">${count} équipe${count > 1 ? "s" : ""} sur ${TEAM_COUNT}. Le format requiert exactement ${TEAM_COUNT} équipes.</p>`;

  document.getElementById("admin-teams").innerHTML = `${countNote}<div class="team-row team-row--head" aria-hidden="true">
      <span>Nom de l'équipe (A → L)</span><span>Joueurs (séparés par des virgules)</span><span></span>
    </div>${rows}${addBlock}`;
}

function renderTeamRow(team, index) {
  return `<div class="team-row" data-index="${index}">
      <input type="text" name="name" value="${team.name}" aria-label="Nom de l'équipe ${index + 1}" required />
      <input type="text" name="members" value="${team.members.join(", ")}" aria-label="Joueurs de l'équipe ${index + 1}" />
      <button type="button" class="team-delete" data-index="${index}" aria-label="Supprimer ${team.name}">Supprimer</button>
    </div>`;
}

function renderAdminWarmup() {
  const container = document.getElementById("admin-warmup");
  const focused = captureAdminFocus();
  const button = document.getElementById("generate-warmup-button");
  button.disabled = !warmupReady();

  let html = "";
  if (!warmupReady()) {
    html = `<p class="admin-note">Renseignez exactement ${TEAM_COUNT} équipes pour générer le tour de chauffe.</p>`;
  } else if (!warmupGenerated()) {
    html = `<p class="admin-note">Cliquez sur « Générer le tour de chauffe » pour créer les 3 matchs.</p>`;
  } else {
    if (warmupStale()) {
      html += `<p class="admin-note">La liste des équipes a changé — régénérez le tour de chauffe.</p>`;
    }
    html += state.warmup.rounds
      .map(
        (round) =>
          `<div class="round-block"><h4>${round.label}</h4><div class="admin-grid">${round.matches
            .map((m) => renderWarmupForm(round.id, m))
            .join("")}</div></div>`
      )
      .join("");
  }
  container.innerHTML = html;
  restoreAdminFocus(focused);
}

function renderWarmupForm(roundId, match) {
  return `<form class="result-form form-card" data-kind="warmup" data-round="${roundId}" data-match-id="${match.id}">
      <p class="match-title"><strong>${match.teamA}</strong> vs <strong>${match.teamB}</strong></p>
      <label class="field-label">Terrain
        <input type="number" min="1" max="${FIELDS}" name="field" value="${match.field}" />
      </label>
      <div class="score-row">
        <label>Score
          <input type="number" min="0" name="scoreA" value="${match.scoreA}" aria-label="Score ${match.teamA}" required />
        </label>
        <label>Score
          <input type="number" min="0" name="scoreB" value="${match.scoreB}" aria-label="Score ${match.teamB}" required />
        </label>
      </div>
      <p class="match-result">${warmupResultText(match)}</p>
    </form>`;
}

function warmupResultText(match) {
  const res = warmupResult(match);
  if (!res) return "Partie non jouée";
  if (res === "draw") return "Match nul";
  return `Victoire ${res === "A" ? match.teamA : match.teamB}`;
}

function renderAdminStandings() {
  const container = document.getElementById("admin-standings");
  const button = document.getElementById("launch-finals-button");
  button.disabled = !warmupReady() || !warmupGenerated();

  if (!warmupGenerated()) {
    container.innerHTML = `<p class="admin-note">Le classement apparaîtra une fois le tour de chauffe généré.</p>`;
    return;
  }
  const rows = computeStandings(state);
  container.innerHTML = `<table class="standings-table">
      <thead><tr><th>Rang</th><th>Équipe</th><th>J</th><th>V</th><th>N</th><th>D</th><th>Pts</th><th>Goal-average</th></tr></thead>
      <tbody>${rows
        .map(
          (r) =>
            `<tr><td class="rank">${r.rank}</td><td class="team">${r.name}</td><td>${r.played}</td><td>${r.wins}</td><td>${r.draws}</td><td>${r.losses}</td><td class="pts">${r.points}</td><td>${r.ga > 0 ? "+" : ""}${r.ga}</td></tr>`
        )
        .join("")}</tbody>
    </table>`;
}

function renderAdminBracket() {
  const container = document.getElementById("admin-bracket");
  const focused = captureAdminFocus();

  if (!state.seededCount) {
    container.innerHTML = `<p class="admin-note">Lancez la phase finale (onglet Classement) pour renseigner le tableau à partir du classement.</p>`;
    restoreAdminFocus(focused);
    return;
  }

  container.innerHTML = BRACKET.adminRounds
    .map(
      (round) =>
        `<div class="round-block"><h4>${round.label}</h4><div class="admin-grid">${round.ids
          .map((id) => renderBracketForm(id, state.bracket.matches[id]))
          .join("")}</div></div>`
    )
    .join("");
  restoreAdminFocus(focused);
}

function renderBracketForm(id, match) {
  const isS2 = id === "s2";
  const winnerOptions = ["", match.teamA, match.teamB]
    .filter((value, i) => i === 0 || (value && value !== TBD))
    .map((name) => `<option value="${name}" ${name === match.winner ? "selected" : ""}>${name || "Aucun"}</option>`)
    .join("");

  let challengerBlock = "";
  if (isS2) {
    const suggestion = bestQuarterLoser(state);
    challengerBlock = `<label>Défi (équipe ajoutée)
        <input type="text" name="extra" value="${state.bracket.extra}" placeholder="Vainqueur tournoi ado / meilleur perdant" aria-label="Équipe défi" />
      </label>
      ${suggestion ? `<button type="button" class="suggest-extra" data-name="${suggestion}">Meilleur perdant : ${suggestion}</button>` : ""}`;
  }

  return `<form class="result-form form-card${isS2 ? " challenger-card" : ""}" data-kind="bracket" data-match-id="${id}">
      <p class="match-title"><strong>${match.teamA}</strong> vs <strong>${match.teamB}</strong></p>
      <label class="field-label">Terrain
        <input type="number" min="1" max="${FIELDS}" name="field" value="${match.field}" />
      </label>
      ${challengerBlock}
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

function captureAdminFocus() {
  const active = document.activeElement;
  const form = active && active.closest ? active.closest(".result-form") : null;
  return form ? { matchId: form.dataset.matchId, field: active.name } : null;
}

function restoreAdminFocus(focused) {
  if (!focused) return;
  const el = document.querySelector(`.result-form[data-match-id="${focused.matchId}"] [name="${focused.field}"]`);
  if (el) {
    el.focus();
  }
}

/* ---------- Actions back-office ---------- */

function setupAdmin() {
  const teamsContainer = document.getElementById("admin-teams");

  teamsContainer.addEventListener("change", (event) => {
    const row = event.target.closest(".team-row[data-index]");
    if (!row) return;
    const team = state.teams[Number(row.dataset.index)];

    if (event.target.name === "name") {
      const name = event.target.value.trim();
      if (!name) {
        event.target.value = team.name;
        return;
      }
      if (name !== team.name) {
        renameTeamEverywhere(team.name, name);
        team.name = name;
        renderPublic();
        renderAdminWarmup();
        renderAdminStandings();
        renderAdminBracket();
      }
    } else {
      team.members = splitMembers(event.target.value);
    }
    persist();
    renderTeams();
  });

  teamsContainer.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    const name = form.elements.name.value.trim();
    if (!name || state.teams.length >= TEAM_COUNT) return;
    state.teams.push({ name, members: splitMembers(form.elements.members.value) });
    persist();
    renderTeams();
    renderAdminTeams();
    renderAdminWarmup();
    renderAdminStandings();
    const nextInput = teamsContainer.querySelector('.team-form--new input[name="name"]');
    if (nextInput) nextInput.focus();
  });

  teamsContainer.addEventListener("click", (event) => {
    const button = event.target.closest(".team-delete");
    if (button) deleteTeam(Number(button.dataset.index));
  });

  document.getElementById("admin-warmup").addEventListener("change", (event) => {
    const form = event.target.closest('.result-form[data-kind="warmup"]');
    if (form && form.checkValidity()) applyWarmupForm(form);
  });

  document.getElementById("admin-bracket").addEventListener("change", (event) => {
    const form = event.target.closest('.result-form[data-kind="bracket"]');
    if (form && form.checkValidity()) applyBracketForm(form, event.target);
  });

  document.getElementById("admin-bracket").addEventListener("click", (event) => {
    const button = event.target.closest(".suggest-extra");
    if (button) {
      state.bracket.extra = button.dataset.name;
      resolveBracket(state);
      persist();
      renderBracket();
      renderAdminBracket();
    }
  });

  document.getElementById("generate-warmup-button").addEventListener("click", generateWarmup);
  document.getElementById("launch-finals-button").addEventListener("click", launchFinals);
}

function splitMembers(value) {
  return value
    .split(",")
    .map((member) => member.trim())
    .filter(Boolean);
}

function applyWarmupForm(form) {
  const round = state.warmup.rounds.find((r) => r.id === form.dataset.round);
  if (!round) return;
  const match = round.matches.find((m) => m.id === form.dataset.matchId);
  if (!match) return;

  match.field = clampField(form.elements.field.value, match.field);
  match.scoreA = Number(form.elements.scoreA.value);
  match.scoreB = Number(form.elements.scoreB.value);

  persist();
  // Mise à jour en place du texte de résultat pour ne pas reconstruire les
  // champs (préserve le focus et la saisie clavier en cours).
  const resultEl = form.querySelector(".match-result");
  if (resultEl) resultEl.textContent = warmupResultText(match);
  renderWarmupRounds();
  renderStandings();
  renderAdminStandings();
}

function applyBracketForm(form, changed) {
  const match = state.bracket.matches[form.dataset.matchId];
  if (!match) return;

  if (changed.name === "extra") {
    state.bracket.extra = changed.value.trim();
    resolveBracket(state);
    persist();
    renderBracket();
    renderAdminBracket();
    return;
  }

  match.field = clampField(form.elements.field.value, match.field);
  match.scoreA = Number(form.elements.scoreA.value);
  match.scoreB = Number(form.elements.scoreB.value);
  const winner = form.elements.winner.value;
  if (winner && winner !== match.teamA && winner !== match.teamB) return;
  match.winner = winner;

  resolveBracket(state);
  persist();
  renderBracket();
  renderAdminBracket();
}

function clampField(raw, fallback) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > FIELDS) return fallback;
  return n;
}

function deleteTeam(index) {
  const team = state.teams[index];
  if (!confirm(`Supprimer l'équipe « ${team.name} » ?`)) return;
  state.teams.splice(index, 1);
  persist();
  renderTeams();
  renderAdminTeams();
  renderAdminWarmup();
  renderAdminStandings();
}

// Renomme une équipe partout : tour de chauffe, têtes de série, matchs du
// tableau, vainqueurs et défi.
function renameTeamEverywhere(oldName, newName) {
  state.warmup.rounds.forEach((round) =>
    round.matches.forEach((m) => {
      if (m.teamA === oldName) m.teamA = newName;
      if (m.teamB === oldName) m.teamB = newName;
    })
  );
  state.bracket.seeds = state.bracket.seeds.map((n) => (n === oldName ? newName : n));
  if (state.bracket.extra === oldName) state.bracket.extra = newName;
  Object.values(state.bracket.matches).forEach((m) => {
    if (m.teamA === oldName) m.teamA = newName;
    if (m.teamB === oldName) m.teamB = newName;
    if (m.winner === oldName) m.winner = newName;
  });
}

function generateWarmup() {
  if (!warmupReady()) return;
  if (warmupGenerated() && !confirm("Régénérer le tour de chauffe ? Les scores du tour de chauffe seront remis à zéro.")) {
    return;
  }
  state.warmup.rounds = buildWarmup(state.teams.map((t) => t.name));
  state.warmup.generatedCount = state.teams.length;
  persist();
  renderWarmupRounds();
  renderStandings();
  renderAdminWarmup();
  renderAdminStandings();
}

function launchFinals() {
  if (!warmupReady() || !warmupGenerated()) return;
  if (!confirm("Lancer la phase finale à partir du classement actuel ? Les scores du tableau final seront remis à zéro.")) {
    return;
  }
  state.bracket = createEmptyBracket();
  seedBracket(state);
  state.seededCount = state.teams.length;
  persist();
  renderBracket();
  renderAdminBracket();
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
      if (view === "admin") renderAdmin();
    });
  });
}

function setupAuth() {
  const feedback = document.getElementById("auth-feedback");

  document.getElementById("auth-container").addEventListener("submit", async (event) => {
    event.preventDefault();
    const tokenInput = document.getElementById("password");
    const token = tokenInput.value.trim();
    if (!token) return;

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

    try {
      const remote = await fetchRemoteData();
      if (remote) {
        state = remote;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        renderPublic();
      }
    } catch (error) {
      // data.json absent ou illisible : le premier enregistrement le publiera
    }
    renderAdmin();
  });

  document.getElementById("logout-button").addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    renderAdmin();
  });
}

async function bootstrap() {
  renderPublic();
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
      renderPublic();
      if (isAdmin()) renderAdmin();
    }
  } catch (error) {
    // hors-ligne ou quota API : on affiche le cache local
  }

  setInterval(refreshFromRemote, POLL_INTERVAL_MS);
}

bootstrap();
