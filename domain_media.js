/* ============================================================
   BIT://ESCAPE · AS 世界 · 领域模块「失真画廊」(domain_media.js)
   9618 AS — §1.3 图像表示 (位图/色深/分辨率/RLE 压缩)
              §1.4 声音表示 (采样率/采样分辨率/文件大小)
              压缩总论 (有损 vs 无损)
   ------------------------------------------------------------
   一座半荒废的画廊/音乐厅——这台机器存放感官记忆的地方。
   很多展品都已经失真, 你要做的不是"重画", 是"按压缩码读懂它,
   再亲手重建它"——玩法即知识。
   空间: 北 = 保管库(有损/无损双生姐妹 + Boss); 南门厅 = 入口;
        西厅 = 影像展区(RLE 壁画/相框选型); 东厅 = 乐坊(采样修复)。
   与第1章「数据表示馆」(domain_data.js) 互为姊妹馆: 那里是入门
   (1-bit 位图/单一采样率选择), 这里是深潜(RLE压缩/色深×分辨率
   →文件大小/采样率+采样分辨率的双变量取舍/有损无损的取舍判断)。
   ------------------------------------------------------------
   模块协议 (与 domain_net.js / domain_sec.js 一致):
     window.GAME_MODULES.push({ id,title,world,unlock,interior,
                                 npcs,steles,quests,puzzles,
                                 onEnter,onQuestComplete })
   - npcs[i].dialog 是函数 dialog(api) -> 对话节点数组, 节点格式
     {sp,t,choices:[{t,next,do}],next}, next 缺省 i+1, next:-1 结束。
   - 双语: 一切面向玩家的字符串都是 {en,zh} 对象(默认英文)。
     结构化字段直接携带 {en,zh}, 由引擎统一过 window.T;
     render() 自建 DOM 的文字在本模块内自行过 T()/tx()。
   - puzzle.render(el,api) 自建 DOM; onKey(e,api) 处理 '?' 提示热键。
   - 失败≥2次提示自动升级到近乎给答案(见 addHints/bumpFail)。
   - 纯逻辑判定函数导出在 spec._test, 供 node 单测(引擎请忽略)。
   - 不发网络请求; WebAudio 仅在用户手势(点击播放按钮)后 resume,
     且判分逻辑与音频播放完全解耦——听不听声音都不影响判分。
   ================================================================ */
(function(){
'use strict';

/* ---------------- 双语 fallback ---------------- */
var T=window.T||function(s){return typeof s==='string'?s:(s&&s.en!=null?s.en:'');};
function B(en,zh){return {en:en,zh:zh};}          // 结构化字段用: 挂 {en,zh}
function tx(en,zh){return T({en:en,zh:zh});}      // render()/toast 用: 立即取当前语言

/* ---------------- api 安全封装 ---------------- */
var API=null;
function _api(a){ if(a)API=a; return API; }
function S(api,name){ try{ if(!api||!api.sfx)return; if(typeof api.sfx==='function')api.sfx(name); else if(typeof api.sfx[name]==='function')api.sfx[name](); }catch(e){} }
function TOAST(api,msg,long){ try{ api&&api.toast&&api.toast(T(msg),long); }catch(e){} }
function FLAG(api,k){ try{ return api&&api.getFlag?api.getFlag(k):null; }catch(e){ return null; } }
function SET(api,k,v){ try{ api&&api.setFlag&&api.setFlag(k,v===undefined?true:v); }catch(e){} }
function STEP(api,q,s){ try{ api&&api.completeStep&&api.completeStep(q,s); }catch(e){} }
function MARK(api,q){ try{ api&&api.questDone&&api.questDone(q); }catch(e){} }
function GIVE(api,id,name){ try{ api&&api.giveItem&&api.giveItem(id,T(name)); }catch(e){} }
function HAS(api,id){ try{ return !!(api&&api.hasItem&&api.hasItem(id)); }catch(e){ return false; } }
function esc(s){ return String(s==null?'':s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];}); }
/* nodes.sig 契约 (#barksig): 给对话节点数组挂一个反映「对话状态」的稳定签名字符串,
   引擎的 sigOfNodes 优先用它判「是否有新对话」的 ❕ 气泡——只在真有新内容时变化,
   不随首节点文本(如 bark 轮换)波动。sigWrap 把某 dialog 的返回数组统一挂上 sigFn(state)。 */
function sigWrap(fn,sigFn){
  return function(a){ _api(a); var nodes=fn(a); try{ if(nodes) nodes.sig=sigFn(a); }catch(e){} return nodes; };
}

/* ================================================================
   0. 纯逻辑区 —— 全部判定抽在这里, 挂到 spec._test 供单测
   ================================================================ */

/* ---- 谜题1 · RLE 壁画修复 (§1.3 图像压缩: run-length encoding) ----
   壁画 10×8, 逐行 RLE (与姊妹馆 dt_pixel 的"逐行十六进制"同一空间语言,
   只是编码方式换成了 RLE) */
var MURAL_W=10, MURAL_H=8;
var MURAL_ROWS=[
  '0001111000',
  '0011111100',
  '0111111110',
  '1111111111',
  '1111111111',
  '0111111110',
  '0011111100',
  '0001111000'
];
function strToPixels(rowStr){ return rowStr.split('').map(function(c){return Number(c);}); }
/* 贪心逐行 RLE 编码: 连续相同值合并成 [count,value] */
function encodeRunsForRow(rowStr){
  var runs=[], i=0;
  while(i<rowStr.length){
    var v=rowStr.charAt(i), j=i;
    while(j<rowStr.length && rowStr.charAt(j)===v) j++;
    runs.push([j-i, Number(v)]);
    i=j;
  }
  return runs;
}
/* 解码: [[count,value],...] -> 展平的像素数组 */
function decodeRuns(runs){
  var out=[];
  (runs||[]).forEach(function(r){ for(var k=0;k<r[0];k++) out.push(r[1]); });
  return out;
}
function runsEqualPixels(runs,pixels){
  var d=decodeRuns(runs);
  if(d.length!==pixels.length) return false;
  for(var i=0;i<d.length;i++) if(d[i]!==pixels[i]) return false;
  return true;
}
function rowMatchesTarget(playerRow,targetRowStr){
  var target=strToPixels(targetRowStr);
  if(!playerRow||playerRow.length!==target.length) return false;
  for(var i=0;i<target.length;i++) if(playerRow[i]!==target[i]) return false;
  return true;
}
/* 正向谜题: 玩家点格子还原壁画, playerGrid = 8 行, 每行 10 个 0/1 */
function muralComplete(playerGrid){
  if(!playerGrid||playerGrid.length!==MURAL_H) return false;
  for(var r=0;r<MURAL_H;r++) if(!rowMatchesTarget(playerGrid[r],MURAL_ROWS[r])) return false;
  return true;
}
function canonicalRunsForMural(){ return MURAL_ROWS.map(encodeRunsForRow); }
function tokenCount(runsPerRow){ return (runsPerRow||[]).reduce(function(s,runs){return s+runs.length;},0); }
var MURAL_PAR=tokenCount(canonicalRunsForMural());  // 最短可能 token 数(★挑战 PAR)
/* 反向★挑战: 校验玩家写的逐行 RLE 码本身合法, 且解码后与壁画一致 */
function playerRunsValid(runsPerRow){
  if(!runsPerRow||runsPerRow.length!==MURAL_H) return false;
  for(var r=0;r<MURAL_H;r++){
    var runs=runsPerRow[r];
    if(!runs||!runs.length) return false;
    for(var i=0;i<runs.length;i++){
      var cnt=runs[i][0], val=runs[i][1];
      if(!Number.isInteger(cnt)||cnt<=0) return false;
      if(val!==0&&val!==1) return false;
    }
    if(!runsEqualPixels(runs,strToPixels(MURAL_ROWS[r]))) return false;
  }
  return true;
}

/* ---- 谜题2 · 相框/储存箱选型 (§1.3 分辨率×色深→文件大小) ----
   file size(bits) = width × height × colour-depth(bits per pixel)
   file size(bytes) = ceil(bits / 8)                                */
function bitsFor(w,h,depth){ return w*h*depth; }
function bytesFor(w,h,depth){ return Math.ceil(bitsFor(w,h,depth)/8); }
var ARTWORKS=[
  {id:'stamp',   w:8,  h:8,  depth:1,  label:B('Postage-Stamp Sketch','邮票小品')},
  {id:'poster',  w:40, h:30, depth:2,  label:B('Line-Art Poster','线稿海报')},
  {id:'photo',   w:64, h:48, depth:8,  label:B('Sepia Photograph','棕褐色老照片')},
  {id:'master',  w:100,h:80, depth:24, label:B('Full-Colour Masterpiece','全彩镇馆之作')},
  {id:'sketch2', w:17, h:13, depth:4,  label:B('Cracked Margin Sketch','裂纹边角速写')}
];
var FRAMES=[
  {id:'locket',  label:B('Cracked Locket','裂纹小盒吊坠'),   capacityBytes:10},
  {id:'punch',   label:B('Punch-Card Sleeve','打孔卡卡套'),  capacityBytes:120},
  {id:'cassette',label:B('Cassette Shell','磁带壳'),         capacityBytes:500},
  {id:'crystal', label:B('Memory Crystal (4KB)','记忆晶体 (4KB)'), capacityBytes:4096},
  {id:'vault',   label:B('Storage Vault Panel (32KB)','储藏库嵌板 (32KB)'), capacityBytes:32768}
];
function bestFrame(bytes,frames){
  var sorted=(frames||[]).slice().sort(function(a,b){return a.capacityBytes-b.capacityBytes;});
  for(var i=0;i<sorted.length;i++) if(sorted[i].capacityBytes>=bytes) return sorted[i];
  return null;
}
function frameJudge(artwork,frameId,frames){
  var bytes=bytesFor(artwork.w,artwork.h,artwork.depth);
  var best=bestFrame(bytes,frames||FRAMES);
  return !!best && best.id===frameId;
}

/* ---- 谜题3 · 走调的歌 (§1.4 声音: 采样率×采样分辨率→保真度/文件大小) ----
   J批·可视化优先重做 (镜像 domain_data.js 的 dt_wave / sampleReconstruct):
   把它变成一道「规格题」——给定字节预算, 唯一正解 = 满足奈奎斯特(2×最高音)
   且位深达标、且塞得进预算的「最低采样率」。判分与音频完全解耦(音频只作佐证)。
   预算刻意设为 32KB, 使唯一通过组合 = (8000Hz, 8-bit): 更高采样率/更高位深都超预算,
   更低采样率丢高音(走样), 更低位深出毛刺——三类错误各有定向诊断, 猜不出来。      */
var SONG_TOP_HZ=4000;                 // 曲子最高音 ≈ 4kHz (画在波形上)
var SONG_MIN_RATE=2*SONG_TOP_HZ;      // 8000: 留住 4kHz 所需的最低采样率(奈奎斯特)
var SONG_MIN_DEPTH=8;                 // 位深达标下限(低于此→量化台阶毛刺)
var SONG_DUR_SEC=3;                   // 片段时长(秒)
var SONG_BUDGET_BYTES=32768;          // 32KB 存储预算(令唯一解 = 最低达标组合)
var SONG_RATES=[4000,8000,11025,16000,22050,44100];
var SONG_DEPTHS=[4,8,16];
function songBytes(rateHz,depthBits,durSec){ return Math.ceil(rateHz*depthBits*(durSec==null?SONG_DUR_SEC:durSec)/8); }
function songRateKeepsTop(rateHz){ return rateHz>=SONG_MIN_RATE; }              // 采样率能否留住最高音
function songDepthAdequate(depthBits){ return depthBits>=SONG_MIN_DEPTH; }      // 位深是否达标(不出毛刺)
function songFitsBudget(rateHz,depthBits,durSec,budget){ return songBytes(rateHz,depthBits,durSec)<=(budget==null?SONG_BUDGET_BYTES:budget); }
/* 走样(混叠)频率: 最高音在采样率 rate 下重建成的表观频率, == SONG_TOP_HZ 当且仅当被正确捕捉 */
function songAliasHz(rateHz){ if(rateHz<=0)return SONG_TOP_HZ; var m=SONG_TOP_HZ%rateHz; return (m>rateHz/2)?(rateHz-m):m; }
/* 唯一正解判定: 留住高音 且 位深达标 且 塞进预算(在给定选项集下, 仅 (8000,8) 同时满足) */
function songPasses(rateHz,depthBits){ return songRateKeepsTop(rateHz)&&songDepthAdequate(depthBits)&&songFitsBudget(rateHz,depthBits); }
/* 定向诊断: 返回 'lowrate'(高音丢了) | 'grit'(全是毛刺) | 'overbudget'(超预算) | 'ok' */
function songDiagnose(rateHz,depthBits){
  if(!songRateKeepsTop(rateHz)) return 'lowrate';
  if(!songDepthAdequate(depthBits)) return 'grit';
  if(!songFitsBudget(rateHz,depthBits)) return 'overbudget';
  return 'ok';
}
/* 是否恰好最省(最低达标采样率 + 最低达标位深) */
function songOptimal(rateHz,depthBits){ return songPasses(rateHz,depthBits)&&rateHz===SONG_MIN_RATE&&depthBits===SONG_MIN_DEPTH; }

/* ---- 谜题4 (Boss) · 保管库: 有损 vs 无损 归档 (压缩总论) ----
   每件藏品判断该归 Verbatim(无损)的保险柜, 还是 Gist(有损)的褡裢 */
var ARCHIVE_ITEMS=[
  {id:'xray',    correct:'lossless',
   desc:B('A patient\'s X-ray scan — needed for future diagnosis.','一份病人的 X 光片——留作日后诊断依据。')},
  {id:'selfie',  correct:'lossy',
   desc:B('A casual party selfie, heading straight to social media.','一张随手拍的聚会自拍, 马上要发朋友圈。')},
  {id:'masterTape', correct:'lossless',
   desc:B('Tonight\'s concert master recording, bound for the permanent archive.','今晚音乐会的母带, 要送进永久档案库。')},
  {id:'streamMix',  correct:'lossy',
   desc:B('Background music streamed into every visitor\'s headset, all day, every day.','每天整日循环, 灌进每位访客耳机的背景乐。')},
  {id:'contract',   correct:'lossless',
   desc:B('A scanned legal contract — every pixel of the signature matters.','一份扫描版法律合同——签名的每个像素都算数。')},
  {id:'wallpaper',  correct:'lossy',
   desc:B('A blurry desktop wallpaper nobody has ever looked at closely.','一张没人认真看过的模糊桌面壁纸。')}
];
var VAULT_PASS=5; // 6 件中至少 5 件正确
function judgeArchive(item,choice){ return !!item && item.correct===choice; }
function scoreVault(items,choices){
  var correct=0;
  (items||[]).forEach(function(it){ if(choices&&choices[it.id]===it.correct) correct++; });
  return {correct:correct,total:(items||[]).length};
}

