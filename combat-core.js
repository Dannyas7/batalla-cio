/* Batalla CIO — Motor de combate v3
 * Lógica independiente de Canvas, DOM, audio y tasa de refresco.
 * Un avance de advance() equivale siempre a 1/60 de segundo de simulación.
 * Compatible con navegadores y con pruebas automatizadas en Node.js.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BatallaCombat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FPS = 60;
  const STEP_MS = 1000 / FPS;
  const ROUND_SECONDS = 90;
  const FLOOR = 420;
  const LEFT_WALL = 40;
  const RIGHT_WALL = 920;
  const COMBO_CANCELS = {
    quick: ['heavy', 'kick', 'special'],
    heavy: ['special'],
    kick: ['special'],
    airQuick: ['airKick'],
    airHeavy: [],
    airKick: [],
    special: []
  };
  const MOVES = Object.freeze({
    quick:     { startup: 5,  active: 4, recovery: 11, damage: 6,  range: 60,  height: 'mid',  stun: 16, push: 3.6, meter: 8,  guardDamage: 13, lunge: .7 },
    heavy:     { startup: 11, active: 5, recovery: 21, damage: 13, range: 75,  height: 'high', stun: 23, push: 6.4, meter: 12, guardDamage: 24, lunge: 1.6 },
    kick:      { startup: 9,  active: 5, recovery: 17, damage: 9,  range: 83,  height: 'low',  stun: 19, push: 4.8, meter: 10, guardDamage: 20, lunge: 1.1 },
    special:   { startup: 16, active: 9, recovery: 26, damage: 23, range: 151, height: 'mid',  stun: 29, push: 8.5, meter: 0,  guardDamage: 35, lunge: 2.6 },
    airQuick:  { startup: 5,  active: 5, recovery: 12, damage: 7,  range: 58,  height: 'mid',  stun: 16, push: 3.1, meter: 8,  guardDamage: 12, lunge: .5 },
    airHeavy:  { startup: 10, active: 6, recovery: 16, damage: 12, range: 69,  height: 'mid',  stun: 20, push: 5.5, meter: 12, guardDamage: 21, lunge: 1 },
    airKick:   { startup: 8,  active: 7, recovery: 14, damage: 10, range: 72,  height: 'overhead', stun: 20, push: 4.6, meter: 10, guardDamage: 19, lunge: 1.1 }
  });
  const AI_LEVELS = Object.freeze({
    facil:  { reaction: 17, decision: 24, guardChance: .24, aggression: .52, follow: .18, accuracy: .76 },
    normal: { reaction: 9,  decision: 16, guardChance: .56, aggression: .75, follow: .48, accuracy: .89 },
    dificil:{ reaction: 5,  decision: 11, guardChance: .79, aggression: .91, follow: .71, accuracy: 1 }
  });
  const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
  const freshInput = () => ({ dir: 0, crouch: false, guard: false, jump: false, attack: null });

  function createFighter(def, index, x, face, player) {
    return {
      def, index, player, x, y: FLOOR, vx: 0, vy: 0, face,
      hp: 100, meter: 0, guard: 100, guardDelay: 0,
      ground: true, action: 'idle', anim: 0,
      move: null, hitstun: 0, downFrames: 0, wakeup: 0, invuln: 0,
      crouch: false, blocking: false, flash: 0,
      queued: null, queueTime: 0, jumpQueue: 0,
      comboReceived: 0, lastAttacker: 0,
      ai: { think: 1, intention: null, retreat: 0, comboQueued: false }
    };
  }

  function createMatch(p1, p2, options = {}) {
    const state = {
      definitions: [p1, p2],
      indices: [options.pick1 || 0, options.pick2 || 1],
      mode: options.mode === 'versus' ? 'versus' : 'cpu',
      difficulty: AI_LEVELS[options.difficulty] ? options.difficulty : 'normal',
      random: typeof options.random === 'function' ? options.random : Math.random,
      wins: [0, 0], round: 1, tick: 0, roundFrames: ROUND_SECONDS * FPS,
      countdown: 90, hitStop: 0, shake: 0, betweenRounds: false,
      matchOver: false, result: null, events: [], p1: null, p2: null
    };
    resetFighters(state);
    return state;
  }

  function resetFighters(state) {
    state.p1 = createFighter(state.definitions[0], state.indices[0], 270, 1, 1);
    state.p2 = createFighter(state.definitions[1], state.indices[1], 690, -1, 2);
    state.roundFrames = ROUND_SECONDS * FPS;
    state.countdown = 90;
    state.hitStop = 0;
    state.shake = 0;
    state.events.length = 0;
    state.betweenRounds = false;
    state.result = null;
  }

  function nextRound(state) {
    if (!state.betweenRounds || state.matchOver) return false;
    if (state.result !== 'draw') state.round += 1;
    resetFighters(state);
    return true;
  }

  function selectMove(f, kind) {
    if (!kind || !MOVES[kind]) return null;
    if (!f.ground) {
      if (kind === 'special') return null;
      return ({ quick: 'airQuick', heavy: 'airHeavy', kick: 'airKick' })[kind] || null;
    }
    return kind;
  }

  function canStart(f) {
    return f.hitstun === 0 && f.downFrames === 0 && f.wakeup === 0 && f.hp > 0;
  }

  function startMove(s, f, kind) {
    const name = selectMove(f, kind);
    if (!name || !MOVES[name] || (name === 'special' && f.meter < 50)) return false;
    if (name === 'special') f.meter -= 50;
    f.move = {
      ...MOVES[name],
      range: MOVES[name].range + clamp(((f.def.reach || 58) - 58) * .65, -8, 10),
      type: name, frame: 0, hit: false, connected: false
    };
    f.action = name;
    f.blocking = false;
    f.crouch = false;
    f.vx *= .25;
    f.queued = null;
    f.queueTime = 0;
    s.events.push({ type: 'attack', player: f.player, move: name });
    return true;
  }

  function canCancel(f, name) {
    const m = f.move;
    return !!(m && m.connected && name &&
      m.frame >= m.startup + m.active - 1 &&
      (COMBO_CANCELS[m.type] || []).includes(name));
  }

  function tryBufferedMove(s, f) {
    if (!f.queued || !canStart(f)) return;
    const requested = selectMove(f, f.queued);
    if (!requested) return;
    if (!f.move || canCancel(f, requested)) startMove(s, f, f.queued);
  }

  function getHurtBox(f) {
    if (f.downFrames > 0 || f.wakeup > 0 || f.hp <= 0) return null;
    return {
      left: f.x - 20, right: f.x + 20,
      top: f.y - (f.crouch ? 91 : 122), bottom: f.y - 6
    };
  }

  function getAttackBox(f) {
    const m = f.move;
    if (!m || m.frame < m.startup || m.frame >= m.startup + m.active) return null;
    const cy = f.y - (m.height === 'low' ? 32 : m.height === 'high' ? 104 : m.height === 'overhead' ? 61 : 78);
    return {
      left: f.face > 0 ? f.x + 10 : f.x - m.range - 9,
      right: f.face > 0 ? f.x + m.range + 9 : f.x - 10,
      top: cy - (m.height === 'low' ? 15 : 24),
      bottom: cy + (m.height === 'low' ? 18 : 25)
    };
  }

  function overlaps(a, b) {
    return !!(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
  }

  function isBlocked(d, m) {
    if (!d.blocking || !canStart(d) || d.move) return false;
    return m.height === 'mid' || (d.crouch ? m.height === 'low' : m.height === 'high' || m.height === 'overhead');
  }

  function canConnect(a, d) {
    const m = a.move;
    if (!m || m.hit || d.invuln > 0 || d.hp <= 0) return false;
    if (m.height === 'high' && d.crouch) return false;
    if (m.height === 'low' && !d.ground) return false;
    return overlaps(getAttackBox(a), getHurtBox(d));
  }

  function resolveHit(s, a, d, snapshot) {
    const m = snapshot.move;
    if (!m || m.hit) return;
    m.hit = true;
    const blocked = snapshot.blocked;
    let damage = m.damage * (a.def.power || 1) / (d.def.stamina || 1);
    if (blocked) damage *= .14;
    damage = Math.round(damage * 10) / 10;
    d.hp = clamp(d.hp - damage, 0, 100);
    d.meter = clamp(d.meter + (blocked ? 4 : damage * .55), 0, 100);
    a.meter = clamp(a.meter + (blocked ? 3 : m.meter), 0, 100);
    d.guardDelay = 75;
    d.flash = blocked ? 5 : 11;
    d.vx = a.face * (blocked ? 2.1 : m.push);
    if (blocked) {
      d.guard = clamp(d.guard - m.guardDamage, 0, 100);
      d.hitstun = 8;
      d.action = 'block';
      if (d.guard === 0) {
        d.guard = 43;
        d.hitstun = 52;
        d.action = 'hurt';
        s.events.push({ type: 'guardBreak', player: d.player, x: d.x, y: d.y - 88 });
      }
    } else {
      const wasCombo = d.lastAttacker === a.player && (d.hitstun > 0 || d.downFrames > 0);
      d.comboReceived = wasCombo ? d.comboReceived + 1 : 1;
      d.lastAttacker = a.player;
      d.blocking = false;
      d.crouch = false;
      d.move = null;
      d.queued = null;
      d.queueTime = 0;
      d.hitstun = m.stun;
      d.action = 'hurt';
      if (m.type === 'special' || (m.type === 'heavy' && damage >= 14)) {
        d.downFrames = m.type === 'special' ? 41 : 33;
        d.hitstun = 0;
        d.vy = -4.5;
        d.ground = false;
        d.action = 'down';
      }
    }
    m.connected = true;
    s.hitStop = Math.max(s.hitStop, m.type === 'special' ? 8 : m.type === 'heavy' ? 5 : 3);
    s.shake = Math.max(s.shake, m.type === 'special' ? 11 : m.type === 'heavy' ? 6 : 3);
    s.events.push({
      type: 'hit', player: a.player, target: d.player,
      move: m.type, blocked, damage, combo: blocked ? 0 : d.comboReceived,
      x: d.x - a.face * 10, y: d.y - (m.height === 'low' ? 37 : 80)
    });
  }

  function resolveAttacks(s) {
    const a = s.p1, b = s.p2;
    // Capturar ambos impactos antes de aplicar daños permite intercambios justos.
    const hits = [];
    if (canConnect(a, b)) hits.push({ attacker: a, defender: b, move: a.move, blocked: isBlocked(b, a.move) });
    if (canConnect(b, a)) hits.push({ attacker: b, defender: a, move: b.move, blocked: isBlocked(a, b.move) });
    for (const h of hits) resolveHit(s, h.attacker, h.defender, h);
  }

  function updateFighter(s, f, enemy, input) {
    f.anim += .065;
    if (f.flash > 0) f.flash--;
    if (f.invuln > 0) f.invuln--;
    if (f.guardDelay > 0) f.guardDelay--;
    else f.guard = clamp(f.guard + .29, 0, 100);
    if (f.queueTime > 0) f.queueTime--;
    else f.queued = null;
    if (f.jumpQueue > 0) f.jumpQueue--;
    if (input.jump) f.jumpQueue = 7;
    if (input.attack) { f.queued = input.attack; f.queueTime = 13; }

    if (!f.move && f.hitstun === 0 && f.downFrames === 0) {
      f.face = enemy.x >= f.x ? 1 : -1;
    }
    if (f.downFrames > 0) {
      f.downFrames--;
      f.action = 'down';
      f.blocking = false;
      f.crouch = false;
      f.vx *= .83;
      if (f.downFrames === 0) {
        f.wakeup = 14;
        f.invuln = 23;
      }
    } else if (f.wakeup > 0) {
      f.wakeup--;
      f.action = 'getup';
      f.vx *= .8;
    } else if (f.hitstun > 0) {
      f.hitstun--;
      f.action = 'hurt';
      f.vx *= .89;
      f.blocking = false;
    } else {
      tryBufferedMove(s, f);
      if (f.move) {
        const m = f.move;
        m.frame++;
        f.action = m.type;
        f.blocking = false;
        f.crouch = false;
        f.vx *= .6;
        if (m.frame === m.startup) f.vx += f.face * m.lunge;
        tryBufferedMove(s, f);
        if (f.move === m && m.frame >= m.startup + m.active + m.recovery) {
          f.move = null;
          f.action = 'idle';
          tryBufferedMove(s, f);
        }
      } else {
        f.blocking = !!input.guard && f.ground;
        f.crouch = !!input.crouch && f.ground;
        const dir = clamp(input.dir || 0, -1, 1);
        if (!f.ground) {
          f.vx = dir * f.def.speed * .79;
          f.action = 'jump';
        } else if (f.blocking) {
          f.vx = 0;
          f.action = 'block';
        } else if (f.crouch) {
          f.vx = dir * f.def.speed * .42;
          f.action = 'crouch';
        } else {
          f.vx = dir * f.def.speed;
          f.action = dir ? 'walk' : 'idle';
        }
        if (f.jumpQueue > 0 && f.ground && !f.blocking) {
          f.vy = -10.6;
          f.ground = false;
          f.crouch = false;
          f.action = 'jump';
          f.jumpQueue = 0;
        }
        tryBufferedMove(s, f);
      }
    }
    if (!f.ground) {
      f.vy += .53;
      f.y += f.vy;
      if (f.y >= FLOOR) {
        f.y = FLOOR;
        f.vy = 0;
        f.ground = true;
        if (!f.move && f.hitstun === 0 && f.downFrames === 0) f.action = 'idle';
      }
    }
    f.x = clamp(f.x + f.vx, LEFT_WALL, RIGHT_WALL);
    if (f.x === LEFT_WALL && f.vx < 0 || f.x === RIGHT_WALL && f.vx > 0) f.vx = 0;
  }

  function separate(a, b) {
    if (Math.abs(a.y - b.y) > 48 || a.downFrames > 0 || b.downFrames > 0) return;
    const dx = b.x - a.x, dist = Math.abs(dx), minGap = 43;
    if (dist >= minGap) return;
    const dir = dx >= 0 ? 1 : -1;
    const displacement = (minGap - dist) / 2;
    const ax = clamp(a.x - displacement * dir, LEFT_WALL, RIGHT_WALL);
    const bx = clamp(b.x + displacement * dir, LEFT_WALL, RIGHT_WALL);
    a.x = ax;
    b.x = bx;
    if (Math.abs(a.x - b.x) < minGap) {
      if (a.x <= LEFT_WALL + 1) b.x = clamp(a.x + minGap * dir, LEFT_WALL, RIGHT_WALL);
      else if (b.x >= RIGHT_WALL - 1) a.x = clamp(b.x - minGap * dir, LEFT_WALL, RIGHT_WALL);
    }
  }

  function finishRound(s) {
    if (s.betweenRounds) return;
    const a = s.p1, b = s.p2;
    let winner = 0;
    if (a.hp > b.hp) winner = 1;
    else if (b.hp > a.hp) winner = 2;
    if (winner) s.wins[winner - 1]++;
    s.betweenRounds = true;
    s.matchOver = s.wins[0] >= 2 || s.wins[1] >= 2;
    s.result = winner ? `p${winner}` : 'draw';
    s.events.push({ type: 'roundEnd', winner, matchOver: s.matchOver, round: s.round, wins: [...s.wins] });
  }

  function createAiInput(s, f, enemy) {
    const out = freshInput();
    const level = AI_LEVELS[s.difficulty];
    const rng = s.random;
    const ai = f.ai;
    const dist = Math.abs(f.x - enemy.x);
    const toward = enemy.x > f.x ? 1 : -1;
    const threat = enemy.move;
    const canReact = threat && threat.frame >= level.reaction &&
      dist < threat.range + 32 && threat.frame < threat.startup + threat.active;
    if (canReact && rng() < level.guardChance) {
      out.guard = true;
      out.crouch = threat.height === 'low';
      if (threat.height === 'high') out.crouch = true;
      ai.think = Math.max(ai.think, 6);
      return out;
    }
    if (f.move && f.move.connected && !ai.comboQueued &&
      f.move.frame >= f.move.startup + f.move.active - 2) {
      ai.comboQueued = true;
      if (rng() < level.follow) {
        out.attack = f.move.type === 'quick' ? 'heavy' : 'special';
      }
      return out;
    }
    if (!f.move) ai.comboQueued = false;
    if (f.move || f.hitstun > 0 || f.downFrames > 0 || f.wakeup > 0) return out;

    const desired = dist > 120 ? 87 : 67;
    if (dist > desired + 14) out.dir = toward;
    else if (dist < 48 && rng() < .018) out.dir = -toward;
    if (ai.think > 0) {
      ai.think--;
      return out;
    }
    ai.think = level.decision + Math.floor(rng() * level.decision);
    if (dist > 170 && rng() < .10 && !threat) out.jump = true;
    if (dist < 110 && rng() < level.aggression) {
      const r = rng();
      if (f.meter >= 50 && dist <= 145 && r < .27) out.attack = 'special';
      else if (enemy.crouch && r < .64) out.attack = 'kick';
      else if (r < .47) out.attack = 'quick';
      else if (r < .72) out.attack = 'kick';
      else out.attack = 'heavy';
      if (rng() > level.accuracy) out.attack = null;
    } else if (dist <= 145 && f.meter >= 50 && rng() < .29) {
      out.attack = 'special';
    }
    return out;
  }

  function advance(s, inputs = []) {
    if (!s || s.betweenRounds) return;
    s.tick++;
    s.events.length = 0;
    if (s.countdown > 0) {
      s.countdown--;
      if (s.countdown === 0) s.events.push({ type: 'fight' });
      return;
    }
    if (s.hitStop > 0) {
      // Los botones pulsados durante el hit-stop NO se descartan.
      for (const [f, input] of [[s.p1, inputs[0]], [s.p2, inputs[1]]]) {
        if (!input || (f.player === 2 && s.mode === 'cpu')) continue;
        if (input.attack) { f.queued = input.attack; f.queueTime = 13; }
        if (input.jump) f.jumpQueue = 7;
      }
      s.hitStop--;
      return;
    }
    if (s.shake > 0) s.shake = Math.max(0, s.shake - .65);
    s.roundFrames = Math.max(0, s.roundFrames - 1);
    const i1 = inputs[0] || freshInput();
    const i2 = s.mode === 'cpu' ? createAiInput(s, s.p2, s.p1) : (inputs[1] || freshInput());
    updateFighter(s, s.p1, s.p2, i1);
    updateFighter(s, s.p2, s.p1, i2);
    separate(s.p1, s.p2);
    resolveAttacks(s);
    if (s.p1.hp <= 0 || s.p2.hp <= 0 || s.roundFrames <= 0) finishRound(s);
  }

  return { FPS, STEP_MS, ROUND_SECONDS, FLOOR, MOVES, AI_LEVELS, createMatch, nextRound, advance,
    getAttackBox, getHurtBox, overlaps, createAiInput, freshInput };
});
