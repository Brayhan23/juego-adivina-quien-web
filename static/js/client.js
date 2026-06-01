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
  musicToggleButton: document.querySelector("#music-toggle-button"),
  effectsToggleButton: document.querySelector("#effects-toggle-button"),
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
  answerPopup: document.querySelector("#answer-popup"),
  turnPopup: document.querySelector("#turn-popup"),
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

const AUDIO_STORAGE_KEYS = {
  music: "adivina_quien_music_enabled",
  effects: "adivina_quien_effects_enabled",
};

const MUSIC_VOLUME = {
  waiting: 0.28,
  game: 0.22,
};

const EFFECT_VOLUME = 0.62;

const audioTracks = {
  waiting: createAudioTrack("/static/audio/waiting-music.mp3", true, MUSIC_VOLUME.waiting),
  game: createAudioTrack("/static/audio/game-music.mp3", true, MUSIC_VOLUME.game),
};

const soundEffects = {
  click: createAudioTrack("/static/audio/click.mp3", false, EFFECT_VOLUME),
  cardFlip: createAudioTrack("/static/audio/card-flip.mp3", false, EFFECT_VOLUME),
  question: createAudioTrack("/static/audio/question.mp3", false, EFFECT_VOLUME),
  correct: createAudioTrack("/static/audio/correct.mp3", false, EFFECT_VOLUME),
  wrong: createAudioTrack("/static/audio/wrong.mp3", false, EFFECT_VOLUME),
  victory: createAudioTrack("/static/audio/victory.mp3", false, EFFECT_VOLUME),
  defeat: createAudioTrack("/static/audio/defeat.mp3", false, EFFECT_VOLUME),
};

const activeEffects = new Set();

const uiState = {
  selectedCharacterId: null,
  selectedCharacterName: "Ninguno",
  playerNumber: null,
  lastTurnOwner: null,
  previousTurnState: false,
  lastHistoryLength: 0,
  latestStatus: "waiting",
  isYourTurn: false,
  boardIds: new Set(),
  coveredCharacterIds: new Set(),
  currentGameId: null,
  currentBoard: [],
  boardSignature: "",
  secretCharacterId: null,
  boardSortedByCovered: false,
  invitationUrl: "",
  matchmakingPending: false,
  canGuess: false,
  pendingGuessCharacterId: null,
  hasSentLeaveRequest: false,
  answerPopupTimeout: null,
  turnPopupTimeout: null,
  audioUnlocked: false,
  musicEnabled: getStoredBoolean(AUDIO_STORAGE_KEYS.music, true),
  effectsEnabled: getStoredBoolean(AUDIO_STORAGE_KEYS.effects, true),
  activeMusicType: null,
  endGameAudioPlayedFor: null,
};

function getStoredBoolean(key, fallback) {
  try {
    const storedValue = window.localStorage.getItem(key);
    return storedValue === null ? fallback : storedValue === "true";
  } catch (error) {
    return fallback;
  }
}

function storeBoolean(key, value) {
  try {
    window.localStorage.setItem(key, String(Boolean(value)));
  } catch (error) {
    // Audio preferences are useful, but the game must continue without storage.
  }
}

function createAudioTrack(src, loop = false, volume = 0.5) {
  const track = new Audio(src);
  track.loop = loop;
  track.volume = volume;
  track.preload = "none";
  track.addEventListener("error", () => {
    // Missing audio files should never interrupt the game flow.
  });
  return track;
}

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

function normalizeAnswer(answer) {
  if (answer === true) {
    return "SI";
  }

  if (answer === false) {
    return "NO";
  }

  const normalized = String(answer || "").trim().toUpperCase();
  if (normalized === "SÍ" || normalized === "SI" || normalized === "TRUE") {
    return "SI";
  }

  return "NO";
}

function showAnswerPopup(answer) {
  const normalizedAnswer = normalizeAnswer(answer);
  const isPositive = normalizedAnswer === "SI";

  if (uiState.answerPopupTimeout) {
    window.clearTimeout(uiState.answerPopupTimeout);
  }

  elements.answerPopup.textContent = `Respuesta de la pregunta : ${isPositive ? "S\u00cd" : "NO"}`;
  elements.answerPopup.setAttribute("aria-hidden", "false");
  elements.answerPopup.classList.remove("show", "hide", "success", "error");
  void elements.answerPopup.offsetWidth;
  elements.answerPopup.classList.add("show", isPositive ? "success" : "error");

  uiState.answerPopupTimeout = window.setTimeout(() => {
    elements.answerPopup.classList.remove("show");
    elements.answerPopup.classList.add("hide");
    elements.answerPopup.setAttribute("aria-hidden", "true");
  }, 2500);
}

