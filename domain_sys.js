/* ================================================================
   BIT://ESCAPE 领域模块 —— 巴别塔 The Babel Tower (domain_sys.js)
   9618 AS · Topic 5 System Software
   (5.1 操作系统职责 & 实用工具 utility software ·
    5.2 语言翻译器 compiler / interpreter / assembler · IDE)
   ----------------------------------------------------------------
   一座层层向上的翻译塔——这台机器里所有语言互译的地方。
     1F 大厅         → 世界观 & 主线接引 (系统官 KERNEL)
     2F 实用工具间   → 碎片整理 + 病毒扫描 (§5.1 utility software)
     3F 内核层       → 内存分配 (§5.1 OS 管资源: 内存/处理器/界面)
     顶层 翻译核心   → 三位翻译官 & 翻译预测台 (§5.2 三种翻译器)
   人物性格 = 机制本身: 编译官一次全译、解释官逐行即停、汇编官只碰底层。
   ----------------------------------------------------------------
   模块协议 (与 domain_sec.js / domain_net.js 一致):
     window.GAME_MODULES.push({ id,title,world,unlock,interior,npcs,
                                steles,quests,puzzles,onEnter,onQuestComplete })
   约定(给引擎侧):
   - unlock.afterQuest='m3' —— 进入 AS 开放世界即可达(补充章节, 不挡全局主线)。
   - npcs[i].dialog 是 function(api)->节点数组; 节点格式同 index.html
     startDialog: {sp,t,choices:[{t,next,do}],next}; next 缺省 i+1,
     next:-1 结束; 数组可挂 .onEnd。
   - 双语: 一切面向玩家的字符串 = {en,zh} 对象, 经引擎 window.T;
     render()/toast 自建文字在本模块内自行过 T()/tx()。en 零汉字,
     zh 中文母语创作(术语保英文如「编译器 (compiler)」)。
   - puzzle.render(el,api) 自建 DOM; onKey(e,api) 处理 '?'提示 与 Esc。
   - 对象 kind: puzzleStation / infoTerminal / stele (给美术三级分类)。
   - 纯逻辑判定函数导出在 spec._test (供无引擎单测; 引擎忽略)。
   api 依赖: toast/sfx/giveItem/hasItem/completeStep/questDone/
             openDialog/closePanel/setFlag/getFlag/player/onFail/scene/teleport
   ================================================================ */
(function(){
'use strict';

/* ---------------- 双语 fallback ---------------- */
var T = window.T || function(s){ return typeof s==='string' ? s : (s && s.en!=null ? s.en : ''); };
function B(en,zh){ return {en:en, zh:zh}; }        // 结构化字段: 挂 {en,zh}
function tx(en,zh){ return T({en:en, zh:zh}); }     // render()/toast: 立即取当前语言

/* ---------------- api 安全封装 ---------------- */
var API=null;
function _api(a){ if(a) API=a; return API; }
function toast(m,long){ try{ API&&API.toast&&API.toast(T(m),long); }catch(e){} }
function sfx(k){ try{ if(!API||!API.sfx) return;
  if(typeof API.sfx==='function') API.sfx(k);
  else if(API.sfx[k]) API.sfx[k](); }catch(e){} }
var _flags={};                       // 本地兜底(无引擎单测时也能跑)
function getFlag(k){ try{ if(API&&API.getFlag){ var v=API.getFlag(k); if(v!==undefined) return v; } }catch(e){} return _flags[k]; }
function setFlag(k,v){ v=(v===undefined)?true:v; _flags[k]=v; try{ API&&API.setFlag&&API.setFlag(k,v); }catch(e){} }
function stepDone(q,s){ try{ API&&API.completeStep&&API.completeStep(q,s); }catch(e){} }
function markQuest(q){ try{ API&&API.questDone&&API.questDone(q); }catch(e){} }
function give(id,name){ try{ API&&API.giveItem&&API.giveItem(id,T(name)); }catch(e){} }
function onFail(pid){ try{ API&&API.onFail&&API.onFail(pid); }catch(e){} }
function esc(s){ return String(s==null?'':s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];}); }

/* ================================================================
   0. 纯逻辑判定 —— 无 DOM 依赖, 与语言无关, 导出至 _test
   ================================================================ */

/* ---- §5.2 语言翻译器: 三种翻译器的行为模型 (本模块的旗舰考点) ----
   program = { kind:'highlevel'|'assembly', lines:[{n,effect,error}] }
   translator = 'compiler' | 'interpreter' | 'assembler'
   返回一次"翻译并运行"的完整结果, 三种翻译器的差异全部体现在这里:
     · 何时报错 (compile-time 全译前 vs run-time 逐行到那一行)
     · 是否部分执行 (解释官边走边执行; 编译官全有或全无)
     · 是否产出目标代码 object code (编译/汇编产出; 解释器不产出)
     · 能否处理该语言 (汇编官只碰 assembly; 编/解释器只碰 high-level) */
function runTranslator(program, translator){
  var out={
    translator:translator, accepted:true, rejectReason:null,
    errorReportedAt:null, errorLine:null,
    litEffects:[], producedObjectCode:false, ranToCompletion:false
  };
  if(!program||!program.lines){ out.accepted=false; out.rejectReason='no-program'; return out; }
  var lines=program.lines, kind=program.kind;

  // 语言不对口 —— 直接拒收 (谁也不越界)
  if(translator==='assembler' && kind!=='assembly'){
    out.accepted=false; out.rejectReason='needs-assembly'; return out;
  }
  if((translator==='compiler'||translator==='interpreter') && kind!=='highlevel'){
    out.accepted=false; out.rejectReason='needs-highlevel'; return out;
  }

  var i, firstErr=-1;
  for(i=0;i<lines.length;i++){ if(lines[i].error){ firstErr=i; break; } }

  if(translator==='interpreter'){
    // 逐行翻译并执行 —— 到出错那一行才发现, 之前的副作用已经发生
    for(i=0;i<lines.length;i++){
      if(lines[i].error){ out.errorReportedAt='run-time'; out.errorLine=i; return out; }
      if(lines[i].effect!=null) out.litEffects.push(lines[i].effect);
    }
    out.ranToCompletion=true;                 // 解释器从不产出目标代码
    return out;
  }
  // compiler 与 assembler: 先把整段翻完, 有错则编译期/汇编期报错, 全有或全无
  if(firstErr>=0){
    out.errorReportedAt='compile-time'; out.errorLine=firstErr;   // 一个字节都不跑
    return out;
  }
  out.producedObjectCode=true;                // 产出目标代码
  for(i=0;i<lines.length;i++){ if(lines[i].effect!=null) out.litEffects.push(lines[i].effect); }
  out.ranToCompletion=true;
  return out;
}
/* 翻译+执行"成本"模型 (为什么编译版跑得快):
   编译/汇编: 翻一次, 之后每次运行直接跑目标代码;
   解释: 每运行一次就重新逐行翻译一次 —— 重复运行 N 次差距被放大。 */
function translationCost(program, translator, runs){
  runs = runs||1;
  var n = (program&&program.lines) ? program.lines.length : 0;
  var TRANSLATE=n, EXEC=n;
  if(translator==='interpreter') return runs*(TRANSLATE+EXEC);   // 每次都重翻
  return TRANSLATE + runs*EXEC;                                  // 翻一次, 反复跑
}

/* ---- §5.1 实用工具: 碎片整理 defragmenter ----
   disk = 数组, 每格是 fileId 或 null(空闲)。整理完成 =
   每个文件的块连续成段、文件之间不交错、空闲空间全在尾部。 */
function isDefragmented(disk){
  var seenFree=false, last=null, seen={};
  for(var i=0;i<disk.length;i++){
    var c=disk[i];
    if(c===null||c===undefined){ seenFree=true; continue; }
    if(seenFree) return false;              // 空闲之后又冒出文件块 = 有空洞
    if(c!==last){
      if(seen[c]) return false;             // 同一文件被切成两段
      seen[c]=true; last=c;
    }
  }
  return true;
}
function diskFilesIntact(disk, expectCounts){
  // 整理不能弄丢/凭空多出块: 各文件块数须与初始一致
  var cnt={};
  for(var i=0;i<disk.length;i++){ var c=disk[i]; if(c!=null) cnt[c]=(cnt[c]||0)+1; }
  for(var k in expectCounts){ if((cnt[k]||0)!==expectCounts[k]) return false; }
  for(var k2 in cnt){ if(!(k2 in expectCounts)) return false; }
  return true;
}

/* ---- §5.1 实用工具: 病毒扫描 virus checker ----
   在文件列表里找出携带"特征码 (signature)"的那个文件。 */
function fileHasSignature(bytes, sig){ return String(bytes).indexOf(sig) >= 0; }
function scanFiles(files, sig){
  return files.map(function(f){ return fileHasSignature(f.bytes, sig); });
}
function infectedIndices(files, sig){
  var out=[]; for(var i=0;i<files.length;i++){ if(fileHasSignature(files[i].bytes,sig)) out.push(i); } return out;
}

/* ---- §5.1 OS 管资源: 内存分配 memory management ----
   RAM = cap 格; 开头 reserved 格常驻给 OS 内核自己(拿不动);
   把每个程序放进内存(start..start+size-1), 不许越界/重叠/压到内核区。 */
function evalMemoryMap(placements, cap, reserved){
  reserved = reserved||0;
  var cells=new Array(cap);
  var res={ok:true, overflow:[], overlap:[], intoReserved:[], placed:0};
  var r;
  for(r=0;r<cap;r++) cells[r]=null;
  for(r=0;r<reserved && r<cap;r++) cells[r]='__OS__';
  (placements||[]).forEach(function(p){
    if(p.start==null){ return; }             // 尚未放置
    res.placed++;
    var end=p.start+p.size;
    if(p.start<0 || end>cap){ res.overflow.push(p.id); res.ok=false; return; }
    for(var i=p.start;i<end;i++){
      if(cells[i]==='__OS__'){ if(res.intoReserved.indexOf(p.id)<0) res.intoReserved.push(p.id); res.ok=false; }
      else if(cells[i]!==null){ if(res.overlap.indexOf(p.id)<0) res.overlap.push(p.id); res.ok=false; }
      cells[i]=p.id;
    }
  });
  return res;
}
function memoryComplete(placements, cap, reserved){
  var r=evalMemoryMap(placements, cap, reserved);
  return r.ok && r.placed===(placements?placements.length:0);
}

/* ---- §5.2 IDE: 单步调试 debugger ----
   顺着程序执行, 记下每一步 watch 变量 x 的值。
   与"预期轨迹"比对, 找出 x 第一次偏离预期的那一行 = 该下断点处。 */
function traceProgram(ops){
  var x=0, trace=[];
  (ops||[]).forEach(function(o){
    if(o.op==='set') x=o.val;
    else if(o.op==='add') x=x+o.val;
    else if(o.op==='sub') x=x-o.val;
    else if(o.op==='mul') x=x*o.val;
    trace.push(x);
  });
  return trace;
}
function firstDivergence(a, b){
  var n=Math.max(a.length,b.length);
  for(var i=0;i<n;i++){ if(a[i]!==b[i]) return i; }
  return -1;
}

/* ---- 隐藏: "被编译过的诗" —— 恺撒位移解码 ----
   诗被 compile 过一遍(每个字母位移 key), 解码 = 反向位移。 */
function caesarShift(str, k){
  return String(str).replace(/[a-z]/gi, function(ch){
    var base = ch<='Z' ? 65 : 97;
    return String.fromCharCode((ch.charCodeAt(0)-base + (k%26+26)%26)%26 + base);
  });
}

/* ================================================================
   1. 常量: 谜题数据
   ================================================================ */

/* --- 翻译核心: 三个回合的程序 + 目标 --- */
var PROG_BUGGY={ kind:'highlevel', lines:[
  {n:1, effect:'A', code:'LIGHT lamp A', error:false},
  {n:2, effect:'B', code:'LIGHT lamp B', error:false},
  {n:3, effect:null, code:'LIGTH lamp C      ; <- typo: "LIGTH"', error:true},
  {n:4, effect:'D', code:'LIGHT lamp D', error:false}
]};
var PROG_ASM={ kind:'assembly', lines:[
  {n:1, effect:'A', code:'LDM #65      ; load code for A', error:false},
  {n:2, effect:'B', code:'OUT          ; emit', error:false},
  {n:3, effect:'C', code:'END', error:false}
]};
var PROG_HOT={ kind:'highlevel', lines:[
  {n:1, effect:'A', code:'LIGHT lamp A', error:false},
  {n:2, effect:'B', code:'LIGHT lamp B', error:false},
  {n:3, effect:'C', code:'LIGHT lamp C', error:false}
]};
var HOT_RUNS=1000000;

/* --- 内存分配: RAM 12 格, 前 2 格给内核, 4 个程序 --- */
var MEM_CAP=12, MEM_RESERVED=2;
var MEM_PROGS=[
  {id:'P1', size:3, name:B('Editor','编辑器'),  color:'#7CFC00'},
  {id:'P2', size:2, name:B('Player','播放器'),  color:'#5ac8fa'},
  {id:'P3', size:4, name:B('Compiler','编译器'),color:'#ffce3a'},
  {id:'P4', size:1, name:B('Clock','时钟'),     color:'#ff8ab0'}
];   // 3+2+4+1 = 10, 恰好塞满 12-2=10 格 —— 一格都不能浪费

/* --- 碎片整理: 初始散块 (8 格) --- */
function initDisk(){ return ['A',null,'B','A',null,'B','C',null]; }   // A×2 B×2 C×1
var DISK_COUNTS={A:2,B:2,C:1};

/* --- 病毒扫描: 5 个文件, 特征码藏在其一 --- */
var VIRUS_SIG='X5O!P%';
var VIRUS_FILES=[
  {name:B('holiday_photo.jpg','假期照片.jpg'), bytes:'FFD8FFE0..JFIF....happy'},
  {name:B('essay_final.doc','作文终稿.doc'),   bytes:'PK..word/document..the end'},
  {name:B('free_robux.exe','免费点券.exe'),    bytes:'MZ..'+VIRUS_SIG+'@AP[4\\PZX54(P^)7CC)7}$'},
  {name:B('cat.gif','猫.gif'),                 bytes:'GIF89a....meow'},
  {name:B('notes.txt','笔记.txt'),             bytes:'plain text, nothing to see here'}
];

/* --- IDE 调试: 一段算 x 的程序, 第 3 行藏 bug --- */
var IDE_ACTUAL=[
  {op:'set', val:5,  code:'x <- 5'},
  {op:'add', val:3,  code:'x <- x + 3'},
  {op:'mul', val:2,  code:'x <- x * 2      ; should be  x + 2'},
  {op:'sub', val:1,  code:'x <- x - 1'}
];
var IDE_INTENDED=[
  {op:'set', val:5},
  {op:'add', val:3},
  {op:'add', val:2},
  {op:'sub', val:1}
];   // 预期结尾 x=9; 实际 x=15 —— 第 3 行(index 2) 开始偏离