/* ---- 隐藏谜题 · 一句藏在 RLE 里的话 ----
   一面"裂纹相框"上抄错了的 RLE 码——run 的"计数"大到不可能是像素游程,
   其实是 ASCII 码, 每个数字就是一个字符 (呼应第1章数据表示馆的 ASCII 知识) */
var SECRET_MSG='LOOK CLOSER';
function secretCodes(){ return SECRET_MSG.split('').map(function(c){return c.charCodeAt(0);}); }
function secretDecode(nums){ return (nums||[]).map(function(n){return String.fromCharCode(n);}).join(''); }
function secretCheck(answer){ return String(answer==null?'':answer).trim().toUpperCase()===SECRET_MSG; }

/* ================================================================
   1. 室内地图: 26×17, 北=保管库(双生姐妹+Boss) · 南=门厅(入口)
      西厅=影像展区 · 东厅=乐坊 · 分隔墙 y=6, 门在 x=12,13
      ================================================================ */
var IW=26, IH=17;
function buildTiles(){
  var t=[];
  for(var y=0;y<IH;y++){
    var row=[];
    for(var x=0;x<IW;x++){
      var wall=(x===0||x===IW-1||y===0||y===IH-1);
      if(!wall){
        if(y===6 && x!==12 && x!==13) wall=true;                 // 保管库分隔墙, 门在12/13
        if((x===6||x===7)&&(y===9||y===10)) wall=true;            // 西厅立柱
        if((x===18||x===19)&&(y===9||y===10)) wall=true;          // 东厅立柱
      }
      row.push(wall?1:0);
    }
    t.push(row);
  }
  return t;
}

/* ================================================================
   2. 提示系统 (与 domain_sec 同款): 三段递进 + 失败≥2次自动升级末段
   ================================================================ */
var hintFns={};
function mk(parent,tag,css,html){
  var d=document.createElement(tag);
  if(css)d.style.cssText=css;
  if(html!=null)d.innerHTML=html;
  if(parent)parent.appendChild(d);
  return d;
}
var DIM='color:#8a7a5a;font-size:11.5px;';
var K='color:#e8c98a;';
var BTN='background:#2a2010;color:#e8c98a;border:1px solid #6a5a2a;padding:5px 12px;'+
        'font-family:inherit;font-size:13px;cursor:pointer;letter-spacing:1px;border-radius:2px;';
var BTN_HOT='background:#3a2a10;color:#ffce8a;border:1px solid #e8c98a;padding:5px 12px;'+
        'font-family:inherit;font-size:14px;cursor:pointer;letter-spacing:1px;border-radius:2px;box-shadow:0 0 8px #a67e2e;';
var BTN_GOLD=BTN_HOT;
var TXT='color:#e6dcc8;font-size:13px;line-height:1.7;';
function header(el,title,sub){
  mk(el,'div','color:#e8c98a;letter-spacing:2px;font-size:14px;border-bottom:1px solid #4a3a1a;'+
    'padding-bottom:6px;margin-bottom:8px;',title+(sub?' <span style="'+DIM+'float:right;">'+sub+'</span>':''));
}
function addHints(root,pid,hints){
  var idx=-1;
  var bar=mk(root,'div','margin-top:10px;display:flex;align-items:center;gap:10px;');
  var btn=mk(bar,'button',BTN,'? '+tx('Hint','提示')+' <span style="'+DIM+'">'+tx('(or press ?)','(按 ? 键)')+'</span>');
  var box=mk(root,'div','display:none;margin-top:8px;border:1px dashed #6a5a2a;'+
    'color:#ffce8a;padding:7px 10px;font-size:12px;line-height:1.7;background:rgba(40,30,10,.35);');
  function next(){
    idx=Math.min(idx+1,hints.length-1);
    box.style.display='block';
    box.innerHTML='<b>'+tx('Hint','提示')+' '+(idx+1)+' / '+hints.length+'</b> — '+T(hints[idx])+
      (idx<hints.length-1?'<br><span style="'+DIM+'">'+tx('(press again for a blunter one)','(再按一次给更直白的)')+'</span>':'');
  }
  next.max=function(){ idx=hints.length-2; next(); };
  btn.onclick=next;
  hintFns[pid]=next;
}
function bumpFail(api,key,pid){
  var n=(FLAG(api,key)||0)+1; SET(api,key,n);
  try{ api&&api.onFail&&api.onFail(pid); }catch(e){}
  if(n>=2&&hintFns[pid]&&hintFns[pid].max){
    hintFns[pid].max();
    TOAST(api,B('Hints auto-upgraded — check the gold box (or press ?).','提示已自动升级——看金色框 (或按 ? 键)。'));
  }
  return n;
}
function puzzleKey(e,a){ _api(a);
  if(e&&e.key==='?'){ /* 各 render 里自行挂 hintFns[pid]() */ }
}

/* ================================================================
   3. NPC 对话
   ================================================================ */

/* --- 门厅: 讲解员·Docent Moiré —— 迎宾 + 老照片支线 --- */
function docentDialog(a){ _api(a);
  var SP=B('Docent Moiré','讲解员·Moiré');
  if(FLAG(API,'med_p4')){
    return [
      {sp:SP,t:B('Every wing lit. Do you know, in twenty years, I have given this same welcome speech to exactly nobody — the gallery keeps its own hours, mostly closed. It is rather nice, having someone to say it to.',
                 '整馆都亮了。你知道吗, 这二十年里, 我把这段迎宾词说给过——正好零个人听。画廊自顾自地开着自己的门, 大多数时候没人。有个人可以说给他听, 感觉还挺好的。')},
    ];
  }
  if(FLAG(API,'med_p2')&&!FLAG(API,'med_photo_asked')){
    return [
      {sp:SP,t:B('Since you clearly know your way round a colour depth now — may I trouble you with something personal? I have an old photograph. Opening night, actually. I have never dared work out how much of it survives.',
                 '既然你现在显然懂色深这回事了——能麻烦你件私事吗? 我有一张老照片。开馆之夜, 其实。我一直不敢算清楚, 这照片究竟还剩下多少。')},
      {sp:SP,t:B('50 pixels wide, 40 tall, 4 bits of colour depth — that was the fashion, back then. Work out the byte size for me, and tell me which of our storage frames it actually fits. I would rather know than keep wondering.',
                 '宽 50 像素, 高 40 像素, 4 bit 色深——那时候流行这个。帮我算算字节数, 再告诉我它到底配得上哪个储存框。我宁愿知道, 也不想一直悬着。'),choices:[
        {t:B('I\'ll work it out.','我来算算看。'),next:-1,do:function(){
          SET(API,'med_photo_asked'); STEP(API,'med_side_photo','p1'); S(API,'quest');
          TOAST(API,B('Side quest: The Curator\'s Old Photograph — work out 50×40 px at 4-bit depth, then come back with a frame in mind.',
                      '支线: 讲解员的老照片——算出 50×40 像素、4 bit 色深的字节数, 想好该配哪个储存框再回来。'));
        }},
      ]},
    ];
  }
  if(FLAG(API,'med_photo_asked')&&!FLAG(API,'med_side_photo')){
    return [
      {sp:SP,t:B('Well? 50 × 40 × 4 bits — how many bytes, and which frame actually holds it without wasting space or losing a corner?',
                 '算出来了吗? 50 × 40 × 4 bit——多少字节, 又该配哪个刚好装下、既不浪费也不掉角的储存框?'),choices:[
        {t:B('1000 bytes — the Cassette Shell (500B) is too small.','1000 字节——磁带壳 (500B) 太小了。'),next:1},
        {t:B('1000 bytes — the Memory Crystal (4KB) fits.','1000 字节——记忆晶体 (4KB) 刚好装得下。'),next:2,do:function(){
          SET(API,'med_side_photo'); STEP(API,'med_side_photo','p2'); STEP(API,'med_side_photo','p3');
          MARK(API,'med_side_photo'); GIVE(API,'med_photo_frame',B('Salvaged Photograph','抢救回的老照片')); S(API,'quest');
        }},
        {t:B('50 bytes.','50 字节。'),next:3},
      ]},
      {sp:SP,t:B('Correct arithmetic, wrong frame — the Cassette Shell tops out at 500 bytes, and 1000 will not fold into it however hard you push. There is a bigger frame on the shelf.',
                 '算数对了, 框错了——磁带壳上限 500 字节, 1000 字节再怎么塞也折不进去。架上还有更大的框。'),next:-1},
      {sp:SP,t:B('...1000 bytes, in the Memory Crystal. Oh. There she is — a little grainy, a little square, but that\'s unmistakably opening night. Thank you. Twenty years, and I only just found out she survived.',
                 '……1000 字节, 装进记忆晶体。哦。是她——有点颗粒感, 有点方块状, 但那绝对是开馆之夜。谢谢你。二十年了, 我才刚知道她还活着。'),choices:[
        {t:B('(leave her be)','(让她安静会儿)'),next:-1},
      ]},
      {sp:SP,t:B('50 bytes would mean 1-bit depth, not 4 — you have dropped three-quarters of her colour information on the floor. Try the multiplication again: width × height × depth, in bits, then round up to whole bytes.',
                 '50 字节相当于 1-bit 色深, 不是 4 bit——你把她四分之三的颜色信息都掉在地上了。再乘一遍: 宽 × 高 × 深度, 单位是 bit, 再向上取整到整字节。'),next:-1},
    ];
  }
  if(FLAG(API,'med_side_photo')){
    return [
      {sp:SP,t:B('She sits behind glass now, properly framed at last. 1000 bytes was never very much to ask the universe for.',
                 '她现在好好地被封在玻璃后面了, 总算配上了框。1000 字节, 对宇宙来说从来都不算什么过分的请求。')},
    ];
  }
  return [
    {sp:SP,t:B('Welcome to the Gallery of Lost Fidelity. Half the exhibits are still exactly as they were recorded. The other half... have been asked to remember themselves for twenty years, with no one checking in.',
               '欢迎来到失真画廊。一半展品还和录下来那天一模一样。另一半……已经被要求独自记住自己二十年了, 没人来核对过。')},
    {sp:SP,t:B('The west wing keeps our images — Restorer Raster is in there, muttering about run-lengths. The east wing keeps our sound — Maestro Nyquist, who has strong opinions about a song that will not stay in tune. And upstairs, north, past the divider, live the twins who decide what this whole gallery is even allowed to forget.',
               '西厅存着我们的影像——修复师·Raster 在那儿, 念叨着"游程"这个词。东厅存着我们的声音——指挥·Nyquist, 他对一首怎么修都跑调的歌意见很大。楼上, 分隔墙之后, 住着一对决定这整座画廊能忘记什么的双胞胎。'),choices:[
      {t:B('Where should I start?','我该从哪开始?'),next:2},
      {t:B('Why is everything half-lit?','为什么到处都只亮了一半?'),next:3},
    ]},
    {sp:SP,t:B('Anywhere. Nothing in this gallery is locked behind anything else — every wing waits at its own pace. Though if I were rebuilding a memory from nothing, I\'d start with something I could see: the west wing.',
               '哪儿都行。这画廊没有谁锁着谁——每一厅都按自己的节奏等着你。不过, 如果是我要从零重建一段记忆, 我会从看得见的东西开始: 西厅。'),next:-1},
    {sp:SP,t:B('Because "record" and "remember perfectly, forever, for free" were never the same promise. Every picture, every sound in here was compressed to fit somewhere smaller than reality. Some of it lost nothing anyone would notice. Some of it lost rather more than we\'d like to admit.',
               '因为"记录下来"和"永远、免费、完美地记住"从来就不是同一个承诺。这里的每张画、每段声音, 都被压缩进了比现实更小的地方。有的什么都没丢, 没人会察觉; 有的丢得比我们愿意承认的要多一些。'),next:-1},
  ];
}

/* --- 西厅: 修复师·Restorer Raster —— RLE 壁画 + 相框选型 --- */
function rasterDialog(a){ _api(a);
  var SP=B('Restorer Raster','修复师·Raster');
  if(FLAG(API,'med_p2')){
    return [
      {sp:SP,t:B('Both pieces holding steady — the sun mural in its rightful runs, the sketches each in a frame that neither pinches nor swims. That\'s the whole trade, really: say the same picture in fewer words, without changing what it means.',
                 '两件展品都稳住了——太阳壁画回到了正确的游程里, 速写们也各自配上了不挤不空的框。说到底, 这行当就一件事: 用更少的话说出同一幅画, 但意思一个字都不能变。')},
    ];
  }
  if(FLAG(API,'med_p1')){
    return [
      {sp:SP,t:B('The mural\'s back, row by row, run by run. Now — a harder problem sits on the workbench behind me. Every picture here needs somewhere to actually live: pick too small a frame and it won\'t fit; too large and you\'ve wasted a perfectly good crystal on eight bytes of cat.',
                 '壁画回来了, 一行一行, 一段一段地。现在——我身后工作台上还有个更难的问题。这儿的每张画都得有个地方住: 框选小了装不下, 选大了又白白浪费一整块好晶体去装八个字节的猫。')},
      {sp:SP,t:B('The size in bytes is never a mystery — width times height times colour depth, in bits, then round up to a whole byte because nobody sells you seven-eighths of one. Go on, the frame bench is right there.',
                 '字节数从来就不是谜——宽乘高乘色深, 单位是 bit, 再向上取整到整字节, 因为没人卖你八分之七字节。去吧, 相框工作台就在那儿。'),next:-1},
    ];
  }
  return [
    {sp:SP,t:B('Mm? Oh — living thing. Rare, round here. I\'m Raster; I keep the west wing from forgetting what it looked like.',
               '嗯? 哦——活物。这一带很少见。我是 Raster; 我负责不让西厅忘记自己长什么样。')},
    {sp:SP,t:B('See that sun on the wall? It used to be whole. Now all that\'s left is its <span class="k">run-length code</span> — instead of storing "pixel 1 is dark, pixel 2 is dark, pixel 3 is dark..." one at a time, we store "3 dark, then 4 light, then 3 dark" — a run and how long it runs. Shorter to write, means exactly the same thing.',
               '看到墙上那个太阳了吗? 它以前是完整的。现在只剩下它的<span class="k">游程编码 (run-length code)</span>了——与其一个个存"像素1是暗的, 像素2是暗的, 像素3是暗的……", 不如存"暗3个, 然后亮4个, 然后暗3个"——一段连续值和它连续了多久。写得更短, 意思分毫不差。'),choices:[
      {t:B('Why not just store every pixel?','为什么不干脆存每个像素?'),next:3},
      {t:B('I\'ll take a look at the mural.','我去看看壁画。'),next:-1},
    ]},
    {sp:SP,t:B('You can. Nothing stops you. It just costs a great deal more room for a picture that\'s mostly one colour repeated — and this gallery, believe it or not, is chronically short on room. Compression isn\'t a trick. It\'s just refusing to pay twice for the same information.',
               '你当然可以那么存。没人拦你。只是那样存, 一张大半都是同一种颜色的画会占掉多得多的空间——而这座画廊, 信不信由你, 一直缺空间缺得很。压缩不是什么障眼法, 只是拒绝为同一份信息付两遍钱。'),next:2},
  ];
}

