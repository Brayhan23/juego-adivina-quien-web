const urlParams = new URLSearchParams(window.location.search);
const invitationRoom = (urlParams.get("room") || "").trim().toUpperCase();
const socket = io({
  query: {
    room: invitationRoom,
  },
});

const elements = {
  body: document.body,
  gameShell: document.querySelector(".game-shell"),
  connectionStatus: document.querySelector("#connection-status"),
  matchStatus: document.querySelector("#match-status"),
  turnStatus: document.querySelector("#turn-status"),
  serverMessage: document.querySelector("#server-message"),
  rulesButton: document.querySelector("#rules-button"),
  leaveGameButton: document.querySelector("#leave-game-button"),
  mainMenu: document.querySelector("#main-menu"),
  joinPublicButton: document.querySelector("#join-public-button"),
  choosePrivateButton: document.querySelector("#choose-private-button"),
  publicWaitingPanel: document.querySelector("#public-waiting-panel"),
  cancelPublicButton: document.querySelector("#cancel-public-button"),
  qrPanel: document.querySelector("#qr-panel"),
  createQrRoomButton: document.querySelector("#create-qr-room-button"),
  copyInviteButton: document.querySelector("#copy-invite-button"),
  cancelPrivateButton: document.querySelector("#cancel-private-button"),
  qrInviteCard: document.querySelector("#qr-invite-card"),
  qrCode: document.querySelector("#qr-code"),
  privateRoomCode: document.querySelector("#private-room-code"),
  privateRoomUrl: document.querySelector("#private-room-url"),
  gameLayout: document.querySelector("#game-layout"),
  secretCard: document.querySelector("#secret-card"),
  secretAvatar: document.querySelector("#secret-avatar"),
  secretName: document.querySelector("#secret-name"),
  secretTraits: document.querySelector("#secret-traits"),
  board: document.querySelector("#characters-board"),
  questionForm: document.querySelector("#question-form"),
  questionAttribute: document.querySelector("#question-attribute"),
  questionValue: document.querySelector("#question-value"),
  askButton: document.querySelector("#ask-button"),
  guessForm: document.querySelector("#guess-form"),
  guessButton: document.querySelector("#guess-button"),
  selectedCharacterName: document.querySelector("#selected-character-name"),
  selectedCharacterId: document.querySelector("#selected-character-id"),
  requestStateButton: document.querySelector("#request-state-button"),
  historyList: document.querySelector("#history-list"),
  characterTemplate: document.querySelector("#character-card-template"),
  historyTemplate: document.querySelector("#history-item-template"),
  modal: document.querySelector("#game-over-modal"),
  modalKicker: document.querySelector("#game-over-kicker"),
  modalTitle: document.querySelector("#game-over-title"),
  modalMessage: document.querySelector("#game-over-message"),
  playAgainButton: document.querySelector("#play-again-button"),
  guessConfirmModal: document.querySelector("#guess-confirm-modal"),
  guessConfirmMessage: document.querySelector("#guess-confirm-message"),
  confirmGuessButton: document.querySelector("#confirm-guess-button"),
  cancelGuessButton: document.querySelector("#cancel-guess-button"),
  rulesModal: document.querySelector("#rules-modal"),
  closeRulesButton: document.querySelector("#close-rules-button"),
};

const ATTRIBUTE_LABELS = {
  genero: "Genero",
  gafas: "Gafas",
  sombrero: "Sombrero",
  barba: "Barba",
  bigote: "Bigote",
  cabello_largo: "Cabello largo",
  color_cabello: "Color de cabello",
  accesorio: "Accesorio",
};

const QUESTION_VALUES = {
  genero: [
    ["masculino", "Masculino"],
    ["femenino", "Femenino"],
  ],
  gafas: [
    ["true", "Si"],
    ["false", "No"],
  ],
  sombrero: [
    ["true", "Si"],
    ["false", "No"],
  ],
  barba: [
    ["true", "Si"],
    ["false", "No"],
  ],
  bigote: [
    ["true", "Si"],
    ["false", "No"],
  ],
  cabello_largo: [
    ["true", "Si"],
    ["false", "No"],
  ],
  color_cabello: [
    ["negro", "Negro"],
    ["castano", "Castano"],
    ["rubio", "Rubio"],
    ["rojo", "Rojo"],
    ["gris", "Gris"],
  ],
  accesorio: [
    ["aretes", "Aretes"],
    ["bufanda", "Bufanda"],
    ["collar", "Collar"],
    ["corbata", "Corbata"],
  ],
};