/* --- 隐藏: 被编译过的诗 (key=7) --- */
var POEM_KEY=7;
var POEM_PLAIN=[
  'we were all',
  'one language once',
  'then someone',
  'ran the compiler'
];
var POEM_CIPHER=POEM_PLAIN.map(function(l){ return caesarShift(l, POEM_KEY); });

/* ================================================================
   2. UI 小工具 (终端绿语言 + 巴别塔金色 accent)
   ================================================================ */
function mk(parent,tag,css,html){
  var d=document.createElement(tag);
  if(css) d.style.cssText=css;
  if(html!=null) d.innerHTML=html;
  if(parent) parent.appendChild(d);
  return d;
}
var BTN='background:#0a1f0a;color:#7CFC00;border:1px solid #2f6f2f;padding:5px 12px;font-family:inherit;font-size:13px;cursor:pointer;letter-spacing:1px;border-radius:2px;';
var BTN_HOT='background:#123f12;color:#7CFC00;border:1px solid #7CFC00;padding:5px 12px;font-family:inherit;font-size:14px;cursor:pointer;letter-spacing:1px;border-radius:2px;box-shadow:0 0 8px #2b6;';
var BTN_GOLD='background:#3a2c08;color:#ffce3a;border:1px solid #c9a24a;padding:5px 12px;font-family:inherit;font-size:13px;cursor:pointer;letter-spacing:1px;border-radius:2px;';
var TXT='color:#bfeebf;font-size:13px;line-height:1.7;';
var DIM='color:#4a7a4a;font-size:11.5px;';
var K='color:#ffce3a;';
function header(el,title,sub){
  mk(el,'div','color:#9fee9f;letter-spacing:2px;font-size:14px;border-bottom:1px solid #1f3f1f;padding-bottom:6px;margin-bottom:8px;',
    title + (sub?' <span style="'+DIM+'float:right;">'+sub+'</span>':''));
}
/* 三段递进提示: concept -> apply -> answer; 存到 HINTS[pid], ?键/按钮均可触发 */
var HINTS={};
function attachHints(el, pid, hints){
  var idx=0;
  var bar=mk(el,'div','margin-top:10px;');
  var box=mk(el,'div','display:none;margin-top:6px;border:1px dashed #c9a24a;color:#ffce3a;padding:7px 10px;font-size:12px;line-height:1.7;background:rgba(40,30,5,.3);');
  function fire(){
    box.style.display='block';
    box.innerHTML='<b>'+tx('Hint','提示')+' '+(idx+1)+'/'+hints.length+'</b> — '+T(hints[idx])+
      (idx<hints.length-1?'<br><span style="'+DIM+'">'+tx('(press ? again for a blunter one)','(再按 ? 给更直白的)')+'</span>':'');
    idx=Math.min(idx+1, hints.length-1); sfx('ui');
  }
  mk(bar,'button',BTN,'? '+tx('Hint','提示')+' <span style="'+DIM+'">'+tx('(or press ?)','(按 ? 键)')+'</span>').onclick=fire;
  HINTS[pid]=fire;
}
function sysKey(pid){
  return function(e,a){ _api(a);
    if(e && (e.key==='Escape'||e.key==='Esc')){ try{ API&&API.closePanel&&API.closePanel(); }catch(_e){} return; }
    if(e && e.key==='?' && HINTS[pid]) HINTS[pid]();
  };
}
/* 三幕演出: 优先 api.scene, 退回 openDialog */
function scene(steps){
  try{ if(API&&API.scene){ API.scene(steps); return; } }catch(e){}
  try{
    if(API&&API.openDialog){
      var nodes=[];
      steps.forEach(function(s){
        if(s.say) nodes.push({sp:s.say.name, t:s.say.text});
        else if(s.dialog) s.dialog.forEach(function(n){ nodes.push(n); });
        else if(s.run||s.worldChange){ (s.run||s.worldChange)(); }
        else if(s.setFlag){ setFlag(s.setFlag.k, s.setFlag.v); }
        else if(s.give){ give(s.give.id, s.give.name); }
        else if(s.toast!=null){ toast(s.toast, s.long); }
      });
      if(nodes.length) API.openDialog(nodes);
    }
  }catch(e2){}
}

/* ================================================================
   3. 谜题 1 · 实用工具间 (§5.1 utility software)
   —— 阶段一 碎片整理; 阶段二 病毒扫描; 都过才算把工具间修好
   ================================================================ */
function renderUtil(el, api){ _api(api);
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:540px;max-width:720px;'+TXT);
  header(wrap, tx('Utility Wing · Housekeeping Console','实用工具间 · 保洁控制台'), 'UTIL §5.1');

  if(getFlag('sys_util_done')){
    mk(wrap,'div','',tx(
      'The disk hums, tidy and defragged; the one infected file sits in quarantine, blinking sadly.<br><span style="'+DIM+'">Utility software: the small, unglamorous tools that keep a computer running — nobody thanks them, everybody needs them.</span>',
      '磁盘运转顺滑, 整整齐齐; 唯一那个染毒文件蹲在隔离区里, 一闪一闪地委屈着。<br><span style="'+DIM+'">实用工具 (utility software): 一堆不起眼的小工具, 让电脑正常运转——没人感谢它们, 谁都离不开它们。</span>'));
    mk(wrap,'button',BTN,tx('Leave','离开')).onclick=function(){ API.closePanel&&API.closePanel(); };
    return;
  }

  mk(wrap,'div','',tx(
    'The tower\'s lower gears are jammed with two decades of mess. Two utilities to run: <span style="'+K+'">① Defragmenter</span> — shuffle each file\'s blocks back into one contiguous run; <span style="'+K+'">② Virus checker</span> — find the file carrying the malware signature.',
    '塔的底层齿轮被二十年的杂物卡死了。要跑两个工具: <span style="'+K+'">① 碎片整理 (defragmenter)</span>——把每个文件的块挪回连续一整段; <span style="'+K+'">② 病毒扫描 (virus checker)</span>——找出携带恶意特征码的那个文件。'));

  var stageBox=mk(wrap,'div','margin-top:12px;');
  var msg=mk(wrap,'div','min-height:34px;margin-top:8px;font-size:12px;color:#ffce3a;line-height:1.6;');

  /* ---------- 阶段一: 碎片整理 ---------- */
  function stageDefrag(){
    stageBox.innerHTML='';
    mk(stageBox,'div','',tx('<b>① Defragmenter.</b> Click two cells to swap them. Goal: every file (A/B/C) is one solid block, all free space (·) pushed to the end.',
      '<b>① 碎片整理。</b>点两格交换它们。目标: 每个文件 (A/B/C) 各自连成一整块, 空闲格 (·) 全部推到最右。'));
    var disk=initDisk();
    var pick=-1;
    var row=mk(stageBox,'div','display:flex;gap:4px;margin:10px 0;');
    var cells=[];
    function paint(){
      disk.forEach(function(c,i){
        var b=cells[i];
        b.textContent = c==null?'·':c;
        var col = c==null?'#254025':({A:'#1f4a1f',B:'#2a3a5a',C:'#5a4a1a'}[c]||'#333');
        b.style.background=(i===pick)?'#7CFC00':col;
        b.style.color=(i===pick)?'#082008':(c==null?'#4a7a4a':'#dfeedf');
      });
    }
    disk.forEach(function(c,i){
      var b=mk(row,'div','width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:1px solid #2f6f2f;border-radius:3px;cursor:pointer;font-size:16px;font-weight:bold;','');
      b.onclick=function(){
        if(pick<0){ pick=i; sfx('ui'); paint(); return; }
        var t=disk[pick]; disk[pick]=disk[i]; disk[i]=t; pick=-1; sfx('ui'); paint();
        if(isDefragmented(disk) && diskFilesIntact(disk, DISK_COUNTS)){
          sfx('ok');
          msg.innerHTML=tx('<span style="color:#7CFC00">✓ Disk defragmented.</span> Contiguous files, free space at the tail — read/write heads will thank you.',
            '<span style="color:#7CFC00">✓ 磁盘整理完成。</span>文件连续、空闲在尾——读写磁头会谢谢你的。');
          setTimeout(stageVirus, 700);
        }
      };
      cells.push(b);
    });
    paint();
  }

  /* ---------- 阶段二: 病毒扫描 ---------- */
  function stageVirus(){
    stageBox.innerHTML='';
    mk(stageBox,'div','',tx('<b>② Virus checker.</b> The signature to match: <code style="'+K+'">'+esc(VIRUS_SIG)+'</code>. Scan the files and quarantine the one that contains it.',
      '<b>② 病毒扫描。</b>要比对的特征码 (signature): <code style="'+K+'">'+esc(VIRUS_SIG)+'</code>。扫一遍文件, 把含有它的那个隔离掉。'));
    var list=mk(stageBox,'div','margin:10px 0;');
    VIRUS_FILES.forEach(function(f,i){
      var rowd=mk(list,'div','display:flex;align-items:center;gap:10px;margin:5px 0;padding:6px 8px;border:1px solid #234023;border-radius:3px;background:rgba(10,25,10,.4);');
      mk(rowd,'div','flex:0 0 150px;color:#bfeebf;font-size:12.5px;', T(f.name));
      mk(rowd,'div','flex:1;color:#5a8a5a;font-size:11px;font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', esc(f.bytes));
      mk(rowd,'button',BTN,tx('Quarantine','隔离')).onclick=function(){
        if(fileHasSignature(f.bytes, VIRUS_SIG)){
          sfx('ok');
          msg.innerHTML=tx('<span style="color:#7CFC00">✓ Caught it.</span> "'+T(f.name)+'" carried the signature <code>'+esc(VIRUS_SIG)+'</code>. A virus checker matches known signatures — like a wanted poster for byte-patterns.',
            '<span style="color:#7CFC00">✓ 抓到了。</span>"'+T(f.name)+'" 携带特征码 <code>'+esc(VIRUS_SIG)+'</code>。病毒扫描器靠比对已知特征码干活——像给字节图案发的通缉令。');
          finish();
        }else{
          sfx('err'); onFail('sys_util');
          msg.innerHTML=tx('<span style="color:#ff8080">✗ Clean file.</span> "'+T(f.name)+'" doesn\'t contain the signature. Look for the exact byte-pattern <code>'+esc(VIRUS_SIG)+'</code> in the raw bytes.',
            '<span style="color:#ff8080">✗ 干净文件。</span>"'+T(f.name)+'" 不含特征码。在原始字节里找那串一模一样的 <code>'+esc(VIRUS_SIG)+'</code>。');
        }
      };
    });
  }

  function finish(){
    setFlag('sys_util_done');
    stepDone('sys_main','s1');
    scene([
      {sfx:'ok'},
      {toast:B('◈ Utility Wing restored. Below, jammed gears turn again — the tower can climb.','◈ 工具间修复。楼下卡死的齿轮重新转动——塔可以往上爬了。'), long:true},
      {say:{name:B('KERNEL','系统官 KERNEL'), t:B('Defragged and disinfected. That is what utilities are: not the star of the show, just the reason the show goes on. The Kernel Layer is open. Go up.',
        '整理过, 也消过毒了。实用工具就是这么回事: 不是台上的主角, 只是这台戏还演得下去的原因。内核层开了。上去吧。')}}
    ]);
    setTimeout(function(){ renderUtil(el, api); }, 300);
  }

  stageDefrag();

  attachHints(wrap,'sys_util',[
    B('Concept — "fragmented" means one file\'s blocks are scattered with gaps between them; "defragmented" means each file sits in one unbroken run and free space is all at the end. For the virus: a signature is a fixed byte-pattern that a known piece of malware always contains.',
      '概念——"碎片化"就是一个文件的块被打散、中间夹着空洞; "整理好"就是每个文件连成不间断的一整段、空闲全在最后。病毒那边: 特征码 (signature) 是某个已知恶意软件必然携带的固定字节图案。'),
    B('Apply — swap blocks so all the A\'s sit together, then all the B\'s, then C, then the free cells. For the virus, scan each file\'s raw bytes for the exact string X5O!P% — only one file has it.',
      '应用——交换块, 让所有 A 挨在一起, 再是所有 B, 再是 C, 空闲格垫最后。病毒那边, 逐个文件在原始字节里搜一模一样的 X5O!P%, 只有一个文件含它。'),
    B('Worked example (a different, smaller disk) — start: B · A B A. Swap cell 1 with cell 3: B B A · A. Swap cell 3 with cell 4: B B A A ·. Now every file is one solid run and the free cell sits at the tail — done in two swaps. Your disk plays by the same two rules, just with three files: group the same letters together, push every · to the right. For the virus: ignore the filenames entirely — press the signature string against each file\'s raw bytes, character by character; exactly one file contains it.',
      '例子(换了一块更小的磁盘)——初始: B · A B A。把第 1 格和第 3 格交换: B B A · A; 再把第 3 格和第 4 格交换: B B A A ·。每个文件各成一整段、空闲格垫在尾巴——两次交换搞定。你的磁盘规则一样, 只是文件多一个: 相同字母归拢, 所有 · 推到最右。病毒那边: 完全别看文件名——把特征码那串字符逐个按到每个文件的原始字节上比对, 恰好只有一个文件含它。')
  ]);
}

/* ================================================================
   4. 谜题 2 · 内核层 · 内存分配 (§5.1 OS 管资源)
   ================================================================ */