/* --- 东厅: 指挥·Maestro Nyquist —— 走调的歌 --- */
function nyquistDialog(a){ _api(a);
  var SP=B('Maestro Nyquist','指挥·Nyquist');
  if(FLAG(API,'med_p3')){
    return [
      {sp:SP,t:B('Listen. LISTEN. That top note holds now. Do you hear it hold? Twenty years it warbled like a kettle finally taken off the heat, and now it just... holds.',
                 '听。听。那个高音现在稳住了。你听见它稳住了吗? 二十年来它一直像一壶忘了关火的水那样打颤, 现在它就……稳住了。')},
      {sp:SP,t:B('…One thing the archive never explains. The recording didn\'t drift out of tune over the years — the wobble begins at one exact timestamp, mid-note. And the west wing swears that in the same minute, a corner of a mural blurred. <span class="dim">As if the whole gallery shivered once, together. I stopped asking what happened in that minute. I just kept the song.</span>',
                 '……有件事, 档案从来不解释。这段录音不是这些年慢慢跑调的——打颤是从某一个精确的时间戳开始的, 就断在一个音的正中间。而西厅咬定, 同一分钟里, 壁画也糊了一角。<span class="dim">像整座画廊一起打了个寒颤。那一分钟发生了什么, 我不问了。我只管把歌留住。</span>')},
    ];
  }
  return [
    {sp:SP,t:B('Shh. SHH. Listen to that. Do you hear how it wobbles on the high note, like it can\'t quite decide what pitch it meant to be? That\'s not the singer\'s fault. That\'s ours.',
               '嘘。嘘。听听这个。你听出那个高音在打颤了吗, 好像它自己都拿不准该唱哪个音高? 这不怪歌手, 怪我们。')},
    {sp:SP,t:B('A microphone hears a smooth, continuous wave. A computer can only keep <span class="k">snapshots</span> of it — the <span class="k">sample rate</span> is how many snapshots per second, and the <span class="k">sample resolution</span> is how many shades of loudness each snapshot is allowed to have. Skimp on either, and the reconstruction lies to you, politely, in the shape of a wobble.',
               '麦克风听到的是一段平滑连续的波。计算机只能保留它的<span class="k">快照</span>——<span class="k">采样率</span>是每秒拍几张快照, <span class="k">采样分辨率</span>是每张快照允许分几档响度。哪一个抠门了, 重建出来的声音就会用"打颤"的方式, 客客气气地对你撒谎。'),choices:[
      {t:B('So just max out both, always?','那两个都拉满不就行了?'),next:2},
      {t:B('I\'ll go try the restoration bench.','我去试试修复台。'),next:-1},
    ]},
    {sp:SP,t:B('You could. You could also frame a postage stamp in a wall the size of a house. Every extra sample, every extra shade of loudness, is more bytes this gallery has to carry forever. The craft isn\'t "as much as possible" — it\'s "exactly enough that no one can tell the difference."',
               '你当然可以。你也可以把一张邮票裱进一整面墙那么大的画框里。每多一个采样、每多分一档响度, 都是这座画廊要永远背着的字节。这门手艺讲究的从不是"越多越好", 而是"刚好多到没人分得出区别"。'),next:-1},
  ];
}

/* --- 保管库: 无损姐·Verbatim / 有损妹·Gist —— 性格即机制 --- */
function verbatimDialog(a){ _api(a);
  var SP=B('Verbatim, the Lossless','逐字姐·Verbatim');
  if(FLAG(API,'med_twins_done')){
    return [
      {sp:SP,t:B('Every word, in order, exactly as spoken. I have never once lost a syllable, and I never intend to start.',
                 '每一个字, 按原来的顺序, 一字不差。我从没丢过一个音节, 也不打算破例。')},
    ];
  }
  if(!FLAG(API,'med_verbatim_heard')){
    return [
      {sp:SP,t:B('...and on the fourth Tuesday, at 3:14 in the afternoon, the founder said — no, wait, I should give you the full context first, and the weather that day, and —',
                 '……然后在第四个星期二, 下午三点十四分, 创始人说——不, 等等, 我得先给你完整的背景, 还有那天的天气, 还有——')},
      {sp:SP,t:B('Oh! A guest. Forgive me, I was mid-account of this gallery\'s founding — all of it, in order, nothing skipped. I am Verbatim. I keep the vault of things that must arrive exactly as they left.',
                 '哦! 有客人。见谅, 我正说到这座画廊的创馆史——全部, 按顺序, 一个字都不漏。我是 Verbatim。我守着那些"必须原样抵达"的东西。')},
      {sp:SP,t:B('My sister keeps the other half of the vault — the things that only need to arrive close enough. She calls it efficient. I call it having opinions about which parts of the truth matter. We have not agreed on anything since the Tuesday I mentioned. Which Tuesday, you ask? I would be delighted to tell you. All of it.',
                 '我妹妹管着库房的另一半——那些"差不多到就行"的东西。她管这个叫高效。我管这个叫"擅自决定真相里哪部分重要"。自我提到的那个星期二起, 我们俩就没在任何事上达成过一致。你问是哪个星期二? 我很乐意告诉你。全部讲清楚。'),choices:[
        {t:B('(politely excuse yourself before the full weather report)','(在完整天气预报开始前礼貌告退)'),next:-1,do:function(){
          SET(API,'med_verbatim_heard'); SET(API,'med_twins_met'); STEP(API,'med_side_twins','t1');
          TOAST(API,B('Side quest: Reconciling the Twins — go hear Gist\'s side too.','支线: 调解双生姐妹——也去听听 Gist 怎么说。'));
        }},
      ]},
    ];
  }
  return [
    {sp:SP,t:B('Back for more detail? Good. Detail is the entire point of me.','又来听细节了? 很好。细节就是我存在的全部意义。'),choices:[
      {t:B('Talk to me about your archive vault.','跟我说说你的保管库。'),next:1},
      {t:B('Not right now.','暂时不用。'),next:-1},
    ]},
    {sp:SP,t:B('Anything filed with me comes back bit-for-bit identical to what went in — no exceptions, no "close enough," no tasteful little omissions. The cost is size: I take up exactly as much room as the truth does, not one bit less. Some things are worth that price. My sister and I disagree, loudly, on which things.',
               '归档到我这儿的东西, 取出来的时候和放进去时一比特都不差——没有例外, 没有"差不多得了", 没有任何"贴心的"省略。代价是体积: 我占用的空间和真相本身一样大, 一比特都不能少。有些东西值这个价。我妹妹和我在"哪些东西值"这件事上, 吵得很凶。'),next:-1},
  ];
}
function gistDialog(a){ _api(a);
  var SP=B('Gist, the Lossy','写意妹·Gist');
  if(FLAG(API,'med_twins_done')){
    return [
      {sp:SP,t:B('Told you the short version works out fine, most of the time. This was one of the "most of the time"s.',
                 '早说了短版本大多数时候都够用。这次就是"大多数时候"里的一次。')},
    ];
  }
  if(!FLAG(API,'med_gist_heard')){
    return [
      {sp:SP,t:B('Hey! New face. Long story short — this place stores stuff, some of it exactly, some of it "basically." I do the "basically." Way faster. Way lighter. Nobody\'s ever complained about my version of a sunset.',
                 '嘿! 新面孔。长话短说——这地方存东西, 有的存得一字不差, 有的存个"大概"。我干"大概"那部分。快得多, 也轻得多。从没人抱怨过我存的日落不够好看。'),choices:[
        {t:B('Your sister makes it sound like a betrayal.','你姐姐说得像是种背叛。'),next:1},
        {t:B('What do you actually throw away?','你到底扔掉了什么?'),next:2},
      ]},
      {sp:SP,t:B('She thinks throwing away ANY information is a moral failing. I think a photo of a sunset doesn\'t need to remember every individual photon — it needs to look like a sunset to a person looking at it. That\'s not betrayal. That\'s just knowing your audience is a human eye, not a truth-detector.',
                 '她觉得丢掉任何一丁点信息都是道德污点。我觉得一张日落照根本不需要记住每一个光子——它只需要在人眼看来像日落就够了。这不叫背叛, 这叫搞清楚你的听众是一双人眼, 不是一台测谎仪。'),next:3},
      {sp:SP,t:B('Detail a human wouldn\'t notice was missing anyway — tiny colour shifts nobody\'s retina resolves, quiet frequencies buried under louder ones. Once it\'s gone, it\'s properly gone, not "gone until someone checks." That\'s the deal, and most files are more than happy to make it.',
                 '扔掉的是人根本不会发现少了的细节——视网膜分辨不出的微小色差, 被更响的声音盖住的安静频率。一旦扔了, 就是真扔了, 不是"扔了但等人来查"那种。这就是那笔交易, 大多数文件都很乐意接受。'),next:3},
      {sp:SP,t:B('Go hear my sister out properly too, before you decide who\'s right. Spoiler: we both are. Just not about the same file.',
                 '在你下判断之前, 也去好好听听我姐怎么说。剧透一下: 我俩都对。只是对的不是同一个文件。'),next:-1,do:function(){
        SET(API,'med_gist_heard'); SET(API,'med_twins_met'); STEP(API,'med_side_twins','t2');
      }},
    ];
  }
  return [
    {sp:SP,t:B('Back again? Ask me anything — I\'ll give you the short version, obviously.','又来了? 随便问——我肯定给你个精简版, 那还用说。'),choices:[
      {t:B('So when should I trust you over your sister?','那我到底什么时候该信你, 而不是你姐?'),next:1},
      {t:B('Nothing right now.','暂时没有。'),next:-1},
    ]},
    {sp:SP,t:B('When getting it a little wrong costs nothing anyone will ever notice, and getting it small costs everything you actually need — bandwidth, storage, patience. When it\'s an X-ray or a signature, though? Go find my sister. Some files are not the place to save a byte.',
               '当"稍微错一点"根本没人会发现, 而"体积小一点"才是你真正在乎的东西——带宽、存储、耐心——的时候。可如果是 X 光片或者一份签名呢? 去找我姐。有些文件, 根本不是省字节的地方。'),next:-1},
  ];
}

/* --- nodes.sig 状态键: 与各 dialog 的分支条件一一对应, 仅随「对话状态」变化 ---
   本模块所有 NPC 均为确定性状态机(无 Math.random / bark 轮换), 首节点文本本就随状态
   切换而变; 这里显式挂稳定 sig, 以满足引擎 #barksig 契约并防止未来加入 bark 时误亮 ❕。 */
function sigDocent(){
  if(FLAG(API,'med_p4'))return 'all_done';
  if(FLAG(API,'med_p2')&&!FLAG(API,'med_photo_asked'))return 'photo_offer';
  if(FLAG(API,'med_photo_asked')&&!FLAG(API,'med_side_photo'))return 'photo_pending';
  if(FLAG(API,'med_side_photo'))return 'photo_done';
  return 'intro';
}
function sigRaster(){ if(FLAG(API,'med_p2'))return 'done'; if(FLAG(API,'med_p1'))return 'frame_next'; return 'intro'; }
function sigNyquist(){ return FLAG(API,'med_p3')?'done':'intro'; }
function sigVerbatim(){ if(FLAG(API,'med_twins_done'))return 'twins_done'; if(!FLAG(API,'med_verbatim_heard'))return 'intro'; return 'ask'; }
function sigGist(){ if(FLAG(API,'med_twins_done'))return 'twins_done'; if(!FLAG(API,'med_gist_heard'))return 'intro'; return 'ask'; }

/* ================================================================
   4. 谜题渲染
   ================================================================ */

