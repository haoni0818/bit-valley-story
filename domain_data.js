/* ================================================================
   BIT://ESCAPE 领域模块 —— 数据表示馆 (domain_data.js)
   9618 AS · Topic 1 Information Representation
     §1.1 数制/BCD · §1.2 字符集 · §1.3 图像 · §1.4 声音
   ----------------------------------------------------------------
   模块协议(与 domain_logic.js 一致):
     window.GAME_MODULES.push({ id,title,world,unlock,interior,npcs,
                                steles,quests,puzzles,onEnter,onQuestComplete })
   - unlock.afterQuest='m3' —— index.html 第一章末尾任务 id。
   - npcs[i].dialog(api) -> 节点数组 {sp,t,choices:[{t,next,do}],next}
     next 缺省 i+1, next:-1 结束; 数组可挂 .onEnd。
   - puzzle.render(el,api) 自建 DOM; onKey(e,api) 处理 '?' 提示热键。
   - 纯逻辑判定导出在 _test 字段(无 DOM 依赖, 供 node 单测)。
   - 双语: 一切面向玩家的字符串都是 {en,zh} 对象(默认英文)。
     结构化字段(title/desc/steps/steles/npc.name/dialog 节点的 sp/t/choices.t)
     直接携带 {en,zh}, 由引擎统一过 window.T;
     render() 自建 DOM 的文字在本模块内自行过 T()。
   世界观: 一座所有展品都"数据损坏"的美术馆。馆长是强迫症校验
   daemon(每句话末尾报字符数); 东南角住着只剩 8kHz 的歌姬残影。
   ================================================================ */
