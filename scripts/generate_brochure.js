#!/usr/bin/env node
'use strict';
const PDFDocument = require('pdfkit');
const fs   = require('fs');
const path = require('path');

const OUT    = path.join(__dirname, '..', 'TRADING_OS_BROCHURE.pdf');
const LOGO   = path.join(__dirname, '..', 'public', 'ICON.png');
const RANKS  = path.join(__dirname, '..', 'public', 'ranks');
const BG_IMG = path.join('D:/CLAUDE TEMP/Dimas Trading Fund OS', 'brouch.png');

// App colours (exact match)
const BG   = '#07070d';
const BG2  = '#0e0e1a';
const BG3  = '#15151f';
const BD   = '#25253a';
const BD2  = '#34344e';
const ACC  = '#ff6b00';   // orange primary
const CYAN = '#00e5ff';   // cyan secondary
const GRN  = '#14f195';   // neon green (profit)
const RED  = '#ff2d55';   // neon red (loss)
const AMB  = '#ffb800';   // amber
const WHT  = '#e9e9f2';   // text primary
const GRY  = '#8b8ba6';   // text secondary
const DIM  = '#51516a';   // text muted

const W = 595.28, H = 841.89;

const doc = new PDFDocument({ size:'A4', margin:0,
  info:{ Title:'DIMA Trading OS', Author:'DIMA Trading OS' }});
doc.pipe(fs.createWriteStream(OUT));

// ─── helpers ──────────────────────────────────────────────────────────────────
function bg(c=BG){
  doc.rect(0,0,W,H).fill(c);
  // Custom background image
  if(fs.existsSync(BG_IMG)){
    doc.image(BG_IMG, 0, 0, {width:W, height:H});
  }
}

function grid(op=0.018, sz=44){
  doc.save().opacity(op).strokeColor(CYAN).lineWidth(0.3);
  for(let x=0;x<W;x+=sz) doc.moveTo(x,0).lineTo(x,H).stroke();
  for(let y=0;y<H;y+=sz) doc.moveTo(0,y).lineTo(W,y).stroke();
  doc.restore();
}

function scanlines(){
  doc.save().opacity(0.04);
  for(let y=0;y<H;y+=4) doc.rect(0,y,W,1.5).fill('#000');
  doc.restore();
}

// Full-page candlestick chart background
function candleBg(){
  // Seeded random candles filling the whole page
  const candles = [];
  let price = 120, trend = 0;
  const cols = 28, colW = W / cols;
  for(let i=0;i<cols;i++){
    trend += (Math.random()-0.48)*3;
    const bull = trend > 0 || Math.random()>0.45;
    const bodyH = 18 + Math.random()*55;
    const bodyY = 80 + Math.random()*(H-200-bodyH);
    const wickT = bodyY - 8 - Math.random()*22;
    const wickB = bodyY + bodyH + 8 + Math.random()*22;
    candles.push({x: i*colW + colW*0.15, y:bodyY, h:bodyH, wt:wickT, wb:wickB, bull, w:colW*0.65});
    price += bull ? bodyH*0.3 : -bodyH*0.3;
  }

  // Draw large faded candles across full page
  candles.forEach(c=>{
    const col = c.bull ? GRN : RED;
    // Wick
    doc.save().opacity(0.07).strokeColor(col).lineWidth(1.2)
       .moveTo(c.x+c.w/2, c.wt).lineTo(c.x+c.w/2, c.wb).stroke();
    doc.restore();
    // Body
    doc.save().opacity(c.bull ? 0.09 : 0.08);
    doc.rect(c.x, c.y, c.w, c.h).fill(col);
    doc.restore();
    // Body border
    doc.save().opacity(0.12).lineWidth(0.5).strokeColor(col);
    doc.rect(c.x, c.y, c.w, c.h).stroke();
    doc.restore();
  });

  // Moving average line (subtle green trend line)
  doc.save().opacity(0.12).strokeColor(GRN).lineWidth(1.5);
  const pts = candles.map((c,i)=>({x: c.x+c.w/2, y: c.y+c.h/2}));
  // Smooth it
  for(let i=0;i<pts.length-1;i++){
    const p1=pts[i], p2=pts[i+1];
    if(i===0) doc.moveTo(p1.x, p1.y);
    doc.lineTo(p2.x, p2.y);
  }
  doc.stroke();
  doc.restore();

  // Volume bars at bottom (very subtle)
  candles.forEach(c=>{
    const vol = 15 + Math.random()*40;
    doc.save().opacity(0.05).rect(c.x+1, H-vol-20, c.w-2, vol).fill(c.bull?GRN:RED);
    doc.restore();
  });
}