/* --- 谜题1: RLE 壁画修复 (正向解码 + ★反向编码挑战) --- */
var MP1_HINTS=[
  B('Hint 1/3: RLE stores a run as [how many, what value] instead of one pixel at a time. Row 0\'s code reads "3×dark, 4×light, 3×dark" — click 10 cells to match, dark first.',
    '提示 1/3: RLE 把一段连续值存成 [有多少个, 是什么值], 而不是一个个存。第0行的码是「暗3、亮4、暗3」——点出10格与之匹配, 从暗色开始。'),
  B('Hint 2/3: count the runs as you go and make sure they add up to exactly 10 per row (10 pixels wide) — a common mistake is running one cell short or long.',
    '提示 2/3: 一边点一边数, 确保每行游程加起来正好等于 10 (壁画宽10像素)——常见错误是多点或少点一格。'),
  B('Hint 3/3 — worked example with DIFFERENT numbers: say a 6-wide row\'s code read "2 dark, 2 light, 2 dark". You would click cells 1-2 dark, cells 3-4 light, cells 5-6 dark, then check they sum to 6. Use exactly that method here: read each row\'s runs left to right, click that many cells of that colour in order, and make every row add up to 10. Recount any row whose runs don\'t total 10.',
    '提示 3/3 —— 换了数字的完整范例(例子·换了数字): 假设某个 6 格宽的行, 码是「暗2、亮2、暗2」。你就点: 第1-2格暗、第3-4格亮、第5-6格暗, 再检查加起来是 6。本题照搬这个方法: 从左到右读每行的游程, 有几个就按顺序点几个对应颜色的格子, 让每一行都加到 10。哪一行的游程加不到 10 就重数那一行。')
];
var MP1_CODE_TEXT=canonicalRunsForMural().map(function(runs,i){
  return 'row '+i+':  '+runs.map(function(r){return r[0]+'×'+(r[1]?'█(light)':'░(dark)');}).join('  ');
});
function renderMural(el,api){ _api(api);
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:520px;max-width:700px;'+TXT);
  header(wrap,tx('The Restoration Bench · Sun Mural','修复工作台 · 太阳壁画'),'§1.3 RLE');
  var solved=!!FLAG(api,'med_p1');
  if(solved){
    mk(wrap,'div','',tx(
      '<span style="'+K+'">✓ The mural is whole again.</span> The runs sit exactly where the code says they should, and no two adjacent cells share a colour by accident anymore.',
      '<span style="'+K+'">✓ 壁画已经完整了。</span> 每一段游程都落在代码说的位置上, 再也没有两个相邻格子意外撞色。'));
    var chal=mk(wrap,'div','margin-top:10px;');
    if(FLAG(api,'med_challenge_1')){
      mk(wrap,'div','margin-top:8px;'+K+'font-size:12px;',
        tx('★ Challenge cleared: your code matched the shortest possible ('+MURAL_PAR+' tokens).',
           '★ 挑战已通关: 你的编码达到了最短可能长度 ('+MURAL_PAR+' 个 token)。'));
    }else{
      mk(chal,'button',BTN_GOLD,tx('★ Challenge: write the shortest code','★ 挑战: 写出最短编码')).onclick=function(){ renderMuralChallenge(el,api); };
    }
    return;
  }
  mk(wrap,'div','',tx(
    'The mural\'s restoration code survived, row by row. Read each row\'s runs and click the matching cells — dark first, then light, in the order given.',
    '壁画的修复码保住了, 一行一行的。照每行的游程读, 点出对应的格子——先暗后亮, 按给出的顺序。'));
  var codeBox=mk(wrap,'pre','background:rgba(20,14,4,.6);border:1px solid #6a5a2a;padding:8px 10px;'+
    'color:#e8c98a;font-size:12px;line-height:1.6;margin:10px 0;',MP1_CODE_TEXT.map(esc).join('\n'));
  var grid=mk(wrap,'div','display:grid;grid-template-columns:repeat('+MURAL_W+',22px);gap:2px;margin:10px 0;');
  var playerGrid=[];
  for(var r=0;r<MURAL_H;r++){
    playerGrid.push(new Array(MURAL_W).fill(0));
    for(var c=0;c<MURAL_W;c++){
      var cell=mk(grid,'div','width:22px;height:22px;border:1px solid #4a3a1a;cursor:pointer;background:#160e04;');
      cell.dataset.r=r; cell.dataset.c=c;
      (function(cell,r,c){
        cell.onclick=function(){
          playerGrid[r][c]=playerGrid[r][c]?0:1;
          cell.style.background=playerGrid[r][c]?'#e8c98a':'#160e04';
          S(api,'ui');
        };
      })(cell,r,c);
    }
  }
  var ctl=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;');
  mk(ctl,'button',BTN_HOT,tx('Check restoration ▸','检查修复 ▸')).onclick=function(){
    if(muralComplete(playerGrid)){
      S(api,'ok'); SET(api,'med_p1'); STEP(api,'med_main','s1');
      TOAST(api,B('✓ Restored! The sun mural glows in exactly the runs the code described.','✓ 修复成功! 太阳壁画按代码里的游程原样发光。'),true);
      renderMural(el,api);
    }else{
      S(api,'err'); bumpFail(api,'med_p1_fails','med_p_mural');
      msgFlash(wrap,tx('Not yet — some cells don\'t match the code. Recount the runs, row by row.','还没对——有些格子和代码对不上。逐行重新数一遍游程。'));
    }
  };
  mk(ctl,'button',BTN,tx('Reset','重置')).onclick=function(){ renderMural(el,api); };
  addHints(wrap,'med_p_mural',MP1_HINTS);
}
function msgFlash(wrap,text){
  var m=wrap.querySelector('.mp-msg');
  if(!m) m=mk(wrap,'div','margin-top:6px;color:#ff9c6a;font-size:12px;','');
  m.className='mp-msg'; m.textContent=text;
}
/* ★挑战: 玩家自己写最短 RLE 码 (每行一个 run 构建器) */
function renderMuralChallenge(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:520px;max-width:700px;'+TXT);
  header(wrap,tx('★ Challenge · Shortest Possible Code','★ 挑战 · 写出最短编码'),'PAR='+MURAL_PAR);
  mk(wrap,'div','',tx(
    'The mural stands revealed. Now write your OWN run-length code for it, row by row — fewest total runs wins. Par for this mural is <span style="'+K+'">'+MURAL_PAR+' runs</span>.',
    '壁画已经完全显现。现在给它写你自己的游程编码, 逐行——总游程数越少越好。这幅壁画的标准杆 (par) 是 <span style="'+K+'">'+MURAL_PAR+' 段</span>。'));
  var runsPerRow=MURAL_ROWS.map(function(){return [];});
  var rowsBox=mk(wrap,'div','margin:10px 0;');
  var curVal=0;
  function repaint(){
    rowsBox.innerHTML='';
    for(var r=0;r<MURAL_H;r++){
      var line=mk(rowsBox,'div','margin:3px 0;font-size:12px;');
      line.innerHTML='row '+r+': '+(runsPerRow[r].length?runsPerRow[r].map(function(x){return x[0]+'×'+x[1];}).join(' + '):'<span style="'+DIM+'">(empty)</span>');
    }
  }
  repaint();
  var ctl=mk(wrap,'div','display:flex;gap:8px;align-items:center;flex-wrap:wrap;');
  var rowSel=mk(ctl,'select',BTN.replace('cursor:pointer;',''));
  for(var r2=0;r2<MURAL_H;r2++) mk(rowSel,'option','',String(r2)).setAttribute('value',r2);
  var valBtn=mk(ctl,'button',BTN,tx('value: dark','取值: 暗'));
  valBtn.onclick=function(){ curVal=curVal?0:1; valBtn.textContent=tx('value: '+(curVal?'light':'dark'),'取值: '+(curVal?'亮':'暗')); };
  var cntIn=mk(ctl,'input','width:60px;background:#160e04;color:#e8c98a;border:1px solid #6a5a2a;font-family:inherit;padding:3px;');
  cntIn.type='number'; cntIn.placeholder=tx('count','数量');
  mk(ctl,'button',BTN,tx('Add run','添加一段')).onclick=function(){
    var cnt=parseInt(cntIn.value,10);
    var ri=parseInt(rowSel.value,10);
    if(!Number.isInteger(cnt)||cnt<=0){ S(api,'err'); return; }
    runsPerRow[ri].push([cnt,curVal]); cntIn.value=''; repaint(); S(api,'ui');
  };
  mk(ctl,'button',BTN,tx('Clear row','清空本行')).onclick=function(){
    runsPerRow[parseInt(rowSel.value,10)]=[]; repaint();
  };
  var out=mk(wrap,'div','margin-top:10px;');
  mk(out,'button',BTN_HOT,tx('Submit code ▸','提交编码 ▸')).onclick=function(){
    if(!playerRunsValid(runsPerRow)){
      S(api,'err');
      msgFlash(wrap,tx('That code doesn\'t decode back into the mural yet — check every row is fully covered and in the right order.','这份编码解码出来还不是壁画——检查每一行是否覆盖完整、顺序是否正确。'));
      return;
    }
    var count=tokenCount(runsPerRow);
    if(count<=MURAL_PAR){
      S(api,'quest'); SET(api,'med_challenge_1');
      TOAST(api,B('★ '+count+' runs — par or better! That is the shortest this mural can be told.','★ '+count+' 段——达到或优于标准杆! 这已经是这幅壁画能被说得最短的样子了。'),true);
    }else{
      S(api,'ok');
      TOAST(api,B('Correct, but '+count+' runs — par is '+MURAL_PAR+'. Some adjacent runs of the same colour can still be merged.','编码正确, 但用了 '+count+' 段——标准杆是 '+MURAL_PAR+' 段。还有相邻同色的段可以合并。'));
    }
    renderMural(el,api);
  };
  mk(wrap,'div','margin-top:8px;').appendChild((function(){var b=document.createElement('button');b.style.cssText=BTN;b.textContent=tx('Back','返回');b.onclick=function(){renderMural(el,api);};return b;})());
}

/* --- 谜题2: 相框/储存箱选型 --- */
var MP2_HINTS=[
  B('Hint 1/3: file size in BITS = width × height × colour depth. Then convert to bytes by dividing by 8 and rounding UP — you can\'t buy a fraction of a byte.',
    '提示 1/3: 文件大小(bit) = 宽 × 高 × 色深。再除以 8 并向上取整换算成字节——字节数不能是分数。'),
  B('Hint 2/3: once you have the byte count, pick the SMALLEST frame whose capacity is still ≥ that many bytes. A frame that\'s too small won\'t fit; a frame that\'s far too big just wastes space.',
    '提示 2/3: 算出字节数后, 选容量刚好 ≥ 该字节数的<b>最小</b>那个框。太小装不下, 太大就是浪费空间。'),
  B('Hint 3/3 — worked example with DIFFERENT numbers: suppose a 20×20 icon at 2-bit depth (not one of these five pieces). Bits = 20×20×2 = 800 bits = 100 bytes. Then pick the smallest frame whose capacity is still ≥ 100B: if the shelf offered 60B / 150B / 500B you\'d take 150B — 60B is too small to fit, 500B wastes most of its space. Run those exact three steps (multiply → ÷8 round up → smallest frame that still fits) on each real piece.',
    '提示 3/3 —— 换了数字的完整范例(例子·换了数字): 假设一个 20×20、2-bit 色深的图标(不是这五件里的任何一件)。位数 = 20×20×2 = 800 bit = 100 字节。再选容量仍 ≥ 100B 的最小框: 若架上是 60B / 150B / 500B, 就选 150B——60B 太小装不下, 500B 又白白空掉一大半。把这三步(相乘 → ÷8 向上取整 → 选仍装得下的最小框)照搬到每一件真实展品上。')
];
function renderFrame(el,api){ _api(api);
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:560px;max-width:760px;'+TXT);
  var solved=!!FLAG(api,'med_p2');
  header(wrap,tx('Frame Fitting Bench','相框适配台')+(solved?' <span style="'+K+'">✓ '+tx('CLEARED','已完成')+'</span>':''),
    '§1.3 resolution × colour depth → file size');
  if(solved){
    /* 完成态: ✓ 横幅 + 每件锁定到正解相框(不可再改, 直接呈现) */
    mk(wrap,'div','margin:4px 0 10px;border:1px solid #6a5a2a;background:rgba(40,30,10,.35);padding:8px 10px;'+K,
      tx('<b>✓ CLEARED.</b> Every piece is framed exactly right — nothing pinched, nothing wasted.',
         '<b>✓ 已完成。</b> 每件展品都配到了刚好合适的框——不挤也不浪费。'));
    var dlist=mk(wrap,'div','margin:10px 0;');
    ARTWORKS.forEach(function(art){
      var bytes=bytesFor(art.w,art.h,art.depth);
      var best=bestFrame(bytes,FRAMES)||{};
      var row=mk(dlist,'div','border:1px solid #4a3a1a;padding:8px 10px;margin:6px 0;opacity:.92;');
      row.innerHTML='<b>'+T(art.label)+'</b> <span style="'+DIM+'">'+art.w+'×'+art.h+'px, '+art.depth+'-bit = '+bytes+'B</span>'+
        ' — <span style="'+K+'">✓ '+tx('framed: ','已配框: ')+T(best.label||B('?','?'))+
        ' <span style="'+DIM+'">('+(best.capacityBytes||0)+'B)</span></span>';
    });
    return;
  }
  var choices={};
  var savedKey='med_p2_choices';
  var saved=FLAG(api,savedKey);
  if(saved) choices=saved;
  mk(wrap,'div','',tx(
    'Five pieces, no frames. Work out each one\'s file size (width × height × colour depth, rounded up to bytes), then click the frame whose capacity fits it best — not too tight, not too roomy.',
    '五件展品, 一个框都没有。算出每件的文件大小 (宽 × 高 × 色深, 向上取整到字节), 然后点选容量最贴合的相框——不能太挤, 也不能太空。'));
  var list=mk(wrap,'div','margin:10px 0;');
  ARTWORKS.forEach(function(art){
    var row=mk(list,'div','border:1px solid #4a3a1a;padding:8px 10px;margin:6px 0;');
    row.innerHTML='<b>'+T(art.label)+'</b> <span style="'+DIM+'">'+art.w+'×'+art.h+'px, '+art.depth+'-bit</span>'+
      (choices[art.id]?' — <span style="'+K+'">'+tx('framed: ','已配框: ')+T((FRAMES.filter(function(f){return f.id===choices[art.id];})[0]||{}).label||B('?','?'))+'</span>':'');
    var btns=mk(row,'div','margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;');
    FRAMES.forEach(function(fr){
      var on=(choices[art.id]===fr.id);
      var b=mk(btns,'button',(on?BTN_HOT:BTN),T(fr.label)+' <span style="'+DIM+'">('+fr.capacityBytes+'B)</span>');
      b.onclick=function(){ choices[art.id]=fr.id; SET(api,savedKey,choices); renderFrame(el,api); };
    });
  });
  var ctl=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;');
  mk(ctl,'button',BTN_HOT,tx('Check all frames ▸','检查全部相框 ▸')).onclick=function(){
    var allOk=ARTWORKS.every(function(art){ return choices[art.id]&&frameJudge(art,choices[art.id],FRAMES); });
    if(allOk){
      S(api,'ok'); SET(api,'med_p2'); STEP(api,'med_main','s2');
      TOAST(api,B('✓ Every piece is framed exactly right — nothing pinched, nothing wasted.','✓ 每件展品都配到了刚好合适的框——不挤也不浪费。'),true);
      renderFrame(el,api);
    }else{
      S(api,'err'); bumpFail(api,'med_p2_fails','med_p_frame');
      msgFlash(wrap,tx('At least one frame is wrong — recompute that piece\'s byte size and try the smallest frame that still fits.','至少有一件配错了框——重新算一遍那件的字节数, 换成刚好能装下的最小框。'));
    }
  };
  addHints(wrap,'med_p_frame',MP2_HINTS);
}

/* --- 谜题3: 走调的歌 (采样率 × 采样分辨率 + WebAudio 演示) --- */
var MP3_HINTS=[
  B('Hint 1/3: watch the yellow wave, not your ears. As you lower the sample rate the dots spread apart; below a point the yellow line can no longer follow the fast green wiggle and folds into a slower, wrong note — that folding is aliasing, and it is why a too-low rate loses the high note.',
    '提示 1/3: 盯着黄线看, 别只用耳朵。采样率越低, 黄点越稀; 低到一定程度, 黄线就跟不上绿波的快速抖动, 塌成一条更慢的、错误的音——这个"折叠"就是走样, 也是采样率太低会丢高音的原因。'),
  B('Hint 2/3: two separate limits, then a budget check. To keep a note you must sample at least TWICE its frequency (fixes "when"); the bit depth must be high enough that loudness isn\'t chopped into a coarse, gritty staircase (fixes "how finely"). Then confirm the byte size fits: rate × depth × seconds ÷ 8.',
    '提示 2/3: 两个各自独立的限制, 再加一道预算核对。要留住一个音, 采样率至少要是它频率的<b>两倍</b>(管"什么时候"); 位深要够高, 响度才不会被切成粗糙的台阶(管"多精细")。然后核对字节数塞不塞得下: 采样率 × 位深 × 秒数 ÷ 8。'),
  B('Hint 3/3 — worked example with DIFFERENT numbers: suppose a clip\'s top note were 5kHz, the budget 20KB, duration 2s. Minimum rate = 2×5 = 10kHz. At 10kHz, 8-bit, 2s: 10000×8×2÷8 = 20000 bytes ≈ 19.5KB — just fits. 5-bit would sound gritty; 16-bit = 40000 bytes busts the budget. So THERE the answer is 10kHz/8-bit. Now run those same three checks — keep the top note, avoid grit, fit the budget — on THIS clip\'s own numbers.',
    '提示 3/3 —— 换了数字的完整范例(例子·换了数字): 假设某片段最高音是 5kHz、预算 20KB、时长 2 秒。最低采样率 = 2×5 = 10kHz。在 10kHz、8-bit、2 秒下: 10000×8×2÷8 = 20000 字节 ≈ 19.5KB——刚好装下。5-bit 会有毛刺; 16-bit = 40000 字节则超预算。所以那道题的答案是 10kHz/8-bit。现在用同样三步——留住高音、避免毛刺、塞进预算——套到本题自己的数字上。')
];
/* 可视化核心: 画原始 4kHz 连续波(绿) + 按采样率打样点(黄点) + 只靠样点重建的折线(黄),
   样点值先按位深量化 → 采样率不足肉眼看见黄线塌成假低频(走样); 位深不足看见台阶毛刺。
   rate=0 只画原波。与判分完全解耦, 纯视觉。 */