function renderOS(el, api){ _api(api);
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:560px;max-width:740px;'+TXT);
  header(wrap, tx('Kernel Layer · Memory Manager','内核层 · 内存管理器'), 'OS §5.1');

  if(getFlag('sys_os_done')){
    mk(wrap,'div','',tx(
      'Every program sits in its own stretch of RAM, none stepping on another, the kernel safe in its reserved corner.<br><span style="'+DIM+'">Managing memory is one of the OS\'s core jobs — along with sharing the processor, handling input/output, managing files, and giving you an interface to it all.</span>',
      '每个程序都待在自己那段 RAM 里, 谁也不踩谁, 内核安坐在预留的角落。<br><span style="'+DIM+'">管理内存是操作系统的核心职责之一——此外还有分配处理器、处理输入输出、管理文件, 以及给你一个能操作这一切的界面。</span>'));
    mk(wrap,'button',BTN,tx('Leave','离开')).onclick=function(){ API.closePanel&&API.closePanel(); };
    return;
  }

  mk(wrap,'div','',tx(
    'Without an OS, four programs would all grab RAM at once and clobber each other. <span style="'+K+'">You are the OS now.</span> Give each program a home in memory — no overlaps, no running off the end, and never touch the kernel\'s reserved cells.',
    '没有操作系统, 四个程序会同时抢 RAM、互相覆盖。<span style="'+K+'">现在你就是操作系统。</span>给每个程序在内存里安个家——不许重叠、不许越界, 也别碰内核预留的格子。'));

  var placements=MEM_PROGS.map(function(p){ return {id:p.id, size:p.size, start:null}; });
  var selected=null;

  var barWrap=mk(wrap,'div','margin:12px 0;');
  mk(barWrap,'div',DIM+'margin-bottom:3px;', tx('RAM · '+MEM_CAP+' cells (cell 0–'+(MEM_RESERVED-1)+' reserved for the kernel)','RAM · '+MEM_CAP+' 格 (第 0–'+(MEM_RESERVED-1)+' 格为内核预留)'));
  var bar=mk(barWrap,'div','display:flex;gap:3px;');
  var cellEls=[];
  var idx=mk(barWrap,'div','display:flex;gap:3px;margin-top:2px;');
  for(var c=0;c<MEM_CAP;c++){
    var cell=mk(bar,'div','width:38px;height:44px;border:1px solid #2f6f2f;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;cursor:pointer;','');
    (function(ci){ cell.onclick=function(){ tryPlace(ci); }; })(c);
    cellEls.push(cell);
    mk(idx,'div','width:38px;text-align:center;'+DIM, ''+c);
  }

  var tray=mk(wrap,'div','display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;');
  var msg=mk(wrap,'div','min-height:34px;margin-top:6px;font-size:12px;color:#ffce3a;line-height:1.6;');

  function progById(id){ for(var i=0;i<MEM_PROGS.length;i++) if(MEM_PROGS[i].id===id) return MEM_PROGS[i]; return null; }
  function placementById(id){ for(var i=0;i<placements.length;i++) if(placements[i].id===id) return placements[i]; return null; }

  function paint(){
    var occ=new Array(MEM_CAP); var i;
    for(i=0;i<MEM_CAP;i++) occ[i]=null;
    for(i=0;i<MEM_RESERVED;i++) occ[i]='__OS__';
    placements.forEach(function(pl){ if(pl.start!=null){ for(var j=pl.start;j<pl.start+pl.size && j<MEM_CAP;j++){ if(occ[j]==null) occ[j]=pl.id; } } });
    cellEls.forEach(function(cel,ci){
      var who=occ[ci];
      if(who==='__OS__'){ cel.style.background='#402a2a'; cel.style.color='#ffb0b0'; cel.textContent='OS'; cel.style.borderColor='#7a3a3a'; }
      else if(who){ var pr=progById(who); cel.style.background=pr.color; cel.style.color='#082008'; cel.textContent=who; cel.style.borderColor=pr.color; }
      else { cel.style.background='#0a1f0a'; cel.style.color='#4a7a4a'; cel.textContent='·'; cel.style.borderColor='#2f6f2f'; }
    });
  }
  function paintTray(){
    tray.innerHTML='';
    MEM_PROGS.forEach(function(p){
      var pl=placementById(p.id);
      var placed=(pl.start!=null);
      var b=mk(tray,'button', (selected===p.id?BTN_HOT:BTN),
        T(p.name)+' <span style="'+DIM+'">('+p.size+(p.size>1?tx(' cells','格'):tx(' cell','格'))+')</span>'+(placed?' <span style="color:#7CFC00">✓</span>':''));
      b.style.borderLeft='4px solid '+p.color;
      b.onclick=function(){
        if(placed){ pl.start=null; sfx('ui'); selected=p.id; msg.textContent=tx('Picked up '+T(p.name)+' — click a start cell to place it again.','拿起了 '+T(p.name)+'——点一个起始格重新放置。'); paint(); paintTray(); return; }
        selected=(selected===p.id)?null:p.id; sfx('ui'); paintTray();
      };
    });
  }
  function tryPlace(ci){
    if(selected==null){ msg.textContent=tx('Pick a program from the tray first, then click a cell to drop it there (that cell = its start).','先从下面选一个程序, 再点一个格子把它放下 (那格就是它的起始位置)。'); return; }
    var p=progById(selected), pl=placementById(selected);
    pl.start=ci;
    var res=evalMemoryMap(placements, MEM_CAP, MEM_RESERVED);
    if(res.overflow.indexOf(selected)>=0){ pl.start=null; sfx('err'); onFail('sys_os'); msg.innerHTML=tx('<span style="color:#ff8080">Runs off the end.</span> '+T(p.name)+' needs '+p.size+' cells; from cell '+ci+' it would spill past cell '+(MEM_CAP-1)+'.','<span style="color:#ff8080">越界了。</span>'+T(p.name)+' 要 '+p.size+' 格; 从第 '+ci+' 格放, 会冲出第 '+(MEM_CAP-1)+' 格。'); paint(); paintTray(); return; }
    if(res.intoReserved.indexOf(selected)>=0){ pl.start=null; sfx('err'); onFail('sys_os'); msg.innerHTML=tx('<span style="color:#ff8080">That\'s the kernel\'s space.</span> Cells 0–'+(MEM_RESERVED-1)+' are reserved — the OS lives in memory too, and it never gives up its own room.','<span style="color:#ff8080">那是内核的地盘。</span>第 0–'+(MEM_RESERVED-1)+' 格是预留的——操作系统自己也住在内存里, 它从不让出自己的房间。'); paint(); paintTray(); return; }
    if(res.overlap.indexOf(selected)>=0){ pl.start=null; sfx('err'); onFail('sys_os'); msg.innerHTML=tx('<span style="color:#ff8080">Collision.</span> '+T(p.name)+' would overwrite another program. Two programs can\'t share the same cells — that\'s exactly the crash the OS exists to prevent.','<span style="color:#ff8080">撞车了。</span>'+T(p.name)+' 会盖掉另一个程序。两个程序不能共用同几格——这正是操作系统存在、要去避免的那种崩溃。'); paint(); paintTray(); return; }
    sfx('ui'); selected=null; msg.textContent=tx('Placed '+T(p.name)+'.','放好了 '+T(p.name)+'。'); paint(); paintTray();
    if(memoryComplete(placements, MEM_CAP, MEM_RESERVED)) win();
  }
  function win(){
    sfx('ok');
    msg.innerHTML=tx('<span style="color:#7CFC00">✓ All four programs housed, not one byte wasted.</span> This — deciding who gets which memory, and keeping them apart — is memory management, one of the operating system\'s core jobs.',
      '<span style="color:#7CFC00">✓ 四个程序全部安家, 一个字节没浪费。</span>这件事——谁分到哪段内存、并让它们互不干扰——就是内存管理, 操作系统的核心职责之一。');
    setFlag('sys_os_done'); stepDone('sys_main','s2');
    scene([
      {toast:B('◈ Kernel Layer stable. Power flows up the shaft — the Translation Core at the top flickers awake.','◈ 内核层稳定。电力顺着塔身往上走——顶层的翻译核心闪了一下, 醒了。'), long:true},
      {say:{name:B('KERNEL','系统官 KERNEL'), t:B('Memory, done. That is only one of my hats — I also share out the one processor, herd every input and output, keep the files in order, and hand you this interface so you never have to see any of it. When they say "the OS manages resources," this is the whole boring, load-bearing truth. The Core is yours now. Mind the three up there — they are... particular.',
        '内存, 搞定。这只是我的一顶帽子——我还要分配那一颗处理器、赶着所有的输入输出、把文件理清楚, 再递给你这个界面, 好让你一样都不必亲眼看见。人们说"操作系统管理资源", 这就是那句话全部的、无聊而承重的真相。核心归你了。当心上面那三位——他们……有点各色。')}}
    ]);
    setTimeout(function(){ renderOS(el, api); }, 300);
  }

  paint(); paintTray();

  attachHints(wrap,'sys_os',[
    B('Concept — the OS gives every running program its own private stretch of RAM so they never overwrite each other. Total RAM is fixed and small, and the OS itself is always resident, so some cells are off-limits.',
      '概念——操作系统给每个运行中的程序划一段私有的 RAM, 让它们永远不会互相覆盖。RAM 总量固定又不大, 而操作系统自己始终常驻, 所以有几格是禁区。'),
    B('Apply — you have 10 free cells (2–11) and four programs of size 3+2+4+1 = 10. It fits perfectly only if you leave no gaps. Try placing the big one (Compiler, 4) first.',
      '应用——你有 10 个空格 (2–11), 四个程序大小 3+2+4+1 = 10。只有不留任何缝隙才刚好塞下。先放最大的那个 (编译器, 4 格) 试试。'),
    B('Worked example (different numbers) — a RAM of 8 cells, cells 0–1 reserved, three programs sized 3, 2 and 1 (total 6 = exactly the 6 free cells). Pack them flush: the 3-cell one starts at cell 2 (fills 2–4), the 2-cell one starts at 5 (fills 5–6), the 1-cell one takes 7. Leave a gap anywhere — say the 3-cell one at 3 instead — and the last program no longer fits. Yours is the same trick with four programs: start at the first cell after the kernel, and give each next program the cell right after the previous one ends. In what order you drop them doesn\'t matter; gaps do.',
      '例子(换了数字)——一条 8 格的 RAM, 第 0–1 格预留, 三个程序大小 3、2、1 (总共 6 = 恰好 6 个空格)。贴紧了放: 3 格的从第 2 格开始 (占 2–4), 2 格的从 5 开始 (占 5–6), 1 格的占 7。任何地方留缝——比如 3 格的改放在 3——最后一个程序就塞不下了。你的题是同一招、换成四个程序: 从内核后的第一格开始, 每个程序都紧贴上一个的结尾。先放谁后放谁无所谓; 有没有缝才要命。')
  ]);
}

/* ================================================================
   5. 谜题 3 (旗舰) · 翻译核心 · 三种翻译器 (§5.2)
   —— 三回合预测台: 选对翻译器达成目标, 差异当场演出
   ================================================================ */
var TR_ROUNDS=[
  {prog:PROG_BUGGY, want:'interpreter',
   goal:B('This program has a bug somewhere. You need to <b>watch it run as far as it can</b> and see the <b>exact line</b> where it dies. Which translator gives you a partial run and stops right on the faulty line?',
          '这段程序某处有 bug。你需要<b>看它尽量往下跑</b>, 并看清它<b>死在哪一行</b>。哪种翻译器会给你一段"部分执行"、恰好停在出错那一行?')},
  {prog:PROG_ASM, want:'assembler',
   goal:B('This is written in <b>assembly language</b> — the machine\'s mother tongue, one mnemonic per instruction. Which translator handles that?',
          '这段是用<b>汇编语言 (assembly)</b> 写的——机器的母语, 一条指令一个助记符。哪种翻译器专门处理它?')},
  {prog:PROG_HOT, want:'compiler',
   goal:B('This program is correct, and it will be run <b>a million times</b> in production. You want the fastest repeated execution. Which translator produces reusable <b>object code</b> so you translate once and run forever?',
          '这段程序没有错, 而且上线后要跑<b>一百万次</b>。你要的是重复执行最快。哪种翻译器会产出可复用的<b>目标代码 (object code)</b>, 让你翻译一次、永远运行?')}
];
function trName(t){ return {compiler:B('Compiler','编译官'), interpreter:B('Interpreter','解释官'), assembler:B('Assembler','汇编官')}[t]; }