function hudBrackets(x,y,w,h,color=ACC,size=10){
  doc.save().strokeColor(color).lineWidth(1.5).opacity(1);
  doc.moveTo(x,y+size).lineTo(x,y).lineTo(x+size,y).stroke();
  doc.moveTo(x+w-size,y).lineTo(x+w,y).lineTo(x+w,y+size).stroke();
  doc.moveTo(x,y+h-size).lineTo(x,y+h).lineTo(x+size,y+h).stroke();
  doc.moveTo(x+w-size,y+h).lineTo(x+w,y+h).lineTo(x+w,y+h-size).stroke();
  doc.restore();
}

function card(x,y,w,h,fill=BG3,stroke=BD){
  doc.roundedRect(x,y,w,h,4).fill(fill);
  doc.roundedRect(x,y,w,h,4).lineWidth(0.7).stroke(stroke);
}

function neonLine(x1,y1,x2,y2,color=ACC,op=0.7){
  doc.save().opacity(op*0.25).strokeColor(color).lineWidth(3)
     .moveTo(x1,y1).lineTo(x2,y2).stroke();
  doc.restore();
  doc.save().opacity(op).strokeColor(color).lineWidth(1)
     .moveTo(x1,y1).lineTo(x2,y2).stroke();
  doc.restore();
}

function topBar(label=''){
  doc.rect(0,0,W,3).fill(ACC);
  if(fs.existsSync(LOGO)){
    doc.save().circle(48,27,15).clip();
    doc.image(LOGO,33,12,{width:30,height:30});
    doc.restore();
  }
  doc.fillColor(ACC).font('Helvetica-Bold').fontSize(9)
     .text('DIMA // TRADING OS',68,17,{lineBreak:false});
  doc.fillColor(DIM).font('Helvetica').fontSize(8)
     .text(label,68,29,{lineBreak:false});
  doc.roundedRect(W-78,9,72,18,3).fill(BG3);
  doc.roundedRect(W-78,9,72,18,3).lineWidth(0.5).stroke(BD2);
  doc.fillColor(GRN).font('Helvetica-Bold').fontSize(8)
     .text('v1.0.11  LIVE',W-76,14,{lineBreak:false});
  neonLine(0,46,W,46,ACC,0.5);
}

function footerLine(page){
  neonLine(0,H-32,W,H-32,BD,0.4);
  doc.fillColor(DIM).font('Helvetica').fontSize(8)
     .text(`DIMA TRADING OS  //  page ${page} of 4`, 0, H-22, {align:'center'});
}