const uiState = {
  selectedCharacterId: null,
  selectedCharacterName: "Ninguno",
  playerNumber: null,
  lastTurnOwner: null,
  lastHistoryLength: 0,
  latestStatus: "waiting",
  isYourTurn: false,
  boardIds: new Set(),
  coveredCharacterIds: new Set(),
  currentGameId: null,
  currentBoard: [],
  boardSortedByCovered: false,
  invitationUrl: "",
  matchmakingPending: false,
  canGuess: false,
  pendingGuessCharacterId: null,
  hasSentLeaveRequest: false,
};

function animateElement(element, animationClass) {
  if (!element) {
    return;
  }

  element.classList.remove(animationClass);
  void element.offsetWidth;
  element.classList.add(animationClass);
}

function showToast(message, type = "info") {
  elements.serverMessage.textContent = message;
  elements.serverMessage.classList.remove("info", "success", "error", "warning", "positive", "negative");
  elements.serverMessage.classList.add(type);
  animateElement(elements.serverMessage, type === "error" ? "shake" : "glow");
}

function updateLeaveButtonState() {
  const canLeave = ["waiting", "private_waiting", "active"].includes(uiState.latestStatus);
  elements.leaveGameButton.disabled = !canLeave || uiState.hasSentLeaveRequest;
}

function setModeButtonsDisabled(disabled) {
  elements.joinPublicButton.disabled = disabled;
  elements.choosePrivateButton.disabled = disabled;
  elements.createQrRoomButton.disabled = disabled;
}

function resetPrivateInviteView() {
  uiState.invitationUrl = "";
  elements.privateRoomCode.textContent = "------";
  elements.privateRoomUrl.href = "#";
  elements.privateRoomUrl.textContent = "Esperando enlace";
  elements.qrInviteCard.hidden = true;
  elements.copyInviteButton.disabled = true;
  elements.qrCode.replaceChildren();
}

function showMainMenu() {
  uiState.matchmakingPending = false;
  uiState.isYourTurn = false;
  uiState.hasSentLeaveRequest = false;
  updateMatchStatus("menu");
  setModeButtonsDisabled(false);
  elements.copyInviteButton.disabled = true;
  elements.cancelPublicButton.disabled = false;
  elements.cancelPrivateButton.disabled = false;
  elements.createQrRoomButton.textContent = "Crear partida por QR";
  elements.mainMenu.classList.remove("is-hidden");
  elements.publicWaitingPanel.classList.add("is-hidden");
  elements.qrPanel.classList.add("is-hidden");
  elements.gameLayout.classList.add("is-hidden");
  resetPrivateInviteView();
}

function showWaitingPublic() {
  uiState.matchmakingPending = true;
  uiState.hasSentLeaveRequest = false;
  updateMatchStatus("waiting");
  elements.mainMenu.classList.add("is-hidden");
  elements.publicWaitingPanel.classList.remove("is-hidden");
  elements.qrPanel.classList.add("is-hidden");
  elements.gameLayout.classList.add("is-hidden");
  elements.cancelPublicButton.disabled = false;
  setModeButtonsDisabled(true);
  animateElement(elements.publicWaitingPanel, "slide-up");
}

function showPrivateRoomPanel(joining = false) {
  uiState.matchmakingPending = true;
  uiState.hasSentLeaveRequest = false;
  updateMatchStatus("private_waiting");
  elements.mainMenu.classList.add("is-hidden");
  elements.publicWaitingPanel.classList.add("is-hidden");
  elements.qrPanel.classList.remove("is-hidden");
  elements.gameLayout.classList.add("is-hidden");
  elements.createQrRoomButton.disabled = true;
  elements.createQrRoomButton.textContent = joining ? "Uniendote..." : "Esperando invitado...";
  elements.cancelPrivateButton.disabled = joining;
  animateElement(elements.qrPanel, "slide-up");
}

function showGameScreen() {
  uiState.matchmakingPending = false;
  uiState.hasSentLeaveRequest = false;
  elements.mainMenu.classList.add("is-hidden");
  elements.publicWaitingPanel.classList.add("is-hidden");
  elements.qrPanel.classList.add("is-hidden");
  elements.gameLayout.classList.remove("is-hidden");
  setModeButtonsDisabled(true);
}

function joinPublicGame() {
  if (uiState.latestStatus === "active") {
    showToast("Ya estas en una partida activa.", "error");
    return;
  }

  showWaitingPublic();
  socket.emit("join_public_queue");
  showToast("Buscando rival para partida publica...", "info");
}

