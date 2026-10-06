(function(){
  /* ===== Configuração (ajuste pelo seu backend/JSON do projeto) ===== */
  var state = { page:5, totalPages:8, step:5, stepName:'Olá, amiguinho!', battery:98, vibrotactile:true, nextUrl:null };

  var $ = function(id){ return document.getElementById(id); };

  function render(){
    $('pgNow').textContent = state.page;
    $('pgTotal').textContent = state.totalPages;
    $('stepNow').textContent = state.step;
    $('stepName').textContent = state.stepName;
    $('batTxt').textContent = state.battery + '%';
    $('bat').style.setProperty('--lvl', state.battery + '%');
    $('vibPill').style.display = state.vibrotactile ? '' : 'none';
    var dots = $('dots'); dots.innerHTML = '';
    var shown = Math.min(state.totalPages, 4);
    for (var i = 0; i < shown; i++){
      var d = document.createElement('i');
      if (i === 0) d.className = 'on';
      dots.appendChild(d);
    }
  }
  render();

  /* ===== Interações ===== */
  function buzz(ms){ try{ if (navigator.vibrate) navigator.vibrate(ms); }catch(e){} }

  $('startBtn').addEventListener('click', function(){
    buzz(40);
    // Evento para o restante do sistema (Raspberry Pi / backend / outros módulos)
    window.dispatchEvent(new CustomEvent('lumis:start', { detail:{ page:state.page } }));
    if (state.nextUrl) window.location.href = state.nextUrl;
  });

  var synth = window.speechSynthesis, speaking = false;
  var icoPlay = 'M7 4.500v15l13-7.500z', icoStop = 'M6 6h12v12H6z';
  function setPlaying(on){
    speaking = on;
    $('listenBtn').classList.toggle('playing', on);
    $('listenIcon').firstElementChild.setAttribute('d', on ? icoStop : icoPlay);
  }
  $('listenBtn').addEventListener('click', function(){
    buzz(25);
    if (!synth){ return; }
    if (speaking){ synth.cancel(); setPlaying(false); return; }
    var u = new SpeechSynthesisUtterance('Eu sou o Lumis! Seu novo amigo interativo e protetor. ' + $('speech').textContent);
    u.lang = 'pt-BR'; u.rate = .95; u.pitch = 1.15;
    u.onend = u.onerror = function(){ setPlaying(false); };
    setPlaying(true); synth.speak(u);
  });

  // Bloqueia zoom por gesto e menu de contexto (comportamento de quiosque)
  document.addEventListener('gesturestart', function(e){ e.preventDefault(); });
  document.addEventListener('contextmenu', function(e){ e.preventDefault(); });

  // API simples para outros módulos atualizarem a interface
  window.LumisUI = {
    set: function(patch){ for (var k in patch) state[k] = patch[k]; render(); }
  };
})();