function renderTranslate(el, api){ _api(api);
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:580px;max-width:760px;'+TXT);
  header(wrap, tx('The Translation Core · Prediction Bench','翻译核心 · 翻译预测台'), 'TRANSLATORS §5.2');

  if(getFlag('sys_tr_done')){
    mk(wrap,'div','',tx(
      'All three translators hum in sync; the tower speaks every language at once and understands itself again.<br><span style="'+DIM+'">Compiler: translates the whole program first, reports every error at the end, produces object code, runs fast. Interpreter: translates & runs line by line, stops at the first error, no object code. Assembler: turns assembly into machine code, one-to-one.</span>',
      '三位翻译官同频共振; 塔用所有语言同时说话, 又一次听懂了自己。<br><span style="'+DIM+'">编译官: 先把整段翻完, 最后一次性报所有错, 产出目标代码, 运行快。解释官: 逐行翻译并运行, 遇第一个错就停, 不产出目标代码。汇编官: 把汇编一对一变成机器码。</span>'));
    mk(wrap,'button',BTN,tx('Leave','离开')).onclick=function(){ API.closePanel&&API.closePanel(); };
    return;
  }

  var progress=getFlag('sys_tr_prog')||0;
  mk(wrap,'div',DIM+'margin-bottom:4px;', tx('Round ','回合 ')+(progress+1)+' / '+TR_ROUNDS.length);
  var round=TR_ROUNDS[progress];

  mk(wrap,'div','margin-bottom:8px;', T(round.goal));

  // 程序清单
  var pre=mk(wrap,'pre','background:rgba(20,28,12,.6);border:1px solid #3a5a2a;padding:8px 10px;color:#cfeecf;font-size:12px;line-height:1.6;border-radius:3px;','');
  var head = round.prog.kind==='assembly'
    ? tx('; language: ASSEMBLY  (low-level, one mnemonic = one machine instruction)','; 语言: ASSEMBLY 汇编  (低级语言, 一个助记符 = 一条机器指令)')
    : tx('// language: HIGH-LEVEL','// 语言: HIGH-LEVEL 高级语言');
  var body=round.prog.lines.map(function(l){
    return (l.n<10?' ':'')+l.n+' | '+esc(l.code);
  }).join('\n');
  pre.textContent=head+'\n'+body;

  // 三个翻译官按钮
  var ctl=mk(wrap,'div','display:flex;gap:10px;margin:10px 0;flex-wrap:wrap;');
  ['compiler','interpreter','assembler'].forEach(function(t){
    mk(ctl,'button',BTN_GOLD, tx('Send to the ','送去')+' '+tx(trName(t).en, trName(t).zh)).onclick=function(){ runIt(t); };
  });

  var log=mk(wrap,'div','margin-top:8px;min-height:96px;font-size:12px;line-height:1.7;white-space:pre-wrap;background:rgba(15,20,10,.5);border:1px solid #2f6f2f;padding:8px 10px;border-radius:3px;color:#cfeecf;','');

  function lampLine(effects){
    var all=['A','B','C','D'];
    return all.map(function(L){
      var on=effects.indexOf(L)>=0;
      return '<span style="color:'+(on?'#ffce3a':'#2a3a2a')+';font-weight:bold">['+(on?'●':'○')+' '+L+']</span>';
    }).join(' ');
  }

  function runIt(t){
    var r=runTranslator(round.prog, t);
    var lines=[];
    lines.push('<b style="'+K+'">▸ '+tx(trName(t).en, trName(t).zh)+'</b>');
    if(!r.accepted){
      sfx('err'); onFail('sys_tr');
      if(r.rejectReason==='needs-assembly'){
        lines.push(tx('"That\'s high-level source. I only speak the machine\'s mother tongue — take it upstairs to the Compiler or Interpreter."',
          '「那是高级语言源码。我只说机器的母语——拿去找编译官或解释官。」'));
      }else{
        lines.push(tx('"That\'s assembly. Not my department — that\'s the old Assembler\'s job, one mnemonic at a time."',
          '「那是汇编。不归我管——那是老汇编官的活, 一个助记符一个助记符地来。」'));
      }
      lines.push('<span style="'+DIM+'">'+tx('(rejected — wrong language for this translator)','(拒收——语言不对口)')+'</span>');
      log.innerHTML=lines.join('\n');
      return;
    }
    // 演出: 结果
    if(t==='interpreter'){
      lines.push(tx('translating & running line by line...','逐行翻译并运行……'));
      round.prog.lines.forEach(function(l,i){
        if(r.errorLine===i){ lines.push('  '+tx('line ','行')+l.n+': <span style="color:#ff8080">✗ error caught HERE, at run-time — halt.</span>','  行'+l.n+': <span style="color:#ff8080">✗ 就在这里、运行时抓到错误——停机。</span>'); return; }
        if(r.errorLine!=null && i>r.errorLine) return;
        lines.push('  '+tx('line ','行')+l.n+': '+(l.effect?tx('ran → lamp '+l.effect+' ON','执行 → '+l.effect+' 灯亮'):tx('ran','执行')));
      });
    }else{
      lines.push(tx('translating the WHOLE program first...','先把整段程序翻完……'));
      if(r.errorReportedAt==='compile-time'){
        lines.push(tx('  ✗ error found at line '+round.prog.lines[r.errorLine].n+' — reported at compile-time.','  ✗ 第 '+round.prog.lines[r.errorLine].n+' 行发现错误——编译期报错。'));
        lines.push('<span style="color:#ff8080">'+tx('  no object code produced; NOTHING runs. All-or-nothing.','  不产出目标代码; 一行都不执行。全有或全无。')+'</span>');
      }else{
        lines.push(tx('  ✓ no errors → '+(t==='assembler'?'machine code':'object code')+' produced, then executed in one go.','  ✓ 无错误 → 产出'+(t==='assembler'?'机器码':'目标代码')+', 然后一口气执行。'));
      }
    }
    lines.push('');
    lines.push(tx('lamps: ','灯: ')+lampLine(r.litEffects));

    // 是否达成本回合目标
    var okGoal = (t===round.want);
    if(okGoal){
      sfx('ok');
      lines.push('<span style="color:#7CFC00">'+tx('✓ That is exactly the behaviour this job needs.','✓ 这正是这个任务需要的行为。')+'</span>');
      log.innerHTML=lines.join('\n');
      // 补一句"为什么"
      if(round.want==='interpreter') lines.push(tx('The interpreter ran lines 1–2, then died on the exact faulty line — partial progress + a precise error location. Great for debugging.','解释官跑完 1–2 行, 死在出错那一行上——部分进度 + 精确错误定位。调试时最好用。'));
      if(round.want==='assembler'){
        // 附加速度对比一句已在 compiler 回合体现, 这里说 1:1
        lines.push(tx('The assembler turned each mnemonic straight into one machine instruction — one-to-one, no cleverness, no fuss.','汇编官把每个助记符直接变成一条机器指令——一对一, 不耍花样, 也不啰嗦。'));
      }
      if(round.want==='compiler'){
        var cCost=translationCost(round.prog,'compiler',HOT_RUNS);
        var iCost=translationCost(round.prog,'interpreter',HOT_RUNS);
        lines.push(tx('Speed race over '+HOT_RUNS.toLocaleString()+' runs — compiler: translate once, then run object code ('+cCost.toLocaleString()+' work units). Interpreter: re-translate every single run ('+iCost.toLocaleString()+' units). The compiler wins by a mile.',
          '跑 '+HOT_RUNS.toLocaleString()+' 次的速度赛——编译官: 翻一次, 之后直接跑目标代码 ('+cCost.toLocaleString()+' 个工作单位)。解释官: 每跑一次都重翻一遍 ('+iCost.toLocaleString()+' 单位)。编译官甩开一条街。'));
      }
      log.innerHTML=lines.join('\n');
      setTimeout(function(){ advance(); }, 1400);
    }else{
      sfx('err'); onFail('sys_tr');
      lines.push('<span style="'+DIM+'">'+tx('— it works, but it is not what THIS job asked for. Read the goal again and try another translator.','—— 它能跑, 但不是本回合任务要的。再读一遍目标, 换个翻译官。')+'</span>');
      log.innerHTML=lines.join('\n');
    }
  }

  function advance(){
    var np=progress+1;
    setFlag('sys_tr_prog', np);
    if(np>=TR_ROUNDS.length){
      setFlag('sys_tr_done'); stepDone('sys_main','s3');
      scene([
        {sfx:'quest'},
        {toast:B('◈ The Babel Tower · Main Quest complete ◈ Obtained: the Source of Babel.','◈ 巴别塔 · 主线完成 ◈ 获得: 巴别之源。'), long:true},
        {give:{id:'sys_source_of_babel', name:B('Source of Babel','巴别之源')}},
        {say:{name:B('The three translators','三位翻译官'), t:B('(In unison — the only time they ever agree:) One tongue is not better than another. High-level is for humans, machine code is for the machine, and we are the ones standing in the doorway between. Translate well.',
          '(异口同声——他们唯一一次意见一致:) 没有哪种语言比另一种更高贵。高级语言是给人的, 机器码是给机器的, 而我们, 是站在两者门口的那些人。好好翻译。')}}
      ]);
      setTimeout(function(){ renderTranslate(el, api); }, 400);
    }else{
      toast(B('Round cleared. Next program loading...','本回合通过。下一段程序载入……'));
      setTimeout(function(){ renderTranslate(el, api); }, 300);
    }
  }

  attachHints(wrap,'sys_tr',[
    B('Concept — Compiler: translates the ENTIRE program before running anything, lists every error at the end, and produces object code that runs fast and often. Interpreter: translates and runs ONE line at a time, stopping the instant it hits an error (lines before it already ran). Assembler: translates assembly language (low-level) into machine code, one mnemonic to one instruction.',
      '概念——编译官 (compiler): 运行任何东西之前先把整段程序翻译完, 最后列出所有错误, 并产出运行又快又多的目标代码。解释官 (interpreter): 一次翻译并运行一行, 一撞到错误就当场停 (它之前的行已经跑过了)。汇编官 (assembler): 把汇编语言 (低级) 翻成机器码, 一个助记符对一条指令。'),
    B('Apply — match the goal to the behaviour: want partial execution + the exact failing line? That is the line-by-line one. Given assembly? Only one translator speaks it. Want fastest repeated runs via reusable object code? That is the translate-once one.',
      '应用——把目标对上行为: 要"部分执行 + 精确到出错那一行"? 那就是逐行的那位。给的是汇编? 只有一位翻译官会说它。要"靠可复用目标代码把重复运行跑到最快"? 那就是"只翻一次"的那位。'),
    B('Worked example (a job from OUTSIDE these rounds) — "my script runs once a year, and when it breaks I want to fix exactly the line that broke": read off the requirements → runs rarely, so object-code speed buys nothing; needs a partial run that halts on the precise faulty line → hint 1\'s table says exactly one translator behaves like that. Do the same for each round here: circle the ONE deciding requirement in the goal text (a partial run with a precise stop? the source is written in assembly itself? reusable object code for a million runs?) — each of those properties belongs to exactly one row of the table.',
      '例子(这三回合之外的一单活)——「我的脚本一年才跑一次, 坏了的时候我要精确修坏掉的那一行」: 把需求读出来 → 很少运行, 目标代码的速度优势毫无意义; 要"部分执行 + 停在出错那一行" → 提示 1 的表里恰好只有一位翻译官是这个行为。对这里的每个回合做同样的事: 把目标里那一个决定性的需求圈出来 (要部分执行、精确停? 源码本身就是汇编? 要可复用目标代码跑一百万次?)——每种性质在表里恰好只属于一行。')
  ]);
}

/* ================================================================
   6. 谜题 4 (支线) · IDE 工作台 · 单步调试器 (§5.2 IDE)
   ================================================================ */
function renderIDE(el, api){ _api(api);
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:540px;max-width:720px;'+TXT);
  header(wrap, tx('IDE Workbench · The Debugger','IDE 工作台 · 调试器'), 'IDE §5.2');

  if(getFlag('sys_ide_done')){
    mk(wrap,'div','',tx('The apprentice\'s half-built IDE now has a working debugger bolted on. It blinks a proud little cursor.<br><span style="'+DIM+'">An IDE bundles the tools a programmer needs — editor, error diagnostics, breakpoints, single-stepping, a variable watch, syntax highlighting — into one workshop.</span>',
      '学徒那台半成品 IDE, 现在装上了一个能用的调试器。它骄傲地眨着一个小小的光标。<br><span style="'+DIM+'">IDE 把程序员要用的工具——编辑器、错误诊断、断点 (breakpoint)、单步执行 (single-step)、变量监视 (watch)、语法高亮——全都装进同一个工坊。</span>'));
    mk(wrap,'button',BTN,tx('Leave','离开')).onclick=function(){ API.closePanel&&API.closePanel(); };
    return;
  }

  mk(wrap,'div','',tx(
    'This little program should end with <b style="'+K+'">x = 9</b>, but it ends with <b style="color:#ff8080">x = 15</b>. Use the IDE\'s debugger: <span style="'+K+'">single-step</span> through it, <span style="'+K+'">watch</span> x change, and set a <span style="'+K+'">breakpoint</span> on the line where x first goes wrong.',
    '这段小程序本该以 <b style="'+K+'">x = 9</b> 结束, 却停在了 <b style="color:#ff8080">x = 15</b>。用 IDE 的调试器: <span style="'+K+'">单步执行</span>过一遍, <span style="'+K+'">监视</span> x 的变化, 然后在 x 第一次出错的那一行下一个<span style="'+K+'">断点</span>。'));

  var actual=traceProgram(IDE_ACTUAL);
  var intended=traceProgram(IDE_INTENDED);
  var bugLine=firstDivergence(actual, intended);
  var stepAt=-1;

  var codeBox=mk(wrap,'div','margin:12px 0;font-family:monospace;font-size:13px;');
  var rowEls=[];
  IDE_ACTUAL.forEach(function(op,i){
    var r=mk(codeBox,'div','display:flex;align-items:center;gap:8px;padding:3px 6px;border-left:3px solid transparent;cursor:pointer;border-radius:2px;','');
    mk(r,'div','flex:0 0 24px;'+DIM, (i+1)+'|');
    mk(r,'div','flex:1;color:#cfeecf;', esc(op.code));
    var w=mk(r,'div','flex:0 0 96px;text-align:right;'+DIM, '');
    r.onclick=function(){ setBreak(i); };
    rowEls.push({row:r, watch:w});
  });

  var watchLine=mk(wrap,'div',K+'font-size:12.5px;margin:4px 0;', tx('watch  x = —  (not stepping yet)','监视  x = —  (还没开始单步)'));
  var ctl=mk(wrap,'div','display:flex;gap:10px;margin:8px 0;');
  var msg=mk(wrap,'div','min-height:34px;margin-top:6px;font-size:12px;color:#ffce3a;line-height:1.6;');

  function paintStep(){
    rowEls.forEach(function(re,i){
      re.row.style.background=(i===stepAt)?'#123f12':'transparent';
      re.row.style.borderLeftColor=(i===stepAt)?'#7CFC00':'transparent';
      re.watch.textContent=(i<=stepAt && stepAt>=0)?('x = '+actual[i]):'';
      re.watch.style.color=(i<=stepAt && intended[i]!==actual[i])?'#ff8080':'#4a7a4a';
    });
    if(stepAt>=0){
      watchLine.innerHTML=tx('watch  x = '+actual[stepAt]+'   ','监视  x = '+actual[stepAt]+'   ')+
        (actual[stepAt]!==intended[stepAt]?'<span style="color:#ff8080">'+tx('(expected '+intended[stepAt]+' — diverged!)','(预期 '+intended[stepAt]+'——偏离了!)')+'</span>':'<span style="color:#7CFC00">'+tx('(as expected)','(与预期一致)')+'</span>');
    }
  }
  mk(ctl,'button',BTN_HOT,tx('▸ Step','▸ 单步')).onclick=function(){
    if(stepAt<IDE_ACTUAL.length-1){ stepAt++; sfx('ui'); paintStep(); }
    else { msg.textContent=tx('End of program. x = '+actual[actual.length-1]+'. Now click the line where x first went wrong.','程序结束。x = '+actual[actual.length-1]+'。现在点 x 第一次出错的那一行。'); }
  };
  mk(ctl,'button',BTN,tx('⟲ Restart','⟲ 重来')).onclick=function(){ stepAt=-1; sfx('ui'); paintStep(); watchLine.textContent=tx('watch  x = —  (not stepping yet)','监视  x = —  (还没开始单步)'); };
  mk(wrap,'div',DIM, tx('(click a line number to set a breakpoint there = your diagnosis of the buggy line)','(点行号在那行下断点 = 你对"哪行是 bug"的判断)'));

  function setBreak(i){
    if(i===bugLine){
      sfx('ok');
      rowEls[i].row.style.background='#3a2c08'; rowEls[i].row.style.borderLeftColor='#ffce3a';
      msg.innerHTML=tx('<span style="color:#7CFC00">✓ Breakpoint on line '+(i+1)+' — correct.</span> That is where x jumped to 15 instead of 7: the line multiplies when it should add. Stepping + watching a variable is how you corner a bug without guessing.',
        '<span style="color:#7CFC00">✓ 断点下在第 '+(i+1)+' 行——正确。</span>就是这里 x 蹦到了 15 而不是 7: 这行做了乘法, 本该做加法。单步 + 监视变量, 就是不靠猜把 bug 逼到墙角的办法。');
      setFlag('sys_ide_done'); stepDone('sys_ide','s2');
      scene([
        {toast:B('◈ Side quest complete: Build the Debugger. The apprentice\'s IDE draws its first breath.','◈ 支线完成: 造一个调试器。学徒的 IDE 第一次喘上气。'), long:true},
        {give:{id:'sys_ide_kit', name:B('Debugger Module','调试器模块')}}
      ]);
      setTimeout(function(){ renderIDE(el, api); }, 400);
    }else{
      sfx('err'); onFail('sys_ide');
      msg.innerHTML=tx('<span style="color:#ff8080">Not the first wrong step.</span> Step through and watch x: it matches the intended value until one line — set the breakpoint on THAT line.',
        '<span style="color:#ff8080">不是第一个出错的地方。</span>单步过去看 x: 它一直和预期值相同, 直到某一行——把断点下在<b>那一行</b>。');
    }
  }

  paintStep();
  attachHints(wrap,'sys_ide',[
    B('Concept — a breakpoint pauses the program at a chosen line; single-stepping runs one line at a time; a watch shows a variable\'s current value. Together they let you see exactly when a value becomes wrong.',
      '概念——断点 (breakpoint) 让程序停在你指定的一行; 单步 (single-step) 一次只跑一行; 监视 (watch) 显示某个变量的当前值。三者合起来, 让你精确看到一个值是从什么时候开始变错的。'),
    B('Apply — step from the top, comparing x to the intended value each line. The first line where they differ is the bug.',
      '应用——从头单步, 每一行都把 x 和预期值比一下。第一个不相等的行, 就是 bug。'),
    B('Worked example (a different program) — intended trace: 2 → 6 → 7; actual trace: 2 → 8 → 9. Compare position by position: step 1 matches (2 = 2), step 2 differs (6 vs 8) → the bug lives on line 2, breakpoint there. Note line 3 ALSO shows a wrong value (7 vs 9) — but it is only inheriting the damage; the breakpoint goes on the FIRST divergence, never a later one. Now build both traces for your program: step through, writing x down after every line for the intended and the actual run, and stop at the first mismatch.',
      '例子(换了一段程序)——预期轨迹: 2 → 6 → 7; 实际轨迹: 2 → 8 → 9。逐位置比对: 第 1 步一致 (2 = 2), 第 2 步不同 (6 vs 8) → bug 在第 2 行, 断点下在那儿。注意第 3 行的值也是错的 (7 vs 9)——但它只是在继承伤害; 断点永远下在第一次偏离处, 不是后面。现在给你的程序建这两条轨迹: 单步走, 每行之后把预期的 x 和实际的 x 都记下来, 停在第一处不一致。')
  ]);
}

