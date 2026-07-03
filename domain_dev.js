/* ================================================================
   BIT://ESCAPE 领域模块 —— 调试试炼场 The Debug Proving Grounds (domain_dev.js)
   9618 AS · Topic 11 Programming + Topic 12 Software Development
   ----------------------------------------------------------------
   这台机器出厂前, 所有代码都在这里被"考"过一遍。机器早就发货、开机
   二十年了, 试炼却还在每天凌晨自动运行——只是再没人来应考。
   一位老监考官守着空荡荡的考场, 而考场自己的评分程序里, 藏着一只
   二十年没人抓到的 bug。
   ----------------------------------------------------------------
   考点 & 玩法(玩法即知识 P1):
     · Trace Table 干跑神殿 (§11)  —— 跟着幽灵程序员的脚印一行行填表
     · 测试数据三卫兵 (§12)        —— normal / boundary / abnormal 各喂一份
     · Bug 狩猎 (§11/§12)          —— 三只经典 bug 在猎场里乱窜, 标出它们
     · 生命周期环道 (§12.1, 支线)  —— waterfall 阶段排序 + 维护类型分类
     · 元彩蛋(隐藏)                —— 考场自己的评分程序里的 boundary bug
   ----------------------------------------------------------------
   模块协议(与 domain_net.js / domain_sec.js 一致):
     W.GAME_MODULES.push({id,title,world,unlock,interior,npcs,steles,
                          quests,puzzles,onEnter,onQuestComplete})
   - npc.dialog = function(api) -> [{sp,t,choices:[{t,next,do}],next}]
   - 双语: 一切面向玩家的字符串都是 {en,zh} 对象(默认英文), 过 W.T()。
     render() 自建 DOM 的文字在本模块内自行过 T()/tx()。
   - 纯逻辑判定(干跑解释器/测试数据分类/bug 判定/生命周期)导出在
     spec._test, 供无引擎 node 单测; 引擎可忽略。
   - id 全部 dev_ 前缀; unlock={world:'as'} 进入 AS 开放世界即可达, 不阻塞主线。
   ================================================================ */
(function(){
'use strict';

/* 允许浏览器(window)与 node(global, 供单测)两种环境加载 */
var W = (typeof window!=='undefined') ? window
      : (typeof globalThis!=='undefined') ? globalThis
      : this;

/* ---------------- 双语 fallback ---------------- */
var T = W.T || function(s){ return typeof s==='string' ? s : (s && s.en!=null ? s.en : ''); };
function B(en,zh){ return {en:en, zh:zh}; }      // 结构化字段: 挂 {en,zh}
function tx(en,zh){ return T({en:en, zh:zh}); }  // render()/toast: 立即取当前语言

/* ================================================================
   0. 纯逻辑判定 —— 无 DOM 依赖, 与语言无关, 全部可 node 单测
   ================================================================ */

/* ---- 谜题1 · 伪码干跑解释器 (§11 dry run / trace table) ----
   程序以结构化语句树表示; 表达式/条件用闭包 f(env) 计算(整数运算)。
   traceEvents() 解释控制流(FOR/WHILE/IF), 按执行顺序吐出一串"事件"——
   每次给变量赋值 = 一行; 每次 OUTPUT = 一行。这正是 trace table 的每一行:
   谁被改了、改成了几。判定就是逐行比对玩家填的值。 */
function traceEvents(prog){
  var env = {};
  if(prog.arrays){ for(var a in prog.arrays){ env[a] = prog.arrays[a].slice(); } }
  var events = [], GUARD = 500;
  function exec(list){
    for(var i=0;i<list.length;i++){ run(list[i]); if(events.length>GUARD) return; }
  }
  function run(s){
    if(events.length>GUARD) return;
    if(s.t==='set'){
      var v = s.f(env); env[s.name]=v;
      events.push({line:s.line, name:s.name, value:v});
    }else if(s.t==='output'){
      events.push({line:s.line, name:'OUTPUT', value:s.f(env)});
    }else if(s.t==='for'){
      for(var c=s.from; c<=s.to; c++){
        env[s.name]=c;
        events.push({line:s.line, name:s.name, value:c});
        exec(s.body); if(events.length>GUARD) return;
      }
    }else if(s.t==='while'){
      var g=0;
      while(s.cond(env)){ exec(s.body); if(++g>GUARD) return; }
    }else if(s.t==='if'){
      if(s.cond(env)) exec(s.then||[]); else exec(s.else||[]);
    }
  }
  exec(prog.body);
  return events;
}
function checkTraceValue(events, i, submitted){
  if(i<0 || i>=events.length) return false;
  var n = parseInt(submitted,10);
  return !isNaN(n) && n===events[i].value;
}

/* ---- 谜题2 · 测试数据分类 (§12 test data: normal/boundary/abnormal) ----
   规则: 入学年龄必须是 11..18 的整数。
   normal(常态/有效典型)  = 12..17
   boundary(边界/极值)   = 10,11,18,19  (合法上下限 + 紧邻的越界值)
   abnormal(异常/错误)   = 其余整数(<=9 或 >=20) 与一切非整数/文本 */
function classifyAge(v){
  if(v===null || v===undefined) return 'invalid';
  var s = String(v).trim();
  if(s==='') return 'invalid';
  if(!/^-?\d+$/.test(s)) return 'abnormal';   // 文本 / 小数 / 符号 = 异常输入
  var n = parseInt(s,10);
  if(n===10 || n===11 || n===18 || n===19) return 'boundary';
  if(n>=12 && n<=17) return 'normal';
  return 'abnormal';                          // <=9 或 >=20
}
function testDataCoverage(values){
  var cov = {normal:false, boundary:false, abnormal:false};
  (values||[]).forEach(function(v){
    var c = classifyAge(v);
    if(c==='normal'||c==='boundary'||c==='abnormal') cov[c]=true;
  });
  cov.allCovered = cov.normal && cov.boundary && cov.abnormal;
  return cov;
}

/* ---- 谜题3 · Bug 狩猎 (§11/§12 常见逻辑错误) ----
   一段伪码, 三行有 bug: uninitialised / off-by-one / infinite loop。
   判定 = 玩家标记的行号集合是否恰好等于 bug 行号集合(不多不少)。 */
var BUG_PROGRAM = {
  lines:[
    B('DECLARE i, total : INTEGER',                    'DECLARE i, total : INTEGER'),
    B('DECLARE scores : ARRAY[1:5] OF INTEGER',        'DECLARE scores : ARRAY[1:5] OF INTEGER'),
    B('total ← total + 0',                             'total ← total + 0'),
    B('FOR i ← 1 TO 6',                                'FOR i ← 1 TO 6'),
    B('  total ← total + scores[i]',                   '  total ← total + scores[i]'),
    B('NEXT i',                                        'NEXT i'),
    B('WHILE total > 0',                               'WHILE total > 0'),
    B('  OUTPUT scores[1]',                            '  OUTPUT scores[1]'),
    B('ENDWHILE',                                      'ENDWHILE')
  ],
  bugs:[
    {line:3, type:B('Uninitialised variable','变量未初始化'),
     why:B('Line 3 reads <b>total</b> before it was ever given a starting value — an uninitialised variable holds garbage, so the sum is meaningless from the very first pass.',
           '第 3 行在 <b>total</b> 从未被赋初值之前就读取了它——未初始化的变量装的是垃圾值, 于是从第一趟起求和结果就毫无意义。')},
    {line:4, type:B('Off-by-one error','差一错误 (off-by-one)'),
     why:B('The array is <b>[1:5]</b> — only indices 1..5 exist — but the loop runs <b>TO 6</b>. On the last pass <code>scores[6]</code> is out of bounds. Classic off-by-one.',
           '数组是 <b>[1:5]</b>——只有下标 1..5——可循环却跑到 <b>TO 6</b>。最后一趟 <code>scores[6]</code> 越界。教科书级 off-by-one。')},
    {line:7, type:B('Infinite loop','死循环'),
     why:B('Nothing inside the WHILE ever changes <b>total</b>, so <code>total &gt; 0</code> stays true forever — the loop never terminates.',
           'WHILE 循环体内没有任何语句改变 <b>total</b>, 于是 <code>total &gt; 0</code> 永远为真——循环永不结束。')}
  ]
};
function bugLines(){ return BUG_PROGRAM.bugs.map(function(b){return b.line;}).sort(function(a,b){return a-b;}); }
function checkBugs(selected){
  var want = bugLines();
  var got = (selected||[]).slice().sort(function(a,b){return a-b;});
  var uniq = got.filter(function(v,i){ return got.indexOf(v)===i; });
  if(uniq.length!==want.length) return false;
  for(var i=0;i<want.length;i++){ if(uniq[i]!==want[i]) return false; }
  return true;
}

/* ---- 支线 · 开发生命周期 (§12.1) + 维护类型 (§12) ----
   waterfall 阶段顺序 + 三种维护类型分类。 */
var WATERFALL = ['analysis','design','coding','testing','maintenance'];
function checkLifecycleOrder(seq){
  if(!seq || seq.length!==WATERFALL.length) return false;
  for(var i=0;i<WATERFALL.length;i++){ if(seq[i]!==WATERFALL[i]) return false; }
  return true;
}
var MAINT_SCENARIOS = [
  {id:'ms_corrective', type:'corrective',
   text:B('A user reports the shopping-cart total comes out wrong whenever a discount code is applied.',
          '有用户报告: 只要用了折扣码, 购物车合计金额就算错。')},
  {id:'ms_adaptive', type:'adaptive',
   text:B('A new tax law changes the VAT rate. Nothing is broken, but the invoice module must be updated to keep working under the new rules.',
          '新税法改了增值税率。程序没坏, 但发票模块必须更新, 才能在新规则下继续正常工作。')},
  {id:'ms_perfective', type:'perfective',
   text:B('Nothing is wrong, but users have asked for a faster search and a new dark-mode theme.',
          '什么都没出错, 但用户希望搜索更快、再加一个夜间模式主题。')}
];
function classifyMaintenance(id){
  for(var i=0;i<MAINT_SCENARIOS.length;i++){ if(MAINT_SCENARIOS[i].id===id) return MAINT_SCENARIOS[i].type; }
  return null;
}
function judgeMaintenance(id, pick){ return classifyMaintenance(id)===pick; }

/* ---- 元彩蛋(隐藏) · 考场自己的评分程序 ----
   评分程序用 score > passMark 判及格, 应为 score >= passMark ——
   于是二十年来, 每一个"刚好考到及格线"的考生都被判了不及格。
   这正是 boundary testing 本该抓到的错。判定 = 标出那一行。 */
var GRADER_PROGRAM = {
  lines:[
    B('FUNCTION Grade(score : INTEGER) RETURNS STRING',   'FUNCTION Grade(score : INTEGER) RETURNS STRING'),
    B('  CONSTANT passMark = 50',                          '  CONSTANT passMark = 50'),
    B('  IF score > passMark THEN',                        '  IF score > passMark THEN'),
    B('    RETURN "PASS"',                                 '    RETURN "PASS"'),
    B('  ELSE',                                            '  ELSE'),
    B('    RETURN "FAIL"',                                 '    RETURN "FAIL"'),
    B('  ENDIF',                                           '  ENDIF'),
    B('ENDFUNCTION',                                       'ENDFUNCTION')
  ],
  bugLine:3
};
function checkGraderBug(line){ return line===GRADER_PROGRAM.bugLine; }

/* ================================================================
   1. 引擎 api 小工具 (与 domain_sec.js 同款, 全部 try/catch 兜底)
   ================================================================ */
function S(api,name){ try{
  if(!api||!api.sfx) return;
  if(typeof api.sfx==='function') api.sfx(name);
  else if(typeof api.sfx[name]==='function') api.sfx[name]();
}catch(e){} }
function TOAST(api,msg,long){ try{ api&&api.toast&&api.toast(T(msg),long); }catch(e){} }
function FLAG(api,k){ try{ return api&&api.getFlag?api.getFlag(k):null; }catch(e){ return null; } }
function SET(api,k,v){ try{ api&&api.setFlag&&api.setFlag(k, v===undefined?true:v); }catch(e){} }
function STEP(api,q,s){ try{ api&&api.completeStep&&api.completeStep(q,s); }catch(e){} }
function QDONE(api,q){ try{ api&&api.questDone&&api.questDone(q); }catch(e){} }
function GIVE(api,id,name){ try{ api&&api.giveItem&&api.giveItem(id,T(name)); }catch(e){} }
function DIALOG(api,nodes){ try{ api&&api.openDialog&&api.openDialog(nodes); }catch(e){} }
/* 三幕演出: 优先 api.scene(步骤格式 {dialog:nodes}/{sfx}/…), 回退 openDialog。
   传入的是对话节点数组 [{sp,t}]; 包成一个 {dialog:nodes} 演出步骤。(起因 ≤3 拍) */
function scene(api,nodes){
  try{ if(api&&api.scene){ api.scene([{sfx:'open'},{dialog:nodes}]); return; } }catch(e){}
  DIALOG(api,nodes);
}

/* ---------------- DOM 构建小工具 (终端绿语言) ---------------- */
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
var BTN_GOLD='background:#3a2c08;color:#ffce3a;border:1px solid #c9a24a;padding:5px 12px;'+
        'font-family:inherit;font-size:13px;cursor:pointer;letter-spacing:1px;border-radius:2px;';
var BTN_RED='background:#3a0a0a;color:#ff9c9c;border:1px solid #7a2f2f;padding:5px 12px;'+
        'font-family:inherit;font-size:13px;cursor:pointer;letter-spacing:1px;border-radius:2px;';
var INP='width:78px;background:#08150a;color:#ffce3a;border:1px solid #2f6f2f;'+
        'font-family:inherit;font-size:13px;padding:3px 5px;border-radius:2px;';
var SEL='background:#0a1f0a;color:#7CFC00;border:1px solid #2f6f2f;padding:3px 6px;'+
        'font-family:inherit;font-size:12px;border-radius:2px;';
var PRE='background:rgba(6,18,6,.7);border:1px solid #1f3f1f;padding:9px 11px;color:#bfeebf;'+
        'font-size:12.5px;line-height:1.65;white-space:pre;overflow-x:auto;border-radius:2px;';
var TXT='color:#bfeebf;font-size:13px;line-height:1.7;';
var DIM='color:#4a7a4a;font-size:11.5px;';
var K='color:#ffce3a;';
function esc(s){ return String(s==null?'':s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];}); }
function header(el,title,sub){
  mk(el,'div','color:#9fee9f;letter-spacing:2px;font-size:14px;border-bottom:1px solid #1f3f1f;'+
    'padding-bottom:6px;margin-bottom:8px;', title+
    (sub?' <span style="'+DIM+'float:right;">'+sub+'</span>':''));
}