function songDrawWave(cv,rateHz,depthBits){
  try{
    var ctx=cv.getContext('2d'),W=cv.width,H=cv.height;
    ctx.fillStyle='#0d0a05';ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='#3a2f18';ctx.beginPath();ctx.moveTo(0,H/2);ctx.lineTo(W,H/2);ctx.stroke();
    var cycles=4, winSec=cycles/SONG_TOP_HZ, A=H*0.36;
    // 原始连续声波(绿) —— 4kHz 高音
    ctx.strokeStyle='#3a8f5a';ctx.lineWidth=1.6;ctx.beginPath();
    for(var x=0;x<=W;x++){var t=(x/W)*winSec,y=H/2-Math.sin(2*Math.PI*SONG_TOP_HZ*t)*A;x?ctx.lineTo(x,y):ctx.moveTo(x,y);}
    ctx.stroke();
    if(!rateHz)return;
    var levels=Math.pow(2,Math.max(1,depthBits));
    function quant(v){ return Math.round(((v+1)/2)*(levels-1))/(levels-1)*2-1; }  // [-1,1]→按位深量化
    var pts=[],k=0,tk;
    for(k=0;(tk=k/rateHz)<=winSec+1e-12;k++){
      var qv=quant(Math.sin(2*Math.PI*SONG_TOP_HZ*tk));
      pts.push([(tk/winSec)*W, H/2-qv*A]);
    }
    if(pts.length<2)pts.push([W, H/2-quant(Math.sin(2*Math.PI*SONG_TOP_HZ*winSec))*A]);
    ctx.strokeStyle='#ffce3a';ctx.lineWidth=1.6;ctx.beginPath();
    pts.forEach(function(p,i){i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]);});
    ctx.stroke();
    ctx.fillStyle='#ffe08a';
    pts.forEach(function(p){ctx.beginPath();ctx.arc(p[0],p[1],3,0,7);ctx.fill();});
  }catch(e){}
}
function renderSong(el,api){ _api(api);
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:560px;max-width:760px;'+TXT);
  var solved=!!FLAG(api,'med_p3');
  var kBudget=Math.round(SONG_BUDGET_BYTES/1024);
  header(wrap,tx('The Restoration Bench · The Off-Key Song','修复台 · 走调的歌')+(solved?' <span style="'+K+'">✓ '+tx('CLEARED','已完成')+'</span>':''),
    '§1.4 sample rate × resolution');
  if(solved){
    /* 完成态: ✓ 横幅 + 锁定的最优规格 + 定格波形 */
    mk(wrap,'div','margin:4px 0 10px;border:1px solid #6a5a2a;background:rgba(40,30,10,.35);padding:8px 10px;'+K,
      tx('<b>✓ CLEARED.</b> Rebuilt at '+SONG_MIN_RATE+'Hz / '+SONG_MIN_DEPTH+'-bit — the top note holds, no grit, and it slips under the '+kBudget+'KB budget with room to spare ('+songBytes(SONG_MIN_RATE,SONG_MIN_DEPTH,SONG_DUR_SEC)+'B).',
         '<b>✓ 已完成。</b> 以 '+SONG_MIN_RATE+'Hz / '+SONG_MIN_DEPTH+'-bit 重建——高音稳住、没有毛刺, 还宽裕地压进了 '+kBudget+'KB 预算('+songBytes(SONG_MIN_RATE,SONG_MIN_DEPTH,SONG_DUR_SEC)+'B)。'));
    var cvd=mk(wrap,'canvas','display:block;margin:8px 0;border:1px solid #6a5a2a;background:#0d0a05;');
    cvd.width=460;cvd.height=130;songDrawWave(cvd,SONG_MIN_RATE,SONG_MIN_DEPTH);
    mk(wrap,'div','font-size:11.5px;'+DIM,tx('The dots land two-per-cycle on the green wave and the yellow line tracks it cleanly — that is exactly enough, and not one byte more.',
                                             '黄点在绿波上每周期落两个, 黄线干净地贴合原波——这就是"刚好够", 一个字节都不多。'));
    return;
  }
  mk(wrap,'div','',tx(
    'The tune\'s highest note sits at about <b>'+(SONG_TOP_HZ/1000)+'kHz</b>. This '+SONG_DUR_SEC+'-second clip has to fit an archive slot of only <b>'+kBudget+'KB</b>. Pick the <b>lowest sample rate</b> (and just-enough bit depth) that keeps the top note, avoids grit, and still fits the budget. <b>Watch the picture, not your ears.</b>',
    '这首曲子的最高音大约在 <b>'+(SONG_TOP_HZ/1000)+'kHz</b>。这段 '+SONG_DUR_SEC+' 秒的片段, 档案格只留了 <b>'+kBudget+'KB</b>。选出既能留住高音、又不出毛刺、还塞得进预算的<b>最低采样率</b>(和刚好够的位深)。<b>看图, 别只用耳朵。</b>'));
  mk(wrap,'div','font-size:11.5px;'+DIM+'margin:4px 0;',tx(
    'Green = the real '+(SONG_TOP_HZ/1000)+'kHz wave. Yellow dots = snapshots at your rate. Yellow line = all the machine can rebuild. Too few dots → the top note folds into a fake slow note (aliasing). Too few bit levels → the dots snap onto a coarse staircase (grit).',
    '绿线 = 真实的 '+(SONG_TOP_HZ/1000)+'kHz 波。黄点 = 按你的采样率拍下的快照。黄线 = 机器只能重建出的样子。点太少 → 高音塌成假的慢音(走样)。位深档太少 → 黄点被卡到粗糙的台阶上(毛刺)。'));
  var cv=mk(wrap,'canvas','display:block;margin:8px 0;border:1px solid #6a5a2a;background:#0d0a05;');
  cv.width=460;cv.height=130;
  var curRate=0, curDepth=SONG_MIN_DEPTH;
  var read=mk(wrap,'div','font-size:12px;color:#e8c98a;margin:2px 0 6px;min-height:34px;line-height:1.6;');
  function refresh(){
    songDrawWave(cv,curRate,curDepth);
    if(!curRate){ read.innerHTML=tx('Pick a sample rate below — the snapshots (dots) and rebuilt wave (yellow) update live.','在下面选一个采样率——快照(点)和重建波形(黄线)会实时更新。'); return; }
    var bytes=songBytes(curRate,curDepth,SONG_DUR_SEC);
    var keepTop=songRateKeepsTop(curRate), depthOk=songDepthAdequate(curDepth), fits=songFitsBudget(curRate,curDepth);
    read.innerHTML=tx(
      'Rate <b>'+curRate+'Hz</b> keeps up to <b>'+Math.floor(curRate/2)+'Hz</b>; depth <b>'+curDepth+'-bit</b> = '+Math.pow(2,curDepth)+' levels; size <b>'+bytes+'B</b> vs '+SONG_BUDGET_BYTES+'B budget. '+
        (keepTop?'':'<span style="color:#ff8a5a">Top note lost.</span> ')+(depthOk?'':'<span style="color:#ff8a5a">Gritty.</span> ')+(fits?'':'<span style="color:#ff8a5a">Over budget.</span> '),
      '采样率 <b>'+curRate+'Hz</b> 最高留住 <b>'+Math.floor(curRate/2)+'Hz</b>; 位深 <b>'+curDepth+'-bit</b> = '+Math.pow(2,curDepth)+' 档; 体积 <b>'+bytes+'B</b> vs 预算 '+SONG_BUDGET_BYTES+'B。 '+
        (keepTop?'':'<span style="color:#ff8a5a">高音丢了。</span> ')+(depthOk?'':'<span style="color:#ff8a5a">全是毛刺。</span> ')+(fits?'':'<span style="color:#ff8a5a">超预算。</span> '));
  }
  var rateWrap=mk(wrap,'div','margin:6px 0;');rateWrap.appendChild(mk(null,'div',DIM,tx('Sample rate:','采样率:')));
  var rateBtns=mk(rateWrap,'div','display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;');
  var depthWrap=mk(wrap,'div','margin:6px 0;');depthWrap.appendChild(mk(null,'div',DIM,tx('Sample resolution (bit depth):','采样分辨率(位深):')));
  var depthBtns=mk(depthWrap,'div','display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;');
  function repaintBtns(){
    [[rateBtns,SONG_RATES,function(){return curRate;},function(v){curRate=v;},'Hz'],
     [depthBtns,SONG_DEPTHS,function(){return curDepth;},function(v){curDepth=v;},'-bit']].forEach(function(cfg){
      var container=cfg[0];container.innerHTML='';
      cfg[1].forEach(function(v){
        var on=(v===cfg[2]());
        var b=mk(container,'button',on?BTN_HOT:BTN,v+cfg[4]);
        b.onclick=function(){ cfg[3](v); S(api,'ui'); repaintBtns(); refresh(); };
      });
    });
  }
  repaintBtns(); refresh();
  var ctx=null;
  function ensureCtx(){ try{ if(!ctx){ var AC=window.AudioContext||window.webkitAudioContext; if(AC) ctx=new AC(); } if(ctx&&ctx.state==='suspended') ctx.resume(); }catch(e){} return ctx; }
  var NOTES=[440,554,659,880];
  var ab=mk(wrap,'div','margin:8px 0;display:flex;gap:10px;flex-wrap:wrap;align-items:center;');
  mk(ab,'button',BTN,tx('♪ Play original','♪ 播放原声')).onclick=function(){
    var c=ensureCtx(); if(!c) return; NOTES.forEach(function(f,i){ setTimeout(function(){ playTone(c,f,0.3); }, i*300); });
  };
  mk(ab,'button',BTN,tx('♪ Play your rebuild','♪ 播放你的重建')).onclick=function(){
    var c=ensureCtx(); if(!c) return; var r=curRate||SONG_MIN_RATE;
    NOTES.forEach(function(f,i){ setTimeout(function(){ playDegraded(c,f,0.3,r,curDepth); }, i*300); });
  };
  mk(ab,'span','font-size:11px;'+DIM,tx('(audio is corroboration only — real downsampling, never pitch-shift. Trust the picture.)','(音频只是佐证——真实降采样, 绝不变调。以图为准。)'));
  var msg=mk(wrap,'div','min-height:34px;font-size:12px;color:#ffce3a;line-height:1.6;margin-top:4px;');
  var foot=mk(wrap,'div','margin-top:4px;display:flex;gap:10px;');
  mk(foot,'button',BTN_HOT,tx('⟳ Confirm rebuild ▸','⟳ 确认重建 ▸')).onclick=function(){
    if(!curRate){ S(api,'err'); msg.textContent=tx('Pick a sample rate first — and watch what it does to the yellow wave.','先选一个采样率——并看看它把黄线变成了什么样。'); return; }
    var diag=songDiagnose(curRate,curDepth);
    if(diag==='ok'){
      S(api,'ok'); SET(api,'med_p3'); STEP(api,'med_main','s3');
      if(songOptimal(curRate,curDepth)) SET(api,'med_challenge_3');
      TOAST(api,B('✓ The high note holds, no grit, and it fits — '+curRate+'Hz / '+curDepth+'-bit, '+songBytes(curRate,curDepth,SONG_DUR_SEC)+'B under the '+kBudget+'KB budget.',
                  '✓ 高音稳住、没有毛刺、也塞得进——'+curRate+'Hz / '+curDepth+'-bit, '+songBytes(curRate,curDepth,SONG_DUR_SEC)+'B, 在 '+kBudget+'KB 预算内。'),true);
      renderSong(el,api);
    }else{
      S(api,'err'); bumpFail(api,'med_p3_fails','med_p_song');
      var m = (diag==='lowrate')
        ? tx('✗ High note lost — the rate is below 2×'+(SONG_TOP_HZ/1000)+'kHz, so the '+(SONG_TOP_HZ/1000)+'kHz note folds into a fake slow wobble (watch the yellow wave). Raise the rate.',
             '✗ 高音丢了——采样率低于 2×'+(SONG_TOP_HZ/1000)+'kHz, '+(SONG_TOP_HZ/1000)+'kHz 那个音塌成了假的慢波(看黄线)。把采样率提上去。')
        : (diag==='grit')
        ? tx('✗ All grit — '+curDepth+'-bit gives only '+Math.pow(2,curDepth)+' loudness levels, so the wave snaps onto a coarse staircase. Raise the bit depth.',
             '✗ 全是毛刺——'+curDepth+'-bit 只有 '+Math.pow(2,curDepth)+' 档响度, 波形被卡到粗糙的台阶上。把位深提上去。')
        : tx('✗ Can\'t store it — '+songBytes(curRate,curDepth,SONG_DUR_SEC)+'B exceeds the '+SONG_BUDGET_BYTES+'B budget. Come DOWN to the lowest rate/depth that still keeps the note clean.',
             '✗ 存不下——'+songBytes(curRate,curDepth,SONG_DUR_SEC)+'B 超过了 '+SONG_BUDGET_BYTES+'B 预算。<b>降</b>到仍能保持干净的最低采样率/位深。');
      msg.innerHTML=m; songDrawWave(cv,curRate,curDepth);
    }
  };
  mk(foot,'button',BTN,tx('Reset','重置')).onclick=function(){ renderSong(el,api); };
  addHints(wrap,'med_p_song',MP3_HINTS);
}
/* WebAudio 演示: 判分与音频完全解耦, 仅供"听得出差别"的沉浸感; 无外部音频文件, 全部现场合成.
   playDegraded 做真实降采样(sample-hold)+量化, 绝不做变调(pitch-shift). */
function playTone(ctx,freq,dur){
  try{
    var o=ctx.createOscillator(); o.type='sine'; o.frequency.value=freq;
    var g=ctx.createGain(); g.gain.value=0.15;
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime+dur);
  }catch(e){}
}
function playDegraded(ctx,freq,dur,rateHz,depthBits){
  try{
    var src=ctx.createOscillator(); src.type='sine'; src.frequency.value=freq;
    var sp;
    try{ sp=ctx.createScriptProcessor(1024,1,1); }catch(e){ playTone(ctx,freq,dur); return; }
    var holdEvery=Math.max(1,Math.round(ctx.sampleRate/rateHz));
    var levels=Math.pow(2,Math.max(1,Math.min(16,depthBits)));
    var held=0,counter=0;
    sp.onaudioprocess=function(ev){
      var inp=ev.inputBuffer.getChannelData(0), out=ev.outputBuffer.getChannelData(0);
      for(var i=0;i<inp.length;i++){
        if(counter%holdEvery===0) held=inp[i];
        counter++;
        var q=Math.round(((held+1)/2)*(levels-1))/(levels-1)*2-1;
        out[i]=q;
      }
    };
    var g=mk?null:null; // (no-op, keep lint calm)
    var gain=ctx.createGain(); gain.gain.value=0.15;
    src.connect(sp); sp.connect(gain); gain.connect(ctx.destination);
    src.start();
    setTimeout(function(){ try{ src.stop(); sp.disconnect(); gain.disconnect(); }catch(e){} }, dur*1000);
  }catch(e){}
}