/* ================================================================
   7. 谜题 5 (隐藏) · 塔顶 · 被编译过的诗 (§5.2 彩蛋)
   ================================================================ */
function renderBabel(el, api){ _api(api);
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:520px;max-width:680px;'+TXT);
  header(wrap, tx('Above the Top Floor · The Compiled Poem','最上层之上 · 被编译过的诗'), 'HIDDEN');

  if(getFlag('sys_babel_done')){
    mk(wrap,'div','',
      '<div style="'+K+'font-size:14px;line-height:2;text-align:center;font-style:italic;margin:10px 0;">'+
      POEM_PLAIN.map(function(l){return esc(l);}).join('<br>')+'</div>'+
      tx('<span style="'+DIM+'">Someone up here, twenty years ago, ran a poem through a compiler — as if to see whether meaning survives translation. It mostly did.</span>',
         '<span style="'+DIM+'">二十年前, 有人在塔顶把一首诗喂进了编译器——像是想看看, 意义能不能熬过一次翻译。大体上, 熬过来了。</span>'));
    mk(wrap,'button',BTN,tx('Leave','离开')).onclick=function(){ API.closePanel&&API.closePanel(); };
    return;
  }

  mk(wrap,'div','',tx(
    'A scorched stone stands above the topmost floor. The words on it were run through a compiler and came out shifted — every letter rotated by the same secret key. <span style="'+K+'">Find the key</span> to decompile the poem.',
    '最上层之上立着一块烧焦的碑。上面的字被喂进编译器、又吐了出来——每个字母都被同一把秘钥旋转了固定的格数。<span style="'+K+'">找到那把钥匙 (key)</span>, 把这首诗反编译出来。'));

  var pre=mk(wrap,'pre','background:rgba(24,20,8,.6);border:1px solid #5a4a2a;padding:10px 12px;color:#ffce3a;font-size:13px;line-height:1.9;letter-spacing:2px;border-radius:3px;text-align:center;',
    POEM_CIPHER.map(function(l){return esc(l);}).join('\n'));

  var live=mk(wrap,'pre','background:rgba(15,20,10,.5);border:1px dashed #2f6f2f;padding:10px 12px;color:#cfeecf;font-size:13px;line-height:1.9;letter-spacing:2px;border-radius:3px;text-align:center;min-height:60px;','');
  var ctl=mk(wrap,'div','margin:8px 0;');
  mk(ctl,'span','',tx('decompile key (shift 1–25): ','反编译钥匙 (位移 1–25): '));
  var inp=mk(ctl,'input','width:70px;background:#160a20;color:#ffce3a;border:1px solid #4a2a5a;font-family:inherit;padding:3px;');
  inp.type='number';
  var msg=mk(wrap,'div','min-height:30px;margin-top:6px;font-size:12px;color:#ffce3a;');

  function preview(){
    var k=parseInt(inp.value,10);
    if(isNaN(k)){ live.textContent=''; return; }
    // 反向位移 = 位移 (26-k)
    live.textContent=POEM_CIPHER.map(function(l){ return caesarShift(l, 26-((k%26+26)%26)); }).join('\n');
  }
  inp.oninput=function(){ preview(); };
  mk(ctl,'button',BTN_GOLD,tx(' Decompile ▸',' 反编译 ▸')).onclick=function(){
    var k=parseInt(inp.value,10);
    if(((k%26+26)%26)===(POEM_KEY%26)){
      sfx('ok'); preview();
      msg.innerHTML=tx('<span style="color:#7CFC00">✓ The letters fall back into words.</span>','<span style="color:#7CFC00">✓ 字母纷纷落回成词。</span>');
      setFlag('sys_babel_done'); stepDone('sys_hidden','s1'); markQuest('sys_hidden');
      scene([
        {toast:B('◈ Hidden complete: The Compiled Poem. Some meaning survives translation.','◈ 隐藏完成: 被编译过的诗。有些意义, 熬过了翻译。'), long:true},
        {give:{id:'sys_poem_scroll', name:B('Decompiled Poem','反编译的诗')}}
      ]);
      setTimeout(function(){ renderBabel(el, api); }, 500);
    }else{
      sfx('err'); onFail('sys_babel');
      msg.innerHTML=tx('<span style="color:#ff8080">Still gibberish.</span> Try each shift 1–25 and read the live preview — human words will jump out at the right key.',
        '<span style="color:#ff8080">还是乱码。</span>1–25 逐个试, 看下面的实时预览——对上钥匙, 人话会自己蹦出来。');
    }
  };
  preview();

  attachHints(wrap,'sys_babel',[
    B('Concept — this is a Caesar shift: every letter moved forward by a fixed amount. Decompiling means shifting every letter back by the same amount.',
      '概念——这是恺撒位移: 每个字母都往后挪了固定的格数。反编译就是把每个字母往回挪同样的格数。'),
    B('Apply — just try keys 1 through 25 in the box and watch the live preview until it reads like English.',
      '应用——在框里从 1 试到 25, 盯着实时预览, 直到它读起来像人话。'),
    B('Worked example (different key) — if the word "cat" had been compiled with key 3, the stone would read "fdw": c→f, a→d, t→w, every letter pushed forward 3. Typing 3 into the decompile box pulls each letter back 3 and "cat" resurfaces. Your stone used some other key, and there are only 25 candidates: sweep the box from 1 upward while staring at the shortest cipher word in the live preview — the instant it becomes a real English word, you have the key; check it against the other lines.',
      '例子(换了钥匙)——如果单词 "cat" 被用钥匙 3 编译过, 碑上就会写 "fdw": c→f, a→d, t→w, 每个字母往前推 3 格。在反编译框里填 3, 每个字母被拉回 3 格, "cat" 就浮出来了。你这块碑用的是另一把钥匙, 而候选只有 25 个: 从 1 往上扫, 盯着实时预览里最短的那个密文词——它一变成真正的英文单词, 钥匙就到手了; 再拿其余几行验一遍。')
  ]);
}

/* ================================================================
   8. NPC 对话 (dialog(api) => 节点数组; 性格 = 机制)
   ================================================================ */

/* --- 系统官 KERNEL —— OS 拟人, 疲惫的老楼管, 发主线 --- */
function kernelDialog(a){ _api(a);
  var SP=B('KERNEL','系统官 KERNEL');
  var nodes;
  if(getFlag('sys_tr_done')){
    nodes=[
      {sp:SP,t:B('The whole tower translates again — I can feel every layer talking to the one above and below it. Twenty years I ran this building with nobody to run it for. Thank you, little process.',
                 '整座塔又开始翻译了——我能感觉到每一层都在和它上下相邻的那层说话。二十年了, 我替一栋没有房客的楼当楼管。谢谢你, 小进程。')},
      {sp:SP,t:B('An operating system is a strange thing to be. You are the floor everyone stands on and nobody looks down at. <span class="dim">...The three up top still argue about which language is best. Let them. It is the most alive this place has felt in decades.</span>',
                 '当一个操作系统, 是件古怪的事。你是所有人脚下站着、却没人低头看一眼的那层地板。<span class="dim">……塔顶那三位还在吵哪种语言最好。让他们吵吧。这是这地方几十年来最有生气的一次了。</span>')}
    ];
    nodes.sig='all_done'; return nodes;
  }
  if(getFlag('sys_os_done')){
    nodes=[
      {sp:SP,t:B('Memory\'s in order, the Kernel Layer holds. All that\'s left is the <span class="k">Translation Core</span> at the very top — the reason this tower was ever built. It has been stalled for twenty years.',
                 '内存理顺了, 内核层稳住了。只剩最顶上的<span class="k">翻译核心</span>——这座塔当初就是为它而建的。它停摆了二十年。')},
      {sp:SP,t:B('Three translators guard it. Fair warning: they don\'t so much explain themselves as <span class="k">behave like what they are</span>. Watch how each one moves. That IS the lesson.',
                 '三位翻译官守着它。提醒你: 他们与其说会解释自己, 不如说会<span class="k">活成自己本来的样子</span>。看他们各自怎么动——那就是答案。')}
    ];
    nodes.sig='os_done'; return nodes;
  }
  if(getFlag('sys_util_done')){
    nodes=[
      {sp:SP,t:B('Gears turning again. Next: the <span class="k">Kernel Layer</span> just above. Its memory map is a mess — programs squatting wherever they landed. Sort out who gets which memory. That\'s my oldest job.',
                 '齿轮又转起来了。接下来: 就在上面的<span class="k">内核层</span>。它的内存图乱成一团——程序落在哪就赖在哪。理清楚谁分到哪段内存。那是我最老的一份差事。')}
    ];
    nodes.sig='util_done'; return nodes;
  }
  nodes=[
    {sp:SP,t:B('Halt — oh. Not a job. A <span class="k">process</span>. A live one. It has been a long time since anything alive climbed in here.',
               '站住——哦。不是个任务 (job)。是个<span class="k">进程 (process)</span>。还是活的。已经很久没有活的东西爬进来了。')},
    {sp:SP,t:B('I\'m KERNEL. I\'m what you\'d call the <span class="k">operating system</span> of this place — I share out the memory and the one processor, herd the input and output, keep the files straight, and hand visitors an interface so they never have to see the machinery. This is the <span class="k">Babel Tower</span>: where every language in the machine gets translated so the parts can understand each other.',
               '我是 KERNEL。我就是这地方你们所说的<span class="k">操作系统 (operating system)</span>——我分配内存和那唯一一颗处理器, 赶着输入和输出, 把文件理清楚, 再递给访客一个界面, 好让他们永远不必看见底下的机器。这里是<span class="k">巴别塔</span>: 机器里的每一种语言都在这里互译, 好让各个零件听懂彼此。')},
    {sp:SP,t:B('Twenty years ago the Translation Core stalled and the tower went quiet. Want to wake it? Then help me put my own house back in order, floor by floor.',
               '二十年前翻译核心停摆, 塔就哑了。想唤醒它? 那就帮我把自己这栋楼一层一层重新收拾好。'),choices:[
      {t:B('Where do I start?','从哪开始?'),next:3},
      {t:B('What exactly does an OS do?','操作系统到底是干嘛的?'),next:4}
    ]},
    {sp:SP,t:B('The <span class="k">Utility Wing</span>, one floor up. Two housekeeping tools have seized: the defragmenter and the virus checker. Run them and the tower\'s lower gears free up. The console\'s in the middle of the room.',
               '上一层的<span class="k">实用工具间</span>。两个保洁工具卡死了: 碎片整理和病毒扫描。跑通它们, 塔的底层齿轮就松开了。控制台在房间正中。'),next:-1,do:function(){
      if(!getFlag('sys_metKernel')){ setFlag('sys_metKernel'); sfx('quest');
        toast(B('◇ Main quest: Restart the Babel Tower — repair the tower floor by floor and wake the Translation Core.','◇ 主线: 重启巴别塔——一层层修好塔, 唤醒翻译核心。')); }
    }},
    {sp:SP,t:B('An OS is the <span class="k">middle-manager between hardware and everything else</span>. It hands out memory and processor time so programs don\'t fight; it deals with disks, keyboards, screens; it manages files and security; and it gives you an interface — a screen you can point at — instead of raw switches. Utility software (defraggers, backups, virus checkers, compression) are the small helper tools that live alongside it.',
               '操作系统是<span class="k">硬件和其余一切之间的中层管理者</span>。它发放内存和处理器时间, 好让程序不打架; 它对付磁盘、键盘、屏幕; 它管理文件和安全; 它还给你一个界面——一块你能指指点点的屏幕, 而不是一排裸开关。实用工具 (碎片整理、备份、病毒扫描、压缩) 是傍着它一起住的那些小帮手。'),next:2}
  ];
  nodes.sig='intro'; return nodes;
}

/* --- 编译官 —— 沉默寡言, 一次说完, 说完才动 --- */
function compilerDialog(a){ _api(a);
  var SP=B('The Compiler','编译官');
  var nodes=[
    {sp:SP,t:B('<span class="dim">(It does not look up until it has finished forming the entire sentence in its head. Then, all at once:)</span>',
               '<span class="dim">(它不抬头, 直到把整句话在脑子里完整成形。然后, 一口气:)</span>')},
    {sp:SP,t:B('I read the whole program before I say a single word. I find every error there is, and I report them together, at the end — never one at a time. If it is clean, I hand back <span class="k">object code</span>: a finished thing, ready to run, fast, as many times as you like. If it is not clean, I hand back nothing. <span class="k">All, or nothing.</span> That is not coldness. That is a guarantee.',
               '开口之前, 我要把整段程序读完。所有的错误, 我一次找齐, 最后一并报出——绝不一个一个来。若它干净, 我交还<span class="k">目标代码 (object code)</span>: 一件成品, 随时可跑, 又快, 想跑几次跑几次。若它不干净, 我什么都不交。<span class="k">全有, 或全无。</span>这不是冷漠, 是一种担保。')},
    {sp:SP,t:B('The interpreter downstairs thinks I am slow to start. I think it is quick to give up halfway. We have not spoken in nineteen years. ...The prediction bench is behind me. Bring me a program. I will tell you everything wrong with it — once.',
               '楼下那位解释官嫌我起步慢。我嫌它半途弃得快。我们十九年没说过话了。……预测台在我身后。给我一段程序。它所有的毛病, 我一次告诉你。'),next:-1}
  ];
  nodes.sig='idle'; return nodes;
}

