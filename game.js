// Restaurant Royale: First Kitchen
// Multiplayer uses Supabase Realtime. Add your project URL and anon key below.
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const fighters = [
  {name:"Sir Meatsalot",emoji:"🍔",role:"Heavyweight",weapon:"Meatball Bonker",hp:125,speed:2.65,damage:13,ability:"Burger Bounce"},
  {name:"Dill Bill",emoji:"🥒",role:"Speedster",weapon:"Pickle Boomerang",hp:90,speed:3.65,damage:8,ability:"Brine Dash"},
  {name:"Tomatilda",emoji:"🍅",role:"Ranged",weapon:"Tomato Blaster",hp:95,speed:3.05,damage:10,ability:"Sauce Splash"},
  {name:"Sprinkles",emoji:"🍩",role:"Trickster",weapon:"Candy Popper",hp:90,speed:3.35,damage:8,ability:"Sugar Rush"},
  {name:"Maki",emoji:"🍣",role:"Bouncer",weapon:"Sushi Slicer",hp:105,speed:3.1,damage:11,ability:"Roll Out"},
  {name:"Sunny Side",emoji:"🍳",role:"Healer",weapon:"Egg Grenade",hp:110,speed:2.9,damage:8,ability:"Sunny Heal"},
  {name:"Fricken Chicken",emoji:"🍗",role:"Air Hopper",weapon:"Drumstick Launcher",hp:100,speed:3.2,damage:10,ability:"Triple Hop"},
  {name:"Fear Beer",emoji:"🥤",role:"Fizz Specialist",weapon:"Fizz Blaster",hp:100,speed:3.0,damage:9,ability:"Bubble Trouble"},
  {name:"Dumpin Pumpkin",emoji:"🎃",role:"Area Control",weapon:"Pumpkin Pounder",hp:120,speed:2.8,damage:11,ability:"Gourd Guard"},
  {name:"Ramen Karen",emoji:"🍜",role:"Sticky Specialist",weapon:"Noodle Whip",hp:100,speed:3.0,damage:9,ability:"Noodle Snare"}
];

const $ = id => document.getElementById(id);
const screens = ["coverScreen","menuScreen","selectScreen","gameScreen"];
let selected = 0, roomCode = "", isHost = false, playerId = crypto.randomUUID(), playerName = "Player";
let supabase = null, channel = null, connected = false, ready = false, started = false, roomRejected = false;
let roomPlayers = {}, gameState = null, lastStateAt = 0, keys = {}, mouse = {x:0,y:0}, attackQueued = false;
let canvas, ctx, lastFrame = 0, lastBroadcast = 0, toastTimer;
const colors = ["#ef5141","#36a9df","#e7b72e","#e34d7b","#69b94f","#9b70d5","#e68c36","#47b6a4","#d75e36","#6873d5"];