function showTurnPopup() {
  if (uiState.turnPopupTimeout) {
    window.clearTimeout(uiState.turnPopupTimeout);
  }

  elements.turnPopup.classList.remove("show", "hide", "player-one", "player-two");
  elements.turnPopup.classList.add(uiState.playerNumber === 2 ? "player-two" : "player-one");
  elements.turnPopup.setAttribute("aria-hidden", "false");
  void elements.turnPopup.offsetWidth;
  elements.turnPopup.classList.add("show");
  playSound("click");

  uiState.turnPopupTimeout = window.setTimeout(() => {
    elements.turnPopup.classList.remove("show");
    elements.turnPopup.classList.add("hide");
    elements.turnPopup.setAttribute("aria-hidden", "true");
  }, 2500);
}

function enableAudio() {
  if (uiState.audioUnlocked) {
    return;
  }

  uiState.audioUnlocked = true;
  updateAudioButton();
  syncMusicToState();
}

function playSound(name) {
  if (!uiState.audioUnlocked || !uiState.effectsEnabled) {
    return;
  }

  const source = soundEffects[name];
  if (!source) {
    return;
  }

  const effect = source.cloneNode(true);
  effect.volume = EFFECT_VOLUME;
  activeEffects.add(effect);
  effect.addEventListener("ended", () => activeEffects.delete(effect), { once: true });
  effect.addEventListener("error", () => activeEffects.delete(effect), { once: true });
  effect.play().catch(() => activeEffects.delete(effect));
}

function playMusic(type) {
  if (!uiState.audioUnlocked || !uiState.musicEnabled || !type) {
    return;
  }

  const track = audioTracks[type];
  if (!track) {
    return;
  }

  if (uiState.activeMusicType === type && !track.paused) {
    return;
  }

  const isNewTrack = uiState.activeMusicType !== type;
  stopMusic(false);
  uiState.activeMusicType = type;
  track.volume = MUSIC_VOLUME[type] || 0.24;

  if (isNewTrack) {
    track.currentTime = 0;
  }

  track.play().catch(() => {});
}

function stopMusic(reset = false) {
  Object.values(audioTracks).forEach((track) => {
    track.pause();
    if (reset) {
      track.currentTime = 0;
    }
  });
  uiState.activeMusicType = null;
}

function stopAllAudio() {
  stopMusic(true);
  activeEffects.forEach((effect) => {
    effect.pause();
    effect.currentTime = 0;
  });
  activeEffects.clear();
}

function setAudioEnabled(value) {
  uiState.musicEnabled = Boolean(value);
  storeBoolean(AUDIO_STORAGE_KEYS.music, uiState.musicEnabled);

  if (uiState.musicEnabled) {
    syncMusicToState();
  } else {
    stopMusic(true);
  }

  updateAudioButton();
}

function setEffectsEnabled(value) {
  uiState.effectsEnabled = Boolean(value);
  storeBoolean(AUDIO_STORAGE_KEYS.effects, uiState.effectsEnabled);
  updateAudioButton();
}

function getMusicTypeForStatus(status = uiState.latestStatus) {
  if (status === "waiting" || status === "private_waiting") {
    return "waiting";
  }

  if (status === "active") {
    return "game";
  }

  return null;
}

function syncMusicToState() {
  const musicType = getMusicTypeForStatus();

  if (!musicType || !uiState.musicEnabled || !uiState.audioUnlocked) {
    stopMusic(uiState.latestStatus === "menu" || uiState.latestStatus === "finished");
    return;
  }

  playMusic(musicType);
}

function updateAudioButton() {
  elements.musicToggleButton.textContent = uiState.musicEnabled ? "Musica: ON" : "Musica: OFF";
  elements.effectsToggleButton.textContent = uiState.effectsEnabled ? "Efectos: ON" : "Efectos: OFF";

  elements.musicToggleButton.classList.toggle("is-on", uiState.musicEnabled);
  elements.musicToggleButton.classList.toggle("is-off", !uiState.musicEnabled);
  elements.effectsToggleButton.classList.toggle("is-on", uiState.effectsEnabled);
  elements.effectsToggleButton.classList.toggle("is-off", !uiState.effectsEnabled);

  animateElement(elements.musicToggleButton, "pulse-on");
  animateElement(elements.effectsToggleButton, "pulse-on");
}

function launchVictoryConfetti() {
  if (!window.confetti) {
    return;
  }

  const colors = ["#E4252A", "#FFD22E", "#0076C9", "#F7941D", "#FFFFFF"];
  window.confetti({
    particleCount: 130,
    spread: 78,
    origin: { y: 0.62 },
    colors,
  });
  window.setTimeout(() => {
    window.confetti({
      particleCount: 80,
      angle: 60,
      spread: 62,
      origin: { x: 0, y: 0.72 },
      colors,
    });
    window.confetti({
      particleCount: 80,
      angle: 120,
      spread: 62,
      origin: { x: 1, y: 0.72 },
      colors,
    });
  }, 240);
}

