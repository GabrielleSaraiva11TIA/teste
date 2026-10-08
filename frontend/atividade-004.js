/* =====================================================
   Lumis • Atividade 4 — Espelho do Lumis
   Etapa 1: Primeiro o Lumis (vídeo + pista tátil)
   Etapa 2: Agora Você! (câmera + microfone + "Gravar Minha Tentativa")
   Etapa 3: Feedback Carinhoso (acertou / tentar de novo)

   PRIVACIDADE: a câmera serve só de "espelho" e o microfone só é
   analisado ao vivo no próprio aparelho. Nada é gravado, salvo
   ou enviado para a internet. Ao sair da etapa 2, os dois desligam.

   TESTES RÁPIDOS (sem precisar fazer o som):
     atividade-004.html?demo=ok      -> simula uma tentativa que acerta
     atividade-004.html?demo=erro    -> simula uma tentativa que erra (som não detectado)
     atividade-004.html?demo=fora    -> simula o "sssss" certo, mas com a boca fora do quadrado
     atividade-004.html?preview=1    -> libera a etapa 3 e mostra o alternador
   ===================================================== */

(() => {
  "use strict";

  // ---------- Configurações ----------
  const CONFIG = {
    LISTEN_MS: 4500,              // tempo máximo ouvindo a tentativa
    SUCCESS_HIT_MS: 1200,         // quanto tempo de "sssss" é preciso detectar
    HIGH_RATIO: 0.75,             // % da energia do som que precisa estar nos agudos (4–12 kHz)
    MIN_DB_ABOVE_AMBIENT: 8,      // quão mais alto que o barulho do ambiente (em dB)
    STARS_REWARD: 3,              // estrelas pelo acerto (só na 1ª vez)
    MAX_TRIES_BEFORE_SKIP: 3,     // depois de N erros aparece "Continuar a Aventura"

    // enquadramento (boca dentro do quadrado tracejado)
    FRAME_PAD: 0.10,              // folga ao redor do quadrado (10% do tamanho dele)
    MOUTH_MIN: 0.28,              // boca menor que isso (vs. largura do quadrado) = longe demais
    MOUTH_MAX: 1.0,               // boca maior que isso = perto demais
    FRAME_EVERY_MS: 100,          // confere o enquadramento 10x por segundo
  };
  const HAPTIC_SSS = [140, 160, 140, 160, 140];   // "3 toques suaves" no pulso

  // Detector de rosto (MediaPipe). Roda no próprio aparelho; só baixa a biblioteca e o modelo.
  // Para funcionar sem internet, baixe estes arquivos para a sua pasta e troque os endereços.
  const MEDIAPIPE = {
    LIB: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0",
    MODEL: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  };

  const params  = new URLSearchParams(location.search);
  const DEMO    = params.get("demo");              // "ok" | "erro" | null
  const PREVIEW = params.has("preview");

  // ---------- Elementos ----------
  const $ = (id) => document.getElementById(id);
  const tabs   = [null, $("tab1"), $("tab2"), $("tab3")];
  const panels = [null, $("panel1"), $("panel2"), $("panel3")];

  const bandStatus = $("bandStatus"), bandTag = $("bandTag"), starCountEl = $("starCount");

  // etapa 1
  const btnSsss = $("btnSsss"), btnReplay = $("btnReplay"), btnMyTurn = $("btnMyTurn");
  const demoEl = $("demo"), demoVideo = $("demoVideo"), demoPlaceholder = $("demoPlaceholder");
  const tactile = $("tactile");

  // etapa 2
  const camera = $("camera"), camVideo = $("camVideo"), camOffText = $("camOffText"), btnAllow = $("btnAllow");
  const guideBox = $("guideBox");
  const chipMic = $("chipMic"), chipMicText = $("chipMicText"), chipFrame = $("chipFrame"), chipFrameText = $("chipFrameText");
  const micLevel = $("micLevel").querySelectorAll("i");
  const meterText = $("meterText"), meterFill = $("meterFill");
  const btnRecord = $("btnRecord"), recWave = $("recWave"), recBar = $("recBar"), recFill = $("recFill"), recText = $("recText");
  const btnReview = $("btnReview"), coachImg = $("coachImg");

  // etapa 3
  const seg = $("seg"), fbSuccess = $("fbSuccess"), fbRetry = $("fbRetry");
  const starsPillText = $("starsPillText"), retryText = $("retryText");
  const btnAgain = $("btnAgain"), btnContinue = $("btnContinue"), btnReview2 = $("btnReview2");
  const btnTryAgain = $("btnTryAgain"), btnSkip = $("btnSkip");

  // ---------- Estado ----------
  let current = 1;
  let tab3Unlocked = false;
  let rewarded = false;
  let fails = 0;

  // =====================================================
  //  ABAS
  // =====================================================
  function showTab(n) {
    if (n === 3 && !tab3Unlocked) return;
    const leaving = current;
    current = n;

    for (let i = 1; i <= 3; i++) {
      const on = i === n;
      panels[i].hidden = !on;
      tabs[i].classList.toggle("is-active", on);
      tabs[i].setAttribute("aria-selected", String(on));
    }

    if (leaving === 2 && n !== 2) leaveMirror();
    if (n === 2) enterMirror();
    if (n === 1) updateVideoSlot();

    tabs[n].scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  tabs.forEach((t, i) => t && t.addEventListener("click", () => showTab(i)));
  btnMyTurn.addEventListener("click", () => showTab(2));
  btnReview.addEventListener("click", () => showTab(1));
  btnReview2.addEventListener("click", () => showTab(1));
  btnTryAgain.addEventListener("click", () => showTab(2));
  btnAgain.addEventListener("click", () => showTab(2));

  // =====================================================
  //  ETAPA 1 — PRIMEIRO O LUMIS
  // =====================================================

  // Mostra o <video> se algum arquivo carregar; se nenhum existir, mantém o desenho do "ventinho".
  let videoOk = false;
  function updateVideoSlot() {
    demoVideo.hidden = !videoOk;
    demoPlaceholder.hidden = videoOk;
    demoEl.classList.toggle("has-video", videoOk);
    return videoOk;
  }
  // Ajusta o quadro à proporção real do vídeo (entre 4:5 e 16:9), para a boca não ser cortada
  demoVideo.addEventListener("loadedmetadata", () => {
    const w = demoVideo.videoWidth, h = demoVideo.videoHeight;
    if (w && h) {
      const r = Math.min(1.78, Math.max(0.8, w / h));
      demoEl.style.setProperty("--demo-ratio", r.toFixed(4));
    }
    videoOk = true; updateVideoSlot();
  });
  // erro em TODAS as <source> => sem vídeo
  const sources = demoVideo.querySelectorAll("source");
  if (sources.length) {
    sources[sources.length - 1].addEventListener("error", () => { videoOk = false; updateVideoSlot(); });
  }
  demoVideo.addEventListener("error", () => { videoOk = false; updateVideoSlot(); });
  updateVideoSlot();

  demoVideo.addEventListener("click", () => {
    if (demoVideo.paused) demoVideo.play().catch(() => {}); else demoVideo.pause();
  });

  let hapticTimer = null;
  function haptic(pattern, uiMs) {
    if ("vibrate" in navigator) navigator.vibrate(pattern);
    tactile.classList.add("is-active");
    bandStatus.classList.add("is-active");
    bandTag.firstChild.textContent = "Vibrando ";
    clearTimeout(hapticTimer);
    hapticTimer = setTimeout(stopHapticUi, uiMs);
  }
  function stopHapticUi() {
    tactile.classList.remove("is-active");
    bandStatus.classList.remove("is-active");
    bandTag.firstChild.textContent = "Vibração pronto ";
  }

  function playDemo() {
    haptic(HAPTIC_SSS, 2200);
    if (!updateVideoSlot()) playSound("ssss"); // com vídeo, o som é o do próprio vídeo
    if (videoOk) {
      demoVideo.currentTime = 0;
      demoVideo.play().catch(() => {});
    }
  }
  btnSsss.addEventListener("click", playDemo);
  btnReplay.addEventListener("click", playDemo);

  // =====================================================
  //  ETAPA 2 — CÂMERA + MICROFONE
  // =====================================================
  let stream = null, srcNode = null, analyser = null, freqData = null;
  let hasMic = false, hasCam = false;
  let ambientDb = null;
  let rafId = 0, lastTs = 0;

  let listening = false, listenStart = 0, hitMs = 0, soundMs = 0, smooth = 0, lastBuzz = 0;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  async function ensureMedia() {
    if (stream && stream.active) { updateMediaUI(); return; }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      updateMediaUI("Este navegador não consegue ligar a câmera. Tente o Chrome ou o Safari atualizados.");
      return;
    }

    // ruído/eco desligados: senão o navegador "limpa" o sssss achando que é barulho
    const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    const tries = [
      { audio, video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } } },
      { audio },
      { video: { facingMode: "user" } },
    ];

    let denied = false;
    for (const constraints of tries) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (err) {
        if (err && (err.name === "NotAllowedError" || err.name === "SecurityError")) { denied = true; break; }
      }
    }

    if (!stream) {
      updateMediaUI(denied
        ? "Para o Lumis te ver e te ouvir, toque em “Permitir câmera e microfone”."
        : "Não encontrei câmera nem microfone neste aparelho.");
      return;
    }

    hasCam = stream.getVideoTracks().length > 0;
    hasMic = stream.getAudioTracks().length > 0;

    if (hasCam) {
      camVideo.srcObject = stream;
      camVideo.play().catch(() => {});
    }
    if (hasMic) setupAnalyser();
    updateMediaUI();
  }

  function stopMedia() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (srcNode) { try { srcNode.disconnect(); } catch (e) {} }
    stream = null; srcNode = null; analyser = null; freqData = null;
    hasCam = false; hasMic = false; ambientDb = null;
    camVideo.srcObject = null;
  }

  function updateMediaUI(message) {
    camera.classList.toggle("is-off", !hasCam);
    camOffText.textContent = message ||
      (hasCam ? "" : stream ? "Sem câmera por aqui, mas o Lumis consegue te ouvir!" : "Ligando a câmera...");
    btnAllow.hidden = !message;

    chipMic.classList.toggle("is-off", !hasMic);
    chipMicText.textContent = hasMic ? "Microfone Ativo" : "Microfone desligado";
    paintFraming();
  }

  btnAllow.addEventListener("click", async () => {
    camOffText.textContent = "Ligando a câmera...";
    btnAllow.hidden = true;
    await ensureMedia();
  });

  function setupAnalyser() {
    const ac = getCtx();
    if (!ac) return;
    if (ac.state === "suspended") ac.resume();
    srcNode = ac.createMediaStreamSource(stream);
    analyser = ac.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.2;
    freqData = new Float32Array(analyser.frequencyBinCount);
    srcNode.connect(analyser);               // não liga na caixa de som (sem eco)
  }

  // Mede o som: volume total (dB) e quanto dele está nos agudos (onde mora o "sssss")
  function measure() {
    analyser.getFloatFrequencyData(freqData);
    const binHz = getCtx().sampleRate / analyser.fftSize;
    const lowStart  = Math.floor(100 / binHz);
    const midStart  = Math.floor(1500 / binHz);
    const highStart = Math.floor(4000 / binHz);
    const highEnd   = Math.min(freqData.length - 1, Math.floor(12000 / binHz));
    let low = 0, mid = 0, high = 0;
    for (let i = lowStart; i <= highEnd; i++) {
      const p = Math.pow(10, freqData[i] / 10);
      if (i < midStart) low += p; else if (i < highStart) mid += p; else high += p;
    }
    const total = low + mid + high + 1e-12;
    return { db: 10 * Math.log10(total), ratio: high / total };
  }

  // =====================================================
  //  ENQUADRAMENTO — a boca (e os dentes) estão dentro do quadrado?
  //  Usa o MediaPipe Face Landmarker: acha os pontos dos lábios no vídeo
  //  e confere se todos cabem dentro do quadrado tracejado.
  // =====================================================
  let lmState = "idle";                 // idle | loading | ready | failed
  let landmarker = null, lipIdx = null;
  let frameOk = null;                   // null = ainda não sei | true | false
  let frameHint = "", frameHist = [], lastFrameCheck = 0;

  // só dá para exigir o enquadramento se o detector estiver pronto (ou no modo de teste)
  const framingKnown = () => (DEMO ? true : lmState === "ready" && hasCam);

  async function loadFaceLandmarker() {
    if (landmarker || lmState === "loading") return;
    lmState = "loading";
    paintFraming();
    try {
      const { FaceLandmarker, FilesetResolver } = await import(MEDIAPIPE.LIB + "/vision_bundle.mjs");
      const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE.LIB + "/wasm");
      const make = (delegate) => FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MEDIAPIPE.MODEL, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
      });
      try { landmarker = await make("GPU"); } catch (e) { landmarker = await make("CPU"); }
      lipIdx = [...new Set(FaceLandmarker.FACE_LANDMARKS_LIPS.flatMap((c) => [c.start, c.end]))];
      lmState = "ready";
    } catch (e) {
      lmState = "failed";               // sem internet / bloqueado: a atividade segue sem exigir o enquadramento
    }
    paintFraming();
  }

  function resetFraming() {
    frameHist = [];
    lastFrameCheck = 0;
    frameOk = DEMO ? DEMO !== "fora" : null;
    frameHint = DEMO === "fora" ? "Leve a boca para o quadrado ➡️" : "";
    if (DEMO) lmState = "ready";
  }

  // caixa que envolve todos os pontos dos lábios, em pixels da área da câmera
  // (considera o recorte "cover" do vídeo e o efeito espelho)
  function lipsBox(lm, idx, cw, ch, vw, vh) {
    const scale = Math.max(cw / vw, ch / vh);
    const offX = (cw - vw * scale) / 2, offY = (ch - vh * scale) / 2;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const i of idx) {
      const p = lm[i];
      if (!p) continue;
      const x = cw - (offX + p.x * vw * scale);       // espelho
      const y = offY + p.y * vh * scale;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { x0, y0, x1, y1 };
  }

  // a boca está dentro do quadrado? Se não, diz o que fazer.
  function judgeBox(m, g) {
    const mw = m.x1 - m.x0;
    if (mw < g.w * CONFIG.MOUTH_MIN) return { ok: false, hint: "Chegue mais pertinho 🔍" };
    if (mw > g.w * CONFIG.MOUTH_MAX) return { ok: false, hint: "Afaste um pouquinho ↔️" };

    const padX = g.w * CONFIG.FRAME_PAD, padY = g.h * CONFIG.FRAME_PAD;
    const left   = g.x - padX - m.x0;                 // > 0: a boca passou da esquerda
    const right  = m.x1 - (g.x + g.w + padX);
    const top    = g.y - padY - m.y0;
    const bottom = m.y1 - (g.y + g.h + padY);
    const worst = Math.max(left, right, top, bottom);
    if (worst <= 0) return { ok: true, hint: "" };

    const arrow = worst === left ? "➡️" : worst === right ? "⬅️" : worst === top ? "⬇️" : "⬆️";
    return { ok: false, hint: `Leve a boca para o quadrado ${arrow}` };
  }

  function detectFraming(now) {
    if (camVideo.readyState < 2 || !camVideo.videoWidth) return;
    let res;
    try { res = landmarker.detectForVideo(camVideo, now); } catch (e) { return; }
    const lm = res && res.faceLandmarks && res.faceLandmarks[0];

    let r;
    if (!lm) {
      r = { ok: false, hint: "Não achei seu rostinho 🔍" };
    } else {
      const cam = camera.getBoundingClientRect(), g = guideBox.getBoundingClientRect();
      if (!cam.width) return;
      const m = lipsBox(lm, lipIdx, cam.width, cam.height, camVideo.videoWidth, camVideo.videoHeight);
      r = judgeBox(m, { x: g.left - cam.left, y: g.top - cam.top, w: g.width, h: g.height });
    }

    // evita piscar: vale o que aconteceu na maioria das últimas 5 conferências
    frameHist.push(r);
    if (frameHist.length > 5) frameHist.shift();
    const okCount = frameHist.filter((x) => x.ok).length;
    frameOk = okCount >= Math.ceil(frameHist.length * 0.6);
    frameHint = frameOk ? "" : [...frameHist].reverse().find((x) => !x.ok).hint;
    paintFraming();
  }

  function paintFraming() {
    let text, warn = false;
    if (DEMO) { text = frameOk ? "Enquadramento OK" : frameHint; warn = !frameOk; }
    else if (!hasCam) { text = "Aguardando câmera"; warn = true; }
    else if (lmState === "failed") { text = "Enquadramento: não consegui conferir"; warn = true; }
    else if (lmState !== "ready") { text = "Enquadramento: carregando..."; }
    else if (frameOk === true) { text = "Enquadramento OK"; }
    else { text = frameHint || "Procurando seu rostinho..."; warn = frameOk === false; }

    chipFrameText.textContent = text;
    chipFrame.classList.toggle("is-off", warn);
    const known = framingKnown();
    camera.classList.toggle("is-framed", known && frameOk === true);
    camera.classList.toggle("is-misframed", known && frameOk === false);
  }

  function enterMirror() {
    resetMeter();
    recText.textContent = "";
    recText.classList.remove("is-warn");
    resetFraming();
    updateMediaUI();
    startLoop();
    ensureMedia();
    if (!DEMO) loadFaceLandmarker();
  }

  function leaveMirror() {
    if (listening) { listening = false; setRecordingUI(false); }
    stopLoop();
    stopMedia();
    resetFraming();
    updateMediaUI();
  }

  // ---------- laço de análise (a cada quadro) ----------
  function startLoop() { if (!rafId) { lastTs = performance.now(); rafId = requestAnimationFrame(loop); } }
  function stopLoop()  { cancelAnimationFrame(rafId); rafId = 0; }

  function loop(now) {
    rafId = requestAnimationFrame(loop);
    const dt = Math.min(now - lastTs, 100);
    lastTs = now;

    let above = 0, ratio = 0;
    if (analyser) {
      const m = measure();
      if (ambientDb === null) ambientDb = m.db;
      above = m.db - ambientDb;
      ratio = m.ratio;
      // aprende o barulho do ambiente enquanto ninguém está fazendo o som
      if (!listening && above < 6) ambientDb += (m.db - ambientDb) * 0.03;
    }

    // confere se a boca está no quadrado (10x por segundo)
    if (landmarker && hasCam && now - lastFrameCheck >= CONFIG.FRAME_EVERY_MS) {
      lastFrameCheck = now;
      detectFraming(now);
    }

    // barrinhas do microfone
    const lv = clamp(above / 30, 0, 1);
    micLevel[0].style.height = 20 + lv * 70 + "%";
    micLevel[1].style.height = 20 + lv * 100 + "%";
    micLevel[2].style.height = 20 + lv * 60 + "%";

    if (!listening) return;

    const elapsed = now - listenStart;
    let soundHit, target;
    if (DEMO) {
      soundHit = DEMO !== "erro" && elapsed > 600;
      target = DEMO !== "erro" ? (elapsed > 600 ? 0.97 : 0.3) : 0.02;
    } else {
      soundHit = ratio > CONFIG.HIGH_RATIO && above > CONFIG.MIN_DB_ABOVE_AMBIENT;
      target = clamp((above - 3) / 22, 0, 1) * clamp((ratio - 0.5) / 0.4, 0, 1);
    }

    // o ventinho só vale se a boca estiver dentro do quadrado
    const framedNow = framingKnown() ? frameOk === true : true;
    smooth += (target - smooth) * 0.25;
    if (soundHit) soundMs += dt;
    if (soundHit && framedNow) hitMs += dt;

    const pct = Math.round(smooth * 100);
    meterFill.style.width = pct + "%";
    meterText.textContent = pct < 8 ? "Ouvindo..."
      : framedNow ? `Ventinho detectado: ${pct}% 🍃`
      : (frameHint || "Leve a boca para o quadrado");
    recFill.style.width = Math.min(100, (elapsed / CONFIG.LISTEN_MS) * 100) + "%";

    // carinho no pulso enquanto o ventinho está saindo
    if (soundHit && framedNow && now - lastBuzz > 700) {
      lastBuzz = now;
      if ("vibrate" in navigator) navigator.vibrate(40);
    }

    if (hitMs >= CONFIG.SUCCESS_HIT_MS) {
      finish(true);
    } else if (elapsed >= CONFIG.LISTEN_MS) {
      // houve "sssss" suficiente, mas a boca não estava no quadrado -> o problema foi o enquadramento
      finish(false, soundMs >= CONFIG.SUCCESS_HIT_MS * 0.7 ? "frame" : "sound");
    }
  }

  // ---------- gravar minha tentativa ----------
  async function startRecording() {
    if (listening) return;
    recText.classList.remove("is-warn");

    if (!DEMO && !hasMic) await ensureMedia();
    if (!DEMO && !hasMic) {
      recText.textContent = "Não consegui ouvir você. Toque em “Permitir câmera e microfone” e tente de novo.";
      recText.classList.add("is-warn");
      if (btnAllow.hidden && !hasCam) btnAllow.hidden = false;
      return;
    }

    // a boca precisa estar no quadrado antes de começar
    if (framingKnown() && frameOk !== true) {
      recText.textContent = `${frameHint || "Leve a boca para o quadrado"}. Depois toque em “Gravar Minha Tentativa” de novo.`;
      recText.classList.add("is-warn");
      camera.classList.add("nudge");
      setTimeout(() => camera.classList.remove("nudge"), 600);
      return;
    }

    const ac = getCtx();
    if (ac && ac.state === "suspended") await ac.resume();

    listening = true;
    listenStart = performance.now();
    hitMs = 0; soundMs = 0; smooth = 0; lastBuzz = 0;
    setRecordingUI(true);
    startLoop();
  }
  btnRecord.addEventListener("click", startRecording);

  function setRecordingUI(on) {
    btnRecord.disabled = on;
    recWave.hidden = !on;
    recBar.hidden = !on;
    camera.classList.toggle("is-listening", on);
    if (on) {
      recFill.style.width = "0%";
      recText.textContent = "Ouvindo e sentindo o ventinho... 🍃";
      meterText.textContent = "Ouvindo...";
      bandStatus.classList.add("is-active");
      bandTag.firstChild.textContent = "Ouvindo ";
    } else {
      recText.textContent = "";
      bandStatus.classList.remove("is-active");
      bandTag.firstChild.textContent = "Vibração pronto ";
    }
  }

  function resetMeter() {
    smooth = 0;
    meterFill.style.width = "0%";
    meterText.textContent = "Pronto para ouvir";
    recFill.style.width = "0%";
  }

  function finish(ok, reason) {
    if (!listening) return;
    listening = false;
    recFill.style.width = "100%";
    meterText.textContent = ok ? "Ventinho detectado! 🍃" : "Pronto para ouvir";
    btnRecord.disabled = true;               // segura o botão até mudar de etapa
    setTimeout(() => {
      setRecordingUI(false);
      showResult(ok, reason);
    }, ok ? 700 : 500);
  }

  // =====================================================
  //  ETAPA 3 — FEEDBACK CARINHOSO
  // =====================================================
  const RETRY_TEXTS = [
    "O ventinho ainda está tímido. Vamos tentar de novo, soltando o ar bem devagarzinho, como o Lumis fez?",
    "Você está quase lá! Abra um sorriso de leve, deixe os dentinhos pertinho e solte um Sssss bem longo.",
    "Cada tentativa deixa você mais craque! Que tal olhar o Lumis mais uma vez e depois soprar com calma?",
  ];

  // quando o ventinho saiu, mas a boca não estava dentro do quadrado
  const FRAME_RETRY_TEXT =
    "O Lumis ouviu o seu ventinho, mas não viu a sua boquinha no quadrado! Leve o sorriso para o quadrado tracejado e tente de novo.";

  function unlockTab3() {
    tab3Unlocked = true;
    tabs[3].disabled = false;
  }

  function setFbView(view) {
    fbSuccess.hidden = view !== "success";
    fbRetry.hidden = view !== "retry";
    seg.querySelectorAll(".seg__btn").forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
  }

  function showResult(ok, reason) {
    unlockTab3();
    if (ok) {
      if (!rewarded) {
        rewarded = true;
        starCountEl.textContent = String(Number(starCountEl.textContent) + CONFIG.STARS_REWARD);
        starsPillText.textContent = `+${CONFIG.STARS_REWARD} Estrelas Mágicas conquistadas para a Missão!`;
      } else {
        starsPillText.textContent = "Você já tem as Estrelas Mágicas desta Missão. Que sopro lindo!";
      }
      setFbView("success");
      if ("vibrate" in navigator) navigator.vibrate([100, 60, 100, 60, 220]);
      playSound("sucesso");
      confetti();
    } else {
      retryText.textContent = reason === "frame"
        ? FRAME_RETRY_TEXT
        : RETRY_TEXTS[fails % RETRY_TEXTS.length];
      fails += 1;
      btnSkip.hidden = fails < CONFIG.MAX_TRIES_BEFORE_SKIP;
      setFbView("retry");
      if ("vibrate" in navigator) navigator.vibrate(60);
      playSound("tentar");
    }
    showTab(3);
  }

  seg.querySelectorAll(".seg__btn").forEach((b) => b.addEventListener("click", () => setFbView(b.dataset.view)));

  // continuar a aventura: defina data-next="atividade-005.html" nos botões do HTML
  function goNext(btn) {
    window.dispatchEvent(new CustomEvent("atividade004:continuar"));
    const dest = btn.dataset.next;
    if (dest) window.location.href = dest;
  }
  btnContinue.addEventListener("click", () => goNext(btnContinue));
  btnSkip.addEventListener("click", () => goNext(btnSkip));

  // =====================================================
  //  EXTRAS
  // =====================================================

  // se a foto do mascote não carregar, mostra um gatinho no lugar
  coachImg.addEventListener("error", () => {
    const box = coachImg.parentElement;
    coachImg.remove();
    box.textContent = "🐱";
  });

  // privacidade: desliga câmera/microfone se a pessoa trocar de aba do navegador
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && current === 2) { leaveMirrorKeepTab(); }
    else if (!document.hidden && current === 2) { enterMirror(); }
  });
  function leaveMirrorKeepTab() { leaveMirror(); }
  window.addEventListener("pagehide", stopMedia);

  // confete
  function confetti() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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
  //  SONS (Web Audio API — sem arquivos externos)
  // =====================================================
  let audioCtx = null;

  function getCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    return audioCtx;
  }

  function playSound(kind) {
    try {
      const ac = getCtx();
      if (!ac) return;
      if (ac.state === "suspended") ac.resume();
      if (kind === "sucesso") return cheer(ac);
      if (kind === "tentar") return softTry(ac);
      return hiss(ac, 2);
    } catch (e) {
      /* áudio não suportado: segue sem som */
    }
  }

  // "sssss" suave e contínuo
  function hiss(ac, seconds) {
    const t = ac.currentTime;
    const len = Math.floor(ac.sampleRate * seconds);
    const buffer = ac.createBuffer(1, len, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src = ac.createBufferSource();
    src.buffer = buffer;

    const high = ac.createBiquadFilter();
    high.type = "highpass"; high.frequency.value = 4000; high.Q.value = 0.7;
    const low = ac.createBiquadFilter();
    low.type = "lowpass"; low.frequency.value = 9500;

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.16, t + 0.3);
    gain.gain.linearRampToValueAtTime(0.16, t + seconds - 0.5);
    gain.gain.linearRampToValueAtTime(0.0001, t + seconds);

    src.connect(high).connect(low).connect(gain).connect(ac.destination);
    src.start(t);
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

  // duas notinhas suaves para "vamos tentar de novo"
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

  // =====================================================
  //  INÍCIO
  // =====================================================
  if (PREVIEW) {
    unlockTab3();
    seg.hidden = false;
  }
})();