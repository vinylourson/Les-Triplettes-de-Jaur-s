const STORAGE_KEY = "triplettes.tournamentData";
const SESSION_KEY = "triplettes.adminLoggedIn";
const ADMIN_PASSWORD = "petanque-admin";

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

function initData() {
  const fromStorage = localStorage.getItem(STORAGE_KEY);
  if (fromStorage) {
    return JSON.parse(fromStorage);
  }

  const teams = defaultData.teams.map((team) => team.name);
  const warmup = [];
  const roundOf16 = [];
  for (let i = 0; i < teams.length; i += 2) {
    warmup.push(makeMatch(`warmup-${i / 2 + 1}`, teams[i], teams[i + 1]));
    roundOf16.push(makeMatch(`1-8-${i / 2 + 1}`, teams[i], teams[i + 1]));
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

  return { teams: defaultData.teams, warmup, rounds };
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
  bracketContainer.innerHTML = `<div class="rounds-grid">${state.rounds
    .map((round) => `<section class="round"><h3>${round.label}</h3>${round.matches.map(renderMatchCard).join("")}</section>`)
    .join("")}</div>`;
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

  document.getElementById("admin-warmup").innerHTML = state.warmup.map((match) => renderMatchForm(match, "warmup")).join("");

  document.getElementById("admin-bracket").innerHTML = state.rounds
    .map(
      (round) =>
        `<div class="form-card"><h4>${round.label}</h4>${round.matches
          .map((match) => renderMatchForm(match, round.id))
          .join("")}</div>`
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

  return `<form class="result-form" data-section="${section}" data-match-id="${match.id}">
      <p><strong>${match.teamA}</strong> vs <strong>${match.teamB}</strong></p>
      <label>Score ${match.teamA}</label>
      <input type="number" min="0" name="scoreA" value="${match.scoreA}" required />
      <label>Score ${match.teamB}</label>
      <input type="number" min="0" name="scoreB" value="${match.scoreB}" required />
      <label>Vainqueur</label>
      <select name="winner">${winnerOptions}</select>
      <button type="submit">Enregistrer</button>
    </form>`;
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

  document.getElementById("login-button").addEventListener("click", () => {
    const passwordInput = document.getElementById("password");
    if (passwordInput.value === ADMIN_PASSWORD) {
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
  renderAdmin();
  persist();
}

bootstrap();
