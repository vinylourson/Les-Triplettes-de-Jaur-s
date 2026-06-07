const STORAGE_KEY = "triplettes.tournamentData";
const SESSION_KEY = "triplettes.adminLoggedIn";
const MAX_TEAMS = 16;
const BYE = "Exempt";
const TBD = "À déterminer";
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

function initData() {
  const fromStorage = localStorage.getItem(STORAGE_KEY);
  if (fromStorage) {
    return JSON.parse(fromStorage);
  }

  const schedule = buildSchedule(defaultData.teams.map((team) => team.name));
  return { teams: defaultData.teams, warmup: schedule.warmup, rounds: schedule.rounds, drawCount: defaultData.teams.length };
}

let state = initData();

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function isAdmin() {
  return sessionStorage.getItem(SESSION_KEY) === "true";
}

function drawIsStale() {
  return state.drawCount !== undefined && state.drawCount !== state.teams.length;
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
    announceSave();
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
    announceSave();

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
  announceSave();
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
  announceSave();
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
  announceSave();
}

let saveStatusTimer;
function announceSave() {
  const status = document.getElementById("save-status");
  status.textContent = "✓ Modifications enregistrées";
  clearTimeout(saveStatusTimer);
  saveStatusTimer = setTimeout(() => {
    status.textContent = "";
  }, 2000);
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
  setupAdmin();
  renderAdmin();
  persist();
}

bootstrap();