/* --- 谜题4 (Boss): 保管库归档 —— 有损 vs 无损 --- */
var MP4_HINTS=[
  B('Hint 1/3: ask "would ANY loss here actually matter to someone"? Medical, legal and archival masters answer yes — lossless. Casual, disposable, or heavily-repeated everyday media usually answers no — lossy.',
    '提示 1/3: 问自己"这里丢一点信息, 真的会有人在乎吗?" 医疗、法律、母带类答案是"会"——选无损。随手拍的、一次性的、天天重复播的日常媒体, 答案通常是"不会"——选有损。'),
  B('Hint 2/3: three of the six items need Verbatim\'s vault (lossless): the X-ray, the concert master tape, the legal contract scan. The other three suit Gist\'s satchel (lossy).',
    '提示 2/3: 6 件里有 3 件该归 Verbatim 的保险柜 (无损): X 光片、音乐会母带、法律合同扫描件。另外 3 件适合 Gist 的褡裢 (有损)。'),
  B('Hint 3/3 — worked example with DIFFERENT items: try these three first, none are in the vault. A scanned birth certificate → lossless (a legal record; one wrong pixel of a stamp could matter). A funny meme you\'re about to text → lossy (nobody inspects it pixel-by-pixel). A podcast\'s archived master → lossless (the keep-forever original). Notice the single test each time: "would ANY loss actually matter to someone?" Now put that same one question to each of the six real items.',
    '提示 3/3 —— 换了物品的完整范例(例子·换了物品): 先判断这三件(它们都不在保管库里)。一张扫描的出生证明 → 无损(法律凭证, 印章错一个像素都可能出事)。一个你正要发出去的搞笑表情包 → 有损(没人会逐像素检查)。一档播客的存档母带 → 无损(要永久保存的原件)。留意每次都是同一个判据: "丢一丁点信息真的会有人在乎吗?" 现在把这同一个问题, 逐一套到六件真实物品上。')
];
function renderVault(el,api){ _api(api);
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:560px;max-width:760px;'+TXT);
  header(wrap,tx('The Archive Vault · Boss','保管库 · Boss'),'§1.5 lossy vs lossless');
  var solved=!!FLAG(api,'med_p4');
  if(solved){
    mk(wrap,'div','',tx(
      '<span style="'+K+'">✓ The vault is sorted.</span> Verbatim\'s side hums, dense and unhurried. Gist\'s side is half the size and twice as breezy. Neither twin has apologised to the other, but both have stopped glaring, which around here counts as reconciliation.',
      '<span style="'+K+'">✓ 保管库已经分类完毕。</span> Verbatim 那侧嗡嗡作响, 密实又不慌不忙。Gist 那侧体积减半, 轻快加倍。姐妹俩谁都没跟对方道歉, 但都不再互瞪了——在这儿, 这就算和解。'));
    return;
  }
  mk(wrap,'div','',tx(
    'Six items, waiting to be filed. Read what each one is for, then send it to Verbatim\'s vault (lossless — exact, heavier) or Gist\'s satchel (lossy — smaller, close enough). '+VAULT_PASS+'/6 correct clears the vault.',
    '六件待归档物品。读懂每一件的用途, 再决定送去 Verbatim 的保险柜 (无损——分毫不差, 更重) 还是 Gist 的褡裢 (有损——更小, 够用就行)。'+VAULT_PASS+'/6 正确即可通关。'));
  var choices={};
  var list=mk(wrap,'div','margin:10px 0;');
  ARCHIVE_ITEMS.forEach(function(it){
    var row=mk(list,'div','border:1px solid #4a3a1a;padding:8px 10px;margin:6px 0;');
    row.innerHTML='<div>'+T(it.desc)+'</div>';
    var btns=mk(row,'div','margin-top:6px;display:flex;gap:6px;');
    var b1=mk(btns,'button',BTN,tx('→ Verbatim (lossless)','→ Verbatim (无损)'));
    var b2=mk(btns,'button',BTN,tx('→ Gist (lossy)','→ Gist (有损)'));
    function paint(){
      b1.style.background=(choices[it.id]==='lossless')?'#3a2a10':'#2a2010';
      b1.style.borderColor=(choices[it.id]==='lossless')?'#e8c98a':'#6a5a2a';
      b2.style.background=(choices[it.id]==='lossy')?'#3a2a10':'#2a2010';
      b2.style.borderColor=(choices[it.id]==='lossy')?'#e8c98a':'#6a5a2a';
    }
    b1.onclick=function(){ choices[it.id]='lossless'; paint(); S(api,'ui'); };
    b2.onclick=function(){ choices[it.id]='lossy'; paint(); S(api,'ui'); };
    paint();
  });
  mk(wrap,'button',BTN_HOT,tx('Seal the vault ▸','封存保管库 ▸')).onclick=function(){
    var r=scoreVault(ARCHIVE_ITEMS,choices);
    if(r.correct>=VAULT_PASS){
      S(api,'quest'); SET(api,'med_p4'); STEP(api,'med_main','s4'); MARK(api,'med_main');
      GIVE(api,'med_fidelity_seal',B('Fidelity Seal','保真印'));
      TOAST(api,B('◈ The Gallery of Lost Fidelity · Main Quest Complete ◈ '+r.correct+'/'+r.total+' filed correctly.',
                  '◈ 失真画廊 · 主线完成 ◈ '+r.correct+'/'+r.total+' 件归档正确。'),true);
      renderVault(el,api);
    }else{
      S(api,'err'); bumpFail(api,'med_p4_fails','med_p_vault');
      msgFlash(wrap,tx(r.correct+'/'+r.total+' correct — under '+VAULT_PASS+'. Re-read the ones you\'re unsure of.',
                       r.correct+'/'+r.total+' 正确——没到 '+VAULT_PASS+'。重新读读你不确定的那几件。'));
    }
  };
  addHints(wrap,'med_p_vault',MP4_HINTS);
}

/* --- 隐藏谜题: 裂纹相框里的秘密 --- */
/* 「识破即解」: 不再让玩家逐字查表手打整句 —— 只要认出这是 ASCII 编码(选对类型),
   机器就展开完整对照表并自动填出整句, 玩家确认即可(≤30s)。完整查表教学留在 domain_data.js。 */
function renderSecret(el,api){ _api(api);
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:480px;max-width:640px;'+TXT);
  var solved=!!FLAG(api,'med_hidden_done');
  header(wrap,tx('A Cracked Frame, Tucked Behind the Pillar','裂纹相框, 藏在立柱后面')+(solved?' <span style="'+K+'">✓</span>':''),'?????');
  if(solved){
    mk(wrap,'div','',tx('<span style="'+K+'">✓ “'+SECRET_MSG+'”</span> — you already read what this frame had to say.',
                         '<span style="'+K+'">✓ “'+SECRET_MSG+'”</span>——这面相框想说的话, 你已经读过了。'));
    return;
  }
  mk(wrap,'div','',tx(
    'This frame\'s "restoration code" makes no sense as run-lengths — a run of 76 in a 10-pixel-wide mural? Every number here sits between 32 and 90. So what kind of code is it really?',
    '这面相框的"修复码"当游程数完全说不通——一幅只有10像素宽的壁画里, 哪来76个连续同色? 而且这里每个数字都恰好落在 32 到 90 之间。那它到底是哪种编码?'));
  var codeBox=mk(wrap,'pre','background:rgba(20,14,4,.6);border:1px solid #6a5a2a;padding:8px 10px;'+
    'color:#e8c98a;font-size:13px;letter-spacing:2px;margin:10px 0;',secretCodes().join('  '));
  var msg=mk(wrap,'div','min-height:22px;font-size:12px;color:#ff9c6a;margin:6px 0;line-height:1.6;');
  var opts=mk(wrap,'div','display:flex;gap:8px;flex-wrap:wrap;margin:6px 0;');
  function reveal(){
    /* 识破 → 展开完整 ASCII 对照表 + 自动填出整句 + 确认 */
    opts.style.display='none'; msg.textContent='';
    var codes=secretCodes();
    var tbl='<div style="overflow-x:auto;"><table style="border-collapse:collapse;font-size:12px;margin:6px 0;">';
    tbl+='<tr>'+codes.map(function(n){return '<td style="border:1px solid #6a5a2a;padding:3px 7px;color:#e8c98a;text-align:center;">'+n+'</td>';}).join('')+'</tr>';
    tbl+='<tr>'+codes.map(function(n){return '<td style="border:1px solid #6a5a2a;padding:3px 7px;color:#ffce8a;text-align:center;">'+(n===32?'␣':esc(String.fromCharCode(n)))+'</td>';}).join('')+'</tr>';
    tbl+='</table></div>';
    mk(wrap,'div','margin-top:6px;'+K,tx('Cracked — it\'s ASCII. The machine fills in the whole table for you:','识破了——是 ASCII 码。机器替你把整张对照表都填好了:'));
    mk(wrap,'div','',tbl);
    mk(wrap,'div','font-size:15px;letter-spacing:3px;'+K+'margin-top:4px;',tx('Message: “'+SECRET_MSG+'”','读出: 「'+SECRET_MSG+'」'));
    var cf=mk(wrap,'div','margin-top:8px;');
    mk(cf,'button',BTN_HOT,tx('Confirm reading ▸','确认读出 ▸')).onclick=function(){
      S(api,'quest'); SET(api,'med_hidden_done'); STEP(api,'med_hidden','h2'); MARK(api,'med_hidden');
      GIVE(api,'med_secret_pigment',B('Secret Pigment','秘藏颜料'));
      TOAST(api,B('◈ Hidden find: those weren\'t pixel runs, they were ASCII codes — "'+SECRET_MSG+'"','◈ 隐藏发现: 那些根本不是像素游程, 是 ASCII 码——「'+SECRET_MSG+'」'),true);
      renderSecret(el,api);
    };
  }
  [ {k:'rle', t:B('RLE run-lengths','RLE 游程计数'),
       why:tx('No — a run of 76 can\'t exist in a row only 10 pixels wide. These aren\'t pixel counts.','不对——一行只有10像素宽, 不可能有76个连续同色。这些不是像素计数。')},
    {k:'caesar', t:B('Caesar-shifted letters','凯撒位移字母'),
       why:tx('No — a Caesar cipher shifts letters, but these are already numbers. Read them as codes, not shifted letters.','不对——凯撒密码位移的是字母, 但这些本来就是数字。把它们当"编码"读, 不是位移字母。')},
    {k:'ascii', t:B('ASCII codes (one number = one character)','ASCII 码(一个数字 = 一个字符)'), why:null}
  ].forEach(function(c){
    mk(opts,'button',BTN,T(c.t)).onclick=function(){
      if(c.k==='ascii'){ S(api,'ok'); reveal(); }
      else{ S(api,'err'); msg.textContent=c.why; }
    };
  });
}

/* ================================================================
   5. 模块注册
   ================================================================ */
