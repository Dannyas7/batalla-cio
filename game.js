(() => {
'use strict';

const $ = id => document.getElementById(id);
const Engine = window.BatallaCombat;
if (!Engine) throw new Error('No se pudo cargar combat-core.js');
const roster = [
 {id:'daniel',name:'Daniel',tag:'CONTROL DE PROCESOS',color:'#20436c',dark:'#111b33',skin:'#e8aa85',hair:'#d5dce3',accent:'#54caff',special:'EMBESTIDA CIO',power:1.02,speed:3.65,reach:57,beard:false},
 {id:'pancho',name:'Pancho',tag:'MAESTRO DEL CONTRAATAQUE',color:'#272c3d',dark:'#192137',skin:'#d99b75',hair:'#251d1e',accent:'#ff9c42',special:'GANCHO VELOZ',power:1.06,speed:3.8,reach:59,glasses:true,beard:true},
 {id:'alexis',name:'Alexis',tag:'MIYAGI · COMBATE TÉCNICO',color:'#66533a',dark:'#283d45',skin:'#c78a66',hair:'#aab6ba',accent:'#53d9ef',special:'FURIA MIYAGI',power:1.12,speed:3.25,reach:67,beard:true},
 {id:'lucho',name:'Lucho',tag:'PODER INDUSTRIAL',color:'#a7cceb',dark:'#283b56',skin:'#c58662',hair:'#292326',accent:'#ffbe4a',special:'GOLPE INDUSTRIAL',power:1.15,speed:3.05,reach:65,beard:true,stamina:1.05}
];
const STAGES = [
 {id:'pampa',name:'PAMPA',subtitle:'DESIERTO DE ATACAMA',src:'assets/stages/pampa.png'},
 {id:'concentradora',name:'PLANTA CONCENTRADORA',subtitle:'EL SALVADOR',src:'assets/stages/concentradora.png'},
 {id:'cio',name:'SALA CIO',subtitle:'CENTRO DE OPERACIONES',src:'cio_control_room.png'}
];
let stagePick = 0;
const loadedStages = Object.fromEntries(STAGES.map(s => { const img = new Image(); img.src = s.src; return [s.id,img]; }));
const loadedSprites = Object.fromEntries(roster.map(f => { const img = new Image(); img.src = `assets/sprites/${f.id}.png`; return [f.id,img]; }));


const canvas = $('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

let mode = 'cpu';
let difficulty = 'normal';
let pick1 = 0;
let pick2 = 1;
let match = null;
let paused = false;
let raf = 0;
let lastFrame = 0;
let accumulator = 0;
let audioCtx = null;
let muted = false;
let hitboxesVisible = false;
let message = '';
let messageFrames = 0;
let particles = [];
let comboText = '';
let comboFrames = 0;
const heldKeys = new Set();
const edgeKeys = new Set();
const touchHeld = new Set();
const touchEdges = new Set();
const pointerKeys = new Map();
const padWasDown = [[], []];
const CONTROLS = [
  { left: 'a', right: 'd', jump: 'w', crouch: 's', quick: 'j', heavy: 'k', kick: 'l', guard: 'i', special: 'u' },
  { left: 'arrowleft', right: 'arrowright', jump: 'arrowup', crouch: 'arrowdown', quick: '1', heavy: '2', kick: '3', guard: '0', special: '4' }
];
const ignoredBrowserKeys = new Set(['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ']);
const soundByMove = {
  quick: [335, .045, 'square'], heavy: [220, .065, 'sawtooth'],
  kick: [270, .06, 'square'], special: [145, .14, 'sawtooth'],
  airQuick: [345, .05, 'square'], airHeavy: [240, .06, 'sawtooth'],
  airKick: [295, .05, 'square']
};

function makeCard(person, index, selected, side) {
  const button = document.createElement('button');
  button.className = 'char-card' + (selected ? ' selected' : '');
  button.type = 'button';
  button.setAttribute('aria-pressed', String(selected));
  const portrait = document.createElement('img');
  portrait.src = `assets/portraits/${person.id}.webp`;
  portrait.alt = `Retrato de ${person.name}`;
  portrait.loading = 'eager';
  const label = document.createElement('b');
  label.textContent = person.name;
  const description = document.createElement('small');
  description.textContent = person.tag;
  button.append(portrait, label, description);
  button.addEventListener('click', () => {
    if (side === 1) pick1 = index;
    else pick2 = index;
    renderRosters();
  });
  return button;
}

function renderRosters() {
  $('chars1').replaceChildren(...roster.map((p, i) => makeCard(p, i, pick1 === i, 1)));
  $('chars2').replaceChildren(...roster.map((p, i) => makeCard(p, i, pick2 === i, 2)));
  $('rival-label').textContent = mode === 'cpu' ? 'RIVAL CPU' : 'JUGADOR 2';
  $('cpu-options').classList.toggle('hidden', mode !== 'cpu');
  $('touch-controls').classList.toggle('hidden', mode === 'versus' || !match);
}

function renderStages() {
  const wrap = $('stages');
  if (!wrap) return;
  wrap.replaceChildren(...STAGES.map((stage, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stage-card' + (i === stagePick ? ' selected' : '');
    button.setAttribute('aria-pressed', String(i === stagePick));
    button.innerHTML = `<img src="${stage.src}" alt=""><strong>${stage.name}</strong><small>${stage.subtitle}</small>`;
    button.addEventListener('click', () => { stagePick = i; renderStages(); });
    return button;
  }));
}


function setMode(next) {
  mode = next;
  document.querySelectorAll('.mode').forEach(b => {
    const active = b.dataset.mode === mode;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
  renderRosters();
}

function setDifficulty(next) {
  if (!Engine.AI_LEVELS[next]) return;
  difficulty = next;
  document.querySelectorAll('[data-difficulty]').forEach(b => {
    const active = b.dataset.difficulty === difficulty;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
}

document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
document.querySelectorAll('[data-difficulty]').forEach(b => b.addEventListener('click', () => setDifficulty(b.dataset.difficulty)));

function clearInputs() {
  heldKeys.clear();
  edgeKeys.clear();
  touchHeld.clear();
  touchEdges.clear();
  pointerKeys.clear();
  document.querySelectorAll('[data-touch]').forEach(b => b.classList.remove('is-down'));
  padWasDown[0] = [];
  padWasDown[1] = [];
}

function beginMatch() {
  cancelAnimationFrame(raf);
  clearInputs();
  match = Engine.createMatch(roster[pick1], roster[pick2], { pick1, pick2, mode, difficulty });
  match.stage = STAGES[stagePick].id;
  paused = false;
  particles = [];
  comboFrames = 0;
  messageFrames = 0;
  $('menu').classList.add('hidden');
  $('arena').classList.remove('hidden');
  $('overlay').classList.add('hidden');
  $('pause-tag').classList.add('hidden');
  $('special1').textContent = 'ESPECIAL: ' + match.p1.def.special;
  $('special2').textContent = 'ESPECIAL: ' + match.p2.def.special;
  $('touch-controls').classList.toggle('hidden', mode === 'versus');
  lastFrame = performance.now();
  accumulator = 0;
  updateHud();
  beep(520, .08, 'triangle');
  raf = requestAnimationFrame(frame);
}

function advanceRoundOrRematch() {
  if (!match || !match.betweenRounds) return;
  if (match.matchOver) return beginMatch();
  Engine.nextRound(match);
  $('overlay').classList.add('hidden');
  particles = [];
  comboFrames = 0;
  clearInputs();
  accumulator = 0;
  updateHud();
}

function backMenu() {
  cancelAnimationFrame(raf);
  match = null;
  paused = false;
  clearInputs();
  $('arena').classList.add('hidden');
  $('menu').classList.remove('hidden');
  $('touch-controls').classList.add('hidden');
  $('pause-tag').classList.add('hidden');
}

$('start').addEventListener('click', beginMatch);
$('rematch').addEventListener('click', advanceRoundOrRematch);
$('back-menu').addEventListener('click', backMenu);
$('back-from-pause').addEventListener('click', backMenu);
$('resume').addEventListener('click', () => togglePause(false));
$('pause-button').addEventListener('click', () => togglePause());
$('mute-button').addEventListener('click', toggleMute);

function toggleMute() {
  muted = !muted;
  $('mute-button').textContent = muted ? 'SONIDO OFF' : 'SONIDO ON';
  $('mute-button').setAttribute('aria-pressed', String(muted));
}

function togglePause(force) {
  if (!match || match.betweenRounds) return;
  paused = typeof force === 'boolean' ? force : !paused;
  $('pause-tag').classList.toggle('hidden', !paused);
  if (!paused) {
    edgeKeys.clear();
    touchEdges.clear();
    accumulator = 0;
    lastFrame = performance.now();
  }
}

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (match && (ignoredBrowserKeys.has(k) || Object.values(CONTROLS[0]).includes(k) || Object.values(CONTROLS[1]).includes(k))) {
    e.preventDefault();
  }
  if (!match) return;
  if (!heldKeys.has(k)) {
    if (k === 'escape') { e.preventDefault(); togglePause(); }
    else if (k === 'enter' && match.betweenRounds) { e.preventDefault(); advanceRoundOrRematch(); }
    else if (k === 'm') toggleMute();
    else if (k === 'h') {
      hitboxesVisible = !hitboxesVisible;
      message = hitboxesVisible ? 'CAJAS DE COLISIÓN: ON' : 'CAJAS DE COLISIÓN: OFF';
      messageFrames = 90;
    }
    if (!paused && !match.betweenRounds) edgeKeys.add(k);
  }
  heldKeys.add(k);
});
window.addEventListener('keyup', e => heldKeys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => {
  if (match && !match.betweenRounds) togglePause(true);
  clearInputs();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && match && !match.betweenRounds) {
    togglePause(true);
    clearInputs();
  }
});

// Cada dedo controla independientemente su botón; no bloquea los demás toques.
for (const button of document.querySelectorAll('[data-touch]')) {
  button.addEventListener('pointerdown', event => {
    if (!match || paused || match.betweenRounds) return;
    event.preventDefault();
    const key = button.dataset.touch;
    pointerKeys.set(event.pointerId, { button, key });
    if (!touchHeld.has(key)) touchEdges.add(key);
    touchHeld.add(key);
    button.classList.add('is-down');
    try { button.setPointerCapture(event.pointerId); } catch (_) { /* no-op */ }
  });
}
function releasePointer(event) {
  const press = pointerKeys.get(event.pointerId);
  if (!press) return;
  pointerKeys.delete(event.pointerId);
  if (![...pointerKeys.values()].some(p => p.key === press.key)) touchHeld.delete(press.key);
  if (![...pointerKeys.values()].some(p => p.button === press.button)) press.button.classList.remove('is-down');
}
window.addEventListener('pointerup', releasePointer);
window.addEventListener('pointercancel', releasePointer);

function gamepadInput(player) {
  const empty = { dir: 0, crouch: false, guard: false, jump: false, attack: null };
  if (typeof navigator.getGamepads !== 'function') return empty;
  const pads = navigator.getGamepads();
  const pad = pads && [...pads].filter(Boolean)[player - 1];
  if (!pad) { padWasDown[player - 1] = []; return empty; }
  const was = padWasDown[player - 1];
  const down = i => !!(pad.buttons[i] && pad.buttons[i].pressed);
  const edge = i => down(i) && !was[i];
  const x = pad.axes && pad.axes.length ? pad.axes[0] : 0;
  empty.dir = down(14) || x < -.35 ? -1 : down(15) || x > .35 ? 1 : 0;
  empty.crouch = down(13) || (pad.axes && pad.axes.length > 1 && pad.axes[1] > .65);
  empty.guard = down(4) || down(6);
  empty.jump = edge(5) || edge(12);
  empty.attack = edge(3) ? 'special' : edge(2) ? 'heavy' : edge(1) ? 'kick' : edge(0) ? 'quick' : null;
  padWasDown[player - 1] = Array.from({ length: pad.buttons.length }, (_, i) => down(i));
  return empty;
}

function readInput(player) {
  const c = CONTROLS[player - 1];
  const touch = player === 1;
  const down = name => heldKeys.has(c[name]) || (touch && touchHeld.has(name));
  const edge = name => edgeKeys.has(c[name]) || (touch && touchEdges.has(name));
  const gp = gamepadInput(player);
  const dir = (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
  return {
    dir: dir || gp.dir,
    crouch: down('crouch') || gp.crouch,
    guard: down('guard') || gp.guard,
    jump: edge('jump') || gp.jump,
    attack: edge('special') ? 'special' : edge('heavy') ? 'heavy' :
      edge('kick') ? 'kick' : edge('quick') ? 'quick' : gp.attack
  };
}

function resetEdges() {
  edgeKeys.clear();
  touchEdges.clear();
}

function spawnImpact(hit) {
  const color = hit.blocked ? '#74e1ff' : hit.move === 'special' ? '#ffe45c' : '#ffa85d';
  const count = hit.blocked ? 9 : hit.move === 'special' ? 23 : 13;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 1.8 + Math.random() * 4;
    particles.push({ x: hit.x, y: hit.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: 13 + Math.floor(Math.random() * 14), max: 27, color,
      size: hit.move === 'special' ? 5 : 3 });
  }
  particles = particles.slice(-150);
}

function playEvents() {
  for (const e of match.events) {
    if (e.type === 'attack') {
      const [freq, seconds, wave] = soundByMove[e.move];
      beep(freq, seconds, wave);
    } else if (e.type === 'hit') {
      spawnImpact(e);
      beep(e.blocked ? 480 : 115, e.blocked ? .045 : .10, e.blocked ? 'triangle' : 'sawtooth');
      if (!e.blocked) {
        comboText = e.combo >= 2 ? `${e.combo} GOLPES · COMBO` : e.move === 'special' ? '¡ESPECIAL CIO!' : '';
        comboFrames = 55;
      }
    } else if (e.type === 'guardBreak') {
      message = `¡GUARDIA ROTA! · JUGADOR ${e.player}`;
      messageFrames = 85;
      beep(85, .18, 'sawtooth');
    } else if (e.type === 'fight') {
      message = '¡PELEEN!';
      messageFrames = 55;
      beep(560, .16, 'triangle');
    } else if (e.type === 'roundEnd') {
      showRoundResult(e);
      beep(e.winner === 0 ? 310 : 660, .20, 'triangle');
    }
  }
}

function showRoundResult(result) {
  const wins = result.wins;
  const name = result.winner === 1 ? match.p1.def.name : match.p2.def.name;
  $('overlay').classList.remove('hidden');
  $('result-kicker').textContent = match.matchOver ? 'RESULTADO FINAL' : `FIN DE LA RONDA ${result.round}`;
  $('result-title').textContent = result.winner ? `¡${name.toUpperCase()} GANA!` : '¡EMPATE!';
  $('result-sub').textContent = match.matchOver
    ? `¡Victoria al mejor de 3! · ${wins[0]} - ${wins[1]}`
    : result.winner ? `Marcador: ${wins[0]} - ${wins[1]} · ¡La siguiente ronda decide!` : 'Ningún punto otorgado. Se repite la ronda.';
  $('rematch').textContent = match.matchOver ? 'REVANCHA ↻' : result.winner ? 'SIGUIENTE RONDA ▶' : 'REPETIR RONDA ↻';
  resetEdges();
}

function updateHud() {
  if (!match) return;
  const { p1, p2 } = match;
  for (const [n, f] of [[1, p1], [2, p2]]) {
    $('health' + n).style.width = f.hp + '%';
    $('meter' + n).style.width = f.meter + '%';
    $('guard' + n).style.width = f.guard + '%';
    $('health' + n).setAttribute('aria-label', `Vida jugador ${n}: ${Math.ceil(f.hp)}%`);
    $('name' + n).textContent = f.def.name.toUpperCase();
    $('tag' + n).textContent = f.def.tag;
    $('portrait' + n).textContent = '';
    $('portrait' + n).style.backgroundImage = `url(assets/portraits/${f.def.id}.webp)`;
    $('portrait' + n).setAttribute('aria-label', `Retrato de ${f.def.name}`);
  }
  $('timer').textContent = String(Math.ceil(match.roundFrames / Engine.FPS)).padStart(2, '0');
  $('round-label').textContent = 'RONDA ' + match.round;
  $('score1').textContent = '●'.repeat(match.wins[0]) + '○'.repeat(2 - match.wins[0]);
  $('score2').textContent = '●'.repeat(match.wins[1]) + '○'.repeat(2 - match.wins[1]);
  $('status').textContent = match.betweenRounds ? 'FIN' :
    match.countdown > 0 ? String(Math.ceil(match.countdown / Engine.FPS)) : '¡PELEEN!';
  $('combo').textContent = comboFrames > 0 ? comboText : '';
}

// Bucle de simulación con timestep fijo. Si hay retrasos, se limita el catch-up.
// El navegador solo dibuja; no determina la rapidez del combate.
function frame(now) {
  if (!match) return;
  const delta = Math.max(0, Math.min(now - lastFrame, 100));
  lastFrame = now;
  if (!paused && !match.betweenRounds) {
    accumulator += delta;
    let steps = 0;
    while (accumulator >= Engine.STEP_MS && steps < 6 && !match.betweenRounds) {
      const i1 = readInput(1);
      const i2 = match.mode === 'versus' ? readInput(2) : null;
      Engine.advance(match, [i1, i2]);
      playEvents();
      resetEdges();
      accumulator -= Engine.STEP_MS;
      steps++;
      if (comboFrames > 0) comboFrames--;
      if (messageFrames > 0) messageFrames--;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += .10;
        p.life--;
      }
      particles = particles.filter(p => p.life > 0);
    }
    if (steps === 6) accumulator = 0;
  }
  updateHud();
  draw();
  raf = requestAnimationFrame(frame);
}

function drawCollisionBox(b, stroke, fill) {
  if (!b) return;
  ctx.fillStyle = fill;
  ctx.fillRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.strokeRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
}

function draw() {
  if (!match) return;
  const shake = match.shake || 0;
  ctx.save();
  if (!paused && !match.betweenRounds) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
  drawStage();
  for (const f of [match.p1, match.p2]) {
    drawSpriteFighter(f);
  }
  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life / 13);
    rect(ctx, p.x, p.y, p.size, p.size, p.color);
  }
  ctx.globalAlpha = 1;
  if (hitboxesVisible) {
    for (const f of [match.p1, match.p2]) {
      drawCollisionBox(Engine.getHurtBox(f), '#54d7ff', '#54d7ff25');
      drawCollisionBox(Engine.getAttackBox(f), '#ff5a75', '#ff5a7533');
    }
  }
  if (comboFrames > 0 && comboText) {
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#35112a';
    ctx.strokeText(comboText, 480, 147);
    ctx.fillStyle = '#ffe45c';
    ctx.fillText(comboText, 480, 147);
  }
  if (messageFrames > 0 && message && !match.betweenRounds) {
    ctx.font = 'bold 27px monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#15162e';
    ctx.strokeText(message, 480, 185);
    ctx.fillStyle = '#fef4bc';
    ctx.fillText(message, 480, 185);
  }
  ctx.restore();
}

function drawStage() {
 const stageId = match?.stage || STAGES[stagePick].id;
 ctx.clearRect(0,0,960,540);
 const img=loadedStages[stageId];
 if (img?.complete && img.naturalWidth) ctx.drawImage(img,0,0,960,451);
 else { ctx.fillStyle='#284776'; ctx.fillRect(0,0,960,455); }
 const isPampa = stageId==='pampa';
 const isPlant = stageId==='concentradora';
 let ground = ctx.createLinearGradient(0,415,0,540);
 if (isPampa) {ground.addColorStop(0,'#9c5a35');ground.addColorStop(.43,'#68402d');ground.addColorStop(1,'#372937');}
 else if (isPlant) {ground.addColorStop(0,'#47546a');ground.addColorStop(.45,'#272e42');ground.addColorStop(1,'#141d30');}
 else {ground.addColorStop(0,'#414e69');ground.addColorStop(.4,'#273552');ground.addColorStop(1,'#141d30');}
 ctx.fillStyle=ground;ctx.fillRect(0,420,960,120);
 // Ground contact strip; drawn below foot sprites.
 ctx.fillStyle = isPampa?'#d48b4e':isPlant?'#e3a736':'#e9b74e';ctx.fillRect(0,419,960,4);
 ctx.strokeStyle=isPampa?'#a36746':'#52617a';ctx.lineWidth=1;
 for(let i=0;i<15;i++){
  ctx.beginPath();ctx.moveTo(i*82-55,445);ctx.lineTo(480+(i-7)*135,540);ctx.stroke();
 }
 for(let i=0;i<16;i++){
  const x=(i*109 + 47)%960, y=436+(i*33)%94;
  rect(ctx,x,y,isPampa?12:17,2,isPampa?'#c27b4b':'#59677c');
 }
 ctx.save();ctx.fillStyle='#071427aa';ctx.fillRect(13,12,303,37);
 ctx.strokeStyle='#ffce65';ctx.strokeRect(13,12,303,37);
 ctx.fillStyle='#f8f6ef';ctx.font='bold 16px monospace';ctx.textAlign='left';
 const selected=STAGES.find(s=>s.id===stageId);
 ctx.fillText(selected.name,24,35);ctx.restore();
}
function drawSpriteFighter(f){
 const sprite=loadedSprites[f.def.id];
 if(!sprite?.complete || !sprite.naturalWidth){
   drawFighter(ctx,f.def,f.x,f.y,1,f.action,f.face,f.anim,f.move,f.flash);return;
 }
 const t=Math.floor(f.anim*5);
 let frameIndex=0;
 switch(f.action){
  case 'walk': frameIndex=1+(t%2);break;
  case 'jump':frameIndex=5;break;
  case 'crouch':case 'getup':frameIndex=6;break;
  case 'block':frameIndex=7;break;
  case 'quick':case 'airQuick':frameIndex=f.move&&f.move.frame<f.move.startup?7:8;break;
  case 'heavy':case 'airHeavy':frameIndex=f.move&&f.move.frame<f.move.startup?7:10;break;
  case 'kick':case 'airKick':frameIndex=f.move&&f.move.frame<f.move.startup?7:9;break;
  case 'special':frameIndex=f.move&&f.move.frame<f.move.startup?7:11;break;
  case 'hurt':frameIndex=7;break;
  default:frameIndex=0;
 }
 const scale=1.21, w=168*scale,h=132*scale;
 const bob=(f.action==='idle'?Math.sin(f.anim*4)*1.6:0);
 ctx.save();ctx.translate(Math.round(f.x),Math.round(f.y+bob));ctx.scale(f.face,1);
 ctx.fillStyle='#050b1b7b';ctx.beginPath();ctx.ellipse(0,1,41,8,0,0,Math.PI*2);ctx.fill();
 if(f.action==='down') {ctx.translate(0,-18);ctx.rotate(-Math.PI/2);ctx.translate(25,0);frameIndex=0;}
 const sx=(frameIndex%4)*168, sy=Math.floor(frameIndex/4)*132;
 ctx.drawImage(sprite,sx,sy,168,132,-w/2,-h+9*scale,w,h);
 if(f.flash>0){ctx.globalCompositeOperation='source-atop';ctx.fillStyle=f.flash>5?'#fff2e477':'#ff393951';ctx.fillRect(-w/2,-h,w,h);ctx.globalCompositeOperation='source-over';}
 ctx.restore();
}
function rect(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h))}
function drawFighter(c,p,x,y,scale,action,face,anim,attack=null,flash=0){c.save();c.translate(x,y);c.scale(face,1);c.scale(scale||1,scale||1);if(action==='down'){c.translate(0,-20);c.rotate(-Math.PI/2);c.translate(0,65)}const bob=action==='idle'?Math.sin(anim*5)*2:action==='walk'?Math.sin(anim*13)*3:0;const crouch=(action==='crouch'||action==='getup')?13:0;const hurt=action==='hurt';const lean=attack?(attack.type==='heavy'?8:attack.type==='kick'?4:2):0;const legSwing=action==='walk'?Math.sin(anim*13)*7:0;
// shadow
c.fillStyle='#090d1b88';c.beginPath();c.ellipse(0,4,34,7,0,0,Math.PI*2);c.fill();
// boots and legs
rect(c,-17+legSwing*.25,-36+crouch,13,35,p.dark);rect(c,5-legSwing*.25,-36+crouch,13,35,p.dark);rect(c,-20+legSwing*.25,-5+crouch,19,7,'#49352d');rect(c,3-legSwing*.25,-5+crouch,20,7,'#49352d');rect(c,-16,-31+crouch,10,4,p.accent);rect(c,6,-31+crouch,10,4,p.accent);
// body and vest
const bulk=p.bulk||1;rect(c,-22*bulk,-83+crouch+ bob,44*bulk,48,p.dark);rect(c,-20*bulk,-82+crouch+bob,40*bulk,42,p.color);rect(c,-4,-80+crouch+bob,8,38,p.dark);rect(c,-17,-75+crouch+bob,8,5,'#f4d86a');rect(c,9,-75+crouch+bob,8,5,'#f4d86a');rect(c,-19,-44+crouch+bob,38,6,p.dark);
// arms with attack pose
let armX=attack? (attack.type==='kick'?16:28+lean): action==='block'?15:action==='hurt'?-21:20;let armY=attack?-73:action==='block'?-91:action==='hurt'?-68:-70;rect(c,armX-4,armY+crouch+bob,13,25,p.color);rect(c,armX+1,armY+17+crouch+bob,14,12,p.skin);rect(c,-27,action==='block'?-90+crouch+bob:-70+crouch+bob,12,24,p.color);rect(c,-29,action==='block'?-96+crouch+bob:-51+crouch+bob,14,12,p.skin);
// neck/head
rect(c,-8,-94+crouch+bob,16,13,p.skin);rect(c,-17,-121+crouch+bob,34,30,p.skin);rect(c,-18,-125+crouch+bob,36,12,p.hair);rect(c,-21,-119+crouch+bob,7,19,p.hair);rect(c,13,-118+crouch+bob,7,13,p.hair);if(p.whiteHair){rect(c,-23,-132+crouch+bob,12,12,p.hair);rect(c,-9,-137+crouch+bob,11,13,p.hair);rect(c,5,-133+crouch+bob,14,10,p.hair);rect(c,16,-126+crouch+bob,9,8,p.hair)}if(p.hairLong){rect(c,15,-116+crouch+bob,9,32,p.hair);rect(c,17,-91+crouch+bob,7,10,p.hair)}
// eyes, expression, facial hair and glasses
rect(c,-9,-111+crouch+bob,5,4,'#171827');rect(c,6,-111+crouch+bob,5,4,'#171827');rect(c,1,-105+crouch+bob,4,8,'#a96951');rect(c,-4,-99+crouch+bob,11,3,'#713e36');if(p.beard){rect(c,-11,-101+crouch+bob,23,8,p.hair);rect(c,-6,-96+crouch+bob,13,4,p.hair)}if(p.glasses){rect(c,-13,-115+crouch+bob,12,10,'#171827');rect(c,2,-115+crouch+bob,12,10,'#171827');rect(c,-1,-112+crouch+bob,4,2,'#171827');rect(c,-11,-113+crouch+bob,7,5,'#9fdcff');rect(c,4,-113+crouch+bob,7,5,'#9fdcff')}
// pixel highlights
rect(c,-17,-121+crouch+bob,8,3,p.accent);rect(c,-20,-80+crouch+bob,5,20,'#ffffff22');if(flash>0){rect(c,-23,-126,47,124,'#ffffff55')}
// attack effect
if(attack&&attack.frame>=attack.startup-2&&attack.frame<=attack.startup+attack.active){c.fillStyle=attack.type==='special'?'#ffe45c':'#f9f3d0';c.beginPath();c.ellipse(attack.type==='special'?95:55,attack.type==='kick'?-42:-78,attack.type==='special'?34:20,attack.type==='special'?22:12,-.3,0,Math.PI*2);c.fill();c.fillStyle=attack.type==='special'?'#ff743f':'#ffffff';c.fillRect(attack.type==='special'?68:40,attack.type==='kick'?-48:-82,attack.type==='special'?48:24,5)}
// special flare
if(attack&&attack.type==='special'){c.fillStyle='#ffd34d';for(let i=0;i<6;i++)c.fillRect(48+i*9,-100-(i%2)*12,5,5)}c.restore()}

function beep(freq, duration, wave) {
  if (muted) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = wave;
    o.frequency.value = freq;
    g.gain.setValueAtTime(.035, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + duration);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + duration);
  } catch (_) { /* AudioContext opcional */ }
}

renderRosters();
renderStages();
setDifficulty('normal');
})();