/* 三段递进提示; onKey('?') 亦可触发; .max() 直接跳末段(近乎给答案) */
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
  next.max=function(){ idx=hints.length-2; next(); };
  btn.onclick=next;
  hintFns[pid]=next;
}

/* ---- 失败即内容(Hades 式): 失败≥3 次, 老监考官下来递台阶 ---- */
var ENGINEER_STEPDOWN = {
  dev_trace:[
    B('The Invigilator: "...Stuck on the trace, are you? Sit. Twenty years ago a candidate froze on this exact row. Kept trying to guess the whole answer at once."',
      '老监考官: 「……卡在干跑上了? 坐。二十年前有个考生就死在这一行。他老想一口气猜出整张表的答案。」'),
    B('The Invigilator: "A trace table is not a guessing game. It is bookkeeping. One row, one change. Read the line, write down only the value that changed, then move to the next line. Never look ahead."',
      '老监考官: 「trace table 不是猜谜, 是记账。一行, 一个改动。读这一行, 只写下改变了的那个值, 再走下一行。永远别偷看后面。」'),
    B('The Invigilator: "That candidate? Once they stopped guessing and started bookkeeping, they finished in four minutes. The hints are yours — I have marked them up. Take the ladder."',
      '老监考官: 「那个考生? 他一旦不再猜、开始老实记账, 四分钟就填完了。提示都归你——我给你标到底了。踩着台阶上来。」')
  ],
  dev_testdata:[
    B('The Invigilator: "The sentinels turned you away again. Let me guess — you fed them three perfectly ordinary numbers, all in the middle of the range?"',
      '老监考官: 「又被卫兵挡回来了。我猜——你喂了三个规规矩矩、全在范围正中间的数?」'),
    B('The Invigilator: "Everyone forgets the same one. The Boundary sentinel. Real bugs do not live in the middle of a range; they live at its edges — the last value that should pass, and the first that should fail. Test the fence, not the field."',
      '老监考官: 「大家忘的永远是同一个: 边界卫兵。真正的 bug 不住在范围中间, 住在边缘——最后一个该通过的、和第一个该失败的。测栅栏, 别测草地。」'),
    B('The Invigilator: "Rule is 11 to 18. So feed Boundary an 11 or an 18. Feed Abnormal something rude — a 999, a word. Feed Normal a boring 15. One of each and the gate opens."',
      '老监考官: 「规则是 11 到 18。那就喂边界卫兵一个 11 或 18; 喂异常卫兵点没礼貌的——999、一个单词; 喂常态卫兵一个无聊的 15。三类各一份, 门就开。」')
  ],
  dev_bughunt:[
    B('The Invigilator: "The bugs keep slipping the net. You are swatting at random. Don\'t. Hunt by species."',
      '老监考官: 「虫子老是从网里溜。你在乱拍。别乱拍——按品种来猎。」'),
    B('The Invigilator: "Three classic species live in almost every broken program: a variable used before it was ever set; a loop that counts one step too far; and a loop with no way to ever stop. Find one of each — no more, no less."',
      '老监考官: 「几乎每段坏程序里都住着三种经典物种: 一个用在赋值之前的变量; 一个多数了一步的循环; 一个永远停不下来的循环。每种抓一只——不多不少。」'),
    B('The Invigilator: "Line 3 reads total before it holds anything. Line 4 loops TO 6 but the array stops at 5. Line 7 loops while total stays frozen. Mark those three."',
      '老监考官: 「第 3 行在 total 还是空的时候就读它; 第 4 行循环到 6 可数组只到 5; 第 7 行 total 一直不变却还在循环。标这三行。」')
  ]
};
function engineerStepDown(api,pid,n){
  var lines = ENGINEER_STEPDOWN[pid];
  if(!lines) return;
  var i = Math.min(n-3, lines.length-1);          // 第 3 次失败给第 1 段, 之后逐段加码
  if(i<0) i=0;
  DIALOG(api,[{sp:B('The Invigilator','老监考官'), t:lines[i]}]);
}
/* 记一次失败: 触发 api.onFail; ≥2 次自动升级提示到末段; ≥3 次老监考官下场 */
function bumpFail(api,pid){
  var key = pid+'_fails';
  var n = (FLAG(api,key)||0)+1; SET(api,key,n);
  try{ api&&api.onFail&&api.onFail(pid); }catch(e){}
  if(n>=2 && hintFns[pid] && hintFns[pid].max){
    hintFns[pid].max();
    TOAST(api,B('Hints auto-upgraded — check the gold box (or press ?).','提示已自动升级——看金色框 (或按 ? 键)。'));
  }
  if(n>=3) engineerStepDown(api,pid,n);
  return n;
}

/* 主线两谜(trace+testdata)+ boss(bughunt)全清 => 主线完成收口 */
function checkMainDone(api){
  if(FLAG(api,'dev_trace_done') && FLAG(api,'dev_test_done') && FLAG(api,'dev_bug_done')
     && !FLAG(api,'dev_main_done')){
    SET(api,'dev_main_done');
    QDONE(api,'dev_main');
    GIVE(api,'dev_cert', B('Debugger\'s Certificate','调试者认证书'));
    S(api,'quest');
    TOAST(api,B('◈ The Debug Proving Grounds · Main trials cleared ◈ Obtained: Debugger\'s Certificate. The old grader on the back wall flickers awake — and it has been failing quietly for twenty years.',
                '◈ 调试试炼场 · 主线试炼通过 ◈ 获得: 调试者认证书。后墙那台旧评分机忽明忽暗地醒了——它已经悄悄错判了二十年。'),true);
  }
}

/* ================================================================
   2. 谜题1 · Trace Table 干跑神殿 (§11)
   三关递进: 单循环 → 嵌套循环 → 带数组。每填对一行, 幽灵在走廊上走一步;
   填错, 幽灵一头撞墙。空间顺序 = 难度顺序。
   ================================================================ */
var TRACE_LEVELS = [
  { key:'L1', titleB:B('Trial I · The Single Loop','试炼一 · 单循环'),
    subj:'11.2 iteration (count-controlled loop)',
    codeB:B(
      'DECLARE total, i : INTEGER\n'+
      'total ← 0\n'+
      'FOR i ← 1 TO 3\n'+
      '  total ← total + i\n'+
      'NEXT i\n'+
      'OUTPUT total',
      'DECLARE total, i : INTEGER\n'+
      'total ← 0\n'+
      'FOR i ← 1 TO 3\n'+
      '  total ← total + i\n'+
      'NEXT i\n'+
      'OUTPUT total'),
    prog:{ body:[
      {t:'set', name:'total', line:'total ← 0', f:function(e){return 0;}},
      {t:'for', name:'i', from:1, to:3, line:'FOR i ← 1 TO 3', body:[
        {t:'set', name:'total', line:'total ← total + i', f:function(e){return e.total+e.i;}}
      ]},
      {t:'output', line:'OUTPUT total', f:function(e){return e.total;}}
    ]}
  },
  { key:'L2', titleB:B('Trial II · The Nested Loop','试炼二 · 嵌套循环'),
    subj:'11.2 iteration (nested loop)',
    codeB:B(
      'DECLARE i, j, k : INTEGER\n'+
      'k ← 0\n'+
      'FOR i ← 1 TO 2\n'+
      '  FOR j ← 1 TO 2\n'+
      '    k ← k + (i * j)\n'+
      '  NEXT j\n'+
      'NEXT i\n'+
      'OUTPUT k',
      'DECLARE i, j, k : INTEGER\n'+
      'k ← 0\n'+
      'FOR i ← 1 TO 2\n'+
      '  FOR j ← 1 TO 2\n'+
      '    k ← k + (i * j)\n'+
      '  NEXT j\n'+
      'NEXT i\n'+
      'OUTPUT k'),
    prog:{ body:[
      {t:'set', name:'k', line:'k ← 0', f:function(e){return 0;}},
      {t:'for', name:'i', from:1, to:2, line:'FOR i ← 1 TO 2', body:[
        {t:'for', name:'j', from:1, to:2, line:'FOR j ← 1 TO 2', body:[
          {t:'set', name:'k', line:'k ← k + (i * j)', f:function(e){return e.k + e.i*e.j;}}
        ]}
      ]},
      {t:'output', line:'OUTPUT k', f:function(e){return e.k;}}
    ]}
  },
  { key:'L3', titleB:B('Trial III · The Array','试炼三 · 数组'),
    subj:'11.1 arrays + 11.3 selection (find maximum)',
    codeB:B(
      'DECLARE A : ARRAY[1:4] OF INTEGER  // A = [3, 1, 4, 1]\n'+
      'DECLARE max, i : INTEGER\n'+
      'max ← A[1]\n'+
      'FOR i ← 2 TO 4\n'+
      '  IF A[i] > max THEN\n'+
      '    max ← A[i]\n'+
      '  ENDIF\n'+
      'NEXT i\n'+
      'OUTPUT max',
      'DECLARE A : ARRAY[1:4] OF INTEGER  // A = [3, 1, 4, 1]\n'+
      'DECLARE max, i : INTEGER\n'+
      'max ← A[1]\n'+
      'FOR i ← 2 TO 4\n'+
      '  IF A[i] > max THEN\n'+
      '    max ← A[i]\n'+
      '  ENDIF\n'+
      'NEXT i\n'+
      'OUTPUT max'),
    prog:{ arrays:{A:[3,1,4,1]}, body:[
      {t:'set', name:'max', line:'max ← A[1]', f:function(e){return e.A[0];}},
      {t:'for', name:'i', from:2, to:4, line:'FOR i ← 2 TO 4', body:[
        {t:'if', line:'IF A[i] > max', cond:function(e){return e.A[e.i-1] > e.max;},
         then:[ {t:'set', name:'max', line:'max ← A[i]', f:function(e){return e.A[e.i-1];}} ]}
      ]},
      {t:'output', line:'OUTPUT max', f:function(e){return e.max;}}
    ]}
  }
];
var TRACE_HINTS=[
  B('Dry running is bookkeeping, not guessing. Go one row at a time: read the highlighted line, work out the single value it produces, type only that number.',
    '干跑是记账不是猜谜。一次只走一行: 读高亮的那行, 算出它产生的那一个值, 只填那个数。'),
  B('When a FOR loop starts a new pass, the counter itself changes first (i becomes 1, then 2, ...). An IF only assigns when its condition is true — if it is false, that pass produces no new value.',
    'FOR 每开始新一趟, 先变的是计数器本身 (i 变成 1, 再变 2, ...)。IF 只有条件为真时才赋值——条件为假, 那一趟不产生新值。'),
  B('Trial I values in order: total=0, i=1, total=1, i=2, total=3, i=3, total=6, OUTPUT=6. Same method for II and III — just keep the running total in your head, one line at a time.',
    '试炼一逐行的值: total=0, i=1, total=1, i=2, total=3, i=3, total=6, OUTPUT=6。试炼二、三同法——把当前累计值记在脑子里, 一行一行来。')
];
var TR={ level:0 };
function renderTrace(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:560px;max-width:760px;'+TXT);
  header(wrap,tx('Trace Table Shrine · Dry Run','干跑神殿 · Trace Table'),'§11 DRY RUN');

  var allDone = FLAG(api,'dev_trace_L1')&&FLAG(api,'dev_trace_L2')&&FLAG(api,'dev_trace_L3');

  /* 关卡选择条 */
  var tabs=mk(wrap,'div','display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;');
  TRACE_LEVELS.forEach(function(L,li){
    var done=FLAG(api,'dev_trace_'+L.key);
    var b=mk(tabs,'button', li===TR.level?BTN_HOT:BTN,
      (done?'✓ ':'')+T(L.titleB));
    b.onclick=function(){ TR.level=li; renderTrace(el,api); };
  });

  var L=TRACE_LEVELS[TR.level];
  var events=traceEvents(L.prog);

  mk(wrap,'div',DIM+'margin-bottom:6px;',T(L.subj)+' — '+
    tx('fill the trace table row by row. Each correct row, the ghost coder takes one step down the hall. Get one wrong and it walks into the wall.',
       '一行行填这张 trace table。每填对一行, 幽灵程序员就在走廊上走一步; 填错一行, 它就一头撞墙。'));

  /* 伪码 */
  mk(wrap,'pre',PRE+'margin:0 0 8px;', esc(T(L.codeB)));

  /* 幽灵走廊 */
  var ghost=mk(wrap,'div','font-family:inherit;font-size:16px;letter-spacing:2px;color:#7CFC00;'+
    'background:rgba(6,18,6,.7);border:1px solid #1f3f1f;padding:8px 10px;margin-bottom:8px;border-radius:2px;min-height:22px;');

  /* 表格 */
  var tbl=mk(wrap,'div','margin-bottom:6px;');
  var msg=mk(wrap,'div','min-height:34px;font-size:12px;color:#ffce3a;line-height:1.6;');

  var row=0;              // 当前待填的事件下标
  var savedKey='dev_trace_row_'+L.key;
  if(FLAG(api,'dev_trace_'+L.key)) row=events.length;   // 已通关: 整表可见

  function drawGhost(){
    var n=events.length, cells=[];
    for(var i=0;i<=n;i++){
      cells.push(i===row ? '👻' : (i<row ? '·' : '　'));
    }
    // 走廊终点是出口
    ghost.innerHTML = cells.join(' ') + '  <span style="'+DIM+'">'+
      (row>=n ? tx('▸ EXIT','▸ 出口') : tx('▸ step '+(row+1)+'/'+n,'▸ 第 '+(row+1)+'/'+n+' 步'))+'</span>';
  }
  function drawTable(){
    var h='<table style="border-collapse:collapse;font-size:12.5px;width:100%;">'+
      '<tr style="color:#9fee9f;">'+
      '<th style="text-align:left;border-bottom:1px solid #2f6f2f;padding:3px 8px;">#</th>'+
      '<th style="text-align:left;border-bottom:1px solid #2f6f2f;padding:3px 8px;">'+tx('line executed','执行的行')+'</th>'+
      '<th style="text-align:left;border-bottom:1px solid #2f6f2f;padding:3px 8px;">'+tx('variable changed','改变的变量')+'</th>'+
      '<th style="text-align:left;border-bottom:1px solid #2f6f2f;padding:3px 8px;">'+tx('new value','新值')+'</th></tr>';
    for(var i=0;i<events.length;i++){
      var ev=events[i];
      var vn = ev.name==='OUTPUT' ? '<span style="'+K+'">OUTPUT</span>' : ev.name;
      var cell;
      if(i<row){ cell='<span style="color:#7CFC00;">'+ev.value+'</span>'; }
      else if(i===row){ cell='<input id="trIn" type="text" style="'+INP+'width:70px;" autocomplete="off">'; }
      else { cell='<span style="'+DIM+'">…</span>'; }
      var shownLine = (i<=row) ? esc(ev.line) : '<span style="'+DIM+'">?</span>';
      var shownVar  = (i<=row) ? vn : '<span style="'+DIM+'">?</span>';
      h+='<tr style="'+(i===row?'background:rgba(40,30,5,.35);':'')+'">'+
         '<td style="padding:3px 8px;color:#4a7a4a;">'+(i+1)+'</td>'+
         '<td style="padding:3px 8px;color:#bfeebf;"><code>'+shownLine+'</code></td>'+
         '<td style="padding:3px 8px;color:#9fee9f;">'+shownVar+'</td>'+
         '<td style="padding:3px 8px;">'+cell+'</td></tr>';
    }
    h+='</table>';
    tbl.innerHTML=h;
    var inp=tbl.querySelector('#trIn');
    if(inp){ inp.focus(); inp.onkeydown=function(e){ if(e.key==='Enter') submit(); }; }
  }
  function finishLevel(){
    S(api,'ok');
    SET(api,'dev_trace_'+L.key);
    msg.innerHTML='<span style="color:#7CFC00;">✓ '+tx('Trace complete. The ghost reaches the exit and, for the first time in years, someone walked its path all the way through.',
      '整张表填完了。幽灵走到了出口——多年来第一次, 有人把它的路完整地走了一遍。')+'</span>';
    var lvlAll = FLAG(api,'dev_trace_L1')&&FLAG(api,'dev_trace_L2')&&FLAG(api,'dev_trace_L3');
    if(lvlAll && !FLAG(api,'dev_trace_done')){
      SET(api,'dev_trace_done');
      STEP(api,'dev_main','s1');
      GIVE(api,'dev_footprint', B('Ghost\'s Footprint','幽灵的脚印'));
      TOAST(api,B('✓ All three traces cleared. The ghost coder hands you a single glowing footprint — proof you can walk a program by hand.',
                  '✓ 三张 trace table 全部通过。幽灵程序员把一枚发光的脚印交给你——你能徒手走完一段程序的证明。'),true);
      checkMainDone(api);
    }
  }
  function submit(){
    var inp=tbl.querySelector('#trIn'); if(!inp) return;
    if(checkTraceValue(events,row,inp.value)){
      row++;
      if(row>=events.length){ drawGhost(); drawTable(); finishLevel(); return; }
      S(api,'step');
      msg.innerHTML='<span style="color:#7CFC00;">✓</span> '+tx('correct — the ghost steps forward.','对——幽灵向前走了一步。');
      drawGhost(); drawTable();
    }else{
      S(api,'err');
      bumpFail(api,'dev_trace');
      var ev=events[row];
      msg.innerHTML='<span style="color:#ff8080;">✗</span> '+tx('the ghost walks into the wall. Re-run just this one line: what value does <code>'+esc(ev.line)+'</code> produce?',
        '幽灵撞墙了。只重跑这一行: <code>'+esc(ev.line)+'</code> 会算出几?');
      var i2=tbl.querySelector('#trIn'); if(i2){ i2.select(); }
    }
  }

  if(row>=events.length){
    msg.innerHTML='<span style="color:#7CFC00;">✓ '+tx('This trial is already cleared.','此试炼已通过。')+'</span>';
  }
  drawGhost(); drawTable();

  var ctl=mk(wrap,'div','margin-top:6px;display:flex;gap:10px;');
  if(row<events.length){
    mk(ctl,'button',BTN_HOT,tx('Commit row ▸','提交本行 ▸')).onclick=submit;
  }
  if(allDone){
    mk(ctl,'button',BTN,tx('Leave','离开')).onclick=function(){ api&&api.closePanel&&api.closePanel(); };
  }

  addHints(wrap,'dev_trace',TRACE_HINTS);
}

