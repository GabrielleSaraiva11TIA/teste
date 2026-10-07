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
  //  2) CARTÕES "TOQUE NO VENTO"
  // =====================================================
  soundCards.forEach((card) => {
    card.addEventListener("click", () => {
      const kind = card.dataset.sound;

      // contador
      touches += 1;
      counterEl.textContent = `👆 ${touches} ${touches === 1 ? "toque" : "toques"}`;

      // feedback visual no cartão
      card.classList.add("is-playing");
      setTimeout(() => card.classList.remove("is-playing"), 350);

      // balão no mascote
      bubbleText.textContent = card.dataset.label;
      stage.classList.add("is-bubble");
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => stage.classList.remove("is-bubble"), 1600);

      // vibração curta + som
      if ("vibrate" in navigator) {
        navigator.vibrate(kind === "tambor" ? [90] : kind === "sino" ? [40, 40, 40] : [120, 60, 120]);
      }
      playSound(kind, 1.4);
    });
  });

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