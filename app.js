const STORAGE_KEY = "triplettes.tournamentData";
const SESSION_KEY = "triplettes.adminLoggedIn";
// SHA-256 du mot de passe admin. Pour le changer :
// printf '%s' "nouveau-mot-de-passe" | shasum -a 256
const ADMIN_PASSWORD_HASH = "0594adb38afa2a21fa382ef99d5d9807b6e0c6e273280cec87be5a22b3ef8b31";

async function hashPassword(password) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

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
  ],
  warmup: [],
  rounds: []
};

function makeMatch(id, teamA, teamB) {
  return { id, teamA, teamB, scoreA: 0, scoreB: 0, winner: "" };
}

function buildSchedule(teamNames) {
  const warmup = [];
  for (let i = 0; i < teamNames.length; i += 2) {
    warmup.push(makeMatch(`warmup-${i / 2 + 1}`, teamNames[i], teamNames[i + 1] ?? "À déterminer"));
  }

  const roundOf16 = [];
  for (let i = 0; i < 16; i += 2) {
    roundOf16.push(makeMatch(`1-8-${i / 2 + 1}`, teamNames[i] ?? "À déterminer", teamNames[i + 1] ?? "À déterminer"));
  }

  const rounds = [
    { id: "round16", label: "1/8 de finale", matches: roundOf16 },
    {
      id: "quarter",
      label: "1/4 de finale",
      matches: Array.from({ length: 4 }, (_, i) => makeMatch(`1-4-${i + 1}`, "À déterminer", "À déterminer"))
    },
    {
      id: "semi",
      label: "1/2 finale",
      matches: Array.from({ length: 2 }, (_, i) => makeMatch(`1-2-${i + 1}`, "À déterminer", "À déterminer"))
    },
    { id: "final", label: "Finale", matches: [makeMatch("final-1", "À déterminer", "À déterminer")] }
  ];

  return { warmup, rounds };
}

function initData() {
  const fromStorage = localStorage.getItem(STORAGE_KEY);
  if (fromStorage) {
    return JSON.parse(fromStorage);
  }

  const schedule = buildSchedule(defaultData.teams.map((team) => team.name));
  return { teams: defaultData.teams, warmup: schedule.warmup, rounds: schedule.rounds };
}

let state = initData();

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function isAdmin() {
  return sessionStorage.getItem(SESSION_KEY) === "true";
}

function renderChart() {
  const warmupContainer = document.getElementById("warmup-list");
  warmupContainer.innerHTML = state.warmup.map(renderMatchCard).join("");

  const bracketContainer = document.getElementById("bracket-container");
  bracketContainer.innerHTML = renderBracket();
}

function renderBracket() {
  const [round16, quarter, semi, final] = state.rounds;
  const half = (matches) => [matches.slice(0, matches.length / 2), matches.slice(matches.length / 2)];
  const [r16Left, r16Right] = half(round16.matches);
  const [qfLeft, qfRight] = half(quarter.matches);
  const [sfLeft, sfRight] = half(semi.matches);

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

  return `<div class="bracket">
    ${column(round16.label, pairs(r16Left), "side-left")}
    ${column(quarter.label, pairs(qfLeft), "side-left")}
    ${column(semi.label, slot(sfLeft[0]), "side-left feeds-final")}
    ${column(final.label, slot(final.matches[0]), "final-column")}
    ${column(semi.label, slot(sfRight[0]), "side-right feeds-final")}
    ${column(quarter.label, pairs(qfRight), "side-right")}
    ${column(round16.label, pairs(r16Right), "side-right")}
  </div>`;
}

function renderMatchCard(match) {
  return `<article class="match-card">
    <div class="${match.winner === match.teamA ? "winner" : ""}">${match.teamA} : ${match.scoreA}</div>
    <div class="${match.winner === match.teamB ? "winner" : ""}">${match.teamB} : ${match.scoreB}</div>
  </article>`;
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

  document.getElementById("admin-teams").innerHTML = `${state.teams
    .map((team, index) => renderTeamForm(team, index))
    .join("")}${renderTeamForm(null, "new")}`;

  document.querySelectorAll(".team-form").forEach((form) => {
    form.addEventListener("submit", saveTeam);
  });
  document.querySelectorAll(".team-delete").forEach((button) => {
    button.addEventListener("click", deleteTeam);
  });

  document.getElementById("admin-warmup").innerHTML = state.warmup.map((match) => renderMatchForm(match, "warmup")).join("");

  document.getElementById("admin-bracket").innerHTML = state.rounds
    .map(
      (round) =>
        `<div class="round-block"><h4>${round.label}</h4><div class="admin-grid">${round.matches
          .map((match) => renderMatchForm(match, round.id))
          .join("")}</div></div>`
    )
    .join("");

  document.querySelectorAll(".result-form").forEach((form) => {
    form.addEventListener("submit", updateMatch);
  });
}