function createPrivateGame() {
  if (uiState.latestStatus === "active") {
    showToast("No puedes crear una sala QR porque ya estas en una partida.", "error");
    return;
  }

  resetPrivateInviteView();
  showPrivateRoomPanel(false);
  socket.emit("create_private_room");
  showToast("Creando sala privada por QR...", "info");
}

function cancelMatchmaking() {
  if (uiState.latestStatus === "active") {
    showToast("No puedes volver al menu durante una partida activa.", "error");
    return;
  }

  elements.cancelPublicButton.disabled = true;
  elements.cancelPrivateButton.disabled = true;
  socket.emit("cancel_matchmaking");
  showToast("Cancelando emparejamiento...", "info");
}

function showQrInvite(roomCode, invitationUrl) {
  uiState.invitationUrl = invitationUrl;
  elements.privateRoomCode.textContent = roomCode;
  elements.privateRoomUrl.href = invitationUrl;
  elements.privateRoomUrl.textContent = invitationUrl;
  elements.qrInviteCard.hidden = false;
  elements.copyInviteButton.disabled = false;
  elements.qrCode.replaceChildren();

  if (window.QRCode) {
    new QRCode(elements.qrCode, {
      text: invitationUrl,
      width: 168,
      height: 168,
      colorDark: "#123C7C",
      colorLight: "#FFFFFF",
      correctLevel: QRCode.CorrectLevel.H,
    });
  } else {
    const fallback = document.createElement("p");
    fallback.className = "qr-fallback";
    fallback.textContent = "QR no disponible. Comparte el enlace de invitacion.";
    elements.qrCode.appendChild(fallback);
  }

  animateElement(elements.qrPanel, "glow");
}

async function copyInvitationLink() {
  if (!uiState.invitationUrl) {
    showToast("Todavia no hay enlace para copiar.", "error");
    return;
  }

  try {
    await navigator.clipboard.writeText(uiState.invitationUrl);
    showToast("Enlace de invitacion copiado.", "success");
  } catch (error) {
    showToast("No se pudo copiar automaticamente. Selecciona y copia el enlace.", "error");
  }
}

function applyPlayerTheme(playerNumber) {
  if (!playerNumber || uiState.playerNumber === playerNumber) {
    return;
  }

  uiState.playerNumber = playerNumber;
  elements.body.classList.toggle("player-one", playerNumber === 1);
  elements.body.classList.toggle("player-two", playerNumber === 2);
  showToast(`Eres el Jugador ${playerNumber}.`, "info");
}

function formatBoolean(value) {
  return value ? "Si" : "No";
}

function formatTraitValue(value) {
  if (typeof value === "boolean") {
    return formatBoolean(value);
  }

  return String(value || "Ninguno");
}

function createTag(text, extraClass = "") {
  const tag = document.createElement("span");
  tag.className = `tag ${extraClass}`.trim();
  tag.textContent = text;
  return tag;
}

function renderCharacterPortrait(container, character, extraImageClass = "") {
  container.replaceChildren();
  container.classList.remove("image-loaded", "image-fallback");

  const fallback = document.createElement("span");
  fallback.className = "avatar-fallback";
  fallback.textContent = character.avatar || "?";

  if (!character.imagen) {
    container.classList.add("image-fallback");
    container.appendChild(fallback);
    return;
  }

  const image = document.createElement("img");
  image.className = `character-image ${extraImageClass}`.trim();
  image.src = character.imagen;
  image.alt = `Retrato de ${character.nombre}`;
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("load", () => {
    container.classList.add("image-loaded");
  });
  image.addEventListener("error", () => {
    container.classList.remove("image-loaded");
    container.classList.add("image-fallback");
    container.replaceChildren(fallback);
  });

  container.appendChild(image);
}

function clearSelectedCharacter() {
  uiState.selectedCharacterId = null;
  uiState.selectedCharacterName = "Ninguno";
  elements.selectedCharacterId.value = "";
  elements.selectedCharacterName.textContent = "Ninguno";

  document.querySelectorAll(".character-card").forEach((card) => {
    card.classList.remove("selected", "card-selected", "opponent-target");
  });
}

function getQuestionValue() {
  const value = elements.questionValue.value;

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return value;
}

function updateQuestionValues() {
  const attribute = elements.questionAttribute.value;
  const values = QUESTION_VALUES[attribute] || [];

  elements.questionValue.replaceChildren();
  values.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    elements.questionValue.appendChild(option);
  });
}