(function(){
'use strict';

const T = window.T || (s => typeof s==='string' ? s : (s && s.en) || '');
function B(en,zh){return {en:en,zh:zh};}
function tx(en,zh){return T({en:en,zh:zh});}

/* ---------------- 0. 纯逻辑判定 (可单测, 无 DOM 依赖) ---------------- */

/* --- 0a. 位图 (§1.3) --- */
function hexByteToBits(v){            /* 0..255 -> [b7..b0] MSB 在前 */
  var out=[];for(var i=7;i>=0;i--)out.push((v>>i)&1);return out;
}
function bitsToByte(bits){            /* [8bit] -> 0..255 */
  var v=0;for(var i=0;i<8;i++)v=(v<<1)|(bits[i]?1:0);return v;
}
function monoCheck(grid,bytes){       /* grid: 8行×8bit; bytes: 目标 */
  for(var r=0;r<bytes.length;r++){
    if(bitsToByte(grid[r])!==bytes[r])return {ok:false,row:r};
  }
  return {ok:true};
}
function decode2bpp(val,w){           /* w 像素 ×2bit, MSB 在前 -> 颜色索引数组 */
  var out=[];for(var i=w-1;i>=0;i--)out.push((val>>(i*2))&3);return out;
}
function encode2bpp(colors){
  var v=0;for(var i=0;i<colors.length;i++)v=(v<<2)|(colors[i]&3);return v;
}
function pix2Check(grid,rowVals){     /* grid: 行×颜色索引 */
  for(var r=0;r<rowVals.length;r++){
    if(encode2bpp(grid[r])!==rowVals[r])return {ok:false,row:r};
  }
  return {ok:true};
}
function hexInputOk(str,byte){        /* 挑战版: 玩家输入的十六进制是否等于 byte */
  str=String(str==null?'':str).trim().replace(/^0x/i,'');
  if(!/^[0-9a-fA-F]{1,2}$/.test(str))return false;
  return parseInt(str,16)===byte;
}
/* 《猫》8×8 单色 —— 修复目标 / 初始损坏帧 / 眨眼帧 */
var CAT      =[0x42,0x66,0x7E,0xDB,0xFF,0xE7,0x7E,0x24];
var CAT_START=[0x00,0x66,0x00,0xDB,0xFF,0x00,0x7E,0x00];  /* 奇数行幸存 */
var CAT_BLINK=[0x42,0x66,0x7E,0xFF,0xFF,0xDB,0x7E,0x24];  /* 闭眼+咧嘴 */
/* 《像素花》6×6 · 2bpp 四色: 0黑 1绿 2红 3黄 */
var FLOWER_W=6;
var FLOWER=[0x0A0,0x2F8,0x2F8,0x0A0,0x050,0x154];
/* 挑战版《入侵者》8×8 —— 玩家反推十六进制 */
var INVADER=[0x18,0x3C,0x7E,0xDB,0xFF,0x24,0x5A,0xA5];

/* --- 0b. 字符集 (§1.2) --- */
var LETTER='SHE STILL DREAMS. KEEP HER ON. - 1970';
function asciiEncode(s){
  var out=[];for(var i=0;i<s.length;i++)out.push(s.charCodeAt(i));return out;
}
function asciiDecode(codes){
  var s='';for(var i=0;i<codes.length;i++)s+=String.fromCharCode(codes[i]);return s;
}
function toBin8(code){
  var s=(code&255).toString(2);while(s.length<8)s='0'+s;return s;
}
function isTypable(code){             /* 大写字母与数字需玩家亲手译; 其余自动显现 */
  return (code>=65&&code<=90)||(code>=48&&code<=57);
}
function cellCheck(code,key){         /* 玩家按键是否译对该码 */
  if(!key||key.length!==1)return false;
  return key.toUpperCase().charCodeAt(0)===code;
}
function replyOk(s){                  /* 回信: 1..24 个可打印 ASCII */
  if(typeof s!=='string')return false;
  s=s.trim();
  if(s.length<1||s.length>24)return false;
  for(var i=0;i<s.length;i++){
    var c=s.charCodeAt(i);
    if(c<32||c>126)return false;
  }
  return true;
}
function replyToBin(s){
  var out=[];for(var i=0;i<s.length;i++)out.push(toBin8(s.charCodeAt(i)));return out;
}
function utf8ByteLen(s){              /* 挑战版: UTF-8 字节数 */
  var n=0;
  for(var i=0;i<s.length;i++){
    var c=s.codePointAt(i);
    if(c>0xFFFF)i++;                  /* 代理对占两个 code unit */
    n+= c<0x80?1 : c<0x800?2 : c<0x10000?3 : 4;
  }
  return n;
}

/* --- 0c. 馆长的校验和 (梗即机制) --- */
function checksum(t){                 /* 去标签去空白, 数码点 */
  var plain=String(t).replace(/<[^>]*>/g,'').replace(/\s+/g,'');
  var n=0;for(var i=0;i<plain.length;i++){var c=plain.codePointAt(i);if(c>0xFFFF)i++;n++;}
  return n;
}
/* 馆长每句话末尾报本句字符数——双语: 英文按英文原句计数, 中文按中文原句计数,
   梗靠 checksum() 动态计算, 不手写数字, 换语言也不会破梗。
   preEn/preZh: 可选的前缀(舞台指示等), 不计入校验和。 */
function cc(en,zh,preEn,preZh){
  preEn=preEn||'';preZh=preZh||'';
  return B(preEn+en+' <span class="dim">(checksum: '+checksum(en)+' chars)</span>',
           preZh+zh+' <span class="dim">(校验和: '+checksum(zh)+' 字)</span>');
}
function ccWrong(en,zh){              /* 故意报错的那句 —— 供"重说"演出 */
  return B(en+' <span class="dim">(checksum: '+(checksum(en)+3)+' chars)</span><i class="wrongsum" style="display:none"></i>',
           zh+' <span class="dim">(校验和: '+(checksum(zh)+3)+' 字)</span><i class="wrongsum" style="display:none"></i>');
}

/* --- 0d. BCD 大钟 (§1.1) --- */
function nibbleVal(bits){             /* [b8,b4,b2,b1] -> 0..15 */
  return bits[0]*8+bits[1]*4+bits[2]*2+bits[3];
}
function nibbleValid(bits){return nibbleVal(bits)<=9;}
function dialsToTime(nibs){           /* 6 组拨轮 -> {h,m,s} 或 null */
  for(var i=0;i<6;i++){if(!nibbleValid(nibs[i]))return null;}
  var d=[];for(var j=0;j<6;j++)d.push(nibbleVal(nibs[j]));
  var h=d[0]*10+d[1],m=d[2]*10+d[3],s=d[4]*10+d[5];
  if(h>23||m>59||s>59)return null;
  return {h:h,m:m,s:s};
}
function timeDiffSec(t1,t2){          /* 环形差(跨午夜取短边) */
  var a=t1.h*3600+t1.m*60+t1.s, b=t2.h*3600+t2.m*60+t2.s;
  var d=Math.abs(a-b);
  return Math.min(d,86400-d);
}
var CLOCK_TOL=30;                     /* 秒针在跑, 给 30s 宽限 */
function clockMatch(nibs,now,tol){
  var t=dialsToTime(nibs);
  if(!t)return {ok:false,reason:'invalid'};
  var d=timeDiffSec(t,now);
  if(d<=tol)return {ok:true,diff:d};
  return {ok:false,reason:'off',diff:d,dialed:t};
}
/* 挑战版: 两位 BCD 加法(逢 >9 加 6 修正) */
function toBin4(v){var s=(v&15).toString(2);while(s.length<4)s='0'+s;return s;}
function bcdAddSolve(a,b){            /* 0<=a,b<=99 且 a+b<=99 */
  var loRaw=(a%10)+(b%10), carry=0, loFix=false;
  if(loRaw>9){loRaw+=6;carry=1;loFix=true;}
  var lo=loRaw&15;
  var hiRaw=Math.floor(a/10)+Math.floor(b/10)+carry, hiFix=false;
  if(hiRaw>9){hiRaw+=6;hiFix=true;}
  var hi=hiRaw&15;
  return {result:hi*10+lo, loFix:loFix, hiFix:hiFix, bits:toBin4(hi)+toBin4(lo)};
}
function bcdAddCheckAnswer(input,a,b){
  var s=String(input==null?'':input).replace(/[^01]/g,'');
  if(s.length!==8)return false;
  return s===bcdAddSolve(a,b).bits;
}

/* --- 0e. 采样 (§1.4) --- */
function genHeldSine(n,freq,sr,hold){ /* 采样保持: hold 越大越"糊" */
  var out=[],v=0;
  for(var i=0;i<n;i++){
    if(i%hold===0)v=Math.sin(2*Math.PI*freq*i/sr);
    out.push(v);
  }
  return out;
}

/* ---------------- 1. 小工具 (与 domain_logic 同款) ---------------- */
function S(api,name){
  try{
    if(!api||!api.sfx)return;
    if(typeof api.sfx==='function')api.sfx(name);
    else if(typeof api.sfx[name]==='function')api.sfx[name]();
  }catch(e){}
}
function TOAST(api,msg,long){try{api&&api.toast&&api.toast(T(msg),long);}catch(e){}}
function FLAG(api,k){try{return api&&api.getFlag?api.getFlag(k):null;}catch(e){return null;}}
function SET(api,k,v){try{api&&api.setFlag&&api.setFlag(k,v===undefined?true:v);}catch(e){}}
function STEP(api,id){try{api&&api.completeStep&&api.completeStep(id);}catch(e){}}
function GIVE(api,id,name){try{api&&api.giveItem&&api.giveItem(id,T(name));}catch(e){}}

function mk(parent,tag,css,html){
  var d=document.createElement(tag);
  if(css)d.style.cssText=css;
  if(html!=null)d.innerHTML=html;
  if(parent)parent.appendChild(d);
  return d;
}
var BTN='background:#0a1f0a;color:#7CFC00;border:1px solid #2f6f2f;padding:5px 12px;'+
        'font-family:inherit;font-size:13px;cursor:pointer;letter-spacing:1px;border-radius:2px;';
var BTN_HOT='background:#123f12;color:#7CFC00;border:1px solid #7CFC00;padding:5px 12px;'+
        'font-family:inherit;font-size:14px;cursor:pointer;letter-spacing:1px;border-radius:2px;box-shadow:0 0 8px #2b6;';
var TXT='color:#bfeebf;font-size:13px;line-height:1.7;';
var DIM='color:#4a7a4a;font-size:11.5px;';
var K='color:#ffce3a;';
var STAR='background:#241a04;color:#ffce3a;border:1px solid #c9a24a;padding:5px 12px;'+
        'font-family:inherit;font-size:13px;cursor:pointer;letter-spacing:1px;border-radius:2px;';

/* 提示系统: 三段递进 + 失败≥2次自动升级 */
var hintFns={};
function addHints(root,pid,hints){
  var idx=-1;
  var bar=mk(root,'div','margin-top:10px;display:flex;align-items:center;gap:10px;');
  var btn=mk(bar,'button',BTN,'? '+tx('Hint','提示')+' <span style="'+DIM+'">'+tx('(or press ?)','(按 ? 键)')+'</span>');
  var box=mk(root,'div','display:none;margin-top:8px;border:1px dashed #c9a24a;'+
    'color:#ffce3a;padding:7px 10px;font-size:12px;line-height:1.7;background:rgba(40,30,5,.35);');
  function next(){
    idx=Math.min(idx+1,hints.length-1);
    box.style.display='block';
    box.innerHTML='<b>'+tx('Hint','提示')+' '+(idx+1)+' / '+hints.length+'</b> — '+T(hints[idx])+
      (idx<hints.length-1?'<br><span style="'+DIM+'">'+tx('(press again for a blunter one)','(再按一次给更直白的)')+'</span>':'');
  }
  btn.onclick=next;
  hintFns[pid]=next;
}
function fail(api,pid){               /* 记失败数; ≥2 次自动弹提示 */
  var k='dt_fail_'+pid;
  var n=(FLAG(api,k)||0)+1;
  SET(api,k,n);
  if(n>=2&&hintFns[pid]){
    hintFns[pid]();
    if(n===2)TOAST(api,B('The puzzle took pity on you and auto-revealed a hint (gold box).','谜题看你可怜, 自动给了条提示(黄框)。'));
  }
  return n;
}
function header(el,title,sub){
  mk(el,'div','color:#9fee9f;letter-spacing:2px;font-size:14px;border-bottom:1px solid #1f3f1f;'+
    'padding-bottom:6px;margin-bottom:8px;',title+
    (sub?' <span style="'+DIM+'float:right;">'+sub+'</span>':''));
}
function jitter(el){                  /* 大钟咳嗽用: 面板抖三下 */
  var seq=[[3,0],[-3,1],[2,-1],[0,0]],i=0;
  (function t(){
    if(i<seq.length&&el&&el.style){
      el.style.transform='translate('+seq[i][0]+'px,'+seq[i][1]+'px)';i++;setTimeout(t,45);
    }else if(el&&el.style)el.style.transform='';
  })();
}

/* 音频: 本模块自带 AudioContext(采样歌姬 & 钟声) */
var AC2=null;
function ac(){
  AC2=AC2||new (window.AudioContext||window.webkitAudioContext)();
  return AC2;
}
function playTone(rate,dur){          /* 用采样保持模拟低采样率的"糊" */
  try{
    var c=ac(),sr=c.sampleRate,n=Math.floor(sr*(dur||0.9));
    var hold=Math.max(1,Math.round(sr/rate));
    var a=genHeldSine(n,523,sr,hold),b=genHeldSine(n,1568,sr,hold);
    var buf=c.createBuffer(1,n,sr),d=buf.getChannelData(0);
    for(var i=0;i<n;i++)d[i]=(a[i]*0.5+b[i]*0.16)*(1-i/n)*0.6;
    var src=c.createBufferSource();src.buffer=buf;src.connect(c.destination);src.start();
  }catch(e){}
}
function playNotes(notes,step,len,type){
  try{
    var c=ac();
    notes.forEach(function(f,i){
      setTimeout(function(){
        try{
          var o=c.createOscillator(),g=c.createGain();
          o.type=type||'sine';o.frequency.value=f;g.gain.value=0.05;
          o.connect(g);g.connect(c.destination);o.start();
          g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+len);
          o.stop(c.currentTime+len+0.02);
        }catch(e){}
      },i*step);
    });
  }catch(e){}
}
function playBell(){playNotes([523,659,784,1046,784,1046,1568],240,0.5,'triangle');}
function playSong(){playNotes([659,587,523,587,659,659,659,587,587,587,659,784,784],300,0.34,'sine');}

/* ---------------- 2. 谜题 1 · 像素修复师 (§1.3) ---------------- */
var PAL=['#0a1408','#39d052','#ff5a5a','#ffce3a'];
var PAL_NAME=[B('00 black','00 黑'),B('01 green','01 绿'),B('10 red','10 红'),B('11 yellow','11 黄')];

function hex2(v){var s=v.toString(16).toUpperCase();return '0x'+(s.length<2?'0':'')+s;}
function hex3(v){var s=v.toString(16).toUpperCase();while(s.length<3)s='0'+s;return '0x'+s;}

function drawMonoArt(box,bytes,px){   /* 只读展示一幅单色画 */
  box.innerHTML='';
  box.style.cssText='display:inline-block;padding:6px;background:#050d05;border:1px solid #1f3f1f;line-height:0;';
  bytes.forEach(function(byte){
    var row=mk(box,'div','line-height:0;');
    hexByteToBits(byte).forEach(function(b){
      mk(row,'span','display:inline-block;width:'+px+'px;height:'+px+'px;'+
        (b?'background:#7CFC00;box-shadow:0 0 4px #4c4;':'background:#0a1408;'));
    });
  });
}

function renderPixel(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:460px;max-width:640px;'+TXT);
  var catDone=FLAG(api,'dt_pixel_done'),flowerDone=FLAG(api,'dt_pixel2_done');

  /* ---- 阶段 A: 修《猫》(1-bit, 60 秒可完成) ---- */
  if(!catDone){
    header(wrap,tx('Exhibit #01 · "Cat"','展品 #01 · 《猫》'),tx('1-bit bitmap · 8×8','1-bit 位图 · 8×8'));
    mk(wrap,'div','',
      tx('The frame hangs crooked; half the pixels have leaked out of it. The restoration card carries the original\'s '+
         '<span style="'+K+'">hex source</span> — one byte per row, one byte lights up 8 cells.<br>'+
         '<span style="'+DIM+'">Rule: 0x42 = 0100 0010 → cells 2 and 7 light up. Click a cell to flip its pixel; nail a row and its label glows green.</span>',
         '画框歪着, 一半像素漏光了。修复卡片上是原作的<span style="'+K+'">十六进制底稿</span>——'+
         '每行一个字节, 一个字节点亮 8 格。<br>'+
         '<span style="'+DIM+'">规则: 0x42 = 0100 0010 → 第 2、7 格亮。点格子开关像素, 拼对一行, 行标亮绿。</span>'));
    var saved=FLAG(api,'dt_pixel_grid');
    var bytes=(saved&&saved.length===8)?saved.slice():CAT_START.slice();
    var grid=bytes.map(hexByteToBits);
    var board=mk(wrap,'div','margin:12px 0;');
    function draw(){
      board.innerHTML='';
      grid.forEach(function(rowBits,r){
        var ok=bitsToByte(rowBits)===CAT[r];
        var line=mk(board,'div','display:flex;align-items:center;gap:10px;margin:2px 0;');
        mk(line,'span','width:52px;font-size:13px;'+(ok?'color:#7CFC00;text-shadow:0 0 6px #4c4;':'color:#ffce3a;'),hex2(CAT[r]));
        var cells=mk(line,'div','display:flex;line-height:0;');
        rowBits.forEach(function(b,cI){
          var cell=mk(cells,'button','width:24px;height:24px;padding:0;cursor:pointer;'+
            'border:1px solid #1f3f1f;'+
            (b?'background:#7CFC00;box-shadow:0 0 6px #4c4;':'background:#0a1408;'));
          cell.onclick=function(){
            var was=bitsToByte(grid[r])===CAT[r];
            grid[r][cI]^=1;S(api,'step');
            SET(api,'dt_pixel_grid',grid.map(bitsToByte));
            var now=bitsToByte(grid[r])===CAT[r];
            if(now&&!was)S(api,'ok');
            draw();
            if(monoCheck(grid,CAT).ok)win();
          };
        });
        mk(line,'span','font-size:14px;'+(ok?'color:#7CFC00;':'color:#333;'),ok?'✓':'…');
      });
    }
    function win(){
      SET(api,'dt_pixel_done');S(api,'quest');
      STEP(api,'dt_m1');
      TOAST(api,B('The painting comes alive!! It meows at you. Somewhere in the distance, the curator trips over something and gets back up.',
                  '画活了!! 它冲你「喵」了一声。远处传来馆长跌倒又爬起来的声音。'),true);
      renderPixel(el,api);
    }
    draw();
    addHints(wrap,'dt_pixel',[
      B('Recap — a bitmap image is a grid of pixels; at 1-bit colour depth each pixel is either ON or OFF. Since 4 bits = 1 hex digit, each hex digit tells you the on/off pattern for 4 pixels in one go. (📖 See "Bitmap & Colour Depth" in the Codex for the full write-up.)',
        '复习一下: 位图 (bitmap) 图像是像素网格; 1 bit 色深下, 每个像素要么开(亮)要么关(暗)。因为 4 bit = 1 位十六进制, 每位十六进制数字一次就能告诉你 4 个像素的开关状态。(📖 完整讲解见图鉴里的「Bitmap & Colour Depth」条目。)'),
      B('Apply it here: one hex digit = 4 bits. Split 0x42 in half: <b>4</b>=0100, <b>2</b>=0010 → the full row is 0100 0010 (1=lit, 0=dark, read left to right). Quick table: 0=0000 2=0010 4=0100 7=0111 C=1100 E=1110 F=1111 — e.g. 0x7E = 0111 1110 → the middle 6 cells light up, both ends stay dark.',
        '用到这题上: 一位十六进制 = 4 个比特。0x42 拆成两半: <b>4</b>=0100, <b>2</b>=0010 → 整行是 0100 0010(1 亮 0 灭, 从左往右数)。速查: 0=0000 2=0010 4=0100 7=0111 C=1100 E=1110 F=1111——比如 0x7E = 0111 1110 → 中间 6 格全亮, 两头灭。'),
      B('Answer (cells to light, counting from 1): 0x42→2,7 · 0x7E→2-7 · 0xE7→1,2,3,6,7,8 · 0x24→3,6. Leave any row that\'s already correct alone.',
        '答案(每行该亮的格, 从 1 数): 0x42→2,7 · 0x7E→2~7 · 0xE7→1,2,3,6,7,8 · 0x24→3,6。已亮对的行别动。')
    ]);
    mk(mk(wrap,'div','margin-top:8px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }

  /* ---- 完成的《猫》: 两帧动画, 会喵 ---- */
  header(wrap,tx('Exhibit #01 · "Cat" (restored)','展品 #01 · 《猫》(已修复)'),tx('It\'s alive now','它活了'));
  var stage=mk(wrap,'div','display:flex;align-items:flex-end;gap:14px;margin:6px 0 10px;');
  var artBox=mk(stage,'div','');
  var meow=mk(stage,'div','color:#ffce3a;font-size:15px;min-width:48px;opacity:0;transition:opacity .2s;',tx('"Meow"','「喵」'));
  var frame=0;
  drawMonoArt(artBox,CAT,16);
  var tm=setInterval(function(){
    if(!document.body.contains(artBox)){clearInterval(tm);return;}
    frame++;
    drawMonoArt(artBox,(frame%5===4)?CAT_BLINK:CAT,16);
    meow.style.opacity=(frame%5===4)?1:0;
  },600);

  /* ---- 阶段 B: 《像素花》(2-bit 色深) ---- */
  if(!flowerDone){
    mk(wrap,'div','margin-top:4px;',
      tx('Now that the cat is awake, the next frame over has started coughing. This one\'s <span style="'+K+'">2-bit colour depth</span>: '+
         '2 bits per pixel, <b>4 colours</b> — 1 bit can only switch on or off, but 2 bits gets you a palette.<br>'+
         '<span style="'+DIM+'">Pick a colour from the palette first, then click a cell to paint it. 6 pixels × 2 bits per row = 12 bits = 3 hex digits.</span>',
         '猫醒了之后, 隔壁画框也开始咳嗽。这幅是<span style="'+K+'">2 位色深</span>: '+
         '每像素 2 个比特, <b>4 种颜色</b>——1 bit 只能开关, 2 bit 就有调色板了。<br>'+
         '<span style="'+DIM+'">先点调色板选色, 再点格子上色。每行 6 像素 ×2bit = 12 bit = 3 位十六进制。</span>'));
    var saved2=FLAG(api,'dt_pixel2_grid');
    var g2=(saved2&&saved2.length===6)?saved2.map(function(v){return decode2bpp(v,FLOWER_W);})
          :FLOWER.map(function(){return [0,0,0,0,0,0];});
    var cur={c:2};
    var palBar=mk(wrap,'div','display:flex;gap:8px;margin:8px 0;');
    var board2=mk(wrap,'div','margin:6px 0;');
    function drawPal(){
      palBar.innerHTML='';
      mk(palBar,'span',DIM+'align-self:center;',tx('Palette (2-bit):','调色板(2bit):'));
      PAL.forEach(function(col,i){
        var b=mk(palBar,'button','width:56px;height:26px;cursor:pointer;font-family:inherit;font-size:11px;'+
          'background:'+col+';color:'+(i===0?'#4a7a4a':'#04140a')+';'+
          'border:'+(cur.c===i?'2px solid #fff':'1px solid #1f3f1f')+';',T(PAL_NAME[i]));
        b.onclick=function(){cur.c=i;S(api,'ui');drawPal();};
      });
    }
    function draw2(){
      board2.innerHTML='';
      g2.forEach(function(rowC,r){
        var ok=encode2bpp(rowC)===FLOWER[r];
        var line=mk(board2,'div','display:flex;align-items:center;gap:10px;margin:2px 0;');
        mk(line,'span','width:58px;font-size:13px;'+(ok?'color:#7CFC00;text-shadow:0 0 6px #4c4;':'color:#ffce3a;'),hex3(FLOWER[r]));
        var cells=mk(line,'div','display:flex;line-height:0;');
        rowC.forEach(function(cv,cI){
          var cell=mk(cells,'button','width:26px;height:26px;padding:0;cursor:pointer;'+
            'border:1px solid #1f3f1f;background:'+PAL[cv]+';'+
            (cv?'box-shadow:0 0 5px '+PAL[cv]+';':''));
          cell.onclick=function(){
            g2[r][cI]=cur.c;S(api,'step');
            SET(api,'dt_pixel2_grid',g2.map(encode2bpp));
            if(encode2bpp(g2[r])===FLOWER[r])S(api,'ok');
            draw2();
            if(pix2Check(g2,FLOWER).ok){
              SET(api,'dt_pixel2_done');S(api,'quest');
              TOAST(api,B('The flower blooms. Four colours, two bits — somewhere the curator announces: "This exhibit\'s colour depth: 2 bits. Heart rate: +1 beat."',
                          '花开了。四种颜色, 两比特——馆长在远处报: 「本展品色深 2 bit, 心动 1 次」。'),true);
              renderPixel(el,api);
            }
          };
        });
        mk(line,'span','font-size:14px;'+(ok?'color:#7CFC00;':'color:#333;'),ok?'✓':'…');
      });
    }
    drawPal();draw2();
    addHints(wrap,'dt_pixel',[
      B('Recap — colour depth is how many bits store one pixel\'s colour. 1 bit = 2 colours (on/off); 2 bits = 2²=4 colours picked from a small palette. More bits per pixel means more colours, but a bigger file. (📖 See "Bitmap & Colour Depth" in the Codex for the full write-up.)',
        '复习一下: 色深 (colour depth) 是存一个像素颜色要用几个 bit。1 bit = 2 种颜色(开/关); 2 bit = 2²=4 种颜色, 从一个小调色板里选。每像素位数越多, 颜色越多, 文件也越大。(📖 完整讲解见图鉴里的「Bitmap & Colour Depth」条目。)'),
      B('Apply it here: now 1 pixel = <b>2 bits</b>: 00 black · 01 green · 10 red · 11 yellow. A row of 6 pixels makes 12 bits, folded into 3 hex digits. E.g. 0x2F8 → 0010 1111 1000 → slice into pairs: 00,10,11,11,10,00 → black red yellow yellow red black. Translate every row the same way.',
        '用到这题上: 现在 1 像素 = <b>2 bit</b>: 00 黑 · 01 绿 · 10 红 · 11 黄。一行 6 像素拼成 12 bit, 再折成 3 位十六进制。比如 0x2F8 → 0010 1111 1000 → 按两位切: 00,10,11,11,10,00 → 黑 红 黄 黄 红 黑。照这样把每行翻译出来。'),
      B('Answer: rows 1/4 = black black red red black black; rows 2/3 = black red yellow yellow red black; row 5 = black black green green black black; row 6 = black green green green green black. It\'s a flower.',
        '答案: 第1/4行 黑黑红红黑黑; 第2/3行 黑红黄黄红黑; 第5行 黑黑绿绿黑黑; 第6行 黑绿绿绿绿黑。是一朵花。')
    ]);
    mk(mk(wrap,'div','margin-top:8px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }

  /* ---- 阶段 C: 双画完成 + 挑战★(逆向) ---- */
  mk(wrap,'div','',
    tx('"Cat" is dozing. "Pixel Flower" is slowly blooming. A new line of small print has appeared on the back of the restoration card:<br>'+
       '<span style="'+DIM+'">"A bitmap only ever hides two secrets: how many cells (resolution), and how many bits per cell (colour depth). Everything else is art."</span>',
       '《猫》在打盹, 《像素花》在慢慢开。修复卡片背面多了一行小字:<br>'+
       '<span style="'+DIM+'">"位图的秘密只有两个: 有多少格(分辨率), 每格几比特(色深)。其余都是艺术。"</span>'));
  if(!FLAG(api,'data_challenge_1')){
    var chBtn=mk(mk(wrap,'div','margin-top:10px;'),'button',STAR,tx('★ Challenge: Reverse-ID the "Invader"','★ 挑战: 《入侵者》逆向鉴定'));
    chBtn.onclick=function(){
      wrap.innerHTML='';
      header(wrap,tx('★ Challenge · "Invader"','★ 挑战 · 《入侵者》'),tx('Reverse: painting → hex','逆向: 画 → 十六进制'));
      mk(wrap,'div','',
        tx('An unlabelled painting turned up in storage; the registry wants the <span style="'+K+'">hex source</span> for every row filled in. '+
           'This time it\'s reversed: look at the picture, write the bytes. <span style="'+DIM+'">(3C, 0x3c, etc. all accepted)</span>',
           '仓库里翻出一幅无名画, 登记册要求填写每行的<span style="'+K+'">十六进制底稿</span>。'+
           '这次反过来: 看画, 写字节。<span style="'+DIM+'">(接受 3C / 0x3c 等写法)</span>'));
      var row=mk(wrap,'div','display:flex;gap:18px;margin:10px 0;align-items:flex-start;');
      var art=mk(row,'div','');drawMonoArt(art,INVADER,18);
      var form=mk(row,'div','');
      var inputs=[],marks=[];
      INVADER.forEach(function(byte,r){
        var line=mk(form,'div','display:flex;align-items:center;gap:8px;margin:3px 0;');
        mk(line,'span',DIM,tx('Row '+(r+1),'第'+(r+1)+'行'));
        var inp=mk(line,'input','width:64px;background:#050d05;color:#bfeebf;border:1px solid #2f6f2f;'+
          'font-family:inherit;font-size:13px;padding:3px 6px;');
        var mark=mk(line,'span','font-size:14px;color:#333;','…');
        inputs.push(inp);marks.push(mark);
        inp.oninput=function(){
          var ok=hexInputOk(inp.value,byte);
          mark.textContent=ok?'✓':'…';
          mark.style.color=ok?'#7CFC00':'#333';
          if(ok){
            S(api,'step');
            var all=INVADER.every(function(bt,i){return hexInputOk(inputs[i].value,bt);});
            if(all){
              SET(api,'data_challenge_1');S(api,'quest');
              TOAST(api,B('★ Identification complete! The registry gets stamped: "Handled by someone who understands both paintings and bytes."',
                          '★ 鉴定完成! 登记册盖章: 「经手人懂画, 也懂字节。」'),true);
              renderPixel(el,api);
            }
          }
        };
      });
      addHints(wrap,'dt_pixel',[
        B('Recap — going from picture to hex is bitmap decoding in reverse: read each row\'s pixels as bits (lit=1, dark=0) left to right, then fold every 4 bits into one hex digit. (📖 See "Bitmap & Colour Depth" in the Codex.)',
          '复习一下: 从画反推十六进制, 就是把位图解码反过来做: 把每行像素从左到右读成比特(亮=1 灭=0), 再把每 4 位折成一位十六进制。(📖 见图鉴里的「Bitmap & Colour Depth」条目。)'),
        B('Apply it here: write each row\'s 8 cells as binary, split into a first group of 4 bits and a second group of 4, then convert each group to one hex digit separately. E.g. 0001 1000 → 1 and 8 → 0x18.',
          '用到这题上: 把每行 8 格写成二进制, 分成前 4 位一组、后 4 位一组, 每组分别换成一位十六进制。比如 0001 1000 → 1 和 8 → 0x18。'),
        B('Row 1 lights cells 4 and 5 → 0001 1000 → 0x18. Work the rest the same way, row by row — don\'t skip any.',
          '第1行亮第4、5格 → 0001 1000 → 0x18。剩下的按同样办法一行一行来, 别跳行。')
      ]);
      mk(mk(wrap,'div','margin-top:8px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    };
  }else{
    mk(wrap,'div','margin-top:8px;color:#ffce3a;',tx('★ Challenge cleared — the registry bears your stamp.','★ 挑战已通过 —— 登记册上有你的章。'));
  }
  mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
}

/* ---------------- 3. 谜题 2 · ASCII 密信 (§1.2) ---------------- */
var LETTER_CODES=asciiEncode(LETTER);
function asciiTable(parent){
  var h='<div style="font-size:11px;color:#4a7a4a;line-height:1.9;border:1px dashed #1f3f1f;padding:6px 10px;margin:8px 0;">'+
    '<b style="color:#9fee9f;">'+tx('ASCII lookup table (comes with the case — only prints what you\'ll need)','ASCII 对照表(展柜附赠, 只印了用得上的)')+'</b><br>';
  for(var c=65;c<=90;c++){h+=String.fromCharCode(c)+'='+c+(c===77?'<br>':'　');}
  h+='<br>';
  for(var d=48;d<=57;d++){h+=String.fromCharCode(d)+'='+d+'　';}
  h+='<br>'+tx('space=32','空格=32')+'　.=46　-=45</div>';
  mk(parent,'div','',h);
}

function renderAscii(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:480px;max-width:660px;'+TXT);

  if(!FLAG(api,'dt_pixel_done')){
    header(wrap,tx('Display Case #02 · Covered','展柜 #02 · 蒙着布'),tx('Do not disturb','请勿翻动'));
    mk(wrap,'div','',
      tx('The case is covered by a dust sheet, pinned with a note from the curator:<br>'+
         '<span style="'+K+'">"Fix the cat first. It keeps staring at me, and I\'ve lost count of which word I\'m on. (checksum: invalid)"</span>',
         '展柜盖着防尘布, 别着馆长的字条:<br>'+
         '<span style="'+K+'">"先修猫。它一直盯着我, 我数不清自己说到第几个字了。(校验和: 失效)"</span>'));
    mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }

  var done=FLAG(api,'dt_ascii_done');

  /* ---- 阶段 A: 译信 ---- */
  if(!done){
    header(wrap,tx('Display Case #02 · The Letter from 1970','展柜 #02 · 1970 年的信'),tx('ASCII · decimal codes','ASCII · 十进制码'));
    mk(wrap,'div','',
      tx('Under the glass lies a transcription of a punched paper tape — every character has oxidised away, leaving only '+
         '<span style="'+K+'">decimal ASCII codes</span>.<br>'+
         '<span style="'+DIM+'">The highlighted cell is the code currently waiting to be decoded; look up the character in the table and type it '+
         'directly. Spaces and punctuation are old enough to surface on their own.</span>',
         '玻璃下压着一页打孔纸带的誊抄件——字符全部氧化脱落, 只剩<span style="'+K+'">十进制 ASCII 码</span>。<br>'+
         '<span style="'+DIM+'">高亮格是当前待译的码, 对照表查出字符, 直接敲键盘。空格和标点年代久了, 会自己浮现。</span>'));
    var prog=FLAG(api,'dt_ascii_prog')||0;      /* 已译对的"需手译"字符数 */
    var typables=[];
    LETTER_CODES.forEach(function(c,i){if(isTypable(c))typables.push(i);});
    var paper=mk(wrap,'div','display:flex;flex-wrap:wrap;gap:4px;margin:10px 0;padding:10px;'+
      'background:#0d0f08;border:1px solid #3a3a20;');
    var inp;
    function draw(){
      paper.innerHTML='';
      var solvedSet={};
      typables.slice(0,prog).forEach(function(i){solvedSet[i]=1;});
      var target=prog<typables.length?typables[prog]:-1;
      LETTER_CODES.forEach(function(code,i){
        var ch=String.fromCharCode(code);
        var cell=mk(paper,'div','display:flex;flex-direction:column;align-items:center;width:24px;');
        var boxCss='width:22px;height:26px;display:flex;align-items:center;justify-content:center;'+
          'font-size:15px;border:1px solid ';
        if(!isTypable(code)){
          mk(cell,'div',boxCss+'#222;color:#4a7a4a;background:#0a0c06;',ch===' '?'␣':ch);
        }else if(solvedSet[i]){
          mk(cell,'div',boxCss+'#2f6f2f;color:#7CFC00;background:#0a1f0a;text-shadow:0 0 5px #4c4;',ch);
        }else if(i===target){
          mk(cell,'div',boxCss+'#ffce3a;color:#ffce3a;background:#241a04;box-shadow:0 0 7px #a80;','?');
        }else{
          mk(cell,'div',boxCss+'#222;color:#333;background:#0a0c06;','·');
        }
        mk(cell,'div','font-size:10px;color:'+(i===target?'#ffce3a':'#4a7a4a')+';margin-top:2px;',code);
      });
    }
    draw();
    asciiTable(wrap);
    var bar=mk(wrap,'div','display:flex;align-items:center;gap:10px;margin-top:4px;');
    mk(bar,'span',DIM,tx('Type the character here →','在这里敲字符 →'));
    inp=mk(bar,'input','width:46px;background:#050d05;color:#7CFC00;border:1px solid #7CFC00;'+
      'font-family:inherit;font-size:16px;text-align:center;padding:3px;');
    var msg=mk(wrap,'div','min-height:18px;font-size:12px;color:#ffce3a;margin-top:4px;');
    inp.onkeydown=function(e){
      if(e.key&&e.key.length===1){
        e.preventDefault();
        if(prog>=typables.length)return;
        var code=LETTER_CODES[typables[prog]];
        if(cellCheck(code,e.key)){
          prog++;SET(api,'dt_ascii_prog',prog);
          S(api,'step');msg.textContent='';
          if(prog>=typables.length){finish();return;}
          draw();
        }else{
          S(api,'err');fail(api,'dt_ascii');
          msg.textContent=tx(
            '✗ '+e.key.toUpperCase()+' encodes to '+e.key.toUpperCase().charCodeAt(0)+', but the tape reads '+code+'. Check the table again.',
            '✗ '+e.key.toUpperCase()+' 的编码是 '+e.key.toUpperCase().charCodeAt(0)+', 但纸带上写的是 '+code+'。再查一次表。'
          );
        }
        inp.value='';
      }
    };
    function finish(){
      SET(api,'dt_ascii_done');S(api,'quest');
      STEP(api,'dt_m2');
      wrap.innerHTML='';
      header(wrap,tx('Display Case #02 · The Letter from 1970','展柜 #02 · 1970 年的信'),tx('Decoded','已破译'));
      var log=mk(wrap,'div',TXT+'min-height:130px;','');
      var lines=[
        tx('> At the end of the punch-tape there is one line in handwritten ink, unencoded, needing no translation:',
           '> 纸带尽头有一行手写的墨水字, 没编码, 不需要破译:'),
        tx('<span style="'+DIM+'">"To whoever is sitting in front of her next —"</span>',
           '<span style="'+DIM+'">"给下一个坐在她面前的人——"</span>'),
        tx('<span style="'+K+'">SHE STILL DREAMS. KEEP HER ON.  — 1970</span>',
           '<span style="'+K+'">SHE STILL DREAMS. KEEP HER ON.  — 1970</span>'),
        tx('<span style="'+DIM+'">Someone underlined "KEEP HER ON" twice. The ink is faded, not the intent.</span>',
           '<span style="'+DIM+'">她还在做梦。别关掉她。—— 一九七零</span>'),
        tx('> …this machine has not been switched off once in twenty years, though no one has come.',
           '> ……这台电脑二十年没人来, 却始终没有关机。'),
        tx('> Now you know whose promise that was. <span class="dim">You are standing inside her dream.</span>',
           '> 现在你知道是谁的承诺了。<span class="dim">你正站在她的梦里。</span>')
      ];
      var i=0;
      (function tick(){
        if(i<lines.length){log.innerHTML+=lines[i++]+'<br>';S(api,i>=lines.length?'quest':'step');setTimeout(tick,750);}
        else{
          TOAST(api,B('◈ Letter decoded — some data doesn\'t rot, because someone keeps reading it.',
                      '◈ 密信译毕 —— 有些数据不会腐烂, 因为有人一直在读它。'),true);
          mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Close the case','合上展柜')).onclick=function(){renderAscii(el,api);};
        }
      })();
    }
    addHints(wrap,'dt_ascii',[
      B('Recap — ASCII gives every English letter, digit, and common punctuation mark its own number from 0-127, one character = one byte. It\'s just a lookup table both directions: number→character, or character→number. (📖 See "ASCII & Unicode" in the Codex for the full write-up.)',
        '复习一下: ASCII 给每个英文字母、数字和常用标点各自分配一个 0~127 的编号, 一个字符 = 一个字节。它就是一张双向对照表: 数字→字符, 或字符→数字都能查。(📖 完整讲解见图鉴里的「ASCII & Unicode」条目。)'),
      B('Apply it here: A=65, and the rest follow alphabetically — B=66, C=67… Take code 83: 83-65=18, count 18 letters past A and you get S. Digits are easier: 0=48, so code 49 is 1. Don\'t memorise the whole table, just add/subtract from A=65 or 0=48.',
        '用到这题上: A=65, 往后按字母顺序排——B=66, C=67……比如码 83: 83-65=18, A 往后数 18 个就是 S。数字更好记: 0=48, 码 49 就是 1。不用背整张表, 从 A=65 或 0=48 加减就行。'),
      B('Full answer: <b>SHE STILL DREAMS. KEEP HER ON. - 1970</b>. Type it in one highlighted cell at a time.',
        '整句答案: <b>SHE STILL DREAMS. KEEP HER ON. - 1970</b>。照着高亮格一个个敲进去。')
    ]);
    mk(mk(wrap,'div','margin-top:8px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }

  /* ---- 阶段 B: 信已译 + 写回信 + 挑战★ ---- */
  header(wrap,tx('Display Case #02 · The Letter from 1970','展柜 #02 · 1970 年的信'),tx('Decoded','已破译'));
  mk(wrap,'div','padding:8px 12px;background:#0d0f08;border:1px solid #3a3a20;',
    '<span style="'+K+'">SHE STILL DREAMS. KEEP HER ON.  — 1970</span><br>'+
    tx('<span style="'+DIM+'">Still dreaming, all these years. Don\'t be the one who switches her off.</span>',
       '<span style="'+DIM+'">她还在做梦。别关掉她。</span>'));

  var reply=FLAG(api,'dt_reply');
  if(!reply){
    mk(wrap,'div','margin-top:10px;',
      tx('A new, empty frame has appeared next to the display case. A note from the curator:<br>'+
         '<span style="'+DIM+'">"Someone from 1970 wrote you a letter. Want to write back? I\'ll encode it in binary and frame it, hang it right next to hers — '+
         '<b>your words become an exhibit too.</b> ASCII only, 24 characters max. (checksum: waived)"</span>',
         '展柜旁多了一个空画框, 馆长的字条:<br>'+
         '<span style="'+DIM+'">"1970 年的人给你写了信。要不要回一句? 我把它编成二进制裱起来, 挂在信旁边——'+
         '<b>你的话也会变成展品。</b>只收 ASCII, 24 字符以内。(校验和: 免检)"</span>'));
    var bar=mk(wrap,'div','display:flex;gap:8px;margin-top:8px;align-items:center;');
    var inp=mk(bar,'input','flex:1;min-width:220px;background:#050d05;color:#bfeebf;border:1px solid #2f6f2f;'+
      'font-family:inherit;font-size:13px;padding:5px 8px;');
    inp.maxLength=24;inp.placeholder='e.g.  SHE IS STILL DREAMING';
    var msg=mk(wrap,'div','min-height:18px;font-size:12px;color:#ffce3a;margin-top:4px;');
    mk(bar,'button',BTN_HOT,tx('✒ Frame it','✒ 装裱')).onclick=function(){
      var v=inp.value;
      if(!replyOk(v)){
        S(api,'err');
        msg.textContent=tx('✗ The curator adjusts his glasses: "That character doesn\'t have one of my 128 chairs. ASCII only seats English letters, digits, and punctuation."',
                            '✗ 馆长扶了扶眼镜: "这个字符不在我的 128 把椅子上。ASCII 只坐得下英文、数字和标点。"');
        return;
      }
      SET(api,'dt_reply',v.trim());S(api,'pickup');
      TOAST(api,B('Your words are encoded into binary and framed. They\'re data now too — and data outlives people.',
                  '你的话被编成二进制, 裱进了画框。它现在也是数据了——而数据, 会活得比人久。'),true);
      renderAscii(el,api);
    };
  }else{
    var plaque=mk(wrap,'div','margin-top:10px;padding:8px 12px;border:1px solid #c9a24a;background:rgba(40,30,5,.3);');
    mk(plaque,'div','color:#ffce3a;font-size:13px;',tx('"'+reply+'" <span style="'+DIM+'">— you, replying today</span>',
      '「'+reply+'」 <span style="'+DIM+'">—— 你, 写在今天</span>'));
    mk(plaque,'div','font-size:10px;color:#4a7a4a;word-break:break-all;line-height:1.8;margin-top:4px;',
      replyToBin(reply).join(' '));
  }

  if(!FLAG(api,'data_challenge_2')){
    var chBtn=mk(mk(wrap,'div','margin-top:10px;'),'button',STAR,tx('★ Challenge: The Byte Bill (Unicode/UTF-8)','★ 挑战: 字节账单 (Unicode/UTF-8)'));
    chBtn.onclick=function(){
      wrap.innerHTML='';
      header(wrap,tx('★ Challenge · The Byte Bill','★ 挑战 · 字节账单'),tx('ASCII vs Unicode (UTF-8)','ASCII vs Unicode(UTF-8)'));
      mk(wrap,'div','',
        tx('The curator is doing an inventory audit: "ASCII — one character, one byte, peace under heaven. Then the Unicode guests arrived, '+
           'and UTF-8 started charging 1 to 4 bytes a head... help me get these three accounts right."',
           '馆长在做库存审计: "ASCII 一字符一字节, 天下太平。后来 Unicode 的客人来了, '+
           'UTF-8 按人头收 1~4 字节……帮我把这三笔账算对。"'));
      var qs=[
        {q:B('① Store "HELLO" as ASCII — how many bytes?','① "HELLO" 存成 ASCII, 占多少字节?'),opts:['4','5','10','40'],a:1,
         why:B('5 characters × 1 byte = 5. Anyone who picked 40 was counting bits (5×8).','5 个字符 ×1 字节 = 5。选 40 的同学在数比特(5×8)。')},
        {q:B('② Store the character 猫 (cat) as UTF-8 — how many bytes?','② "猫" 存成 UTF-8, 占多少字节?'),opts:['1','2','3','4'],a:2,
         why:B('Common CJK characters take 3 bytes in UTF-8 — if you\'re not one of ASCII\'s 128 chairs, you need an extra seat.',
               '常用汉字在 UTF-8 里是 3 字节——不在 ASCII 的 128 把椅子上, 就得加座。')},
        {q:B('③ Store "CAT猫" as UTF-8 — how many bytes total?','③ "CAT猫" 存成 UTF-8, 一共多少字节?'),opts:['4','5','6','7'],a:2,
         why:B('C/A/T are 1 byte each (UTF-8 is backward-compatible with ASCII), 猫 is 3 bytes, total 6.',
               'C/A/T 各 1 字节(UTF-8 向下兼容 ASCII), 猫 3 字节, 共 6。')}
      ];
      var idx=0;
      var box=mk(wrap,'div','margin:10px 0;');
      var msg=mk(wrap,'div','min-height:34px;font-size:12px;color:#ffce3a;');
      function drawQ(){
        box.innerHTML='';
        if(idx>=qs.length){
          SET(api,'data_challenge_2');S(api,'quest');
          TOAST(api,B('★ All accounts correct! The curator: "You\'re hired as honorary auditor. Annual salary: 3 bytes. (checksum: passed)"',
                      '★ 账单全对! 馆长: "聘你当荣誉审计。年薪: 3 字节。(校验和: 通过)"'),true);
          renderAscii(el,api);return;
        }
        var it=qs[idx];
        mk(box,'div','margin-bottom:6px;color:#9fee9f;',T(it.q));
        var bar=mk(box,'div','display:flex;gap:8px;');
        it.opts.forEach(function(o,i){
          mk(bar,'button',BTN,tx(o+' bytes',o+' 字节')).onclick=function(){
            if(i===it.a){S(api,'ok');msg.innerHTML='✓ '+T(it.why);idx++;setTimeout(drawQ,900);}
            else{S(api,'err');fail(api,'dt_ascii');msg.innerHTML=tx('✗ The account doesn\'t add up.','✗ 账对不上。');}
          };
        });
      }
      drawQ();
      addHints(wrap,'dt_ascii',[
        B('Recap — ASCII always spends exactly 1 byte per character. Unicode had to make room for every script on Earth, so UTF-8 (one way of storing Unicode) uses a VARIABLE number of bytes: 1 byte for the original ASCII range, more for everything else. (📖 See "ASCII & Unicode" in the Codex for the full write-up.)',
          '复习一下: ASCII 每个字符恒定花 1 字节。Unicode 要给地球上所有文字腾地方, 所以 UTF-8(存 Unicode 的一种方式)用的是<b>变长</b>字节: 原本 ASCII 范围内 1 字节, 其他的要更多。(📖 完整讲解见图鉴里的「ASCII & Unicode」条目。)'),
        B('Apply it here: ASCII characters (English letters, digits) always cost 1 byte in UTF-8 too (backward compatible); common CJK characters cost 3 bytes. For mixed strings, count each part separately then add.',
          '用到这题上: ASCII 字符(英文字母、数字)在 UTF-8 里也恒花 1 字节(向下兼容); 常用汉字花 3 字节。混合字符串就分开数再相加。'),
        B('Answer: ① 5 ② 3 ③ 6.','答案: ① 5 ② 3 ③ 6。')
      ]);
      mk(mk(wrap,'div','margin-top:8px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    };
  }else{
    mk(wrap,'div','margin-top:8px;color:#ffce3a;',tx('★ Challenge cleared — you\'re this gallery\'s honorary auditor.','★ 挑战已通过 —— 你是本馆荣誉审计。'));
  }
  mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
}

/* ---------------- 4. 谜题 3 · Boss: BCD 大钟 (§1.1) ---------------- */
var GROUPS=[B('H-tens','时十'),B('H-units','时个'),B('M-tens','分十'),B('M-units','分个'),B('S-tens','秒十'),B('S-units','秒个')];

function renderClock(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:500px;max-width:680px;'+TXT);

  if(!FLAG(api,'dt_ascii_done')){
    header(wrap,tx('The Centennial Clock · Stopped','百年大钟 · 停摆'),'BCD-CHRONOS');
    mk(wrap,'div','',
      tx('All six little doors on the clock are locked. A note from the curator is wedged in the crack:<br>'+
         '<span style="'+K+'">"The clock is this gallery\'s centrepiece. Decode the letter before you touch it — I won\'t trust anyone with the time '+
         'who can\'t even read 1970. (checksum: it rhymes)"</span>',
         '大钟的六扇小门全锁着。门缝里塞着馆长的字条:<br>'+
         '<span style="'+K+'">"钟是镇馆之宝, 修它之前先把信译了——连 1970 年都读不懂的人, 我不放心把时间交给他。(校验和: 押韵)"</span>'));
    mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }

  var doneC=FLAG(api,'dt_clock_done');

  /* ---- 已修好: 展示 + 挑战★ ---- */
  if(doneC){
    header(wrap,tx('The Centennial Clock · BCD-CHRONOS','百年大钟 · BCD-CHRONOS'),tx('running','运行中'));
    mk(wrap,'div','',
      tx('Six groups of dials click along, four bits apiece, a decimal heartbeat.<br>'+
         '<span style="'+DIM+'">Plaque: BCD — Binary Coded Decimal. Each decimal digit is encoded separately in 4 bits, so 1010 through 1111 '+
         'are forever illegal: decimal doesn\'t have a tenth finger.</span>',
         '六组拨轮咔嗒咔嗒地走, 每组四个比特, 十进制的心跳。<br>'+
         '<span style="'+DIM+'">铭牌: BCD——Binary Coded Decimal。每个十进制位单独用 4 bit 编码, '+
         '所以 1010~1111 永远非法: 十进制没有第 10 根手指。</span>'));
    if(!FLAG(api,'data_challenge_3')){
      var chBtn=mk(mk(wrap,'div','margin-top:10px;'),'button',STAR,tx('★ Challenge: The Odometer\'s Addition (BCD carry correction)','★ 挑战: 里程计的加法 (BCD 进位修正)'));
      chBtn.onclick=function(){renderBcdAdd(el,api);};
    }else{
      mk(wrap,'div','margin-top:8px;color:#ffce3a;',tx('★ Challenge cleared — the odometer counts again, and the answer is, naturally, 42.','★ 挑战已通过 —— 里程计恢复计数, 答案果然是 42。'));
    }
    mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }

  /* ---- 修钟主体 ---- */
  header(wrap,tx('The Centennial Clock · Stopped','百年大钟 · 停摆'),'BOSS · BCD-CHRONOS');
  mk(wrap,'div','',
    tx('The clock stopped on an afternoon nobody remembers. Inside: <span style="'+K+'">6 groups of 4-bit BCD dials</span> — '+
       'hours-hours:minutes-minutes:seconds-seconds.<br>Dial in the <span style="'+K+'">real, current time</span>, and only then will it agree to run again. '+
       '<span style="'+DIM+'">Each bit-lever carries a weight: 8/4/2/1. Dial out a "number that doesn\'t exist in decimal" like 1010 through 1111, and the clock coughs.</span>',
       '钟停在一个没人记得的下午。内部是 <span style="'+K+'">6 组 4bit 的 BCD 拨轮</span>: 时时:分分:秒秒。<br>'+
       '把<span style="'+K+'">此刻的真实时间</span>拨进去, 它才肯重新走。'+
       '<span style="'+DIM+'">每根比特杆有重量: 8/4/2/1。拨出 1010~1111 这种"十进制里不存在的数字", 钟会咳嗽。</span>'));

  var saved=FLAG(api,'dt_clock_dials');
  var nibs=(saved&&saved.length===6)?saved.map(function(a){return a.slice();})
    :[[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  var watch=mk(wrap,'div','margin:8px 0;color:#ffce3a;font-size:13px;');
  var tw=setInterval(function(){
    if(!document.body.contains(watch)){clearInterval(tw);return;}
    var d=new Date();
    function p(x){return (x<10?'0':'')+x;}
    watch.innerHTML=tx('⌚ The curator\'s pocket watch (he\'s letting you peek): <b>'+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds())+'</b>'+
      ' <span style="'+DIM+'">The second hand waits for no one — dial fast.</span>',
      '⌚ 馆长的怀表(他允许你偷看): <b>'+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds())+'</b>'+
      ' <span style="'+DIM+'">秒针不等人, 拨快点。</span>');
  },500);

  var board=mk(wrap,'div','display:flex;gap:8px;margin:10px 0;align-items:flex-end;');
  var msg=mk(wrap,'div','min-height:34px;font-size:12px;color:#ffce3a;');
  var coughs=[
    B('Clack — cough!! ⚙ (One gear rolls, clattering, to your feet.)','咔——咳!! ⚙ (一枚齿轮骨碌碌滚到你脚边)'),
    B('Cough, cough, cough!!! ⚙⚙ (Two gears. It\'s starting to doubt your sincerity.)','咳咳咳!!! ⚙⚙ (两枚。它开始怀疑你的诚意)'),
    B('Ughhh — ⚙⚙⚙ (The clock spits out a handful of gears and points its pendulum at the plaque: 1010 is not decimal!)',
      '呃啊——⚙⚙⚙ (钟吐出一把齿轮, 用钟摆指了指铭牌: 1010 不是十进制!)')
  ];
  function cough(){
    S(api,'err');jitter(wrap);
    var n=fail(api,'dt_clock');
    msg.textContent='✗ '+T(coughs[Math.min(n-1,coughs.length-1)]);
  }
  function draw(){
    board.innerHTML='';
    nibs.forEach(function(nib,g){
      var col=mk(board,'div','display:flex;flex-direction:column;align-items:center;gap:3px;'+
        'padding:6px;border:1px solid #1f3f1f;background:rgba(10,20,10,.45);');
      mk(col,'div',DIM,T(GROUPS[g]));
      [8,4,2,1].forEach(function(w,bi){
        var on=nib[bi];
        var b=mk(col,'button','width:34px;height:22px;padding:0;cursor:pointer;font-family:inherit;font-size:11px;'+
          (on?'background:#123f12;color:#7CFC00;border:1px solid #7CFC00;box-shadow:0 0 6px #2b6;'
             :'background:#0a1408;color:#3a6a3a;border:1px solid #2f6f2f;'),w+'');
        b.onclick=function(){
          nib[bi]^=1;S(api,'step');
          SET(api,'dt_clock_dials',nibs.map(function(a){return a.slice();}));
          draw();
          if(!nibbleValid(nib))cough();
        };
      });
      var v=nibbleVal(nib),bad=!nibbleValid(nib);
      mk(col,'div','font-size:16px;'+(bad?'color:#ff8080;text-shadow:0 0 6px #a33;':'color:#7CFC00;'),
        bad?'✕':v);
      if(g===1||g===3)mk(board,'div','align-self:center;color:#5a8a5a;font-size:18px;',':');
    });
  }
  draw();

  var foot=mk(wrap,'div','margin-top:6px;display:flex;gap:10px;');
  mk(foot,'button',BTN_HOT,tx('⏰ Wind it','⏰ 上发条')).onclick=function(){
    var d=new Date();
    var r=clockMatch(nibs,{h:d.getHours(),m:d.getMinutes(),s:d.getSeconds()},CLOCK_TOL);
    if(r.ok){
      clearInterval(tw);
      SET(api,'dt_clock_done');S(api,'quest');
      wrap.innerHTML='';
      header(wrap,tx('The Centennial Clock · BCD-CHRONOS','百年大钟 · BCD-CHRONOS'),'WINDING…');
      var log=mk(wrap,'div',TXT+'min-height:140px;','');
      var lines=[
        tx('> The mainspring engages. All six dial groups snap true — 0 through 9, not one illegal lever among them.',
           '> 发条咬合。六组拨轮同时转正——0 到 9, 一根非法的杆都没有。'),
        tx('> The pendulum swings once. Twice. Three times.','> 钟摆荡起第一下。第二下。第三下。'),
        tx('> <span style="'+K+'">Dong — dong — dong —</span>','> <span style="'+K+'">当——　当——　当——</span>'),
        tx('> Every light in the gallery, from the main hall to the deepest storeroom, comes on, row by row.',
           '> 整座美术馆的灯, 从大厅到最深的储藏室, 一排一排亮了起来。'),
        tx('> \'Cat\' opens its eyes. \'Pixel Flower\' blooms fully. The letter from 1970 glows faintly under the lights.',
           '> 《猫》睁开眼。《像素花》满开。1970 年的信在灯下微微发亮。'),
        tx('> <span style="'+K+'">◈ Obtained: Time Crystal</span> — one second, dripped from the pendulum, freezes cold in your palm.',
           '> <span style="'+K+'">◈ 取得「时间水晶」</span> —— 钟摆滴下来的一秒, 冻在了你手心。'),
        tx('<span style="'+DIM+'">The curator stands at the centre of the sea of light, quietly counting something. Probably the lights. Possibly these twenty years.</span>',
           '<span style="'+DIM+'">馆长站在灯海中央, 小声数着什么。大概是灯。也可能是这二十年。</span>')
      ];
      var i=0;
      playBell();
      (function tick(){
        if(i<lines.length){log.innerHTML+=lines[i++]+'<br>';S(api,i>=lines.length?'quest':'step');setTimeout(tick,700);}
        else{
          GIVE(api,'time_crystal',B('Time Crystal','时间水晶'));
          STEP(api,'dt_m3');
          TOAST(api,B('◈ Obtained key item: Time Crystal — every light in the gallery is lit, and the great clock keeps time.',
                      '◈ 取得关键道具「时间水晶」——全馆灯亮, 大钟报时。'),true);
          mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
        }
      })();
    }else if(r.reason==='invalid'){
      cough();
    }else{
      S(api,'err');var cn=fail(api,'dt_clock');
      var t=r.dialed;
      msg.innerHTML=tx(
        '✗ You dialed the clock to '+t.h+':'+t.m+':'+t.s+' — that\'s '+r.diff+' seconds off from now.'+
          (r.diff>3600?' That\'s an afternoon in a different time zone.':' So close! Watch the pocket watch, dial the seconds a touch ahead of it, then wind.'),
        '✗ 你把钟拨到了 '+t.h+':'+t.m+':'+t.s+'——和现在差了 '+r.diff+' 秒。'+
          (r.diff>3600?'那是另一个时区的下午。':'很接近了! 盯着怀表, 把秒拨到它前面一点再上发条。')
      );
      if(cn===3){
        /* CO-3 失败即内容: 馆长第一次忘了报字符数, 递台阶+送线索(只此一次) */
        S(api,'ui');
        msg.innerHTML+='<br><br><span style="'+DIM+'">'+tx(
          'Curator Parity sets down the pocket watch and, for the first time ever, forgets to announce a character count: "...You know, twenty years ago someone else stood at this exact clock and couldn\'t get it right either. Let me hand you the one trick I gave them: don\'t read the whole time at once. Read ONE digit. Take the tens place of the seconds — is it a 0? Then that whole group of four levers is 0000. One digit at a time, weights 8/4/2/1, never a lever past 9. The clock isn\'t judging you. Judging is my job — and even I\'ve stopped."',
          '馆长放下怀表, 破天荒第一次忘了报字符数: "……跟你说, 二十年前也有人站在这台钟前, 怎么拨都不对。当年告诉他的那句话, 我也给你: 别一次读整个时间。就读一位。比如秒的十位——是 0 吗? 那这一组四根杆就是 0000。一位一位来, 权重 8/4/2/1, 别让任何一根杆过 9。钟不是在评判你。评判是我的活——连我都不干了。"')+'</span>';
      }
    }
  };
  mk(foot,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
  addHints(wrap,'dt_clock',[
    B('Recap — BCD encodes each decimal digit (0-9) separately in its own 4 bits, instead of converting the whole number to pure binary. 4 bits can hold 16 patterns, but BCD only ever uses 10 of them (0000-1001) — 1010 through 1111 don\'t exist in BCD. (📖 See "BCD" in the Codex for the full write-up.)',
      '复习一下: BCD 把每个十进制数字(0~9)各自单独存成 4 bit, 而不是把整个数换算成纯二进制。4 bit 能装 16 种组合, 但 BCD 只用其中 10 种(0000~1001)——1010 到 1111 在 BCD 里根本不存在。(📖 完整讲解见图鉴里的「BCD」条目。)'),
    B('Apply it here: 14:23:07 is just 6 independent digits — 1,4,2,3,0,7 — each dialled separately with its own 4 bits. The 4 levers weigh 8/4/2/1 — add up whichever ones make your digit: 7=4+2+1→0111; 9=8+1→1001. Any combination over 9 (like 8+2=1010) is illegal, and the clock will cough.',
      '用到这题上: 14:23:07 就是 6 个独立数字——1,4,2,3,0,7——每个各自拨出自己的 4 bit。4 根杆的重量是 8/4/2/1, 想拨出几就凑几: 7=4+2+1→0111; 9=8+1→1001。超过 9 的组合(如 8+2=1010)非法, 钟会咳嗽。'),
    B('Check the pocket watch — say it reads 14:23:07 → dial 0001 / 0100 / 0010 / 0011 / 0000 / 0111. The seconds keep moving, so dial about 10 seconds ahead of the watch before you press "Wind it."',
      '看怀表, 比如 14:23:07 → 拨 0001 / 0100 / 0010 / 0011 / 0000 / 0111。秒在走, 拨到怀表往后 10 秒左右再按「上发条」。')
  ]);
}

/* ---- 挑战★: BCD 加法(进位修正) ---- */
function renderBcdAdd(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:480px;max-width:660px;'+TXT);
  header(wrap,tx('★ Challenge · The Odometer\'s Addition','★ 挑战 · 里程计的加法'),tx('BCD carry correction (+6)','BCD 进位修正 (+6)'));
  var A=27,B2=15,sol=bcdAddSolve(A,B2);
  mk(wrap,'div','',
    tx('The clock\'s fixed, but the <span style="'+K+'">visitor-count odometer</span> at its base is still misbehaving. It\'s BCD, but wired to an ordinary binary adder:<br>'+
       '<span style="'+DIM+'">'+A+' + '+B2+' → 0010 0111 + 0001 0101 — the low 4 bits add up to <b style="color:#ff8080;">1100</b> (12), an illegal digit in BCD. '+
       'The machine is stuck.</span>',
       '钟修好了, 但底座的<span style="'+K+'">参观人数里程计</span>还在犯浑。它是 BCD 的, 却用普通二进制加法器:<br>'+
       '<span style="'+DIM+'">'+A+' + '+B2+' → 0010 0111 + 0001 0101, 低 4 位加出了 <b style="color:#ff8080;">1100</b> (12)——'+
       'BCD 里的非法数字。机器卡住了。</span>'));
  var q1=mk(wrap,'div','margin:10px 0;');
  mk(q1,'div','color:#9fee9f;margin-bottom:5px;',tx('① When the low 4 bits are illegal, how much should the BCD adder add to correct it?','① 低 4 位非法时, BCD 加法器该补加多少来修正?'));
  var bar=mk(q1,'div','display:flex;gap:8px;');
  var msg=mk(wrap,'div','min-height:34px;font-size:12px;color:#ffce3a;');
  var stage2=mk(wrap,'div','');
  [['+3',false],['+6',true],['+9',false],['+10',false]].forEach(function(o){
    mk(bar,'button',BTN,o[0]+tx(' (i.e. ',' (即 ')+toBin4(parseInt(o[0].slice(1),10))+')').onclick=function(){
      if(o[1]){
        S(api,'ok');
        msg.innerHTML=tx('✓ 4 bits can hold 16 values; decimal only uses 10 — the 6 \'ghost\' values in between must be skipped, so you add +6, which conveniently shoves a carry into the next digit too.',
          '✓ 4 bit 能装 16 个数, 十进制只用 10 个——中间差的 6 个"鬼位"要跳过去, 所以补 +6, 顺便把进位挤给高位。');
        drawStage2();
      }else{S(api,'err');fail(api,'dt_clock');msg.textContent=tx('✗ The odometer clicks once in protest. Think about it: what\'s the gap between 16 and 10?','✗ 里程计咔哒了一下, 表示抗议。想想 16 和 10 差几?');}
    };
  });
  function drawStage2(){
    stage2.innerHTML='';
    mk(stage2,'div','color:#9fee9f;margin:8px 0 5px;',tx('② After correction, what\'s the final BCD result (8 bits) of '+A+'+'+B2+'?','② 修正之后, '+A+'+'+B2+' 的最终 BCD 结果(8 bit)是?'));
    var line=mk(stage2,'div','display:flex;gap:8px;align-items:center;');
    var inp=mk(line,'input','width:140px;background:#050d05;color:#bfeebf;border:1px solid #2f6f2f;'+
      'font-family:inherit;font-size:13px;padding:4px 8px;');
    inp.placeholder=tx('e.g. 0000 0000','如 0000 0000');
    mk(line,'button',BTN_HOT,tx('Submit','提交')).onclick=function(){
      if(bcdAddCheckAnswer(inp.value,A,B2)){
        SET(api,'data_challenge_3');S(api,'quest');
        TOAST(api,B('★ The odometer rolls over to '+sol.result+' — the answer to life, the universe, and total visitor count. The curator: "(checksum: 42)"',
                    '★ 里程计转到 '+sol.result+'——生命、宇宙以及一切参观人数的答案。馆长: "(校验和: 42)"'),true);
        renderClock(el,api);
      }else{
        S(api,'err');fail(api,'dt_clock');
        msg.textContent=tx('✗ The odometer spits out a void ticket. Hint: '+A+'+'+B2+'='+(A+B2)+', now write each decimal digit as its own 4 bits.',
          '✗ 里程计吐出一张废票。提示: '+A+'+'+B2+'='+(A+B2)+', 再把每个十进制位各自写成 4 bit。');
      }
    };
  }
  addHints(wrap,'dt_clock',[
    B('Recap — BCD only allows digit patterns 0000-1001 (0-9) in every 4-bit group. Plain binary addition doesn\'t know that rule — it happily produces an illegal pattern like 1010-1111 whenever a digit\'s sum exceeds 9. (📖 See "BCD" in the Codex for the full write-up.)',
      '复习一下: BCD 的每个 4 bit 分组只准出现 0000~1001(0~9)的模式。普通二进制加法不认这条规矩——只要某位的和超过 9, 它就会算出 1010~1111 这种非法模式。(📖 完整讲解见图鉴里的「BCD」条目。)'),
    B('Apply it here: the low 4 bits give 7+5=12 (1100) — illegal in BCD. Correction rule: whenever a group exceeds 9, add +6 to make it "skip" the 6 ghost values 1010-1111, carrying 1 into the next digit. 1100+0110 = 1 0010 → low digit 0010, carry 1.',
      '用到这题上: 低 4 位算出 7+5=12(1100)——BCD 里非法。修正法则: 某组 >9 就 <b>+6</b>, 让它"跳过"1010~1111 这 6 个鬼位, 并向高位进 1。1100+0110=1 0010 → 低位 0010, 进位 1。'),
    B('High digit: 2+1+carry 1 = 4 → 0100. Final answer: <b>0100 0010</b> (i.e. decimal 42).',
      '高位: 2+1+进位1 = 4 → 0100。最终答案: <b>0100 0010</b> (即十进制 42)。')
  ]);
  mk(mk(wrap,'div','margin-top:8px;'),'button',BTN,tx('Leave','离开')).onclick=function(){renderClock(el,api);};
}

/* ---------------- 5. 支线谜题 · 采样修复台 (§1.4) ---------------- */
function drawWave(cv,hold){
  try{
    var ctx=cv.getContext('2d'),W=cv.width,H=cv.height;
    ctx.fillStyle='#050d05';ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='#1f3f1f';ctx.beginPath();ctx.moveTo(0,H/2);ctx.lineTo(W,H/2);ctx.stroke();
    var smooth=genHeldSine(W,2.2,W,1),held=genHeldSine(W,2.2,W,hold);
    ctx.strokeStyle='#2f6f2f';ctx.beginPath();
    for(var x=0;x<W;x++){var y=H/2-smooth[x]*H*0.38;x?ctx.lineTo(x,y):ctx.moveTo(x,y);}
    ctx.stroke();
    ctx.strokeStyle='#ffce3a';ctx.beginPath();
    for(var x2=0;x2<W;x2++){var y2=H/2-held[x2]*H*0.38;x2?ctx.lineTo(x2,y2):ctx.moveTo(x2,y2);}
    ctx.stroke();
  }catch(e){}
}

/* ---- 采样/奈奎斯特 纯判定 (J批重做; 供 _test + 修复台共用; 视觉为主) ---- */
var TONE_HZ=20000;                                  // Aria 最高音 ≈ 人耳上限 20 kHz
function nyquistMinRate(maxFreqHz){return 2*maxFreqHz;}          // 留住某频率所需的最低采样率
function rateKeeps(rate,freqHz){return rate>=2*freqHz;}          // 该采样率能否无损捕捉该频率
function waveAnswerOk(rate){return rateKeeps(rate,TONE_HZ);}     // 本题接受条件: 留得住 20 kHz(→ ≥40 kHz)
/* 混叠(走样)频率: 采样率不足时, 高频会"折叠"成一个假的低频。==f 当且仅当被正确捕捉(f<sr/2)。 */
function aliasFreq(freqHz,rate){
  if(rate<=0)return freqHz;
  var m=freqHz%rate;
  return (m>rate/2)?(rate-m):m;
}
function fmtHz(hz){
  if(hz>=1000){var k=hz/1000;return (Math.round(k*10)/10).toString().replace(/\.0$/,'')+' kHz';}
  return hz+' Hz';
}
/* 视觉核心: 画连续波(绿) + 在波上按采样率打点(黄点) + 只靠样点重建的折线(黄) →
   采样率不足时肉眼看见黄线塌成假低频/丢峰(奈奎斯特直观化)。sr=0 只画原始波。 */
function sampleReconstruct(cv,sr){
  try{
    var ctx=cv.getContext('2d'),W=cv.width,H=cv.height;
    ctx.fillStyle='#050d05';ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='#1f3f1f';ctx.beginPath();ctx.moveTo(0,H/2);ctx.lineTo(W,H/2);ctx.stroke();
    var cycles=5, winSec=cycles/TONE_HZ, A=H*0.36;
    // 原始连续声波(绿)
    ctx.strokeStyle='#2f6f2f';ctx.lineWidth=1.6;ctx.beginPath();
    for(var x=0;x<=W;x++){var t=(x/W)*winSec,y=H/2-Math.sin(2*Math.PI*TONE_HZ*t)*A;x?ctx.lineTo(x,y):ctx.moveTo(x,y);}
    ctx.stroke();
    if(!sr)return;
    // 采样点(黄点) + 重建折线(黄)
    var pts=[],k=0,tk;
    for(k=0;(tk=k/sr)<=winSec+1e-12;k++)pts.push([(tk/winSec)*W, H/2-Math.sin(2*Math.PI*TONE_HZ*tk)*A]);
    if(pts.length<2)pts.push([W, H/2-Math.sin(2*Math.PI*TONE_HZ*winSec)*A]);
    ctx.strokeStyle='#ffce3a';ctx.lineWidth=1.6;ctx.beginPath();
    pts.forEach(function(p,i){i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]);});
    ctx.stroke();
    ctx.fillStyle='#ffe08a';
    pts.forEach(function(p){ctx.beginPath();ctx.arc(p[0],p[1],3,0,7);ctx.fill();});
  }catch(e){}
}

function renderWave(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:480px;max-width:660px;'+TXT);

  if(!FLAG(api,'dt_s1_met')){
    header(wrap,tx('Sampling Restoration Bench','采样修复台'),tx('No work order','无工单'));
    mk(wrap,'div','',
      tx('A dust-covered audio restoration bench; standby text drifts across the screen: '+
         '<span style="'+DIM+'">"No work order. No client. Nobody remembers that sound was ever a thing."</span><br>'+
         '<span style="'+DIM+'">There seems to be a translucent shadow humming in the south-east corner... go ask?</span>',
         '一台落灰的音频修复台, 屏幕上飘着待机字符: <span style="'+DIM+'">"没有工单。没有委托人。没有人记得声音这回事。"</span><br>'+
         '<span style="'+DIM+'">东南角好像有个半透明的影子在哼歌……去问问?</span>'));
    mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }
  if(FLAG(api,'dt_wave_done')){
    header(wrap,tx('Sampling Restoration Bench','采样修复台'),tx('Work Order #001 · Closed','工单 #001 · 已结'));
    mk(wrap,'div','',
      tx('A completed work order is pinned to the screen: <span style="'+K+'">"Songstress Aria · rebuilt from 8,000 Hz to 44,100 Hz."</span><br>'+
         '<span style="'+DIM+'">A line of small print in the remarks column: sample rate = how many times a second she\'s remembered; bit depth = how carefully each time.</span>',
         '屏幕上钉着已完成的工单: <span style="'+K+'">"歌姬 Aria · 由 8 000 Hz 重建至 44 100 Hz。"</span><br>'+
         '<span style="'+DIM+'">备注栏有一行小字: 采样率 = 每秒记住她多少次; 位深 = 每次记得多用心。</span>'));
    mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }

  header(wrap,tx('Sampling Restoration Bench','采样修复台'),tx('Work Order #001 · Songstress Aria','工单 #001 · 歌姬 Aria'));
  mk(wrap,'div','',
    tx('You plug in the <span style="'+K+'">"original recording · 44.1kHz" data block</span> from the recycler\'s log. The bench wants you to choose a rebuild sample rate — but <b>watch the picture, not your ears</b>.<br>'+
       '<span style="'+DIM+'">Green = the real, continuous sound wave. Yellow dots = the snapshots taken at your chosen rate. Yellow line = all the machine can rebuild from those snapshots.</span>',
       '你插入了回收者记录里的<span style="'+K+'">「原始录音 · 44.1kHz」数据块</span>。修复台要你选一个重建采样率——但<b>看图, 别只用耳朵</b>。<br>'+
       '<span style="'+DIM+'">绿线 = 真实连续的声波。黄点 = 按你选的采样率拍下的快照。黄线 = 机器只靠这些快照能重建出的全部。</span>'));
  var cv=mk(wrap,'canvas','display:block;margin:10px 0;border:1px solid #1f3f1f;background:#050d05;');
  cv.width=440;cv.height=130;
  var read=mk(wrap,'div','font-size:12px;color:#bfeebf;margin:2px 0 8px;min-height:34px;line-height:1.6;');
  function refresh(sr){
    sampleReconstruct(cv,sr);
    if(!sr){read.innerHTML=tx('Pick a rate below — the snapshots (dots) and the rebuilt wave (yellow) will update live.','在下面选一个采样率——快照(点)和重建波形(黄线)会实时更新。');return;}
    var keep=Math.floor(sr/2),okTop=rateKeeps(sr,TONE_HZ);
    read.innerHTML=tx('At <b>'+fmtHz(sr)+'</b> you keep only frequencies up to <b>'+fmtHz(keep)+'</b> (half the rate). Aria\'s top note ≈ 20 kHz — '+
        (okTop?'<span style="color:#7CFC00">kept ✓</span>':'<span style="color:#ff8a5a">lost ✗ — see the yellow wave fold into a fake slow note? that\'s aliasing</span>')+'.',
      '在 <b>'+fmtHz(sr)+'</b> 下, 你最高只能留住 <b>'+fmtHz(keep)+'</b> 的频率(采样率的一半)。Aria 的最高音 ≈ 20 kHz —— '+
        (okTop?'<span style="color:#7CFC00">留住了 ✓</span>':'<span style="color:#ff8a5a">丢了 ✗ —— 看黄线塌成了一个假的慢音? 这就是"走样"(混叠)</span>')+'。');
  }
  refresh(0);
  var ab=mk(wrap,'div','display:flex;gap:10px;margin:2px 0 8px;align-items:center;flex-wrap:wrap;');
  mk(ab,'button',BTN,tx('▶ 8 kHz','▶ 8 kHz')).onclick=function(){S(api,'ui');playTone(8000);};
  mk(ab,'button',BTN,tx('▶ 44.1 kHz','▶ 44.1 kHz')).onclick=function(){S(api,'ui');playTone(44100);};
  mk(ab,'span','font-size:11px;'+DIM,tx('(audio is only a hint — same tune, just muffled. Trust the picture.)','(音频只是佐证——同一段旋律, 只是发闷。以图为准。)'));

  mk(wrap,'div','',tx('The recording holds sound up to <b>20 kHz</b> (the top of human hearing). Pick the <b>lowest</b> rebuild rate that still keeps <b>all</b> of it, then press Rebuild:',
                      '这段录音含有最高 <b>20 kHz</b> 的声音(人耳上限)。选出仍能留住<b>全部</b>内容的<b>最低</b>重建采样率, 然后按「重建」:'));
  var pick={v:0};
  var bar=mk(wrap,'div','display:flex;gap:8px;margin:8px 0;');
  var msg=mk(wrap,'div','min-height:34px;font-size:12px;color:#ffce3a;line-height:1.6;');
  [[8000,'8 kHz'],[16000,'16 kHz'],[44100,'44.1 kHz']].forEach(function(o){
    var b=mk(bar,'button',BTN,o[1]);
    b.onclick=function(){
      pick.v=o[0];S(api,'ui');refresh(o[0]);
      Array.prototype.forEach.call(bar.children,function(x){x.style.cssText=BTN;});
      b.style.cssText=BTN_HOT;
    };
  });
  var foot=mk(wrap,'div','margin-top:4px;display:flex;gap:10px;');
  mk(foot,'button',BTN_HOT,tx('⟳ Rebuild','⟳ 重 建')).onclick=function(){
    if(!pick.v){S(api,'err');msg.textContent=tx('✗ Pick a sample rate first — and watch what it does to the yellow wave.','✗ 先选一个采样率——并看看它把黄线变成了什么样。');return;}
    if(!waveAnswerOk(pick.v)){
      S(api,'err');fail(api,'dt_wave');playTone(pick.v);refresh(pick.v);
      msg.innerHTML=(pick.v===8000)
        ? tx('✗ 8 kHz keeps only up to 4 kHz. Look: the 20 kHz note has collapsed into a fake slow wobble — she still sings through a fan.',
             '✗ 8 kHz 只留得住 4 kHz 以下。看: 那个 20 kHz 的音塌成了一条假的慢波——她还是像隔着电风扇唱歌。')
        : tx('✗ 16 kHz keeps only up to 8 kHz — better, but 20 kHz still folds into a fake low note (watch the yellow line). You need at least <b>2 × 20 kHz = 40 kHz</b>.',
             '✗ 16 kHz 只留得住 8 kHz 以下——好一点, 但 20 kHz 还是塌成了假低音(看黄线)。你至少需要 <b>2 × 20 kHz = 40 kHz</b>。');
      return;
    }
    {
      SET(api,'dt_wave_done');S(api,'quest');
      STEP(api,'dt_s2');playTone(44100);
      wrap.innerHTML='';
      header(wrap,tx('Sampling Restoration Bench','采样修复台'),'REBUILDING…');
      var log=mk(wrap,'div',TXT+'min-height:110px;','');
      var lines=[
        tx('> Resampling, segment by segment: 8,000 → 44,100 samples/sec.','> 逐段重采样: 8 000 → 44 100 samples/sec。'),
        tx('> The stair-steps smooth away. The broken high frequencies are spliced back, one by one.',
           '> 台阶被磨平。断掉的高频, 一根一根接了回去。'),
        tx('> <span style="'+K+'">The waveforms align. She and her own self, from the recording studio of 1970, share the same frame for the first time.</span>',
           '> <span style="'+K+'">波形重合。她和 1970 年录音棚里的自己, 第一次同框。</span>'),
        tx('<span style="'+DIM+'">The bench prints a note on the work order: sample rate = how many times a second she\'s remembered. Go find her — she owes you a song.</span>',
           '<span style="'+DIM+'">修复台打印工单备注: 采样率 = 每秒记住她多少次。回去找她吧, 她欠你一首歌。</span>')
      ];
      var i=0;
      (function tick(){
        if(i<lines.length){log.innerHTML+=lines[i++]+'<br>';S(api,'step');setTimeout(tick,700);}
        else{
          TOAST(api,B('◈ Rebuild complete — go find Aria, she owes you a song.','◈ 重建完成 —— 回去找 Aria, 她欠你一首歌。'),true);
          mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
        }
      })();
    }
  };
  mk(foot,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
  addHints(wrap,'dt_wave',[
    B('Look at the yellow wave as you switch rates. When the dots are too far apart, the yellow line can\'t follow the green wiggles — it "folds" into a slower, wrong wave. That folding is why a too-low rate loses the high notes (it doesn\'t mute them — it turns them into fake low notes). (📖 See "Sampling Rate" in the Codex.)',
      '切换采样率时盯着黄线看。点隔得太远时, 黄线跟不上绿波的抖动——它会"折叠"成一条更慢的、错误的波。这个折叠就是采样率太低会丢高音的原因(不是变小声, 而是变成假的低音)。(📖 详见图鉴「Sampling Rate」。)'),
    B('The rule (Nyquist): to keep a frequency, snapshot at least <b>twice</b> as fast. This recording holds up to 20 kHz, so the minimum safe rate is 2 × 20 kHz = <b>40 kHz</b>. Which offered rate is the lowest one that clears 40 kHz?',
      '法则(奈奎斯特): 要留住某频率, 采样至少要快<b>两倍</b>。这段录音含到 20 kHz, 所以安全的最低采样率是 2 × 20 kHz = <b>40 kHz</b>。给的选项里, 哪个是"刚好超过 40 kHz"的最低那个?'),
    B('Answer: <b>44.1 kHz</b> — the lowest offered rate above 40 kHz (and, not by coincidence, the sample rate of CD audio). 8k and 16k both fall short, so their high notes alias.',
      '答案: <b>44.1 kHz</b>——选项里唯一超过 40 kHz 的最低采样率(也正是 CD 音质的采样率, 并非巧合)。8k 和 16k 都不够, 高音会走样。')
  ]);
}

/* ---------------- 6. NPC 对话 ---------------- */
/* 馆长·帕里蒂 (Curator Parity): 强迫症校验 daemon。每句话末尾报本句字符数; 数错会重说。 */
function curatorDialog(api){
  var SP=B('Curator Parity','馆长·帕里蒂');
  var nodes;

  /* 首次见面: 含"校验失败重说"的招牌演出 */
  if(!FLAG(api,'dt_met_curator')){
    var l0en='Welcome to the Hall of Data Representation. Three exhibits, all corrupted; one curator, that\'s me.';
    var l0zh='欢迎光临数据表示馆。本馆藏品三件, 全部损坏; 馆长一名, 就是我。';
    var l1en='<span class="k">I am a checksum daemon. Every sentence I speak, I append its character count — unverified data might as well not have been said.</span>';
    var l1zh='<span class="k">我是校验 daemon。我说的每一句话, 末尾都会报本句字数——数据不校验, 说了等于没说。</span>';
    nodes=[
      {sp:SP,t:cc(l0en,l0zh,
        '<span class="dim">(A daemon in a sharply pressed suit is dusting the empty air with a feather duster — three hundred times, same angle every time.)</span><br>',
        '<span class="dim">(一个西装笔挺的 daemon 正拿着鸡毛掸子, 对空气除尘——三百次, 每次角度相同)</span><br>')},
      {sp:SP,t:ccWrong(l1en,l1zh)},
      {sp:SP,t:B('<span class="dim">(It suddenly freezes, pixels refreshing row by row.)</span><br>…Checksum failed. That last sentence is <span class="k">void</span>. Restating.',
                 '<span class="dim">(它突然僵住, 像素逐行刷新了一遍)</span><br>……校验失败。刚才那句<span class="k">作废</span>, 重说。')},
      {sp:SP,t:cc(l1en,l1zh)},
      {sp:SP,t:cc('Please, visiting process. Save the painting \'Cat\' first — west wall, the hex source is pinned right to the frame. '+
                  'It\'s already missing four rows of pixels, and it stares at me all day; I get so nervous I keep miscounting my own sentences.',
                  '求你了, 外来的进程。先救那幅《猫》——西墙, 十六进制底稿就贴在画框上。它已经缺了四行像素, 每天盯着我, 我一紧张就数错自己的话。'),
       choices:[
        {t:B('I\'ll fix it.','我来修。'),next:5},
        {t:B('Let me look around first.','先逛逛再说。'),next:6}
      ]},
      {sp:SP,t:cc('Wonderful. Remember: one hex digit governs four bits, one byte lights up one row. Fix it, and I\'ll tell you every secret this gallery holds.',
                  '太好了。记住: 一位十六进制管四个比特, 一个字节点亮一行。修完它, 我把整座馆的秘密都讲给你听。'),next:-1},
      {sp:SP,t:cc('Take your time looking around. Exhibits are not to be touched — well, actually you\'ll have to touch all of them, or nothing gets fixed. Forget I said that.',
                  '慢慢逛。展品不许摸——好吧其实全都要摸, 不然修不好。当我没说。',
                  '','',
                 ),next:-1}
    ];
    /* 补上第 7 节点末尾的舞台指示(在末尾追加, 不计入校验和) */
    nodes[6].t=B(nodes[6].t.en+'<br><span class="dim">(It turns back to dusting the empty air, starting again from the three-hundred-and-first time.)</span>',
                 nodes[6].t.zh+'<br><span class="dim">(它回头继续给空气除尘, 从第三百零一次开始)</span>');
    nodes.onEnd=function(){SET(api,'dt_met_curator');};
    return nodes;
  }

  /* 回信装裱后的一次性致谢 */
  if(FLAG(api,'dt_reply')&&!FLAG(api,'dt_reply_ack')){
    var rp=FLAG(api,'dt_reply');
    nodes=[
      {sp:SP,t:cc('Your reply is framed and hanging right next to the one from 1970. '+String(rp).length+' characters, '+String(rp).length+
                  ' bytes — I checksum it every morning before opening, and not one bit ever goes missing.',
                  '你的回信我裱好了, 挂在 1970 年那封的旁边。'+String(rp).length+' 个字符, '+String(rp).length+' 个字节, 我每天开馆前都会校验一遍, 一个比特都不会少。')},
      {sp:SP,t:cc('If someone breaks into this machine fifty years from now, they\'ll read both of your words side by side. That\'s what encoding is for: giving what was once said somewhere to sit.',
                  '五十年后要是再有人闯进这台机器, 会同时读到你们两个人的话。这就是编码的意义: 让说过的话, 有地方坐。'),next:-1}
    ];
    nodes.onEnd=function(){SET(api,'dt_reply_ack');};
    return nodes;
  }

  if(!FLAG(api,'dt_pixel_done')){
    var ccGo=cc('Go, quickly. It just looked at me again.','快去。它刚才又看我了。');
    return [
      {sp:SP,t:cc('\'Cat\' is still missing four rows of pixels. The hex source is on the frame — one hex digit equals four bits, 1 for lit, 0 for dark.',
                  '《猫》还缺四行像素。十六进制底稿在画框上, 一位十六进制 = 四个比特, 1 亮 0 灭。')},
      {sp:SP,t:B(ccGo.en+'<span class="dim">(Those two hollow patches on the canvas really do look like eyes.)</span>',
                 ccGo.zh+'<span class="dim">(画布上那两个空洞确实很像眼睛)</span>'),next:-1}
    ];
  }
  if(!FLAG(api,'dt_ascii_done')){
    nodes=[
      {sp:SP,t:cc('Sixty-four pixels. Not one over, not one short!! Do you know this feeling? You don\'t. This feeling can only be described in a whole number of bytes!',
                  '六十四个像素, 一个不多, 一个不少!! 你知道这种感觉吗? 你不知道。这种感觉要用整数个字节来形容!',
                  '<span class="dim">(It circles the restored \'Cat\' three times, counting the pixels three times — sixty-four, every time.)</span><br>',
                  '<span class="dim">(它围着修好的《猫》转了三圈, 数了三遍像素, 每遍都是 64)</span><br>')},
      {sp:SP,t:cc('Next one, please: east wall display case, the letter from 1970. Every character has oxidised away — only decimal ASCII codes remain. '+
                  'I\'ve printed a lookup table; it\'s pressed right under the glass.',
                  '下一件求你了: 东墙展柜, 1970 年的信。字符全氧化了, 只剩十进制 ASCII 码。对照表我印好了, 就压在玻璃下。')},
      {sp:SP,t:cc('That letter was left by this machine\'s very first owner. I\'ve never read it — a checksum daemon only counts characters, it isn\'t qualified to read meaning. '+
                  'You read it. Tell me how many characters it has, when you\'re done.',
                  '那封信是这台机器的第一任主人留下的。我没读过——校验 daemon 只数字符, 不配读内容。你读吧, 读完告诉我它有多少个字。'),next:-1}
    ];
    return nodes;
  }
  if(!FLAG(api,'dt_clock_done')){
    nodes=[
      {sp:SP,t:cc('The letter\'s translated... thirty-eight characters. I counted. Don\'t ask me what it says — I\'m afraid I\'ll miscount every sentence I speak for the rest of today.',
                  '信译出来了……三十八个字符。我数了。别问我内容, 我怕数错今天剩下的每一句话。')},
      {sp:SP,t:cc('Last is the great clock. Dead centre on the north wall, six groups of BCD dials, hours-hours:minutes-minutes:seconds-seconds. '+
                  'Dial in the real time, right now, and it takes charge of every light in the gallery.',
                  '最后是大钟。北墙正中, 六组 BCD 拨轮, 时时分分秒秒。把此刻的真实时间拨进去, 全馆的灯都归它管。')},
      {sp:SP,t:cc('Careful: each group of four bits may only dial 0 through 9. Dial something like 1010 — a number that doesn\'t exist in decimal — and it coughs, '+
                  'spits gears, thoroughly loses its composure. Here, borrow my watch.',
                  '小心: 每组四个比特只准拨 0 到 9。拨出 1010 那种十进制里不存在的数, 它会咳嗽, 吐齿轮, 非常失态。我的怀表借你看。')},
      {sp:SP,t:B(
        '<span class="dim">(For the first time, it forgets to report a character count. It just looks at the clock for a long moment.)</span><br>'+
        '...That clock counts the one thing I have never dared count myself. <span class="k">Exactly how much time has passed.</span> The plaque says twenty years. I have never verified it. <span class="dim">Some numbers, once you check them, you can\'t go back to not knowing.</span>',
        '<span class="dim">(它第一次忘了报字数, 只是盯着那座钟看了很久。)</span><br>'+
        '……那座钟数的东西, 是我唯一一次都不敢数的。<span class="k">到底过去了多少时间。</span>铭牌上写着二十年。我从没校验过。<span class="dim">有些数字, 一旦核对了, 就再也回不到不知道的时候。</span>'
      ),next:-1}
    ];
    return nodes;
  }

  /* 主线全清: 泄密 + 戳心 (一次性), 之后闲聊 */
  if(!FLAG(api,'dt_curator_final')){
    nodes=[
      {sp:SP,t:cc('Every light is on. I just counted the whole gallery: three exhibits, one reply letter, one clock, sixty-four plus thirty-six pixels, zero errors.',
                  '灯全亮了。我刚才把整座馆数了一遍: 三件展品, 一封回信, 一座钟, 六十四加三十六个像素, 零个错误。')},
      {sp:SP,t:cc('Do you know why I count. Years ago, a batch of paintings came in over the wire, and nobody verified them. One bit flipped, nobody saw it, and the error '+
                  'copied itself quietly through the entire gallery.',
                  '知道我为什么数吗。很多年前有一批画走网线过来, 没人校验。一个比特翻了, 没人看见, 错误安安静静复制了一整馆。',
                  '<span class="dim">(It goes quiet for a few seconds. The next sentence comes half a pitch lower, not much like an announcement.)</span><br>',
                  '<span class="dim">(它安静了几秒。下一句的声音低了半度, 不太像播报)</span><br>')},
      {sp:SP,t:cc('By the time anyone noticed, every single piece had bloomed with corruption. The whole gallery — wiped, rebuilt from scratch. I was written right after '+
                  'that. Line one of the founding protocol: someone must always be counting.',
                  '等发现的时候, 每一幅都花了。整座馆, 删档重建。我就是那之后被写出来的——建馆协议第一行: 永远有人数着。')},
      {sp:SP,t:B('So I was never counting characters. <span class="k">I was counting fear.</span><br><br>'+
                 '<span class="dim">(This sentence, it doesn\'t report a count. Some things don\'t need verifying — said aloud, they\'re already whole.)</span>',
                 '所以我数的从来不是字。<span class="k">我数的是怕。</span><br><br>'+
                 '<span class="dim">(这一句, 它没有报字数。有些话不需要校验, 说出口就是完整的。)</span>'),next:-1}
    ];
    nodes.onEnd=function(){SET(api,'dt_curator_final');};
    return nodes;
  }
  if(!FLAG(api,'dt_s3_done')){
    return [
      {sp:SP,t:cc('Aria, in the south-east corner, is still waiting for someone who understands sound. She used to be the best singer on this whole machine — then '+
                  'backup space ran short, and someone compressed her down to 8kHz.',
                  '东南角的 Aria 还在等一个懂声音的人。她从前是全机器最好的歌手——后来备份空间不够, 有人把她压到了 8kHz。')},
      {sp:SP,t:cc('The original recording still exists; the recycler could never bring itself to reclaim it. Go check the restoration bench. When she sings, I count the beat — I never miscount that.',
                  '原始录音还在, 回收者一直没舍得收。去修复台看看吧。她唱歌的时候, 我数拍子, 从来不数错。'),next:-1}
    ];
  }
  var ccSteps=cc('By the way, you walked a lot of steps around the gallery today. I didn\'t count exactly how many.',
                 '顺带一提, 你今天在馆里走了很多步。具体几步我没数。');
  return [
    {sp:SP,t:cc('Closing time is forever. So is opening time. Come back any time — I\'ll be here, and so will all sixty-four pixels.',
                '闭馆时间是永远, 开馆时间也是。欢迎随时回来, 我和六十四个像素都在。')},
    {sp:SP,t:cc('And if sixty-four pixels ever start to feel small — head south. We have a sister hall, hidden deeper: the Gallery of Lost Fidelity, where they keep everything that compression chose to lose. Tell the docent the museum sent you.',
                '哪天你觉得六十四个像素不够看了——就往南走。我们还有一座藏得更深的姊妹馆: 失真画廊。那里收着压缩「选择丢掉」的一切。跟讲解员说, 是表示馆让你去的。')},
    {sp:SP,t:B(ccSteps.en+'<br><span class="dim">(It\'s lying. It counted.)</span>',
               ccSteps.zh+'<br><span class="dim">(它撒谎了。它数了。)</span>'),next:-1}
  ];
}

/* 采样歌姬 Aria: 只剩 8kHz 的歌手残影。修复前, 台词本身就是"掉采样"的(用 ▓ 模拟丢字)。 */
function ariaDialog(api){
  var SP=B('Songstress Aria','歌姬·Aria');

  if(FLAG(api,'dt_s3_done')){
    return [
      {sp:SP,t:B('<span class="dim">(She\'s humming a very soft melody; the tail of each note rings bright, like new.)</span><br>'+
                 'Now I\'m saving up for a 96kHz dream. The curator calls that hi-res. I call it greedy. '+
                 '<span class="k">But if you\'re going to dream, dream at full sample rate.</span>',
                 '<span class="dim">(她在哼一段很轻的旋律, 尾音亮得像新的)</span><br>'+
                 '现在我在攒一个 96kHz 的梦。馆长说那叫 hi-res, 我说那叫贪心。<span class="k">但做梦嘛, 就要做全采样的。</span>'),next:-1}
    ];
  }

  if(FLAG(api,'dt_wave_done')){
    var nodes=[
      {sp:SP,t:B('<span class="dim">(The ghost isn\'t a ghost anymore. Her outline is sharp enough to see individual strands of hair; every word in her voice is full.)</span><br>'+
                 '…Listen. I\'m not <span class="k">dropping syllables</span> anymore. Forty-four thousand, one hundred times a second — turns out I had this much in me all along.',
                 '<span class="dim">(残影不再是残影了。她的轮廓清晰得能看见发丝, 声音里每一个字都是满的)</span><br>'+
                 '……你听。我说话<span class="k">不漏字</span>了。四万四千一百次每秒——原来我一直有这么多。')},
      {sp:SP,t:B('I used to only be remembered eight thousand times a second. Wherever that wasn\'t enough, the world sang the rest in silence for me.<br>'+
                 '<span class="k">The high notes went first. At the chorus, I\'d open my mouth, and what came out was air.</span>',
                 '以前我每秒只被记得八千次。不够的地方, 世界就拿沉默替我唱。<br>'+
                 '<span class="k">高音是最先没有的。副歌那里, 我张着嘴, 出来的是空气。</span>')},
      {sp:SP,t:B('The reward, as promised. <span class="dim">(She clears her throat — the first time in twenty years that gesture has made a sound.)</span><br>'+
                 'This song is for this machine, and for the one downstairs who wrote the letter. <span class="k">Don\'t switch her off. We\'re both still dreaming.</span>',
                 '说好的报酬。<span class="dim">(她清了清嗓子——二十年来第一次, 这个动作有声音)</span><br>'+
                 '这首歌送这台机器, 也送楼下写信的那个人。<span class="k">别关掉她。我们都还在梦里。</span>')},
      {sp:SP,t:B('<span class="dim">(Halfway through the intro, she smiles at no one in particular.)</span><br>'+
                 'Years ago, a kid used to hum this one while he debugged. Always flat on the third bar. I never corrected him. '+
                 '<span class="k">Off-key is also a way of being remembered.</span>',
                 '<span class="dim">(前奏进行到一半, 她冲着不知哪里笑了一下)</span><br>'+
                 '很多年前, 有个孩子调试的时候总哼这首。第三小节永远是降的。我从来没纠正过他。<span class="k">跑调, 也是一种被记住的方式。</span>')},
      {sp:B('',''),t:B('<span class="dim">(She begins to sing. Not long, but every frequency is present. Even \'Cat\' perks up its two rows of pixel ears.)</span>',
                        '<span class="dim">(她唱了起来。不长, 但每一个频率都在。连《猫》都竖起了两行像素的耳朵。)</span>'),next:-1}
    ];
    nodes.onEnd=function(){
      SET(api,'dt_s3_done');
      STEP(api,'dt_s3');
      playSong();
    };
    return nodes;
  }

  if(FLAG(api,'dt_s1_met')){
    return [
      {sp:SP,t:B('Fou▓nd my ori▓ginal rec▓ording yet? <span class="dim">(She points toward the restoration bench in the south-west corner.)</span><br>'+
                 '<span class="dim">The recycler\'s patrol log menti▓ons where it ended up... that bench▓ knows how to use it.</span>',
                 '找▓到 我▓的 原▓始 录▓音 了 吗? <span class="dim">(她指了指西南角的修复台)</span><br>'+
                 '<span class="dim">回收者的巡视记录里写▓着它的下落……那台修复台▓知道怎么用它。</span>'),next:-1}
    ];
  }

  var first=[
    {sp:B('???','？？？'),t:B('<span class="dim">(A translucent shadow stands in the south-east corner, humming a broken, stuttering song — not forgotten lyrics, just every note missing a piece.)</span><br>'+
              'He▓llo. So▓rry, I ta▓lk like th▓is. Eight th▓ousand times a sec▓ond, the rest of the ti▓me I don\'t ex▓ist.',
              '<span class="dim">(东南角立着一个半透明的影子, 在哼一支断断续续的歌——不是忘词, 是每个音都缺一块)</span><br>'+
              '你▓好。 抱▓歉, 我说▓话 是这▓样的。 每秒▓八千 次, 剩▓下的 时间 我不▓存在。')},
    {sp:SP,t:B('I us▓ed to be a sin▓ger. Then back▓up space ran sh▓ort, and they <span class="k">compre▓ssed me to 8kHz</span>.<br>'+
              'The lo▓w notes are sti▓ll here. <span class="k">The hi▓gh notes... those went fir▓st.</span> At the cho▓rus, I op▓en my mouth, and what com▓es out is ai▓r.',
              '我从▓前 是歌▓手。 后来 备份▓空间 不够, 他们 把我 <span class="k">压到▓了 8kHz</span>。<br>'+
              '低音 还在。 <span class="k">高音▓…… 高音 是最▓先 没有 的。</span> 副歌 那里, 我张▓着嘴, 出来 的 是空▓气。')},
    {sp:SP,t:B('The recy▓cler says my <span class="k">44.1kHz original recor▓ding</span> is still somewhere in this gal▓lery. They never could bring them▓selves to reclaim it.<br>'+
              'Help me fi▓nd it, use the resto▓ration bench to pie▓ce me back toge▓ther. The rew▓ard is a so▓ng. A whole o▓ne.',
              '回收▓者 说, 我的 <span class="k">44.1kHz 原始▓录音</span> 还在 馆里 某个 角落。 它一▓直 没舍▓得 收。<br>'+
              '帮我▓ 找到 它, 用修▓复台 把我 拼回▓来。 报酬 是 一首▓歌。 完整 的。'),choices:[
      {t:B('I\'ll help. Wait for good news.','帮你。等我的好消息。'),next:3,do:function(){SET(api,'dt_s1_met');STEP(api,'dt_s1');}},
      {t:B('(Busy with the main quest for now — I\'ll come back later)','(先忙主线, 回头再来)'),next:4}
    ]},
    {sp:SP,t:B('Tha▓nks. <span class="dim">(She smiles. The smile is stair-stepped too, but you can tell the original must have been lovely.)</span><br>'+
              '<span class="dim">Clue: there\'s a stone tablet in the gallery copying the recycler\'s patrol log — it mentions that recording. The restoration bench is in the south-west corner.</span>',
              '谢▓谢。 <span class="dim">(她笑了。笑容也是台阶状的, 但看得出来, 原版一定很好看)</span><br>'+
              '<span class="dim">线索: 馆里有块石碑抄着回收者的巡视记录, 提到过那盘录音。修复台在西南角。</span>'),next:-1},
    {sp:SP,t:B('<span class="dim">(She nods, and goes back to humming that song with no high notes. Every time it reaches the chorus, only the beat is left.)</span>',
              '<span class="dim">(她点点头, 继续哼那支缺了高音的歌。每到副歌, 就只剩拍子。)</span>'),next:-1}
  ];
  return first;
}

/* ---------------- 7. 室内地图 (24 × 16) ----------------
   #=墙(1) .=地板(0)
   顶部中央 4×2 墙块 = 大钟钟楼; 钟面谜题在其正下方 (12,3)。 */
var ROWS=[
  '########################',  // 0
  '#.........####.........#',  // 1  ← x10..13 钟楼
  '#.........####.........#',  // 2
  '#......................#',  // 3  碑(2,3) 钟面(12,3) 碑(21,3)
  '#......................#',  // 4  馆长(9,4)
  '#..##..............##..#',  // 5  立柱
  '#......................#',  // 6
  '#......................#',  // 7  像素画(3,7) 展柜密信(20,7)
  '#......................#',  // 8
  '#..##..............##..#',  // 9  立柱
  '#......................#',  // 10
  '#......................#',  // 11 修复台(4,11) 歌姬(19,11)
  '#......................#',  // 12
  '#......................#',  // 13 碑(7,13) 出生点(12,13) 碑(17,13)
  '#......................#',  // 14
  '########################'   // 15
];
var TILES=ROWS.map(function(r){return r.split('').map(function(c){return c==='#'?1:0;});});

/* ---------------- 8. 模块定义 ---------------- */
var MOD={
  id:'data',
  title:B('The Hall of Data Representation','数据表示馆'),
  world:'as',
  unlock:{afterQuest:'m3'},   // index.html 第一章末任务实际 id = m3

  interior:{w:24,h:16,tiles:TILES,playerStart:{x:12,y:13}},

  npcs:[
    {id:'dt_curator',name:B('Curator Parity','馆长·帕里蒂'),color:'#e8c15a',body:'#fff0c8',suit:'#8a6a1e',
     x:9,y:4,dialog:curatorDialog},
    {id:'dt_aria',name:B('Songstress Aria','歌姬·Aria'),color:'#7ad8e8',body:'#dff6ff',suit:'#3a7a9a',
     x:19,y:11,dialog:ariaDialog}
  ],

  steles:[
    {x:2,y:3,kind:'stele',codex:['byte'],text:B(
      '<span class="dim">They say somebody once argued for a very long time about why eight bits — not six, not seven — get bundled into one byte. This stone kept the minutes.</span><br><br>'+
      '[GENESIS FRAGMENT · WHY EIGHT BITS MAKE A BYTE]<br>'+
      '"In the beginning, bits wandered without name. The Creator first tried bundling <b>6</b> — enough room for capitals, none left for lowercase; the poets rioted.<br>'+
      'Then tried <b>7</b> — characters finally had seats, but none was left over for \'error\'; the god of transmission refused to sign for the shipment.<br>'+
      'At last, <b>8</b>: two cubed, symmetric, halves cleanly, and a single hand can count it twice over.<br>'+
      'So eight bits were bundled and named a <span class="k">byte</span>. Since then all things are measured in bytes — even forgetting."',
      '<span class="dim">据说当年有人为了「为什么偏偏是八位——不是六位, 不是七位——才捆成一字节」吵了很久。这块碑记下了会议纪要。</span><br><br>'+
      '【创世残页 · 为什么八位一字节】<br>'+
      '"太初, 众比特游荡无名。造物主先试了 <b>6 位</b>一捆——装得下大写, 装不下小写, 诗人暴动;<br>'+
      '又试 <b>7 位</b>——字符够坐了, 可没给「出错」留一个座位, 传输之神拒绝签收;<br>'+
      '最后取 <b>8</b>: 2 的三次方, 对称, 好折半, 一只手正好数两遍。<br>'+
      '于是八位一捆, 称作<span class="k">字节</span>。自此万物以字节计量, 连遗忘也是。"')},
    {x:21,y:3,kind:'stele',codex:['byte','hex-binary'],text:B(
      '<span class="dim">They say one hex digit is called a "nibble" — a small bite. This plaque insists the pun was fully intended.</span><br><br>'+
      '[GALLERY PLAQUE · THE NIBBLE\'S BITE]<br>'+
      '"One hex digit governs exactly 4 bits — properly named a <span class="k">nibble</span>, \'a small bite.\'<br>'+
      'Two nibbles close jaw to jaw and you get one byte: 0x<b>3</b>_ is the upper jaw, 0x_<b>C</b> is the lower.<br>'+
      'So when you see 0x3C, don\'t panic: split it into 0011 and 1100, and chew them one at a time."',
      '<span class="dim">据说一位十六进制字符叫「半字节 (nibble)」——直译「一小口」。这块铭牌坚称这个双关是故意的。</span><br><br>'+
      '【馆藏铭牌 · 半字节之咬】<br>'+
      '"一位十六进制字符, 管辖整整 4 个比特, 学名半字节(nibble)——「一小口」。<br>'+
      '两个 nibble 上下颌一咬合, 便是一字节: 0x<b>3</b>_ 是上颌, 0x_<b>C</b> 是下颌。<br>'+
      '所以看到 0x3C, 不要慌: 拆成 0011 和 1100, 分开嚼。"')},
    {x:17,y:13,kind:'stele',codex:['ascii-unicode'],text:B(
      '<span class="dim">They say the whole alphabet, plus the digits, once fit in a theatre with exactly 128 seats — and never got evicted when the city grew.</span><br><br>'+
      '[GALLERY PLAQUE · ONE HUNDRED AND TWENTY-EIGHT CHAIRS]<br>'+
      '"ASCII is an old theatre with only <span class="k">128 chairs</span>: seat 65 holds A, seat 97 holds a, seat 32 sits empty — that\'s the space, and sitting there is its entire job.<br>'+
      'Then guests poured in from every corner of the world — Chinese characters, kana, emoji... the theatre expanded into <span class="k">the city of Unicode</span>.<br>'+
      'But the old residents kept their original addresses: in UTF-8, the first 128 seats are never charged an extra byte. However large the city grows, it has never evicted a single A."',
      '<span class="dim">据说整套字母加数字, 曾经全塞进一间只有 128 个座位的剧院——后来城市扩建了, 它们也一个都没被赶走。</span><br><br>'+
      '【馆藏铭牌 · 一百二十八把椅子】<br>'+
      '"ASCII 是一座只有 <span class="k">128 把椅子</span>的老剧院: 第 65 号坐着 A, 第 97 号坐着 a, 第 32 号空着——那是空格, 它的工作就是坐在那儿。<br>'+
      '后来客人从四海涌来, 汉字、假名、表情……剧院扩建成 <span class="k">Unicode 之城</span>。<br>'+
      '但老住户保留原门牌: UTF-8 里, 前 128 号一个字节不多收。城再大, 也没赶走过一个 A。"')},
    {x:7,y:13,kind:'stele',codex:['garbage-collection'],text:B(
      '<span class="dim">They say the Recycler never clears away what someone still misses. There is a note here about a recording nobody dares touch.</span><br><br>'+
      '[RECYCLER PATROL LOG #4471]<br>'+
      '"This gallery: 0 items pending collection. Special note: storage block ‘original recording · 44,100 Hz · Aria’, reference count 1 — '+
      '<span class="k">every night an 8kHz ghost comes to listen to it, through the cabinet door, never daring to touch.</span><br>'+
      'Retained indefinitely. A recycler does not clear away what is still missed."',
      '<span class="dim">据说回收者从不清除还有人想念的东西。这里记着一段没人敢碰的录音。</span><br><br>'+
      '【回收者巡视记录 #4471】<br>'+
      '"本馆在册待回收项 0 件。特别备注: 储藏室数据块『原始录音 · 44 100 Hz · Aria』, '+
      '引用计数 1——<span class="k">每晚有个 8kHz 的残影来听它, 隔着柜门, 不敢碰。</span><br>'+
      '予以无限期保留。回收者不清除仍被想念的东西。"')}
  ],

  quests:[
    {id:'data_main',line:'main',title:B('The Hall of Data Representation: Opening Eve','数据表示馆: 开馆前夜'),
     syllabus:'9618 §1.1 数制/BCD · §1.2 字符集 · §1.3 图像',
     desc:B('Every exhibit in the gallery has data-corrupted. The obsessive-compulsive curator asks you: fix the paintings, decode the letter, repair the clock — and bring the lights back on.',
            '美术馆的展品全部数据损坏。强迫症馆长请求你: 修画、译信、修钟, 让灯重新亮起来。'),
     steps:[
       {id:'dt_m1',text:B('Follow the hex source to restore the pixel painting \'Cat\'','照十六进制底稿, 修复像素画《猫》')},
       {id:'dt_m2',text:B('Use the ASCII lookup table to decode the coded letter from 1970','用 ASCII 对照表, 译出 1970 年的密信')},
       {id:'dt_m3',text:B('Dial the real, current time into the BCD clock','把此刻的真实时间拨进 BCD 大钟')}
     ]},
    {id:'data_side',line:'side',title:B('The 8kHz Songstress','8kHz 的歌姬'),
     syllabus:'9618 §1.4 声音表示(采样率/位深)',
     desc:B('The singer\'s ghost in the south-east corner is remembered only eight thousand times a second. Her 44.1kHz original recording is still somewhere in the gallery.',
            '东南角的歌手残影每秒只被记得八千次。她的 44.1kHz 原始录音还在馆里某处。'),
     steps:[
       {id:'dt_s1',text:B('Hear out Songstress Aria\'s request','听听歌姬 Aria 的委托')},
       {id:'dt_s2',text:B('At the sampling restoration bench, use the original recording to rebuild her at 44.1kHz','在采样修复台, 用原始录音把她重建到 44.1kHz')},
       {id:'dt_s3',text:B('Go back to her and hear the whole song','回去找她, 听那首完整的歌')}
     ]}
  ],

  puzzles:[
    {id:'dt_pixel',x:3,y:7,kind:'puzzleStation',title:B('Pixel Painting: "Cat"','像素画《猫》'),
     syllabus:'9618 §1.3 图像: 位图/十六进制/色深',
     codex:['bitmap-colordepth','hex-binary'],
     primer:{title:B('What is a bitmap image?','位图 (bitmap) 图像是什么?'),
       body:B(
         '① A bitmap image is a grid of pixels; each pixel\'s colour is stored as a fixed number of bits — its <b>colour depth</b>. At 1-bit depth, each pixel is simply ON (lit) or OFF (dark).<br>'+
         '<pre>hex 0x42 = 0100 0010\npixels:    ░█░░░░█░   (1=lit ░→█, 0=dark)</pre>'+
         '③ Like a grid of light switches on a wall: flip a switch on, that square lights up; leave it off, it stays dark. A whole row of switches, read as 1s and 0s, IS the picture.<br>'+
         '④ In this puzzle: each row\'s hex byte tells you exactly which pixels should be lit. Convert hex → binary (4 bits per hex digit), then click the cells that should be ON.',
         '① 位图 (bitmap) 图像是一个像素网格; 每个像素的颜色用固定位数存储——它的<b>色深</b> (colour depth)。1 bit 色深下, 每个像素要么开(亮)要么关(暗)。<br>'+
         '<pre>十六进制 0x42 = 0100 0010\n像素:      ░█░░░░█░   (1=亮 ░→█, 0=暗)</pre>'+
         '③ 就像墙上一排灯开关: 按开一个, 那一格就亮; 不按, 就暗着。一整排开关, 读成 1 和 0, 就是这幅画。<br>'+
         '④ 这道题里: 每行的十六进制字节, 就是告诉你哪些像素该亮。把十六进制换成二进制(每位十六进制=4 bit), 再点亮该点的格子。')},
     render:renderPixel,
     onKey:function(e,api){if(e.key==='?'&&hintFns.dt_pixel)hintFns.dt_pixel();}},
    {id:'dt_ascii',x:20,y:7,kind:'puzzleStation',title:B('Display Case · The Letter from 1970','展柜·1970 年的信'),
     syllabus:'9618 §1.2 字符集: ASCII/Unicode',
     codex:['ascii-unicode'],
     primer:{title:B('What is ASCII?','ASCII 是什么?'),
       body:B(
         '① <b>ASCII</b> assigns every English letter, digit and common punctuation mark its own number from 0 to 127, stored in exactly 1 byte per character.<br>'+
         '<pre>A = 65    a = 97    0 = 48    space = 32</pre>'+
         '③ It\'s like a theatre with 128 numbered seats: seat 65 is always "A", seat 32 is always the space. Once you know someone\'s seat number, you know exactly who they are.<br>'+
         '④ In this puzzle: a decoded letter left only its numeric ASCII codes. Look each number up in the table (or work out its offset from A=65 / 0=48) and type the matching character.',
         '① <b>ASCII</b> 给每个英文字母、数字和常用标点分配一个 0~127 的编号, 每个字符固定存 1 字节。<br>'+
         '<pre>A = 65    a = 97    0 = 48    空格 = 32</pre>'+
         '③ 就像一座有 128 个编号座位的剧院: 65 号座位永远坐着"A", 32 号座位永远是空格。只要知道座位号, 就知道坐的是谁。<br>'+
         '④ 这道题里: 一封破译过的信只剩下数字 ASCII 码。查表(或者用 A=65 / 0=48 加减推)找出每个数字对应的字符, 敲出来。')},
     render:renderAscii,
     onKey:function(e,api){if(e.key==='?'&&hintFns.dt_ascii)hintFns.dt_ascii();}},
    {id:'dt_clock',x:12,y:3,kind:'puzzleStation',title:B('The Centennial Clock (Boss)','百年大钟 (Boss)'),
     syllabus:'9618 §1.1 数制: BCD 与非法码/进位修正',
     codex:['bcd'],
     primer:{title:B('What is BCD?','BCD 是什么?'),
       body:B(
         '① <b>BCD (Binary Coded Decimal)</b> stores each decimal digit (0-9) in its OWN separate 4 bits, instead of converting the whole number to pure binary.<br>'+
         '<pre>decimal 47 in BCD:          4→0100   7→0111\ndecimal 47 in pure binary:        101111   (a totally different pattern!)</pre>'+
         '③ Like a car odometer with one dial per digit: each dial only ever shows 0-9 and rolls over independently — it never tries to "think in binary" about the whole number at once.<br>'+
         '④ In this puzzle: dial in the real time, one decimal digit at a time, each as its own 4 bits (weights 8/4/2/1). A pattern above 1001 (9) is illegal and makes the clock cough.',
         '① <b>BCD (Binary Coded Decimal, 二进制编码的十进制)</b> 把每个十进制数字(0~9)各自单独存成 4 bit, 而不是把整个数换算成纯二进制。<br>'+
         '<pre>十进制 47 的 BCD:          4→0100   7→0111\n十进制 47 的纯二进制:            101111   (完全是另一种模式!)</pre>'+
         '③ 就像汽车里程表, 每一位数字一个转盘: 每个转盘只显示 0~9, 各自独立进位——它从不会把整个数当成一个二进制数来"通盘思考"。<br>'+
         '④ 这道题里: 把此刻真实时间一位一位拨进去, 每位各自用 4 bit(权重 8/4/2/1)。超过 1001(9)的模式非法, 会让钟咳嗽。')},
     render:renderClock,
     onKey:function(e,api){if(e.key==='?'&&hintFns.dt_clock)hintFns.dt_clock();}},
    {id:'dt_wave',x:4,y:11,kind:'puzzleStation',title:B('The Sampling Restoration Bench','采样修复台'),
     syllabus:'9618 §1.4 声音: 采样率/位深',
     codex:['sampling-rate'],
     primer:{title:B('What is sample rate? (watch the picture)','采样率是什么?(看图就懂)'),
       body:B(
         '① A real sound wave is smooth and continuous. A computer can\'t store the whole curve — it only takes <b>snapshots</b> at fixed moments. <b>Sample rate</b> = how many snapshots per second (in Hz).<br>'+
         '② Here\'s the catch you\'ll SEE on the screen: if the snapshots are too far apart, a fast wiggle (a high note) slips <i>between</i> two snapshots. The machine, seeing only the dots, connects them into a <b>slower, wrong wave</b>. That fake wave is called <b>aliasing</b> — the high note doesn\'t just get quieter, it turns into the wrong note.<br>'+
         '<pre>fast wave, too few snapshots:   /\\    /\\          the dots the machine sees:  •      •      •\nwhat it rebuilds instead:  \\_____/    ← a slow fake wave (aliasing)</pre>'+
         '③ The rule (Nyquist): to keep a frequency, you must snapshot at least <b>twice</b> as fast as it wiggles. Keep up to 20 kHz → need at least 2 × 20 = 40 kHz.<br>'+
         '④ In this puzzle: pick the lowest rebuild rate whose yellow rebuilt wave still matches the green original everywhere. Too low, and you\'ll watch the high note fold into a fake one.',
         '① 真实的声波是平滑连续的。计算机存不下整条曲线, 只能在固定时刻拍<b>快照</b>。<b>采样率</b> = 每秒拍多少张快照(单位 Hz)。<br>'+
         '② 屏幕上你会亲眼看到的关键: 如果两张快照隔得太远, 一个快速的抖动(高音)就会从两张快照<i>中间溜过去</i>。机器只看得到那几个点, 就把它们连成一条<b>更慢的、错误的波</b>。这条假波叫<b>走样(混叠, aliasing)</b>——高音不是变小声, 而是变成了错误的音。<br>'+
         '<pre>快波, 快照太少:   /\\    /\\          机器看到的点:  •      •      •\n它反而重建成:  \\_____/    ← 一条慢的假波(走样)</pre>'+
         '③ 法则(奈奎斯特): 要留住某个频率, 每秒拍照必须至少是它抖动速度的<b>两倍</b>。要留住 20 kHz → 至少要 2 × 20 = 40 kHz。<br>'+
         '④ 这道题里: 选出黄色重建波仍能处处贴合绿色原始波的<b>最低</b>采样率。太低, 你就会看着高音塌成一个假音。')},
     render:renderWave,
     onKey:function(e,api){if(e.key==='?'&&hintFns.dt_wave)hintFns.dt_wave();}}
  ],

  onEnter:function(api){
    if(!FLAG(api,'dt_entered')){
      SET(api,'dt_entered');
      S(api,'open');
      TOAST(api,B('An art gallery, half its lights lit. The air smells of dusting spray, and of a silence that has been counted many, many times.',
                  '一座美术馆, 灯只亮了一半。空气里有除尘剂的味道, 和被数过很多遍的安静。'),true);
    }
  },

  onQuestComplete:function(qid,api){
    if(qid==='data_main'){
      S(api,'quest');
      TOAST(api,B('◈ Hall of Data Representation · NOW OPEN ◈ The cat is dozing, the letter sits under the lights, the clock chimes on BCD time. The curator counts today once more: zero errors.',
                  '◈ 数据表示馆 · 开馆 ◈ 猫在打盹, 信在灯下, 钟声按 BCD 报时。馆长数了一遍今天: 零个错误。'),true);
    }else if(qid==='data_side'){
      TOAST(api,B('◈ Side quest complete ◈ The chorus is back. Some things get compressed for years and still come out lossless.',
                  '◈ 支线完成 ◈ 副歌回来了。有些东西被压缩了很多年, 也没有失真。'),true);
    }
  },

  /* 纯逻辑判定导出 —— 供 node 单测(引擎请忽略) */
  _test:{
    hexByteToBits:hexByteToBits,bitsToByte:bitsToByte,monoCheck:monoCheck,
    decode2bpp:decode2bpp,encode2bpp:encode2bpp,pix2Check:pix2Check,hexInputOk:hexInputOk,
    CAT:CAT,CAT_START:CAT_START,CAT_BLINK:CAT_BLINK,FLOWER:FLOWER,FLOWER_W:FLOWER_W,INVADER:INVADER,
    LETTER:LETTER,LETTER_CODES:LETTER_CODES,asciiEncode:asciiEncode,asciiDecode:asciiDecode,
    toBin8:toBin8,isTypable:isTypable,cellCheck:cellCheck,replyOk:replyOk,replyToBin:replyToBin,
    utf8ByteLen:utf8ByteLen,
    checksum:checksum,cc:cc,ccWrong:ccWrong,
    nibbleVal:nibbleVal,nibbleValid:nibbleValid,dialsToTime:dialsToTime,
    timeDiffSec:timeDiffSec,clockMatch:clockMatch,CLOCK_TOL:CLOCK_TOL,
    toBin4:toBin4,bcdAddSolve:bcdAddSolve,bcdAddCheckAnswer:bcdAddCheckAnswer,
    genHeldSine:genHeldSine,
    /* J批 采样修复台重做: 奈奎斯特/走样 纯判定 */
    TONE_HZ:TONE_HZ,nyquistMinRate:nyquistMinRate,rateKeeps:rateKeeps,
    waveAnswerOk:waveAnswerOk,aliasFreq:aliasFreq,fmtHz:fmtHz
  }
};

/* ---------------- 7. Codex 知识库条目 (教学层 — 供图鉴/📖按钮调用, 引擎侧待接线) ---------------- */
window.GAME_CODEX=window.GAME_CODEX||[];
window.GAME_CODEX.push(
  {id:'hex-binary',mod:'data',syllabus:'9618 §1.1 数制: 二进制/十六进制换算',
   topic:B('Binary ↔ Hexadecimal Conversion','二进制 ↔ 十六进制 换算'),
   body:B(
     'Definition: hexadecimal (base 16) uses digits 0-9 then A-F (=10-15) to represent numbers compactly. Because 16 = 2⁴, ONE hex digit always maps to exactly FOUR binary bits (a "nibble") — no carrying or borrowing, just split-and-convert.<br>'+
     '<pre>Hex:    3    C\nBinary: 0011 1100</pre>'+
     'To go binary→hex: split the binary into groups of 4 (from the right), convert each group separately. To go hex→binary: convert each hex digit to its own 4 bits and stick them together.<br>'+
     'Exam tip: memorise 0000-1111 = 0-F, or at least be able to derive it fast — hex is just a shorthand for binary, used because raw binary is long and error-prone for humans to read.',
     '定义: 十六进制(hexadecimal, 16 进制)用 0-9 再加 A-F(=10-15)来紧凑地表示数字。因为 16 = 2⁴, <b>一位</b>十六进制数字永远对应<b>四位</b>二进制(称一个"半字节" nibble)——不需要进位借位, 直接拆开对应。<br>'+
     '<pre>十六进制: 3    C\n二进制:   0011 1100</pre>'+
     '二进制→十六进制: 从右往左每 4 位一组, 分别转换。十六进制→二进制: 每位十六进制换成自己的 4 bit, 拼起来。<br>'+
     '考点提示: 背熟 0000~1111 = 0~F, 至少要能快速推出来——十六进制就是二进制的简写, 因为纯二进制太长, 人眼容易读错。'),
   example:B(
     'Convert 0x7E to binary: 7=0111, E=1110 → 0111 1110. Convert 10110010 to hex: split 1011|0010 → B, 2 → 0xB2.',
     '把 0x7E 换成二进制: 7=0111, E=1110 → 0111 1110。把 10110010 换成十六进制: 拆成 1011|0010 → B, 2 → 0xB2。')},

  {id:'byte',mod:'data',syllabus:'9618 §1.1 数制: bit/nibble/byte',
   topic:B('Bit, Nibble, Byte','位 Bit、半字节 Nibble、字节 Byte'),
   body:B(
     'Definition: a bit is a single 0 or 1 — the smallest unit of data. Bits are grouped for convenience:<br>'+
     '• a <b>NIBBLE</b> = 4 bits (exactly one hex digit)<br>• a <b>BYTE</b> = 8 bits = 2 nibbles (the standard unit most computers use to address memory)<br>'+
     '<pre>1 byte = [ nibble ][ nibble ] = 8 bits = 2 hex digits\n           1111     0000</pre>'+
     'A byte can represent 2⁸ = 256 different values (0-255 unsigned).<br>'+
     'Exam tip: know your powers of 2 (2¹=2 up to 2¹⁰=1024) — questions often ask "how many values can N bits represent" (answer: 2ᴺ) or "how many bits needed for M values" (answer: round up log₂M).',
     '定义: 位 (bit) 是一个 0 或 1, 是数据的最小单位。比特按惯例分组:<br>'+
     '• 半字节 (nibble) = 4 bit(正好是一位十六进制数字)<br>• 字节 (byte) = 8 bit = 2 个 nibble(大多数计算机用来编址内存的标准单位)<br>'+
     '<pre>1 字节 = [ nibble ][ nibble ] = 8 bit = 2 位十六进制\n           1111     0000</pre>'+
     '一个字节能表示 2⁸ = 256 个不同的值(无符号 0~255)。<br>'+
     '考点提示: 记熟 2 的幂(2¹=2 一直到 2¹⁰=1024)——题目常问"N 位能表示多少个值"(答案 2ᴺ)或"表示 M 个值要几位"(答案是 log₂M 再向上取整)。'),
   example:B(
     'The byte 0x3C = 0011 1100 in binary = 60 in decimal. Split into nibbles: 0011 (=3) and 1100 (=C).',
     '字节 0x3C = 二进制 0011 1100 = 十进制 60。拆成两个 nibble: 0011(=3) 和 1100(=C)。')},

  {id:'bitmap-colordepth',mod:'data',syllabus:'9618 §1.3 图像: 位图/色深',
   topic:B('Bitmap Images & Colour Depth','位图 Bitmap 与色深 Colour Depth'),
   body:B(
     'Definition: a bitmap image is a grid of pixels, where each pixel\'s colour is stored as a fixed number of bits — the <b>colour depth</b>. 1-bit depth = 2 colours (on/off); 2-bit depth = 2²=4 colours; 8-bit depth = 2⁸=256 colours, and so on.<br>'+
     '<pre>1-bit row (8 px): 0100 0010 → only black/white per pixel\n2-bit row (4 px): 00 10 11 01 → each pair picks 1 of 4 palette colours</pre>'+
     'File size = width × height × colour depth (in bits), then ÷8 for bytes.<br>'+
     'Exam tip: higher colour depth = more realistic colour, but bigger file size — it\'s a direct trade-off, and you\'re expected to calculate storage size from resolution + colour depth.',
     '定义: 位图 (bitmap) 图像是一个像素网格, 每个像素的颜色用固定位数存储——即<b>色深</b> (colour depth)。1 bit 色深 = 2 种颜色(开/关); 2 bit 色深 = 2²=4 种颜色; 8 bit 色深 = 2⁸=256 种颜色, 以此类推。<br>'+
     '<pre>1-bit 一行(8像素): 0100 0010 → 每像素只有黑/白\n2-bit 一行(4像素): 00 10 11 01 → 每两位从 4 色调色板选 1 种</pre>'+
     '文件大小 = 宽 × 高 × 色深(单位 bit), 再 ÷8 换算成字节。<br>'+
     '考点提示: 色深越高, 颜色越逼真, 但文件越大——这是直接的取舍关系, 要会用「分辨率 + 色深」算存储大小。'),
   example:B(
     'An 8×8 image at 1-bit depth stores 64 bits = 8 bytes total. The same image at 2-bit depth needs 128 bits = 16 bytes — double the storage for 4× the colours.',
     '一张 8×8 图像用 1 bit 色深, 共存 64 bit = 8 字节。同一张图用 2 bit 色深, 需要 128 bit = 16 字节——存储翻倍, 换来 4 倍的颜色。')},

  {id:'ascii-unicode',mod:'data',syllabus:'9618 §1.2 字符集: ASCII/Unicode/UTF-8',
   topic:B('ASCII, Unicode & UTF-8','ASCII、Unicode 与 UTF-8'),
   body:B(
     'Definition: ASCII assigns every English letter, digit and common punctuation mark a number from 0-127, stored in exactly 1 byte per character. That\'s only 128 possible characters — not enough for the world\'s other scripts (Chinese, emoji, etc.), so <b>Unicode</b> was created to give every character in every language its own unique number.<br>'+
     '<b>UTF-8</b> is a way of storing Unicode numbers as bytes: characters in the original ASCII range still take just 1 byte (backward compatible), while other characters take 2-4 bytes depending on how large their number is.<br>'+
     'Exam tip: don\'t confuse "Unicode" (the numbering system) with "UTF-8" (one way of encoding those numbers as bytes) — UTF-8 is variable-length, ASCII is fixed-length.',
     '定义: ASCII 给每个英文字母、数字和常用标点分配一个 0~127 的编号, 每个字符固定存 1 字节。这只有 128 个字符——装不下世界上其他文字(汉字、表情符号等), 所以有了 <b>Unicode</b>, 给每种语言的每个字符都分配一个独一无二的编号。<br>'+
     '<b>UTF-8</b> 是把 Unicode 编号存成字节的一种方式: 原本 ASCII 范围内的字符仍然只占 1 字节(向下兼容), 其他字符则按编号大小占 2~4 字节不等。<br>'+
     '考点提示: 别把"Unicode"(编号系统)和"UTF-8"(把编号存成字节的一种方式)搞混——UTF-8 是变长的, ASCII 是定长的。'),
   example:B(
     'The letter "A" is ASCII/Unicode code point 65, stored as 1 byte in both ASCII and UTF-8. The character 猫 (cat) has a Unicode code point outside the ASCII range, so UTF-8 stores it using 3 bytes.',
     '字母 "A" 的 ASCII/Unicode 编号是 65, 在 ASCII 和 UTF-8 里都存成 1 字节。汉字「猫」的 Unicode 编号超出了 ASCII 范围, 所以 UTF-8 要用 3 字节存它。')},

  {id:'bcd',mod:'data',syllabus:'9618 §1.1 数制: BCD',
   topic:B('Binary Coded Decimal (BCD)','二进制编码的十进制 (BCD)'),
   body:B(
     'Definition: BCD stores each DECIMAL digit (0-9) in its own separate 4-bit group, rather than converting the whole number to pure binary. This makes it easy to display decimal digits on hardware (like a clock or calculator) without complex conversion — but it wastes some patterns, since 4 bits can represent 16 values (0000-1111) and BCD only ever uses 10 of them (0000-1001). 1010 through 1111 are illegal in BCD.<br>'+
     '<pre>Decimal 47 in BCD:          4 → 0100, 7 → 0111 → 0100 0111\nDecimal 47 in pure binary: 101111  (totally different pattern!)</pre>'+
     'Exam tip: BCD addition needs a correction — if a 4-bit group\'s result exceeds 9, add 6 (0110) to skip the 6 illegal patterns and carry properly into the next digit.',
     '定义: BCD 把每个<b>十进制</b>数字(0~9)各自单独存成一个 4 bit 分组, 而不是把整个数转换成纯二进制。这样硬件(比如钟表、计算器)显示十进制数字时不需要复杂换算——但会浪费一些编码, 因为 4 bit 能表示 16 个值(0000~1111), BCD 却只用其中 10 个(0000~1001)。1010 到 1111 在 BCD 里是非法的。<br>'+
     '<pre>十进制 47 的 BCD:          4 → 0100, 7 → 0111 → 0100 0111\n十进制 47 的纯二进制:      101111 (完全是另一种模式!)</pre>'+
     '考点提示: BCD 加法需要修正——如果某个 4 bit 分组的结果超过 9, 就要加 6(0110)来跳过那 6 个非法编码, 并正确地向高位进位。'),
   example:B(
     'Decimal 9 + 1 = 10. In pure binary: 1001 + 0001 = 1010 (fine). But in BCD, 9(1001) is a single digit; adding 1 gives 1010, illegal — so add 6: 1010+0110=1 0000, giving digit 0 with a carry of 1 into the tens place → correctly reads "10".',
     '十进制 9 + 1 = 10。纯二进制: 1001 + 0001 = 1010(没问题)。但在 BCD 里, 9(1001)是一个数字; 加 1 得到 1010, 非法——所以加 6: 1010+0110=1 0000, 得到数字 0 并向十位进 1 → 正确读出「10」。')},

  {id:'sampling-rate',mod:'data',syllabus:'9618 §1.4 声音: 采样率/位深',
   topic:B('Sound Sampling: Sample Rate & Bit Depth','声音采样: 采样率与位深'),
   body:B(
     'Definition: a real sound wave is continuous, but computers can only store discrete snapshots ("samples") of it. <b>Sample rate</b> = how many snapshots are taken per second (measured in Hz); <b>bit depth</b> = how many bits are used to store the volume level of each snapshot (more bits = more precise volume steps).<br>'+
     '<pre>Low sample rate:  •   •   •   •      (few snapshots → "staircase" sound, high notes lost)\nHigh sample rate: • • • • • • • •    (many snapshots → smooth, accurate curve)</pre>'+
     'The Nyquist rule: to accurately capture a frequency, you need a sample rate of at least DOUBLE that frequency. Human hearing goes up to ~20kHz, which is why CD-quality audio uses 44.1kHz (just over double).<br>'+
     'Exam tip: higher sample rate AND higher bit depth both mean better quality but bigger file size — file size = sample rate × bit depth × duration × channels.',
     '定义: 真实的声波是连续的, 但计算机只能存储它的离散快照(采样, sample)。<b>采样率</b> (sample rate) = 每秒拍多少张快照(单位 Hz); <b>位深</b> (bit depth) = 每张快照的音量用多少位存储(位数越多, 音量刻度越精细)。<br>'+
     '<pre>低采样率:  •   •   •   •      (快照少 → 声音像台阶, 高音丢失)\n高采样率:  • • • • • • • •    (快照多 → 平滑准确)</pre>'+
     '奈奎斯特法则 (Nyquist): 要准确捕捉某个频率, 采样率至少要是它的<b>两倍</b>。人耳能听到约 20kHz, 这就是为什么 CD 音质用 44.1kHz(刚好略高于两倍)。<br>'+
     '考点提示: 采样率和位深都是越高质量越好, 但文件也越大——文件大小 = 采样率 × 位深 × 时长 × 声道数。'),
   example:B(
     'To capture a 10kHz musical note accurately, you need a sample rate of at least 20kHz (Nyquist: 2×10kHz). Sampling at only 8kHz would lose that note entirely.',
     '要准确捕捉一个 10kHz 的乐音, 采样率至少要 20kHz(奈奎斯特: 2×10kHz)。只用 8kHz 采样会完全丢失这个音。')}
);

window.GAME_MODULES=window.GAME_MODULES||[];
window.GAME_MODULES.push(MOD);
})();