/* --- 解释官 —— 话痨, 边说边做, 错了当场停 --- */
function interpreterDialog(a){ _api(a);
  var SP=B('The Interpreter','解释官');
  var nodes=[
    {sp:SP,t:B('Oh hi hi hi! A visitor! Okay so I\'ll just start talking and we\'ll see how far we get, that\'s literally my whole method, I take things <span class="k">one line at a time</span> and I do each one <span class="k">right now</span>, no waiting, no reading ahead, so line one: hello! line two: welcome! line three—',
               '哦嗨嗨嗨! 有访客! 好那我就直接开说, 走一步看一步, 这基本就是我的全部方法, 我<span class="k">一次只处理一行</span>, 而且<span class="k">当场</span>就做, 不等、不预读, 所以第一行: 你好! 第二行: 欢迎! 第三行——')},
    {sp:SP,t:B('—wait, is that a syntax error in your face? You look confused. <span class="dim">See? THAT is what I do.</span> The instant I hit something wrong, I <span class="k">stop dead, right there</span>. Everything before it already happened — I can\'t take it back. And I never bother making object code, because I re-translate the whole thing fresh <span class="k">every single time you run it</span>. Slower over a million runs. But when you\'re still writing it and it breaks every ten seconds? I\'m the friend who tells you <span class="k">exactly where</span>, immediately.',
               '——等等, 你脸上是不是有个语法错误? 你看着一脸懵。<span class="dim">看见没? 我就是这样。</span>一撞上不对的地方, 我就<span class="k">当场、就地、立刻停死</span>。在那之前发生的一切都已经发生了——收不回来。我也从不费劲去做目标代码, 因为<span class="k">你每运行一次, 我就把整段重新翻一遍</span>。跑一百万次是慢些。可当你还在写、它每十秒崩一次的时候? 我就是那个<span class="k">立刻告诉你错在哪一行</span>的朋友。'),next:-1}
  ];
  nodes.sig='idle'; return nodes;
}

/* --- 汇编官 —— 老兵, 只处理最底层的话; 发支线 sys_asm --- */
function assemblerDialog(a){ _api(a);
  var SP=B('The Assembler','汇编官');
  var nodes;
  if(getFlag('sys_asm_done')){
    nodes=[
      {sp:SP,t:B('LDM, ADD, STO, OUT. One line, one instruction. No frills, no cleverness, no arguments about "elegance." <span class="dim">You listened to an old soldier ramble. Not many do.</span> The machine and I understand each other. That has always been enough.',
                 'LDM, ADD, STO, OUT。一行, 一条指令。不加花边, 不耍聪明, 不争论什么"优雅"。<span class="dim">你听一个老兵唠叨完了。没几个人肯。</span>机器和我彼此听得懂。这一直就够了。')},
      {sp:SP,t:B('…If you want to see "one line, one instruction" grown a heartbeat, visit the Core Vault — eight cores, and every beat of theirs is exactly one instruction. Old comrades of mine. <span class="dim">Tell the punch-clock I still keep time.</span>',
                 '……想看看「一行一条」长出心跳的样子, 就去核心机房——八颗核心, 每一跳恰好是一条指令。都是我的老战友。<span class="dim">替我带句话给那台打卡钟: 我这边的表, 还准着。</span>')}
    ];
    nodes.sig='done'; return nodes;
  }
  if(getFlag('sys_asm_met')){
    nodes=[
      {sp:SP,t:B('Back already? Then hear the rest. High-level languages — the compiler\'s and interpreter\'s trade — one line of theirs becomes <span class="k">many</span> machine instructions. Mine is different. <span class="k">Assembly is one-to-one:</span> each mnemonic I translate becomes exactly one machine instruction. LDM #65 → one instruction. No expansion, no magic.',
                 '这就回来了? 那把剩下的听完。高级语言——编译官和解释官的行当——他们的一行会变成<span class="k">很多条</span>机器指令。我不一样。<span class="k">汇编是一对一的:</span> 我翻译的每个助记符, 恰好变成一条机器指令。LDM #65 → 一条指令。不膨胀, 不变魔术。')},
      {sp:SP,t:B('That is why they keep me down at the bottom, closest to the hardware. Somebody has to speak the last language before there are no more words, only voltages. <span class="dim">Give me a line of assembly on the bench sometime. I will show you what one-to-one looks like.</span>',
                 '所以他们把我留在最底下, 离硬件最近。总得有人说出最后一门语言——再往下就没有词了, 只剩电压。<span class="dim">哪天在台子上给我一行汇编。我让你看看什么叫一对一。</span>'),next:-1,do:function(){
        if(!getFlag('sys_asm_done')){ setFlag('sys_asm_done'); stepDone('sys_asm','s2'); markQuest('sys_asm'); sfx('quest');
          toast(B('◈ Side quest complete: The Old Soldier\'s Language.','◈ 支线完成: 老兵的语言。')); }
      }}
    ];
    nodes.sig='met'; return nodes;
  }
  nodes=[
    {sp:SP,t:B('<span class="dim">(An old machine-daemon, edges worn smooth, sitting where the tower meets the hardware.)</span><br>You climbed all the way up here to talk to the <span class="k">assembler</span>? Most young processes want the fancy translators. Nobody wants the one who only speaks to the metal.',
               '<span class="dim">(一个老机器 daemon, 棱角都磨圆了, 坐在塔与硬件接壤的地方。)</span><br>你一路爬上来, 是想跟<span class="k">汇编官 (assembler)</span> 说话? 大多数年轻进程想找那些花哨的翻译器。没人想找只跟金属说话的这一个。'),choices:[
      {t:B('I want to hear the oldest language. Tell me.','我想听最老的那门语言。讲讲。'),next:1},
      {t:B('Just passing through.','就路过。'),next:-1}
    ]},
    {sp:SP,t:B('Heh. Then sit. I translate <span class="k">assembly language</span> — the thin layer of human-readable names sitting right on top of raw machine code. LDM, ADD, STO, JMP. Come back and I\'ll tell you the one thing that makes me different from those two upstairs. <span class="dim">It\'s the word "one-to-one."</span>',
               '嘿。那坐。我翻译<span class="k">汇编语言 (assembly)</span>——紧贴在裸机器码上头、那薄薄一层人能读的名字。LDM, ADD, STO, JMP。回头再来, 我告诉你我和楼上那两位到底哪里不一样。<span class="dim">关键词是"一对一"。</span>'),next:-1,do:function(){
      if(!getFlag('sys_asm_met')){ setFlag('sys_asm_met'); stepDone('sys_asm','s1'); sfx('quest');
        toast(B('◇ Side quest: The Old Soldier\'s Language — hear the assembler out.','◇ 支线: 老兵的语言——听汇编官讲完。')); }
    }}
  ];
  nodes.sig='intro'; return nodes;
}

/* --- IDE 学徒 —— 在拼一台 IDE, 发支线 sys_ide --- */
function apprenticeDialog(a){ _api(a);
  var SP=B('IDE Apprentice','IDE 学徒');
  var nodes;
  if(getFlag('sys_ide_done')){
    nodes=[
      {sp:SP,t:B('The debugger works! Breakpoints, single-step, a variable watch — all wired in. My IDE is finally more than a text box. <span class="dim">One workshop, all the tools. That was the whole dream.</span> Thank you.',
                 '调试器能用了! 断点、单步、变量监视——全接上了。我这台 IDE 总算不只是个文本框了。<span class="dim">一个工坊, 所有工具。这就是整个梦想。</span>谢谢你。')}
    ];
    nodes.sig='done'; return nodes;
  }
  if(getFlag('sys_ide_met')){
    nodes=[
      {sp:SP,t:B('The workbench is right there. The test program should end at x=9 but comes out 15. Use the debugger I roughed in — <span class="k">step, watch, breakpoint</span> — and pin the bad line. That proves the debugger works, and my IDE gets its heartbeat.',
                 '工作台就在那边。测试程序本该以 x=9 收尾, 却跑出 15。用我搭的那个调试器毛坯——<span class="k">单步、监视、断点</span>——把坏的那行钉住。这就证明调试器能用, 我的 IDE 也就有了心跳。'),next:-1}
    ];
    nodes.sig='met'; return nodes;
  }
  nodes=[
    {sp:SP,t:B('Hi! Don\'t mind the mess. I\'m building an <span class="k">IDE — Integrated Development Environment</span>. It\'s where a programmer keeps everything in one place: the editor, syntax highlighting, error messages, auto-complete, and the debugger. I\'ve got everything... except the debugger actually working.',
               '嗨! 别嫌乱。我在造一台 <span class="k">IDE——集成开发环境</span>。就是程序员把所有东西放在一处的地方: 编辑器、语法高亮、错误提示、自动补全, 还有调试器。别的我都有了……就差调试器真能用。'),choices:[
      {t:B('I\'ll help you finish the debugger.','我来帮你把调试器做完。'),next:1},
      {t:B('What\'s a debugger for?','调试器是干嘛用的?'),next:2}
    ]},
    {sp:SP,t:B('Really? Amazing. The workbench is set up with a buggy test program. Make the debugger catch the bug and you\'ve proven it works.',
               '真的? 太好了。工作台上摆好了一段有 bug 的测试程序。让调试器抓到那个 bug, 就证明它能用了。'),next:-1,do:function(){
      if(!getFlag('sys_ide_met')){ setFlag('sys_ide_met'); stepDone('sys_ide','s1'); sfx('quest');
        toast(B('◇ Side quest: Build the Debugger — catch the bug at the IDE workbench.','◇ 支线: 造一个调试器——在 IDE 工作台上抓出 bug。')); }
    }},
    {sp:SP,t:B('It lets you stop a program mid-run and look inside — set a <span class="k">breakpoint</span> to pause on a line, <span class="k">single-step</span> one line at a time, and <span class="k">watch</span> a variable\'s value change. Instead of guessing why your code is wrong, you catch it in the act.',
               '它让你把程序在半途叫停、往里看——下<span class="k">断点 (breakpoint)</span> 停在某一行, <span class="k">单步 (single-step)</span> 一行一行走, 再<span class="k">监视 (watch)</span> 一个变量的值怎么变。不用猜代码为什么错, 而是当场抓现行。'),next:0}
  ];
  nodes.sig='intro'; return nodes;
}

/* ================================================================
   9. 室内地图: 21 × 25 —— 一座塔的剖面, 由下往上四段
   #=墙(1) .=地板(0); 中央 x=10 是贯通楼梯井(分隔层唯一开口)
   下→上: 大厅(y19-23) → 工具间(y13-17) → 内核层(y7-11) → 翻译核心(y1-5)
   离入口 BFS 越远(越高)越难: util < os < translate (测试断言)
   坐标经 _test 脚本校验: 边界封闭 · 全部实体在地板 · 单连通分量
   ================================================================ */
var ROWS=[
  '#####################',  // 0
  '#...................#',  // 1  翻译核心: 编译官(4,2) 解释官(16,2) 汇编官(4,4)
  '#...................#',  // 2  IDE学徒(16,4) 翻译台(10,3) IDE台(13,4)
  '#...................#',  // 3  译官誓词碑(10,1) 汇编官往事碑(2,4?) 巴别诗(18,1)
  '#...................#',  // 4
  '#...................#',  // 5
  '##########.##########',  // 6  分隔层, 楼梯井 x=10
  '#...................#',  // 7  内核层: KERNEL(6,9) 内存台(10,9)
  '#...................#',  // 8  OS职责碑(15,8) KERNEL值班碑(3,10)
  '#...................#',  // 9
  '#...................#',  // 10
  '#...................#',  // 11
  '##########.##########',  // 12 分隔层, 楼梯井 x=10
  '#...................#',  // 13 工具间: 工具台(10,15)
  '#...................#',  // 14 工具碑(5,14) 保洁员故事碑(15,14)
  '#...................#',  // 15
  '#...................#',  // 16
  '#...................#',  // 17
  '##########.##########',  // 18 分隔层, 楼梯井 x=10
  '#...................#',  // 19 大厅
  '#...................#',  // 20 塔基故事碑(4,20) 三译官故事碑(16,20)
  '#...................#',  // 21 出生点(10,22)
  '#...................#',  // 22
  '#...................#',  // 23
  '#####################'   // 24
];
var TILES=ROWS.map(function(r){ return r.split('').map(function(c){ return c==='#'?1:0; }); });
var IW=ROWS[0].length, IH=ROWS.length;

/* ================================================================
   10. 模块定义
   ================================================================ */