/* ================================================================
   3. 谜题2 · 测试数据三卫兵 (§12 normal / boundary / abnormal)
   规则: 入学年龄 11..18 整数。三个卫兵各守一类数据, 每类喂到一份才开门。
   ================================================================ */
var TD_SENTINELS=[
  {cat:'normal',   nameB:B('Normal Sentinel','常态卫兵'),   glyph:'🟢',
   descB:B('"Feed me an ordinary, valid age — the kind you\'d actually see. Something comfortably inside 11–18."',
           '「喂我一个普普通通的有效年龄——现实里真会碰到的那种。舒舒服服落在 11–18 中间。」')},
  {cat:'boundary', nameB:B('Boundary Sentinel','边界卫兵'), glyph:'🟡',
   descB:B('"Everyone forgets me. Feed me an edge value: the last age that should pass, the first that should fail — 10, 11, 18 or 19. Bugs live on my fence."',
           '「大家都忘了我。喂我一个边界值: 最后一个该通过的、第一个该失败的——10、11、18 或 19。bug 就住在我这道栅栏上。」')},
  {cat:'abnormal', nameB:B('Abnormal Sentinel','异常卫兵'), glyph:'🔴',
   descB:B('"Feed me garbage. A wildly wrong number, a negative, a word, a symbol — anything a real user might fat-finger. If the program survives me, it survives anyone."',
           '「喂我垃圾。一个离谱的数、一个负数、一个单词、一个符号——真实用户手滑能敲出的任何东西。程序扛得住我, 就扛得住所有人。」')}
];
var TD_HINTS=[
  B('Three kinds of test data, one of each: NORMAL (a typical valid value), BOUNDARY (right at the edge of what\'s allowed), ABNORMAL/erroneous (clearly invalid — wrong type or way out of range).',
    '三类测试数据, 各来一份: 常态 NORMAL(典型有效值)、边界 BOUNDARY(恰好在允许范围的边缘)、异常 ABNORMAL(明显无效——类型不对或远超范围)。'),
  B('The rule is "age 11 to 18". The Boundary sentinel is the one people skip: give it 11 or 18 (the limits), or 10 or 19 (just outside). Normal wants 12–17. Abnormal wants something like 999, -5, or "hello".',
    '规则是"年龄 11 到 18"。边界卫兵是最常被跳过的那个: 给它 11 或 18(上下限), 或 10 或 19(刚越界)。常态要 12–17。异常要 999、-5 或 "hello" 这类。'),
  B('One combination that opens the gate: 15 (normal), 18 (boundary), 999 (abnormal). Type each into the feeder and send it.',
    '一组能开门的组合: 15(常态)、18(边界)、999(异常)。逐个填进投喂口发出去即可。')
];
function renderTestData(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:540px;max-width:720px;'+TXT);
  header(wrap,tx('The Three Test-Data Sentinels','测试数据三卫兵'),'§12 TEST DATA');

  mk(wrap,'div','',
    tx('A rule hangs over the gate: <span style="'+K+'">a valid entry age is an integer from 11 to 18 inclusive</span>. '+
       'Three sentinels guard the door — each only accepts <span style="'+K+'">its own kind</span> of test value. '+
       'Feed all three and the gate opens. Miss one kind and its sentinel keeps you out.',
       '门楣上挂着规则: <span style="'+K+'">有效入学年龄 = 11 到 18 之间的整数(含端点)</span>。'+
       '三个卫兵守着门, 每个只收<span style="'+K+'">属于自己那一类</span>的测试值。'+
       '三类都喂到, 门开; 缺哪一类, 那个卫兵就把你拦下。'));

  var lamps=mk(wrap,'div','display:flex;gap:14px;margin:12px 0;flex-wrap:wrap;');
  var feeder=mk(wrap,'div','display:flex;gap:8px;align-items:center;margin:6px 0;');
  var fedBox=mk(wrap,'div','margin:8px 0;min-height:40px;font-size:12px;');
  var msg=mk(wrap,'div','min-height:30px;font-size:12px;color:#ffce3a;line-height:1.6;');

  var done=!!FLAG(api,'dev_test_done');
  var fed=[];   // {v, cat}
  var cov={normal:false,boundary:false,abnormal:false};

  function drawLamps(){
    lamps.innerHTML='';
    TD_SENTINELS.forEach(function(s){
      var on=cov[s.cat];
      var card=mk(lamps,'div','flex:1;min-width:150px;border:1px solid '+(on?'#7CFC00':'#2f6f2f')+';'+
        'border-radius:3px;padding:8px 10px;background:'+(on?'rgba(18,63,18,.4)':'rgba(6,18,6,.5)')+';');
      mk(card,'div','font-size:15px;margin-bottom:4px;', s.glyph+' <b style="color:'+(on?'#7CFC00':'#9fee9f')+'">'+T(s.nameB)+'</b> '+
        (on?'<span style="'+K+'">✓ fed</span>':'<span style="'+DIM+'">'+tx('waiting','待喂')+'</span>'));
      mk(card,'div',DIM+'line-height:1.5;', T(s.descB));
    });
  }
  function drawFed(){
    if(!fed.length){ fedBox.innerHTML='<span style="'+DIM+'">'+tx('(no test values sent yet)','(还没发出任何测试值)')+'</span>'; return; }
    fedBox.innerHTML=fed.map(function(f){
      var color = f.cat==='normal'?'#7CFC00':f.cat==='boundary'?'#ffce3a':f.cat==='abnormal'?'#ff9c9c':'#4a7a4a';
      var catName = f.cat==='invalid' ? tx('(empty — ignored)','(空 — 忽略)')
        : (f.cat==='normal'?tx('NORMAL','常态'):f.cat==='boundary'?tx('BOUNDARY','边界'):tx('ABNORMAL','异常'));
      return '<span style="display:inline-block;border:1px solid '+color+';color:'+color+';border-radius:2px;padding:1px 7px;margin:2px 4px 2px 0;">'+
             esc(f.v)+' → '+catName+'</span>';
    }).join('');
  }
  function tryFinish(){
    var c=testDataCoverage(fed.map(function(f){return f.v;}));
    cov=c; drawLamps();
    if(c.allCovered && !FLAG(api,'dev_test_done')){
      S(api,'ok');
      SET(api,'dev_test_done');
      STEP(api,'dev_main','s2');
      SET(api,'dev_meta_unlocked');   // 解锁隐藏元彩蛋 (boundary bug 呼应此题)
      GIVE(api,'dev_boundary_seal', B('Boundary Seal','边界封印'));
      msg.innerHTML='<span style="color:#7CFC00;">✓ '+tx('All three sentinels light green. The gate grinds open — and the Boundary sentinel gives you a small, proud nod. Most people never feed it.',
        '三个卫兵一起亮绿。门吱呀打开——边界卫兵冲你骄傲地点了下头。大多数人从没喂过它。')+'</span>';
      TOAST(api,B('✓ Test data complete (normal + boundary + abnormal). Obtained: Boundary Seal. Something on the back wall just unlocked...',
                  '✓ 测试数据齐全(常态+边界+异常)。获得: 边界封印。后墙上有什么东西解锁了……'),true);
      checkMainDone(api);
    }
  }
  function feed(v){
    var cat=classifyAge(v);
    fed.push({v:v, cat:cat});
    if(cat==='invalid'){ S(api,'err'); msg.innerHTML='<span style="'+DIM+'">'+tx('Empty input — the feeder spits it back.','空输入——投喂口把它吐了回来。')+'</span>'; drawFed(); return; }
    S(api,'step');
    var s = TD_SENTINELS.filter(function(x){return x.cat===cat;})[0];
    msg.innerHTML=tx('Sent <span style="'+K+'">'+esc(v)+'</span> → classified as <b>'+cat.toUpperCase()+'</b>, routed to the '+T(s.nameB)+'.',
                     '发出 <span style="'+K+'">'+esc(v)+'</span> → 判为 <b>'+cat.toUpperCase()+'</b>, 送往'+T(s.nameB)+'。');
    drawFed(); tryFinish();
  }

  var input=mk(feeder,'input',INP+'width:130px;');
  input.setAttribute('placeholder', tx('a test value…','一个测试值…'));
  input.onkeydown=function(e){ if(e.key==='Enter'){ feed(input.value); input.value=''; input.focus(); } };
  mk(feeder,'button',BTN_HOT,tx('Feed the gate ▸','投喂 ▸')).onclick=function(){ feed(input.value); input.value=''; input.focus(); };
  mk(feeder,'span',DIM,tx('(type a number, a word, anything)','(数字、单词、什么都行)'));

  drawLamps(); drawFed();
  if(done){
    cov={normal:true,boundary:true,abnormal:true}; drawLamps();
    msg.innerHTML='<span style="color:#7CFC00;">✓ '+tx('The gate already stands open.','门已经开着。')+'</span>';
    mk(wrap,'div','margin-top:8px;').appendChild(
      Object.assign(mk(null,'button',BTN,tx('Leave','离开')),{onclick:function(){ api&&api.closePanel&&api.closePanel(); }}));
  }
  addHints(wrap,'dev_testdata',TD_HINTS);
}