function handleEndGameAudio(state) {
  const marker = `${state.game_id}:${state.you_won ? "win" : "lose"}`;
  if (uiState.endGameAudioPlayedFor === marker) {
    return;
  }

  uiState.endGameAudioPlayedFor = marker;
  stopMusic(true);

  if (state.you_won) {
    playSound("victory");
    launchVictoryConfetti();
    return;
  }

  playSound("defeat");
}

function toggleMusic() {
  enableAudio();
  playSound("click");
  setAudioEnabled(!uiState.musicEnabled);
}

function toggleEffects() {
  enableAudio();
  const shouldEnable = !uiState.effectsEnabled;

  if (!shouldEnable) {
    playSound("click");
  }

  setEffectsEnabled(shouldEnable);

  if (shouldEnable) {
    playSound("click");
  }
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
  enableAudio();
  playSound("click");

  if (uiState.latestStatus === "active") {
    showToast("Ya estas en una partida activa.", "error");
    playSound("wrong");
    return;
  }

  showWaitingPublic();
  socket.emit("join_public_queue");
  showToast("Buscando rival para partida publica...", "info");
}

function isLocalOnlyHost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function createPrivateGame() {
  enableAudio();
  playSound("click");

  if (uiState.latestStatus === "active") {
    showToast("No puedes crear una sala QR porque ya estas en una partida.", "error");
    playSound("wrong");
    return;
  }

  if (isLocalOnlyHost()) {
    showToast(
      "Para compartir el QR, abre el juego usando la IP WiFi del computador en lugar de localhost.",
      "error",
    );
    playSound("wrong");
    return;
  }

  resetPrivateInviteView();
  showPrivateRoomPanel(false);
  socket.emit("create_private_room");
  showToast("Creando sala privada por QR...", "info");
}

