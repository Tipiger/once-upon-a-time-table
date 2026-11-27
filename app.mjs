import * as g from './game.mjs';
import { catalog, readJSON, savedModule } from './catalog.mjs?v=fonts-1';
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
function card(id, options) { return renderCard(get(id), deck, options); }
function illustration(c, module, lazy) {
  if (!c.image) return '';
  const src = esc(new URL(c.image, new URL(module.entry.file, document.baseURI)).href);
  return '<img class="story-art" src="'+src+'" alt=""'+(lazy?' loading="lazy"':'')+'>';
}
function renderCard(c, module, {back=false,action='',large=false,flip=false}={}) {
  const end=c.kind==='ending', tag=action?'button':'div';
  const cls='card '+(back?'back '+(end?'endback':''):end?'endface':c.image?'storyface illustrated':'storyface')+(large?' large':'')+(flip?' flip':'');
  const attr=action?' data-action="'+action+'" data-value="'+esc(c.id)+'"':'';
  const body=back?'<span>✧</span><span class="seal">'+(end?'☾':'✥')+'</span><strong>'+(end?'结局牌':'故事牌')+'</strong>':
    end?'<span class="kind">✧ '+esc(module.endingLabel||'结局')+' ✧</span><span class="sentence">'+esc(c.textZh)+'</span><span>❧</span>':
    (c.interrupt?'<span class="interrupt">打断</span>':'')+
    illustration(c, module, action === 'zoomArt')+
    '<strong>'+esc(c.labelZh)+'</strong>';
  return '<'+tag+' class="'+cls+'"'+attr+'>'+body+'</'+tag+'>';
}
function applyArt(entry) {
 if (activeTheme?.id === entry.id) return;
 activeTheme = entry;
 const root = document.documentElement;
 root.dataset.module = entry.id;
 const sheet = document.getElementById('module-theme');
 if (entry.theme?.stylesheet) sheet.href = entry.theme.stylesheet;
 else sheet.removeAttribute('href');
 const art = entry.art || {};
 for (const type of ['storyBack','endingBack','storyFrame','endingFrame']) {
   const cssName = '--' + type.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
   if (art[type]) root.style.setProperty(cssName, 'url(' + JSON.stringify(art[type]) + ')');
   else root.style.removeProperty(cssName);
 }
 root.classList.toggle('printed-deck', Boolean(art.storyFrame));
 let choice;
 try {
   choice = localStorage.getItem(moduleFontKey());
   if (!choice && entry.id === 'once-upon-a-time-3e-core') choice = localStorage.getItem('story-table.font');
 } catch {}
 setFont(choice);
}
function selectedEntry() { return modules.entries.find(e => e.id === selected); }
const viewModuleButton = '<button type="button" class="soft" data-view-module>查看模组</button>';
function moduleSetup() {
 const entry=selectedEntry();
 const name=modules.entries.length===1
   ? '<strong>'+esc(entry.name)+'</strong>'
   : '<select id="module" aria-label="主题模组">'+modules.entries.map(e=>'<option value="'+esc(e.id)+'" '+(e.id===selected?'selected':'')+'>'+esc(e.name)+'</option>').join('')+'</select>';
 return '<div class="wide module-choice"><div><small>主题模组</small>'+name+'</div>'+viewModuleButton+
   '<small id="moduleInfo">'+esc(entry.description)+'</small></div>';
}
function homeTheme() {
 const entry=selectedEntry();
 applyArt(entry);
 const hint=document.getElementById('moduleInfo');
 if(hint) hint.textContent=entry.description;
}
const appearance = '<div class="head-actions"><button class="soft font-trigger" type="button" aria-haspopup="dialog">字体</button><button class="soft theme-trigger" type="button" aria-haspopup="dialog">主题</button></div>';
function top() {
 return '<header class="between"><span class="brand">故事牌桌</span>'+appearance+'</header>';
}
const tabItems = [
 ['hand','我的手牌','<rect x="8" y="4" width="12" height="16" rx="2"/><path d="m5 6-2 1 3 14 3-1"/>'],
 ['discard','弃牌堆','<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7"/>'],
 ['dealer','发牌台','<path d="m2 8 10-5 10 5-10 5zM3 12l9 5 9-5M3 16l9 5 9-5"/>']
];
function tabs() {
 const visible = table.host ? tabItems : tabItems.slice(0,2);
 return '<nav class="game-nav" aria-label="牌桌功能"><div>'+visible.map(([id,label,icon])=>
   '<button data-action="tab" data-value="'+id+'" aria-pressed="'+(id===page)+'"><svg viewBox="0 0 24 24" aria-hidden="true">'+icon+'</svg>'+label+'</button>'
 ).join('')+'</div></nav>';
}
function home(){
 return top()+'<section class="hero"><h1>很久很久以前</h1></section>'+
 (table?'<section class="panel row between"><div><b>上次的牌局</b><br><small>'+esc(deck.entry.name)+' · '+seat+' 号</small></div>'+btn('resume','继续牌局','primary')+'</section>':'')+
 '<section class="panel"><h2>新牌局</h2><div class="setup-fields">'+moduleSetup()+'<label>游戏人数<select id="seats">'+options(6,2,' 人',2)+'</select></label><label>每人故事牌<select id="stories">'+options(10,3,' 张')+'</select></label><label>每人结局牌<select id="endings">'+options(4,2,' 张')+'</select></label></div><div class="actions">'+btn('newTable','开始牌局','primary')+'</div><p class="help">开局后，在发牌台出示二维码，让其他玩家领取手牌。</p></section>';
}
function heading(){
 return '<header class="game-head"><div class="row between"><h1>'+esc(deck.entry.name)+'</h1><div class="module-links">'+viewModuleButton+btn('home','牌局首页','ghost')+'</div></div>'+
 '<div class="row between"><small>'+seat+' 号 · '+(table.host?'房主':'玩家')+'</small>'+appearance+'</div></header>';
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
 return '<section class="panel center"><h2>'+slip.seat+' 号的'+(slip.opening?'起手牌':'补牌')+'</h2><div class="small">'+[n?'故事牌 ×'+n:'',e?'结局牌 ×'+e:''].filter(Boolean).join(' · ')+'</div><canvas class="qr" id="qr" aria-label="本批牌的领取二维码"></canvas><p class="help">用手机相机扫码，在同一浏览器中领取。</p><div class="actions">'+btn('closeSlip','完成','primary')+btn('copy','复制领牌链接','soft')+'</div>'+'</section>';
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
let previewDeck, previewCard, returnToCard, galleryKind='all';
function renderArtPreview() {
  applyArt(previewDeck.entry);
  if (previewCard) {
    app.innerHTML='<section class="overlay" role="dialog" aria-modal="true" aria-label="卡牌大图">'+renderCard(previewCard, previewDeck, {large:true})+btn('closeArt','返回预览','soft')+'</section>';
    app.querySelector('button').focus();
    return;
  }
  const cards=previewDeck.cards;
  const options=[['all','全部'],['story','故事牌'],['ending','结局牌']];
  const filters=options.map(([kind,label])=>{
    const count=kind==='all' ? cards.length : cards.filter(c=>c.kind===kind).length;
    return '<button data-action="filterGallery" data-value="'+kind+'" aria-pressed="'+(galleryKind===kind)+'">'+label+' '+count+'</button>';
  }).join('');
  const visible=galleryKind==='all' ? cards : cards.filter(c=>c.kind===galleryKind);
  app.innerHTML=top()+'<section class="hand-section"><div class="sectionhead"><h2>'+esc(previewDeck.entry.name)+'</h2>'+
    '<a class="table-link" href="./" data-return-table>返回牌桌</a></div><nav class="toolbar" aria-label="卡牌筛选">'+filters+
    '</nav><div class="hand-grid">'+visible.map(c=>renderCard(c,previewDeck,{action:'zoomArt'})).join('')+'</div></section>';
  if (returnToCard) {
    window.scrollTo(0, returnToCard.scrollY);
    const trigger=app.querySelector('[data-action="zoomArt"][data-value="'+CSS.escape(returnToCard.id)+'"]');
    trigger?.focus({preventScroll:true});
    returnToCard=null;
  }
}
function render(){
 app.removeAttribute('aria-busy');
 if(page==='art'){renderArtPreview();return;}
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
async function create() {
 const config=Object.fromEntries(['seats','stories','endings'].map(id=>[id,+document.getElementById(id).value]));
 const activeDeck=await modules.open(selected);
 const host=g.startGame(activeDeck,config);
 seat=1;target=2;
 const t={id:host.game,host,seats:host.seats,players:{1:g.receive(null,host.history[0],activeDeck)},mySeat:1};
 table=await g.updateSaved(key(t.id),()=>t);deck=activeDeck;remember();page='hand';
}
async function receiveRemote(packet){
 const activeDeck=await modules.open(packet.module);
 const t=await g.updateSaved(key(packet.game),old=>{
   if(old?.host||old&&old.mySeat!==packet.seat)throw Error('该牌局在此浏览器已有座位，请用对应玩家的手机扫码');
   const player=g.receive(old?.players[packet.seat],packet,activeDeck);
   return {...(old??{id:packet.game,host:null,seats:null,mySeat:packet.seat}),players:{[packet.seat]:player}};
 });
 table=t;deck=activeDeck;seat=t.mySeat;remember();page='hand';
}
async function act(a,v){
 if(page==='art'){
   if(a==='filterGallery') { galleryKind=v; return; }
   if(a==='zoomArt') returnToCard={id:v,scrollY:window.scrollY};
   previewCard=a==='zoomArt' ? previewDeck.byId.get(v) : null;
   return;
 }
 if(a==='newTable'){await create();return;}
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

}
async function perform(a,v){
 if(busy)return;busy=true;
 try{await act(a,v);}catch(err){tell(err.message);}
 finally{busy=false;render();}
}
app.addEventListener('click',e=>{
 if(e.target.closest('[data-view-module]')){
   const url=new URL(location.pathname,location.href);
   url.searchParams.set('preview','module');
   url.searchParams.set('module',page==='home'?selected:deck.entry.id);
   location.assign(url);
   return;
 }
 if(e.target.closest('[data-return-table]') && document.referrer){
   const from=new URL(document.referrer);
   if(from.origin===location.origin && from.pathname===location.pathname && history.length>1){e.preventDefault();history.back();return;}
 }
 if(e.target.closest('.theme-trigger')){themePicker.showModal();return;}
 if(e.target.closest('.font-trigger')){openFontPicker();return;}const b=e.target.closest('button[data-action]');if(b)perform(b.dataset.action,b.dataset.value);});
app.addEventListener('change',e=>{if(e.target.id==='module'){selected=e.target.value;homeTheme();}
});
async function openPacket(){
 try{await receiveRemote(g.readLink(location.href));history.replaceState(null,'',location.pathname+location.search);}
 catch(err){tell(err.message);}
}
async function init(){
 try{
   modules=catalog(await readJSON('./modules.json?v=catalog-1'));selected=modules.entries[0].id;
   const params=new URLSearchParams(location.search);
   if(['module','art'].includes(params.get('preview')) && !location.hash.startsWith('#deal=')){
     const requested=params.get('module');
     previewDeck=await modules.open(modules.entries.some(e=>e.id===requested)?requested:selected);
     page='art';render();return;
   }
   const prev=JSON.parse(localStorage.getItem(latest)||'null');
   if(prev){
     const saved=await g.updateSaved(key(prev.id));
     const id=saved && savedModule(saved);
     if(modules.entries.some(e=>e.id===id)){
       deck=await modules.open(id);table=saved;seat=saved.host ? 1 : saved.mySeat;page='hand';
     }
   }
   if(location.hash.startsWith('#deal='))await openPacket();
   render();
   if(new URLSearchParams(location.search).get('preview')==='fonts')openFontPicker();
 }catch(err){app.textContent='牌桌未能打开：'+err.message;}
}
document.addEventListener('keydown',event=>{
  if(page==='art' && previewCard && event.key==='Escape')perform('closeArt');
});
window.addEventListener('hashchange',async()=>{if(location.hash.startsWith('#deal=')){await openPacket();render();}});
window.addEventListener('pageshow',async e=>{if(e.persisted&&table){table=await g.updateSaved(key(table.id));render();}});
document.addEventListener('visibilitychange',async()=>{if(!document.hidden&&table&&!busy){table=await g.updateSaved(key(table.id));render();}});
const picker = document.getElementById('font-picker');
let activeTheme;
const moduleFontKey = () => 'story-table.font.' + activeTheme.id;
function setFont(value) {
  const preferred = ['wenkai', 'hei'].includes(value) ? value : activeTheme.theme?.defaultFont;
  const font = preferred === 'hei' ? 'hei' : 'wenkai';
  picker.querySelector('input[value="' + font + '"]').checked = true;
  document.documentElement.dataset.font = font;
}
async function openFontPicker() {
  const entry = activeTheme;
  const sample = document.getElementById('font-sample');
  sample.replaceChildren();
  document.getElementById('sample-module').textContent = entry.name;
  picker.showModal();
  try {
    const module = await modules.open(entry.id);
    const example = module.cards.find(c => c.kind === 'story' && c.interrupt) || module.cards.find(c => c.kind === 'story');
    if (example && picker.open && activeTheme === entry) sample.innerHTML = renderCard(example, module);
  } catch (err) { sample.textContent = err.message; }
}
picker.addEventListener('change', event => {
  setFont(event.target.value);
  try { localStorage.setItem(moduleFontKey(), event.target.value); } catch {}
});
const themePicker = document.getElementById('theme-picker');
const themeKey = 'story-table.ui-theme';
function setTheme(value) {
  const theme = value === 'silver' ? 'silver' : 'graphite';
  document.documentElement.dataset.uiTheme = theme;
  themePicker.querySelector('input[value="' + theme + '"]').checked = true;
  document.querySelector('meta[name="theme-color"]').content = theme === 'silver' ? '#e3e4e3' : '#303133';
}
let savedTheme;
try { savedTheme = localStorage.getItem(themeKey); } catch {}
setTheme(savedTheme);
themePicker.addEventListener('change', event => {
  setTheme(event.target.value);
  try { localStorage.setItem(themeKey, event.target.value); } catch {}
});
window.addEventListener('storage', event => {
  if (event.key === themeKey) setTheme(event.newValue);
});
init();