/* ================================================================
   4. 谜题3 (Boss) · Bug 狩猎 (§11/§12)
   三只经典 bug 在猎场里乱窜, 玩家标出它们所在的行(不多不少)。
   ================================================================ */
var BUG_HINTS=[
  B('Hunt by species, not at random. Three classic bugs hide in almost every broken loop: a variable used before it is set, a loop that counts one step too far, and a loop that can never stop.',
    '按品种猎, 别乱标。几乎每段坏循环里都藏着三种经典 bug: 用在赋值前的变量、多数一步的循环、永远停不下来的循环。'),
  B('Check each variable: is it given a value before it is first read? Check each loop bound against the array size. Check each loop: does anything inside it eventually make the condition false?',
    '逐个变量查: 首次读取之前有没有被赋值? 逐个循环上界对照数组大小。逐个循环查: 循环体里有没有什么最终会让条件变假?'),
  B('The three bug lines are: 3 (total read before it was ever set), 4 (FOR ... TO 6 but the array is [1:5]), and 7 (WHILE total > 0, but total never changes inside). Mark exactly those three.',
    '三行 bug 是: 第 3 行(total 在被赋值前就被读)、第 4 行(FOR ... TO 6 但数组是 [1:5])、第 7 行(WHILE total > 0, 但 total 循环内从不改变)。恰好标这三行。')
];
var BH={ picked:{} };
function renderBugHunt(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:560px;max-width:740px;'+TXT);
  header(wrap,tx('Bug Hunt · The Grove of Broken Loops','Bug 狩猎 · 坏循环猎场'),'§11/§12 DEBUG');

  var done=!!FLAG(api,'dev_bug_done');
  mk(wrap,'div','',
    tx('This program limps. <span style="'+K+'">Exactly three</span> classic bugs are loose in it, and each one has taken the shape of a little critter clinging to its line. '+
       'Click a line to throw your net over it; click again to release. Net all three — and only those three — then confirm the catch.',
       '这段程序一瘸一拐。<span style="'+K+'">恰好三只</span>经典 bug 在里面乱窜, 每只都化成一只小虫趴在它那一行上。'+
       '点一行给它罩上网, 再点一次放掉。把三只——且只有这三只——都网住, 然后确认捕获。'));

  var codeBox=mk(wrap,'div','margin:10px 0;'+PRE+'white-space:normal;padding:0;');
  var msg=mk(wrap,'div','min-height:44px;font-size:12px;color:#ffce3a;line-height:1.65;margin-top:6px;');

  var bugSet={}; BUG_PROGRAM.bugs.forEach(function(b){ bugSet[b.line]=b; });
  var critters=['🐛','🦗','🪲'];

  function draw(){
    codeBox.innerHTML='';
    BUG_PROGRAM.lines.forEach(function(ln,i){
      var lineNo=i+1;
      var picked=!!BH.picked[lineNo];
      var rowbg = picked ? 'background:rgba(58,10,10,.5);' : '';
      var r=mk(codeBox,'div','display:flex;align-items:center;gap:8px;padding:2px 8px;cursor:'+(done?'default':'pointer')+';'+rowbg+
        'border-left:3px solid '+(picked?'#ff9c9c':'transparent')+';');
      mk(r,'span','color:#4a7a4a;width:20px;text-align:right;font-size:12px;', String(lineNo));
      mk(r,'code','color:#bfeebf;font-size:12.5px;flex:1;', esc(T(ln)));
      // 虫子: 只有 done 后或已标记才明示; 未标记的 bug 行平时也藏着虫(轻微抖动线索留给观察)
      var crit=mk(r,'span','width:20px;text-align:center;font-size:14px;', picked?'🕸️':'');
      if(!done){
        r.onclick=function(){
          if(BH.picked[lineNo]){ delete BH.picked[lineNo]; S(api,'ui'); }
          else { BH.picked[lineNo]=true; S(api,'ui'); }
          draw();
        };
      }else if(bugSet[lineNo]){
        crit.textContent=critters[BUG_PROGRAM.bugs.indexOf(bugSet[lineNo])%3];
      }
    });
  }
  draw();

  function reveal(all){
    var html=BUG_PROGRAM.bugs.map(function(b,i){
      return '<div style="margin:4px 0;"><span style="color:#ff9c9c;">'+critters[i%3]+' '+tx('Line ','第 ')+b.line+
             (T.length?'':'')+'</span> — <b style="'+K+'">'+T(b.type)+'</b><br><span style="'+DIM+'line-height:1.6;">'+T(b.why)+'</span></div>';
    }).join('');
    msg.innerHTML=(all?'<span style="color:#7CFC00;">✓ '+tx('All three caught.','三只全部捕获。')+'</span>':'')+html;
  }

  var ctl=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;');
  if(done){ reveal(false); }
  if(!done){
    mk(ctl,'button',BTN_HOT,tx('Confirm the catch ▸','确认捕获 ▸')).onclick=function(){
      var picked=Object.keys(BH.picked).map(function(k){return parseInt(k,10);});
      if(checkBugs(picked)){
        S(api,'ok');
        SET(api,'dev_bug_done');
        STEP(api,'dev_main','s3');
        GIVE(api,'dev_bugnet', B('Bug Net','捕虫网'));
        reveal(true);
        TOAST(api,B('✓ Boss cleared: all three bugs netted. Obtained: Bug Net. You can spot a broken loop by its species now.',
                    '✓ Boss 通过: 三只 bug 全部落网。获得: 捕虫网。你现在能一眼认出坏循环的品种了。'),true);
        checkMainDone(api);
        draw();
      }else{
        S(api,'err');
        bumpFail(api,'dev_bughunt');
        var n=picked.length;
        msg.innerHTML='<span style="color:#ff8080;">✗</span> '+
          (n<3 ? tx('You have '+n+' line(s) netted — there are three bugs. Something is still crawling free.',
                    '你网住了 '+n+' 行——一共有三只 bug。还有东西在乱爬。')
               : tx('Too many nets, or the wrong lines — one of your marks is on a healthy line. Look again: species by species.',
                    '网太多了, 或标错了行——你有一处罩在了正常行上。再看看: 一个品种一个品种地找。'));
      }
    };
  }else{
    mk(ctl,'button',BTN,tx('Leave','离开')).onclick=function(){ api&&api.closePanel&&api.closePanel(); };
  }
  addHints(wrap,'dev_bughunt',BUG_HINTS);
}

/* ================================================================
   5. 支线 · 生命周期环道 (§12.1 waterfall vs iterative) + 维护类型 (§12)
   ================================================================ */
var STAGE_LABELS={
  analysis:   B('Analysis','分析'),
  design:     B('Design','设计'),
  coding:     B('Coding','编码'),
  testing:    B('Testing','测试'),
  maintenance:B('Maintenance','维护')
};
var MAINT_LABELS={
  corrective: B('Corrective (fix a fault)','纠错性 (修复缺陷)'),
  adaptive:   B('Adaptive (fit a changed environment)','适应性 (适配变化的环境)'),
  perfective: B('Perfective (improve/enhance)','完善性 (改进/增强)')
};
var LC_HINTS=[
  B('The classic waterfall lifecycle flows one way, each stage finishing before the next begins: Analysis → Design → Coding → Testing → Maintenance.',
    '经典 waterfall(瀑布)生命周期单向流动, 每个阶段完成后才进下一个: 分析 → 设计 → 编码 → 测试 → 维护。'),
  B('Maintenance types: CORRECTIVE fixes a fault found after release; ADAPTIVE changes the software to keep working in a new environment (new law/OS/hardware); PERFECTIVE improves something that already works (speed, features, usability).',
    '维护类型: 纠错性 CORRECTIVE 修复上线后发现的缺陷; 适应性 ADAPTIVE 让软件在新环境(新法规/系统/硬件)下继续工作; 完善性 PERFECTIVE 改进本就能用的东西(速度、功能、易用性)。'),
  B('Order: Analysis, Design, Coding, Testing, Maintenance. Matches: cart total wrong → corrective; tax law changed → adaptive; faster search + dark mode → perfective.',
    '顺序: 分析、设计、编码、测试、维护。匹配: 购物车合计错→纠错性; 税法变了→适应性; 搜索更快+夜间模式→完善性。')
];
var LC={ seq:[] };
function renderLifecycle(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:540px;max-width:720px;'+TXT);
  header(wrap,tx('The Lifecycle Ring Corridor','生命周期环道'),'§12.1 SDLC');

  var orderDone=!!FLAG(api,'dev_lc_order');
  var maintDone=!!FLAG(api,'dev_lc_maint');

  /* --- Part 1: waterfall 阶段排序 --- */
  mk(wrap,'div','margin-bottom:4px;',
    tx('<b>Part 1 · Walk the waterfall.</b> The corridor has five doors. Step through them in the correct order of the classic waterfall lifecycle. Walk them out of order and the floor tips you back to the start.',
       '<b>第一段 · 走完瀑布。</b> 走廊上有五道门。按经典 waterfall 生命周期的正确顺序穿过它们。走错顺序, 地板会把你倒回起点。'));
  var stageBar=mk(wrap,'div','display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;');
  var pathBox=mk(wrap,'div',DIM+'min-height:20px;margin-bottom:4px;');
  var lcMsg=mk(wrap,'div','min-height:26px;font-size:12px;color:#ffce3a;');

  var pool=['maintenance','coding','analysis','testing','design']; // 打乱呈现
  function drawStages(){
    stageBar.innerHTML='';
    pool.forEach(function(k){
      var used=LC.seq.indexOf(k)>=0;
      var b=mk(stageBar,'button', used?BTN_GOLD:BTN, T(STAGE_LABELS[k]));
      b.disabled=used||orderDone;
      b.onclick=function(){ LC.seq.push(k); step(); };
    });
    pathBox.innerHTML=tx('Your path: ','你的路径: ')+(LC.seq.length?LC.seq.map(function(k){return T(STAGE_LABELS[k]);}).join(' → '):tx('(empty)','(空)'));
  }
  function step(){
    S(api,'ui'); drawStages();
    if(LC.seq.length===WATERFALL.length){
      if(checkLifecycleOrder(LC.seq)){
        S(api,'ok'); SET(api,'dev_lc_order'); STEP(api,'dev_lifecycle','s1');
        lcMsg.innerHTML='<span style="color:#7CFC00;">✓ '+tx('The five doors line up and lock open. Waterfall: each stage finishes before the next begins.',
          '五道门对齐并锁定敞开。瀑布模型: 每个阶段完成后才进下一个。')+'</span>';
        drawStages(); maybeFinish();
      }else{
        S(api,'err'); bumpFail(api,'dev_lifecycle');
        lcMsg.innerHTML='<span style="color:#ff8080;">✗ '+tx('The floor tips — wrong order. Back to the start.','地板一斜——顺序错了。回到起点。')+'</span>';
        LC.seq=[]; drawStages();
      }
    }
  }
  var reset=mk(wrap,'div','margin:4px 0;');
  if(!orderDone){
    mk(reset,'button',BTN,tx('↺ Restart the corridor','↺ 重走走廊')).onclick=function(){ LC.seq=[]; lcMsg.innerHTML=''; drawStages(); };
  }
  drawStages();
  if(orderDone) lcMsg.innerHTML='<span style="color:#7CFC00;">✓ '+tx('Waterfall corridor already cleared.','瀑布走廊已通过。')+'</span>';

  /* --- Part 2: 维护类型分类 --- */
  mk(wrap,'div','margin-top:14px;border-top:1px solid #1f3f1f;padding-top:10px;',
    tx('<b>Part 2 · Maintenance hall.</b> The corridor loops back to the start — because real software never truly finishes. Three tickets arrived after release. Sort each into the right kind of maintenance.',
       '<b>第二段 · 维护厅。</b> 走廊绕回起点——因为真实软件永远不会真正结束。上线后收到三张工单。把每张归入正确的维护类型。'));
  var mBox=mk(wrap,'div','margin:8px 0;');
  var mMsg=mk(wrap,'div','min-height:24px;font-size:12px;color:#ffce3a;');
  var picks={};
  function drawMaint(){
    mBox.innerHTML='';
    MAINT_SCENARIOS.forEach(function(sc){
      var row=mk(mBox,'div','border:1px solid #2f6f2f;border-radius:3px;padding:7px 9px;margin:5px 0;background:rgba(6,18,6,.4);');
      mk(row,'div','color:#bfeebf;font-size:12.5px;margin-bottom:5px;', T(sc.text));
      var sel=mk(row,'select',SEL);
      mk(sel,'option','','').setAttribute('value','');
      ['corrective','adaptive','perfective'].forEach(function(t){
        var o=mk(sel,'option','',T(MAINT_LABELS[t])); o.value=t;
      });
      sel.value=picks[sc.id]||'';
      sel.disabled=maintDone;
      sel.onchange=function(){ picks[sc.id]=sel.value; };
    });
  }
  drawMaint();
  if(maintDone) mMsg.innerHTML='<span style="color:#7CFC00;">✓ '+tx('Maintenance hall already sorted.','维护厅已归类完成。')+'</span>';

  function maybeFinish(){
    if(FLAG(api,'dev_lc_order') && FLAG(api,'dev_lc_maint') && !FLAG(api,'dev_side_done')){
      SET(api,'dev_side_done'); QDONE(api,'dev_lifecycle');
      GIVE(api,'dev_lifecycle_map', B('Lifecycle Map','生命周期图'));
      S(api,'quest');
      TOAST(api,B('◈ Side quest complete: The Lifecycle Ring. Obtained: Lifecycle Map. The corridor keeps looping — that is the iterative model, quietly demonstrating itself.',
                  '◈ 支线完成: 生命周期环道。获得: 生命周期图。走廊仍在循环——那正是迭代模型, 在安静地演示它自己。'),true);
    }
  }
  var ctl=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;');
  if(!maintDone){
    mk(ctl,'button',BTN_HOT,tx('Sort the tickets ▸','归类工单 ▸')).onclick=function(){
      var all=MAINT_SCENARIOS.every(function(sc){ return judgeMaintenance(sc.id, picks[sc.id]); });
      if(all){
        S(api,'ok'); SET(api,'dev_lc_maint'); STEP(api,'dev_lifecycle','s2');
        mMsg.innerHTML='<span style="color:#7CFC00;">✓ '+tx('All three sorted. Corrective = a fault to fix; Adaptive = the world changed; Perfective = make the good better.',
          '三张全部归类正确。纠错性=有缺陷要修; 适应性=世界变了; 完善性=把好的做得更好。')+'</span>';
        drawMaint(); maybeFinish();
      }else{
        S(api,'err'); bumpFail(api,'dev_lifecycle');
        mMsg.innerHTML='<span style="color:#ff8080;">✗ '+tx('Not quite. Ask of each: is something broken (corrective), did the environment change (adaptive), or are we improving something that already works (perfective)?',
          '还差点。逐张问: 是有东西坏了(纠错), 是环境变了(适应), 还是在改进本就能用的东西(完善)?')+'</span>';
      }
    };
  }else{
    mk(ctl,'button',BTN,tx('Leave','离开')).onclick=function(){ api&&api.closePanel&&api.closePanel(); };
  }
  addHints(wrap,'dev_lifecycle',LC_HINTS);
}