function getVisualBoard(board = uiState.currentBoard) {
  const visualBoard = [...board];

  if (!uiState.boardSortedByCovered) {
    return visualBoard;
  }

  return visualBoard.sort((left, right) => {
    const leftCovered = uiState.coveredCharacterIds.has(Number(left.id));
    const rightCovered = uiState.coveredCharacterIds.has(Number(right.id));

    if (leftCovered === rightCovered) {
      return 0;
    }

    return leftCovered ? 1 : -1;
  });
}

function renderBoard(board = []) {
  elements.board.replaceChildren();
  uiState.boardIds = new Set(board.map((character) => Number(character.id)));

  if (uiState.selectedCharacterId && !uiState.boardIds.has(Number(uiState.selectedCharacterId))) {
    clearSelectedCharacter();
  }

  if (!board.length) {
    const emptyCard = document.createElement("button");
    emptyCard.className = "character-card disabled";
    emptyCard.type = "button";
    emptyCard.disabled = true;
    emptyCard.textContent = "Esperando tablero";
    elements.board.appendChild(emptyCard);
    return;
  }

  getVisualBoard(board).forEach((character) => {
    const fragment = elements.characterTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".character-card");
    const avatar = fragment.querySelector(".character-avatar");
    const name = fragment.querySelector(".character-name");

    card.dataset.characterId = character.id;
    card.dataset.characterName = character.nombre;
    card.title = "Clic para tapar/destapar";
    card.setAttribute("aria-label", `${character.nombre}. Clic para tapar o destapar.`);
    renderCharacterPortrait(avatar, character);
    name.textContent = character.nombre;

    const isCovered = uiState.coveredCharacterIds.has(Number(character.id));

    if (isCovered) {
      card.classList.add("covered", "card-covered");
      card.setAttribute("aria-pressed", "true");
    } else {
      card.setAttribute("aria-pressed", "false");
    }

    if (!isCovered && Number(uiState.selectedCharacterId) === Number(character.id)) {
      card.classList.add("selected", "card-selected", "opponent-target");
    }

    const badge = document.createElement("span");
    badge.className = "discarded-badge";
    badge.textContent = "Descartado";

    const hint = document.createElement("span");
    hint.className = "cover-hint";
    hint.textContent = isCovered ? "Clic para destapar" : "Clic para tapar";

    const actions = document.createElement("span");
    actions.className = "card-actions";

    const selectButton = document.createElement("button");
    selectButton.className = "guess-select-button";
    selectButton.type = "button";
    selectButton.textContent = "Elegir";
    selectButton.disabled = isCovered;
    selectButton.title = isCovered
      ? "Destapa este personaje antes de seleccionarlo"
      : "Seleccionar para adivinar";
    selectButton.addEventListener("click", (event) => {
      event.stopPropagation();
      handleCharacterSelection(character, card);
    });

    actions.appendChild(selectButton);
    card.append(badge, hint, actions);

    card.addEventListener("click", () => toggleCharacterCovered(character, card));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleCharacterCovered(character, card);
      }
    });
    elements.board.appendChild(fragment);
  });
}

function sortBoardByCovered() {
  if (!uiState.currentBoard.length) {
    showToast("Todavia no hay tablero para ordenar.", "error");
    return;
  }

  if (!uiState.coveredCharacterIds.size) {
    showToast("No hay personajes descartados para ordenar.", "info");
    animateElement(elements.board, "glow");
    return;
  }

  uiState.boardSortedByCovered = true;
  renderBoard(uiState.currentBoard);
  animateElement(elements.board, "board-reorder");
  showToast("Tablero ordenado: los descartados quedaron al final.", "success");
}

function renderSecretCharacter(character) {
  if (!character) {
    return;
  }

  renderCharacterPortrait(elements.secretAvatar, character, "secret-character-image");
  elements.secretName.textContent = character.nombre;
  elements.secretTraits.replaceChildren(
    createTrait("Genero", character.genero),
    createTrait("Gafas", formatBoolean(character.gafas)),
    createTrait("Sombrero", formatBoolean(character.sombrero)),
    createTrait("Barba", formatBoolean(character.barba)),
    createTrait("Bigote", formatBoolean(character.bigote)),
    createTrait("Cabello largo", formatBoolean(character.cabello_largo)),
    createTrait("Cabello", character.color_cabello),
    createTrait("Accesorio", character.accesorio)
  );

  animateElement(elements.secretCard, "glow");
}

function createTrait(label, value) {
  const item = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");

  term.textContent = label;
  description.textContent = value;
  item.append(term, description);
  return item;
}

