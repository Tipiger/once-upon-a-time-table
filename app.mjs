import { enableCoverRelief } from './cover-relief.mjs?v=native-relief-1';
import * as g from './game.mjs?v=gallery-flip-1';
import { catalog, readJSON, savedModule } from './catalog.mjs?v=fonts-1';
import { enableDisplayGesture } from './display-gesture.mjs?v=zoom-4';
import QRCode from './vendor/index.js';

const app = document.querySelector('#app');
const inspection = document.querySelector('#inspection');
const topbar = document.querySelector('#topbar');
const inspectIcon = '<svg class="inspect-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="5.5"/><path d="m12 12 5 5"/></svg>';
const notice = document.querySelector('#notice');
const latest = 'story-table.demo.latest';
let setup = { seats:2, stories:3, endings:2 };
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
const inspectionFoil='<i class="inspection-foil" aria-hidden="true"></i>';
function renderCard(c, module, {back=false,action='',large=false,flip=false,insetArt=false}={}) {
  const end=c.kind==='ending', tag=action?'button':'div';
  const cls='card '+(back?'back '+(end?'endback':''):end?'endface':c.image?'storyface illustrated':'storyface')+(large?' large':'')+(flip?' flip':'');
  const attr=action?' data-action="'+action+'" data-value="'+esc(c.id)+'"':'';
  const body=back?'<span>✧</span><span class="seal">'+(end?'☾':'✥')+'</span><strong>'+(end?'结局牌':'故事牌')+'</strong>':
    end?'<span class="kind">✧ '+esc(module.endingLabel||'结局')+' ✧</span><span class="sentence">'+esc(c.textZh)+'</span><span>❧</span>':
    (c.interrupt?'<span class="interrupt">打断</span>':'')+
    (insetArt?'':illustration(c, module, action === 'zoomArt'))+
    '<strong>'+esc(c.labelZh)+'</strong>';
  return '<'+tag+' class="'+cls+'"'+attr+'>'+body+(large && (back || insetArt)?inspectionFoil:'')+(action?inspectIcon:'')+'</'+tag+'>';
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
 for (const type of ['cover','storyBack','endingBack','storyFrame','endingFrame']) {
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
function deckCounts(cards) {
 const stories=cards.filter(c=>c.kind==='story').length;
 return stories+' 张故事牌 · '+(cards.length-stories)+' 张结局牌';
}
function deckEntry(entry, cards) {
 const name=esc(entry.name);
 return '<button type="button" class="deck-entry" data-view-module aria-label="查看'+name+'完整牌组">'+
   '<span class="deck-entry-fan" aria-hidden="true"><i class="entry-ending"></i><i class="entry-story"></i><i class="entry-cover"></i></span>'+
   '<span class="deck-entry-copy"><strong>'+name+'</strong><small class="entry-counts">'+(cards?deckCounts(cards):'')+'</small>'+
   '<span class="entry-cta">查看完整牌组 <i aria-hidden="true"></i></span></span></button>';
}
function moduleSetup() {
 const entry=selectedEntry();
 const selector=modules.entries.length>1
   ? '<label>选择主题模组<select id="module">'+modules.entries.map(e=>'<option value="'+esc(e.id)+'" '+(e.id===selected?'selected':'')+'>'+esc(e.name)+'</option>').join('')+'</select></label>' : '';
 return '<div class="wide module-choice">'+selector+deckEntry(entry)+'<small>'+esc(entry.description)+'</small></div>';
}
async function homeTheme() {
 const entry=selectedEntry();
 applyArt(entry);
 const counts=app.querySelector('.entry-counts');
 try {
   const data=await modules.open(entry.id);
   if(counts?.isConnected)counts.textContent=deckCounts(data.cards);
 } catch(err){if(counts?.isConnected)tell(err.message);}
}
const appearance = '<div class="head-actions"><button type="button" data-dialog="rules" aria-haspopup="dialog" aria-controls="rules">游戏规则</button><button type="button" data-dialog="settings" aria-haspopup="dialog" aria-controls="settings">设置</button></div>';
const tabItems = [
 ['hand','我的手牌','<rect x="8" y="4" width="12" height="16" rx="2"/><path d="m5 6-2 1 3 14 3-1"/>'],
 ['draw','补牌堆','<rect x="7" y="4" width="13" height="16" rx="2"/><path d="M4 7v13a2 2 0 0 0 2 2m7-15v8m-4-4h8"/>'],
 ['discard','弃牌堆','<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7"/>'],
 ['dealer','发牌台','<path d="m2 8 10-5 10 5-10 5zM3 12l9 5 9-5M3 16l9 5 9-5"/>']
];
function tabs() {
 const visible = tabItems.filter(([id])=>id!=='dealer' || table.host);
 return '<nav class="game-nav" aria-label="牌桌功能"><div>'+visible.map(([id,label,icon])=>
   '<button data-action="tab" data-value="'+id+'" aria-pressed="'+(id===page)+'"><svg viewBox="0 0 24 24" aria-hidden="true">'+icon+'</svg>'+label+'</button>'
 ).join('')+'</div></nav>';
}
function home(){
 return pageHeader('<span class="brand">故事牌桌</span>','','wide-head')+'<section class="hero"><h1>很久很久以前</h1></section>'+
 (table?'<section class="panel row between"><div><b>上次的牌局</b><br><small>'+esc(deck.entry.name)+' · '+seat+' 号</small></div>'+btn('resume','继续牌局','primary')+'</section>':'')+
 '<section class="panel"><h2>新牌局</h2><div class="setup-fields">'+moduleSetup()+'<label>游戏人数<select id="seats">'+options(6,setup.seats,' 人',2)+'</select></label><label>每人故事牌<select id="stories">'+options(10,setup.stories,' 张')+'</select></label><label>每人结局牌<select id="endings">'+options(4,setup.endings,' 张')+'</select></label></div><div class="actions">'+btn('newTable','开始牌局','primary')+'</div><p class="help">其他玩家开局扫码一次，之后在自己的手机上补牌。</p></section>';
}
const backArrow = '<span aria-hidden="true">‹ </span>';
function tableNav(backControl) {
 return '<nav class="hand-nav" aria-label="牌桌导航">'+backControl+appearance+'</nav>';
}
function pageHeader(backControl, content='', width='') {
 topbar.innerHTML = tableNav(backControl);
 return content ? '<header class="game-head hand-head '+width+'">'+content+'</header>' : '';
}
function homeBack() { return btn('home',backArrow+'牌局首页','ghost'); }
function playerSeat() {
 return '<small>'+seat+' 号 · '+(table.host?'房主':'玩家')+'</small>';
}
function handHeader() {
 return pageHeader(homeBack(),deckEntry(deck.entry,deck.cards)+playerSeat(),'hand-overview');
}
function playerHeader(backControl, title, showDeck=true) {
 const context='<div class="player-context"><h1>'+esc(title)+'</h1>'+
   playerSeat()+'</div>';
 return pageHeader(backControl,context+(showDeck?deckEntry(deck.entry,deck.cards):''));
}
// Both sides use the module's card artwork. The outer button owns the interaction.
function cardSides(id) {
 return '<span class="card-turn" aria-hidden="true">'+card(id)+card(id,{back:true})+'</span>';
}

function inspectionFaces(c, module) {
 if (c.kind === 'cover') {
   return '<span class="book-face"></span><span class="book-face book-reverse"></span>';
 }
 const layered = c.kind === 'story' && c.image && module.entry.art?.storyFrame;
 const inset = layered ? '<span class="inset-illustration">'+illustration(c, module, false)+'</span>' : '';
 const rim = c.kind === 'ending' && module.entry.art?.endingFrame ? '<span class="ending-rim">'+inspectionFoil+'</span>' : '';
 return inset+renderCard(c,module,{large:true,insetArt:layered})+rim+renderCard(c,module,{large:true,back:true});
}

function showCardDisplay(c, module, title, back, actions='', note='') {
 app.inert=true;
 inspection.hidden=false;
 inspection.innerHTML='<section class="card-inspection" aria-label="'+esc(title)+'">'+pageHeader(back)+
   '<div class="inspection-body"><div class="inspection-stage">'+
   '<button type="button" class="turnable display-card" aria-describedby="display-hint" aria-label="'+esc(c.textZh || c.labelZh)+'，翻到牌背">'+
   '<span class="display-tilt" aria-hidden="true"><span class="card-turn">'+inspectionFaces(c,module)+
   '</span></span></button></div><div class="inspection-controls"><p class="flip-hint" id="display-hint">轻点翻面 · 拖动看反光 · 双指缩放</p>'+
   (note?'<p class="inspection-note">'+esc(note)+'</p>':'')+
   (actions?'<div class="actions">'+actions+'</div>':'')+'</div></div></section>';
 const display=inspection.querySelector('.display-card');
 enableDisplayGesture(display);
 if(c.kind === 'cover') enableCoverRelief(display,module.entry.art);
 display.focus({preventScroll:true});
}

function drawDialog(batch) {
 const title = batch.opening === undefined ? '领牌' : batch.opening ? '起手牌' : '补牌';
 const cards = batch.cards.map(id => {
   const label = get(id).kind === 'ending' ? '结局牌' : '故事牌';
   return '<button type="button" class="turnable draw-card" data-action="reveal" aria-label="翻开本批卡牌（'+label+'）">'+
     cardSides(id)+'</button>';
 }).join('');
 return '<dialog class="draw-dialog" aria-labelledby="draw-title" aria-describedby="draw-hint">'+
   '<h2 id="draw-title">'+title+' · '+batch.cards.length+' 张</h2>'+
   '<p id="draw-hint" role="status"></p>'+
   '<div class="draw-tray">'+cards+'</div>'+
   '<div class="draw-footer">'+btn('collect','收起到手牌','primary')+'</div></dialog>';
}

// Decode the actual face elements and the shared backgrounds used by this draw.
async function prepareDrawArt(dialog, batch) {
 const images = [...dialog.querySelectorAll('.draw-card img')];
 const kinds = new Set(batch.cards.map(id => get(id).kind));
 const art = deck.entry.art || {};
 const urls = new Set([...kinds].flatMap(kind => [art[kind+'Back'], art[kind+'Frame']]).filter(Boolean));
 for (const url of urls) {
   const image = new Image();
   image.src = url;
   images.push(image);
 }
 function allowReveal(hint) {
   if (!dialog.isConnected || dialog.dataset.revealed === 'true') return;
   dialog.dataset.preparing = 'false';
   dialog.querySelector('#draw-hint').textContent = hint;
   dialog.querySelectorAll('.draw-card').forEach(button => { button.disabled = false; });
 }
 // A slow or missing image must never prevent playing the batch.
 const timer = setTimeout(() => allowReveal('图片仍在加载，可以先翻牌'), 5000);
 try {
   const results = await Promise.allSettled(images.map(image => {
     if (image.decode) return image.decode();
     if (image.complete) return image.naturalWidth ? Promise.resolve() : Promise.reject();
     return new Promise((resolve, reject) => {
       image.addEventListener('load', resolve, {once:true});
       image.addEventListener('error', reject, {once:true});
     });
   }));
   allowReveal(results.some(result => result.status === 'rejected')
     ? '部分图片未加载，可以先翻牌' : '轻点任意牌背，一起翻开');
 } finally {
   clearTimeout(timer);
 }
}

function renderDraw(player) {
 const batch = player.inbox[0];
 const batchKey = JSON.stringify([table.id, seat, batch.cards]);
 let dialog = app.querySelector('.draw-dialog');
 if (!dialog || dialog.dataset.batch !== batchKey) {
   app.innerHTML = handHeader()+tabs()+hand(player)+drawDialog(batch);
   dialog = app.querySelector('.draw-dialog');
   dialog.dataset.batch = batchKey;
   dialog.dataset.revealed = String(batch.revealed);
   dialog.addEventListener('cancel', event => event.preventDefault());
   if (!batch.revealed) {
     dialog.dataset.preparing = 'true';
     dialog.querySelector('#draw-hint').textContent = '正在加载本次卡图…';
     prepareDrawArt(dialog, batch);
   }
 }
 const revealed = batch.revealed;
 dialog.dataset.revealed = String(revealed);
 if (revealed) dialog.querySelector('#draw-hint').textContent = '收起后加入你的手牌';
 const collect = dialog.querySelector('[data-action="collect"]');
 collect.hidden = !revealed;
 dialog.querySelectorAll('.draw-card').forEach((button, index) => {
   const c = get(batch.cards[index]);
   button.disabled = revealed || dialog.dataset.preparing === 'true';
   if (revealed) button.setAttribute('aria-label', c.textZh || c.labelZh);
 });
 if (!dialog.open) dialog.showModal();
 if (revealed) collect.focus({preventScroll:true});
}
function hand(player) {
 const section = (kind, title) => {
   const ids = player.hand.filter(id => get(id).kind === kind);
   const content = ids.length
     ? '<div class="hand-grid">' + ids.map(id => card(id, {action:'show'})).join('') + '</div>'
     : '<p class="empty">'+(player.inbox.length ? '等待收牌' : kind === 'ending' ? '暂无结局牌' : '故事牌已出完，可以选择一张结局收尾。')+'</p>';
   return '<section class="hand-section hand-' + kind + '" aria-label="' + title + '">' +
     '<h2 class="hand-heading"><span>' + title + '</span></h2>' + content + '</section>';
 };
 return '<div class="hand-board">' + section('ending', '结局牌') + section('story', '故事牌') + '</div>';
}
function drawMenu(player) {
 const heading=playerHeader(homeBack(),'补牌堆',false)+tabs();
 if(!player.reserve)return heading+'<section class="panel"><p>本局由房主在发牌台补牌，扫码即可领取。</p></section>';
 const { story, ending } = player.reserve;
 function drawButton(stories, endings, label, description) {
   const disabled = player.wonWith || story.length < stories || ending.length < endings;
   return '<button type="button" data-action="draw" data-value="'+stories+','+endings+'" aria-label="'+description+'"'+(disabled?' disabled':'')+'>'+label+'</button>';
 }
 function pile(kind, label) {
   const isStory = kind === 'story';
   const remaining = player.reserve[kind].length;
   const buttons = [[1,'补一张'], [2,'补两张']].map(([count,text]) => drawButton(isStory ? count : 0, isStory ? 0 : count, text, text+label));
   return '<section class="reserve-pile" aria-label="'+label+'">'+renderCard({kind}, deck, {back:true})+
     '<small>剩余 '+remaining+' 张</small><div class="reserve-counts">'+buttons.join('')+'</div></section>';
 }
 return heading+
   '<section class="panel reserve-panel" aria-label="补牌">'+
   '<div class="reserve-piles">'+pile('story','故事牌')+pile('ending','结局牌')+'</div>'+
   '<div class="reserve-mixed">'+drawButton(1,1,'各补一张','故事牌、结局牌各补一张')+'</div></section>';
}
function dealer(){
 const host=table.host, history=host.history.filter(p=>p.seat===target), opening=history[0], last=history.at(-1);
 return '<section class="panel"><h2>给谁发牌？</h2><div class="seat-grid">'+Array.from({length:host.seats},(_,i)=>'<button data-action="target" data-value="'+(i+1)+'" aria-pressed="'+(target===i+1)+'">'+(i+1)+' 号'+(i===0?' · 我':'')+'</button>').join('')+'</div><div class="line"></div><h3>'+target+' 号玩家</h3><div class="actions">'+btn('slip',target===1?'查看起手牌记录':'出示起手牌码','soft',opening.serial)+(last.opening?'':btn('slip','重显上次补牌码','soft',last.serial))+ '</div>' +
   (opening.reserve ? '<p class="help">每人扫码领取自己的起手牌和补牌堆，之后从底部「补牌堆」补牌。</p>' :
    '<div class="line"></div><h3>补牌</h3><div class="actions">'+btn('issue','补一张故事牌','primary','1,0')+btn('issue','补两张故事牌','','2,0')+btn('issue','各补一张','','1,1')+'</div><p class="help">剩余 '+host.decks.story.length+' 张故事牌 · '+host.decks.ending.length+' 张结局牌</p>')+'</section>';
}
function qrLink() {const url=new URL(location.href);url.search='';url.hash='';return g.transferLink(url,slip);}
function issueSlip(){
 const n=slip.cards.filter(id=>get(id).kind==='story').length, e=slip.cards.length-n;
 return '<section class="panel center"><h2>'+slip.seat+' 号的'+(slip.opening?'起手牌':'补牌')+'</h2><div class="small">'+[n?'故事牌 ×'+n:'',e?'结局牌 ×'+e:''].filter(Boolean).join(' · ')+'</div><canvas class="qr" id="qr" aria-label="本批牌的领取二维码"></canvas><p class="help">用手机相机扫码，在同一浏览器中领取。</p><div class="actions">'+btn('copy','复制领牌链接','primary')+'</div>'+'</section>';
}
function paintQR(){
 const canvas=document.querySelector('#qr');if(!canvas)return;
 const code=new QRCode(-1,1);code.addData(qrLink());code.make();
 const n=code.getModuleCount(), size=(n+8)*6;canvas.width=canvas.height=size;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);ctx.fillStyle='#121912';
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(code.isDark(y,x))ctx.fillRect((x+4)*6,(y+4)*6,6,6);
}
let selectedDiscard = null;
function showDiscardDisplay(player, id) {
 const locked = player.wonWith && player.wonWith !== id;
 const note = locked ? '请先收回获胜的结局牌。' : player.wonWith ? '收回这张结局牌会撤销本次获胜。' : '';
 showCardDisplay(get(id),deck,'查看弃牌',btn('closeDiscard',backArrow+'返回弃牌堆','ghost'),
   locked?'':btn('recall','收回手牌','primary',id),note);
}
function discardView(player) {
 return '<section class="hand-board discard-board" aria-label="个人弃牌堆"><small>共 '+player.discard.length+' 张</small>'+
   (player.discard.length ? '<div class="hand-grid">'+[...player.discard].reverse().map(id=>card(id,{action:'inspectDiscard'})).join('')+'</div>' :
     '<p class="empty">你打出的牌会留在这里。</p>')+'</section>';
}
function showHandDisplay(player) {
 showCardDisplay(get(player.shown),deck,'展示卡牌',btn('withdraw',backArrow+'返回我的手牌','ghost'),
   btn('withdraw','返回')+btn('play','出牌','primary'));
 if(player.confirming){
   inspection.insertAdjacentHTML('beforeend','<dialog class="win-dialog" aria-labelledby="win-question"><h2 id="win-question">用这张结局结束本局？</h2><blockquote>'+esc(get(player.shown).textZh)+'</blockquote><div class="actions">'+btn('cancelWin','取消')+btn('win','确认获胜','primary')+'</div></dialog>');
   const dialog=inspection.querySelector('.win-dialog');
   dialog.addEventListener('cancel',e=>{e.preventDefault();perform('cancelWin');});
   dialog.showModal();
 }

}
let previewDeck, previewCard, returnToCard, galleryKind='all';
function rememberCard(id, action) {
 returnToCard={id, action, scrollY:app.scrollTop};
}
function restoreCard() {
 if(!returnToCard || !inspection.hidden)return;
 const {id,action,scrollY}=returnToCard;
 const trigger=app.querySelector('[data-action="'+action+'"][data-value="'+CSS.escape(id)+'"]');
 if(!trigger)return;
 app.scrollTop=scrollY;
 trigger.focus({preventScroll:true});
 returnToCard=null;
}
const galleryBackLabels = {home:'牌局首页',hand:'我的手牌',draw:'补牌堆',discard:'弃牌堆',dealer:'发牌台',slip:'领牌码',result:'牌局结果'};
function hasTableReferrer() {
  if (!document.referrer || history.length < 2) return false;
  const from = new URL(document.referrer);
  return from.origin === location.origin && from.pathname === location.pathname && !from.searchParams.has('preview');
}
function renderArtPreview() {
  applyArt(previewDeck.entry);
  if (previewCard) {
    showCardDisplay(previewCard,previewDeck,'卡牌大图',btn('closeArt',backArrow+'返回完整牌组','ghost'));
    return;
  }
  const cards=previewDeck.cards;
  const options=[['all','全部'],['story','故事牌'],['ending','结局牌']];
  const filters=options.map(([kind,label])=>{
    const count=kind==='all' ? cards.length : cards.filter(c=>c.kind===kind).length;
    return '<button data-action="filterGallery" data-value="'+kind+'" aria-pressed="'+(galleryKind===kind)+'">'+label+' '+count+'</button>';
  }).join('');
  const visible=galleryKind==='all' ? cards : cards.filter(c=>c.kind===galleryKind);
  const entry = previewDeck.entry;
  const cover = entry.art?.cover ? '<button type="button" class="gallery-cover" data-action="zoomCover" data-value="'+esc(entry.id)+'" aria-label="检视'+esc(entry.name)+'牌组封面">'+
    '<span class="gallery-cover-art" aria-hidden="true"></span>'+inspectIcon+'</button>' : '';
  const synopsis = entry.synopsis || entry.description;
  const intro = '<div class="gallery-intro"><div class="gallery-copy"><h1>'+esc(entry.name)+'</h1>'+
    (synopsis ? '<p>'+esc(synopsis)+'</p>' : '')+'</div>'+cover+'</div>';
  const originPage = new URLSearchParams(location.search).get('from');
  const backLabel = hasTableReferrer() && Object.hasOwn(galleryBackLabels,originPage) ? galleryBackLabels[originPage] : '牌桌';
  const back = '<a class="gallery-back" href="./" data-return-table>'+backArrow+'返回'+backLabel+'</a>';
  app.innerHTML=pageHeader(back,intro,'wide-head gallery-head')+
    '<section class="hand-section" aria-label="完整牌组"><nav class="toolbar gallery-filters" aria-label="卡牌筛选">'+filters+
    '</nav><div class="hand-grid">'+visible.map(c=>renderCard(c,previewDeck,{action:'zoomArt'})).join('')+'</div></section>';
  restoreCard();
}
function render(){
 inspection.hidden=true;
 inspection.replaceChildren();
 app.inert=false;
 app.removeAttribute('aria-busy');
 if(page==='art'){renderArtPreview();return;}
 if(page==='home'||!table){app.innerHTML=home();homeTheme();return;}
 applyArt(deck.entry);
 const player=current();
 if(page==='slip'){
   app.innerHTML=playerHeader(btn('closeSlip',backArrow+'返回发牌台','ghost'),'领牌码')+issueSlip();
 } else if(page==='dealer'&&table.host&&seat===1){
   app.innerHTML=playerHeader(homeBack(),'发牌台',false)+tabs()+dealer();
 } else if(!player){
   app.innerHTML=playerHeader(homeBack(),'领牌')+'<p>请先领取起手牌。</p>';
 } else if(player.shown){
   showHandDisplay(player);
 } else if(player.inbox.length){
   renderDraw(player);
 } else if(page==='draw'){
   app.innerHTML=drawMenu(player);
 } else if(page==='discard'){
   if(selectedDiscard && player.discard.includes(selectedDiscard)){
     showDiscardDisplay(player,selectedDiscard);
   } else {
     selectedDiscard=null;
     app.innerHTML=playerHeader(homeBack(),'弃牌堆',false)+tabs()+discardView(player);
   }
 } else if(player.wonWith){
   app.innerHTML=playerHeader(homeBack(),'牌局结果')+tabs()+'<section class="result"><span class="seal" aria-hidden="true">♛</span><h2>'+seat+' 号玩家获胜</h2><blockquote>'+esc(get(player.wonWith).textZh)+'</blockquote></section>';
 } else {
   app.innerHTML=handHeader()+tabs()+hand(player);
 }
 paintQR();
 restoreCard();
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
   if(a==='zoomCover'){
     rememberCard(v,a);
     previewCard={kind:'cover',labelZh:previewDeck.entry.name+'牌组封面'};
     return;
   }
   if(a==='zoomArt') rememberCard(v,'zoomArt');
   previewCard=a==='zoomArt' ? previewDeck.byId.get(v) : null;
   return;
 }
 if(a==='newTable'){await create();return;}
 if(a==='home'){page='home';return;}
 if(a==='resume'){page='hand';return;}
 if(a==='tab'){selectedDiscard=null;page=v;return;}
 if(a==='inspectDiscard'){rememberCard(v,'inspectDiscard');selectedDiscard=v;return;}
 if(a==='closeDiscard'){selectedDiscard=null;return;}
 if(a==='recall'){
   if(page!=='discard' || selectedDiscard!==v)return;
   selectedDiscard=null;
   await playerChange(s=>g.returnToHand(s,v));
   page='hand';
   returnToCard=null;
   tell('已收回手牌');
   return;
 }
 if(a==='draw'){
   const [stories,endings]=v.split(',').map(Number);
   await playerChange(p=>g.drawLocal(p,stories,endings));
   page='hand';return;
 }
 if(a==='target'){target=+v;return;}
 if(a==='reveal')return playerChange(g.revealBatch);
 if(a==='collect'){
   const dialog=app.querySelector('.draw-dialog');
   if(dialog && !matchMedia('(prefers-reduced-motion: reduce)').matches){
     const leaving=dialog.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(1.25rem) scale(.95)'}],
       {duration:190,easing:'ease-in',fill:'forwards'});
     try { await leaving.finished; } finally { leaving.cancel(); }
   }
   await playerChange(g.collectBatch);
   page='hand';return;
 }
 if(a==='show'){await playerChange(s=>g.showCard(s,v));rememberCard(v,'show');return;}
 if(a==='withdraw')return playerChange(g.withdraw);
 if(a==='play'){await playerChange(s=>g.playShown(s,deck));if(!current().confirming)returnToCard=null;return;}
 if(a==='cancelWin'||a==='win'){await playerChange(s=>g.answerEnding(s,a==='win'));if(a==='win')returnToCard=null;return;}
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
function handleTableClick(e){
 if(e.target.closest('[data-view-module]')){
   const url=new URL(location.pathname,location.href);
   const source={page, game:table?.id, target, serial:slip?.serial};
   if(page==='home')Object.assign(source,{setup,selected});
   history.replaceState({...history.state, gallerySource:source},'');
   url.searchParams.set('from',page==='hand' && current()?.wonWith ? 'result' : page);
   url.searchParams.set('preview','module');
   url.searchParams.set('v',g.releaseVersion);
   url.searchParams.set('module',page==='home'?selected:deck.entry.id);
   location.assign(url);
   return;
 }
 if(e.target.closest('[data-return-table]') && hasTableReferrer()){
   e.preventDefault();history.back();return;
 }
 const trigger=e.target.closest('button[data-dialog]');
 if(trigger){
   if(trigger.dataset.dialog==='settings')openSettings();
   else document.getElementById('rules').showModal();
   return;
 }
 const b=e.target.closest('button[data-action]');if(b)perform(b.dataset.action,b.dataset.value);
}
for (const surface of [app,inspection,topbar]) surface.addEventListener('click',handleTableClick);
app.addEventListener('change',e=>{
 if(e.target.id==='module'){selected=e.target.value;render();app.querySelector('#module')?.focus();}
 if(page==='home' && Object.hasOwn(setup,e.target.id))setup[e.target.id]=Number(e.target.value);
});
async function openPacket(){
 try{await receiveRemote(g.readLink(location.href));history.replaceState(null,'',location.pathname+location.search);}
 catch(err){tell(err.message);}
}
async function init(){
 try{
   modules=catalog(await readJSON('./modules.json?v=castle-clouds-1'));selected=modules.entries[0].id;
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
   // Browsers may rebuild the previous document instead of restoring it from cache.
   const source = history.state?.gallerySource;
   if (source && performance.getEntriesByType('navigation')[0]?.type === 'back_forward') {
     if (source.page === 'home') {
       page='home';
       if(source.setup)setup=source.setup;
       if(modules.entries.some(entry=>entry.id===source.selected))selected=source.selected;
     }
     else if (table && source.game === table.id && Object.hasOwn(galleryBackLabels,source.page)) {
       target=source.target;
       slip=table.host?.history.find(packet=>packet.serial===source.serial);
       page=source.page==='slip' && !slip ? 'hand' : source.page;
     }
   }
   if(location.hash.startsWith('#deal='))await openPacket();
   render();
   if(new URLSearchParams(location.search).get('preview')==='fonts')openSettings();
 }catch(err){app.textContent='牌桌未能打开：'+err.message;}
}
document.addEventListener('keydown',event=>{
  if (event.key!=='Escape' || document.querySelector('dialog[open]')) return;
  if(page==='discard' && selectedDiscard)perform('closeDiscard');
  if(page==='art' && previewCard)perform('closeArt');
  if(page==='hand' && current()?.shown)perform(current().confirming?'cancelWin':'withdraw');
});
window.addEventListener('hashchange',async()=>{if(location.hash.startsWith('#deal=')){await openPacket();render();}});
window.addEventListener('pageshow',async e=>{if(e.persisted&&table){table=await g.updateSaved(key(table.id));render();}});
document.addEventListener('visibilitychange',async()=>{if(!document.hidden&&table&&!busy){table=await g.updateSaved(key(table.id));render();}});
const picker = document.getElementById('settings');
let activeTheme;
const moduleFontKey = () => 'story-table.font.' + activeTheme.id;
function setFont(value) {
  const preferred = ['wenkai', 'hei'].includes(value) ? value : activeTheme.theme?.defaultFont;
  const font = preferred === 'hei' ? 'hei' : 'wenkai';
  picker.querySelector('input[value="' + font + '"]').checked = true;
  document.documentElement.dataset.font = font;
}
async function openSettings() {
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
  if (event.target.name !== 'typeface') return;
  setFont(event.target.value);
  try { localStorage.setItem(moduleFontKey(), event.target.value); } catch {}
});
const themeKey = 'story-table.ui-theme';
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
let themePreference;
function applyTheme() {
  const dark = themePreference === 'graphite' || (themePreference === 'system' && systemTheme.matches);
  document.documentElement.dataset.uiTheme = dark ? 'graphite' : 'silver';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#303133' : '#e3e4e3';
}
function setTheme(value) {
  themePreference = ['graphite', 'system'].includes(value) ? value : 'silver';
  picker.querySelector('input[name="theme"][value="' + themePreference + '"]').checked = true;
  applyTheme();
}
let savedTheme;
try { savedTheme = localStorage.getItem(themeKey); } catch {}
setTheme(savedTheme);
systemTheme.addEventListener('change', () => {
  if (themePreference === 'system') applyTheme();
});
picker.addEventListener('change', event => {
  if (event.target.name !== 'theme') return;
  setTheme(event.target.value);
  try { localStorage.setItem(themeKey, themePreference); } catch {}
});
window.addEventListener('storage', event => {
  if (event.key === themeKey || event.key === null) setTheme(event.newValue);
});
init();