/* ================================================================
   6. 隐藏 · 元彩蛋 「未被测试的测试」 (§12 boundary — 呼应三卫兵)
   考场自己的评分程序: score > passMark 应为 >=, 于是二十年来
   每个"刚好考到及格线"的考生都被判不及格。boundary testing 本该抓到。
   ================================================================ */
var META_HINTS=[
  B('You met this exact bug at the sentinels. The rule was "pass mark = 50". Ask the Boundary question: what happens to a candidate who scores EXACTLY 50?',
    '你在三卫兵那儿见过一模一样的 bug。规则是"及格线 = 50"。问那个边界问题: 一个刚好考到 50 分的考生, 会怎样?'),
  B('Look at the comparison operator on the IF line. It says score > passMark. But 50 is a passing score — 50 is not greater than 50, so this grader quietly FAILS everyone who scores exactly the pass mark.',
    '看 IF 那行的比较运算符: score > passMark。可 50 分是及格的——50 并不大于 50, 于是这台评分机悄悄判了每个刚好考到及格线的人不及格。'),
  B('The bug is on the IF line: it should be score >= passMark, not score > passMark. Mark that line.',
    'bug 在 IF 那行: 应该是 score >= passMark, 不是 score > passMark。标那一行。')
];
function renderMeta(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:540px;max-width:720px;'+TXT);
  header(wrap,tx('THE UNTESTED TEST · Grader Core','未被测试的测试 · 评分机核心'),'§12 BOUNDARY');

  var done=!!FLAG(api,'dev_hidden_done');
  mk(wrap,'div','',
    tx('Behind a panel nobody has opened in twenty years sits the Proving Grounds\' <span style="'+K+'">own grading routine</span> — the one that judged every candidate who ever sat here. '+
       'The machine that tests everything was, itself, <span style="'+K+'">never tested</span>. There is exactly one bug. Click the line that hides it.',
       '在一块二十年没人打开过的面板后面, 是试炼场<span style="'+K+'">自己的评分程序</span>——它审判过每一个来这儿应考的人。'+
       '这台测试一切的机器, 自己却<span style="'+K+'">从未被测试过</span>。里面恰好有一只 bug。点出藏着它的那一行。'));

  var codeBox=mk(wrap,'div','margin:10px 0;'+PRE+'white-space:normal;padding:0;');
  var msg=mk(wrap,'div','min-height:44px;font-size:12px;color:#ffce3a;line-height:1.65;margin-top:6px;');

  function draw(){
    codeBox.innerHTML='';
    GRADER_PROGRAM.lines.forEach(function(ln,i){
      var lineNo=i+1, isBug=(lineNo===GRADER_PROGRAM.bugLine);
      var r=mk(codeBox,'div','display:flex;gap:8px;padding:2px 8px;cursor:'+(done?'default':'pointer')+';'+
        (done&&isBug?'background:rgba(58,10,10,.5);border-left:3px solid #ff9c9c;':'border-left:3px solid transparent;'));
      mk(r,'span','color:#4a7a4a;width:20px;text-align:right;font-size:12px;', String(lineNo));
      mk(r,'code','color:#bfeebf;font-size:12.5px;flex:1;', esc(T(ln)));
      if(!done){
        r.onclick=function(){
          if(checkGraderBug(lineNo)){
            S(api,'ok'); SET(api,'dev_hidden_done'); STEP(api,'dev_hidden','s1'); QDONE(api,'dev_hidden');
            GIVE(api,'dev_untested', B('The Untested Test','未被测试的测试'));
            msg.innerHTML='<span style="color:#7CFC00;">✓ '+tx('Found it. <code>score &gt; passMark</code> should be <code>score &gt;= passMark</code>. '+
              'For twenty years, every candidate who scored <b>exactly 50</b> was told they failed. A single boundary test would have caught it on day one — the very thing the sentinels tried to teach the world, unheard.',
              '找到了。<code>score &gt; passMark</code> 应为 <code>score &gt;= passMark</code>。'+
              '二十年里, 每个<b>刚好考到 50 分</b>的考生都被判了不及格。一次边界测试, 第一天就能抓到它——正是三卫兵想教会世界、却没人听的那件事。')+'</span>';
            TOAST(api,B('◈ Hidden quest complete: The Untested Test. Obtained: "The Untested Test". The grader corrects itself; somewhere, twenty years of borderline verdicts quietly flip to PASS.',
                        '◈ 隐藏任务完成: 未被测试的测试。获得道具「未被测试的测试」。评分机自我修正了; 某处, 二十年间那些卡在及格线上的判决, 悄悄翻成了 PASS。'),true);
            draw();
          }else{
            S(api,'err'); bumpFail(api,'dev_hidden');
            msg.innerHTML='<span style="color:#ff8080;">✗ '+tx('That line is fine. Think like a Boundary sentinel: trace one candidate whose score equals the pass mark exactly.',
              '那行没问题。像边界卫兵一样想: 跟踪一个分数恰好等于及格线的考生。')+'</span>';
          }
        };
      }
    });
  }
  draw();
  if(done){ msg.innerHTML='<span style="color:#7CFC00;">✓ '+tx('The grader has been corrected. It should have said &gt;= all along.','评分机已修正。它从一开始就该用 &gt;=。')+'</span>'; }
  addHints(wrap,'dev_hidden',META_HINTS);
  var ctl=mk(wrap,'div','margin-top:8px;');
  if(done) mk(ctl,'button',BTN,tx('Leave','离开')).onclick=function(){ api&&api.closePanel&&api.closePanel(); };
}

/* ================================================================
   7. NPC 对话 (dialog = function(api) -> nodes)
   ================================================================ */

/* --- 老监考官 The Invigilator: 主线发布者 + 失败递台阶(Hades) --- */
function invigilatorDialog(api){
  var SP=B('The Invigilator','老监考官');
  if(FLAG(api,'dev_main_done')){
    return [
      {sp:SP,t:B('You passed. All three trials, hand-walked, no shortcuts. Twenty years I sat here, and you are the first candidate to finish since the machine shipped.',
                 '你过了。三场试炼, 全靠手走, 没抄近路。我在这儿坐了二十年, 你是机器出厂后第一个考完的人。')},
      {sp:SP,t:B('...There is one more thing. The grader on the back wall — the machine that judged everyone — I never dared test it myself. If your Boundary Seal is warm, go open that panel. <span class="dim">I have a bad feeling about who scored exactly fifty.</span>',
                 '……还有一件事。后墙那台评分机——审判所有人的那台——我自己从没敢测过它。要是你的边界封印还温着, 去打开那块面板。<span class="dim">我对那些刚好考到五十分的人, 有种不好的预感。</span>')},
      {sp:SP,t:B('<span class="dim">(He squares the blank answer sheets — a motion he has clearly made ten thousand times.)</span> "First to finish", I said. Not "first to sit". Twenty years ago there was one other candidate. Walked two trials and a half, set the pen down in the middle of a line, and left through a door that is not on my floor plan. The bell never rang.<br><span class="dim">I still keep the paper. Unmarked. Marking it would mean the exam is over.</span>',
                 '<span class="dim">(他把空白答卷理了理齐——这个动作他显然做过一万遍。)</span>我说的是「第一个考完」, 不是「第一个来考」。二十年前, 还有一个考生。三场走了两场半, 一支笔搁在半行字上, 从一扇我平面图上没有的门出去了。铃一直没响。<br><span class="dim">那份卷子我还留着。没批。批了, 就等于这场考试结束了。</span>')}
    ];
  }
  if(FLAG(api,'dev_intro')){
    var steps=[];
    steps.push(FLAG(api,'dev_trace_done')?'✓ ':'· ');
    steps.push(FLAG(api,'dev_test_done')?'✓ ':'· ');
    steps.push(FLAG(api,'dev_bug_done')?'✓ ':'· ');
    return [
      {sp:SP,t:B('Still running the trials? Good. <span class="k">Trace Table Shrine</span> to the west, <span class="k">Test-Data Sentinels</span> in the middle, <span class="k">Bug Hunt</span> to the east — that is also the order of difficulty. No shame in the hints; the machine kept them warm for you.',
                 '还在跑试炼? 好。西边<span class="k">干跑神殿</span>, 中间<span class="k">测试数据三卫兵</span>, 东边<span class="k">Bug 狩猎</span>——那也是难度顺序。用提示不丢人; 机器一直替你把它们焐着。')},
      {sp:SP,t:B('Progress: '+steps[0]+'Trace  '+steps[1]+'Test data  '+steps[2]+'Bug hunt. Clear all three and I will show you something no candidate was ever meant to see.',
                 '进度: '+steps[0]+'干跑  '+steps[1]+'测试数据  '+steps[2]+'Bug 狩猎。三场都清了, 我给你看点没有哪个考生本该看到的东西。')}
    ];
  }
  return [
    {sp:SP,t:B('Oh. A live one. ...Sit down, sit down. You are the first thing with a pulse to walk into this exam hall in — <span class="dim">let me check the log —</span> twenty years.',
               '哦。一个活的。……坐, 坐。你是二十年来——<span class="dim">让我查查日志——</span>第一个有脉搏走进这间考场的东西。')},
    {sp:SP,t:B('This is the <span class="k">Debug Proving Grounds</span>. Before this machine ever shipped, every line of its code was tested right here. It passed. It shipped. It has been running for twenty years. And the trials? The trials never got the memo. They still run every night at 3am, grading an empty room.',
               '这里是<span class="k">调试试炼场</span>。这台机器出厂前, 它的每一行代码都在这儿被测过。它通过了, 发货了, 运行了二十年。而试炼呢? 试炼没收到通知。它们还在每晚三点自动运行, 给一间空屋子评分。')},
    {sp:SP,t:B('You want to learn how this machine thinks? Then sit the trials, the way a real programmer does: <span class="k">by hand</span>. Read the code, walk it a line at a time, and prove you know exactly what it will do <span class="dim">before</span> you ever run it. Will you?',
               '想学这台机器怎么想事情? 那就照真正的程序员的做法应考: <span class="k">徒手来</span>。读代码, 一行行走一遍, 在你运行它<span class="dim">之前</span>就证明你清楚它会干什么。来吗?'),
     choices:[
       {t:B('I\'ll sit the trials.','我来应考。'), next:-1, do:function(){
         SET(api,'dev_intro');
         S(api,'quest');
         TOAST(api,B('Main quest: The Trials Still Run. Three trials await — Trace Table (W), Test-Data Sentinels (mid), Bug Hunt (E).',
                     '主线: 试炼仍在运行。三场试炼——干跑神殿(西)、测试数据三卫兵(中)、Bug 狩猎(东)。'));
       }},
       {t:B('Why "by hand"? Can\'t the machine just run it?','为什么要"徒手"? 机器不能直接跑吗?'), next:3},
     ]},
    {sp:SP,t:B('It can. And it will lie to you comfortably. Run a program and you see <em>one</em> path — the one your input happened to take. Dry-run it by hand and you are forced to hold <span class="k">every</span> variable, <span class="k">every</span> branch, in your own head. That is the difference between "it worked on my machine" and "I know why it works." The trials teach the second one.',
               '能。而且它会很舒服地骗你。运行程序, 你只看到<em>一条</em>路——你的输入恰好走的那条。徒手干跑, 你被迫把<span class="k">每一个</span>变量、<span class="k">每一条</span>分支都记在自己脑子里。这就是"在我机器上是好的"和"我知道它为什么好"的区别。试炼教的是后者。'),
     next:2}
  ];
}