function renderHistory(history = []) {
  elements.historyList.replaceChildren();

  if (!history.length) {
    elements.historyList.appendChild(createHistoryItem("Sistema", "La partida acaba de comenzar.", "info"));
    return;
  }

  history.forEach((action, index) => {
    const item = historyItemFromAction(action);
    elements.historyList.appendChild(item);

    if (index >= uiState.lastHistoryLength) {
      animateElement(item, "slide-up");
    }
  });

  uiState.lastHistoryLength = history.length;
}

function createHistoryItem(title, text, type = "info") {
  const fragment = elements.historyTemplate.content.cloneNode(true);
  const item = fragment.querySelector(".history-item");

  item.classList.add(type);
  item.querySelector(".history-title").textContent = title;
  item.querySelector(".history-text").textContent = text;
  return item;
}

function historyItemFromAction(action) {
  const actorLabel = action.actor_label || "Sistema";

  if (action.type === "question") {
    const label = ATTRIBUTE_LABELS[action.attribute] || action.attribute;
    const answer = action.answer ? "SI" : "NO";
    const type = action.answer ? "positive" : "negative";
    const item = createHistoryItem(
      `${actorLabel}: pregunta`,
      `${label}: ${formatTraitValue(action.value)}. Respuesta: ${answer}.`,
      type
    );
    item.classList.add(action.actor_scope || "self");
    return item;
  }

  if (action.type === "guess") {
    const characterName = action.character_name || `personaje ${action.character_id}`;
    const resultText = action.answer
      ? `${actorLabel} intento adivinar a ${characterName} y acerto. Gana la partida.`
      : `${actorLabel} intento adivinar a ${characterName} y fallo. Pierde la partida.`;

    const item = createHistoryItem(
      "Adivinanza",
      resultText,
      action.answer ? "victory" : "defeat"
    );
    item.classList.add(action.actor_scope || "system");
    return item;
  }

  if (action.type === "leave") {
    const message = action.actor_scope === "self"
      ? "Abandonaste la partida. El rival gana por abandono."
      : "El rival abandono la partida. Ganaste por abandono.";
    const item = createHistoryItem("Abandono", message, action.actor_scope === "self" ? "defeat" : "victory");
    item.classList.add(action.actor_scope || "system");
    return item;
  }

  if (action.type === "disconnect") {
    const message = action.actor_scope === "rival"
      ? "El rival abandono la partida. Ganaste por abandono."
      : action.message;
    const item = createHistoryItem("Sistema", message, "warning");
    item.classList.add("system");
    return item;
  }

  const item = createHistoryItem("Sistema", "Accion registrada por el servidor.", "info");
  item.classList.add("system");
  return item;
}

function updateTurnIndicator(state) {
  const isYourTurn = Boolean(state.is_your_turn);
  const finished = state.status === "finished";
  uiState.isYourTurn = isYourTurn && !finished;
  uiState.canGuess = Boolean(state.can_guess) && !finished;

  elements.turnStatus.textContent = finished
    ? "Partida terminada"
    : isYourTurn
      ? "Tu turno"
      : "Turno del rival";

  elements.turnStatus.classList.toggle("turn-active", isYourTurn && !finished);
  elements.turnStatus.classList.toggle("turn-waiting", !isYourTurn || finished);
  elements.gameShell.classList.toggle("turn-active", isYourTurn && !finished);
  elements.gameShell.classList.toggle("turn-waiting", !isYourTurn || finished);

  if (uiState.lastTurnOwner !== state.current_turn_player_number) {
    animateElement(elements.turnStatus, isYourTurn ? "pulse" : "glow");
    uiState.lastTurnOwner = state.current_turn_player_number;
  }

  elements.askButton.disabled = !isYourTurn || finished;
  elements.guessButton.disabled = !isYourTurn || finished || !uiState.canGuess;
}

function updateMatchStatus(status) {
  uiState.latestStatus = status;

  const labels = {
    menu: "Elige modo",
    waiting: "Esperando rival",
    private_waiting: "Esperando invitado QR",
    active: "Partida activa",
    finished: "Partida terminada",
  };

  elements.matchStatus.textContent = labels[status] || "Esperando rival";
  elements.matchStatus.classList.toggle("turn-active", status === "active");
  elements.matchStatus.classList.toggle("turn-waiting", status !== "active");
  updateLeaveButtonState();
}