var spec={
  id:'med', title:B('The Gallery of Lost Fidelity','失真画廊'), world:'as',
  unlock:{world:'as'},
  interior:{ w:IW, h:IH, tiles:buildTiles(), playerStart:{x:12,y:15} },

  npcs:[
    {id:'med_docent',  name:B('Docent Moiré','讲解员·Moiré'), color:'#e8c98a',x:13,y:14,dialog:sigWrap(docentDialog,sigDocent)},
    {id:'med_raster',  name:B('Restorer Raster','修复师·Raster'),       color:'#c9a24a',x:4, y:9, dialog:sigWrap(rasterDialog,sigRaster)},
    {id:'med_nyquist', name:B('Maestro Nyquist','指挥·Nyquist'),        color:'#7ad8c9',x:21,y:9, dialog:sigWrap(nyquistDialog,sigNyquist)},
    {id:'med_verbatim',name:B('Verbatim, the Lossless','逐字姐·Verbatim'),color:'#e0d0a0',x:8, y:3, dialog:sigWrap(verbatimDialog,sigVerbatim)},
    {id:'med_gist',    name:B('Gist, the Lossy','写意妹·Gist'),         color:'#e0a0a0',x:17,y:3, dialog:sigWrap(gistDialog,sigGist)},
  ],

  steles:[
    {id:'med_st_history',x:12,y:13,title:B('Entrance Plaque · Twenty Years of Almost-Silence','门厅铭牌·近乎无声的二十年'),
     text:B(
       '"This gallery once ran at full brightness, every frame current, every recording fresh off the mic. Then the lights went out on half the building, all at once, and stayed that way for twenty years.<br><br>'
       +'Nothing here was stolen. Nothing was deleted outright. It simply sat, uncompressed and unattended, until <span class="k">something upstream stopped paying it any attention</span> — and a gallery no one visits starts to forget itself, one dropped bit at a time."',
       '"这座画廊曾经满室灯火, 每幅画都是最新的, 每段录音都刚离开麦克风。后来, 半栋楼的灯同时熄灭, 一熄就是二十年。<br><br>'
       +'这里什么都没被偷走, 什么都没被直接删除。它只是被搁在那儿, 没压缩也没人照看, 直到<span class="k">上游某处不再分给它任何注意力</span>——一座没人来的画廊, 就会开始一比特一比特地忘记自己。"')},
    {id:'med_st_rle',x:3,y:8,title:B('Wing Plaque · Why Say It Shorter','厅内铭牌·为什么说得更短'),
     codex:['med_rle'],
     text:B(
       '"A picture that is mostly one colour repeated does not need a witness for every single pixel — it needs one witness per <span class="k">run</span>, and a note on how long that run lasted.<br>'
       +'Restorer Raster put it best: \'I am not hiding anything from you. I am simply refusing to say the same word a hundred times when once, with a number attached, will do.\'"',
       '"一张大半是同一种颜色反复出现的画, 不需要为每一个像素都找个证人——只需要每一段<span class="k">游程 (run)</span>找一个证人, 再附上这段持续了多久。<br>'
       +'修复师 Raster 说得最贴切: \'我没有瞒着你任何东西。我只是拒绝把同一个字说一百遍, 明明说一次、附上个数字就够了。\'"')},
    {id:'med_st_colordepth',x:9,y:8,title:B('Wing Plaque · How Many Colours Fit in a Bit','厅内铭牌·一个比特能装多少颜色'),
     codex:['med_colordepth_filesize'],
     text:B(
       '"1 bit per pixel buys you exactly two colours — on, or off. Add a second bit and you buy four. A third, and eight. Every extra bit of colour depth <i>doubles</i> the palette, and doubles the bytes.<br>'
       +'The gallery\'s oldest paintings were framed when a bit cost more than the paint. Its newest were framed when nobody thought to ask.<br>'
       +'<span class="dim">Somewhere between those two eras, someone learned to ask again.</span>"',
       '"每像素 1 bit 能买到恰好两种颜色——开, 或者关。再加一个 bit, 能买到四种。再加一个, 八种。色深每多一个 bit, 调色板就<i>翻一倍</i>, 字节数也翻一倍。<br>'
       +'画廊最老的那些画, 裱框的年代里一个 bit 比颜料还贵。最新的那些, 裱框的年代里没人想起来要问这个问题。<br>'
       +'<span class="dim">在这两个年代之间的某处, 有人重新学会了去问。</span>"')},
    {id:'med_st_nyquist',x:21,y:8,title:B('Concert-Hall Plaque · Why 44.1kHz','乐坊铭牌·为什么是 44.1kHz'),
     codex:['med_sampling_tradeoffs'],
     text:B(
       '"Long before this gallery existed, engineers building the first digital discs picked <span class="k">44,100 samples a second</span> for a reason that had nothing to do with music and everything to do with television: it was a rate their video recorders could already store reliably, and it happened to sit comfortably above twice the highest pitch a healthy human ear can hear.<br>'
       +'Go lower, and the ear starts filling in gaps with the wrong notes. Go much higher, and you are simply paying rent on silence no one can hear. The whole art is landing exactly on \'enough.\'"',
       '"远在这座画廊存在之前, 设计第一批数字光盘的工程师选定了<span class="k">每秒 44,100 次采样</span>——理由几乎和音乐无关, 全和电视机有关: 那是他们的录像设备已经能可靠存储的速率, 而且恰好舒适地高于健康人耳能听到的最高音的两倍。<br>'
       +'再低, 耳朵就会开始用错的音符去填补空白。再高得多, 就只是在为没人听得见的寂静付房租。这门手艺的全部精髓, 就是精准落在\'刚好够用\'上。"')},
    {id:'med_st_twins',x:12,y:4,title:B('Vault Lintel · Two Ways to Keep a Promise','保管库门楣·守诺言的两种方式'),
     codex:['med_lossy_lossless'],
     text:B(
       '"Carved above the vault door, in two hands that clearly did not agree on the wording:<br><br>'
       +'<span class="k">\'I promise to bring back exactly what you gave me.\'</span> — smaller print beneath: <i>at whatever size that takes.</i><br>'
       +'<span class="k">\'I promise to bring back something close enough that you won\'t mind.\'</span> — smaller print beneath: <i>and it will cost you far less to keep.</i><br><br>'
       +'Neither promise is the lie. The only mistake is asking the wrong sister to keep it."',
       '"刻在保管库门楣上, 分明是两只笔迹完全谈不拢的手刻的:<br><br>'
       +'<span class="k">\'我保证原样带回你交给我的东西。\'</span>——下面小字注: <i>不管这要占多大地方。</i><br>'
       +'<span class="k">\'我保证带回一个你不会介意的近似版本。\'</span>——下面小字注: <i>而且留着它会便宜得多。</i><br><br>'
       +'两句承诺都不是谎言。唯一的错误, 是找错了姐妹去兑现它。"')},
    {id:'med_st_egg',x:2,y:13,title:B('Handwritten Note, Taped to the Pillar','手写便条, 贴在立柱上'),
     text:B(
       '"If you are reading this, you have already spent longer squinting at pillar-shadows than any sane visitor should. Good. That is exactly the kind of person who finds the interesting things in here.<br><br>'
       +'There is a cracked frame two steps west of you. Its \'restoration code\' has never once described a picture. Somebody was hiding a sentence, not a mural — go on, be nosy about it."',
       '"如果你在读这个, 说明你已经在立柱阴影里瞪眼瞪得比任何正常访客都久了。很好。就是要这种人, 才找得到这里面有意思的东西。<br><br>'
       +'往西两步, 有一面裂纹相框。它的\'修复码\'从来就没描述过任何一幅画。有人藏的是一句话, 不是壁画——去吧, 大胆地八卦一下。"')},
  ],

  quests:[
    {id:'med_main',line:'main',title:B('The Gallery of Lost Fidelity: A Night of Restoration','失真画廊: 复原之夜'),
     desc:B('Every wing of the gallery has lost something to the years — a mural, a frame, a song, a filing system for what is even allowed to be forgotten. Put it all back, faithfully or otherwise, on purpose.',
            '画廊的每一厅都在这些年里丢失了些什么——一幅壁画、一个相框、一首歌, 还有一套决定"什么才配被遗忘"的归档系统。把它们都放回去, 是原样还是概要, 这次要出于选择, 而不是意外。'),
     syllabus:'9618 §1.3 Images (bitmap/colour depth/RLE) §1.4 Sound (sample rate/resolution) §1.5 Compression',
     steps:[
       {id:'s1',text:B('West wing: decode the sun mural\'s run-length restoration code','西厅: 解码太阳壁画的游程修复码')},
       {id:'s2',text:B('West wing: fit every piece to the right storage frame (resolution × colour depth → file size)','西厅: 给每件展品配对相框 (分辨率 × 色深 → 文件大小)')},
       {id:'s3',text:B('East wing: pick a sample rate and resolution that finally hold the tune in tune','东厅: 选一组能让曲子彻底不跑调的采样率与分辨率')},
       {id:'s4',text:B('The Vault (Boss): sort six archive items between Verbatim\'s lossless vault and Gist\'s lossy satchel','保管库 (Boss): 把六件归档物分别送去 Verbatim 的无损保险柜或 Gist 的有损褡裢')},
     ]},
    {id:'med_side_photo',line:'side',title:B('The Curator\'s Old Photograph','讲解员的老照片'),
     desc:B('Docent Moiré has an old photograph they have never dared measure. Work out its byte size and find it a frame.',
            '讲解员·Moiré 有一张一直不敢去量的老照片。算出它的字节数, 给它找个合适的框。'),
     syllabus:'9618 §1.3 Images — applied file-size calculation',
     steps:[
       /* step.check: 对话型步骤 —— 已听到讲解员请求(med_photo_asked 置位)即回溯打勾 */
       {id:'p1',text:B('Hear Docent Moiré\'s request','听讲解员·Moiré的请求'),check:function(api){return !!FLAG(api,'med_photo_asked');}},
       {id:'p2',text:B('Work out 50×40px at 4-bit depth, in bytes','算出 50×40 像素、4 bit 色深的字节数')},
       {id:'p3',text:B('Tell them which frame it actually fits','告诉他们它到底配得上哪个框')},
     ]},
    {id:'med_side_twins',line:'side',title:B('Reconciling the Twins','调解双生姐妹'),
     desc:B('Verbatim and Gist have not agreed on anything in years. Hear both sides out before the Vault makes you choose for real.',
            'Verbatim 和 Gist 已经好多年没在任何事上达成过一致。在保管库真正逼你做选择之前, 先把两边的道理都听完。'),
     syllabus:'9618 §1.5 Compression — lossy vs lossless (narrative primer for the Vault boss)',
     steps:[
       /* step.check: 供引擎 reevalSteps 对旧存档回溯打勾 —— 只要「听完」标记已置位即视为完成 */
       {id:'t1',text:B('Hear Verbatim out','听 Verbatim 讲完'),check:function(api){return !!FLAG(api,'med_verbatim_heard');}},
       {id:'t2',text:B('Hear Gist out','听 Gist 讲完'),check:function(api){return !!FLAG(api,'med_gist_heard');}},
     ]},
    {id:'med_hidden',line:'hidden',title:B('The Cracked Frame\'s Secret','裂纹相框的秘密'),
     desc:B('A restoration code behind a pillar doesn\'t describe any picture at all. Something else is hiding in those numbers.',
            '立柱后面的一份修复码, 压根就没在描述任何一幅画。那些数字里藏着别的东西。'),
     syllabus:'9618 §1.2 ASCII (cross-reference) §1.3 RLE — spotting when an encoding has been repurposed',
     steps:[
       {id:'h1',text:B('Find the cracked frame tucked behind the west-wing pillar','找到藏在西厅立柱后的裂纹相框')},
       {id:'h2',text:B('Decode the hidden message','解码出隐藏的信息')},
     ]},
  ],

  puzzles:[
    {id:'med_p_mural',x:3,y:12,title:B('The Restoration Bench · Sun Mural','修复工作台 · 太阳壁画'),
     syllabus:'9618 §1.3 Images — run-length encoding (RLE)',
     codex:['med_rle'],
     primer:{title:B('What is run-length encoding (RLE)?','什么是游程编码 (RLE)?'),
       body:B(
         '① <b>RLE</b> compresses data with long repeated runs by storing each run once, as a pair: how many, and what value — instead of storing every single repeated item.<br>'
         +'<pre>pixels:  ░░░████░░░\ncode:    3×░  4×█  3×░   (10 pixels → 3 pairs)</pre>'
         +'② It works brilliantly on simple graphics with big blocks of one colour (icons, line art) and does nothing for a noisy photograph where every pixel differs from its neighbour.<br>'
         +'③ Like reporting a queue as "12 people, then a gap, then 3 people" instead of naming every single person in order.<br>'
         +'④ In this puzzle: read each row\'s run-length code and click the matching cells (dark first, then light, in the order given) to restore the mural.',
         '① <b>RLE (游程编码)</b> 对含有大段重复值的数据进行压缩: 把每一段连续重复只存一次, 存成一对——有多少个、是什么值——而不是把每个重复项都存一遍。<br>'
         +'<pre>像素:    ░░░████░░░\n编码:    3×░  4×█  3×░   (10个像素 → 3对)</pre>'
         +'② 它在色块简单的图形上 (图标、线稿) 效果极好, 但在一张每个像素都和邻居不一样的噪点照片上几乎不起作用。<br>'
         +'③ 就像汇报排队人数时说"12人, 然后空一段, 然后3人", 而不是把每个人挨个报一遍名字。<br>'
         +'④ 这道题里: 读懂每行的游程编码, 点出对应的格子 (先暗后亮, 按给出顺序), 还原壁画。')},
     render:renderMural,onKey:function(e,api){ if(e.key==='?'&&hintFns.med_p_mural) hintFns.med_p_mural(); }},
    {id:'med_p_frame',x:9,y:12,title:B('Frame Fitting Bench','相框适配台'),
     syllabus:'9618 §1.3 Images — resolution × colour depth → file size',
     codex:['med_colordepth_filesize'],
     primer:{title:B('How do resolution and colour depth decide file size?','分辨率与色深怎样决定文件大小?'),
       body:B(
         '① A bitmap\'s size in bits = width × height × <b>colour depth</b> (bits stored per pixel). Convert to bytes by dividing by 8 and rounding UP.<br>'
         +'<pre>4×4 image, 2-bit depth:  4×4×2 = 32 bits = 4 bytes</pre>'
         +'② More pixels (higher resolution) or more shades per pixel (higher colour depth) both make the file bigger — and they multiply together, they don\'t just add.<br>'
         +'③ Like packing a crate: more items (resolution) AND a bigger box per item (colour depth) both add to the total weight — and a badly-guessed crate either won\'t close or wastes half its space empty.<br>'
         +'④ In this puzzle: compute each artwork\'s byte size, then pick the smallest frame whose capacity still fits it.',
         '① 位图的位大小 = 宽 × 高 × <b>色深</b>(每像素存储的位数)。除以 8 并向上取整换算成字节。<br>'
         +'<pre>4×4 图像, 2-bit 色深:  4×4×2 = 32 bit = 4 字节</pre>'
         +'② 像素更多 (分辨率更高) 或每像素能表现的颜色更多 (色深更高), 都会让文件变大——而且两者是相乘关系, 不是相加。<br>'
         +'③ 像装箱: 东西件数更多 (分辨率) 和每件东西的包装盒更大 (色深) 都会增加总重量——猜错箱子, 要么关不上, 要么白白空出一半。<br>'
         +'④ 这道题里: 算出每件展品的字节数, 再选容量刚好装得下的最小相框。')},
     render:renderFrame,onKey:function(e,api){ if(e.key==='?'&&hintFns.med_p_frame) hintFns.med_p_frame(); }},
    {id:'med_p_song',x:22,y:12,title:B('The Restoration Bench · The Off-Key Song','修复台 · 走调的歌'),
     syllabus:'9618 §1.4 Sound — sample rate & sample resolution',
     codex:['med_sampling_tradeoffs'],
     primer:{title:B('What do sample rate and sample resolution do?','采样率与采样分辨率分别管什么?'),
       body:B(
         '① A real sound wave is continuous. <b>Sample rate</b> = how many snapshots of it are taken per second (Hz). <b>Sample resolution</b> = how many distinct loudness levels each snapshot is stored with (more bits = finer steps).<br>'
         +'<pre>low rate:     •   •   •    → pitch itself gets confused\nlow resolution: ▏▂▅▇    → loudness gets a gritty staircase</pre>'
         +'② Skimp on rate and high notes blur into the wrong pitch; skimp on resolution and even a correct pitch sounds gritty and stepped.<br>'
         +'③ Like a flip-book (more drawings per second = smoother motion) crossed with a colouring set (more crayons = smoother shading) — one fixes "when," the other fixes "how much."<br>'
         +'④ In this puzzle: pick the lowest rate and resolution that still keep the tune sounding right — that\'s the efficient answer, not just "turn everything up."',
         '① 真实声波是连续的。<b>采样率</b> = 每秒对它拍多少张快照 (Hz)。<b>采样分辨率</b> = 每张快照能存多少档不同的响度 (位数越多, 档位越细)。<br>'
         +'<pre>低采样率:     •   •   •    → 音高本身就乱了\n低分辨率: ▏▂▅▇    → 响度出现粗糙的台阶感</pre>'
         +'② 采样率抠门, 高音会糊成错的音高; 分辨率抠门, 就算音高对了, 听起来也是粗糙、有台阶感的。<br>'
         +'③ 像翻页动画 (每秒张数更多=动作更顺滑) 加上一盒蜡笔 (颜色更多=渐变更顺滑) 的合体——一个管"什么时候", 一个管"多精细"。<br>'
         +'④ 这道题里: 选出仍能让曲子听着对的<b>最低</b>采样率和分辨率——这才是高效的答案, 不是一味"全部拉满"。')},
     render:renderSong,onKey:function(e,api){ if(e.key==='?'&&hintFns.med_p_song) hintFns.med_p_song(); }},
    {id:'med_p_vault',x:12,y:2,title:B('The Archive Vault (Boss)','保管库 (Boss)'),
     syllabus:'9618 §1.5 Compression — lossy vs lossless, choosing the right one',
     codex:['med_lossy_lossless'],
     primer:{title:B('Lossy vs lossless — how do you choose?','有损 vs 无损——怎么选?'),
       body:B(
         '① <b>Lossless</b> compression can be reversed perfectly — decompress it and you get back exactly the original bits, at the cost of a smaller size reduction. <b>Lossy</b> compression throws away detail permanently in exchange for much smaller files.<br>'
         +'② Lossy only works because it targets detail humans barely perceive anyway (tiny colour shifts, quiet masked frequencies) — it is not "random damage," it is deliberate, informed loss.<br>'
         +'③ Like a court transcript (must be word-for-word: lossless) versus a friend retelling you the gist of a film (leaves out details nobody needed: lossy).<br>'
         +'④ In this puzzle: for each archive item, decide whether losing ANY information would actually matter to someone, or whether "close enough" was always going to be fine.',
         '① <b>无损</b>压缩可以完美还原——解压后得到和原始数据一模一样的比特, 代价是压缩率没那么高。<b>有损</b>压缩永久丢弃部分细节, 换来小得多的文件。<br>'
         +'② 有损压缩之所以行得通, 是因为它专挑人类几乎察觉不到的细节下手 (微小色差、被掩蔽的安静频率)——这不是"随机损坏", 而是有意为之、有依据的取舍。<br>'
         +'③ 像法庭记录 (必须一字不差: 无损) 对比朋友转述电影梗概 (省掉没人在乎的细节: 有损)。<br>'
         +'④ 这道题里: 对每件归档物判断——丢失任何信息真的会有人在乎吗? 还是"差不多就行"从一开始就够用?')},
     render:renderVault,onKey:function(e,api){ if(e.key==='?'&&hintFns.med_p_vault) hintFns.med_p_vault(); }},
    {id:'med_p_secret',x:2,y:14,title:B('A Cracked Frame, Tucked Behind the Pillar','裂纹相框, 藏在立柱后面'),
     syllabus:'9618 §1.2 ASCII (cross-reference) — hidden, optional',
     render:renderSecret,onKey:function(e,api){}},
  ],

  onEnter:function(api){ _api(api);
    if(!FLAG(api,'med_intro')){
      SET(api,'med_intro');
      S(api,'open');
      TOAST(api,B('The Gallery of Lost Fidelity — half its lights lit, and a silence that has been recorded at the wrong bit depth for twenty years.',
                  '失真画廊——灯只亮了一半, 二十年来, 这里的寂静一直被记录在错误的位深上。'),true);
      try{
        api&&api.openDialog&&api.openDialog([
          {sp:B('???','???'),t:B('<span class="dim">(somewhere in the west wing, a run-length count stutters and resets, over and over)</span>',
                                  '<span class="dim">(西厅深处, 一段游程计数不断卡顿、重置, 循环往复)</span>')},
          {sp:B('Docent Moiré','讲解员·Moiré'),t:B('Oh — a visitor, at last. Come in, come in. Nothing here bites. Some of it just... doesn\'t remember itself as well as it used to.',
                                  '哦——总算来了位访客。请进请进。这儿的东西都不咬人。有些东西只是……不像以前那样能好好记得自己了。')},
        ]);
      }catch(e){}
    }else{
      TOAST(api,B('The Gallery of Lost Fidelity · west wing keeps images, east wing keeps sound, north past the divider keeps the vault.',
                  '失真画廊 · 西厅存影像, 东厅存声音, 分隔墙以北是保管库。'));
    }
  },

  onQuestComplete:function(qid,api){ _api(api);
    if(qid==='med_main'){
      S(api,'quest');
      TOAST(api,B('◈ The Gallery of Lost Fidelity is whole again — not because nothing was lost, but because what was lost, this time, was lost on purpose.',
                  '◈ 失真画廊重新完整了——不是因为什么都没丢, 而是这一次, 丢的东西都是选择丢的。'),true);
    }else if(qid==='med_side_photo'){
      S(api,'quest');
      TOAST(api,B('◈ Side quest complete ◈ Somewhere in the west wing, a photograph nobody had measured in twenty years finally has a frame that fits.',
                  '◈ 支线完成 ◈ 西厅某处, 一张二十年没人量过的照片, 终于有了合身的框。'),true);
    }else if(qid==='med_side_twins'){
      SET(api,'med_twins_done'); S(api,'quest');
      TOAST(api,B('◈ Side quest complete ◈ The twins still disagree about everything. They have simply stopped pretending the other one is wrong about it.',
                  '◈ 支线完成 ◈ 姐妹俩依然对一切都意见不合。她们只是不再假装对方是错的了。'),true);
    }else if(qid==='med_hidden'){
      S(api,'quest');
      TOAST(api,B('◈ Hidden quest complete ◈ An encoding that pretended to be a picture, and was actually a sentence — the gallery has more of those than anyone admits.',
                  '◈ 隐藏支线完成 ◈ 一份假装是图片的编码, 其实是一句话——这画廊里这种东西, 比谁都愿意承认的要多。'),true);
    }
  },

  /* 纯逻辑判定导出 —— 供 node 单测(引擎请忽略) */
  _test:{
    MURAL_W:MURAL_W,MURAL_H:MURAL_H,MURAL_ROWS:MURAL_ROWS,
    strToPixels:strToPixels,encodeRunsForRow:encodeRunsForRow,decodeRuns:decodeRuns,
    runsEqualPixels:runsEqualPixels,rowMatchesTarget:rowMatchesTarget,muralComplete:muralComplete,
    canonicalRunsForMural:canonicalRunsForMural,tokenCount:tokenCount,MURAL_PAR:MURAL_PAR,
    playerRunsValid:playerRunsValid,
    bitsFor:bitsFor,bytesFor:bytesFor,ARTWORKS:ARTWORKS,FRAMES:FRAMES,bestFrame:bestFrame,frameJudge:frameJudge,
    SONG_TOP_HZ:SONG_TOP_HZ,SONG_MIN_RATE:SONG_MIN_RATE,SONG_MIN_DEPTH:SONG_MIN_DEPTH,SONG_DUR_SEC:SONG_DUR_SEC,
    SONG_BUDGET_BYTES:SONG_BUDGET_BYTES,SONG_RATES:SONG_RATES,SONG_DEPTHS:SONG_DEPTHS,
    songBytes:songBytes,songRateKeepsTop:songRateKeepsTop,songDepthAdequate:songDepthAdequate,
    songFitsBudget:songFitsBudget,songAliasHz:songAliasHz,songPasses:songPasses,
    songDiagnose:songDiagnose,songOptimal:songOptimal,
    ARCHIVE_ITEMS:ARCHIVE_ITEMS,VAULT_PASS:VAULT_PASS,judgeArchive:judgeArchive,scoreVault:scoreVault,
    SECRET_MSG:SECRET_MSG,secretCodes:secretCodes,secretDecode:secretDecode,secretCheck:secretCheck,
    buildTiles:buildTiles,IW:IW,IH:IH,
    /* 纯函数断言集 —— node 单测: spec._test.run() -> {pass,fail,failures} */
    run:function(){
      var pass=0,fail=0,failures=[];
      function chk(name,cond){ if(cond)pass++; else{fail++;failures.push(name);} }
      // 谜题1 · RLE 壁画
      chk('mural: canonical runs decode back to each row', MURAL_ROWS.every(function(r){return runsEqualPixels(encodeRunsForRow(r),strToPixels(r));}));
      chk('mural: muralComplete accepts the target grid', muralComplete(MURAL_ROWS.map(strToPixels)));
      chk('mural: muralComplete rejects an all-dark grid', !muralComplete(MURAL_ROWS.map(function(){return new Array(MURAL_W).fill(0);})));
      chk('mural: playerRunsValid accepts canonical code', playerRunsValid(canonicalRunsForMural()));
      chk('mural: PAR equals canonical token count', MURAL_PAR===tokenCount(canonicalRunsForMural()));
      // 谜题2 · 相框选型
      chk('frame: 64x48x8 = 3072 bytes', bytesFor(64,48,8)===3072);
      chk('frame: bestFrame(3072) is the memory crystal', (bestFrame(3072,FRAMES)||{}).id==='crystal');
      chk('frame: stamp (8x8x1=8B) best-fits the locket', frameJudge(ARTWORKS[0],'locket',FRAMES));
      chk('frame: every artwork has exactly one best frame', ARTWORKS.every(function(a){return !!bestFrame(bytesFor(a.w,a.h,a.depth),FRAMES);}));
      // 谜题3 · 走调的歌 (规格/预算/走样/位深)
      chk('song: min rate = 2x top note', SONG_MIN_RATE===2*SONG_TOP_HZ);
      chk('song: (8000,8) is the ONLY passing offered combo', SONG_RATES.every(function(r){return SONG_DEPTHS.every(function(d){ var want=(r===SONG_MIN_RATE&&d===SONG_MIN_DEPTH); return songPasses(r,d)===want; });}));
      chk('song: below-Nyquist rate diagnosed lowrate', songDiagnose(4000,8)==='lowrate');
      chk('song: inadequate depth diagnosed grit', songDiagnose(8000,4)==='grit');
      chk('song: over-budget picks diagnosed overbudget', songDiagnose(11025,8)==='overbudget'&&songDiagnose(8000,16)==='overbudget');
      chk('song: aliasing — top note kept at min rate, folded below', songAliasHz(SONG_MIN_RATE)===SONG_TOP_HZ&&songAliasHz(4000)!==SONG_TOP_HZ);
      chk('song: budget excludes 16-bit even at min rate', !songFitsBudget(SONG_MIN_RATE,16));
      chk('song: optimal == the unique passing combo', songOptimal(SONG_MIN_RATE,SONG_MIN_DEPTH)&&songPasses(SONG_MIN_RATE,SONG_MIN_DEPTH));
      chk('song: byte formula 8000x8x3/8 = 24000', songBytes(8000,8,3)===24000);
      // 谜题4 · 保管库 (有损/无损)
      chk('vault: all-correct choices score 6/6', scoreVault(ARCHIVE_ITEMS,ARCHIVE_ITEMS.reduce(function(o,it){o[it.id]=it.correct;return o;},{})).correct===ARCHIVE_ITEMS.length);
      chk('vault: judgeArchive xray -> lossless', judgeArchive(ARCHIVE_ITEMS[0],'lossless')&&!judgeArchive(ARCHIVE_ITEMS[0],'lossy'));
      // 隐藏 · ASCII 秘密
      chk('secret: codes decode to the message', secretDecode(secretCodes())===SECRET_MSG);
      chk('secret: secretCheck trims + is case-insensitive', secretCheck('  look closer '));
      return {pass:pass,fail:fail,failures:failures};
    }
  }
};