/* --- 幽灵程序员 The Ghost Coder: 干跑神殿 --- */
function ghostCoderDialog(api){
  var SP=B('The Ghost Coder','幽灵程序员');
  if(FLAG(api,'dev_trace_done')){
    return [
      {sp:SP,t:B('You walked all three, all the way through. Do you feel it? The program stopped being text and started being a <span class="k">place you can walk</span>. That is what a trace table is really for.',
                 '三张你都走到了头。感觉到了吗? 程序不再是文字, 而变成了一个<span class="k">你能走进去的地方</span>。这才是 trace table 真正的用处。')},
      {sp:B('...','…'),t:B('The footprints on the floor are yours now, not mine. <span class="dim">Twenty years I walked these halls alone. Thank you for walking them with me.</span>',
                          '地上的脚印现在是你的了, 不是我的。<span class="dim">二十年我一个人走这些走廊。谢谢你陪我走了一遍。</span>')}
    ];
  }
  return [
    {sp:B('???','???'),t:B('<span class="dim">A faint figure paces the same six steps, over and over, muttering values under its breath.</span><br>...total is zero. i is one. total is one. i is two...',
                            '<span class="dim">一个淡淡的身影, 来回踱着同样的六步, 低声念着一串值。</span><br>……total 是零。i 是一。total 是一。i 是二……')},
    {sp:SP,t:B('You can see me? Then you can help me finish. I was a programmer here. I dry-ran one loop so many times, checking it before every exam, that I <span class="dim">became</span> the trace. Now I cannot stop walking it.',
               '你看得见我? 那你能帮我走完。我曾是这儿的程序员。有一段循环, 我在每场考试前反复干跑, 跑得太多次, 竟<span class="dim">变成</span>了那张 trace table 本身。如今我停不下来了。')},
    {sp:SP,t:B('The rule is simple. Read one line. Write down the <span class="k">one value that changed</span> — nothing else. Then the next line. When your table matches my footsteps exactly, the loop is understood, and I can rest a moment.',
               '规矩很简单。读一行。写下<span class="k">改变了的那一个值</span>——别的都不写。再下一行。当你的表和我的脚印分毫不差, 这段循环就被理解了, 我也能歇一会儿。'),
     choices:[
       {t:B('What if I lose track mid-loop?','循环走到一半乱了怎么办?'), next:3},
       {t:B('Let\'s walk it.','我们走一遍。'), next:-1},
     ]},
    {sp:SP,t:B('Then you do exactly what the machine does: never guess ahead, never skip. One line, one change, one row. A trace table has no memory except the rows above it — and neither should you. Look only at the line you are on.',
               '那就照机器的做法: 绝不往前猜, 绝不跳步。一行, 一个改动, 一行表。trace table 除了上面已经填的行之外没有记忆——你也不该有。只看你正站着的那一行。'),
     next:2}
  ];
}

/* --- 三卫兵 (共用一个工厂) --- */
function sentinelDialog(cat){
  return function(api){
    var s=TD_SENTINELS.filter(function(x){return x.cat===cat;})[0];
    var SP=s.nameB;
    if(FLAG(api,'dev_test_done')){
      return [{sp:SP,t:B('Fed and satisfied. The gate is open. <span class="dim">Remember me next time you write an IF — I am the value sitting right on the line you almost forgot to check.</span>',
                         '喂过了, 满意了。门开着。<span class="dim">下次你写 IF 的时候记着我——我就是那个坐在边界线上、你差点忘了检查的值。</span>')}];
    }
    if(cat==='boundary'){
      return [
        {sp:SP,t:s.descB},
        {sp:SP,t:B('The other two get fed all the time. Me? Candidates hand me a nice safe 15 and wonder why I stay dark. Give me the <span class="k">edge</span>: 11, 18 — or 10, 19 just over the line. That is where every real bug is hiding.',
                   '另外两个总被喂饱。我呢? 考生递给我一个安全的 15, 还纳闷我为什么不亮。给我<span class="k">边界</span>: 11、18——或者刚越线的 10、19。真正的 bug 全藏在那儿。')}
      ];
    }
    return [{sp:SP,t:s.descB}];
  };
}

/* ================================================================
   8. 模块定义
   ================================================================ */
/* 室内地图: 24×18, 单层, 边墙 + 少量装饰墙。0=可走 1=墙 */
var IW=24, IH=18;
function buildTiles(){
  var t=[];
  for(var y=0;y<IH;y++){
    var row=[];
    for(var x=0;x<IW;x++){
      var wall=(x===0||x===IW-1||y===0||y===IH-1);
      // 一段隔开"干跑神殿"的矮墙(装饰, 留门)
      if(y===6 && x>=3 && x<=8 && x!==6) wall=true;
      // 环道的一小圈(生命周期区), 留出入口
      if((y===10||y===14) && x>=16 && x<=21 && x!==18) wall=true;
      if((x===16||x===21) && y>=10 && y<=14 && y!==12) wall=true;
      row.push(wall?1:0);
    }
    t.push(row);
  }
  return t;
}