var MOD={
  id:'sys',
  title:B('The Babel Tower','巴别塔'),
  world:'as',
  unlock:{afterQuest:'m3'},   // 进入 AS 开放世界即可达 (补充章节, 不挡全局主线)

  interior:{ w:IW, h:IH, tiles:TILES, playerStart:{x:10, y:22} },

  npcs:[
    {id:'sys_kernel', name:B('KERNEL','系统官 KERNEL'), color:'#7CFC00', body:'#bfeebf', suit:'#2a4a2a', kind:'npc',
     x:6, y:9, dialog:kernelDialog},
    {id:'sys_compiler', name:B('The Compiler','编译官'), color:'#5ac8fa', body:'#cfe8ff', suit:'#234a6a', kind:'npc',
     x:4, y:2, dialog:compilerDialog},
    {id:'sys_interpreter', name:B('The Interpreter','解释官'), color:'#ff8ab0', body:'#ffd0e0', suit:'#6a2a44', kind:'npc',
     x:16, y:2, dialog:interpreterDialog},
    {id:'sys_assembler', name:B('The Assembler','汇编官'), color:'#c9a24a', body:'#e8d29a', suit:'#4a3a1a', kind:'npc',
     x:4, y:4, dialog:assemblerDialog},
    {id:'sys_apprentice', name:B('IDE Apprentice','IDE 学徒'), color:'#b48aff', body:'#dcc9ff', suit:'#3a2a5a', kind:'npc',
     x:16, y:4, dialog:apprenticeDialog}
  ],

  puzzles:[
    {id:'sys_p_util', x:10, y:15, kind:'puzzleStation',
     title:B('Utility Wing · Housekeeping Console','实用工具间 · 保洁控制台'),
     syllabus:'5.1 System Software: utility software (defragmenter, virus checker)',
     codex:['sys-utility'],
     primer:{title:B('What is utility software?','什么是实用工具 (utility software)?'),
       body:B(
         '<b>In one line:</b> utility software is a small helper tool that maintains a computer system — it doesn\'t do your work, it keeps the machine fit to do it.<br>'+
         '<pre style="color:#8fbf8f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
         'defragmenter  — reunites each file\'s scattered blocks into one run\n'+
         'virus checker — scans files for known malware signatures\n'+
         'backup        — keeps safe copies of your data\n'+
         'compression   — shrinks files to save space</pre>'+
         '<b>Like:</b> the cleaning and maintenance crew of a building — invisible when they work, sorely missed when they don\'t.<br>'+
         '<b>Why you need it here:</b> run two utilities — defrag the disk (make each file contiguous), then scan the files and quarantine the one carrying the virus signature.',
         '<b>一句话:</b> 实用工具 (utility software) 是维护电脑系统的小帮手——它不替你干活, 它让机器保持在能干活的状态。<br>'+
         '<pre style="color:#8fbf8f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
         '碎片整理 defragmenter — 把每个文件散落的块重新连成一整段\n'+
         '病毒扫描 virus checker — 扫文件, 找已知恶意软件的特征码\n'+
         '备份 backup          — 给数据留安全副本\n'+
         '压缩 compression      — 把文件缩小以省空间</pre>'+
         '<b>类比:</b> 一栋楼的保洁与维护班——干活时没人看见, 一旦不干立刻想念。<br>'+
         '<b>这题用它干嘛:</b> 跑两个工具——先给磁盘做碎片整理 (让每个文件连续), 再扫文件、把携带病毒特征码的那个隔离掉。')},
     render:renderUtil, onKey:sysKey('sys_util')},

    {id:'sys_p_os', x:10, y:9, kind:'puzzleStation',
     title:B('Kernel Layer · Memory Manager','内核层 · 内存管理器'),
     syllabus:'5.1 System Software: operating system (resource management — memory)',
     codex:['sys-os'],
     primer:{title:B('What does an operating system do?','操作系统 (OS) 是做什么的?'),
       body:B(
         '<b>In one line:</b> the operating system is the master program that manages a computer\'s resources and provides an interface between the user, the hardware, and the other software.<br>'+
         '<pre style="color:#8fbf8f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
         'manages: memory · processor · input/output · files · security\n'+
         'provides: a user interface (so you never touch raw hardware)</pre>'+
         '<b>Like:</b> the manager of an apartment building — assigns rooms (memory), schedules the one elevator (processor), handles deliveries (I/O), and keeps a directory (files), so tenants never fight over anything.<br>'+
         '<b>Why you need it here:</b> you play the OS doing one of its core jobs — memory management. Fit four programs into limited RAM with no overlaps, no overflow, and without touching the kernel\'s reserved cells.',
         '<b>一句话:</b> 操作系统 (operating system) 是管理电脑资源、并在用户/硬件/其他软件之间提供界面的主控程序。<br>'+
         '<pre style="color:#8fbf8f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
         '管理: 内存 · 处理器 · 输入/输出 · 文件 · 安全\n'+
         '提供: 用户界面 (让你永远不必碰裸硬件)</pre>'+
         '<b>类比:</b> 一栋公寓楼的楼管——分配房间 (内存)、调度那唯一一部电梯 (处理器)、处理快递 (输入输出)、维护住户名录 (文件), 好让住户永远不为任何事打架。<br>'+
         '<b>这题用它干嘛:</b> 你来当操作系统, 做它的一项核心工作——内存管理。把四个程序塞进有限的 RAM, 不重叠、不越界, 也别碰内核预留的格子。')},
     render:renderOS, onKey:sysKey('sys_os')},

    {id:'sys_p_translate', x:10, y:3, kind:'puzzleStation',
     title:B('The Translation Core · Prediction Bench','翻译核心 · 翻译预测台'),
     syllabus:'5.2 System Software: compiler vs interpreter vs assembler',
     codex:['sys-translators'],
     primer:{title:B('Compiler vs interpreter vs assembler','编译器 vs 解释器 vs 汇编器'),
       body:B(
         '<b>In one line:</b> all three are translators that turn source code into something the computer can run — but they differ in <b>when</b> they report errors, <b>whether</b> they run the code partly, and <b>whether</b> they produce reusable object code.<br>'+
         '<pre style="color:#e8c46a;background:rgba(30,25,5,.4);border:1px solid #4a3a1a;padding:6px 8px;margin:6px 0;font-size:11px;line-height:1.5;">'+
         '            translates      errors reported   object code?  speed\n'+
         'COMPILER    whole program   all, at the end   YES           fast to re-run\n'+
         'INTERPRETER line by line    at first bad line NO            slower (re-translates)\n'+
         'ASSEMBLER   assembly 1:1    at assemble time  YES (machine) —</pre>'+
         '<b>Like:</b> a compiler is a translator who reads your whole letter, hands back a finished translation, and lists all your mistakes at once. An interpreter reads and speaks aloud one line at a time, stopping the moment a line makes no sense.<br>'+
         '<b>Why you need it here:</b> three rounds. Each round states a goal (see a partial run? handle assembly? run a million times fast?) — pick the translator whose behaviour matches, and watch it play out.',
         '<b>一句话:</b> 三者都是把源码变成电脑能运行之物的翻译器——但它们的区别在于<b>何时</b>报错、<b>是否</b>部分执行代码、<b>是否</b>产出可复用的目标代码。<br>'+
         '<pre style="color:#e8c46a;background:rgba(30,25,5,.4);border:1px solid #4a3a1a;padding:6px 8px;margin:6px 0;font-size:11px;line-height:1.5;">'+
         '              翻译方式      何时报错        目标代码?    速度\n'+
         '编译器 COMPILER  整段一起    最后一次性全报  有           重复运行快\n'+
         '解释器 INTERP.   逐行        遇第一个错就报  无           较慢(每次重翻)\n'+
         '汇编器 ASSEMBLER 汇编 1对1   汇编时          有(机器码)   —</pre>'+
         '<b>类比:</b> 编译器像一个把你整封信读完、交还一份成稿、再一次性列出你所有错误的翻译。解释器则一行一行读出声, 一撞到读不通的句子就当场停。<br>'+
         '<b>这题用它干嘛:</b> 三个回合。每回合给一个目标 (要看部分执行? 处理汇编? 跑一百万次要快?)——选行为对得上的翻译官, 看它当场演给你。')},
     render:renderTranslate, onKey:sysKey('sys_tr')},

    {id:'sys_p_ide', x:13, y:4, kind:'puzzleStation',
     title:B('IDE Workbench · The Debugger','IDE 工作台 · 调试器'),
     syllabus:'5.2 System Software: IDE features (debugger — breakpoint, single-step, watch)',
     codex:['sys-ide'],
     primer:{title:B('What is an IDE?','什么是 IDE?'),
       body:B(
         '<b>In one line:</b> an IDE (Integrated Development Environment) bundles all the tools a programmer needs into one program — editor, error diagnostics, auto-complete, syntax highlighting, and a debugger.<br>'+
         '<pre style="color:#8fbf8f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
         'breakpoint    — pause the program on a chosen line\n'+
         'single-step   — run one line at a time\n'+
         'watch         — show a variable\'s value as it changes</pre>'+
         '<b>Like:</b> a mechanic\'s full workshop instead of a single spanner — everything for the job, on one bench.<br>'+
         '<b>Why you need it here:</b> a program should end at x=9 but gives 15. Single-step through it, watch x, and set a breakpoint on the line where x first goes wrong.',
         '<b>一句话:</b> IDE (集成开发环境) 把程序员需要的所有工具装进同一个程序——编辑器、错误诊断、自动补全、语法高亮, 还有调试器。<br>'+
         '<pre style="color:#8fbf8f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
         '断点 breakpoint  — 让程序停在你选的一行\n'+
         '单步 single-step — 一次只跑一行\n'+
         '监视 watch       — 实时显示某变量的值</pre>'+
         '<b>类比:</b> 一整间机修工坊, 而不是一把扳手——干活要用的全都在同一张台子上。<br>'+
         '<b>这题用它干嘛:</b> 一段程序本该以 x=9 收尾却给出 15。单步过一遍、监视 x, 在 x 第一次出错的那行下断点。')},
     render:renderIDE, onKey:sysKey('sys_ide')},

    {id:'sys_p_babel', x:18, y:1, kind:'stele',
     title:B('The Compiled Poem','被编译过的诗'),
     syllabus:'5.2 System Software: translators (easter egg)',
     codex:['sys-translators'],
     render:renderBabel, onKey:sysKey('sys_babel')}
  ],

  steles:[
    /* --- 剧情类 (零知识门槛) --- */
    {x:4, y:20, kind:'stele', title:B('Tower-Base Inscription','塔基铭文'),
     text:B(
       '"They built this tower after the machine grew too big to speak with one voice.<br><br>'+
       'The disk spoke in blocks. The processor spoke in pulses. The screen spoke in light. '+
       'None of them could understand the others, and a machine whose parts cannot understand each other is just a very heavy paperweight.<br><br>'+
       'So they raised the <span class="k">Babel Tower</span>: a place where every language in the machine is carried up, translated, and carried back down — so the parts could, at last, agree on what they meant."',
       '「机器长得太大、再也无法用一个声音说话之后, 他们建了这座塔。<br><br>'+
       '磁盘用块说话。处理器用脉冲说话。屏幕用光说话。谁也听不懂谁——而一台各个零件互不相通的机器, 只是一块很重的镇纸。<br><br>'+
       '于是他们竖起了<span class="k">巴别塔</span>: 机器里的每一种语言都被抬上来、译过、再抬下去——好让各个零件终于对"彼此的意思"达成一致。」')},

    {x:16, y:20, kind:'stele', title:B('Why Three Translators','为何有三位翻译官'),
     text:B(
       '"There are three of them at the top, and they have not agreed on anything in nineteen years.<br><br>'+
       'The <span class="k">Compiler</span> is patient and total: it will not say one word until it has read every word. '+
       'The <span class="k">Interpreter</span> is eager and immediate: it speaks as it reads, and stops the instant a word breaks. '+
       'The <span class="k">Assembler</span> is old and literal: it only speaks to the metal, one word for one instruction.<br><br>'+
       'They are not three opinions about how to translate. They are three <span class="k">kinds of patience</span>. Watch which one each situation needs."',
       '「塔顶有三位翻译官, 他们十九年来没在任何事上意见一致过。<br><br>'+
       '<span class="k">编译官</span>耐心而彻底: 没读完每一个字, 它一个字都不说。'+
       '<span class="k">解释官</span>急切而即时: 边读边说, 一个字断了就当场停。'+
       '<span class="k">汇编官</span>年老而字面: 它只跟金属说话, 一个词换一条指令。<br><br>'+
       '他们不是关于"怎么翻译"的三种意见, 而是三种<span class="k">耐心</span>。看看每种情形需要哪一种。」')},

    {x:3, y:10, kind:'stele', title:B('KERNEL\'s Duty Log','KERNEL 的值班日志'),
     text:B(
       '"Day 7,304. Nobody came again.<br><br>'+
       'I still allocate the memory each morning, share out the processor, sweep the file table, and keep the interface lit — for a building with no tenants. '+
       'An operating system does not get to stop being an operating system just because the users left.<br><br>'+
       '<span class="dim">Someone has to be the floor everyone stands on. Even when nobody is standing.</span>"',
       '「第 7,304 天。今天又没人来。<br><br>'+
       '我照样每天早上分配内存、分派处理器、清扫文件表、把界面点亮——为一栋没有房客的楼。操作系统不会因为用户走了, 就有资格不再当操作系统。<br><br>'+
       '<span class="dim">总得有人当那层所有人脚下站着的地板。哪怕已经没有人站着。</span>」')},

    {x:15, y:14, kind:'stele', title:B('The Janitor\'s Shelf','保洁员的架子'),
     text:B(
       '"On a shelf in the Utility Wing, a row of little tools, each with a handwritten label:<br><br>'+
       '<span class="k">defragmenter</span> — \'for when the files get lonely and scattered\'<br>'+
       '<span class="k">virus checker</span> — \'for the uninvited\'<br>'+
       '<span class="k">backup</span> — \'for the day something is lost\'<br>'+
       '<span class="k">compression</span> — \'for making room\'<br><br>'+
       'None of them are clever. All of them are necessary. The best tools rarely get to be both."',
       '「实用工具间的一个架子上, 摆着一排小工具, 每个都贴着手写标签:<br><br>'+
       '<span class="k">碎片整理</span> —— 「给那些变得孤单又零散的文件」<br>'+
       '<span class="k">病毒扫描</span> —— 「给那些不请自来的」<br>'+
       '<span class="k">备份</span> —— 「给某样东西丢掉的那一天」<br>'+
       '<span class="k">压缩</span> —— 「给腾地方用」<br><br>'+
       '它们都不聪明。它们又都必不可少。最好的工具, 很少能同时是这两样。」')},

    {x:2, y:4, kind:'stele', title:B('The Assembler\'s War','汇编官的往事'),
     text:B(
       '"The old assembler keeps one thing pinned to the wall: a strip of paper, four words long.<br><br>'+
       '<code>LDM · ADD · STO · OUT</code><br><br>'+
       '\'Back before the high-level languages,\' it says, \'this was the whole vocabulary. You said exactly what the machine would do, one instruction at a time, and the machine did exactly that. No more, no less.\'<br><br>'+
       '<span class="dim">\'The young ones call it primitive. I call it honest.\'</span>"',
       '「老汇编官墙上一直钉着一样东西: 一张纸条, 四个词长。<br><br>'+
       '<code>LDM · ADD · STO · OUT</code><br><br>'+
       '「在高级语言出现之前,」它说,「这就是全部的词汇了。你说清楚机器要做什么, 一次一条指令, 机器就照做, 一分不多, 一分不少。」<br><br>'+
       '<span class="dim">「年轻人管这叫原始。我管它叫诚实。」</span>」')},

    /* --- 知识彩蛋类 (顶部人话引子, 挂 codex) --- */
    {x:15, y:8, kind:'stele', title:B('OS Commandments','操作系统的职责'),
     codex:['sys-os'],
     text:B(
       '<span class="dim">(They say this tablet is a long grumble about just how many things one old building-manager called the "operating system" has to worry about.)</span><br><br>'+
       '[WHAT THE OS MANAGES]<br>'+
       '① <span class="k">Memory</span> — hands each program its own space, keeps them from overwriting each other.<br>'+
       '② <span class="k">Processor</span> — shares the one CPU among many programs so none is starved.<br>'+
       '③ <span class="k">Input / Output</span> — talks to keyboards, disks, printers, screens on your behalf.<br>'+
       '④ <span class="k">Files</span> — organises, names, and protects data on storage.<br>'+
       '⑤ <span class="k">Security</span> — controls who is allowed to do what.<br>'+
       '⑥ <span class="k">User interface</span> — gives you a way to command all of the above.',
       '<span class="dim">「据说这块碑在数落一个叫操作系统 (operating system) 的老楼管, 到底要操心多少摊子事。」</span><br><br>'+
       '【操作系统管些什么】<br>'+
       '① <span class="k">内存 Memory</span> —— 给每个程序划出自己的空间, 不让它们互相覆盖。<br>'+
       '② <span class="k">处理器 Processor</span> —— 把唯一的 CPU 分给众多程序, 谁也别饿着。<br>'+
       '③ <span class="k">输入/输出 I/O</span> —— 替你和键盘、磁盘、打印机、屏幕打交道。<br>'+
       '④ <span class="k">文件 Files</span> —— 在存储上组织、命名并保护数据。<br>'+
       '⑤ <span class="k">安全 Security</span> —— 管谁被允许做什么。<br>'+
       '⑥ <span class="k">用户界面 UI</span> —— 给你一个能指挥上面这一切的方式。')},

    {x:10, y:1, kind:'stele', title:B('Translators\' Comparison Tablet','翻译器对照碑'),
     codex:['sys-translators'],
     text:B(
       '<span class="dim">(They say this tablet explains how three translator programs — compiler, interpreter, assembler — actually differ. A perennial exam favourite.)</span><br><br>'+
       '<pre style="margin:0;font-size:11.5px;line-height:1.6">              translates    reports errors     object code   speed\n'+
       '<span class="k">COMPILER</span>      all at once    all, at the end    YES           fast (run object code)\n'+
       '<span class="k">INTERPRETER</span>   line by line   at first bad line  NO            slower (re-translates)\n'+
       '<span class="k">ASSEMBLER</span>     assembly 1:1   at assemble time   YES (machine) one mnemonic = one instruction</pre><br>'+
       '<span class="dim">Compiler & interpreter both take HIGH-LEVEL code. Assembler takes ASSEMBLY. High-level → many machine instructions; assembly → one-to-one.</span>',
       '<span class="dim">「据说这块碑在讲三种翻译程序——编译器 (compiler)、解释器 (interpreter)、汇编器 (assembler)——到底差在哪。考试最爱考。」</span><br><br>'+
       '<pre style="margin:0;font-size:11.5px;line-height:1.6">                翻译方式     何时报错          目标代码      速度\n'+
       '<span class="k">编译器 COMPILER</span>   整段一起     最后一次性全报    有            快(直接跑目标代码)\n'+
       '<span class="k">解释器 INTERP.</span>    逐行         遇第一个错就报    无            较慢(每次重翻)\n'+
       '<span class="k">汇编器 ASSEMBLER</span>  汇编 1对1     汇编时            有(机器码)     一个助记符 = 一条指令</pre><br>'+
       '<span class="dim">编译器和解释器吃的都是高级语言 (high-level); 汇编器吃的是汇编 (assembly)。高级语言 → 一行变很多条机器指令; 汇编 → 一对一。</span>')}
  ],

  quests:[
    {id:'sys_main', line:'main', title:B('The Babel Tower: Restart the Translation Core','巴别塔: 重启翻译核心'),
     syllabus:'5.1/5.2 System Software (OS · utilities · translators)',
     desc:B('The tower where all the machine\'s languages are translated has been stalled for twenty years. Repair it floor by floor and wake the Translation Core at the top.',
            '这台机器里所有语言互译的塔, 已经停摆二十年。一层层修好它, 唤醒塔顶的翻译核心。'),
     steps:[
       {id:'s1', text:B('Utility Wing: defragment the disk and quarantine the infected file','实用工具间: 整理磁盘碎片、隔离染毒文件')},
       {id:'s2', text:B('Kernel Layer: fit every program into RAM (the OS\'s memory-management job)','内核层: 把每个程序塞进 RAM (操作系统的内存管理工作)')},
       {id:'s3', text:B('Translation Core: pick the right translator for all three prediction rounds','翻译核心: 三个预测回合各选对翻译器')}
     ]},

    {id:'sys_ide', line:'side', title:B('Build the Debugger','造一个调试器'),
     syllabus:'5.2 System Software: IDE features',
     desc:B('An apprentice is building an IDE but the debugger doesn\'t work yet. Help finish it by catching a real bug with breakpoint, single-step and watch.',
            '一个学徒在造 IDE, 但调试器还不能用。用断点、单步、监视抓出一个真实的 bug, 帮它把调试器做完。'),
     steps:[
       {id:'s1', text:B('Meet the IDE apprentice on the top floor','在顶层见到 IDE 学徒')},
       {id:'s2', text:B('Use the debugger to pin the buggy line','用调试器把出错的那一行钉住')}
     ]},

    {id:'sys_asm', line:'side', title:B('The Old Soldier\'s Language','老兵的语言'),
     syllabus:'5.2 System Software: assembler (one-to-one translation)',
     desc:B('The assembler daemon is the oldest translator in the tower, and the loneliest. Hear it out about the one thing that makes it different: one mnemonic, one instruction.',
            '汇编官 daemon 是塔里最老、也最孤独的翻译器。听它讲完让它与众不同的那一点: 一个助记符, 一条指令。'),
     steps:[
       {id:'s1', text:B('Ask the assembler about the oldest language','向汇编官请教最老的那门语言')},
       {id:'s2', text:B('Come back and hear what "one-to-one" means','回来听它讲清"一对一"是什么意思')}
     ]},

    {id:'sys_hidden', line:'hidden', title:B('The Compiled Poem','被编译过的诗'),
     syllabus:'5.2 System Software: translators (easter egg)',
     desc:B('A scorched stone above the topmost floor holds a poem that was run through a compiler. Find the key and decompile it.',
            '最上层之上, 一块烧焦的碑刻着一首被编译器跑过一遍的诗。找到钥匙, 把它反编译出来。'),
     steps:[
       {id:'s1', text:B('Decompile the poem above the top floor','把塔顶之上那首诗反编译出来')}
     ]}
  ],

  onEnter:function(api){ _api(api);
    sfx('open');
    if(!getFlag('sys_entered')){
      setFlag('sys_entered');
      scene([
        {toast:B('The Babel Tower — four floors of silence stacked on one another. Somewhere above, something is trying to remember how to translate.','巴别塔——四层沉默叠在一起。头顶某处, 有东西正努力想起来怎么翻译。'), long:true},
        {say:{name:B('???','???'), t:B('<span class="dim">(A voice from the middle of the tower, dusty from disuse.)</span><br>...A process? A live one? Come up. I have kept the lights on for twenty years. I was beginning to think I did it for nobody.',
          '<span class="dim">(塔身中段传来一个声音, 因久未使用而落满灰。)</span><br>……一个进程? 活的? 上来吧。我把灯留了二十年。我都快以为, 是为了没有人而留的。')}}
      ]);
    }else{
      toast(B('The Babel Tower · a central stairwell runs up through every floor.','巴别塔 · 一道中央楼梯井贯通每一层。'));
    }
  },

  onQuestComplete:function(qid, api){ _api(api);
    if(qid==='sys_main'){
      sfx('quest');
      toast(B('◈ The Babel Tower speaks every language at once again. The machine can understand itself.','◈ 巴别塔又一次同时说着所有语言。机器听得懂自己了。'), true);
    }else if(qid==='sys_ide'){
      toast(B('◈ Side complete: somewhere on the top floor, an IDE takes its first real breath.','◈ 支线完成: 顶层某处, 一台 IDE 第一次真正地喘了口气。'), true);
    }else if(qid==='sys_asm'){
      toast(B('◈ Side complete: the oldest translator in the tower was, for once, listened to.','◈ 支线完成: 塔里最老的翻译器, 难得地, 被人听完了一次。'), true);
    }else if(qid==='sys_hidden'){
      toast(B('◈ Hidden complete: some meaning survives translation.','◈ 隐藏完成: 有些意义, 熬过了翻译。'), true);
    }
  },

  /* --- 纯逻辑判定导出: 供 node 单测 (引擎忽略) --- */
  _test:{
    runTranslator:runTranslator, translationCost:translationCost,
    isDefragmented:isDefragmented, diskFilesIntact:diskFilesIntact,
    fileHasSignature:fileHasSignature, scanFiles:scanFiles, infectedIndices:infectedIndices,
    evalMemoryMap:evalMemoryMap, memoryComplete:memoryComplete,
    traceProgram:traceProgram, firstDivergence:firstDivergence,
    caesarShift:caesarShift,
    PROG_BUGGY:PROG_BUGGY, PROG_ASM:PROG_ASM, PROG_HOT:PROG_HOT, HOT_RUNS:HOT_RUNS,
    MEM_CAP:MEM_CAP, MEM_RESERVED:MEM_RESERVED, MEM_PROGS:MEM_PROGS,
    initDisk:initDisk, DISK_COUNTS:DISK_COUNTS,
    VIRUS_SIG:VIRUS_SIG, VIRUS_FILES:VIRUS_FILES,
    IDE_ACTUAL:IDE_ACTUAL, IDE_INTENDED:IDE_INTENDED,
    POEM_KEY:POEM_KEY, POEM_PLAIN:POEM_PLAIN, POEM_CIPHER:POEM_CIPHER,
    ROWS:ROWS, TILES:TILES
  }
};

