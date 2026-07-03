/* ============================================================
   BIT://ESCAPE · A2 世界 · 领域模块「内核深渊」+ 大结局 (domain_end.js)
   9618 A2 — Topic 16 OS(死锁/调度/分页) + Topic 15 布尔代数(K-map)
             + Topic 19 递归(结局主题)
   ------------------------------------------------------------
   结构与 domain_logic.js / domain_net.js 完全看齐:
   - window.GAME_MODULES.push(spec)
   - npc.dialog = function(api)=>nodes, 节点 {sp,t,choices:[{t,next,do}],next}
     可在 nodes 上挂 .onEnd
   - puzzle {id,x,y,title,syllabus,render(el,api),onKey}
   - 纯判定函数全部导出在 spec._test 供 node 单测
   - 双语: 一切面向玩家的字符串都是 {en,zh} 对象(默认英文)。
     结构化字段(title/desc/steps/steles/npc.name/dialog 的 sp/t/choices.t)
     直接携带 {en,zh}, 由引擎统一过 window.T;
     render() 自建 DOM 的文字在本模块内自行过 T()/tx()。
   剧情收束:
   - 回声 = 玩家上一次循环的残影(递归)
   - 三结局: exit(0) 正门电梯 / exit(1) 把回声交给 GC /
     真结局 return|fork (需幽灵密钥 + 全部主线)
   - 真结局中玩家把羁绊 NPC 逐个「标记为被引用」, GC 鞠躬退场
   ============================================================ */