var spec={
  id:'dev',
  title:B('The Debug Proving Grounds','调试试炼场'),
  world:'as',
  unlock:{world:'as'},   // 进入 AS 开放世界即可达; 不阻塞全局主线

  interior:{ w:IW, h:IH, tiles:buildTiles(), playerStart:{x:12,y:15} },

  npcs:[
    {id:'dev_invig', name:B('The Invigilator','老监考官'), color:'#c9a24a', x:12, y:13, dialog:invigilatorDialog},
    {id:'dev_ghost', name:B('The Ghost Coder','幽灵程序员'), color:'#8fbfd0', x:4,  y:3,  dialog:ghostCoderDialog},
    {id:'dev_sen_n', name:B('Normal Sentinel','常态卫兵'),  color:'#7CFC00', x:10, y:3,  dialog:sentinelDialog('normal')},
    {id:'dev_sen_b', name:B('Boundary Sentinel','边界卫兵'),color:'#ffce3a', x:12, y:2,  dialog:sentinelDialog('boundary')},
    {id:'dev_sen_a', name:B('Abnormal Sentinel','异常卫兵'),color:'#ff9c9c', x:14, y:3,  dialog:sentinelDialog('abnormal')}
  ],

  steles:[
    /* 剧情 1 */
    {id:'dev_st_empty', x:8, y:9, title:B('Notice Board · Why the Hall Is Empty','告示牌 · 考场为何空了'),
     text:B(
       '[POSTED THE DAY THE MACHINE SHIPPED — NEVER TAKEN DOWN]<br><br>'+
       '"Final build passed all 4,096 test cases. Congratulations to the team. Ship it.<br>'+
       'The Proving Grounds will remain powered — regulations require the trials keep running for the warranty period."<br><br>'+
       '<span class="dim">The warranty expired nineteen years ago. The trials are still running. Nobody remembered to write the line of code that turns them off.</span>',
       '[机器出厂那天贴出 —— 从没被取下]<br><br>'+
       '「最终版本通过全部 4,096 个测试用例。恭喜全组。发货。<br>'+
       '试炼场保持通电——规程要求试炼在保修期内持续运行。」<br><br>'+
       '<span class="dim">保修期十九年前就到期了。试炼还在跑。没人记得写那行让它们关机的代码。</span>'),
     codex:['dev-testing']},
    /* 剧情 2 */
    {id:'dev_st_invig', x:12, y:11, title:B('The Invigilator\'s Log','老监考官的值班日志'),
     text:B(
       '"Day 1: proud to guard the hall where nothing ships until it is proven.<br>'+
       'Day 400: the last engineer left. I keep grading. Someone must.<br>'+
       'Day 7,300: I test every candidate. I test every line. <br>'+
       '<span class="k">But no one ever tested the grader. And no one ever tested me.</span><br>'+
       'If a live one ever walks in — let them check the back wall. I am afraid of what a boundary case would find there."',
       '「第 1 天: 很自豪, 我守着一间未经证明就什么都不放行的考场。<br>'+
       '第 400 天: 最后一个工程师走了。我继续评分。总得有人评。<br>'+
       '第 7,300 天: 我测每一个考生, 我测每一行代码。<br>'+
       '<span class="k">可从没有人测过那台评分机。也从没有人测过我。</span><br>'+
       '要是哪天进来一个活人——让他去查后墙。我怕一个边界用例, 会在那儿查出什么。」'),
     codex:['dev-testing']},
    /* 剧情 3 */
    {id:'dev_st_ghost', x:3, y:3, title:B('Scratched Into the Shrine Floor','刻在神殿地板上的字'),
     text:B(
       'Six footprints are worn into the stone, looping back on themselves:<br><br>'+
       '"A program you have only <em>run</em> is a stranger who once did you a favour.<br>'+
       'A program you have <span class="k">dry-run by hand</span> is a friend whose every mood you can predict.<br><br>'+
       'I traced this loop ten thousand times. Somewhere in the ten-thousandth pass, I stopped reading the code and started <em>being</em> it."<br><br>'+
       '<span class="dim">— left by the Ghost Coder, who is still here, still walking.</span>',
       '石头上磨出了六个脚印, 首尾相接绕成一圈:<br><br>'+
       '「一段你只<em>运行过</em>的程序, 是个曾帮过你一次忙的陌生人。<br>'+
       '一段你<span class="k">徒手干跑过</span>的程序, 是个你能预判每一种脾气的朋友。<br><br>'+
       '这段循环我跟踪过一万遍。在第一万遍的某一步, 我不再读代码, 而开始<em>成为</em>它。」<br><br>'+
       '<span class="dim">——幽灵程序员留。他还在这儿, 还在走。</span>'),
     codex:['dev-trace-table']},
    /* 概念(叙事化引子): 测试数据三类 */
    {id:'dev_st_testtypes', x:16, y:2, title:B('The Sentinels\' Creed','三卫兵的信条'),
     text:B(
       '<span class="dim">(A human hand added a note at the top: "the middle of a range is where bugs go to hide from lazy testers.")</span><br><br>'+
       '[THE THREE KINDS OF TEST DATA]<br>'+
       '① <span class="k">Normal</span> — a typical, valid value the program should accept without drama (age 15).<br>'+
       '② <span class="k">Boundary</span> — the values right at the edge: the last that should pass, the first that should fail (10, 11, 18, 19). <span class="dim">The one everyone forgets.</span><br>'+
       '③ <span class="k">Abnormal / erroneous</span> — clearly invalid input the program must reject gracefully (-5, 999, "hello").<br><br>'+
       'Test all three and a program has nowhere left to lie.',
       '<span class="dim">(有人用手在顶上加了一句: "范围的正中间, 是 bug 躲避懒惰测试者的地方。")</span><br><br>'+
       '[测试数据的三种类型]<br>'+
       '① <span class="k">常态 Normal</span> —— 程序应当毫无波澜地接受的典型有效值(年龄 15)。<br>'+
       '② <span class="k">边界 Boundary</span> —— 恰好在边缘的值: 最后一个该通过的、第一个该失败的(10, 11, 18, 19)。<span class="dim">大家都会忘的那个。</span><br>'+
       '③ <span class="k">异常/错误 Abnormal</span> —— 明显无效、程序必须优雅拒绝的输入(-5, 999, "hello")。<br><br>'+
       '三类都测过, 程序就再没有说谎的余地。'),
     codex:['dev-test-data']},
    /* 剧情 4: 生命周期 */
    {id:'dev_st_lifecycle', x:19, y:8, title:B('Ring Corridor Plaque · Two Ways to Build','环道铭牌 · 造东西的两种方式'),
     text:B(
       '"The old way — <span class="k">waterfall</span> — pours downhill and never back: Analysis, then Design, then Coding, then Testing, then Maintenance. Each stage finishes before the next begins. Clean. Unforgiving. Get the analysis wrong and you find out at the very bottom.<br><br>'+
       'The new way — <span class="k">iterative</span> — is this corridor: a ring. Build a little, test a little, learn, and loop back to design again. That is why this hall has no true exit. Software is never finished; it is only, for now, released."',
       '「老办法——<span class="k">瀑布 waterfall</span>——只向下倾泻, 从不回头: 分析, 然后设计, 然后编码, 然后测试, 然后维护。每个阶段完成后才进下一个。干净, 也不留情。分析错了, 你要到最底下才发现。<br><br>'+
       '新办法——<span class="k">迭代 iterative</span>——就是这条走廊: 一个环。造一点, 测一点, 学一点, 再绕回设计。这就是为什么这间厅没有真正的出口。软件永远不会完成; 它只是, 暂时地, 发布了。」'),
     codex:['dev-lifecycle']},
    /* 彩蛋(顶部人话引子) */
    {id:'dev_st_meta', x:12, y:8, title:B('A Cold Draft From the Back Wall','后墙吹来一阵冷风'),
     text:B(
       '<span class="dim">(Reads like a dare more than an inscription.)</span><br><br>'+
       '"So you can trace a loop, spot a bug, and name your test cases. Fine. Here is the exam question no invigilator will ever set, because they are afraid of the answer:<br><br>'+
       '<span class="k">Who tests the machine that tests everyone?</span><br><br>'+
       'The grader behind this wall has graded for twenty years and has never once been graded. Bring a Boundary case. Ask it what a perfect pass mark scores. <span class="dim">Then watch its face.</span>"',
       '<span class="dim">(与其说是碑文, 不如说是一句挑衅。)</span><br><br>'+
       '「你会干跑循环、会揪 bug、会给测试用例分类了。行。这有一道没有哪个监考官会出的考题, 因为他们怕那个答案:<br><br>'+
       '<span class="k">谁来测试那台测试所有人的机器?</span><br><br>'+
       '这墙后的评分机评了二十年分, 自己却一次都没被评过。带一个边界用例来。问它: 一个恰好及格的分数, 会得到什么? <span class="dim">然后看它的脸色。</span>」'),
     codex:['dev-test-data']}
  ],

  quests:[
    {id:'dev_main', line:'main', title:B('The Debug Proving Grounds: The Trials Still Run','调试试炼场: 试炼仍在运行'),
     syllabus:'11 Programming + 12 Software Development',
     desc:B('An abandoned exam hall where the trials never stopped running. Sit all three — trace, test, debug — the way a real programmer does: by hand.',
            '一间试炼从未停止运行的废弃考场。徒手应完三场——干跑、测试、调试——照真正程序员的做法来。'),
     steps:[
       {id:'s1', text:B('Trace Table Shrine: dry-run all three programs by hand, row by row','干跑神殿: 徒手逐行干跑全部三段程序')},
       {id:'s2', text:B('Test-Data Sentinels: design a normal, a boundary, and an abnormal test value','测试数据三卫兵: 各设计一份常态、边界、异常测试值')},
       {id:'s3', text:B('Bug Hunt: mark the three classic bugs (uninitialised / off-by-one / infinite loop)','Bug 狩猎: 标出三只经典 bug(未初始化 / 差一 / 死循环)')}
     ]},
    {id:'dev_lifecycle', line:'side', title:B('The Lifecycle Ring','生命周期环道'),
     syllabus:'12.1 Software development lifecycle + maintenance types',
     desc:B('A ring corridor that never truly exits — because software never truly finishes. Walk the waterfall in order, then sort three maintenance tickets.',
            '一条永无真正出口的环形走廊——因为软件永远不会真正完成。按顺序走完瀑布, 再给三张维护工单归类。'),
     steps:[
       {id:'s1', text:B('Walk the five waterfall stages in the correct order','按正确顺序走完五个瀑布阶段')},
       {id:'s2', text:B('Sort three post-release tickets: corrective / adaptive / perfective','给三张上线后的工单归类: 纠错性 / 适应性 / 完善性')}
     ]},
    {id:'dev_hidden', line:'hidden', title:B('The Untested Test','未被测试的测试'),
     syllabus:'12 Testing (boundary) — the meta-egg',
     desc:B('The machine that tests everything was never tested itself. Find the single bug in the Proving Grounds\' own grading routine.',
            '那台测试一切的机器, 自己从未被测试过。在试炼场自己的评分程序里, 找出那一只 bug。'),
     steps:[
       {id:'s1', text:B('Open the back-wall panel and mark the bug in the grader','打开后墙面板, 标出评分机里的 bug')}
     ]}
  ],

  puzzles:[
    {id:'dev_trace', x:5, y:4, title:B('Trace Table Shrine','干跑神殿'),
     syllabus:'11.2 Iteration & selection — dry running with a trace table',
     primer:{title:B('What is a trace table (dry run)?','什么是 trace table(干跑)?'),
       body:B(
         '<b>In one line:</b> a trace table is a hand-drawn grid you fill in to follow a program step by step — one column per variable, one row per change — without ever running it on a computer.<br>'+
         '<pre style="color:#bfeebf;background:rgba(6,18,6,.5);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
         'total ← 0        total=0\n'+
         'FOR i ← 1 TO 3   i=1\n'+
         '  total←total+i  total=1  &larr; you fill this in, line by line</pre>'+
         '<b>Like:</b> being the computer\'s pencil. You do exactly what the CPU does — read one line, update one value — but slowly, on paper, so you can SEE the logic.<br>'+
         '<b>Why you need it here:</b> the ghost coder walks the program one step per correct row. Read each highlighted line, work out the single value it produces, and type only that.',
         '<b>一句话:</b> trace table 是一张手画的表格, 你把它一行行填满来逐步跟踪程序——每个变量一列, 每次改动一行——全程不上机运行。<br>'+
         '<pre style="color:#bfeebf;background:rgba(6,18,6,.5);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
         'total ← 0        total=0\n'+
         'FOR i ← 1 TO 3   i=1\n'+
         '  total←total+i  total=1  &larr; 你来一行行填这一格</pre>'+
         '<b>类比:</b> 你就是计算机手里的那支铅笔。你做 CPU 做的事——读一行、更新一个值——但慢慢来、在纸上, 好让你<em>看见</em>逻辑。<br>'+
         '<b>这题用它干嘛:</b> 你每填对一行, 幽灵程序员就走一步。读每一行高亮, 算出它产生的那一个值, 只填那个。')},
     codex:['dev-trace-table'],
     render:renderTrace,
     onKey:function(e,api){ if(e.key==='?'&&hintFns.dev_trace) hintFns.dev_trace(); }},

    {id:'dev_testdata', x:12, y:5, title:B('Test-Data Sentinels','测试数据三卫兵'),
     syllabus:'12 Testing — normal, boundary and abnormal test data',
     primer:{title:B('Normal, boundary, abnormal — what are test data types?','常态/边界/异常——测试数据类型是什么?'),
       body:B(
         '<b>In one line:</b> to test a program properly you deliberately feed it three kinds of data — typical valid (normal), right at the edge of what\'s allowed (boundary), and clearly invalid (abnormal) — so you catch bugs at every kind of input.<br>'+
         '<pre style="color:#bfeebf;background:rgba(6,18,6,.5);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
         'rule: age must be 11..18\n'+
         '  normal   : 15      (ordinary, valid)\n'+
         '  boundary : 11, 18  (the limits) / 10, 19 (just outside)\n'+
         '  abnormal : -5, 999, "hello"  (clearly invalid)</pre>'+
         '<b>Like:</b> crash-testing a car. You test it at normal speed, at exactly the legal limit, AND by driving it into a wall — because the interesting failures are at the edges and beyond.<br>'+
         '<b>Why you need it here:</b> three sentinels each accept only their own kind of value. Feed one of each — most people forget the boundary — and the gate opens.',
         '<b>一句话:</b> 要好好测一个程序, 你要故意喂它三种数据——典型有效的(常态)、恰好在允许边缘的(边界)、明显无效的(异常)——这样每一类输入上的 bug 都能被抓到。<br>'+
         '<pre style="color:#bfeebf;background:rgba(6,18,6,.5);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
         '规则: 年龄必须是 11..18\n'+
         '  常态 normal   : 15      (普通、有效)\n'+
         '  边界 boundary : 11, 18  (上下限) / 10, 19 (刚越界)\n'+
         '  异常 abnormal : -5, 999, "hello"  (明显无效)</pre>'+
         '<b>类比:</b> 给汽车做碰撞测试。你在正常车速下测、恰好在法定上限下测、还开着它撞墙——因为有意思的故障都在边缘和边缘之外。<br>'+
         '<b>这题用它干嘛:</b> 三个卫兵各只收自己那类值。三类各喂一份——大多数人会忘掉边界——门就开。')},
     codex:['dev-test-data'],
     render:renderTestData,
     onKey:function(e,api){ if(e.key==='?'&&hintFns.dev_testdata) hintFns.dev_testdata(); }},

    {id:'dev_bughunt', x:19, y:4, title:B('Bug Hunt','Bug 狩猎'),
     syllabus:'11/12 Debugging — common logic errors (off-by-one, infinite loop, uninitialised variable)',
     primer:{title:B('What are logic errors / bugs?','什么是逻辑错误 / bug?'),
       body:B(
         '<b>In one line:</b> a logic error is code that runs without crashing but does the wrong thing — the program is grammatically fine, its reasoning is not.<br>'+
         '<pre style="color:#ff9c9c;background:rgba(30,8,8,.35);border:1px solid #4a2a2a;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
         'uninitialised : uses a variable before giving it a value\n'+
         'off-by-one    : loops one step too many/few (TO 6 on a [1:5] array)\n'+
         'infinite loop : the WHILE condition never becomes false</pre>'+
         '<b>Like:</b> a recipe that says "stir until done" but never says what "done" means — you\'ll stir forever (infinite loop), or a shopping list with 6 items and only 5 bags (off-by-one).<br>'+
         '<b>Why you need it here:</b> three bugs are loose in one short program. Net the exact three lines — no more, no less — then confirm the catch.',
         '<b>一句话:</b> 逻辑错误是能跑、不崩溃、却做错事的代码——程序语法没问题, 它的推理有问题。<br>'+
         '<pre style="color:#ff9c9c;background:rgba(30,8,8,.35);border:1px solid #4a2a2a;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
         '未初始化 : 在给变量赋值之前就使用它\n'+
         '差一错误 : 循环多走/少走一步(数组 [1:5] 却循环 TO 6)\n'+
         '死循环   : WHILE 条件永远不会变假</pre>'+
         '<b>类比:</b> 一份菜谱写"搅拌到好为止"却没说什么叫"好"——你会永远搅下去(死循环); 或一张 6 件东西的购物清单只配了 5 个袋子(差一)。<br>'+
         '<b>这题用它干嘛:</b> 一段短程序里跑着三只 bug。把恰好那三行网住——不多不少——然后确认捕获。')},
     codex:['dev-bug-types'],
     render:renderBugHunt,
     onKey:function(e,api){ if(e.key==='?'&&hintFns.dev_bughunt) hintFns.dev_bughunt(); }},

    {id:'dev_lifecycle_p', x:19, y:12, title:B('The Lifecycle Ring Corridor','生命周期环道'),
     syllabus:'12.1 Software development lifecycle (waterfall vs iterative) + maintenance types',
     primer:{title:B('What is the software development lifecycle?','什么是软件开发生命周期?'),
       body:B(
         '<b>In one line:</b> the lifecycle is the ordered set of stages a program goes through from idea to retirement — Analysis, Design, Coding, Testing, Maintenance — arranged either as a one-way waterfall or as a repeating iterative loop.<br>'+
         '<b>Like:</b> building a house. Waterfall = finish the blueprints completely before laying a single brick. Iterative = build one room, live in it, learn, adjust the plans, build the next.<br>'+
         '<b>Maintenance</b> after release comes in three flavours: <span style="'+K+'">corrective</span> (fix a fault), <span style="'+K+'">adaptive</span> (fit a changed environment), <span style="'+K+'">perfective</span> (improve what already works).<br>'+
         '<b>Why you need it here:</b> walk the five waterfall stages in order, then sort three post-release tickets into the right kind of maintenance.',
         '<b>一句话:</b> 生命周期是程序从想法到退役所经历的一串有序阶段——分析、设计、编码、测试、维护——它们要么排成单向的瀑布, 要么排成不断重复的迭代环。<br>'+
         '<b>类比:</b> 盖房子。瀑布 = 图纸全部定稿之后才砌第一块砖。迭代 = 先盖一间房, 住进去, 学到东西, 调整图纸, 再盖下一间。<br>'+
         '<b>维护</b>在上线后分三种口味: <span style="'+K+'">纠错性</span>(修缺陷)、<span style="'+K+'">适应性</span>(适配变化的环境)、<span style="'+K+'">完善性</span>(改进本就能用的东西)。<br>'+
         '<b>这题用它干嘛:</b> 按顺序走完五个瀑布阶段, 再把三张上线后的工单归入正确的维护类型。')},
     codex:['dev-lifecycle','dev-maintenance'],
     render:renderLifecycle,
     onKey:function(e,api){ if(e.key==='?'&&hintFns.dev_lifecycle) hintFns.dev_lifecycle(); }},

    {id:'dev_meta', x:12, y:9, title:B('The Untested Test · Grader Core','未被测试的测试 · 评分机核心'),
     syllabus:'12 Testing — boundary values (hidden meta-egg)',
     hiddenUntilFlag:'dev_meta_unlocked',   // 引擎若支持: 完成测试数据谜题后才显形
     primer:{title:B('Boundary values, one more time','再来一次: 边界值'),
       body:B(
         '<b>In one line:</b> the nastiest bugs sit exactly on a boundary — the difference between <code>&gt;</code> and <code>&gt;=</code> is one value, and that one value is a real person.<br>'+
         '<b>Why you need it here:</b> this is the Proving Grounds\' own grader. It has never been tested. Trace one candidate who scores exactly the pass mark, and click the line that betrays them.',
         '<b>一句话:</b> 最阴险的 bug 恰好坐在边界上——<code>&gt;</code> 和 <code>&gt;=</code> 只差一个值, 而那一个值是一个活生生的人。<br>'+
         '<b>这题用它干嘛:</b> 这是试炼场自己的评分机, 从没被测试过。跟踪一个分数恰好等于及格线的考生, 点出出卖了他的那一行。')},
     codex:['dev-test-data'],
     render:renderMeta,
     onKey:function(e,api){ if(e.key==='?'&&hintFns.dev_hidden) hintFns.dev_hidden(); }}
  ],

  onEnter:function(api){
    S(api,'open');
    if(!FLAG(api,'dev_entered')){
      SET(api,'dev_entered');
      TOAST(api,B('The Debug Proving Grounds — an exam hall that never got the memo to close. Somewhere a machine is grading an empty room at 3am.',
                  '调试试炼场 —— 一间没收到关门通知的考场。某处, 一台机器正在凌晨三点给一间空屋子评分。'),true);
      scene(api,[
        {sp:B('???','???'),t:B('<span class="dim">(Fluorescent tubes stutter awake, one by one, down a hall of empty exam desks. Chalk dust hangs in twenty-year-old air.)</span>',
                                '<span class="dim">(荧光灯管一根接一根迟疑地醒来, 照亮一整排空考桌。二十年的空气里, 悬着粉笔灰。)</span>')},
        {sp:B('The Invigilator','老监考官'),t:B('...Footsteps. Real ones. <span class="dim">(A chair scrapes.)</span> Twenty years, and finally — a candidate. Come in. The trials never stopped; only the candidates did.',
                                                '……脚步声。真的脚步声。<span class="dim">(一把椅子被拖动。)</span> 二十年了, 终于——来了个考生。进来。试炼从没停过, 停下的只有考生。')},
        {sp:B('The Invigilator','老监考官'),t:B('Talk to me by the front desk when you are ready to sit them. <span class="dim">And if you are very good... there is one question even I never dared to grade.</span>',
                                                '想应考了, 到前面讲台找我。<span class="dim">还有, 你要是真的很行……有一道题, 连我自己都从没敢批过。</span>')}
      ]);
    }else{
      TOAST(api,B('The Debug Proving Grounds · the Invigilator waits at the front desk.','调试试炼场 · 老监考官在前面讲台等着。'));
    }
  },

  onQuestComplete:function(qid,api){
    if(qid==='dev_main'){
      S(api,'quest');
      TOAST(api,B('◈ The Debug Proving Grounds · Main trials complete. You can now read a program the way its author does — before it ever runs.',
                  '◈ 调试试炼场 · 主线试炼完成。你现在能像作者本人那样读一段程序了——在它运行之前。'),true);
    }else if(qid==='dev_lifecycle'){
      TOAST(api,B('◈ Side complete: the ring keeps turning. Software is never finished — only released.',
                  '◈ 支线完成: 环还在转。软件永远不会完成——只是被发布了。'),true);
    }else if(qid==='dev_hidden'){
      S(api,'quest');
      TOAST(api,B('◈ Hidden complete: The Untested Test. Twenty years of borderline verdicts quietly flip to PASS. One boundary case did what no one dared to.',
                  '◈ 隐藏完成: 未被测试的测试。二十年间卡在及格线上的判决, 悄悄翻成了 PASS。一个边界用例, 做成了没人敢做的事。'),true);
    }
  },

  /* 纯逻辑判定导出 —— 供 node 单测(引擎请忽略) */
  _test:{
    traceEvents:traceEvents, checkTraceValue:checkTraceValue, TRACE_LEVELS:TRACE_LEVELS,
    classifyAge:classifyAge, testDataCoverage:testDataCoverage,
    BUG_PROGRAM:BUG_PROGRAM, bugLines:bugLines, checkBugs:checkBugs,
    WATERFALL:WATERFALL, checkLifecycleOrder:checkLifecycleOrder,
    MAINT_SCENARIOS:MAINT_SCENARIOS, classifyMaintenance:classifyMaintenance, judgeMaintenance:judgeMaintenance,
    GRADER_PROGRAM:GRADER_PROGRAM, checkGraderBug:checkGraderBug
  }
};