function showScreen(id){screens.forEach(s=>$(s).classList.toggle("active",s===id));}
function toast(msg){const el=$("toast");el.textContent=msg;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2400);}
function setMessage(msg){$("lobbyMessage").textContent=msg;}
function initSupabase(){
  if(SUPABASE_URL.startsWith("YOUR_")||SUPABASE_ANON_KEY.startsWith("YOUR_")) return false;
  if(!window.supabase){toast("Realtime library did not load. Check your connection.");return false;}
  supabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
  return true;
}
function makeCode(){return Math.random().toString(36).slice(2,8).toUpperCase();}
function broadcast(event,payload){if(channel&&connected)channel.send({type:"broadcast",event,payload});}
function syncLobby(){
  const entries=Object.values(roomPlayers).sort((a,b)=>a.joined-b.joined);
  $("playerCount").textContent=`${entries.length} / 10`;
  $("playersList").innerHTML=Array.from({length:10},(_,i)=>{
    const p=entries[i];
    return p?`<div class="player-row"><span class="avatar">${fighters[p.fighter]?.emoji||"🍽️"}</span><span>${escapeHtml(p.name||"Player")}<small>${p.ready?"READY":"Choosing fighter"}${p.host?" • HOST":""}</small></span></div>`:`<div class="player-row empty-slot"><span class="avatar">＋</span><span>Waiting for player<small>Open slot ${i+1}</small></span></div>`;
  }).join("");
  $("deployButton").disabled=!(isHost&&entries.length>=1&&entries.every(p=>p.ready));
  $("deployButton").textContent=isHost?"DEPLOY!":"WAITING FOR HOST";
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function connectRoom(code,host){
  if(!initSupabase()){
    toast("Add your Supabase URL and anon key in game.js first.");
    return false;
  }
  roomCode=code;isHost=host;roomPlayers={};ready=false;started=false;roomRejected=false;
  channel=supabase.channel("restaurant-royale-"+code,{config:{presence:{key:playerId},broadcast:{self:false}}});
  channel.on("presence",{event:"sync"},()=>{
    const people=Object.values(channel.presenceState()).flat();
    roomPlayers={};
    people.forEach(p=>{if(p.id)roomPlayers[p.id]=p;});
    if(!roomRejected && connected){
      const hostExists=people.some(p=>p.host===true);
      if(!isHost && !hostExists){
        roomRejected=true;
        toast("That room code has no active host. Check the code and try again.");
        leaveRoom();
        return;
      }
      if(people.length>10){
        roomRejected=true;
        toast("This kitchen is full. Rooms can have up to 10 players.");
        leaveRoom();
        return;
      }
    }
    syncLobby();
  });
  channel.on("broadcast",{event:"player-joined"},({payload})=>{roomPlayers[payload.id]=payload;syncLobby();if(isHost)broadcast("lobby-snapshot",{players:roomPlayers});});
  channel.on("broadcast",{event:"lobby-snapshot"},({payload})=>{if(!isHost){roomPlayers=payload.players||{};syncLobby();}});
  channel.on("broadcast",{event:"player-update"},({payload})=>{roomPlayers[payload.id]=payload;syncLobby();});
  channel.on("broadcast",{event:"player-left"},({payload})=>{delete roomPlayers[payload.id];syncLobby();});
  channel.on("broadcast",{event:"deploy"},({payload})=>{if(!isHost)beginBattle(payload);});
  channel.on("broadcast",{event:"input"},({payload})=>{if(isHost&&gameState&&gameState.players[payload.id])gameState.players[payload.id].input=payload.input;});
  channel.on("broadcast",{event:"game-state"},({payload})=>{if(!isHost&&started){gameState=payload;lastStateAt=performance.now();updateHud();}});
  channel.on("broadcast",{event:"match-end"},({payload})=>{$("gameMessage").textContent=payload.message;});
  const status=await channel.subscribe(async s=>{
    if(s==="SUBSCRIBED"){
      connected=true;
      const me={id:playerId,name:playerName,fighter:selected,ready:false,host:isHost,joined:Date.now()};
      roomPlayers[playerId]=me;
      await channel.track(me);
      roomPlayers[playerId]=me;
      broadcast("player-joined",me);
      if(!isHost) broadcast("player-update",me);
      $("roomCode").textContent=roomCode;
      showScreen("selectScreen");renderFighter();syncLobby();
      setMessage(isHost?"You're the host. Share the code and deploy when everyone is ready.":"Connected! Choose your fighter.");
    }
  });
  return true;
}
function renderFighter(){
  const f=fighters[selected];
  $("fighterEmoji").textContent=f.emoji;$("fighterName").textContent=f.name;$("fighterRole").textContent=f.role;
  $("fighterStats").innerHTML=`<span class="stat">❤️ ${f.hp} HP</span><span class="stat">⚡ ${f.speed.toFixed(1)} SPD</span><span class="stat">💥 ${f.damage} DMG</span>`;
  $("weaponLine").textContent=`WEAPON: ${f.weapon}  •  SPECIAL: ${f.ability}`;
}
function changeFighter(dir){selected=(selected+dir+fighters.length)%fighters.length;renderFighter();}
async function createRoom(){
  playerName=(prompt("What name should appear in the kitchen?")||"Host").slice(0,16);
  const code=makeCode();await connectRoom(code,true);
}
async function joinRoom(){
  const code=$("joinCode").value.trim().toUpperCase();
  if(code.length!==6){toast("Enter the six-character room code.");return;}
  playerName=(prompt("What name should appear in the kitchen?")||"Player").slice(0,16);
  await connectRoom(code,false);
}
function setReady(){
  ready=!ready;
  const p={id:playerId,name:playerName,fighter:selected,ready,host:isHost,joined:Date.now()};
  roomPlayers[playerId]=p;channel.track(p);broadcast("player-update",p);
  $("lockFighter").textContent=ready?"CANCEL READY":"READY!";
  syncLobby();
}
function startState(){
  const humans=Object.values(roomPlayers).sort((a,b)=>a.joined-b.joined).slice(0,10);
  const players={};
  humans.forEach((p,i)=>{
    const f=fighters[p.fighter]||fighters[0];
    players[p.id]={id:p.id,name:p.name,fighter:p.fighter,x:180+(i%5)*130,y:150+Math.floor(i/5)*180,hp:f.hp,maxHp:f.hp,alive:true,angle:0,input:{x:0,y:0,attack:false},cooldown:0,bot:false,score:0};
  });
  // Fill remaining seats with easy kitchen bots.
  for(let i=humans.length;i<10;i++){
    const id="bot-"+i,fid=i%fighters.length,f=fighters[fid];
    players[id]={id,name:"Kitchen Bot "+(i-humans.length+1),fighter:fid,x:180+(i%5)*130,y:150+Math.floor(i/5)*180,hp:f.hp,maxHp:f.hp,alive:true,angle:0,input:{x:0,y:0,attack:false},cooldown:0,bot:true,score:0};
  }
  return {players,projectiles:[],startedAt:Date.now(),zone:0,ended:false};
}
function deploy(){
  if(!isHost)return;
  gameState=startState();started=true;broadcast("deploy",gameState);beginBattle(gameState);
}
function beginBattle(state){
  gameState=state;started=true;showScreen("gameScreen");$("gameMessage").textContent="3... 2... 1... KITCHEN FIGHT!";
  setTimeout(()=>{if($("gameMessage").textContent.startsWith("3..."))$("gameMessage").textContent="";},1700);
  canvas=$("gameCanvas");ctx=canvas.getContext("2d");resizeCanvas();window.addEventListener("resize",resizeCanvas);lastFrame=performance.now();requestAnimationFrame(loop);
}
function resizeCanvas(){if(!canvas)return;const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.floor(r.width*dpr);canvas.height=Math.floor(r.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
function getMe(){return gameState?.players[playerId];}
function updateHud(){const me=getMe();$("healthValue").textContent=me?Math.max(0,Math.ceil(me.hp)):"—";$("weaponValue").textContent=me?fighters[me.fighter].weapon:"—";$("aliveValue").textContent=gameState?Object.values(gameState.players).filter(p=>p.alive).length:"10";}
function localInput(){
  const x=(keys.d||keys.ArrowRight?1:0)-(keys.a||keys.ArrowLeft?1:0),y=(keys.s||keys.ArrowDown?1:0)-(keys.w||keys.ArrowUp?1:0);
  const len=Math.hypot(x,y)||1;
  return {x:x/len,y:y/len,attack:attackQueued,aimX:mouse.x,aimY:mouse.y};
}
function loop(now){
  if(!started||!gameState)return;
  const dt=Math.min((now-lastFrame)/16.67,2);lastFrame=now;
  if(isHost){
    const hostMe=getMe();
    if(hostMe) hostMe.input=localInput();
    hostTick(dt);
  }
  drawGame();
  if(isHost&&now-lastBroadcast>75){broadcast("game-state",gameState);lastBroadcast=now;}
  if(!isHost){const inp=localInput();broadcast("input",{id:playerId,input:inp});}
  attackQueued=false;updateHud();
  requestAnimationFrame(loop);
}
function hostTick(dt){
  const ps=Object.values(gameState.players);
  const alive=ps.filter(p=>p.alive);
  if(alive.length<=1&&!gameState.ended){gameState.ended=true;const winner=alive[0];const msg=winner?`${winner.name} WINS THE KITCHEN!`:"KITCHEN DRAW!";$("gameMessage").textContent=msg;broadcast("match-end",{message:msg});}
  const w=canvas.clientWidth,h=canvas.clientHeight;
  gameState.zone=Math.min(1,(Date.now()-gameState.startedAt)/180000);
  ps.forEach(p=>{
    if(!p.alive)return;
    const f=fighters[p.fighter];p.cooldown=Math.max(0,p.cooldown-dt);
    if(p.bot){
      const target=ps.filter(q=>q.alive&&q.id!==p.id).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
      if(target){const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy)||1;p.input={x:dx/d,y:dy/d,attack:d<330,aimX:target.x,aimY:target.y};}
    }
    const inp=p.input||{x:0,y:0,attack:false};
    p.x=Math.max(30,Math.min(w-30,p.x+inp.x*f.speed*dt));p.y=Math.max(30,Math.min(h-30,p.y+inp.y*f.speed*dt));
    if(inp.aimX!=null)p.angle=Math.atan2(inp.aimY-p.y,inp.aimX-p.x);
    if(inp.attack&&p.cooldown<=0){p.cooldown=23;const reach=f.role==="Ranged"||f.role==="Fizz Specialist"?260:125;
      const projectile={id:Math.random(),owner:p.id,x:p.x+Math.cos(p.angle)*23,y:p.y+Math.sin(p.angle)*23,vx:Math.cos(p.angle)*(reach>150?7.5:4),vy:Math.sin(p.angle)*(reach>150?7.5:4),life:reach>150?36:12,damage:p.bot?Math.max(2,f.damage*.48):f.damage,fighter:p.fighter,range:reach};
      gameState.projectiles.push(projectile);
    }
  });
  gameState.projectiles.forEach(b=>{b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
    const target=ps.find(p=>p.alive&&p.id!==b.owner&&Math.hypot(p.x-b.x,p.y-b.y)<24);
    if(target){target.hp-=b.damage;b.life=0;if(target.hp<=0){target.hp=0;target.alive=false;}}
  });
  gameState.projectiles=gameState.projectiles.filter(b=>b.life>0&&b.x>0&&b.y>0&&b.x<w&&b.y<h);
}
function drawGame(){
  if(!ctx||!canvas)return;const w=canvas.clientWidth,h=canvas.clientHeight;
  ctx.clearRect(0,0,w,h);
  // Warm tiled kitchen floor.
  const tile=76;for(let y=0;y<h;y+=tile)for(let x=0;x<w;x+=tile){ctx.fillStyle=((x/tile+y/tile)%2===0)?"#d9b98d":"#b58c68";ctx.fillRect(x,y,tile,tile);ctx.strokeStyle="#8d674e";ctx.lineWidth=3;ctx.strokeRect(x,y,tile,tile);}
  // Kitchen counters around the arena.
  ctx.fillStyle="#75452d";ctx.fillRect(0,0,w,18);ctx.fillRect(0,h-18,w,18);ctx.fillRect(0,0,18,h);ctx.fillRect(w-18,0,18,h);
  ctx.fillStyle="#a96d43";for(let i=0;i<Math.floor(w/190);i++){ctx.fillRect(30+i*190,28,105,28);ctx.fillStyle="#e5c89b";ctx.fillRect(37+i*190,34,91,15);ctx.fillStyle="#a96d43";}
  // Soup danger zone shrinks inward.
  const inset=gameState.zone*Math.min(w,h)*.34;
  if(inset>2){ctx.fillStyle="#db4b25aa";ctx.fillRect(18,18,w-36,inset);ctx.fillRect(18,h-18-inset,w-36,inset);ctx.fillRect(18,18,inset,h-36);ctx.fillRect(w-18-inset,18,inset,h-36);}
  gameState.projectiles.forEach(b=>{ctx.font="24px serif";ctx.fillText(fighters[b.fighter].emoji,b.x-10,b.y+8);});
  Object.values(gameState.players).forEach(p=>{
    if(!p.alive)return;const f=fighters[p.fighter],c=colors[Object.keys(gameState.players).indexOf(p.id)%colors.length];
    ctx.save();ctx.translate(p.x,p.y);
    ctx.fillStyle="#39221855";ctx.beginPath();ctx.ellipse(0,19,22,9,0,0,Math.PI*2);ctx.fill();
    ctx.rotate(p.angle||0);ctx.fillStyle="#5a2d1b";ctx.beginPath();ctx.roundRect(-4,-6,38,12,6);ctx.fill();ctx.restore();
    ctx.font="34px serif";ctx.textAlign="center";ctx.fillText(f.emoji,p.x,p.y+12);
    ctx.fillStyle="#4a2119";ctx.fillRect(p.x-24,p.y-31,48,6);ctx.fillStyle="#69c64d";ctx.fillRect(p.x-24,p.y-31,48*Math.max(0,p.hp/p.maxHp),6);
    ctx.font="bold 11px Nunito";ctx.fillStyle="#321b12";ctx.fillText(p.name,p.x,p.y-39);
    if(p.id===playerId){ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,25,0,Math.PI*2);ctx.stroke();}
  });ctx.textAlign="left";
}
function leaveRoom(){if(channel){channel.untrack();if(supabase)supabase.removeChannel(channel);}channel=null;connected=false;started=false;gameState=null;roomPlayers={};showScreen("menuScreen");}
function goHome(){if(started){leaveRoom();}showScreen("coverScreen");}

$("topPlay").onclick=()=>showScreen("menuScreen");$("createFromCover").onclick=()=>showScreen("menuScreen");$("chooseFromCover").onclick=()=>showScreen("menuScreen");$("backCover").onclick=()=>showScreen("coverScreen");$("homeButton").onclick=e=>{e.preventDefault();goHome();};
$("createRoom").onclick=createRoom;$("joinRoom").onclick=joinRoom;$("prevFighter").onclick=()=>changeFighter(-1);$("nextFighter").onclick=()=>changeFighter(1);$("lockFighter").onclick=setReady;$("deployButton").onclick=deploy;$("leaveRoom").onclick=leaveRoom;$("copyCode").onclick=()=>navigator.clipboard.writeText(roomCode).then(()=>toast("Room code copied!")).catch(()=>toast("Your room code is "+roomCode));$("exitGame").onclick=leaveRoom;
window.addEventListener("keydown",e=>{const k=e.key.toLowerCase();keys[k]=true;if(k===" "){e.preventDefault();attackQueued=true;}});
window.addEventListener("keyup",e=>{keys[e.key.toLowerCase()]=false;});
if($("gameCanvas")){$("gameCanvas").addEventListener("mousemove",e=>{const r=canvas.getBoundingClientRect();mouse.x=e.clientX-r.left;mouse.y=e.clientY-r.top;});$("gameCanvas").addEventListener("mousedown",()=>attackQueued=true);}
renderFighter();