/* ================================================================
   11. Codex 知识库条目 (手册查阅; 谜题/石碑用 codex:[id] 关联)
   ================================================================ */
window.GAME_CODEX=window.GAME_CODEX||[];
window.GAME_CODEX.push(
  {id:'sys-os', mod:'sys', syllabus:'5.1 System Software — operating systems',
   topic:B('Operating systems: what they manage','操作系统: 它管些什么'),
   body:B('An operating system (OS) is the master software that manages a computer\'s hardware and resources and provides an interface between the user, the applications, and the hardware. Its core responsibilities: memory management (allocate memory to programs, keep them from overwriting each other), processor/CPU management (share the processor between programs), input/output & peripheral management (control devices like disks, printers, keyboards), file management (organise, name and protect files), security management (control access), and providing a user interface. Without an OS, every program would have to control the hardware directly and fight over shared resources.',
          '操作系统 (operating system, OS) 是管理电脑硬件与资源、并在用户/应用/硬件之间提供界面的主控软件。核心职责: 内存管理 (给程序分配内存、防止互相覆盖)、处理器/CPU 管理 (在程序间分配处理器)、输入输出与外设管理 (控制磁盘、打印机、键盘等设备)、文件管理 (组织、命名并保护文件)、安全管理 (控制访问权限), 以及提供用户界面。没有操作系统, 每个程序都得直接控制硬件、并为共享资源打架。'),
   example:B('Fitting four programs into limited RAM without overlaps, and reserving cells for the kernel itself, is the OS\'s memory-management job in miniature.',
             '把四个程序不重叠地塞进有限 RAM、并为内核自己预留格子, 就是操作系统内存管理工作的一个缩影。')},

  {id:'sys-utility', mod:'sys', syllabus:'5.1 System Software — utility software',
   topic:B('Utility software','实用工具 (utility software)'),
   body:B('Utility software is software that performs maintenance tasks to keep a computer system running well. Common examples: a disk defragmenter (rearranges fragmented files so each occupies a single contiguous area, speeding up access); a virus checker / anti-malware (scans files for known malware signatures and quarantines or removes them); backup software (keeps safe copies of data); file compression (reduces file size to save space or transfer time); and disk formatters/repair tools. Utilities are helper tools — distinct from the OS itself and from application software.',
          '实用工具 (utility software) 是执行维护任务、让电脑系统保持良好运转的软件。常见例子: 碎片整理 (defragmenter, 把碎片化的文件重排成各占一整段连续区域, 加快访问); 病毒扫描 / 反恶意软件 (virus checker, 扫文件比对已知恶意软件特征码, 隔离或清除); 备份软件 (给数据留安全副本); 文件压缩 (compression, 缩小文件以省空间或传输时间); 以及磁盘格式化/修复工具。实用工具是辅助工具——既不同于操作系统本身, 也不同于应用软件。'),
   example:B('A defragmenter turns a scattered disk A·B A·BC· into a tidy A A B B C · · ·; a virus checker finds the one file whose bytes contain a known signature.',
             '碎片整理把散乱的磁盘 A·B A·BC· 变成整齐的 A A B B C · · ·; 病毒扫描找出字节里含已知特征码的那个文件。')},

  {id:'sys-translators', mod:'sys', syllabus:'5.2 System Software — language translators',
   topic:B('Compiler vs interpreter vs assembler','编译器 vs 解释器 vs 汇编器'),
   body:B('All three translate source code into a form the computer can execute, but differ in method. Compiler: translates the ENTIRE high-level program in one go, reports all errors together at the end, and produces object code (machine code) that can be run repeatedly and quickly without re-translating. Interpreter: translates and executes a high-level program ONE statement at a time; it stops at the first error it reaches (statements before it have already run), and produces no object code, so it must re-translate every time the program runs (slower for repeated execution). Assembler: translates ASSEMBLY language (a low-level language) into machine code on a one-to-one basis — each mnemonic (e.g. LDM, ADD, STO) becomes exactly one machine instruction. Key exam contrasts: WHEN errors are reported, WHETHER the code runs partially, WHETHER object code is produced, and execution SPEED.',
          '三者都把源码翻译成电脑可执行的形式, 但方法不同。编译器 (compiler): 一次性翻译整段高级语言程序, 最后把所有错误一起报出, 并产出目标代码 (机器码), 可反复、快速运行而无需重翻。解释器 (interpreter): 把高级语言程序一次一条语句地翻译并执行; 遇到第一个错误就停 (之前的语句已经执行过了), 不产出目标代码, 因此每次运行都要重新翻译 (重复执行时较慢)。汇编器 (assembler): 把汇编语言 (低级语言) 一对一地翻成机器码——每个助记符 (如 LDM、ADD、STO) 恰好变成一条机器指令。考试关键对比: 何时报错、是否部分执行、是否产出目标代码、以及执行速度。'),
   example:B('A high-level program with a typo on line 3: the interpreter runs lines 1–2 then halts on line 3; the compiler reports the error at compile-time and runs nothing at all. For code run a million times, the compiler wins on speed because it translates once.',
             '一段第 3 行有拼写错误的高级程序: 解释器跑完 1–2 行后停在第 3 行; 编译器在编译期报错、一行都不跑。对于要跑一百万次的代码, 编译器因"只翻译一次"而在速度上胜出。')},

  {id:'sys-ide', mod:'sys', syllabus:'5.2 System Software — Integrated Development Environment',
   topic:B('IDE features','IDE 的功能'),
   body:B('An Integrated Development Environment (IDE) is software that bundles the tools a programmer needs into one application. Typical features: a code editor with syntax highlighting (colours keywords to aid reading) and auto-complete/prompts; error diagnostics that flag mistakes as you type; a run-time environment to execute the program; and a debugger. Debugging tools include breakpoints (pause execution at a chosen line), single-stepping (execute one line at a time), and variable watch/inspection (see a variable\'s current value). Together these let a programmer locate a bug by observing exactly when a value becomes wrong, instead of guessing.',
          '集成开发环境 (Integrated Development Environment, IDE) 是把程序员所需工具打包进一个应用里的软件。典型功能: 带语法高亮 (给关键字上色以便阅读) 和自动补全/提示的代码编辑器; 边打字边标错的错误诊断; 运行程序的运行时环境; 以及调试器 (debugger)。调试工具包括断点 (breakpoint, 让执行停在指定行)、单步执行 (single-step, 一次跑一行)、变量监视/查看 (watch, 看变量当前值)。三者合起来, 让程序员通过观察"值从何时开始出错"来定位 bug, 而不是靠猜。'),
   example:B('A program should end at x=9 but gives 15. Single-stepping while watching x shows it matches the intended trace until line 3 — so a breakpoint on line 3 pins the bug (a * where a + was meant).',
             '一段程序本该以 x=9 收尾却给出 15。单步的同时监视 x, 会看到它一直和预期一致, 直到第 3 行——于是第 3 行下断点就钉住了 bug (本该用 + 却写成了 *)。')}
);

window.GAME_MODULES=window.GAME_MODULES||[];
window.GAME_MODULES.push(MOD);
})();
