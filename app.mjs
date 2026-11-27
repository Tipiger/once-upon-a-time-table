import * as g from './game.mjs';
import { catalog, readJSON, savedModule } from './catalog.mjs';
import QRCode from './vendor/index.js';

const app = document.querySelector('#app');
const notice = document.querySelector('#notice');
const latest = 'story-table.demo.latest';
let modules, selected, deck, table, page = 'home', seat = 1, target = 2, slip, noticeTimer, busy = false;
const key = id => 'demo/' + id;
const current = () => table?.players[seat];
const get = id => deck.byId.get(id);
const esc = s => String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const btn = (action, label, cls='', val='') => '<button class="'+cls+'" data-action="'+action+'" data-value="'+esc(val)+'">'+label+'</button>';
const options = (total, chosen, suffix, start=1) => Array.from({length:total-start+1},(_,i)=>'<option value="'+(i+start)+'" '+(i+start===chosen?'selected':'')+'>'+(i+start)+suffix+'</option>').join('');
function tell(message) {
  clearTimeout(noticeTimer); notice.textContent = message;
  noticeTimer = setTimeout(()=>notice.textContent='',3200);
}
const stampPaths = {
  '角色':'<path d="m19 35 6 15h30l6-15-14 8-7-15-7 15zM25 55h30M29 60h22"/><circle cx="40" cy="24" r="2"/>',
  '地点':'<path d="M18 58h44M23 57V36l7-11 7 11v19m6 0V31l7-13 7 13v26M20 36h19m1-5h19M34 46h12M28 40v5m21-9v6M38 57v-5a3 3 0 0 1 6 0v5"/>',
  '事件':'<path d="M30 20h20m-20 40h20M32 22c0 12 2 12 8 18-6 6-8 6-8 18m16-36c0 12-2 12-8 18 6 6 8 6 8 18m-13-4 5-7 5 7zM34 29h12"/>',
  '物品':'<circle cx="31" cy="31" r="10"/><circle cx="31" cy="31" r="5"/><path d="m38 39 18 18 5-5-4-4-3 3-4-4 3-3-5-5-3 3"/>',
  '特征':'<path d="m40 17 5 15 16 7-16 7-5 16-6-16-15-7 15-7zM40 29v19m-9-9h18"/>'
};
const inks = {'角色':'#785033','地点':'#3f6149','事件':'#805147','物品':'#5e5471','特征':'#54626d'};
function emblem(category) {
  return '<svg aria-hidden="true" class="emblem" viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="40" cy="40" rx="32" ry="34" stroke-width=".75"/><ellipse cx="40" cy="40" rx="29" ry="31" stroke-dasharray="1 4" opacity=".6"/>'+stampPaths[category]+'</svg>';
}
function card(id, {back=false,action='',large=false,flip=false}={}) {
  const c=get(id), end=c.kind==='ending', tag=action?'button':'div';
  const cls='card '+(back?'back '+(end?'endback':''):end?'endface':'')+(large?' large':'')+(flip?' flip':'');
  const attr=action?' data-action="'+action+'" data-value="'+id+'"':'';
  const body=back?'<span>✧</span><span class="seal">'+(end?'☾':'✥')+'</span><strong>'+(end?'结局牌':'故事牌')+'</strong>':
    end?'<span class="kind">✧ '+esc(deck.endingLabel||'结局')+' ✧</span><span class="sentence">'+esc(c.textZh)+'</span><span>❧</span>':
    '<span class="kind">'+esc(c.categoryZh)+(c.interrupt?' · 打断':'')+'</span>'+(c.image?'<img class="story-art" src="'+esc(c.image)+'" alt="">':emblem(c.categoryZh))+'<strong>'+esc(c.labelZh)+'</strong>';
  return '<'+tag+' class="'+cls+'"'+attr+(back?'':' style="--tone:'+ (inks[c.categoryZh]||'#784535')+'"')+'>'+body+'</'+tag+'>';
}
function applyArt(entry) {
 const art = entry?.art || {};
 for (const type of ['storyBack','endingBack','storyFrame','endingFrame']) {
   const cssName = '--' + type.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
   if (art[type]) app.style.setProperty(cssName, 'url(' + JSON.stringify(art[type]) + ')');
   else app.style.removeProperty(cssName);
 }
 app.classList.toggle('printed-deck', Boolean(art.storyFrame));
}
function selectedEntry() { return modules.entries.find(e => e.id === selected); }
function homeTheme() {
 const entry = selectedEntry();
 applyArt(entry);
 const hint = document.getElementById('moduleInfo');
 if (hint) hint.textContent = entry.description;
}
function top(aux='') {return '<header class="between"><span class="brand"><i>✥</i>故事牌桌</span>'+aux+'</header>';}
const tabs = () => '<nav class="toolbar" aria-label="牌桌功能">'+[['hand','我的手牌'],['discard','弃牌堆'],...(table.host&&seat===1?[['dealer','发牌台']]:[])].map(([a,t])=>'<button data-action="tab" data-value="'+a+'" aria-pressed="'+(page===a)+'">'+t+'</button>').join('')+'</nav>';
function home(){
 return top()+'<section class="hero"><div><h1>很久很久以前</h1><p>抽一手牌，和同桌的人讲一个故事。</p></div><div aria-hidden="true" class="deckfan"><div class="mini">✧</div><div class="mini">✥</div></div></section>'+
 (table?'<section class="panel row between"><div><b>上次的牌局</b><br><small>'+(table.seats?table.seats+' 人 · ':'')+(table.solo?'单机试玩':'同桌牌局')+'</small></div>'+btn('resume','继续牌局','primary')+'</section>':'')+
 '<section class="panel"><h2>新牌局</h2><div class="setup-fields"><label class="wide">主题模组<select id="module">'+modules.entries.map(e=>'<option value="'+esc(e.id)+'" '+(e.id===selected?'selected':'')+'>'+esc(e.name)+'</option>').join('')+'</select><small id="moduleInfo">'+esc(selectedEntry().description)+'</small></label><label>游戏人数<select id="seats">'+options(6,2,' 人',2)+'</select></label><label>每人故事牌<select id="stories">'+options(10,3,' 张')+'</select></label><label>每人结局牌<select id="endings">'+options(4,2,' 张')+'</select></label></div><div class="actions">'+btn('newSolo','单机试玩','primary')+btn('newTable','同桌开局')+'</div><p class="help">单机可切换座位；同桌时每人用自己的手机扫码领牌。</p></section>';
}
function heading(){
 const ctrl=table.solo?'<label class="playerswitch">试玩座位<select id="seatChoice" aria-label="切换试玩座位">'+options(table.seats,seat,' 号')+'</select></label>':'<span class="small">'+seat+' 号 · '+(table.host?'房主':'玩家')+'</span>';
 return top(ctrl)+'<div class="row between back-row"><span class="small">'+esc(deck.entry.name)+' / '+(table.solo?'单机试玩':'同桌牌局')+'</span>'+btn('home','牌局首页','ghost')+'</div>';
}
function inbox(player){
 const batch=player.inbox[0];
 return '<section class="sectionhead"><h2>'+ (batch.revealed?'本次领到的牌':'收到 '+batch.cards.length+' 张牌')+'</h2></section><p class="help">'+(batch.revealed?'收起后加入你的手牌。':'点任意一张牌背，一起翻开。')+'</p><div class="grid">'+batch.cards.map(id=>card(id,{back:!batch.revealed,action:batch.revealed?'':'reveal',flip:batch.revealed})).join('')+'</div>'+(batch.revealed?'<div class="actions">'+btn('collect','收起','primary')+'</div>':'');
}
function hand(player) {
 const section = (kind, title) => {
   const ids = player.hand.filter(id => get(id).kind === kind);
   const content = ids.length
     ? '<div class="hand-grid">' + ids.map(id => card(id, {action:'show'})).join('') + '</div>'
     : '<p class="empty">故事牌已出完，可以选择一张结局收尾。</p>';
   return '<section class="hand-section hand-' + kind + '" aria-label="' + title + '">' +
     '<h2 class="hand-heading"><span>' + title + '</span></h2>' + content + '</section>';
 };
 return '<div class="hand-board">' + section('ending', '结局牌') + section('story', '故事牌') + '</div>';
}
function dealer(){
 const host=table.host, history=host.history.filter(p=>p.seat===target), opening=history[0], last=history.at(-1);
 return '<section class="panel"><h2>给谁发牌？</h2><div class="seat-grid">'+Array.from({length:host.seats},(_,i)=>'<button data-action="target" data-value="'+(i+1)+'" aria-pressed="'+(target===i+1)+'">'+(i+1)+' 号'+(i===0?' · 我':'')+'</button>').join('')+'</div><div class="line"></div><h3>'+target+' 号玩家</h3><div class="actions">'+btn('slip',target===1?'查看起手牌记录':'出示起手牌码','soft',opening.serial)+(last.opening?'':btn('slip','重显上次补牌码','soft',last.serial))+'</div><div class="line"></div><h3>补牌</h3><div class="actions">'+btn('issue','故事 ×1','primary','1,0')+btn('issue','故事 ×2','','2,0')+btn('issue','故事＋结局','','1,1')+'</div><p class="help">剩余 '+host.decks.story.length+' 张故事牌 · '+host.decks.ending.length+' 张结局牌</p></section>';
}
function qrLink() {const url=new URL(location.href);url.search='';url.hash='';return g.transferLink(url,slip);}
function issueSlip(){
 const n=slip.cards.filter(id=>get(id).kind==='story').length, e=slip.cards.length-n;
 return '<section class="panel center"><h2>'+slip.seat+' 号的'+(slip.opening?'起手牌':'补牌')+'</h2><div class="small">'+[n?'故事牌 ×'+n:'',e?'结局牌 ×'+e:''].filter(Boolean).join(' · ')+'</div><canvas class="qr" id="qr" aria-label="本批牌的领取二维码"></canvas><p class="help">用手机相机扫码，在同一浏览器中领取。</p><div class="actions">'+btn('closeSlip','完成','primary')+btn('copy','复制领牌链接','soft')+'</div>'+(table.solo?'<div class="actions">'+btn('simulate','模拟 '+slip.seat+' 号扫码领取','soft')+'</div>':'')+'</section>';
}
function paintQR(){
 const canvas=document.querySelector('#qr');if(!canvas)return;
 const code=new QRCode(-1,1);code.addData(qrLink());code.make();
 const n=code.getModuleCount(), size=(n+8)*6;canvas.width=canvas.height=size;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);ctx.fillStyle='#121912';
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(code.isDark(y,x))ctx.fillRect((x+4)*6,(y+4)*6,6,6);
}
function overlay(player){
 if(player.confirming)return '<section class="overlay" role="dialog" aria-modal="true"><div class="panel dialog"><h2>用这张结局结束本局？</h2><blockquote>'+esc(get(player.shown).textZh)+'</blockquote><div class="actions">'+btn('cancelWin','取消')+btn('win','确认获胜','primary')+'</div></div></section>';
 return '<section class="overlay" role="dialog" aria-modal="true" aria-label="展示卡牌">'+card(player.shown,{large:true})+'<div class="actions">'+btn('withdraw','撤回','soft')+btn('play','出牌','primary')+'</div></section>';
}
function render(){
 app.removeAttribute('aria-busy');
 if(page==='home'||!table){app.innerHTML=home();homeTheme();return;}
 applyArt(deck.entry);
 const player=current();
 let body;
 if(page==='slip')body=issueSlip();
 else if(page==='dealer'&&table.host&&seat===1)body=tabs()+dealer();
 else if(!player)body='<p>请先领取起手牌。</p>';
 else if(player.shown){app.innerHTML=overlay(player);return;}
 else if(player.inbox.length)body=inbox(player);
 else if(page==='discard')body=tabs()+'<div class="sectionhead"><h2>个人弃牌堆</h2><small>'+player.discard.length+' 张</small></div>'+(player.discard.length?'<div class="grid">'+[...player.discard].reverse().map(id=>card(id)).join('')+'</div>':'<p class="empty">你打出的牌会留在这里。</p>');
 else if(player.wonWith)body=tabs()+'<div class="result"><span class="seal">♛</span><h1>故事圆满落幕</h1><p>'+seat+' 号玩家获胜</p><blockquote>'+esc(get(player.wonWith).textZh)+'</blockquote>'+btn('home','回到牌局首页','primary')+'</div>';
 else body=tabs()+hand(player);
 app.innerHTML=heading()+body;
 paintQR();
}
async function change(fn){
 table = await g.updateSaved(key(table.id),previous=>{if(!previous)throw Error('找不到本机牌局');return fn(previous);});
}
function playerChange(fn){
 const s=seat;return change(t=>({...t,players:{...t.players,[s]:fn(t.players[s])}}));
}
function remember(){localStorage.setItem(latest,JSON.stringify({id:table.id,seat}));}
async function create(solo) {
 const config=Object.fromEntries(['seats','stories','endings'].map(id=>[id,+document.getElementById(id).value]));
 const activeDeck=await modules.open(selected);
 const host=g.startGame(activeDeck,config);
 seat=1;target=2;
 const t={id:host.game,host,solo,seats:host.seats,players:{1:g.receive(null,host.history[0],activeDeck)},mySeat:1};
 table=await g.updateSaved(key(t.id),()=>t);deck=activeDeck;remember();page='hand';
}
async function receiveRemote(packet){
 const activeDeck=await modules.open(packet.module);
 const t=await g.updateSaved(key(packet.game),old=>{
   if(old?.host||old&&old.mySeat!==packet.seat)throw Error('该牌局在此浏览器已有座位，请用对应玩家的手机扫码');
   const player=g.receive(old?.players[packet.seat],packet,activeDeck);
   return {...(old??{id:packet.game,host:null,solo:false,seats:null,mySeat:packet.seat}),players:{[packet.seat]:player}};
 });
 table=t;deck=activeDeck;seat=t.mySeat;remember();page='hand';
}
async function act(a,v){
 if(a==='newSolo'||a==='newTable'){await create(a==='newSolo');return;}
 if(a==='home'){page='home';return;}
 if(a==='resume'){page='hand';return;}
 if(a==='tab'){page=v;return;}
 if(a==='target'){target=+v;return;}
 if(a==='reveal')return playerChange(g.revealBatch);
 if(a==='collect'){page='hand';return playerChange(g.collectBatch);}
 if(a==='show')return playerChange(s=>g.showCard(s,v));
 if(a==='withdraw')return playerChange(g.withdraw);
 if(a==='play')return playerChange(s=>g.playShown(s,deck));
 if(a==='cancelWin'||a==='win')return playerChange(s=>g.answerEnding(s,a==='win'));
 if(a==='slip'){slip=table.host.history.find(p=>p.serial===+v);page='slip';return;}
 if(a==='closeSlip'){page='dealer';return;}
 if(a==='copy'){await navigator.clipboard.writeText(qrLink());tell('已复制领牌链接');return;}
 if(a==='issue'){
   const [stories,endings]=v.split(',').map(Number);
   await change(t=>{
     const host=g.issue(t.host,target,stories,endings);
     const packet=host.history.at(-1);
     const players=target===1?{...t.players,1:g.receive(t.players[1],packet,deck)}:t.players;
     slip=packet;return {...t,host,players};
   });
   page=target===1?'hand':'slip';return;
 }
 if(a==='simulate'){
   const n=slip.seat;
   await change(t=>{
     let p=t.players[n];
     if(!p&&!slip.opening)throw Error('请先展示该座位的起手牌码并领取');
     return {...t,players:{...t.players,[n]:g.receive(p,slip,deck)}};
   });
   seat=n;remember();page='hand';return;
 }
 if(a==='switch'){
   const n=+v;
   await change(t=>{
     if(!t.solo||!t.host)throw Error('仅单机试玩可切换座位');
     if(t.players[n])return t;
     return {...t,players:{...t.players,[n]:g.receive(null,t.host.history.find(p=>p.opening&&p.seat===n),deck)}};
   });
   seat=n;remember();page='hand';
 }
}
async function perform(a,v){
 if(busy)return;busy=true;
 try{await act(a,v);}catch(err){tell(err.message);}
 finally{busy=false;render();}
}
app.addEventListener('click',e=>{const b=e.target.closest('button[data-action]');if(b)perform(b.dataset.action,b.dataset.value);});
app.addEventListener('change',e=>{if(e.target.id==='module'){selected=e.target.value;homeTheme();}
 if(e.target.id==='seatChoice')perform('switch',e.target.value);});
async function openPacket(){
 try{await receiveRemote(g.readLink(location.href));history.replaceState(null,'',location.pathname+location.search);}
 catch(err){tell(err.message);}
}
async function init(){
 try{
   modules=catalog(await readJSON('./modules.json'));selected=modules.entries[0].id;
   const prev=JSON.parse(localStorage.getItem(latest)||'null');
   if(prev){table=await g.updateSaved(key(prev.id));if(table){deck=await modules.open(savedModule(table));seat=prev.seat;page='hand';}}
   if(location.hash.startsWith('#deal='))await openPacket();
   render();
 }catch(err){app.textContent='牌桌未能打开：'+err.message;}
}
window.addEventListener('hashchange',async()=>{if(location.hash.startsWith('#deal=')){await openPacket();render();}});
window.addEventListener('pageshow',async e=>{if(e.persisted&&table){table=await g.updateSaved(key(table.id));render();}});
document.addEventListener('visibilitychange',async()=>{if(!document.hidden&&table&&!busy){table=await g.updateSaved(key(table.id));render();}});
init();