function cancelMatchmaking() {
  enableAudio();
  playSound("click");

  if (uiState.latestStatus === "active") {
    showToast("No puedes volver al menu durante una partida activa.", "error");
    playSound("wrong");
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
  enableAudio();
  playSound("click");

  if (!uiState.invitationUrl) {
    showToast("Todavia no hay enlace para copiar.", "error");
    playSound("wrong");
    return;
  }

  try {
    await navigator.clipboard.writeText(uiState.invitationUrl);
    showToast("Enlace de invitacion copiado.", "success");
  } catch (error) {
    showToast("No se pudo copiar automaticamente. Selecciona y copia el enlace.", "error");
    playSound("wrong");
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
  image.loading = extraImageClass ? "eager" : "lazy";
  image.decoding = "async";
  image.fetchPriority = extraImageClass ? "high" : "low";
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

function getBoardSignature(board = []) {
  return board
    .map((character) => `${character.id}:${character.imagen || ""}:${character.avatar || ""}`)
    .join("|");
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
  const becameYourTurn = isYourTurn && !uiState.previousTurnState && !finished;
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

  if (becameYourTurn) {
    showTurnPopup();
  }

  uiState.previousTurnState = isYourTurn && !finished;
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
  syncMusicToState();
}

function updateFromState(state) {
  const statusChanged = uiState.latestStatus !== state.status;
  const board = state.board || [];
  const boardSignature = getBoardSignature(board);
  const secretCharacter = state.your_secret_character;
  const isNewGame = uiState.currentGameId !== state.game_id;

  if (isNewGame) {
    uiState.currentGameId = state.game_id;
    uiState.coveredCharacterIds.clear();
    uiState.boardSortedByCovered = false;
    uiState.boardSignature = "";
    uiState.secretCharacterId = null;
    uiState.previousTurnState = false;
    uiState.lastHistoryLength = 0;
    uiState.endGameAudioPlayedFor = null;
    clearSelectedCharacter();
  }
  uiState.currentBoard = board;

  showGameScreen();
  applyPlayerTheme(state.player_number);
  updateMatchStatus(state.status);
  updateTurnIndicator(state);

  if (secretCharacter && uiState.secretCharacterId !== secretCharacter.id) {
    uiState.secretCharacterId = secretCharacter.id;
    renderSecretCharacter(secretCharacter);
  }

  if (isNewGame || uiState.boardSignature !== boardSignature) {
    uiState.boardSignature = boardSignature;
    renderBoard(board);
  }

  renderHistory(state.history);

  if (state.status === "active" && statusChanged) {
    showToast(state.is_your_turn ? "Es tu turno." : "Espera la jugada del rival.", "info");
  }

  if (state.status === "finished") {
    handleEndGameAudio(state);
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
  enableAudio();
  playSound("click");
  elements.rulesModal.setAttribute("aria-hidden", "false");
  elements.rulesModal.classList.add("visible");
  animateElement(elements.rulesModal.querySelector(".rules-card"), "slide-up");
}

function hideRulesModal() {
  playSound("click");
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
  enableAudio();
  playSound("click");

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
  enableAudio();
  playSound("click");

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
  stopMusic(true);
  socket.emit("leave_game");
  showToast("Procesando abandono en el servidor...", "warning");
}

function handleCharacterSelection(character, selectedCard) {
  enableAudio();

  if (uiState.coveredCharacterIds.has(Number(character.id))) {
    showToast("Destapa este personaje antes de seleccionarlo para adivinar.", "error");
    playSound("wrong");
    return;
  }

  playSound("click");
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
  enableAudio();
  playSound("cardFlip");

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
    playSound(action.answer ? "correct" : "wrong");
    showAnswerPopup(action.answer);
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
  enableAudio();

  const attribute = elements.questionAttribute.value;
  const value = elements.questionValue.value;

  if (!attribute || value === "") {
    showToast("Selecciona una caracteristica y un valor para preguntar.", "error");
    playSound("wrong");
    return;
  }

  if (uiState.latestStatus !== "active") {
    showToast("No puedes preguntar porque la partida no esta activa.", "error");
    playSound("wrong");
    return;
  }

  if (!uiState.isYourTurn) {
    showToast("No puedes preguntar porque no es tu turno.", "error");
    playSound("wrong");
    return;
  }

  playSound("question");
  socket.emit("ask_question", {
    attribute,
    value: getQuestionValue(),
  });
});

elements.guessForm.addEventListener("submit", (event) => {
  event.preventDefault();
  enableAudio();

  if (!uiState.selectedCharacterId) {
    showToast("Selecciona un personaje del tablero antes de adivinar.", "error");
    playSound("wrong");
    return;
  }

  if (uiState.latestStatus !== "active") {
    showToast("No puedes adivinar porque la partida no esta activa.", "error");
    playSound("wrong");
    return;
  }

  if (!uiState.isYourTurn) {
    showToast("No puedes adivinar porque no es tu turno.", "error");
    playSound("wrong");
    return;
  }

  if (!uiState.canGuess) {
    showToast("Ya usaste tu unica oportunidad para adivinar.", "error");
    playSound("wrong");
    return;
  }

  if (!uiState.boardIds.has(Number(uiState.selectedCharacterId))) {
    showToast("El personaje seleccionado no pertenece al tablero actual.", "error");
    playSound("wrong");
    return;
  }

  playSound("click");
  showGuessConfirmModal();
});

elements.requestStateButton.addEventListener("click", () => {
  enableAudio();
  playSound("click");
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
elements.cancelGuessButton.addEventListener("click", () => {
  playSound("click");
  hideGuessConfirmModal();
});
elements.rulesButton.addEventListener("click", showRulesModal);
elements.closeRulesButton.addEventListener("click", hideRulesModal);
elements.leaveGameButton.addEventListener("click", leaveCurrentGame);
elements.musicToggleButton.addEventListener("click", toggleMusic);
elements.effectsToggleButton.addEventListener("click", toggleEffects);

elements.rulesModal.addEventListener("click", (event) => {
  if (event.target === elements.rulesModal) {
    hideRulesModal();
  }
});

elements.playAgainButton.addEventListener("click", () => {
  enableAudio();
  playSound("click");
  stopAllAudio();
  window.location.reload();
});

document.addEventListener("pointerdown", enableAudio, { once: true });
document.addEventListener("keydown", enableAudio, { once: true });

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
  stopAllAudio();
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
  const invitationUrl = `${window.location.origin}/?room=${encodeURIComponent(data.room_code)}`;
  showQrInvite(data.room_code, invitationUrl);
  elements.createQrRoomButton.disabled = true;
  elements.createQrRoomButton.textContent = "Sala QR creada";
  playSound("correct");
  showToast(data.message || "Sala QR creada.", "success");
});

socket.on("game_started", (data) => {
  showGameScreen();
  updateMatchStatus("active");
  elements.createQrRoomButton.disabled = true;
  elements.copyInviteButton.disabled = true;
  playSound("correct");
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
  playSound("wrong");
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
  stopAllAudio();
  hideEndGameModal();
  hideGuessConfirmModal();
  showMainMenu();
  showToast(data.message || "Volviste al menu principal.", "warning");
});

updateQuestionValues();
updateAudioButton();
showMainMenu();
elements.askButton.disabled = true;
elements.guessButton.disabled = true;
updateLeaveButtonState();