function updateFromState(state) {
  const statusChanged = uiState.latestStatus !== state.status;

  if (uiState.currentGameId !== state.game_id) {
    uiState.currentGameId = state.game_id;
    uiState.coveredCharacterIds.clear();
    uiState.boardSortedByCovered = false;
    clearSelectedCharacter();
  }
  uiState.currentBoard = state.board || [];

  showGameScreen();
  applyPlayerTheme(state.player_number);
  updateMatchStatus(state.status);
  updateTurnIndicator(state);
  renderSecretCharacter(state.your_secret_character);
  renderBoard(state.board);
  renderHistory(state.history);

  if (state.status === "active" && statusChanged) {
    showToast(state.is_your_turn ? "Es tu turno." : "Espera la jugada del rival.", "info");
  }

  if (state.status === "finished") {
    showEndGameModal(state);
  }
}

function getEndGameMessage(state) {
  const latestGuess = [...(state.history || [])].reverse().find((action) => action.type === "guess");
  const latestLeave = [...(state.history || [])].reverse().find((action) => (
    action.type === "leave" || action.type === "disconnect"
  ));

  if (latestLeave) {
    if (state.you_won && latestLeave.actor_scope === "rival") {
      return "El rival abandono la partida. Ganaste por abandono.";
    }

    if (!state.you_won && latestLeave.actor_scope === "self") {
      return "Abandonaste la partida.";
    }

    return state.you_won ? "Ganaste por abandono." : "La partida termino por abandono.";
  }

  if (!latestGuess) {
    return state.you_won
      ? "Ganaste la partida."
      : "La partida termino.";
  }

  const ownGuess = latestGuess.player_number === state.player_number;

  if (state.you_won && ownGuess && latestGuess.answer) {
    return "Adivinaste el personaje secreto del rival.";
  }

  if (state.you_won && !ownGuess && !latestGuess.answer) {
    return "El rival fallo su unica oportunidad para adivinar.";
  }

  if (!state.you_won && ownGuess && !latestGuess.answer) {
    return "Fallaste tu unica oportunidad para adivinar.";
  }

  return "El rival adivino tu personaje secreto.";
}

function showEndGameModal(state) {
  const playerWon = Boolean(state.you_won);

  elements.modal.setAttribute("aria-hidden", "false");
  elements.modal.classList.add("visible");
  elements.modal.classList.toggle("victory", playerWon);
  elements.modal.classList.toggle("defeat", !playerWon);
  elements.modalKicker.textContent = playerWon ? "Victoria" : "Derrota";
  elements.modalTitle.textContent = playerWon ? "Ganaste la partida" : "Perdiste la partida";
  elements.modalMessage.textContent = getEndGameMessage(state);
  animateElement(elements.modal.querySelector(".game-over-card"), playerWon ? "bounce" : "shake");
}

function hideEndGameModal() {
  elements.modal.setAttribute("aria-hidden", "true");
  elements.modal.classList.remove("visible", "victory", "defeat");
}

function showRulesModal() {
  elements.rulesModal.setAttribute("aria-hidden", "false");
  elements.rulesModal.classList.add("visible");
  animateElement(elements.rulesModal.querySelector(".rules-card"), "slide-up");
}

function hideRulesModal() {
  elements.rulesModal.setAttribute("aria-hidden", "true");
  elements.rulesModal.classList.remove("visible");
}

function showGuessConfirmModal() {
  const characterName = uiState.selectedCharacterName || "el personaje seleccionado";

  uiState.pendingGuessCharacterId = uiState.selectedCharacterId;
  elements.guessConfirmMessage.textContent =
    `Vas a intentar adivinar a ${characterName}. Recuerda que solo tienes 1 oportunidad para adivinar. Si fallas, pierdes automaticamente. Estas seguro de continuar?`;
  elements.guessConfirmModal.setAttribute("aria-hidden", "false");
  elements.guessConfirmModal.classList.add("visible");
  animateElement(elements.guessConfirmModal.querySelector(".guess-confirm-card"), "bounce");
}

function hideGuessConfirmModal() {
  uiState.pendingGuessCharacterId = null;
  elements.guessConfirmModal.setAttribute("aria-hidden", "true");
  elements.guessConfirmModal.classList.remove("visible");
}

function confirmGuess() {
  if (!uiState.pendingGuessCharacterId) {
    hideGuessConfirmModal();
    return;
  }

  socket.emit("guess_character", {
    character_id: uiState.pendingGuessCharacterId,
  });
  elements.confirmGuessButton.disabled = true;
  hideGuessConfirmModal();
}

