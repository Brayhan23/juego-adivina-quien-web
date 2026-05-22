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
    ["broche", "Broche"],
    ["audifonos", "Audifonos"],
    ["lazo", "Lazo"],
    ["reloj", "Reloj"],
    ["pulsera", "Pulsera"],
    ["panuelo", "Panuelo"],
    ["diadema", "Diadema"],
    ["mochila", "Mochila"],
    ["flor", "Flor"],
    ["chaleco", "Chaleco"],
    ["bolso", "Bolso"],
    ["camara", "Camara"],
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
  invitationUrl: "",
  matchmakingPending: false,
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

function renderBoard(board = []) {
  elements.board.replaceChildren();
  uiState.boardIds = new Set(board.map((character) => Number(character.id)));

  if (uiState.selectedCharacterId && !uiState.boardIds.has(Number(uiState.selectedCharacterId))) {
    uiState.selectedCharacterId = null;
    uiState.selectedCharacterName = "Ninguno";
    elements.selectedCharacterId.value = "";
    elements.selectedCharacterName.textContent = "Ninguno";
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

  board.forEach((character) => {
    const fragment = elements.characterTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".character-card");
    const avatar = fragment.querySelector(".character-avatar");
    const name = fragment.querySelector(".character-name");
    const tagRow = fragment.querySelector(".tag-row");

    card.dataset.characterId = character.id;
    card.dataset.characterName = character.nombre;
    avatar.textContent = character.avatar;
    name.textContent = character.nombre;

    tagRow.append(
      createTag(character.genero),
      createTag(character.color_cabello),
      createTag(character.gafas ? "gafas" : "sin gafas"),
      createTag(character.sombrero ? "sombrero" : "sin sombrero")
    );

    if (Number(uiState.selectedCharacterId) === Number(character.id)) {
      card.classList.add("selected", "card-selected", "opponent-target");
    }

    card.addEventListener("click", () => handleCharacterSelection(character, card));
    elements.board.appendChild(fragment);
  });
}

function renderSecretCharacter(character) {
  if (!character) {
    return;
  }

  elements.secretAvatar.textContent = character.avatar;
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
  if (action.type === "question") {
    const label = ATTRIBUTE_LABELS[action.attribute] || action.attribute;
    const answer = action.answer ? "SI" : "NO";
    const type = action.answer ? "positive" : "negative";
    return createHistoryItem(
      "Pregunta",
      `${label}: ${formatTraitValue(action.value)}. Respuesta: ${answer}.`,
      type
    );
  }

  if (action.type === "guess") {
    return createHistoryItem(
      "Adivinanza",
      action.answer ? "Adivinanza correcta." : "Adivinanza incorrecta.",
      action.answer ? "victory" : "defeat"
    );
  }

  if (action.type === "disconnect") {
    return createHistoryItem("Desconexion", action.message, "warning");
  }

  return createHistoryItem("Sistema", "Accion registrada por el servidor.", "info");
}

function updateTurnIndicator(state) {
  const isYourTurn = Boolean(state.is_your_turn);
  const finished = state.status === "finished";
  uiState.isYourTurn = isYourTurn && !finished;

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
  elements.guessButton.disabled = !isYourTurn || finished;
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
}

function updateFromState(state) {
  const statusChanged = uiState.latestStatus !== state.status;

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
    showEndGameModal(state.you_won);
  }
}

function showEndGameModal(playerWon) {
  elements.modal.setAttribute("aria-hidden", "false");
  elements.modal.classList.add("visible");
  elements.modal.classList.toggle("victory", playerWon);
  elements.modal.classList.toggle("defeat", !playerWon);
  elements.modalKicker.textContent = playerWon ? "Victoria" : "Derrota";
  elements.modalTitle.textContent = playerWon ? "Ganaste la partida" : "Perdiste la partida";
  elements.modalMessage.textContent = playerWon
    ? "Adivinaste el personaje secreto del rival."
    : "El rival resolvio el misterio primero.";
  animateElement(elements.modal.querySelector(".game-over-card"), playerWon ? "bounce" : "shake");
}

function handleCharacterSelection(character, selectedCard) {
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

  if (!uiState.boardIds.has(Number(uiState.selectedCharacterId))) {
    showToast("El personaje seleccionado no pertenece al tablero actual.", "error");
    return;
  }

  socket.emit("guess_character", {
    character_id: uiState.selectedCharacterId,
  });
});

elements.requestStateButton.addEventListener("click", () => {
  socket.emit("request_state");
  showToast("Solicitando estado actualizado al servidor.", "info");
});

elements.joinPublicButton.addEventListener("click", joinPublicGame);
elements.choosePrivateButton.addEventListener("click", createPrivateGame);

elements.createQrRoomButton.addEventListener("click", () => {
  createPrivateGame();
});

elements.copyInviteButton.addEventListener("click", copyInvitationLink);
elements.cancelPublicButton.addEventListener("click", cancelMatchmaking);
elements.cancelPrivateButton.addEventListener("click", cancelMatchmaking);

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
  updateFromState(state);
});

socket.on("action_result", (action) => {
  markLatestAction(action);
});

socket.on("error_message", (data) => {
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

updateQuestionValues();
showMainMenu();
elements.askButton.disabled = true;
elements.guessButton.disabled = true;