function renderMatchForm(match, section) {
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
      <button type="submit">Enregistrer</button>
    </form>`;
}

function renderTeamForm(team, index) {
  const isNew = index === "new";
  return `<form class="team-form form-card${isNew ? " team-form--new" : ""}" data-index="${index}">
      ${isNew ? "<h4>Ajouter une équipe</h4>" : ""}
      <label>Nom de l'équipe
        <input type="text" name="name" value="${team ? team.name : ""}" required />
      </label>
      <label>Joueurs (séparés par des virgules)
        <input type="text" name="members" value="${team ? team.members.join(", ") : ""}" required />
      </label>
      <div class="form-actions">
        <button type="submit">${isNew ? "Ajouter" : "Enregistrer"}</button>
        ${isNew ? "" : `<button type="button" class="team-delete" data-index="${index}">Supprimer</button>`}
      </div>
    </form>`;
}

function saveTeam(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.elements.name.value.trim();
  const members = form.elements.members.value
    .split(",")
    .map((member) => member.trim())
    .filter(Boolean);

  if (!name) {
    return;
  }

  const index = form.dataset.index;
  if (index === "new") {
    state.teams.push({ name, members });
  } else {
    const team = state.teams[Number(index)];
    if (team.name !== name) {
      renameTeamInMatches(team.name, name);
    }
    team.name = name;
    team.members = members;
  }

  persist();
  renderTeams();
  renderChart();
  renderAdmin();
}

function deleteTeam(event) {
  const index = Number(event.currentTarget.dataset.index);
  const team = state.teams[index];
  if (!confirm(`Supprimer l'équipe « ${team.name} » ?`)) {
    return;
  }

  state.teams.splice(index, 1);
  renameTeamInMatches(team.name, "À déterminer");

  persist();
  renderTeams();
  renderChart();
  renderAdmin();
}

function renameTeamInMatches(oldName, newName) {
  const allMatches = [...state.warmup, ...state.rounds.flatMap((round) => round.matches)];
  allMatches.forEach((match) => {
    if (match.teamA === oldName) match.teamA = newName;
    if (match.teamB === oldName) match.teamB = newName;
    if (match.winner === oldName) match.winner = newName;
  });
}

function rebuildSchedule() {
  if (!confirm("Régénérer le tableau à partir des équipes actuelles ? Tous les scores seront remis à zéro.")) {
    return;
  }

  const schedule = buildSchedule(state.teams.map((team) => team.name));
  state.warmup = schedule.warmup;
  state.rounds = schedule.rounds;

  persist();
  renderChart();
  renderAdmin();
}

function updateMatch(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const section = form.dataset.section;
  const matchId = form.dataset.matchId;

  const scoreA = Number(form.elements.scoreA.value);
  const scoreB = Number(form.elements.scoreB.value);
  const winner = form.elements.winner.value;

  const matches = section === "warmup" ? state.warmup : state.rounds.find((round) => round.id === section).matches;
  const match = matches.find((item) => item.id === matchId);

  if (!match) {
    return;
  }

  if (winner && winner !== match.teamA && winner !== match.teamB) {
    return;
  }

  match.scoreA = scoreA;
  match.scoreB = scoreB;
  match.winner = winner;

  persist();
  renderChart();
  renderAdmin();
}

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

  document.getElementById("login-button").addEventListener("click", async () => {
    const passwordInput = document.getElementById("password");
    if ((await hashPassword(passwordInput.value)) === ADMIN_PASSWORD_HASH) {
      sessionStorage.setItem(SESSION_KEY, "true");
      passwordInput.value = "";
      feedback.textContent = "";
      renderAdmin();
      return;
    }
    feedback.textContent = "Mot de passe incorrect.";
  });

  document.getElementById("logout-button").addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    renderAdmin();
  });
}

function bootstrap() {
  renderChart();
  renderTeams();
  setupNavigation();
  setupAuth();
  document.getElementById("rebuild-schedule-button").addEventListener("click", rebuildSchedule);
  renderAdmin();
  persist();
}

bootstrap();