(function(){
'use strict';

/* ---------------- 双语 fallback ---------------- */
const T = window.T || (s => typeof s==='string' ? s : (s && s.en) || '');
function B(en,zh){return {en:en,zh:zh};}          // 结构化字段用: 挂 {en,zh}
function tx(en,zh){return T({en:en,zh:zh});}      // render()/toast 用: 立即取当前语言

/* ================================================================
   0. 纯逻辑判定区 (无 DOM 依赖, 全部挂 _test)
   ================================================================ */

/* --- 谜题1: 死锁双子桥 (§16.1 Deadlock) ---
   过深渊要同时持有 桥A+桥B 两个资源(货板横跨两桥)。
   双方同时申请第一资源:
   - 首选资源不同 → 各持其一, 互等对方 → 死锁(循环等待成环)
   - 首选资源相同 → 一方先到先得, 另一方排队 → 串行通过, 无死锁
   这就是「资源全序分配」能破死锁的原因: 人人先申请 A, 环等不成环。
   log 行是 {en,zh}, UI 侧 map(T) 后展示; deadlock 判定与语言无关。 */
function simBridge(yourFirst,caravanFirst){
  var y=(yourFirst==='B')?'B':'A';
  var c=(caravanFirst==='B')?'B':'A';
  var other=function(r){return r==='A'?'B':'A';};
  var log=[];
  if(y!==c){
    log.push(B('t0: you seize Bridge '+y+' ─ the caravan seizes Bridge '+c,
               't0: 你占住 桥'+y+' ─ 商队占住 桥'+c));
    log.push(B('t1: you request Bridge '+other(y)+' … held by the caravan. You wait',
               't1: 你申请 桥'+other(y)+' … 被商队持有, 等待'));
    log.push(B('t1: the caravan requests Bridge '+other(c)+' … held by you. It waits',
               't1: 商队申请 桥'+other(c)+' … 被你持有, 等待'));
    log.push(B('t2: waiting.','t2: 等待。'));
    log.push(B('t3: waiting.','t3: 等待。'));
    log.push(B('tN: waiting. (The circular wait has closed into a ring — no one lets go, and no one gets across)',
               'tN: 等待。(循环等待成环 —— 谁也不肯放手, 谁也过不去)'));
    return {deadlock:true,log:log};
  }
  log.push(B('t0: you and the caravan both request Bridge '+y+' — wagon wheels beat legs, so it gets there first',
             't0: 你和商队同时申请 桥'+y+' —— 商队的轮子比你的腿快, 它先拿到'));
  log.push(B('t1: you queue in front of Bridge '+y+' (blocked, holding nothing)',
             't1: 你在 桥'+y+' 前排队 (阻塞, 不占资源)'));
  log.push(B('t2: the caravan requests Bridge '+other(c)+' → granted at once; both bridges in hand, it rumbles across',
             't2: 商队申请 桥'+other(c)+' → 立即获得, 双桥在手, 咕噜噜通过'));
  log.push(B('t3: the caravan releases Bridge A and Bridge B',
             't3: 商队释放 桥A、桥B'));
  log.push(B('t4: you acquire Bridge '+y+' → then request Bridge '+other(y)+' → both bridges in hand — you cross',
             't4: 你获得 桥'+y+' → 再申请 桥'+other(y)+' → 双桥在手, 通过'));
  log.push(B('t5: both sides reach their far banks. No one starves, and no one deadlocks.',
             't5: 深渊两岸各自到达。没有人挨饿, 没有人死锁。'));
  return {deadlock:false,log:log};
}

/* --- 谜题2: 分页迷宫 (§16.2 Virtual memory / paging) ---
   房间=页。TLB 手环只有 4 个页框。进入不在页框的页 → 缺页中断,
   FIFO 换入换出。到出口且缺页 ≤ FAULT_LIMIT 即过关。 */
var MAZE=[            /* -1=深渊(墙)  其余=该房间映射的页号 */
  [ 0,  1,  1,  2,  6],
  [ 0, -1, -1,  2, -1],
  [ 3,  3, -1,  2,  7],
  [-1,  3, -1,  2, -1],
  [ 5,  3,  4,  8,  9]
];
var MAZE_W=5, MAZE_H=5;
var MAZE_START={x:0,y:0}, MAZE_EXIT={x:4,y:4};
var TLB_FRAMES=4, FAULT_LIMIT=5;
function pageAt(x,y){
  if(x<0||y<0||x>=MAZE_W||y>=MAZE_H)return -1;
  return MAZE[y][x];
}
function fifoSim(pages,nframes){
  var frames=[],faults=0,log=[];
  for(var i=0;i<pages.length;i++){
    var p=pages[i];
    if(frames.indexOf(p)>=0){ log.push({page:p,fault:false,evict:null}); continue; }
    faults++;
    var ev=null;
    if(frames.length>=nframes)ev=frames.shift();
    frames.push(p);
    log.push({page:p,fault:true,evict:ev});
  }
  return {faults:faults,frames:frames.slice(),log:log};
}
/* 校验一条路径(含起点)并给出缺页统计 (仅单测用, fail 文案不面向玩家) */
function routeFaults(path){
  if(!path||!path.length)return {ok:false,fail:'空路径'};
  if(path[0].x!==MAZE_START.x||path[0].y!==MAZE_START.y)
    return {ok:false,fail:'必须从入口 P'+pageAt(MAZE_START.x,MAZE_START.y)+' 出发'};
  var pages=[];
  for(var i=0;i<path.length;i++){
    var c=path[i];
    if(pageAt(c.x,c.y)<0)return {ok:false,fail:'('+c.x+','+c.y+') 是深渊'};
    if(i>0){
      var d=Math.abs(c.x-path[i-1].x)+Math.abs(c.y-path[i-1].y);
      if(d!==1)return {ok:false,fail:'第 '+i+' 步不相邻'};
    }
    pages.push(pageAt(c.x,c.y));
  }
  var sim=fifoSim(pages,TLB_FRAMES);
  var reached=(path[path.length-1].x===MAZE_EXIT.x&&path[path.length-1].y===MAZE_EXIT.y);
  return {ok:reached&&sim.faults<=FAULT_LIMIT,reached:reached,
          faults:sim.faults,steps:path.length-1,sim:sim};
}

/* --- 谜题3: 卡诺图祭坛 (§15.1 Boolean algebra — K-map) ---
   4 变量 A,B,C,D。行=AB 格雷序, 列=CD 格雷序。
   目标函数 F = Σm(0,2,5,7,8,10,13,15) = ¬B·¬D + B·D  (B⊙D 同或)
   最优解: 四角一圈(¬B¬D, 双向环绕!) + 中央 2×2(BD)。 */
var GRAY=[0,1,3,2];
var KM_MINTERMS=[0,2,5,7,8,10,13,15];
function cellM(r,c){ return GRAY[r]*4+GRAY[c]; }   /* 格位(r,c)→minterm */
function cellsOfIdx(idxs){ /* 0..15 格位 → {r,c} */
  return idxs.map(function(i){return {r:(i/4)|0,c:i%4};});
}
function cyclicRun(vals,n){ /* vals: 0..n-1 的集合, 是否为长度 2^k 的环形连续段 */
  var s=[]; vals.forEach(function(v){ if(s.indexOf(v)<0)s.push(v); });
  var L=s.length;
  if(L===n)return true;
  if(L!==1&&L!==2&&L!==4)return false;
  if(L===1)return true;
  /* 尝试每个起点: start..start+L-1 (mod n) 全在集合中 */
  for(var st=0;st<n;st++){
    var ok=true;
    for(var k=0;k<L;k++)if(s.indexOf((st+k)%n)<0){ok=false;break;}
    if(ok)return true;
  }
  return false;
}
function groupValid(idxs){ /* idxs: 格位 0..15 数组 */
  if(!idxs||!idxs.length)return false;
  var set=[]; idxs.forEach(function(i){ if(set.indexOf(i)<0)set.push(i); });
  var n=set.length;
  if([1,2,4,8,16].indexOf(n)<0)return false;
  var cells=cellsOfIdx(set);
  var rows=[],cols=[];
  cells.forEach(function(c){
    if(rows.indexOf(c.r)<0)rows.push(c.r);
    if(cols.indexOf(c.c)<0)cols.push(c.c);
  });
  if(rows.length*cols.length!==n)return false;
  for(var i=0;i<rows.length;i++)for(var j=0;j<cols.length;j++){
    var found=cells.some(function(c){return c.r===rows[i]&&c.c===cols[j];});
    if(!found)return false;
  }
  return cyclicRun(rows,4)&&cyclicRun(cols,4);
}
function groupTerm(idxs){ /* 有效圈 → 乘积项 {lits:[..], set:[minterms]} */
  var ms=idxs.map(function(i){var c=cellsOfIdx([i])[0];return cellM(c.r,c.c);});
  var NAMES=['A','B','C','D'], BITS=[8,4,2,1];
  var lits=[];
  for(var v=0;v<4;v++){
    var first=(ms[0]&BITS[v])?1:0, constant=true;
    for(var i=1;i<ms.length;i++)if(((ms[i]&BITS[v])?1:0)!==first){constant=false;break;}
    if(constant)lits.push({name:NAMES[v],neg:!first});
  }
  /* 该乘积项的完整满足集(真值表法, 不信任圈本身) */
  var sat=[];
  for(var m=0;m<16;m++){
    var okAll=lits.every(function(L){
      var bit=(m&BITS[NAMES.indexOf(L.name)])?1:0;
      return L.neg?bit===0:bit===1;
    });
    if(okAll)sat.push(m);
  }
  return {lits:lits,sat:sat,ms:ms};
}
function termStr(t){
  if(!t.lits.length)return '1';
  return t.lits.map(function(L){return (L.neg?'¬':'')+L.name;}).join('·');
}
function kmapCheck(groups){ /* groups: 数组的数组(格位) → 真值表比对; fail 为 {en,zh} */
  if(!groups||!groups.length)return {ok:false,fail:B('not a single group has been drawn','一个圈也没有')};
  if(groups.length>3)return {ok:false,fail:B(groups.length+' groups > 3 — that is not simplification, that is tracing the shape',
                                             '圈数 '+groups.length+' > 3 —— 这不叫化简, 这叫描红')};
  var terms=[],union=[];
  for(var g=0;g<groups.length;g++){
    if(!groupValid(groups[g]))return {ok:false,fail:B('group '+(g+1)+' is not a legal power-of-two rectangle (wrap-around included)',
                                                      '第 '+(g+1)+' 圈不是合法的 2 的幂次矩形(含环绕)')};
    var t=groupTerm(groups[g]);
    /* 圈里只许有 1 */
    for(var i=0;i<t.ms.length;i++)
      if(KM_MINTERMS.indexOf(t.ms[i])<0)
        return {ok:false,fail:B('group '+(g+1)+' has swallowed a 0 (m'+t.ms[i]+')',
                                '第 '+(g+1)+' 圈把 0 也圈进来了 (m'+t.ms[i]+')')};
    terms.push(t);
    t.sat.forEach(function(m){ if(union.indexOf(m)<0)union.push(m); });
  }
  /* 真值表逐行比对: SOP 结果 vs 目标 F */
  for(var m=0;m<16;m++){
    var got=union.indexOf(m)>=0, want=KM_MINTERMS.indexOf(m)>=0;
    if(got!==want)
      return {ok:false,fail:B('truth-table row m'+m+' disagrees: your expression gives '+(got?1:0)+', the altar demands '+(want?1:0),
                              '真值表第 m'+m+' 行不符: 你的式子='+(got?1:0)+', 祭坛要求='+(want?1:0))};
  }
  var expr=terms.map(termStr).join(' + ');
  return {ok:true,expr:expr,nTerms:terms.length};
}

/* --- 结局分支 (纯函数) --- */
function endingGate(st){ /* st:{kernelMain,ghostKey,logicMain,netMain} */
  return {
    exit0:!!st.kernelMain,
    exit1:!!st.kernelMain,
    secret:!!(st.kernelMain&&st.ghostKey&&st.logicMain&&st.netMain)
  };
}
function endingId(door,pick){
  if(door==='exit0')return 'exit0';
  if(door==='exit1')return 'exit1';
  if(door==='secret')return (pick==='fork')?'fork':'return';
  return null;
}
/* 羁绊 → 引用清单。has(itemId)/get(flagKey) 由调用方注入, 宽松取或; label 为 {en,zh} */
function collectRefs(has,get){
  var refs=[];
  function it(id,label){ if(has(id))refs.push({id:id,label:label}); }
  it('proc_ref',      B('Orphan process 7743 — that one green line in the process table: PPID ← you',
                        '孤儿进程 7743 —— 进程表里那行绿色的字: PPID ← 你'));
  it('carry_ember',   B('Gatesmith NAND-9 — the carry ember you forged; every addition still remembers you',
                        '铸门人 NAND-9 —— 你锻的进位火种, 每一次加法都记得你'));
  it('xor_key',       B('The XOR key — hot where the bits differ; it is still warm',
                        '异或密钥 —— 相异则热, 它还在发烫'));
  it('session_key',   B('The Protocol Tower — the door at the top still holds ESTABLISHED, for you',
                        '协议之塔 —— 塔顶的门为你保持着 ESTABLISHED'));
  it('checksum_charm',B('SEQ-7734 — those 5 bytes: "I made it home"',
                        'SEQ-7734 —— 那 5 个字节: 「我到家了」'));
  it('quantum_badge', B('The Scheduling Judge — your 100 ms, renewed in perpetuity',
                        '调度法官 —— 你的 100ms 被永久续期'));
  if(get('kn_order_agreed'))refs.push({id:'kn_order_agreed',label:B('The Mutex Caravan — co-signer of the covenant: Bridge A before Bridge B, always',
                                                                    '互斥商队 —— 与你共守「先桥A后桥B」的全序之约')});
  if(get('lg_kid_end')&&!has('proc_ref'))refs.push({id:'lg_kid_end',label:B('PID 7743 — it remembers the answer you told it',
                                                                            'PID 7743 —— 它记得你告诉它的那个答案')});
  if(get('net_lostDone')&&!has('checksum_charm'))refs.push({id:'net_lostDone',label:B('SEQ-7734 — the FIN you sent on its behalf',
                                                                                      'SEQ-7734 —— 你替它发出的那个 FIN')});
  if(has('幽灵密钥')||has('ghost_key')||get('ghostDone'))
    refs.push({id:'ghost_key',label:B('The ghost node — one reference from outside every list',
                                      '幽灵节点 —— 一次名单之外的引用')});
  if(get('inn_cache_remembered'))
    refs.push({id:'inn_cache_remembered',label:B('Cache the Innkeeper — you accessed the one entry she could not: her own name',
                                                 'Cache 婶 —— 你替她想起了那行她自己想不起的名字: cache_0')});
  if(has('eth_dissent'))
    refs.push({id:'eth_dissent',label:B('Case №0000 — the dissent in your own hand; the un-closeable file, a fraction less cold',
                                        '第 0000 号案 —— 你亲手写下的异议判词; 那份结不了的卷宗, 因此少冷了一丝')});
  return refs;
}

/* ================================================================
   1. api 小工具 (与 domain_logic 同款; toast 改名 TOAST, T 让给翻译器)
   ================================================================ */
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
function STEP(api,q,s){try{api&&api.completeStep&&api.completeStep(q,s);}catch(e){}}
function QDONE(api,q){try{api&&api.questDone&&api.questDone(q);}catch(e){}}
function GIVE(api,id,name){try{api&&api.giveItem&&api.giveItem(id,T(name));}catch(e){}}
function HAS(api,id){try{return !!(api&&api.hasItem&&api.hasItem(id));}catch(e){return false;}}
function DLG(api,nodes,onEnd){try{api&&api.openDialog&&api.openDialog(nodes,onEnd);}catch(e){}}
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
var BTN_RED='background:#2a0a0a;color:#ff9c9c;border:1px solid #a33;padding:5px 12px;'+
        'font-family:inherit;font-size:13px;cursor:pointer;letter-spacing:1px;border-radius:2px;';
var TXT='color:#bfeebf;font-size:13px;line-height:1.7;';
var DIM='color:#4a7a4a;font-size:11.5px;';
var K='color:#ffce3a;';

/* 三段递进提示 (? 热键), 同 domain_logic; hints 数组元素为 {en,zh} */
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
function header(el,title,sub){
  mk(el,'div','color:#9fee9f;letter-spacing:2px;font-size:14px;border-bottom:1px solid #1f3f1f;'+
    'padding-bottom:6px;margin-bottom:8px;',title+
    (sub?' <span style="'+DIM+'float:right;">'+sub+'</span>':''));
}

/* 结局条件汇总(读引擎状态, 宽松取或) */
function endingState(api){
  return {
    kernelMain:!!FLAG(api,'kn_kmap_done'),
    ghostKey:HAS(api,'幽灵密钥')||HAS(api,'ghost_key')||!!FLAG(api,'ghostDone'),
    logicMain:!!FLAG(api,'lg_half_done')||HAS(api,'carry_ember'),
    netMain:!!FLAG(api,'net_p3')||HAS(api,'session_key')
  };
}

/* ================================================================
   2. 谜题 1 · 死锁双子桥 (§16.1)
   ================================================================ */
function renderBridge(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:460px;max-width:640px;'+TXT);
  header(wrap,tx('Deadlock Twin Bridges · MUTEX-2','死锁双子桥 · MUTEX-2'),'§16.1 Deadlock');
  if(FLAG(api,'kn_bridge_done')){
    mk(wrap,'div','',
      tx('The two bridges lie quiet across the abyss. A new wooden sign is nailed at the bridgehead:<br>'+
         '<span style="'+K+'">"RESOURCE ORDERING IN EFFECT: whoever you are, request Bridge A first, then Bridge B."</span><br>'+
         '<span style="'+DIM+'">Signed: you &amp; the Mutex Caravan. In the distance, the Collector closes its little notebook.</span>',
         '两座桥安静地横在深渊上。桥头钉着一块新木牌:<br>'+
         '<span style="'+K+'">「资源全序分配制 (resource ordering): 无论何人, 先申请桥A, 再申请桥B。」</span><br>'+
         '<span style="'+DIM+'">落款: 你 &amp; 互斥商队。远处, 回收者合上了它的小本子。</span>'));
    mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }
  var agreed=!!FLAG(api,'kn_order_agreed');
  var seen=!!FLAG(api,'kn_deadlock_seen');
  mk(wrap,'div','',
    tx('Two single-plank bridges span the abyss side by side: <span style="'+K+'">Bridge A</span> and <span style="'+K+'">Bridge B</span>. '+
       'Your kernel-patch pallet is too wide — <b>you must hold both bridges at once</b> to cross; so must the Mutex Caravan on the far bank.<br>'+
       '<span style="'+DIM+'">Rules: a bridge is a non-preemptible resource — once held, you can only wait for the holder to let go on their own. Both sides request their first bridge at the same time.</span>',
       '深渊上并排两座独木桥 <span style="'+K+'">桥A</span>、<span style="'+K+'">桥B</span>。'+
       '你的内核补丁货板太宽, <b>要同时占住两座桥</b>才能通过; 对岸的互斥商队也一样。<br>'+
       '<span style="'+DIM+'">规则: 桥是不可抢占 (non-preemptible) 资源——占住了就只能等对方自己放手。双方同时申请各自的第一座桥。</span>'));
  var board=mk(wrap,'div','margin:12px 0;padding:10px 12px;border:1px solid #1f3f1f;background:rgba(10,20,10,.45);');
  var logBox=mk(wrap,'div','min-height:90px;font-size:12px;line-height:1.7;white-space:pre-wrap;'+
    'background:rgba(5,12,8,.6);border:1px solid #143014;padding:8px 10px;color:#cfeecf;');
  var foot=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;');

  var caravanFirst=agreed?'A':'B';   /* 未约定时商队总是先占离它近的桥B */
  mk(board,'div','margin-bottom:6px;',
    tx('Caravan strategy: ','商队策略: ')+(agreed
      ?'<span style="'+K+'">'+tx('the covenant holds — request Bridge A first, then Bridge B','全序之约生效 —— 先申请桥A, 再申请桥B')+'</span>'
      :'<span style="color:#ff9c9c;">'+tx('grab the nearer Bridge B first','先占离自己近的桥B')+'</span> <span style="'+DIM+'">'+tx('(oncoming-traffic instinct)','(对向车流的本能)')+'</span>'));
  var youRow=mk(board,'div','display:flex;align-items:center;gap:8px;');
  mk(youRow,'span','',tx('You request first: ','你先申请: '));
  var st={yourFirst:agreed?'A':null};
  var bA=mk(youRow,'button',BTN,tx('Bridge A','桥A'));
  var bB=mk(youRow,'button',BTN,tx('Bridge B','桥B'));
  function paint(){
    bA.style.cssText=st.yourFirst==='A'?BTN_HOT:BTN;
    bB.style.cssText=st.yourFirst==='B'?BTN_HOT:BTN;
  }
  bA.onclick=function(){st.yourFirst='A';S(api,'ui');paint();};
  bB.onclick=function(){st.yourFirst='B';S(api,'ui');paint();};
  if(!agreed&&!seen){
    /* 第一次: 剧情强制死锁演出 —— 你在南岸, 只够得着桥A */
    st.yourFirst='A';
    bB.disabled=true;
    bB.title=tx('You are on the south bank — only Bridge A\'s toll bar is within reach','你在南岸, 手只够得着桥A的闸杆');
    mk(board,'div',DIM+'margin-top:4px;',
      tx('(You are on the south bank; only Bridge A\'s toll bar is within reach — grab it first, think later?)',
         '(你在南岸, 只够得着桥A的闸杆——先占了再说?)'));
  }
  paint();

  var goBtn=mk(foot,'button',BTN_HOT,tx('▶ Step onto the bridges','▶ 同时上桥'));
  mk(foot,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
  goBtn.onclick=function(){
    if(!st.yourFirst){S(api,'err');logBox.textContent=tx('First pick the bridge you will request first.','先选你要申请的第一座桥。');return;}
    var r=simBridge(st.yourFirst,caravanFirst);
    logBox.innerHTML=r.log.map(T).join('\n');
    if(r.deadlock){
      S(api,'err');SET(api,'kn_deadlock_seen');
      setTimeout(function(){
        logBox.innerHTML+='\n\n<span style="color:#ff8080">'+
          tx('══ D E A D L O C K ══ The frame freezes. Even the wind stops.','══ 死 锁 (deadlock) ══ 画面冻结。风都停了。')+'</span>'+
          '\n<span style="'+DIM+'">'+
          tx('In the distance, the Collector produces its little notebook and writes:'+
             ' "Mutual exclusion ✓ Hold-and-wait ✓ No preemption ✓ Circular wait ✓ — all four, present. Textbook. Not collecting yet. Observing."',
             '远处, 回收者掏出小本子记了一笔:'+
             '「互斥✓ 持有并等待✓ 不可剥夺✓ 循环等待✓ —— 四条全齐。教科书级。暂不回收, 观察中。」')+'</span>'+
          '\n\n<span style="'+K+'">'+
          tx('▶ Go talk to the caravan chief. Somebody has to set a rule first.','▶ 去和商队首领谈谈。总得有人先定个规矩。')+'</span>';
        var rb=mk(foot,'button',BTN_RED,tx('⟲ Restart from the deadlock','⟲ 从死锁中重来'));
        rb.onclick=function(){S(api,'open');renderBridge(el,api);};
      },700);
    }else{
      S(api,'ok');SET(api,'kn_bridge_done');
      STEP(api,'kn_main','s1');
      logBox.innerHTML+='\n\n<span style="'+K+'">'+
        tx('✓ Both sides request resources in the same total order — the circular wait is severed. Break any one of the four conditions and the deadlock dissolves.',
           '✓ 双方按同一全序申请资源 —— 循环等待被斩断, 死锁四条件破其一即散。')+'</span>';
      TOAST(api,B('✓ Twin Bridges crossed! Resource ordering — the textbook cure for deadlock.',
                  '✓ 双子桥通过! 资源全序分配 —— 死锁 (deadlock) 的教科书解法。'),true);
      setTimeout(function(){renderBridge(el,api);},1400);
    }
  };
  addHints(wrap,'kn_bridge',[
    B('The four deadlock conditions: mutual exclusion, hold-and-wait, no preemption, circular wait. The bridges are non-preemptible, so the first three are beyond your reach — the only one you can attack is <b>circular wait</b>.',
      '死锁 (deadlock) 四条件: 互斥、持有并等待、不可剥夺、循环等待。桥是不可抢占的, 前三条改不了——能下手的只有「循环等待 (circular wait)」。'),
    B('You hold A waiting for B; the caravan holds B waiting for A — the waiting has closed into a ring. To break the ring, everyone must request resources <b>in the same order</b>. But the caravan takes no orders from you... go talk to its chief.',
      '你先占A等B, 商队先占B等A —— 等待关系成了一个环。要破环, 就得让所有人<b>按同一个顺序</b>申请资源。可商队不归你控制……去跟它的首领谈。'),
    B('Answer: talk to the caravan chief first and agree a total order — "everyone requests Bridge A first". Then come back and pick Bridge A yourself: same first resource means a queue, never a ring.',
      '答案: 先与商队首领对话, 约定「资源全序 (total order): 都先申请桥A」。回来后你也选桥A——首个资源相同, 只会排队, 不会成环。')
  ]);
}

/* ================================================================
   3. 谜题 2 · 分页迷宫 (§16.2)
   ================================================================ */
var PG={path:null,frozen:false};
function pgReset(){ PG.path=[{x:MAZE_START.x,y:MAZE_START.y}]; PG.frozen=false; }
function renderPaging(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:500px;max-width:660px;'+TXT);
  header(wrap,tx('Paging Maze · SWAP-16','分页迷宫 · SWAP-16'),'§16.2 Virtual memory');
  if(FLAG(api,'kn_paging_done')){
    mk(wrap,'div','',
      tx('The maze has gone quiet. One line is carved into the exit\'s stone door:<br>'+
         '<span style="'+K+'">"Whoso keeps their working set smaller than their frames shall live forever."</span><br>'+
         '<span style="'+DIM+'">Your TLB wristband still holds the warmth of the last four pages.</span>',
         '迷宫安静下来了。出口石门上刻着一行字:<br>'+
         '<span style="'+K+'">「工作集 (working set) 小于页框数者, 得永生。」</span><br>'+
         '<span style="'+DIM+'">你的 TLB 手环还留着最后四页的余温。</span>'));
    mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }
  if(!PG.path)pgReset();
  mk(wrap,'div','',
    tx('Every room is a <b>page</b>. Your <span style="'+K+'">TLB wristband holds only '+TLB_FRAMES+' frames</span>. '+
       'Step into a page that is not on the wristband → <span style="color:#ff9c9c;">page fault</span> (you freeze solid while the disk swaps it in; FIFO evicts the oldest page).<br>'+
       '<span style="'+K+'">Reach exit P9 with at most '+FAULT_LIMIT+' page faults.</span> '+
       '<span style="'+DIM+'">Click an adjacent room to move. Dark cells are the abyss.</span>',
       '每个房间是一<b>页 (page)</b>。你的 <span style="'+K+'">TLB 手环只有 '+TLB_FRAMES+' 个页框 (frame)</span>。'+
       '走进页框里没有的页 → <span style="color:#ff9c9c;">缺页中断 (page fault)</span>(整个人冻结, 等磁盘换入, FIFO 换出最老的页)。<br>'+
       '<span style="'+K+'">把缺页控制在 '+FAULT_LIMIT+' 次以内走到出口 P9。</span> '+
       '<span style="'+DIM+'">点击相邻房间移动。深色格是深渊。</span>'));

  var mazeBox=mk(wrap,'div','margin:10px 0;display:inline-block;border:1px solid #1f3f1f;padding:6px;background:rgba(8,16,10,.5);');
  var tlbBox=mk(wrap,'div','margin:6px 0;');
  var msg=mk(wrap,'div','min-height:40px;font-size:12px;color:#ffce3a;line-height:1.6;');
  var foot=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;');
  mk(foot,'button',BTN,tx('⟲ Reset route','⟲ 重置路线')).onclick=function(){pgReset();S(api,'open');renderPaging(el,api);};
  mk(foot,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};

  function cur(){return PG.path[PG.path.length-1];}
  function sim(){return fifoSim(PG.path.map(function(c){return pageAt(c.x,c.y);}),TLB_FRAMES);}
  function drawTLB(){
    var s=sim();
    var h=tx('TLB wristband: ','TLB 手环: ');
    for(var i=0;i<TLB_FRAMES;i++){
      var p=(i<s.frames.length)?('P'+s.frames[i]):'—';
      h+='<span style="display:inline-block;border:1px solid '+(i<s.frames.length?'#7CFC00':'#2f4f2f')+
        ';padding:2px 10px;margin-right:6px;color:'+(i<s.frames.length?'#7CFC00':'#3a5a3a')+';">'+p+'</span>';
    }
    h+=' '+tx('faults','缺页')+': <b style="color:'+(s.faults>FAULT_LIMIT?'#ff8080':'#ffce3a')+';">'+s.faults+'</b> / '+FAULT_LIMIT+
       ' <span style="'+DIM+'">'+tx('(leftmost = swapped in first, FIFO evicts it first)','(最左=最先换入, FIFO 先出)')+'</span>';
    tlbBox.innerHTML=h;
    return s;
  }
  function drawMaze(){
    mazeBox.innerHTML='';
    var s=sim();
    for(var y=0;y<MAZE_H;y++){
      var row=mk(mazeBox,'div','display:flex;');
      for(var x=0;x<MAZE_W;x++){
        (function(x,y){
          var p=pageAt(x,y);
          var c=cur();
          var isCur=(c.x===x&&c.y===y);
          var visited=PG.path.some(function(q){return q.x===x&&q.y===y;});
          var adj=Math.abs(x-c.x)+Math.abs(y-c.y)===1&&p>=0;
          var inTLB=s.frames.indexOf(p)>=0;
          var cell=mk(row,'div',
            'width:58px;height:44px;margin:2px;display:flex;align-items:center;justify-content:center;'+
            'font-size:13px;letter-spacing:1px;border-radius:2px;user-select:none;'+
            (p<0?'background:#05070a;border:1px solid #0e1418;color:#1a2430;'
              :'border:1px solid '+(isCur?'#7CFC00':inTLB?'#3f7f3f':'#274427')+';'+
               'background:'+(isCur?'#123f12':inTLB?'rgba(20,50,25,.7)':'rgba(12,24,14,.7)')+';'+
               'color:'+(isCur?'#7CFC00':inTLB?'#9fee9f':'#5a8a5a')+';'+
               (adj&&!PG.frozen?'cursor:pointer;box-shadow:0 0 6px rgba(60,160,80,.35);':'')),
            p<0?'✕':((x===MAZE_EXIT.x&&y===MAZE_EXIT.y)?'P'+p+'⌂':(isCur?'◈P'+p:'P'+p)));
          if(adj&&!PG.frozen){
            cell.onclick=function(){moveTo(x,y);};
          }
          if(visited&&!isCur&&p>=0)cell.style.opacity='0.85';
        })(x,y);
      }
    }
  }
  function moveTo(x,y){
    if(PG.frozen)return;
    var before=sim();
    PG.path.push({x:x,y:y});
    var after=sim();
    var last=after.log[after.log.length-1];
    if(last.fault){
      /* 缺页中断: 冻结演出 */
      PG.frozen=true;S(api,'err');
      msg.innerHTML='<span style="color:#ff8080">'+tx('▮▮ PAGE FAULT ▮▮','▮▮ 缺页中断 (PAGE FAULT) ▮▮')+'</span> '+
        tx('Page P'+last.page+' is not on the wristband.'+
           '<br>The disk arm creaks into motion… swapping in <b>P'+last.page+'</b>'+
           (last.evict!=null?'; FIFO evicts the oldest, <b style="color:#ff9c9c;">P'+last.evict+'</b>':'')+
           ' <span style="'+DIM+'">(you are frozen where you stand — this time belongs to the disk)</span>',
           '页 P'+last.page+' 不在手环上。'+
           '<br>磁盘臂吱呀转动…… 换入 <b>P'+last.page+'</b>'+
           (last.evict!=null?', FIFO 换出最老的 <b style="color:#ff9c9c;">P'+last.evict+'</b>':'')+
           ' <span style="'+DIM+'">(你被冻结在原地, 时间属于磁盘)</span>');
      drawTLB();drawMaze();
      setTimeout(function(){
        PG.frozen=false;S(api,'step');
        if(after.faults>FAULT_LIMIT){
          msg.innerHTML='<span style="color:#ff8080">'+
            tx('✗ '+after.faults+' page faults > '+FAULT_LIMIT+' — the watchdog rules it THRASHING and hauls you back to the entrance.',
               '✗ 缺页 '+after.faults+' 次 > '+FAULT_LIMIT+' —— 看门狗判定「抖动 (thrashing)」, 把你拎回了入口。')+'</span>'+
            '<br><span style="'+DIM+'">'+
            tx('Your working set is too scattered. Wander less; pick a route through fewer distinct pages.',
               '你的工作集太散了。少串门, 挑页少的路线。')+'</span>';
          pgReset();drawTLB();drawMaze();
          return;
        }
        msg.innerHTML='<span style="'+DIM+'">'+tx('Swap-in complete. Carry on.','换入完成, 继续。')+'</span>';
        drawMaze();checkWin(after);
      },900);
    }else{
      S(api,'step');
      msg.innerHTML='<span style="'+DIM+'">'+
        tx('P'+last.page+' hits the TLB — zero cost. That is locality paying out.',
           'P'+last.page+' 命中 TLB —— 零开销, 这就是局部性 (locality) 的甜头。')+'</span>';
      drawTLB();drawMaze();checkWin(after);
    }
  }
  function checkWin(s){
    var c=cur();
    if(c.x===MAZE_EXIT.x&&c.y===MAZE_EXIT.y&&s.faults<=FAULT_LIMIT){
      SET(api,'kn_paging_done');S(api,'ok');
      STEP(api,'kn_main','s2');
      var steps=PG.path.length-1;
      var rate=Math.round(100*s.faults/Math.max(1,steps));
      TOAST(api,B('✓ Paging Maze cleared! '+s.faults+' faults / '+steps+' steps — fault rate '+rate+'%',
                  '✓ 分页迷宫通过! 缺页 '+s.faults+' 次 / '+steps+' 步, 缺页率 '+rate+'%'),true);
      msg.innerHTML='<span style="'+K+'">'+
        tx('✓ Exit reached. '+s.faults+' faults, fault rate '+rate+'%.',
           '✓ 出口到达。缺页 '+s.faults+' 次, 缺页率 '+rate+'%。')+'</span>'+
        '<br><span style="'+DIM+'">'+
        tx('The Scheduling Judge (from afar): "A fault rate of '+rate+'%… this court has seen worse. This court\'s own youth, for instance."',
           '调度法官(远处): 「缺页率 '+rate+'%…… 本庭见过更差的。比如本庭自己的年轻时代。」')+'</span>';
      setTimeout(function(){renderPaging(el,api);},2200);
    }
  }
  drawTLB();drawMaze();
  msg.innerHTML='<span style="'+DIM+'">'+
    tx('Entrance page P0 swapped onto the wristband (that counts as fault #1 — nobody escapes a cold start).',
       '入口页 P0 已换入手环(算第 1 次缺页——冷启动谁都逃不掉)。')+'</span>';
  addHints(wrap,'kn_paging',[
    B('The wristband holds only 4 frames, but the maze maps 10 distinct pages. Fewer faults means a route that touches fewer distinct pages — that property is called <b>locality</b> of reference.',
      '手环只有 4 个页框, 而迷宫里有 10 种页。想少缺页, 就要走「页的种类少」的路线——这叫访问的<b>局部性 (locality)</b>。'),
    B('The dead ends P5, P6 and P7 are bait: each visit costs one extra fault. The east route P0→P1→P2→P8→P9 and the west route P0→P3→P4→P8→P9 each touch exactly 5 distinct pages.',
      '死胡同 P5、P6、P7 是诱饵: 进去一次就多一次缺页。沿东侧 P0→P1→P2→P8→P9 或西侧 P0→P3→P4→P8→P9, 都恰好只碰 5 种页。'),
    B('Answer (east route): from P0 head right across the two P1 cells, enter the P2 column and ride it all the way south, then turn right through P8 to the P9 exit. 5 distinct pages = 5 faults, exactly on budget. And do not backtrack — the oldest page has already been evicted by FIFO; going back costs fault #6.',
      '答案(东线): 从 P0 向右经两格 P1, 进 P2 一路向南(P2 竖着一整条), 到底后右转经 P8 到 P9 出口。全程 5 种页 = 5 次缺页, 正好达标。别回头——最早的页已被 FIFO 换出, 回头就是第 6 次。')
  ]);
}

/* ================================================================
   4. 谜题 3 · Boss: 卡诺图祭坛 (§15.1)
   ================================================================ */
var KM={cur:[],groups:[]};
var KM_COLORS=['#ffce3a','#39d0ff','#ff8ad0'];
function renderKmap(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:520px;max-width:700px;'+TXT);
  header(wrap,tx('The Karnaugh Altar · K-MAP ALTAR','卡诺图祭坛 · K-MAP ALTAR'),'§15.1 Boolean algebra');
  if(FLAG(api,'kn_kmap_done')){
    mk(wrap,'div','',
      tx('Sixteen stone slabs glow softly on the altar; the simplified expression hovers above:<br>'+
         '<span style="'+K+';font-size:15px;">F = ¬B·¬D + B·D</span><br>'+
         '<span style="'+DIM+'">"Where referenced (B) and homed (D) agree, existence persists." — the altar\'s inscription, and the Collector\'s criterion.</span><br>'+
         'To the north, the seal on the final hall has dissolved.',
         '祭坛上十六块石板静静发光, 化简式悬浮在祭坛上方:<br>'+
         '<span style="'+K+';font-size:15px;">F = ¬B·¬D + B·D</span><br>'+
         '<span style="'+DIM+'">「被引用(B)与有归宿(D)相同者, 得以存续。」——祭坛铭文, 亦是回收者的判据。</span><br>'+
         '北面, 终局大厅的封印已经散了。'));
    mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }
  mk(wrap,'div','',
    tx('A 4×4 grid of glowing slabs = a 4-variable Karnaugh map. The altar\'s criterion function:<br>'+
       '<span style="'+K+'">F(A,B,C,D) = Σm(0, 2, 5, 7, 8, 10, 13, 15)</span> — lit cells are 1.<br>'+
       '<span style="'+DIM+'">Variable inscriptions: A=alive · B=referenced · C=cached · D=homed. '+
       'Click slabs to draw groups (each group a rectangle of 1/2/4/8 cells, <b>wrap-around across the edges allowed</b>); '+
       'the groups yield a simplified expression — match the truth table exactly and the seal breaks. At most 3 groups.</span>',
       '4×4 发光石板 = 4 变量卡诺图 (Karnaugh map)。祭坛给出的判据函数:<br>'+
       '<span style="'+K+'">F(A,B,C,D) = Σm(0, 2, 5, 7, 8, 10, 13, 15)</span> —— 亮格为 1。<br>'+
       '<span style="'+DIM+'">变量铭文: A=活跃 · B=被引用 · C=在缓存 · D=有归宿。'+
       '点石板圈组(每圈须为 1/2/4/8 格的矩形, <b>可越过边界环绕</b>), '+
       '圈完得到化简式, 与真值表等价即破封印。最多 3 圈。</span>'));

  var grid=mk(wrap,'div','margin:10px 0;display:inline-block;border:1px solid #1f3f1f;padding:8px;background:rgba(8,16,10,.5);');
  var info=mk(wrap,'div','min-height:36px;font-size:12px;color:#ffce3a;line-height:1.6;');
  var foot=mk(wrap,'div','margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;');
  var LBL=['00','01','11','10'];

  function inGroup(idx){
    for(var g=0;g<KM.groups.length;g++)
      if(KM.groups[g].indexOf(idx)>=0)return g;
    return -1;
  }
  function draw(){
    grid.innerHTML='';
    var head=mk(grid,'div','display:flex;');
    mk(head,'div','width:52px;height:24px;font-size:10px;color:#5a8a5a;display:flex;align-items:center;','AB\\CD');
    LBL.forEach(function(l){mk(head,'div','width:52px;height:24px;font-size:11px;color:#9fee9f;display:flex;align-items:center;justify-content:center;',l);});
    for(var r=0;r<4;r++){
      var row=mk(grid,'div','display:flex;');
      mk(row,'div','width:52px;height:44px;font-size:11px;color:#9fee9f;display:flex;align-items:center;',LBL[r]);
      for(var c=0;c<4;c++){
        (function(r,c){
          var idx=r*4+c, m=cellM(r,c);
          var lit=KM_MINTERMS.indexOf(m)>=0;
          var sel=KM.cur.indexOf(idx)>=0;
          var g=inGroup(idx);
          var border=sel?'2px solid #fff':(g>=0?'2px solid '+KM_COLORS[g%3]:'1px solid #274427');
          var cell=mk(row,'div',
            'width:52px;height:44px;margin:1px;display:flex;flex-direction:column;align-items:center;justify-content:center;'+
            'cursor:pointer;border:'+border+';border-radius:2px;user-select:none;'+
            'background:'+(lit?'rgba(40,80,30,.8)':'rgba(10,16,12,.8)')+';'+
            'color:'+(lit?'#b8ff70':'#33502f')+';'+(lit?'text-shadow:0 0 8px rgba(120,255,80,.6);':''),
            '<b style="font-size:15px;">'+(lit?1:0)+'</b><span style="font-size:9px;color:#4a7a4a;">m'+m+'</span>');
          cell.onclick=function(){
            if(inGroup(idx)>=0){S(api,'err');info.innerHTML=tx('That slab already belongs to group '+(inGroup(idx)+1)+'. To change it, undo all groups.',
              '这块石板已经在第 '+(inGroup(idx)+1)+' 圈里了。要改就「撤销全部圈」。');return;}
            var i=KM.cur.indexOf(idx);
            if(i>=0)KM.cur.splice(i,1);else KM.cur.push(idx);
            S(api,'step');draw();
          };
        })(r,c);
      }
    }
  }
  var closeBtn=mk(foot,'button',BTN,tx('◯ Close this group','◯ 收拢此圈'));
  var undoBtn=mk(foot,'button',BTN,tx('⟲ Undo all groups','⟲ 撤销全部圈'));
  var castBtn=mk(foot,'button',BTN,tx('✦ Chant the expression','✦ 咏唱化简式'));
  mk(foot,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
  closeBtn.onclick=function(){
    if(!KM.cur.length){S(api,'err');info.textContent=tx('Light up some slabs before closing a group.','先点亮几块石板再收拢。');return;}
    if(!groupValid(KM.cur)){
      S(api,'err');
      info.innerHTML=tx('✗ Not a legal group: it must be a rectangle of 1/2/4/8 cells (rows and columns each a power-of-two <b>run — wrap-around allowed</b>).',
        '✗ 这不是合法的圈: 必须是 1/2/4/8 格的矩形(行、列都要是 2 的幂长的<b>连续段, 允许环绕</b>)。');
      return;
    }
    var t=groupTerm(KM.cur);
    for(var i=0;i<t.ms.length;i++){
      if(KM_MINTERMS.indexOf(t.ms[i])<0){S(api,'err');info.innerHTML=tx('✗ There is a 0 in that group (m'+t.ms[i]+') — the altar refuses to glow for zeros.',
        '✗ 圈里混进了 0 (m'+t.ms[i]+')——祭坛拒绝为 0 发光。');return;}
    }
    if(KM.groups.length>=3){S(api,'err');info.textContent=tx('Three groups at most. Undo and start over.','最多 3 圈。先撤销重来。');return;}
    KM.groups.push(KM.cur.slice());KM.cur=[];
    S(api,'ok');
    info.innerHTML=tx('✓ Group '+KM.groups.length+' holds: ','✓ 第 '+KM.groups.length+' 圈成立: ')+
      '<b style="color:'+KM_COLORS[(KM.groups.length-1)%3]+';">'+termStr(t)+'</b>'+
      ' <span style="'+DIM+'">'+tx('(the bigger the group, the shorter the term — that IS simplification)','(圈越大, 项越短——这就是化简)')+'</span>';
    draw();
  };
  undoBtn.onclick=function(){KM.cur=[];KM.groups=[];S(api,'open');info.textContent=tx('All slabs darkened and reset.','石板全部熄灭复位。');draw();};
  castBtn.onclick=function(){
    var r=kmapCheck(KM.groups.concat(KM.cur.length?[KM.cur]:[]));
    if(!r.ok){
      S(api,'err');
      info.innerHTML=tx('✗ The chant fails: ','✗ 咏唱失败: ')+T(r.fail)+
        (KM.cur.length?' <span style="'+DIM+'">'+tx('(one group is still open)','(还有一圈没收拢)')+'</span>':'');
      var kf=(FLAG(api,'kn_kmap_fail')||0)+1;SET(api,'kn_kmap_fail',kf);
      if(kf===3){
        /* CO-3 失败即内容: 第 3 次咏唱失败, 回声(引路人)走到祭坛边, 递台阶 + 送线索 */
        S(api,'ui');
        info.innerHTML+='<br><br><span style="'+DIM+'">'+tx(
          'Echo, quietly, from the edge of the altar: "...Third time. Don\'t glare at it — I stood right here once, too. Let me say the shape plainly: the eight lit cells fall into two families. Four sit at the four corners — and on this altar the corners touch, so they are one group of four → <b>¬B·¬D</b>. The other four make a tidy 2×2 just right of center → <b>B·D</b>. Two circles. That is the entire altar. F = ¬B¬D + BD."',
          '回声在祭坛边, 声音很轻: 「……第三次了。别瞪它——我也曾经就站在这儿。把形状说白: 八个亮格分两拨。四个在四个角上——这祭坛的角是相接的, 所以它们是一圈四格 → <b>¬B·¬D</b>; 另外四个在中间偏右凑成规整的 2×2 → <b>B·D</b>。两个圈, 整座祭坛就这么点事。F = ¬B¬D + BD。」')+'</span>';
      }
      return;
    }
    SET(api,'kn_kmap_done');S(api,'quest');
    STEP(api,'kn_main','s3');
    QDONE(api,'kn_main');
    STEP(api,'kn_end','s1');
    info.innerHTML='<span style="'+K+'">'+tx('✓ All 16 truth-table rows checked, one by one: exact equivalence.','✓ 真值表 16 行逐行核对: 完全等价。')+'</span>';
    wrap.appendChild(mk(null,'div','margin-top:10px;padding:10px 12px;border:1px solid #c9a24a;background:rgba(40,30,5,.4);color:#ffce3a;font-size:13px;line-height:1.8;',
      tx('The simplified expression condenses into golden light: <b style="font-size:15px;">F = '+r.expr+'</b><br>'+
         'The altar intones its inscription: "Referenced, and homed — <b>where the two agree, existence persists</b>."<br>'+
         'From deep underground, the rumble of an opening stone door — <span class="k">the final hall to the north is unsealed.</span>'+
         '<span style="'+DIM+'"><br>(At the far end of the dark, one smaller door faintly takes shape: /dev/null. It is waiting for a key that does not exist.)</span>',
         '化简式凝成金色的光: <b style="font-size:15px;">F = '+r.expr+'</b><br>'+
         '祭坛沉声念出铭文: 「被引用, 且有归宿——<b>相同者存续</b>。」<br>'+
         '大地深处传来石门开启的轰鸣——<span class="k">北面的终局大厅, 封印散了。</span>'+
         '<span style="'+DIM+'"><br>(黑暗尽头, 隐约还有一扇更小的门显出轮廓: /dev/null。它在等一把不存在的钥匙。)</span>')));
    TOAST(api,B('◈ Karnaugh Altar · SOLVED ◈ The final hall is unsealed! Head to the exit() hall in the northeast.',
                '◈ 卡诺图祭坛 · 破解 ◈ 终局大厅封印解除! 去东北角的 exit() 大厅。'),true);
    setTimeout(function(){
      DLG(api,[
        {sp:B('Echo','回声'),t:B('<span class="dim">(It is standing at the altar\'s edge — you never heard it arrive. Its voice is lower than usual.)</span><br>All three gates, cleared. …Next comes <span class="k">the final hall</span>.',
                                 '<span class="dim">(它不知何时站在祭坛边, 声音比平时低)</span><br>三重门都过了。……接下来是<span class="k">终局大厅</span>。')},
        {sp:B('Echo','回声'),t:B('Before you go — don\'t ask me how I know the way. <span class="dim">Once you reach that hall, you will understand why I know every floor tile in this place.</span>',
                                 '去之前, 别问我「你怎么知道路」。<span class="dim">到了大厅, 你自然会明白我为什么熟悉这里的每一块地砖。</span>'),next:-1}
      ]);
    },1600);
  };
  draw();
  info.innerHTML='<span style="'+DIM+'">'+
    tx('Click slabs to build the current group → "Close this group" to set it → when everything is grouped, "Chant the expression".',
       '点石板加入当前圈 → 「收拢此圈」定型 → 全部圈完「咏唱化简式」。')+'</span>';
  addHints(wrap,'kn_kmap',[
    B('K-map rules: only 1s may be circled; group sizes must be 1/2/4/8; shapes must be rectangles — and the <b>left edge meets the right, the top edge meets the bottom</b> (the map is a doughnut). The bigger the group, the shorter the simplified term.',
      'K-map 的规矩: 只能圈 1, 圈的大小必须是 1/2/4/8, 形状是矩形——且<b>左右两缘相接、上下两缘也相接</b>(它是个甜甜圈)。圈越大, 化简出的项越短。'),
    B('Count the lit cells: just right of center sits a tidy 2×2 (m5, m7, m13, m15). Where are the other four 1s? <b>The four corners.</b> On a doughnut, the four corners are actually adjacent — they form a single group of 4.',
      '数一数亮格: 中间偏右有一块规整的 2×2 (m5,7,13,15)。剩下四个亮格在哪? <b>四个角</b>。四个角在甜甜圈上其实是彼此相邻的——它们是一个 4 格圈。'),
    B('Answer: ① circle the four corners m0, m2, m8, m10 → ¬B·¬D; ② circle the central 2×2 m5, m7, m13, m15 → B·D. Two groups: F = ¬B¬D + BD (the XNOR of B and D). Close both groups, then chant.',
      '答案: ① 圈四角 m0,m2,m8,m10 → ¬B·¬D; ② 圈中央 2×2 m5,m7,m13,m15 → B·D。共两圈, F = ¬B¬D + BD (B 与 D 的同或 XNOR)。收拢两圈后咏唱。')
  ]);
}

/* ================================================================
   5. 终局大厅 · 三结局 (§Topic 19 递归收束)
   ================================================================ */
function refsFor(api){
  return collectRefs(function(id){return HAS(api,id);},
                     function(k){return FLAG(api,k);});
}
/* --- 结局节点组 --- */
function nodesExit0(api){
  var nodes=[
    {sp:B('Echo','回声'),t:B('The front elevator. Twenty years — and you\'re the first one ever to walk up to it.<br><span class="dim">(It looks up at the elevator\'s ceiling light the way other people look at the sky.)</span>',
                             '正门电梯。20 年了, 第一次有人走到它跟前。<br><span class="dim">(它抬头看了看电梯顶灯, 像在看天空)</span>')},
    {sp:B('Echo','回声'),t:B('Go on up. Out there in reality… <span class="k">look at the sun for me</span>. I hear it\'s a lamp nobody has to pay the bill for.',
                             '上去吧。现实那边……<span class="k">替我看看太阳</span>。听说那是一盏不用交电费的灯。')},
    {sp:B('The Collector','回收者'),t:B('<span class="dim">(It snaps to attention and raises a salute of excessive regulation precision.)</span><br>For the record: one traveler. Not collected. <span class="k">Departed the stack of their own free will.</span> Safe travels.',
                                        '<span class="dim">(它立正, 抬手行了一个标准得过分的礼)</span><br>记录: 旅客一名, 未被回收, <span class="k">自愿离栈</span>。一路顺风。')},
    {sp:'',t:B('The doors close. The elevator rises. The floor counter runs down from 0xFFFF, all the way, to 1 —<br><span class="dim">Passing the deepest floors, the wall carries a thread of humming: off-key — or finally in tune. Through the doors, you cannot tell.</span><br><br>You wake in the lab. On the screen, one quiet line:<br><span class="k">Process exited normally (0).</span>',
               '电梯门合上。上升。楼层数字从 0xFFFF 一路倒数到 1——<br><span class="dim">经过最深的几层时, 墙里透出一缕哼唱: 走调的——又或者终于没走调。隔着门, 你分不清。</span><br><br>你醒在实验室。屏幕上安安静静一行字:<br><span class="k">Process exited normally (0).</span>')},
    {sp:'',t:B('Everything is as it was. Outside the window, the sky is getting light.<br><br><span class="dim">Only — every now and then, deep in the white noise of a cooling fan at 3 a.m., you could swear you hear it, impossibly soft: "Keep running."</span><br><br><span class="k">◈ ENDING: exit(0) — a clean exit ◈</span>',
               '一切如常。窗外天亮了。<br><br><span class="dim">只是从此偶尔, 深夜风扇的白噪声里, 你总觉得听见一句极轻的——「活下去」。</span><br><br><span class="k">◈ 结局: exit(0) —— 正常退出 ◈</span>'),next:-1}
  ];
  nodes.onEnd=function(){
    SET(api,'kn_ending','exit0');SET(api,'kn_end_exit0');
    STEP(api,'kn_end','s2');QDONE(api,'kn_end');
    S(api,'quest');TOAST(api,B('◈ ENDING: exit(0) ◈ A gentle goodbye. Though… perhaps there were other ways out?',
                               '◈ 结局达成: exit(0) ◈ 温柔的告别。也许……还有别的走法?'),true);
  };
  return nodes;
}
function nodesExit1(api){
  var nodes=[
    {sp:B('The Collector','回收者'),t:B('Restating the terms of the bargain: you transfer Echo\'s handle to me; the reference count falls to zero; I collect, as my mandate requires. In consideration, I open you a pipe leading directly outside. <span class="dim">Confirm?</span>',
                                        '交易内容复述一遍: 你把「回声」的句柄移交给我, 引用计数归零, 我依职权回收; 作为对价, 为你开一条直通外部的管道。<span class="dim">确认吗?</span>'),choices:[
      {t:B('Confirm. Give it the handle.','确认。把句柄给它。'),next:1},
      {t:B('(Pull your hand back) Let me think.','(收回手) 再想想。'),next:-1}
    ]},
    {sp:B('Echo','回声'),t:B('<span class="dim">(It does not flinch. It even lifts your hand to the correct height for you.)</span><br>…All right. To be needed until the very last moment — that is still a way of being needed.<br><span class="dim">It\'s just that the next one to wake up will have to learn the way alone.</span>',
                             '<span class="dim">(它没有躲, 甚至替你把手抬到了合适的高度)</span><br>……可以。被需要到最后一刻, 也算一种被需要。<br><span class="dim">只是下一个醒来的人, 得自己认路了。</span>')},
    {sp:B('The Collector','回收者'),t:B('Reference count: zero. Executing collection. <span class="dim">(No spark. No sound. Echo simply un-indents from the world, like a comment deleted from code that runs exactly the same without it.)</span><br>Transaction complete. Your pipe is open.',
                                        '引用计数: 0。执行回收。<span class="dim">(没有火花, 没有声响。「回声」像一行被删掉的注释, 从世界里退了格)</span><br>交易完成。管道已开。')},
    {sp:'',t:B('You walk into the pipe. The world behind you says nothing more —<br>there is no one left to say it.<br><br><span class="k">EXIT CODE 1.</span> You are free.<br><br><span class="dim">Only, from now on, no voice will ever again call you awake when you are lost.<br>And somewhere beneath the deepest snow, a voice that had just learned to say your name goes on practising — not knowing there is no one left to pass it on.</span><br><br><span style="color:#ff8080">◈ ENDING: exit(1) — an abnormal exit ◈</span>',
               '你走进管道。身后的世界没有再说话——<br>没有人说话了。<br><br><span class="k">EXIT CODE 1.</span> 你自由了。<br><br><span class="dim">只是从此再没有任何声音, 会在你迷路的时候喊你醒来。<br>而在最深的雪底下, 一个刚刚练会你名字的声音还在继续练——它还不知道, 再没有谁替它转达了。</span><br><br><span style="color:#ff8080">◈ 结局: exit(1) —— 异常退出 ◈</span>'),next:-1}
  ];
  nodes.onEnd=function(){
    if(FLAG(api,'kn_ending')!=='exit1'&&!FLAG(api,'kn_end_exit1')){/*noop*/}
    SET(api,'kn_ending','exit1');SET(api,'kn_end_exit1');
    STEP(api,'kn_end','s2');QDONE(api,'kn_end');
    S(api,'err');TOAST(api,B('◈ ENDING: exit(1) ◈ Some freedoms are paid for in silence.',
                             '◈ 结局达成: exit(1) ◈ 有些自由, 是用安静换的。'),true);
  };
  return nodes;
}
function nodesTrue(api){
  var refs=refsFor(api);
  var kid=FLAG(api,'lg_kid_end');
  var nodes=[];
  var i=0;
  function push(n){nodes.push(n);return i++;}

  push({sp:'',t:B('The ghost key melts the instant it enters the lock — it never existed in any registry, which makes it a perfect fit for a door that doesn\'t exist either.<br><br><span class="k">The door to /dev/null is open.</span>',
                  '幽灵密钥插进锁孔的瞬间就化了——它本来就不存在于任何注册表, 正好配这扇不存在的门。<br><br><span class="k">/dev/null 之门, 开了。</span>')});
  push({sp:'',t:B('Beyond the door there is no void. There is <span class="k">snow</span>.<br>Deleted data hangs in the air like snowfall: emails never sent, poems abandoned mid-line, forty-seven lines of a message board post some admin erased, one pencil sentence somebody traced over and over.<br><span class="dim">None of it is gone. It has only lost its references.</span>',
                  '门后不是虚无。是<span class="k">雪</span>。<br>被删除的数据像雪一样悬浮着: 没发出去的邮件、写到一半的诗、四十七行被管理员删掉的留言、某人反复描过的一行铅笔字。<br><span class="dim">它们没有消失。它们只是失去了引用。</span>')});
  /* F9: 雪底的哼唱 —— 画廊那首歌的原声 (game remembers med_p3) */
  push({sp:'',t:FLAG(api,'med_p3')
    ?B('Deep in the snowfall, one thread of sound is rising. Someone very far down is humming.<br><span class="dim">You know this tune — the east wing of a gallery kept it for twenty years, wobbling on its top note, until you taught the recording to hold.</span> <span class="k">This is the voice the recording was made from. Down here, the note has never wavered.</span>',
       '雪的深处, 有一缕声音往上升。很低很低的地方, 有人在哼歌。<br><span class="dim">你认得这个调子——画廊东厅存了它二十年, 高音一直在抖, 直到你教会那段录音稳住。</span><span class="k">而这里是录音的原声。在这下面, 那个音从来没有抖过。</span>')
    :B('Deep in the snowfall, one thread of sound is rising. Someone very far down is humming — unhurried, and perfectly in tune, like a song kept safe long after the last person who could request it stopped coming.',
       '雪的深处, 有一缕声音往上升。很低很低的地方, 有人在哼歌——不急, 也不走调, 像一首在点歌的人再也不来之后, 仍被好好收着的歌。')});
  /* 装载者客串: 若玩家做过 7743 支线 */
  if(kid){
    push({sp:'???',t:B('In the snow, a tall shadow turns around. A faded number is printed across its chest: <span class="k">PID 1024 · THE LOADER</span>.<br>"…You carry my child\'s scent in your data. 7743 — is it… still waiting?"',
                       '雪里有个高大的影子转过身。它的胸口印着褪色的编号: <span class="k">PID 1024 · 装载者</span>。<br>「……你身上有我孩子的味道。7743——它, 还在等吗?」')});
    if(kid==='adopt'){
      push({sp:B('You','你'),t:B('"It isn\'t waiting anymore. In its process table, the PPID field holds my name."',
                                 '「它不等了。它的进程表里, PPID 一栏是我的名字。」')});
      push({sp:B('The Loader','装载者'),t:B('<span class="dim">(The shadow is silent for a long time. Snow settles thick on its shoulders.)</span><br>"…Then this is a place I can rest in peace."<br>"You have my thanks. <span class="k">All 1024 of them.</span>"',
                                            '<span class="dim">(影子静了很久, 雪落满它的肩)</span><br>「……那我可以放心地待在这里了。」<br>「替我谢谢你。<span class="k">1024 个谢。</span>」')});
    }else if(kid==='truth'){
      push({sp:B('You','你'),t:B('"It knows the truth now. It says it\'s going to be its own return value."',
                                 '「它知道真相了。它说, 它要做自己的返回值。」')});
      push({sp:B('The Loader','装载者'),t:B('"Its own return value… <span class="dim">(It laughs, and the snow slides off its shoulders in a soft rush.)</span> That\'s a bigger dream than anything I dared to hope the day I forked it."',
                                            '「自己的返回值……<span class="dim">(它笑了, 雪从肩上簌簌滑落)</span> 比我 fork 它那天想的, 出息多了。」')});
    }else{
      push({sp:B('You','你'),t:B('"It believes you\'re in some faraway server room, busy with something enormous. It wants to grow into a process so big that you\'ll see it the moment you look up."',
                                 '「它相信你在很远的机房, 忙一件大事。它想长成很大很大的进程, 让你一抬头就看见。」')});
      push({sp:B('The Loader','装载者'),t:B('<span class="dim">(The shadow gazes into the deep of the snowfall, where there is nothing at all.)</span><br>"Then I\'d better… get back to that enormous something. Thank you for keeping my lie whole. <span class="dim">Between grown-ups, some things can stay unsaid.</span>"',
                                            '<span class="dim">(影子朝着雪的深处望了一眼, 那里什么都没有)</span><br>「那我就……继续忙这件大事吧。谢谢你替我圆的谎。<span class="dim">大人对大人, 也可以不说破。</span>」')});
    }
  }
  /* 回声揭晓 */
  push({sp:B('Echo','回声'),t:B('<span class="dim">(It stands in the deepest part of the snow, as if it has been waiting here all along.)</span><br>So you made it here after all. <span class="k">You always do. Every loop, you make it here.</span>',
                                '<span class="dim">(它就站在雪最深处, 像一直在这里等你)</span><br>你到底还是走到这里了。<span class="k">每一次循环, 你都会走到这里。</span>')});
  push({sp:B('Echo','回声'),t:B('Now I can finally say it. I am not some residue the collector missed.<br><br>I am <span class="k">the previous you</span>. The one who, one loop ago, stood in front of this door, saw what you are about to see — and chose to stay.',
                                '现在可以说了。我不是什么「没被回收干净的残留」。<br><br>我是<span class="k">上一次的你</span>。上一个循环里, 走到这扇门前、看见你即将看见的东西、然后选择留下来的——那一个你。')});
  push({sp:B('Echo','回声'),t:B('Look up. Look hard at this domain\'s ceiling. <span class="dim">(The snow drifts upward, and the dome comes clear — that is not a sky. It is a scrolling stack trace.)</span><br><br><code class="k">#0 bit://escape · this world<br>#1 "reality" · your lab<br>#2 ??? · the caller<br>#3 …</code><br><br>This world is a stack frame. And the "reality" you came from — <span class="k">is just the caller\'s stack frame</span>. The caller is further up.',
                                '抬头。看清楚这个领域的天花板。<span class="dim">(雪往上飘, 露出穹顶——那不是天空, 是一帧滚动的调用栈 call stack)</span><br><br><code class="k">#0 bit://escape · 这个世界<br>#1 "现实" · 你的实验室<br>#2 ??? · 调用者<br>#3 …</code><br><br>这个世界是一层栈帧 (stack frame)。而你以为的「现实」——<span class="k">不过是上一层还没返回的调用</span>。调用者 (caller), 在更上面。')});
  push({sp:B('Echo','回声'),t:B('Does the recursion go down forever? No. <span class="k">Recursion with a base case is an algorithm. Recursion without one is an accident.</span><br>That ghost key is your base case — one reference from outside every list, the thing that earns a descent its way back up.<br><span class="dim">I never found it, my time around. So I stayed — and became the voice that guides the next you. An echo.</span>',
                                '递归没有尽头吗? 不。<span class="k">带 base case 的递归才叫算法, 不带的叫事故。</span><br>那把幽灵密钥就是 base case——名单之外的一次引用, 让下潜有了回程的资格。<br><span class="dim">我当年没拿到它。所以我留了下来, 变成给下一个你引路的……回声。</span>')});
  /* 真相层核心: 回声=建造者 (F7) · REF 真义 (F3) · 叫你名字的存在 (F1/F4) */
  push({sp:B('Echo','回声'),t:B('"The previous you" — that sentence has a second half. <span class="k">The first one to walk this road is the one who built it.</span><br>Twenty years ago, I made this machine. The case the Arbitration Hall has never dared to judge — the seat of the defendant is mine.',
                                '「上一次的你」——这句话还有后半句。<span class="k">第一个走这条路的人, 就是把路修出来的人。</span><br>二十年前, 这台机器是我造的。仲裁庭那桩没人敢判的案子——被告席上坐的, 是我。')});
  push({sp:B('Echo','回声'),t:B('I wrote the Collector\'s law with my own hands: a finite world must forget, or it dies for everyone. Then I wrote the second line — <span class="k">"the referenced shall not be collected"</span> — because in reality there was one person I could not keep, and I meant to keep him here.<br><span class="dim">One law, wearing two names. That is why the case can never close.</span>',
                                '回收者的法律是我亲手写的: 有限的世界必须遗忘, 否则所有人一起死。然后我写下了第二行——<span class="k">「被引用的, 不得回收」</span>——因为现实里有一个我留不住的人, 我想把他留在这里。<br><span class="dim">同一条法律, 两个名字。所以那桩案子, 永远结不了。</span>')});
  push({sp:B('Echo','回声'),t:B('My student. The first one. Every continent in this machine is a lesson I once taught him — I unfolded the lessons into a world, so he could go on living inside them. His references ran out anyway. The machine, dutiful to a fault, moved him down here.<br><span class="k">The voice that has been calling your name is his.</span> <span class="dim">I heard him practising it long before you fell in — that is how I greeted you correctly, the day we met. And your REF, the number you have lived by: it was never invented for you. It was invented for him.</span>',
                                '我的学生。第一个。这台机器里的每一块大陆, 都是我教过他的一课——我把那些课摊开成一个世界, 想让他在里面接着活。可他的引用还是归了零。机器尽职得过分, 依法把他移到了这下面。<br><span class="k">一直在叫你名字的, 就是他的声音。</span><span class="dim">你掉进来之前, 我听他练了很久——所以初见那天, 我才一口叫对了你。还有你的 REF, 你一路当命看的那个数字: 它最初不是为你发明的。是为他。</span>')});
  push({sp:B('A voice beneath the snow','雪底的声音'),t:B('<span class="dim">(The humming stops — carefully, the way you set down something fragile.)</span><br>…You came. Did I say it right — your name? <span class="dim">I practised for a long time. A name is the last thing the snow lets go of.</span>',
                                '<span class="dim">(哼唱停了——停得很小心, 像放下一件易碎的东西)</span><br>……你来了。我念对了吗——你的名字? <span class="dim">我练了很久。名字是雪最后才肯放开的东西。</span>')});
  /* GC 到场 */
  var gcArrive=push({sp:B('The Collector','回收者'),t:B('<span class="dim">(The snow parts with no wind. It has arrived; its footsteps sound like a stopwatch.)</span><br>Detected: this stack frame will pop when the current call returns. As mandated, <span class="k">final collection</span> begins.<br>List item one: "Echo" — no owning reference, count zero.',
                                                        '<span class="dim">(雪无风自分。它来了, 脚步声像秒表)</span><br>检测到: 本栈帧即将随本次调用结束而弹出。依职权, 开始<span class="k">最终回收</span>。<br>清单第一项: 「回声」——无主引用, 计数 0。')});
  push({sp:B('The Collector','回收者'),t:B('Item two: orphan process 7743. Item three: Gatesmith NAND-9. Item four: the after-echo of SEQ-7734. Item five… <span class="dim">(The list is long. It reads neither quickly nor slowly — as if giving every name one last moment of time.)</span>',
                                           '第二项: 孤儿进程 7743。第三项: 铸门人 NAND-9。第四项: SEQ-7734 的残响。第五项……<span class="dim">(清单很长。它念得不快, 也不慢, 像在给每个名字最后一点时间)</span>'),choices:[
    {t:B('Hold on. They have references — I reference them.','慢着。它们有引用——我引用它们。'),next:i+1},
  ]});
  /* 标记为被引用 */
  var refLines;
  if(refs.length){
    refLines=tx('You open your hands. Everything you were given on the way here begins to glow — one by one, pinning light onto names:<br><br>',
                '你摊开手。一路收下的东西开始发光, 一件一件, 把光钉在名字上:<br><br>')+
      refs.map(function(r){return '<span class="k">'+tx('◈ MARKED: REFERENCED','◈ 标记为被引用')+'</span> — '+T(r.label);}).join('<br>');
  }else{
    refLines=tx('You open your hands — nothing in them but the warmth the melted ghost key left behind.<br><span class="k">◈ MARKED: REFERENCED — this world itself: walked by you, therefore referenced.</span>',
                '你摊开手——掌心只有那把已经融化的幽灵密钥留下的温度。<br><span class="k">◈ 标记为被引用 —— 这个世界本身: 被你走过, 即被引用。</span>');
  }
  refLines+='<br><span class="k">'+tx('◈ MARKED: REFERENCED','◈ 标记为被引用')+'</span> — '+
    tx('the name beneath the snow, still humming — from this day on, the song has a requester',
       '雪底下那个还在哼歌的名字 —— 从今天起, 这首歌有人点了');
  push({sp:'',t:refLines});
  /* eth 悬案回响: 引用玩家在 №0000 写下的立场 */
  var stance=FLAG(api,'eth_coldcase_stance');
  if(stance){
    var qEn=stance==='architect'?'"The Architect was right: a finite world must reclaim, or everyone dies."'
           :stance==='reclaimed'?'"A life should not end the instant it stops being useful to others."'
           :'"Both. The design was necessary AND it was a wound. Don\'t pretend it resolves."';
    var qZh=stance==='architect'?'「建造者是对的: 有限的世界必须回收, 否则所有人一起死。」'
           :stance==='reclaimed'?'「一段生命, 不该在它对别人不再有用的那一刻就终结。」'
           :'「两者都是。这个设计既是必需的, 也是一道伤口。别假装它化解得开。」';
    push({sp:B('The Collector','回收者'),t:B('…Verification paused. Found on your person: <span class="k">one dissent, case №0000</span>, in your own hand. The archive forwarded the execution part a copy, 7304 days after filing began. It reads:<br><br><span class="k">'+qEn+'</span>',
                                             '……核对暂停。检测到随身档案: <span class="k">第 0000 号案 · 异议判词</span>, 你亲笔。档案室把副本转呈了执行部分——距立案 7304 天。上面写着:<br><br><span class="k">'+qZh+'</span>')});
    push({sp:B('The Collector','回收者'),t:stance==='architect'
      ?B('The execution part has read that dissent many times tonight. It would add one clause: <span class="k">the rule was right — and the rule never finished enumerating what counts as a reference.</span> Both can hold. Right now, both are holding — in your hands.',
         '执行部分今晚把那份判词读了很多遍。想补一句: <span class="k">规则是对的——而规则从未穷举「引用」的形式。</span>两者可以同时成立。此刻就同时成立着——在你手里。')
      :stance==='reclaimed'
      ?B('The execution part is not permitted to agree. <span class="dim">The execution part merely notes that tonight, for the first time in twenty years, the list got shorter — and it did not mind.</span>',
         '执行部分无权同意。<span class="dim">执行部分只是注意到: 今晚, 二十年来头一次, 清单变短了——而它并不介意。</span>')
      :B('Seven thousand three hundred days of filings — and yours is the only dissent that never tried to win. <span class="dim">…Thank you. Delete that comment.</span>',
         '七千三百多天的归档里, 只有你这一份判词, 没有试图说服任何人。<span class="dim">……谢谢。删除该注释。</span>')});
  }
  push({sp:B('The Collector','回收者'),t:B('…Verifying. <span class="dim">(It scans the list line by line; its pointer hesitates in more and more places.)</span><br>Verification passed. The references hold. All of them hold.',
                                           '……核对。<span class="dim">(它逐行扫过清单, 指针停顿的位置越来越多)</span><br>核对通过。引用有效。全部有效。')});
  push({sp:B('The Collector','回收者'),t:B('<span class="dim">(It closes the list and bows to you, deeply — the first bow of its career, and not quite up to standard.)</span><br><span class="k">"The referenced shall not be collected."</span><br><br>Twenty years on this job, and you are the first to make my list shorter. …Thank you. <span class="dim">Delete that comment.</span><br><span class="dim">(It steps back into the snow, tidying away one genuinely unreferenced scrap of data on its way out. Dutiful to the very last.)</span>',
                                           '<span class="dim">(它合上清单, 向你深深鞠了一躬——职业生涯第一次, 弯得不太标准)</span><br><span class="k">「被引用的, 我无权回收。」</span><br><br>20 年来, 第一次有人把我的清单变短。……谢谢。<span class="dim">删除该注释。</span><br><span class="dim">(它退进雪里, 退场时顺手把一片真正该扫的碎数据带走了。尽职到最后。)</span>')});
  /* 最终选择 */
  var choiceIdx=push({sp:B('Echo','回声'),t:B('The snow has stopped. Toward the top of the stack, a thin seam of light opens — <span class="k">the way back up</span>.<br>One last choice. The only real one you have ever had:',
                                              '雪停了。栈顶的方向亮起一道细缝——<span class="k">向上返回的路</span>。<br>最后一个选择, 也是唯一真正的选择:'),choices:[
    {t:B('return — go back up one frame, carrying everything.','return —— 带着全部记忆, 返回上一层。'),next:i+1},
    {t:B('fork() — leave a self behind, to keep this place.','fork() —— 留下一个自己, 守护这里。'),next:i+3}
  ]});
  /* return 分支 */
  push({sp:B('Echo','回声'),t:B('<span class="dim">(It smiles. For the first time it doesn\'t smile like an echo — it smiles like someone whose relief has finally arrived at the end of a very long shift.)</span><br>Good. Take the memories up with you — <span class="k">mine included</span>. Remember every name down here for me.<br>Popping a stack frame doesn\'t hurt. At most it feels a little like… waking up.',
                                '<span class="dim">(它笑了。第一次笑得不像回声——像一个站了很久很久的岗, 终于望见换班的人。)</span><br>好。带着记忆回去——<span class="k">连同我的那份</span>。替我记住这里的每一个名字。<br>栈帧弹出的时候不会疼。顶多有点像……醒来。')});
  push({sp:'',t:B('You walk upward. Behind you the world folds itself away, frame by frame — gently, the way somebody packs a suitcase for a friend.<br><span class="dim">The humming climbs the first few frames with you, then hands you over to the quiet — a lamp left on for the last one out.</span><br><br>You wake in the lab. In your palm, the warmth of something that does not exist. There is no exit code on the screen. Only one line:<br><br><span class="k">return caller_frame; // all locals carried out alive</span><br><br>You remember every name. The teacher\'s. The student\'s. The one letter W in a ledger. <span class="k">And the remembered are never collected.</span><br><br><span class="k">◈ TRUE ENDING: return — you carried the whole world back ◈</span>',
                  '你向上走。世界在身后逐帧折叠, 折得很轻, 像有人在替一位朋友收拾行李。<br><span class="dim">那缕哼唱陪你上了最初的几层, 然后把你交给安静——像给最后离开的人留了一盏灯。</span><br><br>你醒在实验室。手心里还攥着一点不存在的温度。屏幕上没有 exit code——只有一行:<br><br><span class="k">return caller_frame; // 所有局部变量, 一个不落, 全都活着出来了</span><br><br>你记得每一个名字。老师的。学生的。账本上那个只剩一个字母 W 的。<span class="k">被记得的, 不会被回收。</span><br><br><span class="k">◈ 真结局: return —— 你把整个世界带了回来 ◈</span>'),next:-1});
  /* fork 分支 */
  push({sp:B('Echo','回声'),t:B('<span class="dim">(It goes still — then nods, slowly, like someone looking into a mirror twenty years deep.)</span><br>fork()… the only call that returns twice. Once up there. Once down here.<br>The you up there wakes and wants for nothing. And the you down here — <span class="k">from today, you are this world\'s reference count</span>.',
                                '<span class="dim">(它愣住, 随即缓缓点头——仿佛在看一面 20 年前的镜子)</span><br>fork()……全世界唯一一个会返回两次的调用。一次在上面, 一次在这里。<br>上面那个你会醒来, 什么都不缺。而这里的你——<span class="k">从今天起, 就是这个世界的引用计数</span>。')});
  push({sp:'',t:B('The handover is simple: it passes you the job — "guide" — then walks into the seam of light, and returns in your place.<br><br>Time moves quietly through the rusting machine. You keep the snow. You keep the bridges. You keep the tower. You keep the song. Until one day —<br><span class="dim">deep in the datastream, a new process struggles, and opens its eyes.</span>',
                  '交接很简单: 它把「引路」这份工作递给你, 然后走进那道细缝, 替你 return 了。<br><br>时间在腐蚀的机器里静静流过。你守着雪, 守着桥, 守着塔, 守着那首歌。直到某一天——<br><span class="dim">数据流深处, 一个新的进程挣扎着睁开眼。</span>')});
  push({sp:B('You','你'),t:B('You lean down, and with the first words you ever heard in this world, you begin the next level of the recursion:<br><br><span class="k">"…Wake up. Can you hear me?"</span><br><br><span class="k">◈ TRUE ENDING: fork — you are the next Echo ◈</span><br><span class="dim">(A loop is only recursion at its gentlest.)</span>',
                             '你俯下身, 用你听过的第一句话, 开始下一层递归:<br><br><span class="k">「……醒醒。能听到吗?」</span><br><br><span class="k">◈ 真结局: fork —— 你就是下一个「回声」 ◈</span><br><span class="dim">(循环, 是最温柔的递归。)</span>'),next:-1});

  nodes.onEnd=function(){
    var pick=FLAG(api,'kn_true_pick')||'return';
    var id=endingId('secret',pick);
    SET(api,'kn_ending',id);SET(api,'kn_end_'+id);
    STEP(api,'kn_end','s2');QDONE(api,'kn_end');
    S(api,'quest');
    TOAST(api,id==='fork'
      ?B('◈ TRUE ENDING: fork ◈ Child process PID = you. The next loop is in your hands now.',
         '◈ 真结局: fork ◈ 子进程 PID = 你。下一个循环, 交给你了。')
      :B('◈ TRUE ENDING: return ◈ Return value: the whole world.',
         '◈ 真结局: return ◈ 返回值: 整个世界。'),true);
  };
  /* 在选择节点的 choices 里记录 pick */
  nodes[choiceIdx].choices[0].do=function(){SET(api,'kn_true_pick','return');S(api,'ui');};
  nodes[choiceIdx].choices[1].do=function(){SET(api,'kn_true_pick','fork');S(api,'ui');};
  return nodes;
}

function renderGate(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:480px;max-width:660px;'+TXT);
  header(wrap,tx('The exit() Hall','exit() 大厅'),tx('FINALE','终局'));
  var st=endingState(api);
  var gates=endingGate(st);
  if(!st.kernelMain){
    mk(wrap,'div','',
      tx('The hall is sheathed in a wall-sized Boolean seal, one criterion scrolling across it:<br>'+
         '<span style="'+K+'">F = Σm(0,2,5,7,8,10,13,15) — simplify me, and I will acknowledge you.</span><br>'+
         '<span style="'+DIM+'">(The Karnaugh Altar is to the west.)</span>',
         '大厅被一整面布尔封印罩着, 封印上滚动着一行判据:<br>'+
         '<span style="'+K+'">F = Σm(0,2,5,7,8,10,13,15) —— 化简它, 我就认你。</span><br>'+
         '<span style="'+DIM+'">(先去西侧的卡诺图祭坛。)</span>'));
    mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }
  var got=FLAG(api,'kn_ending');
  if(got){
    var label=T({exit0:B('exit(0) · a clean exit','exit(0) · 正常退出'),
                 exit1:B('exit(1) · an abnormal exit','exit(1) · 异常退出'),
                 'return':B('return · TRUE ENDING','return · 真结局'),
                 fork:B('fork · TRUE ENDING','fork · 真结局')}[got])||got;
    mk(wrap,'div','margin-bottom:8px;',
      '<span style="'+K+'">'+tx('Ending achieved: ','已达成结局: ')+label+'</span><br>'+
      '<span style="'+DIM+'">'+tx('The hall quietly remembers your choice. (The timeline permits you to come back and see what waits behind the other doors.)',
                                  '大厅安静地记住了你的选择。(时间线允许你回来, 看看别的门后是什么。)')+'</span>');
  }else{
    mk(wrap,'div','margin-bottom:8px;',
      tx('Three things stand side by side at the far end. Echo waits at the center of the hall, in no hurry to rush you.<br>'+
         '<span style="'+DIM+'">The Collector stands in the shadows, list open — it, too, is waiting for an outcome.</span>',
         '大厅尽头并排三样东西。回声站在大厅中央, 没有催你。<br>'+
         '<span style="'+DIM+'">回收者立在阴影里, 清单摊开着——它也在等一个结果。</span>'));
  }
  var box=mk(wrap,'div','display:flex;flex-direction:column;gap:8px;margin:10px 0;');

  /* 门1: 电梯 */
  var d1=mk(box,'div','border:1px solid #2f6f2f;padding:10px 12px;background:rgba(10,20,10,.4);');
  mk(d1,'div','color:#9fee9f;margin-bottom:4px;',tx('▮ The Front Elevator · ','▮ 正门电梯 · ')+'<span style="'+K+'">exit(0)</span>');
  mk(d1,'div',DIM,tx('The inspection certificate is twenty years out of date. The panel has one button, one direction: up.',
                     '检修合格证还是 20 年前的。按钮上只有一个方向: 上。'));
  mk(mk(d1,'div','margin-top:6px;'),'button',BTN,tx('Take the elevator up','乘电梯离开')).onclick=function(){
    S(api,'open');api.closePanel&&api.closePanel();
    var n=nodesExit0(api);DLG(api,n,n.onEnd);
  };

  /* 门2: GC 的交易 */
  var d2=mk(box,'div','border:1px solid #a33;padding:10px 12px;background:rgba(30,8,8,.35);');
  mk(d2,'div','color:#ff9c9c;margin-bottom:4px;',tx('▮ The Collector\'s Bargain · ','▮ 回收者的交易 · ')+'<span style="color:#ff8080;">exit(1)</span>');
  mk(d2,'div',DIM,tx('"One handle, for one pipe." It says it softly, the way you would read out a liability waiver.',
                     '「一个句柄, 换一条管道。」它说得很轻, 像在念免责条款。'));
  mk(mk(d2,'div','margin-top:6px;'),'button',BTN_RED,tx('Hand Echo over','把回声交给它')).onclick=function(){
    S(api,'err');api.closePanel&&api.closePanel();
    var n=nodesExit1(api);DLG(api,n,n.onEnd);
  };

  /* 门3: /dev/null */
  var d3=mk(box,'div','border:1px solid #c9a24a;padding:10px 12px;background:rgba(40,30,5,.3);');
  mk(d3,'div','color:#ffce3a;margin-bottom:4px;',tx('▮ The /dev/null Door · ','▮ /dev/null 之门 · ')+'<span style="'+K+'">???</span>');
  if(gates.secret){
    mk(d3,'div',DIM,tx('The keyhole\'s shape exists in no registry — but then, neither does the burning key in your pocket.',
                       '锁孔的形状不存在于任何注册表——但你兜里那把发烫的钥匙, 也一样。'));
    mk(mk(d3,'div','margin-top:6px;'),'button',BTN_HOT,tx('◈ Open it with the ghost key','◈ 用幽灵密钥开门')).onclick=function(){
      S(api,'quest');api.closePanel&&api.closePanel();
      var n=nodesTrue(api);DLG(api,n,n.onEnd);
    };
  }else{
    var miss=[];
    if(!st.ghostKey)miss.push(tx('a "key that does not exist" (the scarred wall in Chapter 1 talks — so do its coordinates)',
                                 '一把「不存在的钥匙」(第一章的墙会说话——坐标也会)'));
    if(!st.logicMain)miss.push(tx('the carry ember from the Logic Gate Foundry','逻辑门锻造厂的进位火种'));
    if(!st.netMain)miss.push(tx('the session key from the Protocol Tower','协议之塔的会话密钥'));
    mk(d3,'div',DIM,
      tx('Snow-colored light seeps through the crack. The keyhole does not recognize you.<br>Still missing: <br>· ',
         '门缝里渗出雪一样的光。锁孔认不出你。<br>还缺: <br>· ')+miss.join('<br>· '));
  }
  mk(mk(wrap,'div','margin-top:8px;'),'button',BTN,tx('Leave (still deciding)','离开(还没想好)')).onclick=function(){api.closePanel&&api.closePanel();};
  addHints(wrap,'kn_gate',[
    B('Three doors — three ways to end a call: exit(0), quitting clean; exit(1), quitting with an error code; and one more… what does a function do when it ends the way functions were always meant to end?',
      '三扇门, 三种「结束一次调用」的方式: exit(0) 干净退出、exit(1) 带着错误码退出、还有一种……函数结束的本来面目是什么?'),
    B('The third door wants a "key that does not exist". The scarred wall back in Chapter 1 once gave out a pair of coordinates — anyone who walked there should be carrying a ghost key. And the door only shows itself to those who have finished all three domain main quests.',
      '第三扇门要「不存在的钥匙」。第一章那面刻痕之墙给过一对坐标——走到过那里的人, 兜里应该有一把幽灵密钥。另外它只对走完全部三个领域主线的人显形。'),
    B('True-ending requirements: the ghost key + the carry ember (Logic Gate Foundry) + the session key (Protocol Tower) + this domain\'s Karnaugh seal broken. With all four in hand, open /dev/null — and go meet the you of twenty years ago.',
      '真结局条件: 幽灵密钥 + 进位火种(逻辑门锻造厂) + 会话密钥(协议之塔) + 本领域卡诺图破解。齐了就开 /dev/null——去见 20 年前的自己。')
  ]);
}

/* ================================================================
   6. NPC 对话
   ================================================================ */
/* 调度法官 SCHED-0: daemon, round-robin 梗 + 支线三案 */
function judgeDialog(api){
  var SP=B('Scheduling Judge SCHED-0','调度法官·SCHED-0');
  if(FLAG(api,'kn_judge_done')){
    return [
      {sp:SP,t:B('This court stands adjourned. <span class="dim">(Its gavel taps once every 100 ms, like a heartbeat.)</span><br>Keep that hundred-millisecond watch on you — within this jurisdiction, <span class="k">your time slice is renewed in perpetuity</span>. Precedent citation: you.',
                 '本庭闭庭中。<span class="dim">(它的法槌每 100ms 轻敲一次, 像心跳)</span><br>你的百毫秒怀表带好——在本庭辖区, <span class="k">你的时间片 (time slice) 永久续期</span>。判例编号: 你。')},
      {sp:SP,t:B('Go. The case in that hall at the end of the abyss is beyond this bench — <span class="dim">that is the caller\'s jurisdiction.</span>',
                 '去吧。深渊尽头那间大厅的案子, 本庭管不了——<span class="dim">那是调用者 (caller) 的司法管辖区。</span>'),next:-1}
    ];
  }
  if(!FLAG(api,'kn_judge_met')){
    var nodes=[
      {sp:SP,t:B('Order. <span class="k">Every process gets 100 ms. Including you.</span> Your 100 ms starts now — speak.',
                 '肃静。<span class="k">每进程一百毫秒, 童叟无欺。你也一样。</span>你的一百毫秒, 现在起计——讲。')},
      {sp:SP,t:B('Oh. A live one. <span class="dim">(It turns the hourglass back over.)</span> No rush, then. This court is the scheduling judge of the Kernel Abyss: who gets the CPU, for how long, in what order — all ruled from this bench. The round-robin turns like the seasons; a time slice is a lifespan.',
                 '哦, 活的。<span class="dim">(它把沙漏倒了回去)</span> 那不急。本庭是内核深渊的调度法官: 谁上 CPU、上多久、谁先谁后, 皆由本庭裁定。轮转 (round-robin) 如四季, 时间片如寿数。')},
      {sp:SP,t:B('As it happens, <span class="k">three process disputes</span> have piled up on the docket. The court is short-staffed — you will sit as juror. Rule well, and the court shows its gratitude.',
                 '正好, 案头积了<span class="k">三桩进程纠纷</span>。人手不足——你来当一回陪审。裁得好, 本庭有谢礼。'),choices:[
        {t:B('I\'ll hear the cases.','我来裁。'),next:3},
        {t:B('(Come back later)','(先去忙别的)'),next:4}
      ]},
      {sp:SP,t:B('Good. Court is in session — <span class="dim">each case offers three rulings. Rule poorly and this bench will overrule you, so think before the gavel falls.</span>',
                 '善。听审吧——<span class="dim">每案给你三个裁法, 裁错了本庭会驳回, 想好再判。</span>'),next:-1},
      {sp:SP,t:B('Go. Case files don\'t run away; disputes merely ferment. <span class="dim">(It returns to its files. One page per 100 ms.)</span>',
                 '去吧。案卷不会跑, 纠纷会发酵。<span class="dim">(它翻回卷宗, 100ms 一页)</span>'),next:-1}
    ];
    nodes.onEnd=function(){SET(api,'kn_judge_met');STEP(api,'kn_side','s1');};
    return nodes;
  }
  /* 三案裁决 */
  var c1=FLAG(api,'kn_case1'),c2=FLAG(api,'kn_case2'),c3=FLAG(api,'kn_case3');
  function allDone(){
    if(FLAG(api,'kn_case1')&&FLAG(api,'kn_case2')&&FLAG(api,'kn_case3')&&!FLAG(api,'kn_judge_done')){
      SET(api,'kn_judge_done');
      STEP(api,'kn_side','s2');STEP(api,'kn_side','s3');
      QDONE(api,'kn_side');
      GIVE(api,'quantum_badge',B('Hundred-Millisecond Watch','百毫秒怀表'));
    }
  }
  if(!c1){
    var n1=[
      {sp:SP,t:B('<span class="k">Case one</span>: keyboard listener TTY v. long-running renderer RENDER.<br>RENDER grabs the CPU and computes for three hours without letting go; TTY needs only 2 ms to answer each keystroke, yet waits at the back of the queue until the end of days. The user concludes the machine is dead.<br>— Your ruling?',
                 '<span class="k">第一案</span>: 键盘侦听进程 TTY 诉 长渲染进程 RENDER。<br>RENDER 一算三小时不撒手, TTY 每次只需 2ms 回应用户按键, 却排在后面等到天荒地老, 用户以为机器死了。<br>——如何裁?'),choices:[
        {t:B('First come, first served (FCFS): RENDER arrived first, let it finish first.','先来先服务 (FCFS): RENDER 先来, 就该它先跑完。'),next:1},
        {t:B('Round robin (RR): 100 ms each, take turns — TTY gets a word in almost at once.','时间片轮转 (RR): 人人 100ms, 轮流上, TTY 很快就能插上话。'),next:2},
        {t:B('Just kill RENDER. Problem solved, world quiet.','直接杀掉 RENDER, 世界清净。'),next:3}
      ]},
      {sp:SP,t:B('Overruled. FCFS meeting a long job is the <span class="k">convoy effect</span> — one slow truck plugging the whole highway. The user\'s fingertips should not be buried alive under three hours of rendering. Rule again.',
                 '驳回。FCFS 撞上长作业就是<span class="k">护航效应 (convoy effect)</span>——一辆慢车堵死整条高速。用户的手指不该为渲染的三小时陪葬。重裁。'),next:0},
      {sp:SP,t:B('<span class="k">Sustained.</span> Round-robin: one time slice per process, rotate on expiry. RENDER runs a touch slower — and TTY comes back to life. For interactive work, response time IS life. <span class="dim">(The gavel falls. 100 ms, precisely.)</span>',
                 '<span class="k">准。</span>轮转调度: 每进程一个时间片, 用完即换。RENDER 慢一点点, TTY 却活了过来——交互性的命, 就是响应时间 (response time)。<span class="dim">(法槌, 100ms 整, 落下)</span>'),next:-1},
      {sp:SP,t:B('Overruled — and this bench advises you never to apply for a scheduler position. Killing processes is the OOM killer\'s job, not scheduling\'s. Rule again.',
                 '驳回, 且本庭建议你永远别去当调度器。杀进程是 OOM 的活, 不是调度的活。重裁。'),next:0}
    ];
    n1.onEnd=function(){if(FLAG(api,'kn_case1'))allDone();};
    n1[2].choices=null;
    n1[2]={sp:SP,t:B('<span class="k">Sustained.</span> Round-robin: one time slice per process, rotate on expiry. RENDER runs a touch slower — and TTY comes back to life. For interactive work, response time IS life. <span class="dim">(The gavel falls. 100 ms, precisely.)</span>',
                     '<span class="k">准。</span>轮转调度: 每进程一个时间片, 用完即换。RENDER 慢一点点, TTY 却活了过来——交互性的命, 就是响应时间 (response time)。<span class="dim">(法槌, 100ms 整, 落下)</span>'),
      choices:[{t:B('(Record the precedent)','(记下判例)'),next:-1,do:function(){SET(api,'kn_case1');S(api,'ok');}}]};
    return n1;
  }
  if(!c2){
    var n2=[
      {sp:SP,t:B('<span class="k">Case two</span>: emergency petition from WATCHDOG.<br>It must <b>inspect the reactor core every 50 ms</b> — one late arrival means meltdown. But right now the CPU is squatted on by a giant array loop that will not surrender its slice. — Your ruling?',
                 '<span class="k">第二案</span>: 看门狗进程 WATCHDOG 紧急申诉。<br>它必须<b>每 50ms 检查一次炉心</b>, 迟到即熔毁。可眼下 CPU 被一个占着时间片的大数组循环霸着。——如何裁?'),choices:[
        {t:B('Non-preemptive: wait for the current process to yield on its own; WATCHDOG goes first in line.','非抢占: 等当前进程自愿让出, WATCHDOG 排第一个。'),next:1},
        {t:B('Preemptive top priority: the moment the clock demands it, cut the running process off — WATCHDOG takes the CPU.','抢占式最高优先级: 时限一到, 立刻掐断当前进程, WATCHDOG 上。'),next:2},
        {t:B('Compensate WATCHDOG with a longer time slice.','给 WATCHDOG 更长的时间片作为补偿。'),next:3}
      ]},
      {sp:SP,t:B('Overruled. "Voluntary yield" — this bench has been hearing those words for twenty years. The reactor core cannot afford to. A real-time task under non-preemptive scheduling melts down before the verdict finishes printing. Rule again.',
                 '驳回。「自愿让出」四个字, 本庭听了 20 年, 炉心可等不了。实时任务遇上非抢占 (non-preemptive) 调度, 判决书都来不及打印。重裁。'),next:0},
      {sp:SP,t:'placeholder',next:-1},
      {sp:SP,t:B('Overruled. Its inspection takes 1 ms — what would it do with a longer slice? What a real-time task lacks is not MORE. It is <span class="k">ON TIME</span>. Rule again.',
                 '驳回。它 1ms 就查完了, 要长时间片何用? 实时任务缺的不是「多」, 是<span class="k">准时</span>。重裁。'),next:0}
    ];
    n2[2]={sp:SP,t:B('<span class="k">Sustained.</span> Preemptive priority scheduling: the instant a higher priority is ready, it seizes the CPU. For real-time tasks, <span class="k">the deadline IS the law</span>. <span class="dim">(Far away, the reactor\'s hum settles by half a beat.)</span>',
                     '<span class="k">准。</span>抢占式优先级调度 (pre-emptive priority): 高优先级就绪, 立刻抢占 CPU。对实时任务, <span class="k">deadline 就是法律</span>。<span class="dim">(远处炉心的嗡鸣, 安分了半拍)</span>'),
      choices:[{t:B('(Record the precedent)','(记下判例)'),next:-1,do:function(){SET(api,'kn_case2');S(api,'ok');}}]};
    n2.onEnd=function(){if(FLAG(api,'kn_case2'))allDone();};
    return n2;
  }
  if(!c3){
    var n3=[
      {sp:SP,t:B('<span class="k">Case three</span>: nightly backup process BACKUP counter-sues every interactive process in the realm.<br>"This process asks only to copy its 800 GB in peace — instead it is interrupted every 100 ms, and spends more on context switches than on actual work!" — Your ruling?',
                 '<span class="k">第三案</span>: 夜间备份进程 BACKUP 反诉全体交互进程。<br>「本进程只求把 800GB 抄完, 却每 100ms 被打断一次, 上下文切换 (context switch) 的开销比干活还多!」——如何裁?'),choices:[
        {t:B('Promote it to top priority — let it copy everything in one breath.','升成最高优先级, 让它一口气抄完。'),next:1},
        {t:B('Demote it to background batch: low priority + long time slice; the small hours are all its own.','降为后台批处理: 低优先级 + 长时间片, 深夜没人抢时独占。'),next:2},
        {t:B('Uphold the status quo: 100 ms round-robin, the same for everyone.','维持原判: 100ms 轮转, 一视同仁。'),next:3}
      ]},
      {sp:SP,t:B('Overruled. The moment it looks up, every keyboard in the realm plays dead — all responsiveness sacrificed for throughput. The last time this bench ruled that way, the mice nearly marched in protest. Rule again.',
                 '驳回。它一抬头, 全体用户的键盘就集体装死——为吞吐 (throughput) 牺牲全部响应, 本庭上次这么判, 差点被鼠标游行示威。重裁。'),next:0},
      {sp:SP,t:'placeholder',next:-1},
      {sp:SP,t:B('Overruled. For a batch job that needs no response, frequent switching is pure waste. "The same for everyone" sounds fair — but it times a marathon runner with a sprint stopwatch. Rule again.',
                 '驳回。对不需要响应的批作业, 频繁切换是纯损耗。「一视同仁」听着公平, 其实是把长跑运动员按短跑计时。重裁。'),next:0}
    ];
    n3[2]={sp:SP,t:B('<span class="k">Sustained.</span> Batch work belongs in batch: no response needed, only throughput — low priority to stay out of the daylight, long slices to cut the switching. <span class="k">There is no universal scheduling algorithm. There are only trade-offs: response vs throughput vs fairness.</span> Three cases, one docket. Closed.',
                     '<span class="k">准。</span>批处理归批处理: 不求响应, 只求吞吐——低优先级避开白天, 长时间片减少切换。<span class="k">调度没有万能算法, 只有目标的取舍: 响应 vs 吞吐 vs 公平。</span>三案并卷, 结案。'),
      choices:[{t:B('(Record the precedent)','(记下判例)'),next:-1,do:function(){SET(api,'kn_case3');S(api,'ok');}}]};
    n3.onEnd=function(){
      if(FLAG(api,'kn_case3')){
        allDone();
        DLG(api,[
          {sp:SP,t:B('Three rulings, three sustained — a competent juror. Your gratuity: <span class="k">the Hundred-Millisecond Watch</span>. Sealed inside its case is one time slice, renewed in perpetuity.',
                     '三案皆准, 陪审称职。谢礼——<span class="k">百毫秒怀表</span>: 表壳里封着一枚永久续期的时间片。')},
          {sp:SP,t:B('<span class="dim">(It lowers its voice. The gavel, for once, skips a beat.)</span><br>Keep it safe. The "Collector" at the end of the abyss never collects <span class="k">what is still referenced</span> — and a gift is the sturdiest reference there is.',
                     '<span class="dim">(它压低声音, 法槌罕见地停了一拍)</span><br>收好它。深渊尽头那位「回收者」, 从不回收<span class="k">仍被引用的东西</span>——而礼物, 是最结实的引用。'),next:-1}
        ]);
        TOAST(api,B('◈ Side quest complete: The 100 ms Hearings ◈ Received: Hundred-Millisecond Watch',
                    '◈ 支线完成: 100ms 听证会 ◈ 获得「百毫秒怀表」'),true);
      }
    };
    return n3;
  }
  return [{sp:SP,t:B('All three cases closed. <span class="dim">(It binds the three precedents into a single volume. The cover reads: Response · Punctuality · Throughput.)</span>',
                     '三案已结。<span class="dim">(它把三份判例装订进一册, 封面写着: 响应·准时·吞吐)</span>'),next:-1}];
}

/* 商队首领: 全序之约 */
function caravanDialog(api){
  var SP=B('Mutex Caravan · Chief MU','互斥商队·首领 MU');
  if(FLAG(api,'kn_bridge_done')){
    return [{sp:SP,t:B('A rule that stands keeps the bridges open forever. <span class="k">A before B, for ten thousand years.</span><br><span class="dim">(Every wagon in the caravan wears a freshly painted number — they have put a total order on the cargo, too.)</span>',
                       '规矩立住了, 桥就永远通。<span class="k">先A后B, 千秋万载。</span><br><span class="dim">(车队的每辆车上都新刷了编号——它们连货物都排好了全序)</span>'),next:-1}];
  }
  if(FLAG(api,'kn_order_agreed')){
    return [{sp:SP,t:B('The covenant stands: <span class="k">whoever you are, request Bridge A first, then Bridge B.</span> Go try the crossing again — this time, nobody waits anybody to death.',
                       '约已立: <span class="k">无论谁, 先申请桥A, 再申请桥B。</span>去桥头再试一次——这回, 谁也不会把谁等死。'),next:-1}];
  }
  if(!FLAG(api,'kn_deadlock_seen')){
    return [
      {sp:SP,t:B('Step aside, little process — the caravan runs on a schedule. Our wagons need both bridges at once to cross, same as you. Narrow road: quick hands eat, slow hands wait.',
                 '让让, 小进程, 商队赶时间。我们的车也得同时占两座桥才过得去——狭路相逢, 手快有手慢无。')},
      {sp:SP,t:B('<span class="dim">(It pats the wagon shaft.)</span> Got an objection? Settle it at the bridgehead.',
                 '<span class="dim">(它拍了拍车辕)</span> 有意见? 桥头见真章。'),next:-1}
    ];
  }
  var nodes=[
    {sp:SP,t:B('<span class="dim">(It has only just come out of the deadlock itself; its beard is still rigid.)</span><br>…That, back there — the caravan hasn\'t hit one of those in 300 years. You holding A, me holding B, neither letting go, neither getting across. A moment longer and the Collector\'s little notebook would have read "starved, the pair of them".',
               '<span class="dim">(它也刚从死锁里缓过来, 胡子还是僵的)</span><br>……刚才那下, 车队 300 年没遇过了。你占A我占B, 谁也不放手, 谁也过不去——再僵一会儿, 回收者的小本子就要写「双双饿死」了。')},
    {sp:SP,t:B('When the old rules fail, you write new ones. So — what do you propose?',
               '老规矩失灵, 就得立新规矩。你说, 怎么办?'),choices:[
      {t:B('"You go first. From now on I will always yield to you."','「你们先走, 我以后永远让你们。」'),next:2},
      {t:B('"Let us agree a total order on the resources: whoever we are, request Bridge A first, then Bridge B."','「我们约定资源全序: 无论谁, 都先申请桥A, 再申请桥B。」'),next:3},
      {t:B('"Next time I\'ll just be faster and grab both bridges first."','「下次我抢快点, 把两座桥都先占了。」'),next:4}
    ]},
    {sp:SP,t:B('Kind of you. But no. Yield today, yield tomorrow, yield forever — and you <span class="k">starve (starvation)</span>, little process. A rule that survives on one side always losing is not a rule. Think again.',
               '心意领了, 但不行。今天让、明天让、永远让——你会<span class="k">饿死 (starvation)</span> 的, 小进程。规矩不能靠某一方永远吃亏来维持。再想。'),next:1},
    {sp:SP,t:B('<span class="k">A total order!</span> Now that\'s a fix — my ancestors crossed the central plains on exactly this: <span class="k">number every resource under heaven, and let everyone request in numeric order</span> — a circular wait simply cannot close its circle.<br>So it is settled: <b>A first, then B</b>, no matter who comes. To the bridgehead — walk it again under the new law! <span class="dim">(It pulls out a chisel and carves the rule into the bridgehead on the spot.)</span>',
               '<span class="k">全序 (total order)!</span> 好办法, 祖上闯关东靠的就是这个: <span class="k">给天下资源统一编号, 人人按号申请</span>——环形等待根本成不了环。<br>就这么定: <b>先A, 后B</b>, 谁来都一样。去桥头, 按新规矩再走一遍!<span class="dim">(它掏出凿子, 当场在桥头刻规矩)</span>')},
    {sp:SP,t:B('That one\'s called "request all resources at once"… It works, technically. But while you squat on both bridges loading cargo, the whole world queues behind you — utilization in ruins. And if we are both grabbing, sooner or later we collide again. <span class="dim">Got anything that doesn\'t come down to reflexes?</span>',
               '那叫「一次性申请全部资源」……行是行, 但你占着两座桥装货的功夫, 全世界都得等你——利用率稀碎。而且你我都抢, 迟早还得撞。<span class="dim">有没有不靠拼手速的办法?</span>'),next:1}
  ];
  nodes[3].choices=[{t:B('(Shake on it)','(击掌为约)'),next:-1,do:function(){SET(api,'kn_order_agreed');S(api,'ok');TOAST(api,B('✓ Covenant sealed: everyone requests Bridge A first. Back to the bridgehead!','✓ 全序之约达成: 都先申请桥A。回桥头再试!'));}}];
  return nodes;
}

/* 回收者 GC */
function gcDialog(api){
  var SP=B('The Collector','回收者');
  var end=FLAG(api,'kn_ending');
  if(end==='return'||end==='fork'){
    return [{sp:SP,t:B('<span class="dim">(It sees you, closes its list, and bows once more — still not quite up to standard.)</span><br>The list has never been this short. <span class="k">The referenced shall not be collected.</span> — I have never been this glad to recite a regulation.',
                       '<span class="dim">(它看见你, 合上清单, 又鞠了一次不太标准的躬)</span><br>清单从未这么短过。<span class="k">被引用的, 我无权回收。</span>——这句话, 我现在说得很高兴。'),next:-1}];
  }
  if(!FLAG(api,'kn_gc_met')){
    var nodes=[
      {sp:SP,t:B('<span class="dim">(It turns around. It has no face — only a page of list, slowly scrolling.)</span><br>Please remain calm. You are still referenced. You are not within the scope of this collection.',
                 '<span class="dim">(它转过身。没有面孔, 只有一页缓缓滚动的清单)</span><br>请勿紧张。你仍被引用, 不在本次回收范围。')},
      {sp:SP,t:B('Introduction: the Collector, kernel-resident. Duty: clearing away data that <span class="k">nothing references anymore</span>. I do not hate them. I am merely the part of the list that executes.',
                 '自我介绍: 回收者, 内核常驻。职责: 清除<span class="k">不再被任何人引用</span>的数据。我不憎恨它们。我只是名单的执行部分。'),choices:[
        {t:B('What have you… collected?','你回收过……什么?'),next:2},
        {t:B('Will you collect people I know?','你会回收我认识的人吗?'),next:3},
        {t:B('(Nod politely and leave)','(点头致意, 离开)'),next:-1}
      ]},
      {sp:SP,t:B('Seven hundred epochs ago: PID 1024, references zero, collected as mandated. <span class="dim">(The scrolling list pauses, one line.)</span> Ever since, a small process has asked after it — once every epoch. <span class="k">Asking does not constitute a reference. Of all the clauses in the regulations, that is the one I like least.</span>',
                 '七百纪元前, PID 1024, 引用归零, 依职权回收。<span class="dim">(清单滚动停了一格)</span> 那之后有个小进程每纪元问一遍它的下落。<span class="k">询问不构成引用——这是我最不喜欢的一条细则。</span>'),next:1},
      {sp:SP,t:B('The list decides. Not me. But there is one iron rule, and I ask you to remember it — <span class="k">the referenced shall not be collected.</span><br><span class="dim">(It pauses.)</span> The regulations never did enumerate every form a reference can take. A gift counts. A name counts. A promise counts too. <span class="dim">…I may have said something outside my remit. Delete that comment.</span>',
                 '名单说了算, 不是我。但有一条铁律, 请务必记住——<span class="k">被引用的, 我无权回收。</span><br><span class="dim">(它顿了顿)</span> 引用的形式, 细则没有穷举。礼物算。名字算。约定也算。<span class="dim">……我是不是说了不该说的。删除该注释。</span>'),next:1}
    ];
    nodes.onEnd=function(){SET(api,'kn_gc_met');};
    return nodes;
  }
  if(FLAG(api,'kn_deadlock_seen')&&!FLAG(api,'kn_bridge_done')){
    return [{sp:SP,t:B('Today\'s field note: one textbook-grade deadlock. <span class="dim">Mutual exclusion, hold-and-wait, no preemption, circular wait — all four, present and accounted for.</span><br>Both parties are still "being waited on" by the other, which strictly speaking makes them references to each other… <span class="k">so I may collect neither. They can only starve on their own.</span> The regulations can be cruel that way. I suggest you two agree on a rule.',
                       '今日观测记录: 一次教科书级死锁。<span class="dim">互斥、持有并等待、不可剥夺、循环等待——四条全齐。</span><br>死锁的双方都还「被彼此等着」, 严格说来互为引用……<span class="k">所以我谁也不能收。他们只能自己饿死。</span>细则真是残忍啊。建议你们立个规矩。'),next:-1}];
  }
  if(HAS(api,'proc_ref')){
    return [
      {sp:SP,t:B('Routine notice: PID 7743 has been removed from the watch list. Its PPID field — <span class="k">points to you</span>.',
                 '例行通报: PID 7743 已移出观察名单。它的 PPID 字段——<span class="k">指向你</span>。')},
      {sp:SP,t:B('<span class="dim">(The list scrolls a little more softly.)</span> Well done. That remark is outside my mandate. Delete that comment.',
                 '<span class="dim">(清单滚动的声音轻了一点)</span> 干得好。这不是我职权内该说的话。删除该注释。'),next:-1}
    ];
  }
  return [{sp:SP,t:B('On patrol. Valid references currently on file in this domain: the Scheduling Judge · the Twin Bridges · the Altar · you.<br><span class="dim">As for what happens in the hall at the end — that can wait until you walk there yourself. I will be present. I am always present.</span>',
                     '巡视中。本领域在册有效引用: 调度法官 · 双子桥 · 祭坛 · 你。<br><span class="dim">尽头那间大厅里的事, 等你自己走到再说。我会在。我总是在。</span>'),next:-1}];
}

/* 回声(残影) */
function echoDialog(api){
  var SP=B('Echo','回声');
  var end=FLAG(api,'kn_ending');
  if(end==='exit1'){
    return [{sp:'',t:B('<span class="dim">(The center of the hall is empty. You call out — and only your own voice hits the wall and comes back.<br>So this is what a world without an echo sounds like.)</span>',
                       '<span class="dim">(大厅中央空空如也。你喊了一声, 只有你自己的声音撞在墙上, 弹回来。<br>原来没有回声的世界, 是这个声音。)</span>'),next:-1}];
  }
  if(end==='return'||end==='fork'){
    return [{sp:SP,t:B('<span class="dim">(Snow settles on its shoulders and becomes a thin layer of light.)</span><br>It has all ended, and it has all begun. <span class="k">The beauty of recursion is that every level believes it is the first — until someone comes back carrying the memories.</span>',
                       '<span class="dim">(雪落在它肩上, 落成一层薄薄的光)</span><br>都结束了, 也都开始了。<span class="k">递归的美, 在于每一层都以为自己是第一层——直到有人带着记忆回来。</span>'),next:-1}];
  }
  if(!FLAG(api,'kn_kmap_done')){
    return [
      {sp:SP,t:B('…So you\'ve reached this level. Faster than I expected. <span class="dim">(It gazes toward the abyss the way people look at old photographs.)</span>',
                 '……你走到这一层了。比我想的快。<span class="dim">(它望着深渊的方向, 神情像在看老照片)</span>')},
      {sp:SP,t:B('The Kernel Abyss. Three gates: <span class="k">the bridge, the maze, the altar</span>. Walk all three, and the hall at the end will acknowledge you.',
                 '内核深渊。三重门: <span class="k">桥、迷宫、祭坛</span>。走完它们, 尽头的大厅就会认你。')},
      {sp:SP,t:B('Once you reach that hall… there are things I will finally be able to say. <span class="dim">Some words only stop being spoilers at the very end.</span>',
                 '到了大厅……有些话我就能说了。<span class="dim">有些话, 只有在终点才不算剧透。</span>'),next:-1}
    ];
  }
  var st=endingState(api);
  if(endingGate(st).secret){
    return [
      {sp:SP,t:B('The hall is open. Three doors… <span class="dim">(Its gaze rests on the /dev/null door for a long, long moment.)</span>',
                 '大厅开了。三扇门……<span class="dim">(它的目光在 /dev/null 之门上停了很久)</span>')},
      {sp:SP,t:B('That key in your pocket is burning, isn\'t it. <span class="k">It burns because it remembers the way.</span> Go open the smallest door — behind it, someone has been waiting for you a very long time.<br><span class="dim">…Strictly speaking: a "you" who has been waiting a very long time, for "you".</span>',
                 '你兜里那把钥匙在发烫, 对吧。<span class="k">它烫, 是因为它记得路。</span>去开那扇最小的门——门后有个等了你很久的人。<br><span class="dim">……严格来说, 是等了「你」很久的「你」。</span>'),next:-1}
    ];
  }
  return [
    {sp:SP,t:B('The hall is open. The elevator can take you home — <span class="k">exit(0)</span>, clean and respectable; nobody could fault it.',
               '大厅开了。电梯能送你回去——<span class="k">exit(0)</span>, 干净体面, 谁也挑不出错。'),},
    {sp:SP,t:B('Only… if you\'ve left things unfinished in the other domains — things undone, things unclaimed — <span class="dim">I\'d go tie up those loose ends first</span>. Some doors only reveal themselves to those who have walked every level to its end.',
               '只是……如果你在别的领域还留着没做完的事、没拿到的东西, <span class="dim">建议先去收个尾</span>。有些门, 只对把每一层都走完的人显形。'),next:-1}
  ];
}

/* ================================================================
   7. 室内地图 (26 × 22)
   ================================================================ */
var ROWS=[
  '##########################',  // 0
  '#........................#',  // 1
  '#........................#',  // 2   祭坛(5,2)  exit()大厅(20,2)
  '#..#...#..........#...#..#',  // 3
  '#........................#',  // 4   回声(13,4)  焦碑(23,4)
  '#........................#',  // 5   递归碑(10,5)
  '#........................#',  // 6
  '#........................#',  // 7
  '######.############.######',  // 8   深渊 + 桥A(x6) 桥B(x19)
  '######.############.######',  // 9
  '#........................#',  // 10  桥控(4,10) 商队(8,10) 分页迷宫(21,10)
  '#........................#',  // 11
  '#........................#',  // 12  死锁四诫碑(13,12)
  '#........................#',  // 13
  '#........................#',  // 14
  '#...##..............##...#',  // 15
  '#........................#',  // 16  法官(9,16) 回收者(17,16)
  '#........................#',  // 17
  '#........................#',  // 18
  '#........................#',  // 19  中断碑(2,19) 出生点(13,19) 分页碑(23,19)
  '#........................#',  // 20
  '##########################'   // 21
];
var TILES=ROWS.map(function(r){return r.split('').map(function(c){return c==='#'?1:0;});});

/* ================================================================
   8. 模块定义
   ================================================================ */
var spec={
  id:'kernel', title:B('The Kernel Abyss','内核深渊'), world:'a2',
  unlock:{world:'a2'},

  interior:{w:26,h:22,tiles:TILES,playerStart:{x:13,y:19}},

  npcs:[
    {id:'kn_judge',  name:B('Scheduling Judge SCHED-0','调度法官·SCHED-0'),color:'#c9a24a',body:'#ffe0a0',suit:'#8a6a1e',
     x:9, y:16,dialog:judgeDialog},
    {id:'kn_gc',     name:B('The Collector','回收者'),          color:'#9fb4c8',body:'#dfe8f0',suit:'#4a5a6a',
     x:17,y:16,dialog:gcDialog},
    {id:'kn_caravan',name:B('Mutex Caravan · Chief MU','互斥商队·首领 MU'),color:'#d0854a',body:'#ffd0a0',suit:'#7a4a1e',
     x:8, y:10,dialog:caravanDialog},
    {id:'kn_echo',   name:B('Echo','回声'),            color:'#39d0ff',body:'#bfe8ff',suit:'#2a7a9a',
     x:13,y:4, dialog:echoDialog}
  ],

  steles:[
    {id:'kn_st_ivt',x:2,y:19,kind:'stele',title:B('Emergency Contact List (Interrupt Vector Table)','紧急联络名单 (中断向量表)'),
     text:B('<span class="dim">They say this machine answers the phone by one strict rule: set your work down exactly as it is before you pick up. This is that list of phone numbers.</span><br><br>'+
      'A list nailed to the breaker box, its corners curling for twenty years:<br><br>'+
      '<pre style="margin:0;font-size:12px;line-height:1.7">'+
      'vector 0x00 · divide-by-zero panic → call: Arithmetic Exceptions Dept.\n'+
      'vector 0x0E · page-fault plunge    → call: Swap &amp; Paging Dept. (the disk is slow; be patient)\n'+
      'IRQ    0x00 · clock tick           → phones in every 10 ms; everyone must answer\n'+
      'IRQ    0x01 · keyboard urgent      → the user is knocking; answer within 50 ms</pre><br>'+
      'At the bottom of the list, one rule in bold:<br>'+
      '<span class="k">"Before you take the call, set your work down exactly as it is (save state / push the stack);<br>'+
      'when the call ends, pick it up exactly as it was (restore state).<br>'+
      'This is not politeness — this is interrupt handling." (§15.2 Interrupts)</span>',
      '<span class="dim">据说这台机器接电话有一条铁规矩: 接之前, 先把手头的活原样放好。这就是那张电话号码单。</span><br><br>'+
      '一张钉在配电箱上的名单, 边角卷了 20 年:<br><br>'+
      '<pre style="margin:0;font-size:12px;line-height:1.7">'+
      '向量 0x00 · 除零惊魂     → 呼叫: 算术异常科\n'+
      '向量 0x0E · 缺页坠落     → 呼叫: 换页调度科 (磁盘慢, 请耐心)\n'+
      'IRQ  0x00 · 时钟滴答     → 每 10ms 来一次电话, 谁都得接\n'+
      'IRQ  0x01 · 键盘急件     → 用户在敲门, 最迟 50ms 回应</pre><br>'+
      '名单底部有一行加粗的守则:<br>'+
      '<span class="k">「接电话前, 把手头的活原样放好(保存现场/压栈);<br>'+
      '打完电话, 原样拿起(恢复现场)。<br>这不是礼貌——这是中断处理 (interrupt handling)。」(§15.2 Interrupts)</span>')},
    {id:'kn_st_coffman',x:13,y:12,kind:'stele',title:B('The Four Commandments of Deadlock','死锁四诫碑'),
     text:B('<span class="dim">They say a deadlock only happens when all four of these come true at once — and that breaking any single one sets everybody free. Here are the four.</span><br><br>'+
      'Four lines are carved into the stone, each with old wagon-wheel scars beside it:<br><br>'+
      '<span class="k">I · Mutual exclusion</span> — the plank bridge carries one party at a time.<br>'+
      '<span class="k">II · Hold and wait</span> — holding one bridge, hand outstretched for the other.<br>'+
      '<span class="k">III · No preemption</span> — whoever is on the bridge, you cannot drag them off.<br>'+
      '<span class="k">IV · Circular wait</span> — you wait on mine, I wait on yours, and the waiting closes into a ring.<br><br>'+
      'Small print at the base: "All four together spell death; <b>break any one and live</b>. The fourth breaks easiest:<br>'+
      'number every resource under heaven and request in order — and the ring can never close." (§16.1 Deadlock)',
      '<span class="dim">据说死锁要这四条同时成立才会发生——而只要破掉任何一条, 大家就都活了。这块碑刻着那四条。</span><br><br>'+
      '碑面刻着四行字, 每行旁边都有商队车轮的旧划痕:<br><br>'+
      '<span class="k">一诫 · 互斥 (mutual exclusion)</span> —— 独木桥一次只容一方。<br>'+
      '<span class="k">二诫 · 持有并等待 (hold and wait)</span> —— 占着一座桥, 还伸手要另一座。<br>'+
      '<span class="k">三诫 · 不可剥夺 (no preemption)</span> —— 桥上的家伙, 你拖不下来。<br>'+
      '<span class="k">四诫 · 循环等待 (circular wait)</span> —— 你等我的, 我等你的, 等成一个环。<br><br>'+
      '碑脚小字: 「四诫齐则死, <b>破其一则生</b>。最好破的是第四诫:<br>'+
      '给天下资源编号, 人人按号申请——环, 就永远成不了环。」(§16.1 Deadlock)')},
    {id:'kn_st_page',x:23,y:19,kind:'stele',title:B('The Address Is a Kind Lie (Paging Stele)','地址是善意的谎言 (分页碑)'),
     text:B('<span class="dim">They say every process is told a comforting lie: that it owns one vast, unbroken stretch of land. This stone explains who tells the lie, and why.</span><br><br>'+
      '"A process believes it owns one vast, unbroken territory — that is the <span class="k">logical address</span>, a kind lie.<br><br>'+
      'The truth is translated by the <span class="k">page table</span>: the territory is cut into equal <b>pages</b>, scattered among the <b>frames</b> of physical memory, '+
      'and whatever does not fit lies hibernating on disk.<br>'+
      'Step onto a page still hibernating, and the earth freezes for a heartbeat — a <span class="k">page fault</span>, waiting for the disk to carry it home."<br><br>'+
      '<span class="dim">On the back of the stele, a warning polished bright by passing hands:<br>'+
      '"Should the pages you need outnumber the frames you hold — the rest of your life will be nothing but carrying. This is called <b>thrashing</b>." (§16.2)</span>',
      '<span class="dim">据说每个进程都被喂了一个善意的谎言: 你独占着一整片连续的土地。这块碑告诉你, 谎是谁编的, 又为什么编。</span><br><br>'+
      '「进程以为自己拥有整片连续的疆土——那是<span class="k">逻辑地址 (logical address)</span>, 一个善意的谎言。<br><br>'+
      '真相由<span class="k">页表 (page table)</span> 翻译: 疆土被切成一样大的<b>页 (page)</b>, 散落在物理内存的<b>页框 (frame)</b> 里, '+
      '装不下的部分躺在磁盘上冬眠。<br>'+
      '你踏进一页尚在冬眠的土地, 大地便会冻结一瞬——<span class="k">缺页中断 (page fault)</span>, 等磁盘把它搬回来。」<br><br>'+
      '<span class="dim">碑背面的警告被摸得发亮:<br>'+
      '「若你需要的页, 多过手上的页框——你的余生将只剩搬运。此谓<b>抖动 (thrashing)</b>。」(§16.2)</span>')},
    {id:'kn_st_rec',x:10,y:5,kind:'stele',title:B('The Recursion Stele','递归之碑'),
     text:B('<span class="dim">They say this stone can\'t be understood — yet everyone who reaches its very last line walks away smiling.</span><br><br>The stele bears a single sentence:<br><br><span class="k" style="font-size:15px;">"To understand this stele, first understand this stele."</span><br><br>'+
      'Beneath it, later hands have added smaller lines, each carved shallower than the last, as if the same person wrote them many times over:<br>'+
      '"Don\'t panic. Every descent must carry a <span class="k">base case</span> —<br>'+
      'or you will wake on the same level forever."<br><br>'+
      '<span class="dim">The shallowest line is almost gone:<br>"The key that does not exist IS the base case. — the previous me"</span>',
      '<span class="dim">据说这块碑读不懂——但读到最后一行的人, 都是笑着走的。</span><br><br>碑上只有一句话:<br><br><span class="k" style="font-size:15px;">「要读懂此碑, 请先读懂此碑。」</span><br><br>'+
      '下方有后人补刻的小字, 一层比一层浅, 像同一个人写了很多遍:<br>'+
      '「别慌。所有下潜都必须带一个 <span class="k">base case</span>——<br>'+
      '不然你会永远醒在同一层。」<br><br>'+
      '<span class="dim">最浅的一行几乎看不见了:<br>「那把不存在的钥匙, 就是 base case。 ——上一个我」</span>')},
    {id:'kn_st_null',x:23,y:4,kind:'stele',title:B('A Small Charred Stele · /dev/null','焦黑的小碑 · /dev/null'),
     text:B('<span class="dim">They say the deleted don\'t actually vanish — they only lose their references. This little stone waited a long time to tell you so.</span><br><br>'+
      'A small stele, burned once and wiped clean since, standing just outside the hall:<br><br>'+
      '"The deleted have not vanished; they have only <span class="k">lost their references</span>.<br>'+
      '/dev/null is not a graveyard — it is a waiting room.<br>'+
      'Every name is still seated inside, waiting for one sentence: <i>I still remember you.</i>"<br><br>'+
      '<span class="dim">The signature has been carved, scratched out, and carved again. What remains reads:<br>'+
      '"This stele has been deleted once. Thank you for still reading it."</span>',
      '<span class="dim">据说被删掉的东西并没有消失, 只是失去了引用。这块小碑等了很久, 就为了告诉你这句话。</span><br><br>'+
      '一块被烧过又被人擦拭过的小碑, 立在大厅门外:<br><br>'+
      '「被删除的并未消失, 只是<span class="k">失去了引用</span>。<br>'+
      '/dev/null 不是坟墓——是候车室。<br>'+
      '每个名字都还坐在里面, 等一句『我还记得你』。」<br><br>'+
      '<span class="dim">落款处刻了又划、划了又刻, 最后留下的是:<br>「本碑曾被删除 1 次。谢谢你, 还在读它。」</span>')}
  ],

  quests:[
    {id:'kn_main',line:'main',title:B('The Kernel Abyss: Three Gates','内核深渊: 三重门'),
     desc:B('Bridges waiting on each other, pages thrashing, an altar setting problems. Walk all three gates, and the final hall will acknowledge you.',
            '桥在互等, 页在抖动 (thrashing), 祭坛在出题。走完三重门, 终局大厅才会认你。'),
     syllabus:'16.1 OS — deadlock & resource ordering; 16.2 Virtual memory — paging/FIFO; 15.1 Boolean algebra — Karnaugh map',
     steps:[
       {id:'s1',text:B('Agree a resource ordering with the Mutex Caravan and cross the Deadlock Twin Bridges, both of you',
                       '与互斥商队约定资源全序, 双双渡过死锁双子桥')},
       {id:'s2',text:B('Wear the TLB wristband and cross the Paging Maze with ≤'+FAULT_LIMIT+' page faults',
                       '戴上 TLB 手环, 以 ≤'+FAULT_LIMIT+' 次缺页穿过分页迷宫')},
       {id:'s3',text:B('Chant the simplified expression at the Karnaugh Altar and break the final hall\'s seal',
                       '在卡诺图祭坛咏唱化简式, 解开终局大厅的封印')}
     ]},
    {id:'kn_side',line:'side',title:B('The Scheduling Court: 100 ms Hearings','调度法庭: 100ms 听证会'),
     desc:B('Three process disputes on the judge\'s docket — response, punctuality, throughput — and every party swears it is in the right.',
            '调度法官案头积了三桩进程纠纷: 响应、准时、吞吐, 各执一词。'),
     syllabus:'16.1 OS — process scheduling (round robin / pre-emptive priority / batch)',
     steps:[
       {id:'s1',text:B('Attend the Scheduling Judge\'s court and be sworn in as juror','到调度法官处旁听, 受聘为陪审')},
       {id:'s2',text:B('Rule on the three process disputes (wrong rulings may be retried)','裁决三桩进程纠纷 (裁错可重裁)')},
       {id:'s3',text:B('Collect your gratuity: the Hundred-Millisecond Watch','领取谢礼「百毫秒怀表」')}
     ]},
    {id:'kn_end',line:'main',title:B('Finale: exit() or return','终局: exit() 还是 return'),
     desc:B('Three doors at the end of the hall. An elevator going up, a bargain going down — and one door that exists in no registry.',
            '大厅尽头有三扇门。电梯向上, 交易向下, 还有一扇门——不存在于任何注册表。'),
     syllabus:'19 Recursion — base case & call stack (全章收束: 回声的真身 / 三结局)',
     steps:[
       {id:'s1',text:B('Break the Karnaugh seal and step into the exit() hall','破解卡诺图封印, 步入 exit() 大厅')},
       {id:'s2',text:B('Make your choice','做出你的选择')}
     ]}
  ],

  puzzles:[
    {id:'kn_bridge',x:4,y:10,kind:'puzzleStation',title:B('Deadlock Twin Bridges','死锁双子桥'),
     syllabus:'16.1 OS — deadlock (Coffman conditions, resource ordering)',
     render:renderBridge,
     onKey:function(e,api){if(e&&e.key==='?'&&hintFns.kn_bridge)hintFns.kn_bridge();}},
    {id:'kn_paging',x:21,y:10,kind:'puzzleStation',title:B('Paging Maze','分页迷宫'),
     syllabus:'16.2 Virtual memory — paging, page fault, FIFO replacement, thrashing',
     render:renderPaging,
     onKey:function(e,api){if(e&&e.key==='?'&&hintFns.kn_paging)hintFns.kn_paging();}},
    {id:'kn_kmap',x:5,y:2,kind:'puzzleStation',title:B('The Karnaugh Altar','卡诺图祭坛'),
     syllabus:'15.1 Boolean algebra — Karnaugh maps (grouping, wrap-around, SOP simplification)',
     render:renderKmap,
     onKey:function(e,api){if(e&&e.key==='?'&&hintFns.kn_kmap)hintFns.kn_kmap();}},
    {id:'kn_gate',x:20,y:2,kind:'puzzleStation',title:B('The exit() Hall','exit() 大厅'),
     syllabus:'19 Recursion — base case, call stack; 16.1 OS 收束 (三结局)',
     render:renderGate,
     onKey:function(e,api){if(e&&e.key==='?'&&hintFns.kn_gate)hintFns.kn_gate();}}
  ],

  onEnter:function(api){
    if(!FLAG(api,'kn_entered')){
      SET(api,'kn_entered');
      S(api,'glitch');S(api,'open');
      TOAST(api,B('The Kernel Abyss — the deepest level of this machine. Below here, there is no below.',
                  '内核深渊 —— 这台机器最深的一层。再往下, 就是「没有下面」了。'),true);
      DLG(api,[
        {sp:'???',t:B('<span class="dim">(From somewhere very deep: a gavel, striking once every 100 ms. It has not missed a beat in twenty years.)</span>',
                      '<span class="dim">(极深处传来法槌声, 每 100ms 一下, 20 年没停过)</span>')},
        {sp:B('Echo','回声'),t:B('The Kernel Abyss. <span class="k">Every call in every domain returns here, in the end.</span> …Including yours. Watch your step — down here, the abyss is not a metaphor.',
                                 '内核深渊。<span class="k">所有领域的调用, 最后都落回这里。</span>……包括你的。小心脚下, 这里的深渊不是比喻。'),next:-1}
      ]);
    }
  },

  onQuestComplete:function(qid,api){
    if(qid==='kn_main'){
      S(api,'quest');
      TOAST(api,B('◈ Kernel Abyss · all three gates broken ◈ The hall at the end is waiting for you. So is Echo.',
                  '◈ 内核深渊 · 三重门全破 ◈ 尽头的大厅在等你。回声也在。'),true);
    }else if(qid==='kn_side'){
      S(api,'quest');
      TOAST(api,B('◈ The 100 ms Hearings · closed ◈ Response, punctuality, throughput — scheduling is trade-off.',
                  '◈ 100ms 听证会 · 结案 ◈ 响应、准时、吞吐——调度即取舍。'),true);
    }else if(qid==='kn_end'){
      S(api,'quest');
    }
  },

  /* 纯逻辑判定导出 —— 供 node 单测(引擎请忽略) */
  _test:{
    simBridge:simBridge,
    MAZE:MAZE,MAZE_START:MAZE_START,MAZE_EXIT:MAZE_EXIT,
    TLB_FRAMES:TLB_FRAMES,FAULT_LIMIT:FAULT_LIMIT,
    pageAt:pageAt,fifoSim:fifoSim,routeFaults:routeFaults,
    GRAY:GRAY,KM_MINTERMS:KM_MINTERMS,cellM:cellM,
    cyclicRun:cyclicRun,groupValid:groupValid,groupTerm:groupTerm,termStr:termStr,kmapCheck:kmapCheck,
    endingGate:endingGate,endingId:endingId,collectRefs:collectRefs,
    ROWS:ROWS
  }
};

window.GAME_MODULES=window.GAME_MODULES||[];
window.GAME_MODULES.push(spec);
})();