function leaveCurrentGame() {
  if (!["waiting", "private_waiting", "active"].includes(uiState.latestStatus)) {
    showToast("No hay una partida o espera activa para abandonar.", "info");
    return;
  }

  const message = uiState.latestStatus === "active"
    ? "Si abandonas ahora, perderas la partida y el rival ganara por abandono. Deseas continuar?"
    : "Deseas salir de la espera y volver al menu principal?";

  if (!window.confirm(message)) {
    return;
  }

  uiState.hasSentLeaveRequest = true;
  updateLeaveButtonState();
  socket.emit("leave_game");
  showToast("Procesando abandono en el servidor...", "warning");
}

function handleCharacterSelection(character, selectedCard) {
  if (uiState.coveredCharacterIds.has(Number(character.id))) {
    showToast("Destapa este personaje antes de seleccionarlo para adivinar.", "error");
    return;
  }

  uiState.selectedCharacterId = character.id;
  uiState.selectedCharacterName = character.nombre;
  elements.selectedCharacterId.value = character.id;
  elements.selectedCharacterName.textContent = character.nombre;

  document.querySelectorAll(".character-card").forEach((card) => {
    card.classList.remove("selected", "card-selected", "opponent-target");
  });

  selectedCard.classList.add("selected", "card-selected", "opponent-target");
  animateElement(selectedCard, "bounce");
}

function toggleCharacterCovered(character, card) {
  const characterId = Number(character.id);
  const isCovered = uiState.coveredCharacterIds.has(characterId);

  if (isCovered) {
    uiState.coveredCharacterIds.delete(characterId);
    card.classList.remove("covered", "card-covered", "flip-down");
    card.setAttribute("aria-pressed", "false");
    card.querySelector(".cover-hint").textContent = "Clic para tapar";
    const selectButton = card.querySelector(".guess-select-button");
    selectButton.disabled = false;
    selectButton.title = "Seleccionar para adivinar";
    animateElement(card, "bounce");
    return;
  }

  uiState.coveredCharacterIds.add(characterId);
  card.classList.add("covered", "card-covered");
  card.setAttribute("aria-pressed", "true");
  card.querySelector(".cover-hint").textContent = "Clic para destapar";
  const selectButton = card.querySelector(".guess-select-button");
  selectButton.disabled = true;
  selectButton.title = "Destapa este personaje antes de seleccionarlo";

  if (Number(uiState.selectedCharacterId) === characterId) {
    clearSelectedCharacter();
  }

  animateElement(card, "flip-down");
}

function markLatestAction(action) {
  if (action.type === "question") {
    showToast(
      action.answer ? "Respuesta del servidor: SI." : "Respuesta del servidor: NO.",
      action.answer ? "positive" : "negative"
    );
    animateElement(elements.historyList, action.answer ? "glow" : "shake");
    return;
  }

  if (action.type === "guess") {
    const selector = `[data-character-id="${action.character_id}"]`;
    const card = document.querySelector(selector);

    if (card) {
      card.classList.add(action.answer ? "correct" : "wrong");
      animateElement(card, action.answer ? "bounce" : "shake");
    }

    showToast(
      action.answer ? "Adivinanza correcta." : "Adivinanza incorrecta.",
      action.answer ? "positive" : "negative"
    );
    return;
  }

  if (action.type === "leave") {
    showToast(
      action.actor_scope === "self"
        ? "Abandonaste la partida."
        : "El rival abandono la partida. Ganaste por abandono.",
      action.actor_scope === "self" ? "warning" : "positive"
    );
  }
}

elements.questionAttribute.addEventListener("change", updateQuestionValues);

elements.questionForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const attribute = elements.questionAttribute.value;
  const value = elements.questionValue.value;

  if (!attribute || value === "") {
    showToast("Selecciona una caracteristica y un valor para preguntar.", "error");
    return;
  }

  if (uiState.latestStatus !== "active") {
    showToast("No puedes preguntar porque la partida no esta activa.", "error");
    return;
  }

  if (!uiState.isYourTurn) {
    showToast("No puedes preguntar porque no es tu turno.", "error");
    return;
  }

  socket.emit("ask_question", {
    attribute,
    value: getQuestionValue(),
  });
});

elements.guessForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!uiState.selectedCharacterId) {
    showToast("Selecciona un personaje del tablero antes de adivinar.", "error");
    return;
  }

  if (uiState.latestStatus !== "active") {
    showToast("No puedes adivinar porque la partida no esta activa.", "error");
    return;
  }

  if (!uiState.isYourTurn) {
    showToast("No puedes adivinar porque no es tu turno.", "error");
    return;
  }

  if (!uiState.canGuess) {
    showToast("Ya usaste tu unica oportunidad para adivinar.", "error");
    return;
  }

  if (!uiState.boardIds.has(Number(uiState.selectedCharacterId))) {
    showToast("El personaje seleccionado no pertenece al tablero actual.", "error");
    return;
  }

  showGuessConfirmModal();
});