/* ---------------- 6. Codex 知识库条目 ---------------- */
window.GAME_CODEX=window.GAME_CODEX||[];
window.GAME_CODEX.push(
  {id:'med_rle',mod:'med',syllabus:'9618 §1.3 Images — run-length encoding (RLE)',
   topic:B('Run-Length Encoding (RLE)','游程编码 (RLE)'),
   body:B('RLE compresses runs of repeated values by storing each run once as a (count, value) pair instead of storing every repeated item individually. It is lossless — decoding a correctly-encoded run always reproduces the exact original data. RLE works well on images with large flat blocks of colour (icons, simple line art, scanned text) but performs poorly, or even expands the data, on photographic images where adjacent pixels rarely repeat.',
          'RLE (游程编码) 把连续重复的值压缩成一个 (计数, 值) 对, 而不是逐个存储每个重复项。它是无损的——只要编码正确, 解码后总能精确还原原始数据。RLE 在色块简单的图像上 (图标、简单线稿、扫描文字) 效果很好, 但在相邻像素很少重复的照片类图像上效果很差, 甚至可能让数据变得更大。'),
   example:B('A 10-pixel row "0001111000" encodes as [3,0][4,1][3,0] — 3 pairs instead of 10 individual values.',
             '一行10像素 "0001111000" 编码为 [3,0][4,1][3,0]——3对, 而不是10个独立的值。')},
  {id:'med_colordepth_filesize',mod:'med',syllabus:'9618 §1.3 Images — resolution, colour depth & file size',
   topic:B('Resolution × colour depth → file size','分辨率 × 色深 → 文件大小'),
   body:B('An uncompressed bitmap\'s size in bits equals width × height × colour depth (bits stored per pixel); convert to bytes by dividing by 8 and rounding up. Colour depth of n bits allows 2^n distinct colours or shades per pixel. Increasing either resolution (more pixels) or colour depth (more bits per pixel) increases file size, and the two multiply together rather than simply adding.',
          '未压缩位图的位大小 = 宽 × 高 × 色深(每像素存储的位数); 除以8并向上取整即得字节数。n bit 色深每像素可表现 2^n 种不同颜色/灰度。提高分辨率(像素更多)或色深(每像素位数更多)都会增大文件, 且两者是相乘关系, 不是相加。'),
   example:B('A 64×48 image at 8-bit depth: 64×48×8 = 24576 bits = 3072 bytes.',
             '一张 64×48、8-bit 色深的图像: 64×48×8 = 24576 bit = 3072 字节。')},
  {id:'med_sampling_tradeoffs',mod:'med',syllabus:'9618 §1.4 Sound — sample rate & sample resolution',
   topic:B('Sample rate & sample resolution','采样率与采样分辨率'),
   body:B('A computer stores a continuous sound wave as discrete snapshots. Sample rate is how many snapshots are taken per second (Hz); sample resolution is how many bits are used to store the loudness of each snapshot. Too low a sample rate causes pitch/frequency information to be lost or distorted; too low a sample resolution causes loudness to be quantised into audible, gritty steps. Both increase file size: file size (bits) = sample rate × sample resolution × duration in seconds.',
          '计算机把连续声波存成离散的快照。采样率是每秒拍多少张快照 (Hz); 采样分辨率是每张快照用多少位来存响度。采样率太低会让音高/频率信息丢失或失真; 采样分辨率太低会让响度被量化成听得出来的、粗糙的台阶感。两者都会增大文件: 文件大小(bit) = 采样率 × 采样分辨率 × 时长(秒)。'),
   example:B('3 seconds at 8000Hz, 8-bit depth: 8000×8×3 = 192000 bits = 24000 bytes.',
             '3秒, 8000Hz、8-bit 分辨率: 8000×8×3 = 192000 bit = 24000 字节。')},
  {id:'med_lossy_lossless',mod:'med',syllabus:'9618 §1.5 Compression — lossy vs lossless',
   topic:B('Lossy vs lossless compression','有损 vs 无损压缩'),
   body:B('Lossless compression (e.g. RLE) can always be perfectly reversed — decompressing returns exactly the original data — but typically achieves a smaller size reduction. Lossy compression (e.g. JPEG, MP3) permanently discards some information to achieve much greater size reduction, deliberately targeting detail that human senses barely perceive. The right choice depends on the use case: use lossless when every bit matters (medical images, legal documents, master recordings, executable code); use lossy when a close approximation is acceptable and size or bandwidth matters more (casual photos, streamed background audio, most web images).',
          '无损压缩 (如 RLE) 总能被完美还原——解压后得到与原始数据完全一致的数据——但压缩率通常较低。有损压缩 (如 JPEG、MP3) 永久丢弃部分信息以换取大得多的压缩率, 且专门针对人类感官几乎察觉不到的细节下手。该选哪种取决于用途: 每个比特都重要时用无损 (医学影像、法律文件、母带录音、可执行代码); 近似结果可接受、且体积/带宽更重要时用有损 (日常照片、流媒体背景音乐、大多数网页图片)。'),
   example:B('An X-ray must be stored losslessly (a diagnosis could hinge on one pixel); a background-music stream is fine as lossy (nobody is listening critically).',
             'X 光片必须无损存储 (诊断可能就取决于某一个像素); 背景音乐流用有损完全没问题 (没人在认真听)。')}
);

window.GAME_MODULES=window.GAME_MODULES||[];
window.GAME_MODULES.push(spec);
})();