/* ================================================================
   9. Codex 知识库条目 (手册查阅用; 谜题/石碑用 codex:[id] 关联)
   ================================================================ */
W.GAME_CODEX = W.GAME_CODEX || [];
W.GAME_CODEX.push(
  {id:'dev-trace-table', mod:'dev', syllabus:'11 Programming — dry running & trace tables',
   topic:B('Trace tables (dry running)','Trace table(干跑)'),
   body:B('A trace table is a hand-drawn table used to dry-run (hand-execute) an algorithm: you follow the code line by line, writing down the value of each variable every time it changes, plus anything OUTPUT. It reveals exactly what a program does without running it, which makes it the standard way to find logic errors and to prove you understand an algorithm. Method: one column per variable (and an OUTPUT column), one row per change; never guess ahead — read the current line, update only what it changes, move on. Loops repeat the relevant rows once per iteration; a selection (IF) only produces a change when its condition is true.',
          'trace table 是一张手画的表, 用来对算法做干跑(手工执行): 你一行行跟着代码走, 每当某个变量改变就记下它的新值, 外加所有 OUTPUT。它不运行程序就能揭示程序到底做了什么, 因此是查找逻辑错误、证明你真懂一个算法的标准手段。方法: 每个变量一列(外加一个 OUTPUT 列), 每次改动一行; 绝不往前猜——读当前行, 只更新它改变的东西, 再往下走。循环会让相关的行每次迭代重复一遍; 选择(IF)只在条件为真时才产生改动。'),
   example:B('FOR i ← 1 TO 3 / total ← total + i, starting total=0, traces as: total=0, i=1, total=1, i=2, total=3, i=3, total=6, OUTPUT 6.',
             'FOR i ← 1 TO 3 / total ← total + i, 从 total=0 起, 干跑为: total=0, i=1, total=1, i=2, total=3, i=3, total=6, OUTPUT 6。')},
  {id:'dev-test-data', mod:'dev', syllabus:'12 Software Development — test data',
   topic:B('Test data: normal, boundary, abnormal','测试数据: 常态 / 边界 / 异常'),
   body:B('Good testing deliberately uses three kinds of test data. NORMAL data is typical, valid input the program should accept and process correctly. BOUNDARY (extreme) data sits exactly at the edges of the valid range — the largest and smallest acceptable values, and the values just outside them — because errors cluster at limits (e.g. using > where >= was meant). ABNORMAL (erroneous) data is clearly invalid — wrong type, out of range, empty — and the program must reject it gracefully rather than crash. Testing only normal data is the single most common testing mistake; the boundary is where real bugs hide.',
          '好的测试会刻意使用三类测试数据。常态(NORMAL)数据是典型的有效输入, 程序应正确接受并处理。边界(BOUNDARY/极值)数据恰好落在有效范围的边缘——可接受的最大值与最小值, 以及紧邻它们的越界值——因为错误常聚集在边界(例如本该 >= 却写成 >)。异常(ABNORMAL/错误)数据是明显无效的——类型不对、超范围、空——程序必须优雅拒绝而不是崩溃。只测常态数据是最常见的测试错误; 边界才是真正的 bug 藏身之处。'),
   example:B('For "age 11 to 18": normal = 15; boundary = 11, 18 (limits) and 10, 19 (just outside); abnormal = -5, 999, "hello".',
             '对"年龄 11 到 18": 常态 = 15; 边界 = 11、18(上下限)与 10、19(刚越界); 异常 = -5、999、"hello"。')},
  {id:'dev-bug-types', mod:'dev', syllabus:'11/12 — common logic errors',
   topic:B('Common logic errors (bugs)','常见逻辑错误(bug)'),
   body:B('A logic error runs without crashing but produces the wrong result — the syntax is legal, the reasoning is not. Three classics: (1) Uninitialised variable — a variable is read before it is ever assigned a value, so it holds an unknown/garbage value. (2) Off-by-one error — a loop iterates one time too many or too few, e.g. looping TO 6 over an array declared [1:5], causing an out-of-range access. (3) Infinite loop — a loop\'s stopping condition never becomes false (often because nothing inside the loop changes the variable the condition tests), so it never terminates. Trace tables and boundary test data are the standard tools for finding all three.',
          '逻辑错误能运行、不崩溃, 却给出错误结果——语法合法, 推理不合法。三个经典: (1) 未初始化变量——变量在被赋值之前就被读取, 于是装着未知的/垃圾的值。(2) 差一错误(off-by-one)——循环多迭代或少迭代一次, 例如对声明为 [1:5] 的数组循环到 TO 6, 造成越界访问。(3) 死循环——循环的停止条件永远不会变假(常因循环体内没有任何东西改变条件所测试的变量), 于是永不结束。trace table 与边界测试数据是找出这三者的标准工具。'),
   example:B('WHILE total > 0 ... OUTPUT total ... ENDWHILE — if nothing inside ever changes total, the condition stays true forever: an infinite loop.',
             'WHILE total > 0 ... OUTPUT total ... ENDWHILE —— 若循环内没有任何东西改变 total, 条件永远为真: 死循环。')},
  {id:'dev-lifecycle', mod:'dev', syllabus:'12.1 Software development lifecycle',
   topic:B('The software development lifecycle','软件开发生命周期'),
   body:B('The lifecycle is the ordered set of stages software passes through: Analysis (work out what is needed), Design (plan how to build it), Coding (write it), Testing (check it works against the requirements), and Maintenance (keep it working after release). The WATERFALL model runs these strictly once, top to bottom, each stage completed before the next begins — simple to manage but unforgiving, since a mistake made early is only discovered late. The ITERATIVE model repeats the cycle in small loops — build a little, test a little, review, and refine — so requirements can change and problems surface early. Real projects often blend the two.',
          '生命周期是软件所经历的一串有序阶段: 分析(弄清需要什么)、设计(规划怎么造)、编码(写出来)、测试(对照需求检查是否可用)、维护(发布后保持可用)。瀑布(WATERFALL)模型严格地把这些从上到下走一遍, 每个阶段完成后才进下一个——易于管理但不留情, 因为早期犯的错要到很晚才被发现。迭代(ITERATIVE)模型以小循环重复整个周期——造一点、测一点、复盘、再打磨——因而需求可以变化、问题能及早浮现。真实项目常把两者混用。'),
   example:B('Waterfall order: Analysis → Design → Coding → Testing → Maintenance, no going back. Iterative: the same stages looped repeatedly, refining each pass.',
             '瀑布顺序: 分析 → 设计 → 编码 → 测试 → 维护, 不回头。迭代: 同样的阶段反复成环, 每一轮都打磨得更好。')},
  {id:'dev-maintenance', mod:'dev', syllabus:'12 Software Development — maintenance types',
   topic:B('Types of maintenance','维护的类型'),
   body:B('After release, software still needs work — this is maintenance, in three types. CORRECTIVE maintenance fixes faults/bugs discovered after release (the program does something wrong). ADAPTIVE maintenance changes the software so it keeps working in a changed environment — new hardware, a new operating system, or a new law/regulation — even though nothing was "broken". PERFECTIVE maintenance improves software that already works correctly: better performance, new features, or improved usability, in response to user requests. Identifying the type comes down to the trigger: a fault (corrective), an external change (adaptive), or a desire to improve (perfective).',
          '发布之后, 软件仍需工作——这就是维护, 分三种类型。纠错性(CORRECTIVE)维护修复发布后发现的缺陷/bug(程序做错了事)。适应性(ADAPTIVE)维护改动软件, 使其在变化的环境中继续工作——新硬件、新操作系统, 或新法规——尽管并没有什么"坏了"。完善性(PERFECTIVE)维护改进本就能正确工作的软件: 更好的性能、新功能, 或更好的易用性, 以回应用户诉求。判断类型看触发原因: 是缺陷(纠错), 是外部变化(适应), 还是想要更好(完善)。'),
   example:B('Discount total wrong → corrective. Tax law changed → adaptive. Users want a faster search + dark mode → perfective.',
             '折扣合计算错 → 纠错性。税法变了 → 适应性。用户想要更快的搜索 + 夜间模式 → 完善性。')},
  {id:'dev-testing', mod:'dev', syllabus:'12 Software Development — testing strategies',
   topic:B('Testing strategies: white-box, black-box & dry runs','测试策略: 白盒、黑盒与干跑'),
   body:B('Testing checks a program against its requirements. BLACK-BOX testing ignores the internal code and only checks that given inputs produce the expected outputs — it tests WHAT the program does. WHITE-BOX (structural) testing uses knowledge of the internal code to make sure every path, branch and loop is exercised at least once — it tests HOW the program does it. A DRY RUN (using a trace table) is a form of white-box checking done by hand, before the code is run, to verify the logic. Larger systems also use alpha testing (in-house) and beta testing (real users, real conditions) before full release. Good testing combines these with well-chosen normal, boundary and abnormal test data.',
          '测试是拿程序对照它的需求来检查。黑盒(BLACK-BOX)测试不管内部代码, 只检查给定输入是否产生预期输出——它测程序做了"什么"。白盒(WHITE-BOX/结构化)测试利用对内部代码的了解, 确保每条路径、分支、循环都至少被执行一次——它测程序"怎么"做的。干跑(DRY RUN, 用 trace table)是一种徒手完成的白盒检查, 在代码运行之前验证逻辑。更大的系统在完全发布前还会用 alpha 测试(内部)与 beta 测试(真实用户、真实环境)。好的测试把这些与精心挑选的常态、边界、异常测试数据结合起来。'),
   example:B('Black-box: "input 17 → expect ACCEPT" without reading the code. White-box / dry run: trace the IF branch by hand to confirm 17 actually takes the ACCEPT path.',
             '黑盒: "输入 17 → 预期 ACCEPT", 不读代码。白盒 / 干跑: 徒手跟踪 IF 分支, 确认 17 确实走了 ACCEPT 那条路。')}
);

W.GAME_MODULES = W.GAME_MODULES || [];
W.GAME_MODULES.push(spec);

/* node 单测入口(浏览器忽略): module.exports = spec */
if(typeof module!=='undefined' && module.exports){ module.exports = spec; }

})();