elements.requestStateButton.addEventListener("click", () => {
  sortBoardByCovered();
});

elements.joinPublicButton.addEventListener("click", joinPublicGame);
elements.choosePrivateButton.addEventListener("click", createPrivateGame);

elements.createQrRoomButton.addEventListener("click", () => {
  createPrivateGame();
});

elements.copyInviteButton.addEventListener("click", copyInvitationLink);
elements.cancelPublicButton.addEventListener("click", cancelMatchmaking);
elements.cancelPrivateButton.addEventListener("click", cancelMatchmaking);
elements.confirmGuessButton.addEventListener("click", confirmGuess);
elements.cancelGuessButton.addEventListener("click", hideGuessConfirmModal);
elements.rulesButton.addEventListener("click", showRulesModal);
elements.closeRulesButton.addEventListener("click", hideRulesModal);
elements.leaveGameButton.addEventListener("click", leaveCurrentGame);

elements.rulesModal.addEventListener("click", (event) => {
  if (event.target === elements.rulesModal) {
    hideRulesModal();
  }
});

elements.playAgainButton.addEventListener("click", () => {
  window.location.reload();
});

socket.on("connect", () => {
  elements.connectionStatus.textContent = "Conectado";
  elements.connectionStatus.classList.remove("turn-waiting");
  elements.connectionStatus.classList.add("turn-active");

  if (invitationRoom) {
    showPrivateRoomPanel(true);
    showToast(`Conectado. Uniendote a la sala QR ${invitationRoom}...`, "info");
    socket.emit("join_private_room", { room: invitationRoom });
    return;
  }

  showMainMenu();
  showToast("Conectado. Elige el modo de juego para comenzar.", "info");
});

socket.on("disconnect", () => {
  elements.connectionStatus.textContent = "Desconectado";
  elements.connectionStatus.classList.remove("turn-active");
  elements.connectionStatus.classList.add("turn-waiting");
  updateMatchStatus("waiting");
  showToast("Se perdio la conexion con el servidor.", "error");
});

socket.on("connected", (data) => {
  if (!invitationRoom && uiState.latestStatus === "menu") {
    showToast(data.message || "Conexion aceptada por el servidor.", "info");
  }
});

socket.on("queue_status", (data) => {
  if (data.private) {
    showPrivateRoomPanel(false);
  } else {
    showWaitingPublic();
  }
  showToast(data.message || "Esperando rival.", "info");
});

socket.on("private_room_detected", (data) => {
  showPrivateRoomPanel(true);
  showToast(data.message || "Codigo QR detectado.", "info");
});

socket.on("private_room_created", (data) => {
  showPrivateRoomPanel(false);
  showQrInvite(data.room_code, data.invitation_url);
  elements.createQrRoomButton.disabled = true;
  elements.createQrRoomButton.textContent = "Sala QR creada";
  showToast(data.message || "Sala QR creada.", "success");
});

socket.on("game_started", (data) => {
  showGameScreen();
  updateMatchStatus("active");
  elements.createQrRoomButton.disabled = true;
  elements.copyInviteButton.disabled = true;
  showToast(`${data.message || "Partida iniciada"} Codigo: ${data.game_id.slice(0, 8)}`, "success");
});

socket.on("state_update", (state) => {
  elements.confirmGuessButton.disabled = false;
  updateFromState(state);
});

socket.on("action_result", (action) => {
  markLatestAction(action);
});

socket.on("error_message", (data) => {
  elements.confirmGuessButton.disabled = false;
  uiState.hasSentLeaveRequest = false;
  updateLeaveButtonState();
  showToast(data.message || "Accion invalida.", "error");
  if (uiState.latestStatus !== "active") {
    showMainMenu();
  }
});

socket.on("opponent_left", (data) => {
  showToast(data.message || "El rival abandono la partida.", "warning");
});

socket.on("matchmaking_cancelled", (data) => {
  showMainMenu();
  showToast(data.message || "Volviste al menu principal.", "info");
});

socket.on("left_game", (data) => {
  hideEndGameModal();
  hideGuessConfirmModal();
  showMainMenu();
  showToast(data.message || "Volviste al menu principal.", "warning");
});

updateQuestionValues();
showMainMenu();
elements.askButton.disabled = true;
elements.guessButton.disabled = true;
updateLeaveButtonState();
