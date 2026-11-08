const assert = require('node:assert/strict');
const E = require('./combat-core');
const defs = [
  {name:'A',speed:3.5,power:1,reach:56,stamina:1},
  {name:'B',speed:3.5,power:1,reach:56,stamina:1}
];
function setup(mode='versus') {
 const s=E.createMatch(...defs,{mode,random:()=>.3});
 s.countdown=0;s.p1.x=420;s.p2.x=485;
 return s;
}
function step(s, a={}, b={}, frames=1){ for(let i=0;i<frames;i++) E.advance(s,[a,b]); }
function test(name, fn){ try{fn(); console.log('PASS',name)}catch(err){console.error('FAIL',name,err.stack);process.exitCode=1;} }

test('Simulación fija 60 FPS y contador',()=>{
 const s=setup();step(s,{}, {}, 60);assert.equal(s.roundFrames,89*60);assert.equal(s.round,1);
});
test('Golpe rápido conecta y aplica hitstop',()=>{
 const s=setup();step(s,{attack:'quick'});step(s,{}, {},6);
 assert(s.p2.hp<100, 'sin daño');assert(s.hitStop>0, 'sin hitstop');assert(s.p1.meter>0);
});
test('Bloqueo alto/mid mitiga daño',()=>{
 const s=setup();step(s,{attack:'quick'},{guard:true});step(s,{}, {guard:true},6);
 assert(s.p2.hp>98, 'mucho daño con bloqueo');assert(s.p2.guard<100);
});
test('Patada baja requiere defensa agachada',()=>{
 const high=setup();step(high,{attack:'kick'},{guard:true});step(high,{}, {guard:true},12);
 const low=setup();step(low,{attack:'kick'},{guard:true,crouch:true});step(low,{}, {guard:true,crouch:true},12);
 assert(high.p2.hp<low.p2.hp,'la defensa baja no funcionó');
});
test('Agacharse evade golpe alto',()=>{
 const s=setup();step(s,{attack:'heavy'},{crouch:true});step(s,{}, {crouch:true},17);
 assert.equal(s.p2.hp,100);
});
test('Golpes simultáneos intercambian daño',()=>{
 const s=setup();step(s,{attack:'quick'},{attack:'quick'});step(s,{}, {},7);
 assert(s.p1.hp<100 && s.p2.hp<100,`daño simétrico ${s.p1.hp} ${s.p2.hp}`);
});
test('Especial exige 50 energía',()=>{
 const s=setup();step(s,{attack:'special'});assert.equal(s.p1.move,null);
 s.p1.meter=60;step(s,{attack:'special'});assert.equal(s.p1.move.type,'special');assert.equal(s.p1.meter,10);
});
test('Buffer permite encadenar rápido a fuerte tras conectar',()=>{
 const s=setup();step(s,{attack:'quick'});step(s,{}, {},6);
 step(s,{attack:'heavy'});step(s,{}, {},20);
 assert(s.p1.move && s.p1.move.type==='heavy',`no se canceló el golpe: ${s.p1.move && s.p1.move.type}`);
});
test('Derribo protege la recuperación',()=>{
 const s=setup();s.p1.meter=100;step(s,{attack:'special'});step(s,{}, {},22);
 assert(s.p2.downFrames>0,'especial no derriba');assert(s.hitStop>0);
 step(s,{}, {},80);assert(s.p2.invuln>=0);assert(s.p2.downFrames===0);
});
test('Al mejor de 3 rondas y revancha',()=>{
 const s=setup();s.p2.hp=0;step(s);assert(s.betweenRounds);assert.deepEqual(s.wins,[1,0]);assert(!s.matchOver);
 assert(E.nextRound(s));s.countdown=0;s.p2.hp=0;step(s);
 assert(s.matchOver);assert.deepEqual(s.wins,[2,0]);assert.equal(E.nextRound(s),false);
});
test('Empate reinicia la misma ronda',()=>{
 const s=setup();s.roundFrames=1;step(s);assert.equal(s.result,'draw');assert.deepEqual(s.wins,[0,0]);
 E.nextRound(s);assert.equal(s.round,1);
});
test('IA entrega controles válidos',()=>{
 const s=setup('cpu');for(let i=0;i<400;i++){E.advance(s,[{dir:0}]);if(s.betweenRounds)break;}
 assert(s.p2.x < 485 || s.p2.move || s.p1.hp<100, 'IA no se movió ni actuó');
});

test('Distintos luchadores conservan diferencias de alcance',()=>{
 const long={...defs[0],reach:70}, short={...defs[0],reach:49};
 const a=E.createMatch(long,defs[1],{mode:'versus'});
 const b=E.createMatch(short,defs[1],{mode:'versus'});
 a.countdown=b.countdown=0;
 E.advance(a,[{attack:'quick'},{}]);
 E.advance(b,[{attack:'quick'},{}]);
 assert(a.p1.move.range>b.p1.move.range);
});
test('Simulación prolongada mantiene vida, energía y posiciones válidas',()=>{
 let seed=717;
 const rng=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296};
 const s=E.createMatch(...defs,{mode:'cpu',difficulty:'dificil',random:rng});
 for(let t=0;t<12000;t++){
   if(s.betweenRounds){if(s.matchOver) break;E.nextRound(s);}
   const dir=rng()<.15?1:rng()<.15?-1:0;
   const attack=rng()<.018?['quick','heavy','kick','special'][Math.floor(rng()*4)]:null;
   E.advance(s,[{dir,guard:rng()<.08,crouch:rng()<.05,jump:rng()<.003,attack}]);
   for(const f of [s.p1,s.p2]){
     assert(Number.isFinite(f.x)&&Number.isFinite(f.y));
     assert(f.x>=40 && f.x<=920);
     assert(f.hp>=0&&f.hp<=100);
     assert(f.meter>=0&&f.meter<=100);
     assert(f.guard>=0&&f.guard<=100);
   }
 }
 assert(s.tick>200);
});