function rankBadge(name, x, y, size=48){
  const file = path.join(RANKS, `rank_${name.toLowerCase()}.png`);
  if(fs.existsSync(file)){
    doc.image(file, x, y, {width:size, height:size});
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE 1 — COVER
// ─────────────────────────────────────────────────────────────────────────────
bg(); grid(); scanlines();

// Cyber diagonal lines top-right
doc.save().opacity(0.06).strokeColor(CYAN).lineWidth(1);
for(let i=0;i<8;i++) doc.moveTo(W-80+i*14,0).lineTo(W+i*14,90).stroke();
doc.restore();
// Bottom-left diagonals
doc.save().opacity(0.04).strokeColor(ACC).lineWidth(1);
for(let i=0;i<5;i++) doc.moveTo(0,H-40+i*18).lineTo(60,H+i*18).stroke();
doc.restore();

doc.rect(0,0,W,3).fill(ACC);
doc.rect(0,3,W,1).fill(ACC+'55');

// Logo — LARGE centred
const LS = 260, LX = (W-LS)/2, LY = 65;
if(fs.existsSync(LOGO)){
  // Subtle ring (no glow circles — just a single clean ring)
  doc.save().opacity(0.5).circle(LX+LS/2,LY+LS/2,LS/2+3)
     .lineWidth(1).strokeColor(CYAN).stroke();
  doc.restore();
  doc.save().circle(LX+LS/2,LY+LS/2,LS/2).clip();
  // Scale up 2.0x so the bull fully fills the circle (image has ~40% black padding)
  const logoScale = LS * 2.0;
  const logoOffset = (logoScale - LS) / 2;
  doc.image(LOGO, LX - logoOffset, LY - logoOffset, {width:logoScale, height:logoScale});
  doc.restore();
  hudBrackets(LX-14,LY-14,LS+28,LS+28,ACC,18);
}

// Title
doc.fillColor(WHT).font('Helvetica-Bold').fontSize(46)
   .text('DIMA // TRADING OS', 0, LY+LS+28, {align:'center'});

doc.fillColor(ACC).font('Helvetica-Bold').fontSize(15)
   .text('PROFESSIONAL AI-POWERED TRADING SYSTEM', 0, LY+LS+82, {align:'center'});

neonLine(80, LY+LS+112, W-80, LY+LS+112, ACC, 0.5);

doc.fillColor(GRY).font('Helvetica').fontSize(13)
   .text('Scan smarter.  Trade better.  Track everything.', 0, LY+LS+120, {align:'center'});

// Feature pills
const pills = ['6 AI Agents','Live Prices','ELO Ranking','Telegram Alerts','Auto-Updates'];
const pW=96, pH=26, pGap=8, pTotal = pills.length*(pW+pGap)-pGap;
let px = (W-pTotal)/2, pY = LY+LS+154;
pills.forEach((p,i) => {
  const isFirst = (i===0);
  card(px, pY, pW, pH, isFirst ? ACC : BG2, isFirst ? ACC : BD2);
  doc.fillColor(isFirst ? '#fff' : CYAN).font('Helvetica-Bold').fontSize(8.5)
     .text(p, px, pY+9, {width:pW, align:'center', lineBreak:false});
  if(!isFirst) hudBrackets(px,pY,pW,pH,CYAN,4);
  px += pW+pGap;
});

doc.rect(0,H-65,W,65).fill(BG2);
neonLine(0,H-65,W,H-65,ACC,0.5);
doc.fillColor(DIM).font('Helvetica').fontSize(9.5)
   .text('github.com/dimaba321/dima-trading-os-app/releases/latest', 0, H-46, {align:'center'});
doc.fillColor(DIM).fontSize(8.5)
   .text('Your data stays on your machine  //  No subscriptions  //  No cloud', 0, H-28, {align:'center'});

// ─────────────────────────────────────────────────────────────────────────────
// PAGE 2 — WHAT IS IT?
// ─────────────────────────────────────────────────────────────────────────────
doc.addPage(); bg(); grid(); scanlines();
doc.save().opacity(0.05).strokeColor(CYAN).lineWidth(0.5);
for(let i=0;i<5;i++) doc.moveTo(W-40+i*20,0).lineTo(W+20+i*20,100).stroke();
doc.restore();
topBar('What Is It?');

doc.fillColor(ACC).font('Helvetica-Bold').fontSize(10)
   .text('// OVERVIEW', 50, 62, {lineBreak:false});
doc.fillColor(WHT).font('Helvetica-Bold').fontSize(30)
   .text('Your Personal Trading', 50, 78);
doc.fillColor(CYAN).font('Helvetica-Bold').fontSize(30)
   .text('Intelligence System', 50, 114);
neonLine(50,152,W-50,152,ACC,0.5);

doc.fillColor(WHT).font('Helvetica').fontSize(11).lineGap(4)
   .text('A complete desktop trading OS that combines AI agents, live market scanning, and professional performance tracking — all running locally on your computer. No subscriptions. No cloud. Your data stays yours.',
     50, 160, {width:W-100});

const features = [
  {label:'6 AI-POWERED AGENTS',  body:'Scout, WhatsHot, Technicals, CEO, Risk, and Stats work together — scanning 200+ stocks every hour during market hours using the 150 SMA system.',color:ACC},
  {label:'LIVE MARKET DATA',     body:'Real-time prices, Fear & Greed index, BTC correlation, and sector momentum — all in one dashboard. Prices refresh every 60 seconds.',color:CYAN},
  {label:'ELO PERFORMANCE RANK', body:'Your trading skill tracked like a chess rating. Calibrated from your trade history, then updated with every closed position.',color:'#bd00ff'},
  {label:'TELEGRAM ALERTS',      body:'Stop hits, target reached, approaching stop (3%), and approaching target (5%) — sent directly to your phone every hour.',color:GRN},
];
const cW=(W-120)/2, cH=116, cGap=20;
features.forEach((f,i) => {
  const cx = 50+(i%2)*(cW+cGap);
  const cy = 252+Math.floor(i/2)*(cH+16);
  card(cx,cy,cW,cH,BG2,BD);
  for(let g=3;g>=1;g--){
    doc.save().opacity(0.12/g).rect(cx,cy,3+g*1.2,cH).fill(f.color).restore();
  }
  doc.rect(cx,cy,3,cH).fill(f.color);
  doc.roundedRect(cx+14,cy+10,26,22,3).fill(f.color+'33');
  doc.roundedRect(cx+14,cy+10,26,22,3).lineWidth(0.7).stroke(f.color);
  doc.fillColor(f.color).font('Helvetica-Bold').fontSize(13)
     .text(`0${i+1}`, cx+19, cy+16, {lineBreak:false});
  doc.fillColor(f.color).font('Helvetica-Bold').fontSize(10)
     .text(f.label, cx+48, cy+14, {lineBreak:false});
  neonLine(cx+48,cy+30,cx+cW-12,cy+30,f.color,0.3);
  doc.fillColor(WHT).font('Helvetica').fontSize(9.5).lineGap(2)
     .text(f.body, cx+14, cy+40, {width:cW-28});
  hudBrackets(cx,cy,cW,cH,f.color,7);
});

const sbY = H-115;
doc.rect(30,sbY,W-60,68).fill(BG2);
doc.roundedRect(30,sbY,W-60,68,4).lineWidth(0.8).stroke(BD2);
hudBrackets(30,sbY,W-60,68,CYAN,8);
const stats=[['200+','Stocks Scanned'],['6','AI Agents'],['1 HR','Scan Interval'],['24/7','Data Tracking']];
const sW=(W-60)/4;
stats.forEach(([n,l],i) => {
  const sx=30+i*sW;
  if(i>0){ neonLine(sx,sbY+12,sx,sbY+56,BD,0.4); }
  doc.fillColor(ACC).font('Helvetica-Bold').fontSize(28)
     .text(n, sx, sbY+8, {width:sW, align:'center', lineBreak:false});
  doc.fillColor(GRY).font('Helvetica').fontSize(9)
     .text(l, sx, sbY+44, {width:sW, align:'center', lineBreak:false});
});
footerLine(2);

// ─────────────────────────────────────────────────────────────────────────────
// PAGE 3 — HOW IT WORKS
// ─────────────────────────────────────────────────────────────────────────────
doc.addPage(); bg(); grid(); scanlines();
doc.save().opacity(0.05).strokeColor(ACC).lineWidth(0.5);
for(let i=0;i<5;i++) doc.moveTo(0,200+i*30).lineTo(80,200+i*30+40).stroke();
doc.restore();
topBar('How It Works');

doc.fillColor(ACC).font('Helvetica-Bold').fontSize(10)
   .text('// AGENT PIPELINE', 50, 62, {lineBreak:false});
doc.fillColor(WHT).font('Helvetica-Bold').fontSize(30)
   .text('Intelligent Scanning,', 50, 78);
doc.fillColor(GRN).font('Helvetica-Bold').fontSize(30)
   .text('Every Hour', 50, 114);
neonLine(50,152,W-50,152,GRN,0.4);

// Agent pipeline
const agents=[
  {name:'SCOUT',      sub:'150 SMA\nScanner',    color:GRN},
  {name:'WHATS HOT',  sub:'Reddit\n+ News',       color:CYAN},
  {name:'TECHNICALS', sub:'RSI / MACD\nBB / EMA', color:'#bd00ff'},
  {name:'CEO AGENT',  sub:'Score &\nFilter',      color:ACC},
  {name:'ALERT',      sub:'Telegram\nPhone',      color:GRN},
];
const aW=82, aH=58, aGap=12, aTot=agents.length*(aW+aGap)-aGap;
let ax=(W-aTot)/2, aY=164;
agents.forEach((ag,i) => {
  card(ax,aY,aW,aH,BG2,ag.color);
  doc.rect(ax,aY,aW,3).fill(ag.color);
  doc.fillColor(ag.color).font('Helvetica-Bold').fontSize(8.5)
     .text(ag.name, ax, aY+10, {width:aW, align:'center', lineBreak:false});
  neonLine(ax+10,aY+22,ax+aW-10,aY+22,ag.color,0.25);
  doc.fillColor(WHT).font('Helvetica').fontSize(7.5)
     .text(ag.sub, ax+4, aY+28, {width:aW-8, align:'center'});
  hudBrackets(ax,aY,aW,aH,ag.color,5);
  if(i<agents.length-1){
    const arX=ax+aW+1, arMid=aY+aH/2;
    neonLine(arX,arMid,arX+aGap-2,arMid,ACC,0.9);
    doc.save().fillColor(ACC).opacity(1);
    doc.polygon([arX+aGap-3,arMid-4],[arX+aGap+2,arMid],[arX+aGap-3,arMid+4]).fill();
    doc.restore();
  }
  ax+=aW+aGap;
});

// 3 col explainer
const cols=[
  {n:'01',title:'SCAN',   body:'Agents scan 200+ stocks every hour during market hours (9:30-16:00 ET) using the proven 150 SMA system. Only stocks above a rising 150-day average qualify.',color:ACC},
  {n:'02',title:'SIGNAL', body:'The CEO Agent merges Scout + WhatsHot data, applies market regime filters, and scores each setup. Only high-confidence signals above 65 points are sent.',color:CYAN},
  {n:'03',title:'TRACK',  body:'Every trade is logged, scored for R-multiple and execution quality, and fed back to the Stats Agent — improving signal accuracy over time.',color:GRN},
];
const colW=(W-100)/3, colGap=15, colY=248;
cols.forEach((c,i) => {
  const cx=50+i*(colW+colGap);
  card(cx,colY,colW,148,BG2,BD);
  doc.rect(cx,colY,colW,3).fill(c.color);
  doc.save().opacity(0.07).fillColor(c.color).font('Helvetica-Bold').fontSize(52)
     .text(c.n,cx+4,colY+6,{lineBreak:false});
  doc.restore();
  doc.fillColor(c.color).font('Helvetica-Bold').fontSize(34)
     .text(c.n, cx+12, colY+10, {lineBreak:false});
  neonLine(cx+12,colY+54,cx+colW-12,colY+54,c.color,0.3);
  doc.fillColor(WHT).font('Helvetica-Bold').fontSize(12)
     .text(c.title, cx+12, colY+60, {lineBreak:false});
  doc.fillColor(WHT).font('Helvetica').fontSize(9.5).lineGap(2)
     .text(c.body, cx+12, colY+78, {width:colW-24});
  hudBrackets(cx,colY,colW,148,c.color,6);
});

// ELO section
const eloY=418;
doc.fillColor(WHT).font('Helvetica-Bold').fontSize(13)
   .text('ELO RANKING SYSTEM', 50, eloY);
neonLine(50,eloY+18,W-50,eloY+18,ACC,0.4);
doc.fillColor(WHT).font('Helvetica').fontSize(9.5)
   .text('Calibrated from your full trade history, then updated with every closed position.',50,eloY+24);

const eloColW=(W-116)/2, eloY2=eloY+46;

// CLIMB
card(50,eloY2,eloColW,110,BG2,BD);
doc.rect(50,eloY2,eloColW,3).fill(GRN);
doc.fillColor(GRN).font('Helvetica-Bold').fontSize(11)
   .text('HOW YOU CLIMB', 62, eloY2+10, {lineBreak:false});
neonLine(62,eloY2+25,50+eloColW-12,eloY2+25,GRN,0.3);
['+R x 100 pts  —  Profit in multiples of your stop',
 '+ 10 pts  —  Followed your trade plan',
 '+ 10 pts  —  Perfect entry timing',
 '+  5 pts  —  Clean exit at target',
].forEach((t,i) => {
  doc.fillColor(i===0?GRN:WHT).font(i===0?'Helvetica-Bold':'Helvetica').fontSize(8.5)
     .text(t, 62, eloY2+33+i*17, {lineBreak:false});
});
hudBrackets(50,eloY2,eloColW,110,GRN,6);

// DEMOTE
const dx=50+eloColW+16;
card(dx,eloY2,eloColW,110,BG2,BD);
doc.rect(dx,eloY2,eloColW,3).fill(RED);
doc.fillColor(RED).font('Helvetica-Bold').fontSize(11)
   .text('HOW YOU DEMOTE', dx+12, eloY2+10, {lineBreak:false});
neonLine(dx+12,eloY2+25,dx+eloColW-12,eloY2+25,RED,0.3);
['-R x 100 pts  —  Loss in multiples of your stop',
 '- 150 pts  —  EMOTIONAL trade penalty',
 'FOMO / no stop / oversized position',
 'ELO never drops below zero',
].forEach((t,i) => {
  doc.fillColor(i===0?RED:i===1?RED:i===2?AMB:WHT)
     .font(i===0||i===1?'Helvetica-Bold':'Helvetica').fontSize(8.5)
     .text(t, dx+12, eloY2+33+i*17, {lineBreak:false});
});
hudBrackets(dx,eloY2,eloColW,110,RED,6);

// Rank badges with actual PNG images
const rankData=[
  {name:'bronze',  label:'BRONZE',   range:'0-999',   color:'#CD7F32'},
  {name:'silver',  label:'SILVER',   range:'1K-1.9K', color:'#C0C0C0'},
  {name:'gold',    label:'GOLD',     range:'2K-2.9K', color:'#FFD700'},
  {name:'platinum',label:'PLATINUM', range:'3K-3.9K', color:'#E5E4E2'},
  {name:'diamond', label:'DIAMOND',  range:'4K-4.9K', color:'#00BFFF'},
  {name:'master',  label:'MASTER',   range:'5K+',     color:'#FF4500'},
];
const rW=(W-100)/rankData.length, rY2=eloY2+122;
doc.fillColor(GRY).font('Helvetica').fontSize(8)
   .text('RANK TIERS  (promotion requires ELO threshold + 70%+ technical trades + positive avg R)',50,rY2-12,{width:W-100});
rankData.forEach((r,i) => {
  const rx=50+i*rW;
  card(rx+2,rY2,rW-4,76,BG2,BD);
  doc.rect(rx+2,rY2,rW-4,3).fill(r.color);
  // Badge image
  const bFile=path.join(RANKS,`rank_${r.name}.png`);
  if(fs.existsSync(bFile)){
    const bSize=34;
    doc.image(bFile, rx+(rW-bSize)/2, rY2+8, {width:bSize,height:bSize});
  }
  doc.fillColor(r.color).font('Helvetica-Bold').fontSize(7.5)
     .text(r.label, rx, rY2+48, {width:rW, align:'center', lineBreak:false});
  doc.fillColor(DIM).font('Helvetica').fontSize(7)
     .text(r.range, rx, rY2+60, {width:rW, align:'center', lineBreak:false});
  hudBrackets(rx+2,rY2,rW-4,76,r.color,4);
  if(i<rankData.length-1){
    doc.fillColor(GRY).opacity(0.4).font('Helvetica-Bold').fontSize(10)
       .text('>', rx+rW-6, rY2+28, {lineBreak:false});
    doc.opacity(1);
  }
});
footerLine(3);

// ─────────────────────────────────────────────────────────────────────────────
// PAGE 4 — GET STARTED
// ─────────────────────────────────────────────────────────────────────────────
doc.addPage(); bg(); grid(); scanlines();
doc.save().opacity(0.05).strokeColor(CYAN).lineWidth(0.5);
for(let i=0;i<5;i++) doc.moveTo(W,300+i*35).lineTo(W-70,300+i*35+30).stroke();
doc.restore();
topBar('Get Started');

doc.fillColor(ACC).font('Helvetica-Bold').fontSize(10)
   .text('// QUICK START', 50, 62, {lineBreak:false});
doc.fillColor(WHT).font('Helvetica-Bold').fontSize(30)
   .text('Up and Running', 50, 78);
doc.fillColor(GRN).font('Helvetica-Bold').fontSize(30)
   .text('in 5 Minutes', 50, 114);
neonLine(50,152,W-50,152,GRN,0.45);

const steps=[
  {n:'1',title:'INSTALL', body:'Download and run the .exe installer. The app installs silently — no wizard needed. A shortcut appears on your Desktop automatically.',color:ACC},
  {n:'2',title:'SETUP',   body:'The setup wizard opens on first launch. Enter your name and Anthropic API key. Telegram, NewsAPI, and Finnhub are optional but unlock full features.',color:CYAN},
  {n:'3',title:'CONNECT', body:'Create a Telegram bot via @BotFather in 2 minutes. The app sends stop hits, target alerts, and approaching level warnings to your phone.',color:'#bd00ff'},
  {n:'4',title:'TRADE',   body:'Agents start scanning automatically every hour during US market hours. Add your open positions — P&L, ELO rank, and stats all update automatically.',color:GRN},
];
const stW=W-100, stH=72, stGap=12;
steps.forEach((s,i) => {
  const sy=165+i*(stH+stGap);
  card(50,sy,stW,stH,BG2,BD);
  for(let g=3;g>=1;g--){
    doc.save().opacity(0.12/g).rect(50,sy,3+g,stH).fill(s.color).restore();
  }
  doc.rect(50,sy,3,stH).fill(s.color);
  doc.save().opacity(0.18).circle(80,sy+stH/2,18).fill(s.color).restore();
  doc.circle(80,sy+stH/2,18).lineWidth(1.5).stroke(s.color);
  doc.fillColor(s.color).font('Helvetica-Bold').fontSize(18)
     .text(s.n, 80-5, sy+stH/2-11, {lineBreak:false});
  doc.fillColor(WHT).font('Helvetica-Bold').fontSize(13)
     .text(s.title, 110, sy+12, {lineBreak:false});
  doc.fillColor(WHT).font('Helvetica').fontSize(9.5).lineGap(1)
     .text(s.body, 110, sy+30, {width:stW-68});
  hudBrackets(50,sy,stW,stH,s.color,6);
});

// Auto-update callout
const ubY=570;
card(50,ubY,W-100,52,BG2,BD);
doc.rect(50,ubY,W-100,3).fill(GRN);
doc.fillColor(GRN).font('Helvetica-Bold').fontSize(11)
   .text('AUTOMATIC UPDATES', 68, ubY+11, {lineBreak:false});
doc.fillColor(WHT).font('Helvetica').fontSize(9.5)
   .text('One click — downloads in background, installs silently, relaunches. No manual reinstall. Your data is never touched.', 68, ubY+28, {width:W-140});
hudBrackets(50,ubY,W-100,52,GRN,7);

// CTA
const ctaY=640;
doc.rect(0,ctaY,W,H-ctaY).fill(BG2);
neonLine(0,ctaY,W,ctaY,ACC,0.6);
doc.save().opacity(0.04).strokeColor(CYAN).lineWidth(0.5);
for(let i=0;i<10;i++) doc.moveTo(i*65,ctaY).lineTo(i*65+50,H).stroke();
doc.restore();

doc.fillColor(WHT).font('Helvetica-Bold').fontSize(16)
   .text('DOWNLOAD LATEST VERSION', 0, ctaY+24, {align:'center'});
doc.fillColor(CYAN).font('Helvetica').fontSize(11)
   .text('github.com/dimaba321/dima-trading-os-app/releases/latest', 0, ctaY+46, {align:'center'});

const badges=[['NO SUBS','Pay nothing monthly'],['NO CLOUD','All data stays local'],['AUTO-UPDATE','Always current']];
const bdW=(W-100)/3;
badges.forEach(([title,sub],i) => {
  const bx=50+i*bdW, by=ctaY+82;
  if(i>0){ neonLine(bx,by+4,bx,by+44,BD,0.4); }
  doc.fillColor(ACC).font('Helvetica-Bold').fontSize(10)
     .text(title, bx, by+6, {width:bdW, align:'center', lineBreak:false});
  doc.fillColor(GRY).font('Helvetica').fontSize(8.5)
     .text(sub, bx, by+21, {width:bdW, align:'center', lineBreak:false});
});

footerLine(4);

// ─────────────────────────────────────────────────────────────────────────────
doc.end();
console.log('Brochure generated:', OUT);
