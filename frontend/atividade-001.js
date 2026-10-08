/* =====================================================
   Lumis • Exercício 1 — Descoberta do Som
   Interações: botão "Sentir na pulseira" + cartões de som
   ===================================================== */

(() => {
  "use strict";

  // ---------- Elementos ----------
  const stage       = document.getElementById("stage");
  const btnFeel     = document.getElementById("btnFeel");
  const btnFeelText = document.getElementById("btnFeelText");
  const stateChip   = document.getElementById("stateChip");
  const stateText   = document.getElementById("stateText");
  const stateEmoji  = document.getElementById("stateEmoji");
  const bandStatus  = document.getElementById("bandStatus");
  const bandTag     = document.getElementById("bandTag");
  const bubbleText  = document.getElementById("bubbleText");
  const counterEl   = document.getElementById("touchCounter");
  const starCountEl = document.getElementById("starCount");
  const soundCards  = document.querySelectorAll(".sound-card");

  // ---------- Configurações ----------
  const VIBRATION_MS = 3500;                        // duração do estado "vibrando"
  const VIBRATION_PATTERN = [180, 90, 180, 90, 180, 90, 180, 90, 180]; // padrão "brisa"

  let touches = 1;            // começa em 1, como na imagem
  let feeling = false;
  let feelTimer = null;
  let bubbleTimer = null;
  let firstFeelRewarded = false;

  // =====================================================
  //  1) SENTIR NA PULSEIRA
  // =====================================================
  function startFeeling() {
    if (feeling) return;
    feeling = true;

    // visual do botão
    btnFeel.classList.add("is-pressed");
    btnFeel.setAttribute("aria-pressed", "true");
    btnFeelText.textContent = "Sentindo...";

    // chip de estado -> "Vibrando pulseira: Sssss... 📳"
    stateChip.classList.add("is-vibrating");
    stateText.textContent = "Vibrando pulseira: Sssss...";
    stateEmoji.hidden = false;

    // faixa superior "Pulseira Ativa"
    bandStatus.classList.add("is-active");
    bandTag.firstChild.textContent = "Vibrando ";

    // palco: brilho azul + balão "Vento! 🍃"
    bubbleText.textContent = "Vento! 🍃";
    stage.classList.add("is-feeling");

    // vibração real (celulares Android / navegadores compatíveis)
    if ("vibrate" in navigator) navigator.vibrate(VIBRATION_PATTERN);

    // som suave de vento
    playSound("vento", VIBRATION_MS / 1000);

    // recompensa na primeira vez
    if (!firstFeelRewarded) {
      firstFeelRewarded = true;
      starCountEl.textContent = String(Number(starCountEl.textContent) + 1);
    }

    feelTimer = setTimeout(stopFeeling, VIBRATION_MS);
  }

  function stopFeeling() {
    clearTimeout(feelTimer);
    feeling = false;

    btnFeel.classList.remove("is-pressed");
    btnFeel.setAttribute("aria-pressed", "false");
    btnFeelText.textContent = "Sentir na pulseira";

    stateChip.classList.remove("is-vibrating");
    stateText.textContent = "Pronto para ouvir!";
    stateEmoji.hidden = true;

    bandStatus.classList.remove("is-active");
    bandTag.firstChild.textContent = "Vibração pronto ";

    stage.classList.remove("is-feeling");
    if ("vibrate" in navigator) navigator.vibrate(0);
  }

  btnFeel.addEventListener("click", () => (feeling ? stopFeeling() : startFeeling()));

  // =====================================================
  //  2) CARTÕES — tocar para ouvir / tocar no nome para escolher
  // =====================================================
  const CORRECT_SOUND = "vento";   // resposta certa desta atividade (data-sound do cartão)
  const WIND_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  // mensagens de incentivo (uma por tentativa errada, em ciclo)
  const RETRY_MESSAGES = [
    {
      tag: "Quase lá!",
      title: "Ops, esse não foi dessa vez! 🌈",
      text: "Tudo bem errar, é assim que a gente aprende! Toque em “Toque para ouvir” e sinta a vibração com atenção.",
    },
    {
      tag: "Você consegue!",
      title: "Vamos tentar mais uma vez? 💪",
      text: "Cada tentativa deixa você mais craque! Ouça cada opção de novo e compare as vibrações.",
    },
    {
      tag: "Continue assim!",
      title: "Falta pouquinho! 🌟",
      text: "Você está indo muito bem! Sinta a pulseira de novo, bem devagarinho, e escolha com carinho.",
    },
  ];

  const cardsEl       = document.getElementById("cards");
  const confirmEl     = document.getElementById("confirm");
  const confirmName   = document.getElementById("confirmName");
  const confirmIcon   = document.getElementById("confirmIcon");
  const confirmYes    = document.getElementById("confirmYes");
  const confirmNo     = document.getElementById("confirmNo");
  const resultSuccess = document.getElementById("resultSuccess");
  const resultRetry   = document.getElementById("resultRetry");
  const retryTag      = document.getElementById("retryTag");
  const retryTitle    = document.getElementById("retryTitle");
  const retryText     = document.getElementById("retryText");
  const btnNext       = document.getElementById("btnNext");
  const btnRetry      = document.getElementById("btnRetry");

  let answered = false;      // já acertou?
  let attempts = 0;          // quantas vezes errou
  let pendingCard = null;    // cartão aguardando confirmação
  let lastFocus = null;

  // balão de fala do mascote
  function showBubble(text) {
    bubbleText.textContent = text;
    stage.classList.add("is-bubble");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => stage.classList.remove("is-bubble"), 1600);
  }

  // ouvir / sentir a vibração de uma opção
  function playCard(card) {
    const kind = card.dataset.sound;

    // contador
    touches += 1;
    counterEl.textContent = `👆 ${touches} ${touches === 1 ? "toque" : "toques"}`;

    // feedback visual no cartão
    card.classList.add("is-playing");
    setTimeout(() => card.classList.remove("is-playing"), 350);

    // balão no mascote
    showBubble(card.dataset.label);

    // vibração curta + som
    if ("vibrate" in navigator) {
      navigator.vibrate(kind === "tambor" ? [90] : kind === "sino" ? [40, 40, 40] : [120, 60, 120]);
    }
    playSound(kind, 1.4);
  }

  // clique nos cartões: ícone / "Toque para ouvir" -> ouvir | nome -> escolher
  cardsEl.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-action]");
    if (!btn) return;
    const card = btn.closest(".sound-card");
    if (!card) return;

    if (btn.dataset.action === "play") {
      playCard(card);
    } else if (btn.dataset.action === "choose" && !answered) {
      openConfirm(card);
    }
  });

  // ---------- pergunta "Quer escolher essa opção?" ----------
  function openConfirm(card) {
    pendingCard = card;
    lastFocus = document.activeElement;
    confirmName.textContent = card.querySelector(".sound-card__name").textContent.trim();
    confirmIcon.innerHTML = card.querySelector(".sound-card__icon").innerHTML;
    confirmEl.hidden = false;
    confirmYes.focus();
  }

  function closeConfirm() {
    confirmEl.hidden = true;
    pendingCard = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  confirmYes.addEventListener("click", () => {
    const card = pendingCard;
    closeConfirm();
    if (!card) return;
    if (card.dataset.sound === CORRECT_SOUND) onCorrect(card);
    else onWrong(card);
  });
  confirmNo.addEventListener("click", closeConfirm);
  confirmEl.addEventListener("click", (e) => { if (e.target === confirmEl) closeConfirm(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !confirmEl.hidden) closeConfirm();
  });

  // ---------- acertou ----------
  function onCorrect(card) {
    answered = true;
    resultRetry.hidden = true;

    cardsEl.classList.add("is-locked");
    card.classList.add("is-correct");
    card.querySelector(".sound-card__cta").innerHTML = WIND_ICON + " Isso mesmo!";

    // +1 estrela
    starCountEl.textContent = String(Number(starCountEl.textContent) + 1);

    resultSuccess.hidden = false;
    showBubble("Isso mesmo! ⭐");
    if ("vibrate" in navigator) navigator.vibrate([100, 50, 100, 50, 220]);
    playSound("sucesso");
    confetti();

    resultSuccess.scrollIntoView({ behavior: "smooth", block: "nearest" });
    btnNext.focus({ preventScroll: true });
  }

  // ---------- errou: incentivo para tentar de novo ----------
  function onWrong(card) {
    const msg = RETRY_MESSAGES[attempts % RETRY_MESSAGES.length];
    attempts += 1;

    card.classList.add("is-wrong");
    setTimeout(() => card.classList.remove("is-wrong"), 900);

    retryTag.textContent = msg.tag;
    retryTitle.textContent = msg.title;
    retryText.textContent = msg.text;
    resultRetry.hidden = false;

    showBubble("Tenta de novo! 💪");
    if ("vibrate" in navigator) navigator.vibrate([60]);
    playSound("tentar");

    resultRetry.scrollIntoView({ behavior: "smooth", block: "nearest" });
    btnRetry.focus({ preventScroll: true });
  }

  btnRetry.addEventListener("click", () => {
    resultRetry.hidden = true;
    cardsEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  // ---------- avançar ----------
  // Defina data-next="proxima-atividade.html" no botão para navegar.
  // Também dispara o evento "atividade001:avancar" para quem quiser escutar.
  btnNext.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("atividade001:avancar"));
    const dest = btnNext.dataset.next;
    if (dest) window.location.href = dest;
  });

  // ---------- confete ----------
  function confetti() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = ["#ffd54a", "#2f78ff", "#36c6ff", "#ff8fb1", "#7be495"];
    const wrap = document.createElement("div");
    wrap.className = "confetti";
    wrap.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 28; i++) {
      const s = document.createElement("span");
      s.style.left = Math.random() * 100 + "%";
      s.style.background = colors[i % colors.length];
      s.style.animationDelay = Math.random() * 0.4 + "s";
      s.style.setProperty("--dx", Math.random() * 160 - 80 + "px");
      wrap.appendChild(s);
    }
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 2600);
  }

  // =====================================================
  //  3) SONS (Web Audio API — sem arquivos externos)
  // =====================================================
  let audioCtx = null;

  function ctx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function playSound(kind, seconds = 1) {
    try {
      const ac = ctx();
      if (kind === "tambor") return drum(ac);
      if (kind === "sino")   return bell(ac);
      if (kind === "sucesso") return cheer(ac);
      if (kind === "tentar")  return softTry(ac);
      return wind(ac, seconds);
    } catch (e) {
      /* áudio não suportado: segue sem som */
    }
  }

  function drum(ac) {
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.25);
    gain.gain.setValueAtTime(0.9, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  function bell(ac) {
    const t = ac.currentTime;
    [880, 1320, 1760].forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.35 / (i + 1), t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 1.7);
    });
  }

  // notinhas alegres de acerto (dó-mi-sol-dó agudo)
  function cheer(ac) {
    const t = ac.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const start = t + i * 0.12;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
      osc.connect(gain).connect(ac.destination);
      osc.start(start);
      osc.stop(start + 0.5);
    });
  }

  // duas notinhas suaves e gentis para "tente de novo"
  function softTry(ac) {
    const t = ac.currentTime;
    [392, 329.63].forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = t + i * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
      osc.connect(gain).connect(ac.destination);
      osc.start(start);
      osc.stop(start + 0.45);
    });
  }

  function wind(ac, seconds) {
    const t = ac.currentTime;
    const length = Math.floor(ac.sampleRate * seconds);
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    const src = ac.createBufferSource();
    src.buffer = buffer;

    const filter = ac.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.linearRampToValueAtTime(1100, t + seconds * 0.5);
    filter.frequency.linearRampToValueAtTime(500, t + seconds);

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.25, t + seconds * 0.35);
    gain.gain.linearRampToValueAtTime(0.0001, t + seconds);

    src.connect(filter).connect(gain).connect(ac.destination);
    src.start(t);
  }
})();