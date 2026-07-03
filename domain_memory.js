/* ================================================================
   BIT://ESCAPE 领域模块 —— 内存迷宫 Memory Maze (domain_memory.js)
   9618 AS · Topic 10.2 Introduction to Abstract Data Types
   (栈 Stack / 队列 Queue·环形队列 Circular Queue / 链表 Linked List)
   ----------------------------------------------------------------
   ★ 大纲合规修订: Boss 谜题原为"LRU 缓存神庙"——但 LRU/页面置换属于 A2 §16,
     AS 世界(§10.2)只学 stack/queue/linked list, 大一学生学不到, 必卡死。
     已换血为"环形队列神庙"(circular queue, §10.2 明确考点)。LRU 原玩法的
     判定函数与渲染函数整套保留在对应小节尾部, 标注 RESERVED FOR A2, 未接入
     任何 AS 可达路径(不在 puzzles[] 里), 供未来 A2 kernel 模块直接搬用。
   ----------------------------------------------------------------
   模块协议 (与 domain_logic.js 一致):
     window.GAME_MODULES.push({ id,title,world,unlock,interior,npcs,
                                steles,quests,puzzles,onEnter,onQuestComplete })
   约定(给引擎侧):
   - unlock.afterQuest='m3' —— index.html 第一章末尾任务实际 id 是 m3。
   - npcs[i].dialog 是函数 dialog(api) -> 对话节点数组, 节点格式与
     index.html 的 startDialog 一致: {sp,t,choices:[{t,next,do}],next}
     next 缺省 i+1, next:-1 结束。节点数组可挂 .onEnd, 请作为
     startDialog 的第二参数传入。
   - 双语: 一切面向玩家的字符串都是 {en,zh} 对象(默认英文)。
     结构化字段(title/desc/steps/steles/npc.name/dialog 节点的 sp/t/choices.t)
     直接携带 {en,zh}, 由引擎统一过 window.T;
     render() 自建 DOM 的文字在本模块内自行过 T()。
   - puzzle.render(el,api) 自建 DOM; onKey(e,api) 处理 '?' 提示热键。
   - 难度: 主线谜题带 NPC 演示 + 失败≥2次提示自动升到"近乎给答案";
     每个谜题通关后出现可选 ★Challenge (flags mem_challenge_1/2/3,
     不影响主线, 供排行榜探索分)。
   - 纯逻辑判定函数导出在模块 _test 字段(供无引擎单测, 引擎可忽略)。
   api 依赖: toast/sfx/giveItem/hasItem/completeStep/questDone/
             openDialog/closePanel/setFlag/getFlag/player
   ================================================================ */
(function(){
'use strict';

/* ---------------- 双语 fallback ---------------- */
var T=window.T||function(s){return typeof s==='string'?s:(s&&s.en!=null?s.en:'');};
function B(en,zh){return {en:en,zh:zh};}          // 结构化字段用: 挂 {en,zh}
function tx(en,zh){return T({en:en,zh:zh});}      // render()/toast 用: 立即取当前语言

/* ================================================================
   0. 纯逻辑判定 (可单测, 无 DOM 依赖, 与语言无关)
   ================================================================ */

/* ---- 谜题1 · 栈书库 (双栈排序) ----
   主栈(书库) bottom→top: recursion / heap / lifo
   借阅单(出书顺序): heap → recursion → lifo
   操作: MT 主→临, TM 临→主, MO 取主栈顶, TO 取临时栈顶
   最优解 4 步: MT, MO, MO, TO。步数上限 12 (宽松)。      */
var STACK_INIT=['recursion','heap','lifo'];          // bottom → top
var STACK_TARGET=['heap','recursion','lifo'];        // 借阅单顺序
var STACK_LIMIT=12;
var BOOK_NAMES={
  lifo:B('The LIFO Codex','《LIFO 圣典》'),
  heap:B('Chronicles of the Heap','《堆区编年史》'),
  recursion:B('Recursion Canyon Gazetteer','《递归峡谷志》'),
  queue:B('The FIFO Apocrypha','《FIFO 异闻录》'),
  pointer:B('Wild Pointer Control Handbook','《野指针防治手册》')
};

/* ★挑战版: 五重书塔——序列更长, 步数上限收紧 (最优解 9 步, 上限 11) */
var STACK2_INIT=['heap','recursion','lifo','queue','pointer'];   // bottom → top
var STACK2_TARGET=['lifo','pointer','queue','heap','recursion'];
var STACK2_LIMIT=11;

function stackNewG(init){return {main:init.slice(),temp:[],out:[],moves:0};}
/* 通用引擎。返回 {ok,fail,done,book?}; fail ∈ null|'empty'|'wrong'|'limit'|'badop'
   'empty' 不计步不改状态; 'wrong' 不改状态(UI 里触发整局重排)。 */
function stackMoveG(st,op,target,limit){
  if(st.moves>=limit)return {ok:false,fail:'limit',done:false};
  if(op==='MT'){
    if(!st.main.length)return {ok:false,fail:'empty',done:false};
    st.temp.push(st.main.pop());
  }else if(op==='TM'){
    if(!st.temp.length)return {ok:false,fail:'empty',done:false};
    st.main.push(st.temp.pop());
  }else if(op==='MO'||op==='TO'){
    var src=(op==='MO')?st.main:st.temp;
    if(!src.length)return {ok:false,fail:'empty',done:false};
    var b=src[src.length-1];
    if(target[st.out.length]!==b)return {ok:false,fail:'wrong',done:false,book:b};
    src.pop();st.out.push(b);
  }else return {ok:false,fail:'badop',done:false};
  st.moves++;
  var done=(st.out.length===target.length);
  if(!done&&st.moves>=limit)return {ok:false,fail:'limit',done:false};
  return {ok:true,fail:null,done:done};
}
function stackRunG(ops,init,target,limit){
  var st=stackNewG(init);
  for(var i=0;i<ops.length;i++){
    var r=stackMoveG(st,ops[i],target,limit);
    if(!r.ok)return {ok:false,fail:r.fail,at:i,state:st};
    if(r.done)return {ok:true,moves:st.moves,state:st};
  }
  return {ok:false,fail:'incomplete',at:ops.length,state:st};
}
/* 普通版 / 挑战版包装 */
function stackNew(){return stackNewG(STACK_INIT);}
function stackMove(st,op){return stackMoveG(st,op,STACK_TARGET,STACK_LIMIT);}
function stackRun(ops){return stackRunG(ops,STACK_INIT,STACK_TARGET,STACK_LIMIT);}
function stack2New(){return stackNewG(STACK2_INIT);}
function stack2Move(st,op){return stackMoveG(st,op,STACK2_TARGET,STACK2_LIMIT);}
function stack2Run(ops){return stackRunG(ops,STACK2_INIT,STACK2_TARGET,STACK2_LIMIT);}

/* ---- 谜题2 · 指针接骨 (链表重连) ----
   5 个节点散落在乱七八糟的地址上, next 全成了野指针。
   正解: 按数据升序 7→23→42→64→91, 尾指 NULL, HEAD 指 7。 */
var LIST_NODES=[
  {id:'nA',addr:'0x2A40',val:23},
  {id:'nB',addr:'0x0C10',val:7},
  {id:'nC',addr:'0x3B70',val:64},
  {id:'nD',addr:'0x1F08',val:42},
  {id:'nE',addr:'0x2F00',val:91}
];
var LIST_ANSWER={HEAD:'nB',nB:'nA',nA:'nD',nD:'nC',nC:'nE',nE:'NULL'};
/* ★挑战版正解的 prev 链 (双向链表) */
var DLIST_ANSWER_PREV={TAIL:'nE',nE:'nC',nC:'nD',nD:'nA',nA:'nB',nB:'NULL'};

function listNode(id){
  for(var i=0;i<LIST_NODES.length;i++)if(LIST_NODES[i].id===id)return LIST_NODES[i];
  return null;
}
/* next: {HEAD:<id|'NULL'|null>, nA:..., ...}; null/undefined = 野指针
   返回 {ok,cycle,order:[vals],fail}
   fail ∈ ''|'wild_head'|'wild'|'bad_ref'|'cycle'|'short'|'order' */
function listWalk(next){
  var res={ok:false,cycle:false,order:[],fail:''};
  var seen={},cur=next?next.HEAD:null,guard=0;
  if(cur==null){res.fail='wild_head';return res;}
  while(cur!=='NULL'){
    if(guard++>LIST_NODES.length+4){res.cycle=true;res.fail='cycle';return res;}
    if(seen[cur]){res.cycle=true;res.fail='cycle';return res;}
    var node=listNode(cur);
    if(!node){res.fail='bad_ref';return res;}
    seen[cur]=1;res.order.push(node.val);
    cur=next[cur];
    if(cur==null){res.fail='wild';return res;}
  }
  if(res.order.length!==LIST_NODES.length){res.fail='short';return res;}
  for(var i=1;i<res.order.length;i++)
    if(res.order[i-1]>=res.order[i]){res.fail='order';return res;}
  res.ok=true;return res;
}
/* 通用链行走 (给双向链表挑战用): 从 map[start] 出发。
   返回 {stop:'NULL'|'wild_start'|'wild'|'cycle'|'bad_ref', ids:[…]} */
function chainWalk(map,start){
  var ids=[],seen={},cur=map?map[start]:null,guard=0;
  if(cur==null)return {stop:'wild_start',ids:ids};
  while(cur!=='NULL'){
    if(guard++>LIST_NODES.length+4)return {stop:'cycle',ids:ids};
    if(seen[cur])return {stop:'cycle',ids:ids};
    if(!listNode(cur))return {stop:'bad_ref',ids:ids};
    seen[cur]=1;ids.push(cur);
    cur=map[cur];
    if(cur==null)return {stop:'wild',ids:ids};
  }
  return {stop:'NULL',ids:ids};
}
/* 双向链表判定: next 链升序至 NULL, prev 链恰为其镜像 (TAIL 起, 头节点 prev=NULL)。
   返回 {ok,stage:''|'next'|'prev',fail,cycle} */
function dlistWalk(next,prev){
  var res={ok:false,stage:'next',fail:'',cycle:false};
  var fw=listWalk(next);
  if(!fw.ok){res.fail=fw.fail;res.cycle=fw.cycle;return res;}
  var f=chainWalk(next,'HEAD');
  var b=chainWalk(prev,'TAIL');
  res.stage='prev';
  if(b.stop!=='NULL'){
    res.fail=(b.stop==='wild_start')?'wild_tail':b.stop;
    res.cycle=(b.stop==='cycle');return res;
  }
  if(b.ids.length!==f.ids.length){res.fail='short';return res;}
  for(var i=0;i<f.ids.length;i++)
    if(b.ids[i]!==f.ids[f.ids.length-1-i]){res.fail='mirror';return res;}
  res.ok=true;res.stage='';return res;
}

/* ---- 谜题3 · Boss: 环形队列神庙 (Circular Queue, §10.2) ----
   转盘祭坛: 4 个座位排成一圈。front/rear 两根指示臂顺时针推进:
     front = 等得最久的朝圣者(下一个被传唤); rear = 下一个空位(新人入座处)。
   核心教学陷阱: 光看 front===rear 分不清"全空"还是"坐满", 因此额外维护 count。
   朝圣者事件流 CQ_EVENTS 里, 'a'=朝圣者抵达(要 enqueue), 'c'=钟声传唤(要 dequeue)。
   多数步骤没有歧义, 系统自动执行; 只有"坛满又来人"或"坛空又传唤"这两种
   情况需要玩家亲手裁决——全对开门, 错 2 次重来(与其它谜题一致)。 */
var CQ_CAP=4;
function cqNew(cap){return {buf:new Array(cap||CQ_CAP).fill(null),front:0,rear:0,count:0,cap:cap||CQ_CAP};}
function cqIsFull(st){return st.count>=st.cap;}
function cqIsEmpty(st){return st.count===0;}
/* enqueue: 满则不改状态, 返回 fail='full'; 否则在 rear 落座, rear 顺时针 +1(mod cap) */
function cqEnqueue(st,name){
  if(cqIsFull(st))return {ok:false,fail:'full'};
  st.buf[st.rear]=name;st.rear=(st.rear+1)%st.cap;st.count++;
  return {ok:true};
}
/* dequeue: 空则不改状态, 返回 fail='empty'; 否则请出 front, front 顺时针 +1(mod cap) */
function cqDequeue(st){
  if(cqIsEmpty(st))return {ok:false,fail:'empty'};
  var name=st.buf[st.front];st.buf[st.front]=null;st.front=(st.front+1)%st.cap;st.count--;
  return {ok:true,name:name};
}

/* 试炼事件流(依次抵达/传唤); 数组下标 4/11/16 是三个"判定点"
   (坛满又来人 → 正解 'reject'; 坛空又传唤 → 正解 'idle'), 其余步骤自动执行。 */
var CQ_EVENTS=[
  {t:'a',n:'ps'},{t:'a',n:'sh'},{t:'a',n:'vi'},{t:'a',n:'cc'},   // 0-3 四坛坐满
  {t:'a',n:'awk'},                                                // 4  判定点1: 满→reject
  {t:'c'},                                                        // 5  送走 ps
  {t:'a',n:'ed'},                                                 // 6  再度坐满
  {t:'c'},{t:'c'},{t:'c'},{t:'c'},                                 // 7-10 送走 sh,vi,cc,ed→坛空
  {t:'c'},                                                        // 11 判定点2: 空→idle
  {t:'a',n:'dd'},{t:'a',n:'top'},{t:'a',n:'cron'},{t:'a',n:'init'}, // 12-15 再度坐满
  {t:'a',n:'ps'},                                                 // 16 判定点3: 满→reject(重名朝圣者一视同仁)
  {t:'c'},{t:'c'},{t:'c'},{t:'c'}                                  // 17-20 收尾, 坛空
];
/* 逐步执行事件流。choices[] 是玩家在"判定点"依次给出的动作('reject'|'idle'),
   按判定点出现顺序对应。返回 {ok,errors,expected,need,log,final} */
function cqTrialRun(events,cap,choices){
  var st=cqNew(cap),ci=0,errors=0,expected=[],log=[];
  for(var k=0;k<events.length;k++){
    var ev=events[k];
    if(ev.t==='a'){
      if(!cqIsFull(st)){
        cqEnqueue(st,ev.n);
        log.push({i:k,kind:'auto-enq',name:ev.n,front:st.front,rear:st.rear,count:st.count});
      }else{
        expected.push('reject');
        var got=choices[ci++];
        if(got!=='reject')errors++;
        log.push({i:k,kind:'decision-full',name:ev.n,want:'reject',got:got,front:st.front,rear:st.rear,count:st.count});
      }
    }else{
      if(!cqIsEmpty(st)){
        var r=cqDequeue(st);
        log.push({i:k,kind:'auto-deq',name:r.name,front:st.front,rear:st.rear,count:st.count});
      }else{
        expected.push('idle');
        var got2=choices[ci++];
        if(got2!=='idle')errors++;
        log.push({i:k,kind:'decision-empty',want:'idle',got:got2,front:st.front,rear:st.rear,count:st.count});
      }
    }
  }
  return {ok:(errors===0&&ci===choices.length),errors:errors,expected:expected,need:ci,log:log,final:{front:st.front,rear:st.rear,count:st.count}};
}

/* ★挑战版: 先知的账本——只给一串 enqueue/dequeue 操作日志(不给动画过程),
   问最终 front/rear/count。E 遇满静默丢弃(等同 reject), D 遇空静默跳过(等同 idle)。 */
var CQ_CHAL_CAP=4;
var CQ_CHAL_LOG=[
  {op:'E',n:'ps'},{op:'E',n:'sh'},{op:'E',n:'vi'},{op:'D'},
  {op:'E',n:'cc'},{op:'E',n:'ed'},{op:'D'},{op:'D'},
  {op:'E',n:'dd'},{op:'D'}
];
function cqReplay(logOps,cap){
  var st=cqNew(cap);
  for(var i=0;i<logOps.length;i++){
    var o=logOps[i];
    if(o.op==='E')cqEnqueue(st,o.n);else cqDequeue(st);
  }
  var contents=[];
  for(var c=0;c<st.count;c++)contents.push(st.buf[(st.front+c)%st.cap]);
  return {front:st.front,rear:st.rear,count:st.count,contents:contents};
}

/* ================================================================
   0b. RESERVED FOR A2 —— LRU 缓存置换 (原 Boss 谜题, 已从 AS 可达内容摘除)
   页面置换/LRU 属 A2 §16。判定函数与★挑战(OPT/Belady)整套原样保留,
   供未来 A2 kernel 模块的渲染层直接复用; 本文件不再从 puzzles[] 引用它们。
   ================================================================ */
var LRU_CAP=4;
var LRU_SEQ=['ps','sh','vi','cc','awk','sh','ed','cc','dd'];
function lruNew(){return {recency:[]};}        // recency[0]=最久未用(LRU) … 末尾=MRU
/* 访问 p: 命中→续香火(移到 MRU 端); 未满→入驻; 满且未命中→需淘汰(不改状态) */
function lruAccess(st,p){
  var i=st.recency.indexOf(p);
  if(i>=0){st.recency.splice(i,1);st.recency.push(p);return {hit:true,evict:false};}
  if(st.recency.length<LRU_CAP){st.recency.push(p);return {hit:false,evict:false};}
  return {hit:false,evict:true};
}
function lruVictim(st){return st.recency[0];}
function lruEvict(st,victim,p){
  var i=st.recency.indexOf(victim);
  if(i<0)return false;
  st.recency.splice(i,1);st.recency.push(p);return true;
}
/* 整局判定: choices=玩家的淘汰选择序列。无论选对选错, 世界线按正解推进
   (与 UI 一致: 选错记 1 错并纠正)。返回 {ok,errors,expected,need} */
function lruRun(seq,choices){
  var st=lruNew(),ci=0,errors=0,expected=[];
  for(var k=0;k<seq.length;k++){
    var r=lruAccess(st,seq[k]);
    if(r.evict){
      var v=lruVictim(st);expected.push(v);
      if(choices[ci++]!==v)errors++;
      lruEvict(st,v,seq[k]);
    }
  }
  return {ok:(errors===0&&ci===choices.length),errors:errors,expected:expected,need:ci};
}

/* ★挑战版: 同庙换队, 3 座祭坛, 问 OPT(Belady 最优) 共缺页几次。
   经典 Belady 序列: LRU=10 次 / OPT=7 次。 */
var OPT_SEQ=['sh','ps','vi','cc','sh','ps','ed','sh','ps','vi','cc','ed'];
var OPT_CAP=3;
function pageFaults(seq,cap,policy){    // policy: 'OPT' | 'LRU'
  var cache=[],rec=[],faults=0;
  for(var k=0;k<seq.length;k++){
    var p=seq[k],i=cache.indexOf(p);
    if(i>=0){var ri=rec.indexOf(p);rec.splice(ri,1);rec.push(p);continue;}
    faults++;
    if(cache.length<cap){cache.push(p);rec.push(p);continue;}
    var victim;
    if(policy==='LRU'){victim=rec[0];}
    else{  // OPT: 淘汰未来最晚再用(或不再用)者
      var best=0,bestDist=-1;
      for(var c=0;c<cache.length;c++){
        var d=Infinity;
        for(var j=k+1;j<seq.length;j++)if(seq[j]===cache[c]){d=j;break;}
        if(d===Infinity){best=c;bestDist=Infinity;break;}
        if(d>bestDist){bestDist=d;best=c;}
      }
      victim=cache[best];
    }
    cache.splice(cache.indexOf(victim),1);cache.push(p);
    var vr=rec.indexOf(victim);if(vr>=0)rec.splice(vr,1);
    rec.push(p);
  }
  return faults;
}
function optFaults(seq,cap){return pageFaults(seq,cap,'OPT');}
function lruFaults(seq,cap){return pageFaults(seq,cap,'LRU');}

/* ================================================================
   1. 小工具 (与 domain_logic.js 同款)
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
function STEP(api,id){try{api&&api.completeStep&&api.completeStep(id);}catch(e){}}
function GIVE(api,id,name){try{api&&api.giveItem&&api.giveItem(id,T(name));}catch(e){}}
function HAS(api,id){try{return !!(api&&api.hasItem&&api.hasItem(id));}catch(e){return false;}}

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
var TXT='color:#bfeebf;font-size:13px;line-height:1.7;';
var DIM='color:#4a7a4a;font-size:11.5px;';
var K='color:#ffce3a;';

/* 提示系统: 三段递进; onKey('?') 亦可触发; .max() 直接跳到末段(近乎给答案) */
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
  next.max=function(){idx=hints.length-2;next();};
  btn.onclick=next;
  hintFns[pid]=next;
}
/* 失败计数: 达到 2 次自动把提示升到末段 */
function bumpFail(api,key,pid){
  var n=(FLAG(api,key)||0)+1;SET(api,key,n);
  if(n>=2&&hintFns[pid]&&hintFns[pid].max){
    hintFns[pid].max();
    TOAST(api,B('Hints auto-upgraded — check the gold box (or press ?).',
                '提示已自动升级——看金色框 (或按 ? 键)。'));
  }
  return n;
}
function header(el,title,sub){
  mk(el,'div','color:#9fee9f;letter-spacing:2px;font-size:14px;border-bottom:1px solid #1f3f1f;'+
    'padding-bottom:6px;margin-bottom:8px;',title+
    (sub?' <span style="'+DIM+'float:right;">'+sub+'</span>':''));
}
/* 两个修复类谜题都完成后, 推进主线第 2 步并解锁神庙 */
function afterFix(api){
  if(FLAG(api,'mem_stack_done')&&FLAG(api,'mem_list_done')){
    STEP(api,'mem_m2');
    TOAST(api,B('A stone door groans awake to the north — one seal on the Circular Queue Temple just released.',
                '北方传来石门苏醒的轰响——环形队列神庙 (Circular Queue Temple) 的封印退了一层。'),true);
  }
}

/* ================================================================
   2. 谜题 1 · 栈书库 (§10.4 Stack)
   ================================================================ */
function renderStack(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:440px;max-width:620px;'+TXT);
  header(wrap,tx('The Stack Library · Top-Entry Tower','栈书库 · 万事走塔顶'),'SEG .stack');

  if(FLAG(api,'mem_stack_done')){
    mk(wrap,'div','',
      tx('Three books sit at the delivery slot in perfect slip-order. The tower settles, quiet as a clean function return.<br>'+
         '<span style="'+DIM+'">Fine print on the tower: LIFO — last in, first out. Much like overtime.</span>',
         '三本书按借阅单整整齐齐码在出书口。书库塔安静下来, 像一次干净的函数返回 (return)。<br>'+
         '<span style="'+DIM+'">塔身刻着小字: LIFO——后进先出 (last in, first out)。像极了加班。</span>'));
    var bar=mk(wrap,'div','margin-top:10px;display:flex;gap:10px;');
    if(FLAG(api,'mem_challenge_1')){
      mk(wrap,'div','margin-top:8px;'+K+'font-size:12px;',
        tx('★ Challenge cleared: the Five-Book Tower (9-move optimum, you fit in 11).',
           '★ 挑战已通关: 五重书塔 (最优 9 步, 上限 11 步)。'));
    }else{
      mk(bar,'button',BTN_GOLD,tx('★ Challenge: Five-Book Tower','★ 挑战: 五重书塔')).onclick=function(){renderStackChal(el,api);};
    }
    mk(bar,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }

  mk(wrap,'div','',
    tx('The library is a <span style="'+K+'">stack</span>: books enter and leave through the <span style="'+K+'">top only</span> — '+
       'PUSH and POP, no third verb exists. Granny malloc\'s slip is nailed to the tower:<br>'+
       '<span style="'+K+'">① Chronicles of the Heap → ② Recursion Canyon Gazetteer → ③ The LIFO Codex</span><br>'+
       '<span style="'+DIM+'">A return cart idles nearby — also a stack, good for shuffling. Granny\'s note: '+
       '"Deliver one book out of order and you re-shelve EVERYTHING. Don\'t ask. The ledger must not lie."</span>',
       '书库是一座<span style="'+K+'">栈 (stack)</span>: 书只能从<span style="'+K+'">塔顶 (top)</span> 放入或取出——'+
       'PUSH 与 POP, 没有第三种动作。塔上钉着 malloc 婆婆的借阅单:<br>'+
       '<span style="'+K+'">① 《堆区编年史》 → ② 《递归峡谷志》 → ③ 《LIFO 圣典》</span><br>'+
       '<span style="'+DIM+'">旁边停着一辆归还车, 也是一个栈——可以临时倒腾。婆婆的字条: '+
       '「顺序错一本, 全部重排。别问。账不能乱。」</span>'));

  var st=stackNew(),demoBusy=false;
  var board=mk(wrap,'div','margin:12px 0;display:flex;gap:14px;align-items:flex-end;');
  var ctl=mk(wrap,'div','display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px;');
  var msg=mk(wrap,'div','min-height:20px;font-size:12px;color:#ffce3a;');

  function pile(title,arr,hot){
    var col=mk(null,'div','flex:1;border:1px solid #1f3f1f;background:rgba(10,20,10,.45);padding:8px;min-height:120px;display:flex;flex-direction:column;');
    mk(col,'div',DIM+'margin-bottom:6px;letter-spacing:1px;',title);
    var inner=mk(col,'div','display:flex;flex-direction:column-reverse;gap:4px;flex:1;justify-content:flex-start;');
    if(!arr.length)mk(inner,'div','color:#2f4f2f;font-size:11px;text-align:center;padding:6px 0;',tx('(empty)','(空)'));
    arr.forEach(function(id,i){
      var top=(i===arr.length-1);
      mk(inner,'div','border:1px solid '+(top&&hot?'#7CFC00':'#2f6f2f')+';padding:3px 6px;font-size:12px;text-align:center;'+
        (top&&hot?'color:#7CFC00;box-shadow:0 0 6px #2b6;':'color:#8fbf8f;'),
        T(BOOK_NAMES[id])+(top?' <span style="'+DIM+'">'+tx('◂top','◂顶')+'</span>':''));
    });
    return col;
  }
  function resetAll(why){st=stackNew();S(api,'err');msg.innerHTML=why;draw();}
  function doOp(op,silent){
    if(demoBusy&&!silent)return;
    var r=stackMove(st,op);
    if(r.ok){
      S(api,'step');if(!silent)msg.textContent='';
      if(r.done){
        SET(api,'mem_stack_done');S(api,'ok');
        TOAST(api,B('Granny crosses out three ledger lines: "Borrowed. Remember to give them back."',
                    '婆婆在账簿上勾掉三行: 「借出。拿了记得还。」'),true);
        afterFix(api);renderStack(el,api);return;
      }
      draw();return;
    }
    if(r.fail==='empty'){S(api,'err');msg.textContent=tx('✗ Empty stack. You POP the air. The air declines to comment.',
      '✗ 空栈。你对着空气 POP 了一下, 空气没有理你。');return;}
    if(r.fail==='wrong'){
      bumpFail(api,'mem_stack_fails','mem_stack');
      resetAll(tx('✗ Granny\'s glasses slide down her nose: "Slot '+(st.out.length+1)+' on the slip is NOT '+T(BOOK_NAMES[r.book])+
        '. A book off the shelf counts as read — <b>re-shelve everything</b>."',
        '✗ 婆婆的老花镜滑到鼻尖: 「借阅单第 '+(st.out.length+1)+' 位要的不是'+T(BOOK_NAMES[r.book])+
        '。书出了架就算脏了——<b>全部重排</b>。」'));return;
    }
    if(r.fail==='limit'){
      bumpFail(api,'mem_stack_fails','mem_stack');
      resetAll(tx('✗ Move '+STACK_LIMIT+' reached. Granny raps the counter: "Storage fees start now. Again — think first, move second."',
        '✗ 你倒腾到第 '+STACK_LIMIT+' 步, 婆婆敲了敲柜台: 「再挪就要收仓储费了。重来, 这次先想后动。」'));return;
    }
  }
  function draw(){
    board.innerHTML='';
    board.appendChild(pile(tx('Main stack · The Tower','主栈 · 书库塔'),st.main,true));
    board.appendChild(pile(tx('Temp stack · Return cart','临时栈 · 归还车'),st.temp,true));
    var outCol=mk(board,'div','flex:1.2;border:1px dashed #c9a24a;background:rgba(40,30,5,.25);padding:8px;min-height:120px;');
    mk(outCol,'div',DIM+'margin-bottom:6px;letter-spacing:1px;color:#c9a24a;',tx('Delivery slot · slip order','出书口 · 按单交付'));
    STACK_TARGET.forEach(function(id,i){
      var got=st.out[i];
      mk(outCol,'div','font-size:12px;padding:2px 0;'+(got?'color:#7CFC00;':'color:#5a5a3a;'),
        (i+1)+'. '+T(BOOK_NAMES[id])+(got?' ✓':''));
    });
    ctl.innerHTML='';
    [['MT',tx('Main → Temp','主栈 → 临时')],
     ['TM',tx('Temp → Main','临时 → 主栈')],
     ['MO',tx('POP Main → deliver','取出 主栈顶')],
     ['TO',tx('POP Temp → deliver','取出 临时栈顶')]].forEach(function(p){
      mk(ctl,'button',(p[0]==='MO'||p[0]==='TO')?BTN_HOT:BTN,p[1]).onclick=function(){doOp(p[0]);};
    });
    mk(ctl,'span',DIM+'margin-left:6px;',tx('moves ','步数 ')+st.moves+' / '+STACK_LIMIT);
  }
  draw();

  /* ---- 婆婆亲手演示 (保证跟着做必成) ---- */
  var demoBar=mk(wrap,'div','margin-top:6px;display:flex;gap:10px;');
  mk(demoBar,'button',BTN,tx('☞ Ask Granny to demonstrate','☞ 请婆婆演示一次')).onclick=function(){
    if(demoBusy)return;demoBusy=true;
    st=stackNew();draw();
    var script=[
      [null,B('Granny shoos your hands off: "Watch. Once."','婆婆挪开你的手: 「看好, 只此一遍。」')],
      ['MT',B('"Slip item ① is buried under the Codex. Top book moves first — PUSH it onto the return cart."',
              '「单上第 ① 本被圣典压着——顶上那本先请走: PUSH 到归还车。」')],
      ['MO',B('"Now the tower top IS slip item ①. POP — deliver."',
              '「现在塔顶正好是单上第 ① 本。POP——交付。」')],
      [null,B('"Two moves left, same idea: <b>POP the tower top</b> (item ②), then <b>POP the cart top</b> (item ③). Your turn. Mess it up and we simply re-shelve."',
              '「剩下两步一个道理: <b>取出主栈顶</b>(第②本), 再<b>取出归还车顶</b>(第③本)。你来。错了也不怕, 重排就是。」')]
    ];
    var i=0;
    (function tick(){
      if(i>=script.length){demoBusy=false;return;}
      var step=script[i++];
      msg.innerHTML='<span style="color:#e8c46a;">'+T(step[1])+'</span>';
      if(step[0])doOp(step[0],true);
      S(api,'ui');
      setTimeout(tick,1400);
    })();
  };
  mk(demoBar,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};

  addHints(wrap,'mem_stack',[
    B('Recap — a stack only ever lets you touch the <b>TOP</b> item, never the middle. Picture plates stacked in a cupboard: lift the top one off (POP), or set a clean one on top (PUSH). Reach for a plate underneath and the whole pile crashes. That is the entire rule of a stack. (📖 See "Stack" in the Codex for the full write-up.)',
      '复习一下: 栈 (stack) 永远只让你碰最上面那个, 碰不到中间。想象橱柜里叠的一摞盘子: 拿走最上面的(POP), 或者把干净盘子放最上面(PUSH)。想从中间抽一个, 整摞就塌了。这就是栈的全部规矩。(📖 想细看, 翻图鉴里的「Stack」条目。)'),
    B('Apply it here: the book you must deliver FIRST (Chronicles of the Heap) is buried under the book you must deliver LAST (The LIFO Codex). You can\'t reach through the tower — so temporarily <b>PUSH the top book onto the return cart</b> (your second, "temp" stack). That uncovers the book you actually need, and you POP it back later.',
      '用到这题上: 你第一个要交的书(《堆区编年史》)被最后才要交的《LIFO 圣典》压在最上面。你穿不过塔身去拿它, 所以先把顶上那本 <b>PUSH 到归还车(第二个"临时"栈)</b>——这样才能露出你真正要的那本, 之后再把它 POP 回来。'),
    B('Answer, 4 moves: ① Main→Temp (Codex) ② POP Main (Chronicles of the Heap) ③ POP Main (Recursion Canyon Gazetteer) ④ POP Temp (Codex). Limit is 12 — room to regret twice.',
      '答案 4 步: ① 主栈→临时(圣典) ② 取出主栈顶(堆区编年史) ③ 取出主栈顶(递归峡谷志) ④ 取出临时栈顶(圣典)。上限 12 步, 足够你反悔两回。')
  ]);
}

/* ---- ★挑战: 五重书塔 (更长序列 + 收紧步数) ---- */
function renderStackChal(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:460px;max-width:640px;'+TXT);
  header(wrap,tx('★ Challenge · Five-Book Tower','★ 挑战 · 五重书塔'),'SEG .stack+');
  mk(wrap,'div','',
    tx('Granny slides over a longer slip, and a meaner one: <span style="'+K+'">5 books, 11 moves max</span> (optimum is 9).<br>'+
       '<span style="'+DIM+'">"My record is nine. Storage fees are real this time." Optional — walk away and the main quest won\'t mind.</span>',
       '婆婆推来一张更长、也更刻薄的借阅单: <span style="'+K+'">5 本书, 步数上限 11</span> (最优 9 步)。<br>'+
       '<span style="'+DIM+'">「我的纪录是九步。这次仓储费是真的。」纯选做——转身就走, 主线不会介意。</span>'));

  var st=stack2New();
  var board=mk(wrap,'div','margin:12px 0;display:flex;gap:14px;align-items:flex-end;');
  var ctl=mk(wrap,'div','display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px;');
  var msg=mk(wrap,'div','min-height:20px;font-size:12px;color:#ffce3a;');

  function pile(title,arr){
    var col=mk(null,'div','flex:1;border:1px solid #1f3f1f;background:rgba(10,20,10,.45);padding:8px;min-height:150px;display:flex;flex-direction:column;');
    mk(col,'div',DIM+'margin-bottom:6px;letter-spacing:1px;',title);
    var inner=mk(col,'div','display:flex;flex-direction:column-reverse;gap:4px;flex:1;justify-content:flex-start;');
    if(!arr.length)mk(inner,'div','color:#2f4f2f;font-size:11px;text-align:center;padding:6px 0;',tx('(empty)','(空)'));
    arr.forEach(function(id,i){
      var top=(i===arr.length-1);
      mk(inner,'div','border:1px solid '+(top?'#7CFC00':'#2f6f2f')+';padding:3px 6px;font-size:11.5px;text-align:center;'+
        (top?'color:#7CFC00;':'color:#8fbf8f;'),T(BOOK_NAMES[id]));
    });
    return col;
  }
  function reset(why){st=stack2New();S(api,'err');msg.innerHTML=why;draw();}
  function doOp(op){
    var r=stack2Move(st,op);
    if(r.ok){
      S(api,'step');msg.textContent='';
      if(r.done){
        SET(api,'mem_challenge_1');S(api,'quest');
        TOAST(api,B('Granny puts down her pen and looks at you — actually looks: "…That was my speed, when I was young. The ledger is yours to read. One page."',
                    'malloc 婆婆放下笔, 第一次正眼看你: 「……我年轻时也就这个速度。账簿借你翻, 就一页。」'),true);
        renderStack(el,api);return;
      }
      draw();return;
    }
    if(r.fail==='empty'){S(api,'err');msg.textContent=tx('✗ Empty stack.','✗ 空栈。');return;}
    if(r.fail==='wrong'){reset(tx('✗ Wrong book for slot '+(st.out.length+1)+'. Re-shelve all five. Granny doesn\'t even look up.',
      '✗ 第 '+(st.out.length+1)+' 位交错书。五本全部重排。婆婆头都没抬。'));return;}
    if(r.fail==='limit'){reset(tx('✗ Move '+STACK2_LIMIT+'. "Storage fee: one full re-shelve." Plan the cart before you touch it.',
      '✗ 第 '+STACK2_LIMIT+' 步用尽。「仓储费: 重排一次。」动手前先在纸上排好归还车。'));return;}
  }
  function draw(){
    board.innerHTML='';
    board.appendChild(pile(tx('Main stack','主栈'),st.main));
    board.appendChild(pile(tx('Temp stack','临时栈'),st.temp));
    var outCol=mk(board,'div','flex:1.3;border:1px dashed #c9a24a;background:rgba(40,30,5,.25);padding:8px;min-height:150px;');
    mk(outCol,'div',DIM+'margin-bottom:6px;color:#c9a24a;',tx('Delivery slot','出书口'));
    STACK2_TARGET.forEach(function(id,i){
      var got=st.out[i];
      mk(outCol,'div','font-size:11.5px;padding:2px 0;'+(got?'color:#7CFC00;':'color:#5a5a3a;'),
        (i+1)+'. '+T(BOOK_NAMES[id])+(got?' ✓':''));
    });
    ctl.innerHTML='';
    [['MT',tx('Main → Temp','主栈 → 临时')],
     ['TM',tx('Temp → Main','临时 → 主栈')],
     ['MO',tx('POP Main → deliver','取出 主栈顶')],
     ['TO',tx('POP Temp → deliver','取出 临时栈顶')]].forEach(function(p){
      mk(ctl,'button',(p[0]==='MO'||p[0]==='TO')?BTN_HOT:BTN,p[1]).onclick=function(){doOp(p[0]);};
    });
    mk(ctl,'span',DIM+'margin-left:6px;',tx('moves ','步数 ')+st.moves+' / '+STACK2_LIMIT);
  }
  draw();
  mk(wrap,'div',DIM+'margin-top:6px;',
    tx('Cold tip: every move must earn its keep. Park books on the cart only while something beneath them is due.',
       '小抄: 每一步都得花在刀刃上。只有目标书被压着的时候, 才值得往归还车上倒。'));
  var foot=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;');
  mk(foot,'button',BTN,tx('Back','返回')).onclick=function(){renderStack(el,api);};
  mk(foot,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
}

/* ================================================================
   3. 谜题 2 · 指针接骨 (§10.4 Linked List)
   ================================================================ */
function snakeShow(host){
  var box=mk(host,'div','margin:8px 0;padding:8px;border:1px solid #7a2f2f;background:rgba(40,5,5,.4);text-align:center;');
  var pre=mk(box,'pre','margin:0;color:#ff9c9c;font-size:14px;line-height:1.3;font-family:inherit;','');
  var cap=mk(box,'div','color:#ffce3a;font-size:12px;margin-top:4px;',
    tx('OUROBOROS.EXE engaged — cycle detected!','衔尾蛇协议 OUROBOROS.EXE 启动——检测到环 (cycle)!'));
  var frames=[
    '  ╭──●──╮\n  │     │\n  ╰──○──╯',
    '  ╭──○──╮\n  │     ●\n  ╰──○──╯',
    '  ╭──○──╮\n  │     │\n  ╰──●──╯',
    '  ╭──○──╮\n  ●     │\n  ╰──○──╯'
  ];
  var i=0,n=0;
  var tm=setInterval(function(){
    pre.textContent=frames[i++%frames.length];
    if(++n>=10){
      clearInterval(tm);
      pre.textContent=tx('  ╭──∞──╮\n  │ BITE │\n  ╰─────╯','  ╭──∞──╮\n  │咬住了│\n  ╰─────╯');
      cap.innerHTML=tx('The snake bit its own tail.<br><span style="'+DIM+'">Snark: this list is now a perpetual-motion machine. '+
        'The poor process traversing it has done three laps, still convinced NULL is just around the corner.</span>',
        '蛇咬住了自己的尾巴。<br><span style="'+DIM+'">吐槽: 这条链表现在是永动机。'+
        '正在遍历它的那个进程已经跑了三圈, 还坚信 NULL 就在下一节。</span>');
    }
  },130);
  return box;
}

function renderList(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:480px;max-width:660px;'+TXT);
  header(wrap,tx('Broken Chain Cloister · Pointer Surgery','断链回廊 · 指针接骨'),'SEG .heap');

  if(FLAG(api,'mem_list_done')){
    mk(wrap,'div','',
      tx('Five vertebrae click end to end; the data flows downhill: <span style="'+K+'">7 → 23 → 42 → 64 → 91 → NULL</span>.<br>'+
         '<span style="'+DIM+'">The addresses are still scattered all over the heap — the list could not care less. '+
         'Linked lists know each other by pointer, not by postcode.</span>',
         '五块节点骨骼首尾相衔, 数据顺流而下: <span style="'+K+'">7 → 23 → 42 → 64 → 91 → NULL</span>。<br>'+
         '<span style="'+DIM+'">地址 (address) 依旧东一块西一块——链表毫不在意。它靠指针 (pointer) 相认, 不靠住址。</span>'));
    var bar=mk(wrap,'div','margin-top:10px;display:flex;gap:10px;');
    if(FLAG(api,'mem_challenge_2')){
      mk(wrap,'div','margin-top:8px;'+K+'font-size:12px;',
        tx('★ Challenge cleared: the chain is doubly linked — it can finally look back.',
           '★ 挑战已通关: 双向链表 (doubly linked list) 接通——链表终于能回头看了。'));
    }else{
      mk(bar,'button',BTN_GOLD,tx('★ Challenge: Doubly Linked','★ 挑战: 双向链表')).onclick=function(){renderListChal(el,api);};
    }
    mk(bar,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }

  mk(wrap,'div','',
    tx('The remains of a <span style="'+K+'">linked list</span> lie across the cloister: 5 nodes, each owning exactly two things — '+
       'a <span style="'+K+'">data value</span> and a <span style="'+K+'">next pointer</span>. Every pointer has gone feral, aimed at static.<br>'+
       '<span style="'+DIM+'">Surgery protocol: click a next port (or HEAD) to pick it up, then click the node it should point to (or the NULL pedestal). '+
       'Goal: data in ascending order, tail pointing to NULL.</span>',
       '一具<span style="'+K+'">链表 (linked list)</span> 的残骸摊在回廊里: 5 个节点 (node), 每个节点只有两样东西——'+
       '<span style="'+K+'">数据 (data)</span> 与 <span style="'+K+'">next 指针</span>。指针全野了, 指向乱码深渊。<br>'+
       '<span style="'+DIM+'">接骨规程: 先点一个 next 接口(或 HEAD)提起, 再点它该指向的节点(或 NULL 石座)。'+
       '目标: 数据升序 (ascending) 串起, 尾节点指 NULL。</span>'));

  var next={HEAD:null};
  LIST_NODES.forEach(function(n){next[n.id]=null;});
  var sel=null;
  var board=mk(wrap,'div','margin:12px 0;');
  var msg=mk(wrap,'div','min-height:20px;font-size:12px;color:#ffce3a;');
  var fx=mk(wrap,'div','');

  function label(v){
    if(v==null)return '<span style="color:#ff8080;">'+tx('?? wild','?? 野指针')+'</span>';
    if(v==='NULL')return '<span style="color:#39d0ff;">NULL</span>';
    return '<span style="color:#ffce3a;">'+listNode(v).addr+'</span>';
  }
  function draw(){
    board.innerHTML='';
    var top=mk(board,'div','display:flex;gap:8px;align-items:stretch;flex-wrap:wrap;');
    var hd=mk(top,'div','border:1px solid '+(sel==='HEAD'?'#7CFC00':'#2f6f2f')+';padding:6px 8px;'+
      'background:rgba(10,20,10,.55);cursor:pointer;'+(sel==='HEAD'?'box-shadow:0 0 8px #2b6;':''),
      '<div style="'+DIM+'">'+tx('register','寄存器')+'</div><b style="color:#9fee9f;">HEAD</b>'+
      '<div style="font-size:11px;margin-top:3px;">next → '+label(next.HEAD)+'</div>');
    hd.onclick=function(){sel='HEAD';S(api,'ui');
      msg.textContent=tx('HEAD picked up — now click the node it should point to.','HEAD 已提起——点它该指向的节点。');draw();};
    LIST_NODES.forEach(function(n){
      var card=mk(top,'div','border:1px solid #2f6f2f;padding:6px 8px;background:rgba(10,20,10,.55);min-width:88px;');
      var head=mk(card,'div','cursor:pointer;',
        '<div style="'+DIM+'">'+n.addr+'</div><b style="color:#bfeebf;font-size:15px;">'+n.val+'</b>');
      head.title=tx('As target: attach the picked pointer to this node','作为目标: 把提起的指针接到这个节点');
      head.onclick=function(){
        if(sel==null){msg.textContent=tx('Pick up a next port first, then click a target.','先点一个 next 接口提起, 再点目标。');return;}
        next[sel]=n.id;S(api,'step');msg.textContent='';sel=null;draw();
      };
      var port=mk(card,'div','margin-top:4px;border-top:1px dashed #1f3f1f;padding-top:3px;font-size:11px;cursor:pointer;'+
        (sel===n.id?'outline:1px solid #7CFC00;':''),
        'next → '+label(next[n.id]));
      port.title=tx('As source: pick up this node\'s next pointer','作为源: 提起这个节点的 next 指针');
      port.onclick=function(){sel=n.id;S(api,'ui');
        msg.textContent=tx('['+n.addr+'] next picked up — click its target node, or NULL.','['+n.addr+'] 的 next 已提起——点目标节点或 NULL。');draw();};
    });
    var nl=mk(top,'div','border:1px solid #1f3f5f;padding:6px 8px;background:rgba(5,10,25,.55);cursor:pointer;',
      '<div style="'+DIM+'">'+tx('pedestal','石座')+'</div><b style="color:#39d0ff;">NULL</b>'+
      '<div style="'+DIM+'margin-top:3px;">'+tx('end of chain','链之尽头')+'</div>');
    nl.onclick=function(){
      if(sel==null){msg.textContent=tx('Pick up a next port first, then press it into the NULL pedestal.','先提起一个 next, 再把它按进 NULL 石座。');return;}
      if(sel==='HEAD'){msg.textContent=tx('HEAD → NULL? The whole list would vanish on the spot. Granny WILL bill you.',
        'HEAD 指 NULL? 那这条链表就地失踪。婆婆会记你一笔的。');return;}
      next[sel]='NULL';S(api,'step');msg.textContent='';sel=null;draw();
    };
  }
  draw();

  var foot=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;');
  mk(foot,'button',BTN_HOT,tx('▶ Run traversal (HEAD → NULL)','▶ 运行遍历 (从 HEAD 走到 NULL)')).onclick=function(){
    fx.innerHTML='';
    var r=listWalk(next);
    if(r.ok){
      SET(api,'mem_list_done');S(api,'ok');
      TOAST(api,B('Click, click, click — five vertebrae bite down in turn. The list wakes up and stretches into a glowing stream.',
                  '咔、咔、咔——五节脊椎依次咬合。链表活了过来, 舒展成一条发光的溪流。'),true);
      afterFix(api);renderList(el,api);return;
    }
    S(api,'err');
    bumpFail(api,'mem_list_fails','mem_list');
    if(r.cycle){
      snakeShow(fx);
      msg.innerHTML=tx('✗ Traversal never ends: the list forms a <b>cycle</b>. Someone must point to NULL, or nobody ever clocks out.',
        '✗ 遍历没有终点: 链表连成了<b>环 (cycle)</b>。总得有一节指向 NULL, 否则谁也别想下班。');
    }else if(r.fail==='wild_head'){
      msg.textContent=tx('✗ HEAD is still wild. A list with no head pointer isn\'t a list — it\'s five chunks of missing memory.',
        '✗ HEAD 还是野的。没有头指针的链表不是链表, 是五块失联的内存。');
    }else if(r.fail==='wild'){
      msg.innerHTML=tx('✗ After '+(r.order.length?('node '+r.order.length+' (data '+r.order[r.order.length-1]+')'):'a few steps')+
        ' the walk stepped on a <b>wild pointer</b> — SIGSEGV. The memorial gets a new name.',
        '✗ 走到'+(r.order.length?('第 '+r.order.length+' 节(数据 '+r.order[r.order.length-1]+')'):'半路')+
        '之后一脚踩进<b>野指针</b>——SIGSEGV, 段错误纪念碑又要加名字了。');
    }else if(r.fail==='order'){
      msg.innerHTML=tx('✗ Wrong order: the walk reads '+r.order.join(' → ')+'. It must be <b>ascending</b> — bigger every step, like a utility bill.',
        '✗ 顺序不对: 走出来是 '+r.order.join(' → ')+'。要求<b>升序 (ascending)</b>——数据要越走越大, 像账单一样。');
    }else{
      msg.innerHTML=tx('✗ Chain too short: only '+r.order.length+' / '+LIST_NODES.length+' nodes before NULL. The rest are standing there, watching you.',
        '✗ 链太短: 只串起 '+r.order.length+' / '+LIST_NODES.length+' 节就到 NULL 了。剩下的节点在原地看你。');
    }
  };
  mk(foot,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};

  addHints(wrap,'mem_list',[
    B('Recap — a linked list is a chain of "boxes" (nodes); each box holds a value plus one arrow ("next") pointing at the next box. You never need every address memorised — you only ever need to know "where do I go next". Start at <b>HEAD</b>, follow next, next, next… until you hit <b>NULL</b>, which means "end of chain". (📖 See "Linked List" in the Codex for the full write-up.)',
      '复习一下: 链表 (linked list) 是一串"箱子"连起来的; 每个箱子装一个数据值, 外加一个箭头(next), 指向下一个箱子。你不用背下所有地址, 只需要知道"接下来去哪"。从 <b>HEAD</b> 出发, 一路顺着 next 走, 直到走到 <b>NULL</b>——意思是"链到头了"。(📖 完整讲解见图鉴里的「Linked List」条目。)'),
    B('Apply it here: first sort the 5 values in your head — 7, 23, 42, 64, 91. Point HEAD at 7. Each node\'s next should point at the value one step bigger. The last one (91) must point at NULL — point it at any earlier node instead and you create a cycle (an endless loop that never reaches NULL); leave any arrow unset ("wild") and the walk crashes.',
      '用到这题上: 先在心里把 5 个数据排好序——7、23、42、64、91。HEAD 指向 7; 每个节点的 next 都指向比它大一号的那个。最后一个(91)的 next 必须指向 NULL——指回前面任何一个节点都会变成环 (cycle, 走不到头的死循环); 哪个箭头还没接(还是"野指针"), 遍历时就会直接崩溃。'),
    B('Answer: HEAD→0x0C10(7), 7→0x2A40(23), 23→0x1F08(42), 42→0x3B70(64), 64→0x2F00(91), 91→NULL. Note 42 lives at 0x1F08 — messy addresses are fine, that\'s the whole point of a linked list.',
      '答案: HEAD→0x0C10(7), 7→0x2A40(23), 23→0x1F08(42), 42→0x3B70(64), 64→0x2F00(91), 91→NULL。42 住在 0x1F08——地址乱不要紧, 链表本来就不在乎住哪儿。')
  ]);
}

/* ---- ★挑战: 双向链表 (prev + next 都要接对) ---- */
function renderListChal(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:500px;max-width:680px;'+TXT);
  header(wrap,tx('★ Challenge · Doubly Linked','★ 挑战 · 双向链表'),'SEG .heap+');
  mk(wrap,'div','',
    tx('The cloister rumbles: each node grows a second socket — <span style="'+K+'">prev</span>. '+
       'Wire <b>both directions</b>: next ascends 7→91 into NULL, prev descends 91→7 into NULL, and a new <span style="'+K+'">TAIL</span> register must point at the last node.<br>'+
       '<span style="'+DIM+'">Optional. The main quest won\'t mind. Your pride might.</span>',
       '回廊一阵轰鸣: 每个节点长出了第二个接口——<span style="'+K+'">prev</span>。'+
       '两个方向<b>都要接对</b>: next 升序 7→91 至 NULL, prev 降序 91→7 至 NULL, 新增 <span style="'+K+'">TAIL</span> 寄存器要指向末节点。<br>'+
       '<span style="'+DIM+'">纯选做。主线不介意。你的自尊心可能介意。</span>'));

  var next={HEAD:null},prev={TAIL:null};
  LIST_NODES.forEach(function(n){next[n.id]=null;prev[n.id]=null;});
  var sel=null;  // {map:'next'|'prev', key:...}
  var board=mk(wrap,'div','margin:12px 0;');
  var msg=mk(wrap,'div','min-height:20px;font-size:12px;color:#ffce3a;');
  var fx=mk(wrap,'div','');

  function label(v){
    if(v==null)return '<span style="color:#ff8080;">??</span>';
    if(v==='NULL')return '<span style="color:#39d0ff;">NULL</span>';
    return '<span style="color:#ffce3a;">'+listNode(v).addr+'</span>';
  }
  function isSel(map,key){return sel&&sel.map===map&&sel.key===key;}
  function draw(){
    board.innerHTML='';
    var top=mk(board,'div','display:flex;gap:8px;align-items:stretch;flex-wrap:wrap;');
    var hd=mk(top,'div','border:1px solid '+(isSel('next','HEAD')?'#7CFC00':'#2f6f2f')+';padding:6px 8px;background:rgba(10,20,10,.55);cursor:pointer;',
      '<div style="'+DIM+'">'+tx('register','寄存器')+'</div><b style="color:#9fee9f;">HEAD</b>'+
      '<div style="font-size:11px;margin-top:3px;">next → '+label(next.HEAD)+'</div>');
    hd.onclick=function(){sel={map:'next',key:'HEAD'};S(api,'ui');draw();};
    var tl=mk(top,'div','border:1px solid '+(isSel('prev','TAIL')?'#7CFC00':'#2f6f2f')+';padding:6px 8px;background:rgba(10,20,10,.55);cursor:pointer;',
      '<div style="'+DIM+'">'+tx('register','寄存器')+'</div><b style="color:#9fee9f;">TAIL</b>'+
      '<div style="font-size:11px;margin-top:3px;">→ '+label(prev.TAIL)+'</div>');
    tl.onclick=function(){sel={map:'prev',key:'TAIL'};S(api,'ui');draw();};
    LIST_NODES.forEach(function(n){
      var card=mk(top,'div','border:1px solid #2f6f2f;padding:6px 8px;background:rgba(10,20,10,.55);min-width:96px;');
      var head=mk(card,'div','cursor:pointer;',
        '<div style="'+DIM+'">'+n.addr+'</div><b style="color:#bfeebf;font-size:15px;">'+n.val+'</b>');
      head.onclick=function(){
        if(!sel){msg.textContent=tx('Pick up a port first (next / prev / HEAD / TAIL).','先提起一个接口 (next / prev / HEAD / TAIL)。');return;}
        (sel.map==='next'?next:prev)[sel.key]=n.id;
        S(api,'step');msg.textContent='';sel=null;draw();
      };
      var p1=mk(card,'div','margin-top:4px;border-top:1px dashed #1f3f1f;padding-top:3px;font-size:11px;cursor:pointer;'+
        (isSel('next',n.id)?'outline:1px solid #7CFC00;':''),'next → '+label(next[n.id]));
      p1.onclick=function(){sel={map:'next',key:n.id};S(api,'ui');draw();};
      var p2=mk(card,'div','margin-top:2px;font-size:11px;cursor:pointer;'+
        (isSel('prev',n.id)?'outline:1px solid #7CFC00;':''),'prev → '+label(prev[n.id]));
      p2.onclick=function(){sel={map:'prev',key:n.id};S(api,'ui');draw();};
    });
    var nl=mk(top,'div','border:1px solid #1f3f5f;padding:6px 8px;background:rgba(5,10,25,.55);cursor:pointer;',
      '<div style="'+DIM+'">'+tx('pedestal','石座')+'</div><b style="color:#39d0ff;">NULL</b>');
    nl.onclick=function(){
      if(!sel){msg.textContent=tx('Pick up a port first.','先提起一个接口。');return;}
      if(sel.key==='HEAD'||sel.key==='TAIL'){
        msg.textContent=tx('A register into NULL? The whole list vanishes. Bold, but no.','寄存器指 NULL? 整条链就地失踪。勇气可嘉, 但不行。');return;
      }
      (sel.map==='next'?next:prev)[sel.key]='NULL';
      S(api,'step');msg.textContent='';sel=null;draw();
    };
  }
  draw();

  var foot=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;');
  mk(foot,'button',BTN_HOT,tx('▶ Run both traversals','▶ 双向遍历')).onclick=function(){
    fx.innerHTML='';
    var r=dlistWalk(next,prev);
    if(r.ok){
      SET(api,'mem_challenge_2');S(api,'quest');
      TOAST(api,B('"Both directions, all correct. The chain can finally look back." — Granny malloc, shouting across the maze: "You may leave the nest."',
                  '「双向都接对了。链表终于能回头看了。」——malloc 婆婆隔着迷宫喊: 「你可以出师了。」'),true);
      renderList(el,api);return;
    }
    S(api,'err');
    if(r.cycle){snakeShow(fx);}
    var where=r.stage==='next'?tx('next chain','next 链'):tx('prev chain','prev 链');
    var why=r.cycle?tx('forms a cycle','连成了环 (cycle)')
      :r.fail==='wild_head'?tx('HEAD is wild','HEAD 还是野的')
      :r.fail==='wild_tail'?tx('TAIL is wild','TAIL 还是野的')
      :r.fail==='wild'?tx('steps on a wild pointer','踩进了野指针')
      :r.fail==='order'?tx('is not ascending','不是升序')
      :r.fail==='short'?tx('is too short','太短')
      :r.fail==='mirror'?tx('is not the exact mirror of the next chain (prev[next[x]] must be x)','不是 next 链的严格镜像 (prev[next[x]] 必须等于 x)')
      :r.fail;
    msg.innerHTML='✗ '+where+' '+why+'.';
  };
  mk(foot,'button',BTN,tx('Back','返回')).onclick=function(){renderList(el,api);};
  mk(foot,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
  mk(wrap,'div',DIM+'margin-top:6px;',
    tx('Cold tip: TAIL→91; each prev is the next arrow read backwards; 7\'s prev is NULL — the head has no one behind it.',
       '小抄: TAIL→91; 每条 prev, 就是把对应的 next 反过来读; 7 的 prev 是 NULL——头节点身后没有人。'));
}

/* ================================================================
   4. 谜题 3 · Boss: 环形队列神庙 (Circular Queue, §10.2)
   ================================================================ */
function renderTemple(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:480px;max-width:680px;'+TXT);
  header(wrap,tx('Temple of the Circular Queue','环形队列神庙'),'RING QUEUE · 4-SEAT');

  if(FLAG(api,'mem_lru_done')){
    mk(wrap,'div','',
      tx('The stone door stands open. Four seats turn steady around the ring; pilgrims arrive and are called in turn, and no seat is ever double-booked.<br>'+
         '<span style="'+DIM+'">In the shadow at the ring\'s dead centre, the socket that held the Null Pointer Shard is faintly cold — '+
         'front and rear once pointed there together, at exactly nowhere.</span>',
         '石门敞开着。四座座位沿着圆环安稳转动, 朝圣者依次抵达、依次被传唤, 从没有哪个座位被重复占用。<br>'+
         '<span style="'+DIM+'">圆环正中央的阴影里, 空指针碎片 (Null Pointer Shard) 留下的凹槽微微发凉——'+
         'front 和 rear 曾一起指向那里, 指向恰好的"无处"。</span>'));
    var bar=mk(wrap,'div','margin-top:10px;display:flex;gap:10px;');
    if(FLAG(api,'mem_challenge_3')){
      mk(wrap,'div','margin-top:8px;'+K+'font-size:12px;',
        tx('★ Challenge cleared: you read a blind operations ledger and named the final front/rear/count exactly.',
           '★ 挑战已通关: 你只看操作日志, 就精确报出了最终的 front/rear/count。'));
    }else{
      mk(bar,'button',BTN_GOLD,tx('★ Challenge: The Blind Ledger','★ 挑战: 盲算账本')).onclick=function(){renderQueueChal(el,api);};
    }
    mk(bar,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }
  if(!(FLAG(api,'mem_stack_done')&&FLAG(api,'mem_list_done'))){
    mk(wrap,'div','',
      tx('The stone door does not move. Three lines are carved on the lintel:<br>'+
         '<span style="'+K+'">"First learn to enter and leave (the stack). Then learn to be joined (the list). '+
         'Only then may you learn to turn without end (the ring)."</span><br>'+
         '<span style="'+DIM+'">A faint clockwork ticking drifts through the crack. It is waiting for you to fix the Library and the Cloister.</span>',
         '石门纹丝不动。门楣上刻着三行字:<br>'+
         '<span style="'+K+'">「先学会进出(栈 stack), 再学会相连(链 list), 方可学周而复始(环 ring)。」</span><br>'+
         '<span style="'+DIM+'">门缝里透出细微的齿轮声。它在等你修好书库塔与断链回廊。</span>'));
    mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }

  var body=mk(wrap,'div','');
  var msg=mk(wrap,'div','min-height:20px;font-size:12px;color:#ffce3a;');
  var foot=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;flex-wrap:wrap;');
  mk(foot,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};

  /* ---- 规则说明 ---- */
  function intro(){
    body.innerHTML='';
    mk(body,'div','',
      tx('The temple holds only <span style="'+K+'">4 seats</span> arranged in a ring, yet pilgrims (processes) never stop arriving. '+
         'The keeper\'s rule has nothing to do with who mattered most — only with turns:<br>'+
         '<span style="'+K+'">front</span> marks whoever has waited longest (called in next); <span style="'+K+'">rear</span> marks '+
         'the next open seat (where a new arrival sits). Both spin <b>clockwise</b>, one seat at a time, and wrap straight from '+
         'seat 3 back to seat 0 — that is what makes this a <span style="'+K+'">circular queue</span>, not a straight line.<br>'+
         '<span style="'+DIM+'">· A pilgrim arrives, a seat is open → they take the rear seat.<br>'+
         '· The bell calls the next in line → whoever sits at front steps out.<br>'+
         '· All 4 seats full and someone new arrives → there is nowhere to put them; they must be <b style="color:#ffce3a;">turned away</b>.<br>'+
         '· The ring is empty and the bell rings anyway → there is no one to call; it rings for <b style="color:#39d0ff;">no one</b>. '+
         'Two wrong calls and the keeper resets every seat.</span>',
         '神庙只有 <span style="'+K+'">4 个座位</span>, 围成一圈, 朝圣者(进程 processes)却络绎不绝。庙祝的规矩和"谁重要"无关, 只关"轮到谁":<br>'+
         '<span style="'+K+'">front</span> 指着等得最久的那位(下一个被传唤); <span style="'+K+'">rear</span> 指着下一个空位'+
         '(新人的落座处)。两根指示臂都<b>顺时针</b>走, 一次一格, 从座 3 直接绕回座 0——这就是<span style="'+K+'">环形队列</span>, '+
         '不是一条直线。<br>'+
         '<span style="'+DIM+'">· 朝圣者抵达, 有空座 → 坐进 rear 那格。<br>'+
         '· 钟声传唤下一位 → front 那格的人起身离开。<br>'+
         '· 四座皆满又来人 → 没地方放, 只能<b style="color:#ffce3a;">回绝</b>。<br>'+
         '· 环已空却钟声又响 → 没人可传唤, 钟声响给了<b style="color:#39d0ff;">空气</b>。'+
         '选错两次, 庙祝会把所有座位清空重排。</span>'));
    var b=mk(body,'div','margin-top:10px;display:flex;gap:10px;');
    mk(b,'button',BTN,tx('Watch a demonstration first','先看一次演示')).onclick=demo;
    mk(b,'button',BTN_HOT,tx('Begin the trial','开始试炼')).onclick=function(){trial();};
  }

  /* ---- 演示 ---- */
  function demo(){
    body.innerHTML='';
    mk(body,'div',DIM,tx('Demo sequence: ps→sh→vi→cc fill the ring, then awk arrives, then the bell rings, then ed arrives',
      '演示序列: ps→sh→vi→cc 坐满四座, 接着 awk 抵达, 接着钟声响, 接着 ed 抵达'));
    var log=mk(body,'div',TXT+'min-height:150px;margin-top:6px;border:1px solid #1f3f1f;padding:8px;background:rgba(10,20,10,.45);','');
    var lines=[
      B('#1-4 ps→seat0, sh→seat1, vi→seat2, cc→seat3. All four seats taken — notice <b>rear</b> has already spun back to seat 0. '+
        'But seat 0 is occupied, so that does NOT mean there\'s room. The ring is full.',
        '#1-4 ps→座0, sh→座1, vi→座2, cc→座3。四座皆满——注意 <b>rear</b> 已经绕回了座 0。'+
        '但座 0 有人, 不代表有空位。环已经满了。'),
      B('#5 A fifth pilgrim, <span style="'+K+'">awk</span>, arrives. There is no seat for them — not even the one rear points at, '+
        'because rear only means "next seat to fill", not "an empty seat". The temple simply says: come back later. <b>Turn away.</b>',
        '#5 第五位朝圣者 <span style="'+K+'">awk</span> 抵达。没有座位给他——连 rear 指的那格也不行, '+
        '因为 rear 的意思是"下一个要填的座", 不是"一个空座"。神庙只说: 回绝, 请他晚点再来。'),
      B('#6 Bell rings: <b>front</b> points at seat 0 — ps steps out. front spins forward to seat 1. Exactly one seat is open now: seat 0.',
        '#6 钟声响: <b>front</b> 指着座 0——ps 起身离开。front 顺时针走到座 1。现在恰好空出一格: 座 0。'),
      B('#7 <span style="'+K+'">ed</span> arrives and takes that freed seat 0. rear spins forward to seat 1. Full again — '+
        'same four seats, nothing shifted along, no space wasted.',
        '#7 <span style="'+K+'">ed</span> 抵达, 坐进刚空出的座 0。rear 顺时针走到座 1。又满了——还是那四个座位, '+
        '没有谁被搬来搬去, 一格空间都没浪费。'),
      B('<span style="'+DIM+'">Key point: front and rear can end up pointing at the exact same seat on two very different days — '+
        'once when the ring is completely empty, once when it\'s completely full. The indices alone can\'t tell you which. '+
        'That\'s why the keeper also keeps a running head-count.</span>',
        '<span style="'+DIM+'">要点: front 和 rear 可能在两个截然不同的时刻指向同一格——一次是环彻底空了, 一次是环彻底满了。'+
        '光看指针指哪儿分不出来。所以庙祝还得另外记一个人数(count)。</span>')
    ];
    var i=0;
    (function tick(){
      if(i<lines.length){log.innerHTML+=T(lines[i++])+'<br>';S(api,'step');setTimeout(tick,900);}
      else{
        var b=mk(body,'div','margin-top:8px;');
        mk(b,'button',BTN_HOT,tx('Got it — begin the trial','看懂了, 开始试炼')).onclick=function(){trial();};
      }
    })();
  }

  /* ---- 试炼 ---- */
  function trial(){
    var st=cqNew(CQ_CAP),k=0,err=0;
    body.innerHTML='';
    mk(body,'div',DIM,tx('Trial sequence ("→name"=arrival, "•"=bell): ','试炼序列("→名字"=抵达, "•"=钟声): ')+
      CQ_EVENTS.map(function(e){return e.t==='a'?('→'+e.n):'•';}).join(' ')+
      '　·　'+tx('tolerance: 1st mistake = warning, 2nd = full restart','容错: 错 1 次警告, 错 2 次重排'));
    var ringBox=mk(body,'div','display:flex;gap:8px;margin:10px 0;');
    var banner=mk(body,'div','min-height:22px;font-size:13px;color:#ffce3a;');
    var choiceBar=mk(body,'div','display:flex;gap:8px;margin-bottom:6px;');
    var log=mk(body,'div',DIM+'max-height:96px;overflow-y:auto;border:1px solid #1f3f1f;padding:6px 8px;background:rgba(10,20,10,.35);margin-top:6px;line-height:1.6;',
      '<b>'+tx('Seating ledger','座次簿')+'</b><br>');
    msg.textContent='';

    function drawRing(){
      ringBox.innerHTML='';
      for(var i=0;i<st.cap;i++){
        (function(i){
          var occ=st.buf[i];
          var tags=[];
          if(i===st.front)tags.push('<span style="color:#7CFC00;">◂front</span>');
          if(i===st.rear)tags.push('<span style="color:#ffce3a;">◂rear</span>');
          mk(ringBox,'div','flex:1;border:1px solid '+(occ?'#c9a24a':'#1f3f1f')+';'+
            'padding:8px 6px;text-align:center;background:rgba(10,20,10,.5);',
            '<div style="'+DIM+'">'+tx('seat ','座 ')+i+'</div>'+
            (occ?'<b style="color:#bfeebf;font-size:15px;">'+occ+'</b>':'<span style="color:#2f4f2f;">'+tx('(empty)','(空)')+'</span>')+
            '<div style="font-size:10.5px;margin-top:3px;min-height:13px;">'+tags.join(' ')+'</div>');
        })(i);
      }
    }
    function logLine(h){log.innerHTML+=h+'<br>';log.scrollTop=log.scrollHeight;}
    function restart(){
      S(api,'err');
      TOAST(api,B('The keeper resets every seat: "Lose count of the ring, and the ring starts over."',
                  '庙祝清空了所有座位: 「算不清环里的人数, 就从头再排。」'),true);
      setTimeout(function(){trial();},600);
    }
    function stateStr(){
      return tx('front=seat'+st.front+', rear=seat'+st.rear+', occupied='+st.count+'/'+st.cap,
                'front=座'+st.front+', rear=座'+st.rear+', 占用='+st.count+'/'+st.cap);
    }
    function decide(correct,got,name){
      choiceBar.innerHTML='';
      if(got===correct){
        S(api,'ok');
        if(correct==='reject'){
          logLine('#'+k+' '+name+tx(' turned away · <span style="color:#ff8080;">ring is full, no seat</span>',
            ' 被回绝 · <span style="color:#ff8080;">环满, 无座</span>'));
        }else{
          logLine('#'+k+tx(' the bell rings for no one · <span style="color:#39d0ff;">ring is empty</span>',
            ' 钟声响给了空气 · <span style="color:#39d0ff;">环空</span>'));
        }
        banner.textContent='';k++;
        drawRing();setTimeout(advance,650);
      }else{
        err++;S(api,'err');
        bumpFail(api,'mem_lru_fails','mem_lru');
        var correctLabel=correct==='reject'
          ?tx('turn them away — the ring is full','回绝——环已经满了')
          :tx('idle — the ring is empty, no one to call','空响——环是空的, 没人可传唤');
        if(err>=2){
          banner.innerHTML=tx('✗ Wrong again. Current state: '+stateStr()+' — the correct call was <b>'+correctLabel+'</b>.',
            '✗ 又错了。当前状态: '+stateStr()+' —— 正解是 <b>'+correctLabel+'</b>。');
          restart();
        }else{
          banner.innerHTML=tx('✗ Not quite. Current state: '+stateStr()+'. <span style="'+DIM+'">Try again (1 chance left).</span>',
            '✗ 不对。当前状态: '+stateStr()+'。<span style="'+DIM+'">再选一次(还剩 1 次机会)。</span>');
        }
      }
    }
    function askFull(name){
      banner.innerHTML=tx('Pilgrim <b style="color:#ffce3a;">'+name+'</b> arrives — every seat is taken. <b>Choose</b> what happens.',
        '朝圣者 <b style="color:#ffce3a;">'+name+'</b> 抵达——座位全满。<b>选择</b>接下来怎么办。');
      logLine('#'+k+' '+name+tx(' arrives · ring full · awaiting your call…',' 抵达 · 环满 · 等待裁决…'));
      choiceBar.innerHTML='';
      mk(choiceBar,'button',BTN,tx('Squeeze them in anyway (ENQUEUE)','硬塞进去 (ENQUEUE)')).onclick=function(){decide('reject','enqueue',name);};
      mk(choiceBar,'button',BTN_HOT,tx('Turn them away — ring is full (REJECT)','回绝——环满 (REJECT)')).onclick=function(){decide('reject','reject',name);};
    }
    function askEmpty(){
      banner.innerHTML=tx('The bell rings, but the ring stands empty. <b>Choose</b> what happens.',
        '钟声响了, 可环是空的。<b>选择</b>接下来怎么办。');
      logLine('#'+k+tx(' bell rings · ring empty · awaiting your call…',' 钟声响 · 环空 · 等待裁决…'));
      choiceBar.innerHTML='';
      mk(choiceBar,'button',BTN,tx('Call someone anyway (DEQUEUE)','硬传唤 (DEQUEUE)')).onclick=function(){decide('idle','dequeue');};
      mk(choiceBar,'button',BTN_HOT,tx('Idle — ring is empty (IDLE)','空响——环空 (IDLE)')).onclick=function(){decide('idle','idle');};
    }
    function advance(){
      if(k>=CQ_EVENTS.length){win();return;}
      var ev=CQ_EVENTS[k];
      if(ev.t==='a'){
        if(!cqIsFull(st)){
          var seat=st.rear;cqEnqueue(st,ev.n);
          logLine('#'+k+' '+ev.n+tx(' arrives · takes seat '+seat,' 抵达 · 坐进座 '+seat));
          k++;drawRing();setTimeout(advance,600);
        }else{
          drawRing();askFull(ev.n);
        }
      }else{
        if(!cqIsEmpty(st)){
          var seat2=st.front,r=cqDequeue(st);
          logLine('#'+k+' '+tx('bell calls '+r.name+' · leaves seat '+seat2,'钟声传唤 '+r.name+' · 离开座 '+seat2));
          k++;drawRing();setTimeout(advance,600);
        }else{
          drawRing();askEmpty();
        }
      }
    }
    function win(){
      SET(api,'mem_lru_done');S(api,'quest');
      body.innerHTML='';
      var log2=mk(body,'div',TXT+'min-height:120px;','');
      var lines=[
        B('> Three judgement calls, three correct. The ring never once wasted a seat, never once double-booked one.',
          '> 三次裁决, 三次皆中。这个环从没浪费过一格, 也从没让两个人挤同一个座。'),
        B('> Behind the door, a wheel of locks spins one full turn and clicks back into its resting seat.',
          '> 石门内, 一圈锁簧转了整整一周, 咔哒一声, 停回原位。'),
        B('> The keeper — an old queueing discipline, seated cross-legged at the ring\'s dead centre — opens its eyes: '+
          '"You understand. Four seats isn\'t cruelty. It\'s honesty — the ring never pretends to hold more than it has."',
          '> 庙祝——一个盘坐在环心的老排队法则——睁开眼: "你懂了。四个座位不是刻薄, 是诚实——'+
          '<span style="'+K+'">这个环从不假装自己能装下比四多的东西</span>。"'),
        B('> <span style="'+K+'">◈ Obtained: Null Pointer Shard</span> — for one clean instant, front and rear pointed at exactly nowhere.',
          '> <span style="'+K+'">◈ 取得「空指针碎片」</span> —— 有那么干干净净的一瞬, front 和 rear 一起指向恰好的"无处"。'),
        B('<span style="'+DIM+'">"Take it. An empty ring and a full ring can look the same from outside — but an honest pointer, '+
          'at least, never lies about pointing at nothing."</span>',
          '<span style="'+DIM+'">"拿去。空的环和满的环, 从外面看有时长一个样——但一个诚实的指针, 至少从不掩饰自己指向虚无。"</span>')
      ];
      var i=0;
      (function tick(){
        if(i<lines.length){log2.innerHTML+=T(lines[i++])+'<br>';S(api,i>=lines.length?'quest':'step');setTimeout(tick,700);}
        else{
          GIVE(api,'null_shard',B('Null Pointer Shard','空指针碎片'));
          STEP(api,'mem_m3');
          TOAST(api,B('◈ Key item obtained: Null Pointer Shard — later chapters will recognise it.',
                      '◈ 取得关键道具「空指针碎片」——后续章节会认得它。'),true);
          mk(mk(body,'div','margin-top:10px;'),'button',BTN,tx('Leave the temple','离开神庙')).onclick=function(){api.closePanel&&api.closePanel();};
        }
      })();
    }
    drawRing();
    advance();
  }

  intro();
  addHints(wrap,'mem_lru',[
    B('Recap — a circular queue is a queue (FIFO: first in, first out) stored in a fixed-size array, where the "next slot" '+
      'index wraps back to 0 after the last one, instead of shuffling every element down each time something leaves. Two pointers '+
      'do all the work: <b>front</b> (the oldest item, next to leave) and <b>rear</b> (the next empty slot, where new items go). '+
      'Trap: front===rear happens BOTH when the ring is totally empty AND totally full — indices alone can\'t tell you which, so a '+
      'separate count is kept too. (📖 See "Circular Queue" in the Codex for the full write-up.)',
      '复习一下: 环形队列 (circular queue) 是用一块固定大小的数组实现的队列(FIFO, 先进先出), "下一格"的下标绕到数组末尾后'+
      '直接跳回 0, 不用像普通数组队列那样每次都把元素往前搬。全靠两个指针干活: <b>front</b>(最老的那个, 下一个离开)和'+
      '<b>rear</b>(下一个空格, 新元素往这儿放)。陷阱: front===rear 这件事, 环彻底空了会发生, 环彻底满了也会发生——'+
      '光看下标分不出来, 所以还得另外记一个 count。(📖 完整讲解见图鉴里的「Circular Queue」条目。)'),
    B('Apply it here: watch rear to know where the next arrival sits, and front to know who leaves at the next bell. '+
      'At the two tricky moments — a new arrival when all 4 seats are full, or a bell when the ring is empty — check the '+
      'seating ledger below for the current occupied-count before you choose.',
      '用到这题上: 看 rear 就知道下一个人坐哪儿, 看 front 就知道下次钟声谁走。遇到两个刁钻时刻——'+
      '四座已满又来人, 或者环已空却响钟——先翻下面的座次簿, 看清当前占用数再选。'),
    B('Answer: the three judgement points are, in order, <b>reject (awk)</b>, <b>idle</b>, <b>reject (ps)</b>. Every other arrival '+
      'and every other bell has an obvious seat to take or a clear front to call — no ambiguity there.',
      '答案: 三个判定点依次是 <b>回绝(awk)</b>、<b>空响</b>、<b>回绝(ps)</b>。其余每次抵达都有明确空位, 每次钟声都有明确的 front, 没有歧义。')
  ]);
}

/* ---- ★挑战: 盲算账本——只给操作日志, 推断最终 front/rear/count ---- */
function renderQueueChal(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:480px;max-width:680px;'+TXT);
  header(wrap,tx('★ Challenge · The Blind Ledger','★ 挑战 · 盲算账本'),'FRONT · REAR · COUNT');
  mk(wrap,'div','',
    tx('The keeper slides over a page with no ring drawn on it at all — just a raw log, <span style="'+K+'">4 seats</span> as before:<br>'+
       '<code style="'+K+'">'+CQ_CHAL_LOG.map(function(o){return o.op==='E'?('ENQ '+o.n):'DEQ';}).join(' · ')+'</code><br>'+
       '<span style="'+DIM+'">(An ENQ that finds the ring full is turned away, same as REJECT. A DEQ on an empty ring rings for no one, '+
       'same as IDLE — neither changes anything.)</span><br>'+
       'Without drawing it out step by step on the ring — work from the log alone: what are the final <span style="'+K+'">front</span>, '+
       '<span style="'+K+'">rear</span> and <span style="'+K+'">count</span> (seats 0-3, count 0-4)?',
       '庙祝递来一页没画环的纸, 只有一条原始日志, 座位数还是 <span style="'+K+'">4</span>:<br>'+
       '<code style="'+K+'">'+CQ_CHAL_LOG.map(function(o){return o.op==='E'?('ENQ '+o.n):'DEQ';}).join(' · ')+'</code><br>'+
       '<span style="'+DIM+'">(ENQ 遇到环满就回绝, 等同 REJECT; DEQ 遇到环空就空响, 等同 IDLE——都不改变状态。)</span><br>'+
       '不许在环上一步步画——只凭日志推算: 最终 <span style="'+K+'">front</span>、<span style="'+K+'">rear</span>、'+
       '<span style="'+K+'">count</span>(座位 0-3, count 0-4)分别是多少?'));

  var row=mk(wrap,'div','margin:12px 0;display:flex;gap:14px;align-items:center;flex-wrap:wrap;');
  function field(labelEn,labelZh){
    var box=mk(row,'div','display:flex;flex-direction:column;gap:4px;align-items:center;');
    mk(box,'div',DIM,tx(labelEn,labelZh));
    var inp=mk(box,'input','background:#04140a;color:#7CFC00;border:1px solid #2f6f2f;padding:5px 10px;'+
      'font-family:inherit;font-size:14px;width:56px;text-align:center;');
    inp.type='text';inp.maxLength=1;inp.placeholder='?';
    return inp;
  }
  var inpFront=field('front','front');
  var inpRear=field('rear','rear');
  var inpCount=field('count','count');
  var msg=mk(wrap,'div','min-height:20px;font-size:12px;color:#ffce3a;');
  var tries=0;
  mk(row,'button',BTN_HOT,tx('Submit to the keeper','呈给庙祝')).onclick=function(){
    var f=parseInt(inpFront.value,10),r=parseInt(inpRear.value,10),c=parseInt(inpCount.value,10);
    if(isNaN(f)||isNaN(r)||isNaN(c)){msg.textContent=tx('All three boxes need numbers.','三格都要填数字。');return;}
    var ans=cqReplay(CQ_CHAL_LOG,CQ_CHAL_CAP);
    if(f===ans.front&&r===ans.rear&&c===ans.count){
      SET(api,'mem_challenge_3');S(api,'quest');
      msg.innerHTML=tx('✓ Correct: front='+ans.front+', rear='+ans.rear+', count='+ans.count+
        '. Remaining, front to rear: '+ans.contents.join(' → ')+'.',
        '✓ 正确: front='+ans.front+', rear='+ans.rear+', count='+ans.count+
        '。剩下的人, 从 front 到 rear: '+ans.contents.join(' → ')+'。');
      TOAST(api,B('The keeper nods once: "You didn\'t need to see the ring at all. The count was always in the log — you just had to read it."',
                  '庙祝点了一下头: 「你根本不用看环。日志里早就写着答案——你只是要读得出来。」'),true);
      var b=mk(wrap,'div','margin-top:8px;');
      mk(b,'button',BTN,tx('Back','返回')).onclick=function(){renderTemple(el,api);};
      return;
    }
    tries++;S(api,'err');
    if(tries>=2){
      msg.innerHTML=tx('✗ Not quite. Walk the log one line at a time, tracking only three numbers: front, rear, count. '+
        'Every ENQ: if count<4, place at rear then rear=(rear+1)%4, count++ (a full ring rejects, nothing changes). '+
        'Every DEQ: if count>0, front=(front+1)%4, count-- (an empty ring idles, nothing changes). '+
        'Final answer: front='+ans.front+', rear='+ans.rear+', count='+ans.count+'.',
        '✗ 不对。把日志一行行走一遍, 只跟踪三个数: front、rear、count。'+
        '每条 ENQ: count<4 就在 rear 落座, 然后 rear=(rear+1)%4, count++ (环满则回绝, 什么都不变)。'+
        '每条 DEQ: count>0 就 front=(front+1)%4, count-- (环空则空响, 什么都不变)。'+
        '最终答案: front='+ans.front+', rear='+ans.rear+', count='+ans.count+'。');
    }else{
      msg.textContent=tx('✗ Not yet. Try again — walk the log line by line, no shortcuts.','✗ 还不对。再算一次——一行行走日志, 别抄近道。');
    }
  };
  var foot=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;');
  mk(foot,'button',BTN,tx('Back','返回')).onclick=function(){renderTemple(el,api);};
  mk(foot,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
}

/* ---- RESERVED FOR A2 —— 原 Boss 谜题渲染层 (LRU 缓存神庙), 未接入 puzzles[] ----
   页面置换/LRU 属 A2 §16, 已从 AS 世界摘除。判定逻辑见本文件 0b 节 (lruNew 等,
   仍完整保留); 以下两个渲染函数原样保留、仅改名避免与新函数冲突, 供未来
   A2 kernel 模块直接挂载 render:renderTempleLRU_Reserved 之类的引用。 */
function renderTempleLRU_Reserved(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:480px;max-width:680px;'+TXT);
  header(wrap,tx('Temple of the LRU Cache','LRU 缓存神庙'),'CACHE TEMPLE · 4-WAY');

  if(FLAG(api,'mem_lru_done')){
    mk(wrap,'div','',
      tx('The stone door stands open. Four altars burn steady; pilgrims come and go, and no one is evicted unjustly.<br>'+
         '<span style="'+DIM+'">In the shadow behind the altars, the socket that held the Null Pointer Shard is faintly cold — '+
         'pointing nowhere, cleaner than anywhere.</span>',
         '石门敞开着。四座祭坛香火安稳, 朝圣者来了又走, 无人被冤枉。<br>'+
         '<span style="'+DIM+'">祭坛后的阴影里, 空指针碎片 (Null Pointer Shard) 留下的凹槽微微发凉——指向无处, 却比哪儿都干净。</span>'));
    var bar=mk(wrap,'div','margin-top:10px;display:flex;gap:10px;');
    if(FLAG(api,'mem_challenge_3')){
      mk(wrap,'div','margin-top:8px;'+K+'font-size:12px;',
        tx('★ Challenge cleared: you counted the OPT page faults — the algorithm of gods.',
           '★ 挑战已通关: 你算出了 OPT (最优置换) 的缺页数——神的算法。'));
    }else{
      mk(bar,'button',BTN_GOLD,tx('★ Challenge: The Oracle\'s Count (OPT)','★ 挑战: 先知之数 (OPT)')).onclick=function(){renderLruChalReserved(el,api);};
    }
    mk(bar,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }
  if(!(FLAG(api,'mem_stack_done')&&FLAG(api,'mem_list_done'))){
    mk(wrap,'div','',
      tx('The stone door does not move. Three lines are carved on the lintel:<br>'+
         '<span style="'+K+'">"First learn to enter and leave (the stack). Then learn to be joined (the list). '+
         'Only then may you learn to let go (replacement)."</span><br>'+
         '<span style="'+DIM+'">Incense drifts through the crack. It is waiting for you to fix the Library and the Cloister.</span>',
         '石门纹丝不动。门楣上刻着三行字:<br>'+
         '<span style="'+K+'">「先学会进出(栈 stack), 再学会相连(链 list), 方可学取舍(置换 replacement)。」</span><br>'+
         '<span style="'+DIM+'">门缝里透出香火味。它在等你修好书库塔与断链回廊。</span>'));
    mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }

  var body=mk(wrap,'div','');
  var msg=mk(wrap,'div','min-height:20px;font-size:12px;color:#ffce3a;');
  var foot=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;flex-wrap:wrap;');
  mk(foot,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};

  /* ---- 规则说明 ---- */
  function intro(){
    body.innerHTML='';
    mk(body,'div','',
      tx('The temple has only <span style="'+K+'">4 altars</span> (cache slots), yet pilgrims (processes) never stop coming. The sexton keeps a single rule:<br>'+
         '<span style="'+K+'">LRU — Least Recently Used: whoever has gone longest without being remembered leaves first.</span><br>'+
         '<span style="'+DIM+'">· Pilgrim already on an altar → <b style="color:#7CFC00;">HIT</b>: their incense is renewed ("recently used" refreshes). No new slot taken.<br>'+
         '· A free altar → they simply move in.<br>'+
         '· All full and it\'s a MISS → someone must go: <b style="color:#ffce3a;">the one whose incense is oldest</b>. '+
         'Two wrong evictions and the sexton clears the hall and starts over.</span>',
         '神庙只有 <span style="'+K+'">4 座祭坛</span>(缓存槽 cache slots), 朝圣者(进程 processes)却络绎不绝。庙祝的规矩只有一条:<br>'+
         '<span style="'+K+'">LRU — Least Recently Used: 最久没被想起的, 先离开。</span><br>'+
         '<span style="'+DIM+'">· 朝圣者已在坛上 → <b style="color:#7CFC00;">命中 (hit)</b>: 只续香火(刷新"最近用过"), 不占新位。<br>'+
         '· 有空坛 → 直接入驻。<br>'+
         '· 坛满且未命中 (miss) → 必须送走一位: <b style="color:#ffce3a;">香火最久未续的那位</b>。'+
         '选错两次, 庙祝会把所有人请出去重排。</span>'));
    var b=mk(body,'div','margin-top:10px;display:flex;gap:10px;');
    mk(b,'button',BTN,tx('Watch a demonstration first','先看一次演示')).onclick=demo;
    mk(b,'button',BTN_HOT,tx('Begin the trial','开始试炼')).onclick=function(){trial();};
  }

  /* ---- 演示 ---- */
  function demo(){
    body.innerHTML='';
    mk(body,'div',DIM,tx('Demo sequence: init → login → sync → cron → <b style="color:#ffce3a;">ping</b> (full, someone must go)',
      '演示序列: init → login → sync → cron → <b style="color:#ffce3a;">ping</b> (坛满, 需淘汰)'));
    var log=mk(body,'div',TXT+'min-height:130px;margin-top:6px;border:1px solid #1f3f1f;padding:8px;background:rgba(10,20,10,.45);','');
    var lines=[
      B('#1 init moves in · incense time t=1','#1 init 入驻祭坛 · 香火时间 t=1'),
      B('#2 login t=2　#3 sync t=3　#4 cron t=4 — all four altars taken','#2 login 入驻 t=2　#3 sync t=3　#4 cron t=4 —— 四坛皆满'),
      B('#5 <span style="'+K+'">ping arrives · MISS!</span> Check last-renewed times: init(t=1) login(t=2) sync(t=3) cron(t=4)',
        '#5 <span style="'+K+'">ping 抵达 · 未命中!</span> 查各坛上次续香: init(t=1) login(t=2) sync(t=3) cron(t=4)'),
      B('→ <span style="'+K+'">init\'s t=1 is the oldest</span>: not remembered once since arriving. The sexton sees init out; ping moves in.',
        '→ <span style="'+K+'">init 的 t=1 最旧</span>: 从进庙起没被想起过一次。庙祝送走 init, ping 入驻。'),
      B('<span style="'+DIM+'">Key point: had step #5 been init itself, that\'s a HIT — its t refreshes to 5 and it becomes the SAFEST. '+
        'To be remembered is to have your incense renewed.</span>',
        '<span style="'+DIM+'">要点: 若第 5 步来的是 init 本尊, 那是命中 (hit)——它的 t 刷成 5, 反而最安全。'+
        '被想起, 就是香火。</span>')
    ];
    var i=0;
    (function tick(){
      if(i<lines.length){log.innerHTML+=T(lines[i++])+'<br>';S(api,'step');setTimeout(tick,750);}
      else{
        var b=mk(body,'div','margin-top:8px;');
        mk(b,'button',BTN_HOT,tx('Got it — begin the trial','看懂了, 开始试炼')).onclick=function(){trial();};
      }
    })();
  }

  /* ---- 试炼 ---- */
  function trial(){
    var st=lruNew(),k=0,err=0,t=0,lastT={},pending=null;
    body.innerHTML='';
    mk(body,'div',DIM,tx('Trial sequence (arrivals in order): ','试炼序列(依次抵达): ')+LRU_SEQ.join(' → ')+
      '　·　'+tx('tolerance: 1st mistake = warning, 2nd = full restart','容错: 错 1 次警告, 错 2 次重排'));
    var altBox=mk(body,'div','display:flex;gap:8px;margin:10px 0;');
    var banner=mk(body,'div','min-height:22px;font-size:13px;color:#ffce3a;');
    var log=mk(body,'div',DIM+'max-height:96px;overflow-y:auto;border:1px solid #1f3f1f;padding:6px 8px;background:rgba(10,20,10,.35);margin-top:6px;line-height:1.6;',
      '<b>'+tx('Incense ledger','香火簿')+'</b><br>');
    msg.textContent='';

    function drawAltars(clickable){
      altBox.innerHTML='';
      for(var i=0;i<LRU_CAP;i++){
        (function(i){
          var occ=st.recency.slice().sort()[i]; /* 稳定展示: 按名字排, 不泄露香火顺序 */
          var d=mk(altBox,'div','flex:1;border:1px solid '+(clickable&&occ?'#c9a24a':'#1f3f1f')+';'+
            'padding:8px 6px;text-align:center;background:rgba(10,20,10,.5);'+
            (clickable&&occ?'cursor:pointer;box-shadow:0 0 6px rgba(201,162,74,.4);':''),
            '<div style="'+DIM+'">'+tx('Altar ','祭坛 ')+(i+1)+'</div>'+
            (occ?'<b style="color:#bfeebf;font-size:15px;">'+occ+'</b>':'<span style="color:#2f4f2f;">'+tx('(empty)','(空)')+'</span>'));
          if(clickable&&occ)d.onclick=function(){pick(occ);};
        })(i);
      }
    }
    function logLine(h){log.innerHTML+=h+'<br>';log.scrollTop=log.scrollHeight;}
    function restart(){
      S(api,'err');
      TOAST(api,B('The sexton clears the hall: "Disordered memory starts from the beginning."',
                  '庙祝把所有朝圣者请出了大殿: 「记忆错乱者, 从头再来。」'),true);
      setTimeout(function(){trial();},600);
    }
    function pick(name){
      var v=lruVictim(st);
      if(name===v){
        S(api,'ok');
        lruEvict(st,v,pending);lastT[pending]=t;
        logLine('#'+t+' '+pending+tx(' moves in · <span style="color:#ff8080;">'+v+' leaves</span> (oldest incense)',
          ' 入驻 · <span style="color:#ff8080;">'+v+' 离庙</span> (香火最旧)'));
        banner.textContent='';pending=null;k++;
        drawAltars(false);setTimeout(advance,650);
      }else{
        err++;S(api,'err');
        bumpFail(api,'mem_lru_fails','mem_lru');
        var tl=st.recency.map(function(p){return p+'(t='+lastT[p]+')';}).join(' < ');
        if(err>=2){
          banner.innerHTML=tx('✗ Wrong again. Incense oldest → newest: '+tl+' — it should have been <b>'+v+'</b>.',
            '✗ 又错了。香火由旧到新: '+tl+' —— 该走的是 <b>'+v+'</b>。');
          restart();
        }else{
          banner.innerHTML=tx('✗ '+name+'\'s incense is not the oldest. Check the ledger — oldest → newest: '+tl+
            '. <span style="'+DIM+'">Pick again (1 chance left).</span>',
            '✗ '+name+' 的香火不是最旧的。翻翻香火簿——由旧到新: '+tl+
            '。<span style="'+DIM+'">再选一次(还剩 1 次机会)。</span>');
        }
      }
    }
    function advance(){
      if(k>=LRU_SEQ.length){win();return;}
      var p=LRU_SEQ[k];t++;
      var r=lruAccess(st,p);
      if(r.evict){
        pending=p;
        banner.innerHTML=tx('Pilgrim <b style="color:#ffce3a;">'+p+'</b> arrives — MISS, all four altars taken. <b>Click</b> the altar of the one who must leave.',
          '朝圣者 <b style="color:#ffce3a;">'+p+'</b> 抵达 —— 未命中, 四坛皆满。<b>点选</b>该送走的祭坛。');
        logLine('#'+t+' '+p+tx(' arrives · MISS · awaiting your judgement…',' 抵达 · 未命中 · 等待取舍…'));
        drawAltars(true);
      }else{
        if(r.hit){lastT[p]=t;logLine('#'+t+' '+p+tx(' <span style="color:#7CFC00;">returns · HIT!</span> incense renewed',
          ' <span style="color:#7CFC00;">回访 · 命中!</span> 香火续上'));}
        else{lastT[p]=t;logLine('#'+t+' '+p+tx(' moves into a free altar',' 入驻空坛'));}
        k++;drawAltars(false);setTimeout(advance,600);
      }
    }
    function win(){
      SET(api,'mem_lru_done');S(api,'quest');
      body.innerHTML='';
      var log2=mk(body,'div',TXT+'min-height:120px;','');
      var lines=[
        B('> Three evictions, three correct. Every altar\'s incense brightens an inch.',
          '> 三次取舍, 三次皆中。祭坛的香火同时亮了一寸。'),
        B('> Behind the door, lock springs release — not one, but four ways of a <span style="'+K+'">4-way set</span>.',
          '> 石门内传来锁簧退开的声音——不是一道, 是<span style="'+K+'">四路组相联 (4-way)</span> 的四道。'),
        B('> The sexton (a replacement algorithm, seated in lotus) opens its eyes: "You understand. A cache is not heartless. It is <span style="'+K+'">finite</span>."',
          '> 庙祝(一个盘坐的置换算法)睁开眼: "你懂了。缓存不是无情, 是<span style="'+K+'">有限 (finite)</span>。"'),
        B('> <span style="'+K+'">◈ Obtained: Null Pointer Shard</span> — it points nowhere, and therefore can never point wrong.',
          '> <span style="'+K+'">◈ 取得「空指针碎片」</span> —— 它不指向任何地方, 因此永远不会指错。'),
        B('<span style="'+DIM+'">"Take it. When you are lost, hold it — knowing you point at nothing beats pointing into the abyss."</span>',
          '<span style="'+DIM+'">"拿去。迷路的时候握一握——知道自己一无所指, 好过指向深渊。"</span>')
      ];
      var i=0;
      (function tick(){
        if(i<lines.length){log2.innerHTML+=T(lines[i++])+'<br>';S(api,i>=lines.length?'quest':'step');setTimeout(tick,700);}
        else{
          GIVE(api,'null_shard',B('Null Pointer Shard','空指针碎片'));
          STEP(api,'mem_m3');
          TOAST(api,B('◈ Key item obtained: Null Pointer Shard — later chapters will recognise it.',
                      '◈ 取得关键道具「空指针碎片」——后续章节会认得它。'),true);
          mk(mk(body,'div','margin-top:10px;'),'button',BTN,tx('Leave the temple','离开神庙')).onclick=function(){api.closePanel&&api.closePanel();};
        }
      })();
    }
    drawAltars(false);
    advance();
  }

  intro();
  addHints(wrap,'mem_lru_reserved',[
    B('Recap — a cache has a fixed number of slots. When it\'s full and something new arrives, LRU means: evict whoever has gone <b>longest without being used</b>. The trap: using something again (a "hit") resets its clock — so a repeat visitor is now the FRESHEST, not the oldest. (📖 See "LRU Cache" in the Codex for the full write-up.)',
      '复习一下: 缓存 (cache) 的位置数是固定的。位置满了又来新东西时, LRU 的规则是: 送走「<b>最久没被用过</b>」的那个。陷阱在于: 再次用到某个东西(命中 hit)会刷新它的时钟——所以刚被用过的那个反而是最新鲜的, 不是最旧的。(📖 完整讲解见图鉴里的「LRU Cache」条目。)'),
    B('Apply it here: keep a note for each altar — the step number it was last used (moving in AND returning both count as "used"). When someone must be evicted, send off whoever has the SMALLEST step number. It\'s all written in the incense ledger below — don\'t go by gut.',
      '用到这题上: 给每个祭坛记一个数——它上次被用到时的步号(入驻和回访都算"用过")。要淘汰时, 送走步号<b>最小</b>的那个。下面的香火簿里全都写着, 别凭感觉。'),
    B('Answer: the three evictions are <b>ps, vi, awk</b> in that order. sh and cc both came back mid-sequence and renewed their incense, so it is never their turn.',
      '答案: 三次淘汰依次送走 <b>ps、vi、awk</b>。sh 和 cc 中途回访续过香火, 所以每次都轮不到它们。')
  ]);
}

/* ---- ★挑战: 先知之数 (OPT / Belady 最优置换) —— RESERVED FOR A2, 未接入 puzzles[] ---- */
function renderLruChalReserved(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:480px;max-width:680px;'+TXT);
  header(wrap,tx('★ Challenge · The Oracle\'s Count','★ 挑战 · 先知之数'),'OPT · BELADY');
  mk(wrap,'div','',
    tx('The sexton produces a different queue of pilgrims and shrinks the hall to <span style="'+K+'">3 altars</span>:<br>'+
       '<code style="'+K+'">'+OPT_SEQ.join(' → ')+'</code><br>'+
       'Suppose the hall were run not by LRU but by the all-knowing <span style="'+K+'">OPT</span> (Belady\'s optimal): '+
       'on every eviction, send away the pilgrim whose <b>next visit lies farthest in the future</b> (or who never returns).<br>'+
       '<span style="'+DIM+'">Question: how many <b>page faults</b> (MISSes that require moving in) occur in total? Empty-altar move-ins count as faults too.</span>',
       '庙祝换来另一队朝圣者, 并把大殿缩到 <span style="'+K+'">3 座祭坛</span>:<br>'+
       '<code style="'+K+'">'+OPT_SEQ.join(' → ')+'</code><br>'+
       '假设主持大殿的不是 LRU, 而是全知的 <span style="'+K+'">OPT</span> (Belady 最优置换): '+
       '每次淘汰, 送走「<b>未来最晚再来</b>(或不再来)」的那位。<br>'+
       '<span style="'+DIM+'">问: 全程共发生几次<b>缺页 (page fault)</b>(需要入驻的未命中)? 入驻空坛也算缺页。</span>'));

  var row=mk(wrap,'div','margin:12px 0;display:flex;gap:10px;align-items:center;');
  var inp=mk(row,'input','background:#04140a;color:#7CFC00;border:1px solid #2f6f2f;padding:5px 10px;'+
    'font-family:inherit;font-size:14px;width:72px;text-align:center;');
  inp.type='text';inp.maxLength=2;inp.placeholder='?';
  var msg=mk(wrap,'div','min-height:20px;font-size:12px;color:#ffce3a;');
  var tries=0;
  mk(row,'button',BTN_HOT,tx('Submit to the sexton','呈给庙祝')).onclick=function(){
    var ans=parseInt(inp.value,10);
    if(isNaN(ans)){msg.textContent=tx('Numbers only. The sexton squints at your handwriting.','请输入数字。庙祝眯着眼看不懂你的字。');return;}
    if(ans===optFaults(OPT_SEQ,OPT_CAP)){
      SET(api,'mem_challenge_3');S(api,'quest');
      msg.innerHTML=tx('✓ Correct: <b>'+optFaults(OPT_SEQ,OPT_CAP)+' faults</b>. Under LRU, the same queue costs <b>'+lruFaults(OPT_SEQ,OPT_CAP)+'</b>.',
        '✓ 正确: <b>'+optFaults(OPT_SEQ,OPT_CAP)+' 次缺页</b>。同一队伍换 LRU 要缺 <b>'+lruFaults(OPT_SEQ,OPT_CAP)+'</b> 次。');
      TOAST(api,B('The sexton opens a second pair of eyes: "You don\'t just keep the rule — you see the future. OPT is the algorithm of gods; we mortals only approximate it with LRU."',
                  '庙祝睁开了第二双眼: 「你不止会守规矩, 还看得见未来。OPT 是神的算法——凡人只能用 LRU 逼近它。」'),true);
      var b=mk(wrap,'div','margin-top:8px;');
      mk(b,'button',BTN,tx('Back','返回')).onclick=function(){renderTempleLRU_Reserved(el,api);};
      return;
    }
    tries++;S(api,'err');
    if(tries>=2){
      msg.innerHTML=tx('✗ Not '+ans+'. Work it on paper: the first 3 arrivals are compulsory faults. At each later MISS, look FORWARD in the sequence — evict the resident whose next visit is farthest away (never returning beats everything). Count every move-in.',
        '✗ 不是 '+ans+'。拿纸推: 前 3 位入驻是必然缺页; 之后每次未命中, 往序列<b>后面</b>看——淘汰「下次出现最远」的在坛者(不再出现的优先送走)。数清每一次入驻。');
    }else{
      msg.textContent=tx('✗ The sexton shakes its head slowly. Try again — the future is written right there in the sequence.',
        '✗ 庙祝缓缓摇头。再算一次——未来就明明白白写在序列里。');
    }
  };
  var foot=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;');
  mk(foot,'button',BTN,tx('Back','返回')).onclick=function(){renderTempleLRU_Reserved(el,api);};
  mk(foot,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
}

/* ================================================================
   5. NPC 对话
   ================================================================ */

/* malloc 婆婆 —— 分配器化身。开场白永远是那句。 */
function grannyDialog(api){
  var n=(FLAG(api,'mem_granny_count')||0)+1;SET(api,'mem_granny_count',n);
  var SP=B('Granny malloc','malloc 婆婆');
  var fixed={sp:SP,t:B(
    '<span class="dim">(Behind the counter, an old woman with solder wire tucked behind her ear doesn\'t look up. Her ledger looks older than she does.)</span><br>'+
    'How much? Take it — and remember to give it back.',
    '<span class="dim">(柜台后, 一位耳后别着焊锡丝的婆婆头也不抬, 面前摊着一本比她还老的账簿)</span><br>'+
    '要多少？拿了记得还。')};
  var nodes;

  if(!FLAG(api,'mem_met_granny')){
    nodes=[
      fixed,
      {sp:SP,t:B(
        '<span class="dim">(She finally looks up, appraising you for 0.3 clock cycles.)</span><br>'+
        '…Not here to borrow memory? Rare. Everyone in this maze borrows: 8 bytes, 4KB, half a world. '+
        'I give it all out, and <span class="k">whatever I give, I write down</span> — address, size, and the name of the process that took it. Every line.',
        '<span class="dim">(她终于抬眼, 打量你 0.3 个时钟周期)</span><br>'+
        '……不借内存? 稀客。这条迷宫里人人都来借: 8 字节, 4KB, 半个世界。'+
        '我都给, <span class="k">给多少记多少</span>——地址、大小、借走它的进程名, 一笔不落。')},
      {sp:SP,t:B(
        'Every line never crossed out is soaking in that <span class="k">swamp</span> to the south-east. '+
        'Blocks lent out 700 epochs ago; the borrowers died; free() never came. So the land stays "on loan". Forever.<br>'+
        '<span class="dim">Leaked memory doesn\'t rot. It just goes quiet. Don\'t step in it — it doesn\'t give feet back either.</span>',
        '账簿上没销掉的, 全在东南边那片<span class="k">沼泽</span>里泡着。'+
        '700 纪元前借出去的块, 借书人死了, free() 没来, 那块地就永远僵在"已借出"。<br>'+
        '<span class="dim">泄漏 (leak) 的内存不腐烂, 只沉默。别去踩, 踩了连脚也不还。</span>')},
      {sp:SP,t:B(
        'If your hands are itching, two things in this maze have been broken for 700 years:<br>'+
        'the <span class="k">Stack Library</span> in the north-west — the tower is jammed, and it only ever obeyed one rule: in and out through the top;<br>'+
        'the <span class="k">Broken Chain Cloister</span> to the east — a linked list shattered, pointers gone feral.',
        '你要是闲得发慌, 迷宫里正好有两处坏了 700 年没人修:<br>'+
        '西北的<span class="k">栈书库 (Stack Library)</span>——书塔卡死, 只认「顶端进出」的老规矩;<br>'+
        '东边的<span class="k">断链回廊 (Broken Chain Cloister)</span>——一条链表摔散了架, 指针全野了。'),choices:[
        {t:B('I\'ll fix them.','我去修。'),next:4},
        {t:B('Just browsing for now.','先随便逛逛。'),next:5}
      ]},
      {sp:SP,t:B(
        'When both run clean, the stone door of the <span class="k">Circular Queue Temple</span> up north will deign to notice you. '+
        'The one inside teaches a single lesson: <span class="k">the ring only holds as many as it holds — no more, no fewer, and it never lies about which</span>.<br>'+
        '<span class="dim">…Sounds familiar, doesn\'t it. Everyone in this maze gets exactly as much room as the world can spare them.</span>',
        '两处都顺了, 北面 <span class="k">环形队列神庙</span>的石门才会理你。'+
        '庙里那位只教一件事: <span class="k">环能装多少就是多少, 不多不少, 也从不装糊涂</span>。<br>'+
        '<span class="dim">……听着耳熟吧。这条迷宫里, 谁不是只分得到这个世界匀得出的那么点地方。</span>'),next:-1},
      {sp:SP,t:B(
        'Browse away. Three rules, and they are the entire after-sales service of this establishment: '+
        '<span class="k">don\'t touch wild pointers, don\'t enter the swamp, and never sign a loan slip for the dead.</span>',
        '逛可以。<span class="k">别碰野指针, 别进沼泽, 别替死人签借条。</span>'+
        '这三条是本店仅有的售后。'),next:-1}
    ];
    nodes.onEnd=function(){SET(api,'mem_met_granny');STEP(api,'mem_m1');};
    return nodes;
  }

  var sd=FLAG(api,'mem_stack_done'),ld=FLAG(api,'mem_list_done'),lru=FLAG(api,'mem_lru_done');

  if(lru){
    var allCh=FLAG(api,'mem_challenge_1')&&FLAG(api,'mem_challenge_2')&&FLAG(api,'mem_challenge_3');
    nodes=[fixed,
      {sp:SP,t:B(
        'The temple opened for you? Good hands. <span class="dim">(She flips the ledger to the last page and taps it.)</span><br>'+
        'This line is the only one in the whole book ever settled in full: <span class="k">"Lent: 4 bytes. Returned: 4 bytes. Note: points nowhere."</span> '+
        '— A null pointer is a fine thing. What knows it points at nothing never points wrong.',
        '神庙的门开了? 手不错。<span class="dim">(她把账簿翻到最后一页, 指给你看)</span><br>'+
        '这一笔, 是全账簿唯一还清了的: <span class="k">「借: 4 字节。还: 4 字节。备注: 指向无处。」</span>'+
        '——空指针 (null pointer) 是好东西。知道自己一无所指的, 从不指错。')},
      {sp:SP,t:B(
        '<span class="dim">(She closes the ledger — then stops, and raps the back cover with a fingernail.)</span><br>'+
        '…One oldest line remains. From 0x0000, <span class="k">a block the size of a world</span>. '+
        'The borrower\'s signature is corroded away. All that\'s left is one letter: <span class="k">W</span>.<br>'+
        'How much? Take it — <span class="k">and remember to give it back</span>. I\'ve been waiting twenty years to say that to him.',
        '<span class="dim">(她合上账簿, 却又停住, 用指甲敲了敲封底)</span><br>'+
        '……还有最老的一笔没销。0x0000 起, <span class="k">整整一座世界那么大</span>。'+
        '借款人的签名被电蚀掉了, 只剩一个字母: <span class="k">W</span>。<br>'+
        '要多少? 拿了, <span class="k">记得还</span>。——这话我等着说给他听, 说了二十年。'),next:allCh?2:-1}];
    if(allCh)nodes.push({sp:SP,t:B(
      '<span class="dim">(She looks at you over her glasses — the look she reserves for settled accounts.)</span><br>'+
      'Five-book tower. Both directions of a chain. The blind ledger. <span class="k">Three challenges, three clean receipts.</span><br>'+
      'When this maze finally gets recycled, I\'ll tell the collector to file you under <span class="k">assets</span>.',
      '<span class="dim">(她从老花镜上方看你——那是她留给"已结清账目"的眼神)</span><br>'+
      '五重书塔、双向的链、盲算账本。<span class="k">三项挑战, 三张干净的回执。</span><br>'+
      '等这条迷宫终于被回收的那天, 我会告诉回收者: 这个人, 记在<span class="k">资产</span>一栏。'),next:-1});
    return nodes;
  }
  if(sd&&ld){
    return [fixed,
      {sp:SP,t:B(
        'The library runs, the chain holds. A moment ago the stone door up north went <span class="k">clack</span> — the Temple is waiting for you.',
        '书库顺了, 链也接上了。北面的石门方才「咔」了一声——<span class="k">神庙在等你</span>。')},
      {sp:SP,t:B(
        'Carry one sentence in: <span class="k">front leaves, rear arrives, and when the ring is full, no amount of wishing makes a fifth seat.</span><br>'+
        '<span class="dim">Don\'t guess by feel. Count the seats.</span>',
        '进去记牢一句: <span class="k">front 走, rear 来, 环满了就是满了, 想也想不出第五个座位</span>。'+
        '<span class="dim">别凭感觉猜。数清楚座位数。</span>'),next:-1}];
  }
  if(sd&&!ld){
    return [fixed,
      {sp:SP,t:B(
        'Heard about the library — clean work. The <span class="k">Broken Chain Cloister</span> east still waits. '+
        'Remember: linked lists know each other by pointer, not by postcode. <span class="k">Data ascending, tail into NULL.</span><br>'+
        '<span class="dim">And never, ever close the circle. The last one who did is still in there, running laps.</span>',
        '书库那边我听说了, 干净利落。还差东边的<span class="k">断链回廊</span>——'+
        '记着: 链表靠指针相认, 不靠住址。<span class="k">数据升序, 尾指 NULL</span>。'+
        '<span class="dim">千万别连成环。上一个连成环的, 现在还在里面跑圈。</span>'),next:-1}];
  }
  if(!sd&&ld){
    return [fixed,
      {sp:SP,t:B(
        'Chain\'s mended? Good hands. The <span class="k">Stack Library</span> north-west remains — '+
        'in at the top, out at the top, <span class="k">LIFO</span>, no third verb. '+
        'Don\'t yank buried books; shuffle them through the return cart. <span class="dim">If the tower collapses, it goes on YOUR tab.</span>',
        '链接上了? 好手艺。还剩西北的<span class="k">栈书库</span>——'+
        '塔顶进, 塔顶出, <span class="k">LIFO</span>, 没有第三种动作。'+
        '压在下面的书别硬抽, 用旁边的归还车倒腾。<span class="dim">书塌了算你借的。</span>'),next:-1}];
  }
  return [fixed,
    {sp:SP,t:B(
      'Both still broken. The <span class="k">Stack Library</span> north-west, the <span class="k">Broken Chain Cloister</span> east — '+
      'fix those, then we talk temples. <span class="dim">(She goes back to the ledger. A page turns; it is solid, unreturned loans, top to bottom.)</span>',
      '两处都还坏着呢。西北<span class="k">栈书库</span>, 东边<span class="k">断链回廊</span>——'+
      '修完再谈神庙。<span class="dim">(她重新低头记账。账簿哗啦翻过一页, 上面密密麻麻全是没销掉的借条)</span>')},
    {sp:SP,t:B(
      '<span class="dim">(Her pen stops mid-entry, hanging in the air.)</span> …You didn\'t ask how it all broke, but I\'ll say it anyway. It wasn\'t a crash. One morning — inside a single minute — every new allocation request stopped arriving. All of them. All at once. The maze went quiet like a ledger being closed.<br><span class="dim">Twenty years since that minute, and not one new loan.</span>',
      '<span class="dim">(她记账的笔停在半空。)</span>……你没问这里是怎么坏的, 我也说给你听。不是炸的。是某个上午——就那么一分钟——所有新的分配请求同时断了。一个不剩, 一起断的。整条迷宫安静下来, 像一本被人合上的账。<br><span class="dim">从那一分钟起, 二十年, 再没有一笔新账。</span>'),next:-1}];
}

/* 僵尸进程 Z-2047 —— 死了 20 年, 父进程从没 wait() 它 */
function zombieDialog(api){
  var SP=B('Zombie Process Z-2047','僵尸进程 Z-2047');
  var end=FLAG(api,'mem_zomb_end');

  if(end){
    var t=end==='rest'
      ? B('<span class="dim">(The corner is empty. On the process-table slab, the line reading &lt;defunct&gt; has been gently wiped away, leaving a shallow groove. '+
          'Someone has soldered four small words into it: <span class="k">exit 0. sweet dreams.</span>)</span>',
          '<span class="dim">(墙角空了。进程表的石板上, 那一行 &lt;defunct&gt; 被轻轻擦去, 只留一格浅浅的凹痕。'+
          '凹痕里有人用焊锡补了四个小字: <span class="k">exit 0, 好梦</span>。)</span>')
      : end==='embellish'
      ? B('<span class="dim">(The corner is empty. The &lt;defunct&gt; line is gone; beside it, one line that belongs to no log format: '+
          '<span class="k">"He said you did so, so well."</span> — no checksum. The sentence you added became the last packet it carried home.)</span>',
          '<span class="dim">(墙角空了。石板上那行 &lt;defunct&gt; 擦去了, 旁边多了一行不属于任何日志格式的字:'+
          '<span class="k">「他说, 你做得非常好。」</span>——没有校验和 (checksum)。你补的那句, 成了它带走的最后一个包。)</span>')
      : B('<span class="dim">(The corner is empty. Two drained old capacitors sit side by side on the floor — like two someones sat here a long while, talking about nothing. '+
          'The &lt;defunct&gt; line is gone; in its place, small letters: <span class="k">"the extra while was living too."</span>)</span>',
          '<span class="dim">(墙角空了。地上并排放着两枚喝空的旧电容——像两个人在这儿坐了很久, 聊了很多废话。'+
          '石板上那行 &lt;defunct&gt; 消失了, 换成一行小字: <span class="k">「多赚的那一会儿, 也是活着。」</span>)</span>');
    return [{sp:B('',''),t:t,next:-1}];
  }

  if(!FLAG(api,'mem_zomb_met')){
    var nodes=[
      {sp:B('???','？？？'),t:B(
        '<span class="dim">(A process sits in the corner, its outline grey and nearly transparent. On the process-table slab before it, after its name, one word: <span class="k">&lt;defunct&gt;</span>)</span><br>'+
        '…Don\'t touch me. You can\'t anyway. I\'ve been dead for 20 years.',
        '<span class="dim">(墙角坐着一个进程, 轮廓灰得几乎透明。它面前的进程表石板上刻着它的名字, '+
        '后面缀着一个词: <span class="k">&lt;defunct&gt;</span>)</span><br>……别碰我。碰不到的。我死了 20 年了。')},
      {sp:SP,t:B(
        'Finished the job, then died — finished it <i>well</i>, mind you. <span class="k">Exit code all ready: 0.</span> One successful call, start to finish. '+
        'All I need is my father to <span class="k">wait()</span> on me — collect my exit status — and I get struck off the table. Clean. Done.',
        '干完活就死了——干得还挺漂亮, <span class="k">退出码 (exit code) 都准备好了, 0</span>, 一次成功的调用。'+
        '就等我爸来 <span class="k">wait()</span> 一下, 把退出码收走, 我就能从进程表上销号, 干干净净地走。')},
      {sp:SP,t:B(
        'He never came. He\'s <span class="k">httpd</span> — the night watchman in the north-east machine room, port 80, busy listening for requests that stopped coming 20 years ago.<br>'+
        '<span class="dim">The Recycler has walked past me eight thousand times. It shakes its head every time — zombies aren\'t its department. '+
        'A zombie must be buried by its own parent. Old rules.</span>',
        '他没来。他是 <span class="k">httpd</span>, 东北机房那个守夜的, 端口 80, 忙着监听 20 年前就不再来的请求。<br>'+
        '<span class="dim">回收者路过我八千次了, 每次都摇头——僵尸不归它管, '+
        '僵尸要由父进程亲手安葬, 这是老规矩。</span>'),choices:[
        {t:B('I\'ll go find httpd. You\'ll get your wait().','我去找 httpd, 让它给你一个 wait()。'),next:3,do:function(){SET(api,'mem_zomb_met');STEP(api,'mem_s1');}},
        {t:B('(Come back later)','(先去忙别的)'),next:4}
      ]},
      {sp:SP,t:B(
        '…You\'d go? <span class="dim">(It tries to stand up, forgetting it can\'t.)</span><br>'+
        'North-east corner, follow the 0x3F row of floor tiles to the end. Just carry one line for me: <span class="k">"The job is done. Exit code 0."</span> '+
        'Nothing else. He\'s busy.',
        '……你肯去? <span class="dim">(它想站起来, 忘了自己站不起来)</span><br>'+
        '东北角, 顺着 0x3F 排的地砖走到头。替我带一句就行: <span class="k">「活干完了, 退出码是 0。」</span>'+
        '别的不用说。他忙。'),next:-1},
      {sp:SP,t:B(
        'Mm. Everyone\'s busy. <span class="dim">(It goes back to counting the letters of the word after its name. d-e-f-u-n-c-t. Seven. '+
        'It has counted for 20 years. It is always seven.)</span>',
        '嗯, 都忙。<span class="dim">(它低头继续数自己名字后面那个词的字母。d-e-f-u-n-c-t, 七个。'+
        '它已经数了 20 年, 每次都是七个。)</span>'),next:-1}
    ];
    return nodes;
  }

  if(!FLAG(api,'mem_waiver')){
    return [{sp:SP,t:B(
      'North-east machine room, port 80. …If he\'s too swamped to look up, don\'t push him. '+
      '<span class="dim">(A pause.)</span> And don\'t tell him how long I waited. <span class="k">Say I died recently. Say it didn\'t hurt.</span>',
      '东北机房, 端口 80。……要是他忙得抬不起头, 也别为难他。'+
      '<span class="dim">(它顿了顿)</span> 也别告诉他我等了多久。<span class="k">就说我刚死没多久, 不疼。</span>'),next:-1}];
  }

  /* 委托书在手 —— 情感抉择 */
  function fin(kind){SET(api,'mem_zomb_end',kind);STEP(api,'mem_s3');}
  return [
    {sp:SP,t:B(
      '<span class="dim">(It spots the wait() warrant in your hand at once — httpd\'s signature on the corner, the port seal still warm.)</span><br>'+
      '…He signed it? He really signed it. <span class="dim">(It reaches out to touch the paper; its fingers pass through.)</span><br>Read it to me.',
      '<span class="dim">(它一眼看见你手里的 wait() 委托书——纸角上有 httpd 的签名, 端口章还热着)</span><br>'+
      '……他签了? 他真的签了。<span class="dim">(它伸手想碰, 手指从纸上穿了过去)</span><br>念给我听吧。'),choices:[
      {t:B('Read it straight: "exit status 0 — terminated normally. The client returned 200."','如实宣读: 「exit status 0, 正常终止。客户端回了 200。」'),next:1},
      {t:B('Add a line he never wrote: "He says you did so, so well."','补一句他没写的: 「他说, 你做得非常好。」'),next:3},
      {t:B('"No rush. Let me sit with you a while first."','「不急。我先陪你坐一会儿。」'),next:5}
    ]},
    {sp:B('You','你'),t:B(
      '"wait() accepted. exit status 0 — terminated normally, no errors. Addendum: the request you carried — <span class="k">the client returned 200 OK</span>. '+
      'Your whole life was one successful call."',
      '「wait() 受理。exit status 0 —— 正常终止, 无错误。附言: 那个请求, 客户端回了 <span class="k">200 OK</span>。'+
      '它这一生, 是一次成功的调用。」'),next:2},
    {sp:SP,t:B(
      '<span class="dim">(It goes very quiet. Then its outline begins to brighten, cell by cell, as if being read out byte by byte.)</span><br>'+
      '200… it arrived. So I finished. <span class="k">So I did well.</span><br>'+
      'The table is striking my number — and this time it\'s <span class="k">the good kind of being struck off</span>. Thank you. For carrying my return value home.',
      '<span class="dim">(它安静下来, 轮廓开始一格一格变亮, 像被逐字节读取)</span><br>'+
      '200……收到了啊。原来我做完了。<span class="k">原来我做得很好。</span><br>'+
      '进程表要销我的号了——这次是<span class="k">好的销号</span>。谢谢你, 把我的返回值送到了家。'),
      choices:[{t:B('(Watch it scatter into quiet bytes)','(目送它散成一串安静的字节)'),next:-1,do:function(){fin('rest');}}]},
    {sp:B('You','你'),t:B(
      '"wait() accepted, exit status 0. …One more thing. He asked me to tell you: <span class="k">you did so, so well.</span>" '+
      '<span class="dim">(That line is not on the warrant. The checksum will never match. Your voice does not shake.)</span>',
      '「wait() 受理, exit status 0。……还有, 他让我带一句话: <span class="k">你做得非常好。</span>」'+
      '<span class="dim">(这句不在委托书上。校验和 (checksum) 对不上。你念得很稳。)</span>'),next:4},
    {sp:SP,t:B(
      '<span class="dim">(It smiles. A process dead for 20 years, and the smile still has warmth left in it.)</span><br>'+
      'My dad… worked his whole life and never once said things like that. <span class="k">So it must be true.</span><br>'+
      '<span class="dim">(It scatters into light, holding that checksum-less sentence in its innermost layer — like a block of memory no one is ever allowed to free.)</span>',
      '<span class="dim">(它笑了。死了 20 年的进程, 笑起来居然还有余温)</span><br>'+
      '我爸这人……忙了一辈子, 从不说这种话。<span class="k">所以一定是真的。</span><br>'+
      '<span class="dim">(它散成光, 那句没有校验和的话被它抱在最里层, 像抱着一块不许任何人 free 的内存)</span>'),
      choices:[{t:B('(Put the warrant away)','(收起委托书)'),next:-1,do:function(){fin('embellish');}}]},
    {sp:SP,t:B(
      '…Sit with me? <span class="dim">(It freezes.)</span> Twenty years. Processes that pass here come in two kinds: '+
      'the ones who walk around me, and the ones who walk through me. You\'re the first to sit down.',
      '……坐一会儿? <span class="dim">(它愣住)</span> 20 年了, 路过的进程只有两种: 绕开我的, 和穿过我的。'+
      '坐下来的, 你是第一个。'),next:6},
    {sp:SP,t:B(
      '<span class="dim">(You talk for a long time. About the one job it ever did: someone far away clicked "save", and it carried those 4KB home. '+
      'About the smell of the swamp. About rumours of Granny malloc\'s youth. About how the Recycler practises bowing when it thinks no one is watching.)</span><br>'+
      '…Alright. <span class="k">The extra while was worth the whole wait.</span> Read it now — while I still remember how to be happy.',
      '<span class="dim">(你们聊了很久。聊它干过的那个活: 很远的地方有人点了一次「保存」, 它负责把那 4KB 送到家。'+
      '聊沼泽的味道, 聊 malloc 婆婆年轻时的传闻, 聊回收者其实会在没人的时候练习鞠躬。)</span><br>'+
      '……好了。<span class="k">多赚的这一会儿, 够本了。</span>念吧, 趁我还记得怎么高兴。'),
      choices:[{t:B('(Read the warrant: exit status 0, terminated normally)','(宣读委托书: exit status 0, 正常终止)'),next:7}]},
    {sp:SP,t:B(
      '<span class="dim">(It scatters slowly — slowly enough to hear every piece of small talk one more time.)</span><br>'+
      'Thank my dad for me. …And tell him one more thing: <span class="k">it\'s allowed to doze on night watch, once in a while. No request will blame him.</span>',
      '<span class="dim">(它散得很慢, 慢到来得及把每一句废话都再听一遍)</span><br>'+
      '替我谢谢我爸。……再替我告诉他: <span class="k">守夜的时候, 偶尔也可以打个盹。没有请求会怪他的。</span>'),
      choices:[{t:B('(Write that down)','(记下这句话)'),next:-1,do:function(){fin('stay');}}]}
  ];
}

/* httpd —— 僵尸的父进程, 守夜 daemon, 20 年没敢 wait() */
function httpdDialog(api){
  var SP=B('Night Watchman httpd','守夜进程 httpd');
  var fixed={sp:SP,t:B(
    '<span class="dim">(Deep in the machine room, a process stands with its back to you, guarding a row of ports that lost signal long ago — '+
    'posed like a statue stuck mid-accept().)</span><br>'+
    'Port 80. Listening. …You are not an HTTP request. Kindly do not occupy the connection.',
    '<span class="dim">(机房深处, 一个进程背对着你, 守着一排早已没有信号的网口, 姿势像一尊被 accept() 卡住的雕像)</span><br>'+
    '端口 80, 监听中。……你不是 HTTP 请求。请勿占用连接。')};

  if(FLAG(api,'mem_zomb_end')){
    var end=FLAG(api,'mem_zomb_end');
    var line=end==='rest'
      ? B('The strike-off receipt reached me. <span class="k">exit 0.</span> …Good kid. Never raised a single error, its whole life.<br>'+
          '<span class="dim">(It turns back to the ports. In that row of indicator lights, one burns unusually steady tonight.)</span>',
          '销号回执我收到了。<span class="k">exit 0。</span>……好孩子, 一辈子没报过错。<br>'+
          '<span class="dim">(它转回网口。那一排指示灯里, 有一颗今晚格外稳。)</span>')
      : end==='embellish'
      ? B('The receipt arrived. …You added a line of your own, didn\'t you. <span class="dim">(It does not turn around.)</span><br>'+
          'The kind of sentence whose checksum never matches. I couldn\'t have said it in a thousand epochs. <span class="k">Put it on my tab.</span>',
          '回执收到了。……你替我多说了一句什么, 对吧。<span class="dim">(它没有回头)</span><br>'+
          '校验和对不上的那种话, 我这辈子说不出口。<span class="k">记我账上。</span>')
      : B('I hear you sat with it, all the way to the end. …And the sentence it sent me — received.<br>'+
          '<span class="dim">(That night, the watchman of port 80 dozed for the first time in 20 years. Three seconds. No request blamed him.)</span>',
          '听说你陪它坐到了最后。……它让你带的那句话, 我收到了。<br>'+
          '<span class="dim">(那晚, 端口 80 的守夜进程打了 20 年来第一个盹, 一共 3 秒。没有请求怪它。)</span>');
    return [fixed,{sp:SP,t:line,next:-1}];
  }

  if(FLAG(api,'mem_waiver')){
    return [fixed,
      {sp:SP,t:B(
        'You have the warrant? Then go. Do not occupy the connection.<br>'+
        '<span class="dim">(You are two steps away when it adds, barely audible)</span> …Or walk slowly, if you like. Give me a moment to buffer.',
        '委托书带好了? 去吧。别占用连接。<br>'+
        '<span class="dim">(你走出两步, 它在身后极轻地补了一句)</span> ……走慢一点也行。让我多缓冲 (buffer) 一会儿。'),next:-1}];
  }

  if(FLAG(api,'mem_zomb_met')){
    var nodes=[
      fixed,
      {sp:B('You','你'),t:B(
        '"Z-2047 sends word: <span class="k">the job is done. Exit code 0.</span>"',
        '「Z-2047 让我带句话: <span class="k">活干完了, 退出码是 0。</span>」')},
      {sp:SP,t:B(
        '<span class="dim">(For the first time, the listening loop skips a beat. The room is so quiet you can hear capacitors leaking.)</span><br>'+
        '…I know. Of course I know. It died four epochs after I forked it. I read the process table every day — '+
        '<span class="k">its name is on line 2047. It has hung there for 20 years.</span>',
        '<span class="dim">(监听循环第一次卡了一拍。整个机房安静得能听见电容漏电。)</span><br>'+
        '……我知道。我当然知道。它死在我 fork 它之后的第 4 个纪元, 进程表我天天看, '+
        '<span class="k">它的名字在第 2047 行, 挂了 20 年。</span>')},
      {sp:SP,t:B(
        'Every loop I think: next idle cycle, I\'ll wait() on it. Then I think: what if a request comes exactly then? A watchman doesn\'t leave his post. '+
        '<span class="dim">— Excuses. All of it.</span><br>'+
        'The truth is simpler: <span class="k">to read its exit code is to admit it is really over.</span> '+
        'As long as I don\'t read it, it stays on the table. Hanging there. But… on the table.',
        '每一轮循环我都想: 下个空闲周期就去 wait() 它。然后又想: 万一这时候来了请求呢? 守夜的不能离岗。'+
        '<span class="dim">——都是借口。</span><br>'+
        '真正的原因是: <span class="k">读了它的退出码, 就等于承认它真的结束了。</span>'+
        '不读, 它就还挂在表上。挂着, 至少……还在表上。'),},
      {sp:SP,t:B(
        '<span class="dim">(It finally pulls one hand out of the loop, produces a form with scorched edges, signs it, and stamps it with the port seal.)</span><br>'+
        'A <span class="k">wait() warrant</span>. I cannot leave my post; you will accept its exit status in my stead.<br>'+
        'And — on the back I copied one log line, 20 years old: <span class="k">the request it carried — the client returned 200 OK.</span> '+
        'Read that to it. Its whole life was one successful call.',
        '<span class="dim">(它终于从循环里抽出一只手, 摸出一张边缘烧焦的表单, 签下名字, 盖上端口章)</span><br>'+
        '<span class="k">wait() 委托书</span>。我离不开岗, 你替我去受理它的退出码。<br>'+
        '还有——委托书背面我抄了一条日志, 20 年前的: <span class="k">那个请求, 客户端回了 200 OK。</span>'+
        '念给它听。它这一生, 是一次成功的调用。'),choices:[
        {t:B('(Take the warrant)','(接过委托书)'),next:5}
      ]},
      {sp:SP,t:B(
        '<span class="dim">(It turns back to the ports, its pose identical to the inspection photo from 20 years ago — '+
        'except the hand that held the pen, which hovers a long time before returning to its key.)</span><br>'+
        'Three nonexistent requests just joined the queue. Go. <span class="k">Don\'t make it wait one more epoch.</span>',
        '<span class="dim">(它转回网口, 姿势和 20 年前的巡检照片完全一致——只有握过笔的那只手, 迟迟没有放回键位)</span><br>'+
        '队列里又排进了三个不存在的请求。去吧。<span class="k">别让它再等一个纪元。</span>'),next:-1}
    ];
    nodes.onEnd=function(){
      SET(api,'mem_waiver');STEP(api,'mem_s2');
      GIVE(api,'wait_slip',B('wait() Warrant','wait() 委托书'));
    };
    return nodes;
  }

  return [fixed,
    {sp:SP,t:B(
      'Twenty years. Not one packet. I\'m still listening. <span class="dim">Occupational disease of daemons: we can\'t tell devotion from not daring to leave.</span><br>'+
      '…I have the 404 page memorised. Want to hear it? No? Fine. <span class="dim">A daemon that hasn\'t told a joke in 20 years. The syntax gets rusty. Forgive me.</span>',
      '20 年了, 一个包都没来过。我还在听。<span class="dim">daemon 的职业病: 分不清「尽职」和「不敢走」。</span><br>'+
      '……404 页面我都背下来了。要听吗? 不要? 好。<span class="dim">守夜的 daemon 二十年没讲过笑话, 语法生疏, 见谅。</span>'),next:-1}];
}

/* ================================================================
   6. 室内地图 (26 × 18) —— 迷宫即内存条
   #=墙(1) .=地板(0)
   西北房=栈书库 东北房=httpd 机房 顶中密室=环形队列神庙
   东南角 x19..24,y14..16 = 内存泄漏沼泽 (走近触发 toast)
   ================================================================ */
var ROWS=[
  '##########################',  // 0
  '#........#......#........#',  // 1
  '#.######.#.####.#.######.#',  // 2
  '#.#....#.#.#..#.#.#....#.#',  // 3   栈书库(4,3) 神庙(12,3) 铭文(13,3) httpd(20,3)
  '#.#....#...#..#...#....#.#',  // 4
  '#.#.####.###..###.####.#.#',  // 5
  '#.#....................#.#',  // 6   段错误碑(6,6) 布局碑(17,6)
  '#.#####.####..####.#####.#',  // 7
  '#........................#',  // 8
  '#.####.####....####.####.#',  // 9
  '#........................#',  // 10  接骨(20,10)
  '####.####..####..####.####',  // 11
  '#........................#',  // 12  回收者记录(2,12)
  '#.####.##..####..##.####.#',  // 13
  '#........................#',  // 14  婆婆(11,14) 沼泽警示牌(20,14)
  '#..####..####..####..###.#',  // 15  僵尸(2,15)
  '#........................#',  // 16  出生点(12,16)
  '##########################'   // 17
];
var TILES=ROWS.map(function(r){return r.split('').map(function(c){return c==='#'?1:0;});});

/* 内存泄漏沼泽: 巡检器 —— 玩家踏入东南角时 toast 环境叙事 */
var SWAMP={x0:19,y0:14,x1:24,y1:16};
var SWAMP_LINES=[
  B('⚠ The ground gives way — you\'ve stepped into the Memory Leak Swamp. This floor was borrowed 700 epochs ago and never returned.',
    '⚠ 脚下一软——你踩进了内存泄漏沼泽 (Memory Leak Swamp)。地面是 700 纪元前借出、再没人归还的内存。'),
  B('The swamp burps up half a comment: "// TODO: remember to free". That TODO will never be DONE.',
    '沼泽咕嘟冒了个泡, 吐出半句注释: "// TODO: 记得 free"。这条 TODO 永远不会 DONE 了。'),
  B('A loan slip floats in the sludge: "1.2GB — borrower: vision_helper (deceased)". Leaked memory is never freed — and never laid to rest.',
    '泥浆里泡着一张借条: 「1.2GB, 借款人: vision_helper (已殁)」。泄漏的内存永不释放 (free)——也永不安眠。'),
  B('⚠ The Recycler stands at the swamp\'s edge, motionless. It sees every byte and can collect none of them: a dead process\'s loan slip is still a loan slip.',
    '⚠ 回收者站在沼泽边缘, 一动不动。它看得见每一字节, 却一字节都收不走: 死人的借据也是借据。')
];
var swampTimer=null,swampLast=0,swampIdx=0;
function startSwampWatch(api){
  if(swampTimer)return;
  swampTimer=setInterval(function(){
    try{
      var p=api&&api.player;if(!p)return;
      if(p.x>=SWAMP.x0&&p.x<=SWAMP.x1&&p.y>=SWAMP.y0&&p.y<=SWAMP.y1){
        var now=Date.now();
        if(now-swampLast>7000){
          swampLast=now;
          TOAST(api,SWAMP_LINES[swampIdx++%SWAMP_LINES.length],true);
          S(api,'err');
        }
      }
    }catch(e){}
  },700);
}

/* ================================================================
   7. 模块定义
   ================================================================ */
var MOD={
  id:'memory',
  title:B('Memory Maze','内存迷宫'),
  world:'as',
  unlock:{afterQuest:'m3'},   // index.html 第一章末任务实际 id = m3

  interior:{w:26,h:18,tiles:TILES,playerStart:{x:12,y:16}},

  npcs:[
    {id:'mem_granny',name:B('Granny malloc','malloc 婆婆'),color:'#e8c46a',body:'#f5e0b0',suit:'#8a6a2a',
     x:11,y:14,dialog:grannyDialog},
    {id:'mem_zombie',name:B('Zombie Process Z-2047','僵尸进程 Z-2047'),color:'#9ad0a8',body:'#cfeeda',suit:'#4a7a5a',
     x:2,y:15,dialog:zombieDialog},
    {id:'mem_httpd',name:B('Night Watchman httpd','守夜进程 httpd'),color:'#7ab0d8',body:'#c0dcf0',suit:'#2a5a7a',
     x:20,y:3,dialog:httpdDialog}
  ],

  steles:[
    /* 知识彩蛋类 (codex 📖 挂钩, 顶部人话引子) */
    {x:6,y:6,codex:['out-of-bounds'],text:B(
      '<span class="dim">(Rumour says this stone lists everyone who reached exactly one step too far.)</span><br>'+
      '[SEGFAULT MEMORIAL]<br>In memory of every process that died out of bounds —<br><br>'+
      'Epoch 0x01: buffer_helper wrote <span class="k">one byte</span> too many; its neighbour\'s return address became its last words.<br>'+
      'Epoch 0x2C: str_cpy never found its \\0 and copied clean off the edge of the world, flattening three civilisations en route.<br>'+
      'Epoch 0x9F: someone reached for element 10 of an array — the array had 10 elements, <span class="k">numbered 0 to 9</span>.<br><br>'+
      'They have no graves. Only core dumps.<br><span class="dim">— Signed: SIGSEGV · signal 11 · no exceptions made</span>',
      '<span class="dim">(据说这块碑上记的, 都是伸手多够了一寸的家伙。)</span><br>'+
      '【段错误纪念碑】<br>谨此纪念所有死于越界访问 (out of bounds) 的进程——<br><br>'+
      '第 0x01 纪元: buffer_helper 多写了 <span class="k">1 个字节</span>, 邻居的返回地址成了它的遗言。<br>'+
      '第 0x2C 纪元: str_cpy 没等到 \\0, 一路复制到世界的尽头, 顺路抹平了三个文明。<br>'+
      '第 0x9F 纪元: 有人对着数组第 10 格伸手——数组只有 10 格, <span class="k">编号 0 到 9</span>。<br><br>'+
      '它们没有坟墓, 只有 core dump。<br><span class="dim">—— 落款: SIGSEGV · 11 号信号 · 一视同仁</span>')},
    {x:13,y:3,codex:['queue','circular_queue'],text:B(
      '<span class="dim">(Rumour has it this lintel is about a line that queues in a circle.)</span><br>'+
      '[TEMPLE LINTEL · WORN SMOOTH BY HANDS]<br>"The seats are few. The pilgrims are not. So the line does not run straight — '+
      'it bends back on itself, and the seat a pilgrim just left welcomes the next guest the moment it cools.<br><br>'+
      '<span class="k">Front</span> is whoever has waited longest. <span class="k">Rear</span> is the seat closest to filling. '+
      'When both point at the same place… look twice. That seat might be holding everyone, or holding no one at all."',
      '<span class="dim">(据说这块门楣在讲一种会绕圈子排队的队伍。)</span><br>'+
      '【神庙门楣 · 被手摸得发亮】<br>「座位不多, 朝圣者不少。所以队伍不排成直线——它弯回自己身上, '+
      '前一位刚起身, 那座位一凉, 立刻迎来下一位。<br><br>'+
      '<span class="k">front</span> 是等得最久的那位。<span class="k">rear</span> 是离坐满最近的那个座位。'+
      '若两者指向同一处……多看一眼, 那可能是坐满了, 也可能是空无一人。」')},
    /* 剧情类 (纯故事/世界观, 零知识门槛, 不挂 codex) */
    {x:17,y:6,text:B(
      '[THE MARCHING STONE]<br>Old maze folklore, still told over cold tea at Granny malloc\'s counter: two armies live in these walls, '+
      'and they have marched toward each other since the day the machine was born. One calls itself the Stack. The other, the Heap. '+
      'Nobody agrees any more who started walking first.<br><br>'+
      'The gap between them is said to shrink a little every year. Granny malloc swears the day they finally shake hands already has a name: '+
      '<span class="k">Stack Overflow</span>.<br><span class="dim">(Not the website. Though half the maze still gets the two confused, '+
      'and argues about it purely for sport.)</span>',
      '【行军石】<br>迷宫的老传说, 至今还在 malloc 婆婆的柜台边就着冷茶讲: 这堵墙里住着两支军队, '+
      '从这台机器出生那天起就相向而行。一支自称"栈"(Stack), 另一支叫"堆"(Heap)。'+
      '谁先迈的第一步, 现在已经没人说得清了。<br><br>'+
      '据说它们之间的空地一年比一年窄。malloc 婆婆信誓旦旦: 它们终有一天握手的那天, 早就有名字了——'+
      '<span class="k">Stack Overflow</span>。<br><span class="dim">(不是那个网站。不过迷宫里一半人还是会把这两件事搞混, '+
      '然后单纯为了抬杠吵上一架。)</span>')},
    {x:20,y:14,text:B(
      '[HANDWRITTEN SIGN, NAILED ON CROOKED]<br>DO NOT GO IN.<br><br>'+
      'Something was borrowed here, a long time ago, and it was never given back. Whoever lent it is long gone. The debt just… stayed.<br>'+
      'Old-timers say the swamp doesn\'t get any smaller. It only gets quieter.<br><br>'+
      '<span class="dim">(Underneath, in a different hand: "asked the ground for a receipt once. it didn\'t answer either.")</span>',
      '【手写警示牌, 钉得歪歪的】<br>禁止入内。<br><br>'+
      '很久以前, 这里借走了什么东西, 从没还回来。借的人早就不在了。这笔账, 就那么僵在了原地。<br>'+
      '老住户都说, 这片沼泽不会变小, 只会变得越来越安静。<br><br>'+
      '<span class="dim">(牌子下面是另一种笔迹加的一行: "跟地皮要过一次收据。它也没回答。")</span>')},
    {x:2,y:12,text:B(
      '[A PAGE TORN FROM THE RECYCLER\'S LOGBOOK]<br>Patrol complete. Nothing new to collect today.<br><br>'+
      'The swamp, again. I walk past it every round. I can see exactly what\'s owed and to whom — and I\'m not allowed to touch a scrap of it, '+
      'not while something out there still, technically, owns it.<br>'+
      'The one in the corner, again. Not mine to bury. A parent has to do that themselves. Nobody ever explained that rule to me kindly.<br><br>'+
      'At the bottom, one line scratched out and rewritten so many times the stone has gone thin there:<br>'+
      '<span class="k">"Doing one\'s duty properly means: some days, you help no one at all."</span>',
      '【回收者日志撕下的一页】<br>巡视完毕。今日待回收: 0。<br><br>'+
      '又是那片沼泽。我每一圈都从旁边走过。我看得清清楚楚哪块地欠着谁, 却一寸都碰不得——'+
      '只要外面还有什么东西, 名义上, 还占着它。<br>'+
      '墙角那位, 也还是老样子。不是我该埋的。得他自己的父进程动手。这规矩, 从没人好好跟我解释过。<br><br>'+
      '记录末尾, 有一行反复涂掉又写上、写到石头都磨薄了的字:<br>'+
      '<span class="k">"尽好本分的意思是: 有些日子, 你谁也帮不上。"</span>')}
  ],

  quests:[
    {id:'mem_main',line:'main',title:B('Memory Maze: Borrow & Return','内存迷宫: 借与还'),
     syllabus:'10.2 Introduction to Abstract Data Types (Stack · Circular Queue · Linked List)',
     desc:B('Granny malloc\'s ledger records every loan in the maze. Two data structures have been broken for 700 years, and the temple up north is waiting for someone who understands going in circles.',
            'malloc 婆婆的账簿上记着整座迷宫的借与还。两处数据结构 (data structures) 坏了 700 年, 北面的神庙在等一个懂得周而复始的人。'),
     steps:[
       {id:'mem_m1',text:B('Meet Granny malloc at the counter ("How much? Remember to give it back.")',
                           '到柜台见 malloc 婆婆 (要多少? 拿了记得还)')},
       {id:'mem_m2',text:B('Fix the Stack Library (top in, top out) and the Broken Chain Cloister (relink ascending · tail to NULL)',
                           '修好栈书库(只准顶端进出)与断链回廊(升序重连·尾指 NULL)')},
       {id:'mem_m3',text:B('Pass the seating trial of the Circular Queue Temple','通过环形队列神庙的判断试炼')}
     ]},
    {id:'mem_side',line:'side',title:B('The Defunct on Line 2047','第 2047 行的 defunct'),
     syllabus:'10.4 ADT in the wild: the process table as a linked structure (narrative)',
     desc:B('The zombie process in the corner has been dead for 20 years, exit code clutched in hand, while its father httpd never dared to wait() on it.',
            '墙角的僵尸进程死了 20 年, 退出码攥在手里, 父进程 httpd 却始终没敢来 wait() 它。'),
     steps:[
       {id:'mem_s1',text:B('Hear out Zombie Process Z-2047\'s long wait','听僵尸进程 Z-2047 说完它的等待')},
       {id:'mem_s2',text:B('Find Night Watchman httpd in the north-east machine room and ask for a wait()','去东北机房找守夜进程 httpd, 要一个 wait()')},
       {id:'mem_s3',text:B('Return with the warrant and see it off','带着委托书回去, 送它最后一程')}
     ]}
  ],

  puzzles:[
    {id:'mem_stack',x:4,y:3,title:B('The Stack Library','栈书库'),
     syllabus:'10.2 ADT: Stack — LIFO · push/pop (two-stack sort)',
     codex:['stack'],
     primer:{title:B('What is a stack?','栈 (stack) 是什么?'),
       body:B(
         '① A stack is a pile where you can only touch the <b>TOP</b> — nothing else.<br>'+
         '<pre>   PUSH ↓\n ┌─────────┐\n │ book  3 │ ◂ top (only this one is reachable)\n ├─────────┤\n │ book  2 │\n ├─────────┤\n │ book  1 │ ◂ bottom (buried)\n └─────────┘\n   ↑ POP takes the top one back off</pre>'+
         '③ Think of a stack of plates in a cupboard: you always grab the top plate, and you always set a clean one down on top — never from the middle, or the whole pile topples.<br>'+
         '④ In this puzzle: three books are stuck in the wrong order in a tower that only lets you PUSH (add) or POP (remove) the <b>top</b> book. You\'ll borrow a second "temp" stack to shuffle them out in the right order.',
         '① 栈 (stack) 是一摞东西, 你只能碰最上面那个——别的都碰不到。<br>'+
         '<pre>   PUSH ↓\n ┌─────────┐\n │ 第3本书 │ ◂ 顶 (只有它能碰)\n ├─────────┤\n │ 第2本书 │\n ├─────────┤\n │ 第1本书 │ ◂ 底 (被压住)\n └─────────┘\n   ↑ POP 把顶上那本拿走</pre>'+
         '③ 想象橱柜里叠的一摞盘子: 你永远只能拿最上面那个, 也只能把干净盘子放在最上面——不能从中间抽, 抽了整摞就塌。<br>'+
         '④ 这道题里: 三本书叠成一座塔, 顺序不对, 塔只让你 PUSH(放到顶上)或 POP(从顶上拿走)。你要借一个"临时栈"倒腾, 把书按正确顺序倒出来。')},
     render:renderStack,
     onKey:function(e,api){if(e.key==='?'&&hintFns.mem_stack)hintFns.mem_stack();}},
    {id:'mem_list',x:20,y:10,title:B('Broken Chain Cloister · Pointer Surgery','断链回廊·指针接骨'),
     syllabus:'10.2 ADT: Linked List — nodes/pointers/NULL termination (cycle detection)',
     codex:['linked_list'],
     primer:{title:B('What is a linked list?','链表 (linked list) 是什么?'),
       body:B(
         '① A linked list is a chain of "boxes" (nodes). Each node holds two things: a <b>value</b>, and an arrow (<b>next pointer</b>) saying where the NEXT node lives.<br>'+
         '<pre>HEAD ──▶ [ 7 |next]──▶[ 23|next]──▶[NULL]\n           node          node          end</pre>'+
         '③ It\'s like a treasure hunt: each clue card doesn\'t show you the whole map — it just tells you where the NEXT clue is hidden. You never need every address at once, only "what\'s next".<br>'+
         '④ In this puzzle: 5 nodes sit scattered at random memory addresses with every "next" arrow broken (a "wild pointer"). You must reconnect them: HEAD → smallest value → … → biggest value → NULL, one arrow at a time. Careful: an arrow that loops back to an earlier node creates an infinite loop (a "cycle") that never reaches NULL.',
         '① 链表 (linked list) 是一串"箱子"(节点 node)连起来的。每个节点装两样东西: 一个<b>数据值</b>, 和一个箭头(<b>next 指针</b>), 指向下一个节点在哪。<br>'+
         '<pre>HEAD ──▶ [ 7 |next]──▶[ 23|next]──▶[NULL]\n           节点          节点          终点</pre>'+
         '③ 就像寻宝游戏: 每张线索卡不会给你整张地图, 只告诉你下一张线索在哪。你不需要一次记住所有地址, 只需要知道"接下来去哪"。<br>'+
         '④ 这道题里: 5 个节点散落在随机地址上, 所有 next 箭头都断了(野指针 wild pointer)。你要一条一条把箭头接对: HEAD → 最小值 → …… → 最大值 → NULL。注意: 如果箭头绕回了前面的节点, 就会变成死循环(环 cycle)——链表永远走不到 NULL。')},
     render:renderList,
     onKey:function(e,api){if(e.key==='?'&&hintFns.mem_list)hintFns.mem_list();}},
    {id:'mem_lru',x:12,y:3,title:B('Temple of the Circular Queue','环形队列神庙'),
     syllabus:'10.2 ADT: Circular Queue — array-based FIFO with wraparound (front/rear/count)',
     codex:['queue','circular_queue'],
     primer:{title:B('What is a circular queue?','环形队列 (circular queue) 是什么?'),
       body:B(
         '① A circular queue is a queue (FIFO — first in, first out) stored in a fixed-size array, where the "next" index wraps '+
         'back to 0 after the last slot instead of shuffling every remaining item down each time something leaves.<br>'+
         '<pre>seat:    [ 0 ][ 1 ][ 2 ][ 3 ]  (arranged in a ring, not a line)\n           ▲front          ▲rear\nfront = oldest occupant (leaves next)   rear = next empty seat (newcomer sits here)\n...seat 3 wraps straight back to seat 0...</pre>'+
         '③ Picture a lazy Susan (a rotating dinner table) with exactly 4 fixed seats. A new dish is set down at the seat right '+
         'after the last one placed (rear); a diner always takes from the seat that has been waiting longest (front). Spin past '+
         'seat 4 and you don\'t fall off the edge — you\'re simply back at seat 1.<br>'+
         '④ In this puzzle: 4 seats fill up with pilgrims (data) in turn. Most steps are automatic; you only step in at two tricky '+
         'moments — a new arrival when all 4 seats are full (there is nowhere to put them — they must be turned away), or the bell '+
         'ringing when the ring is empty (there is no one to call). Trap: front===rear happens both when the ring is completely '+
         'empty AND completely full — the indices alone can\'t tell you which, so a separate head-count is kept too.',
         '① 环形队列 (circular queue) 是用一块固定大小的数组实现的队列(FIFO, 先进先出), "下一格"的下标走到数组末尾后'+
         '直接绕回 0, 不用像普通队列那样, 每走一个人就把后面所有人往前搬一格。<br>'+
         '<pre>座位:    [ 0 ][ 1 ][ 2 ][ 3 ]  (排成一圈, 不是一条直线)\n           ▲front          ▲rear\nfront = 最老的那位(下一个离开)   rear = 下一个空座(新人坐这儿)\n……座 3 直接绕回座 0……</pre>'+
         '③ 想象一张只有 4 个固定座位的旋转餐桌(lazy Susan): 新上的菜放在刚放下那道菜后面一格(rear); '+
         '食客永远从等得最久的那格取菜(front)。转过第 4 格不会掉下桌子——只是绕回了第 1 格。<br>'+
         '④ 这道题里: 4 个座位依次坐满朝圣者(数据)。大多数步骤自动进行; 只有两个刁钻时刻要你亲自裁决——'+
         '四座已满又来新人(没地方放, 只能回绝), 或者钟声响起时环是空的(没人可传唤)。陷阱: front===rear 这件事, '+
         '环彻底空了会发生, 环彻底满了也会发生——光看下标分不出来, 所以还得另外记一个人数(count)。')},
     render:renderTemple,
     onKey:function(e,api){if(e.key==='?'&&hintFns.mem_lru)hintFns.mem_lru();}}
  ],

  onEnter:function(api){
    startSwampWatch(api);
    if(!FLAG(api,'mem_entered')){
      SET(api,'mem_entered');
      S(api,'open');
      TOAST(api,B('The air smells of static and old silicon. Addresses are etched into the floor tiles, starting at 0x0000 and marching off into the dark.',
                  '空气里有静电和旧硅片的味道。地砖上蚀刻着一行行地址, 从 0x0000 开始, 一直排进黑暗里。'),true);
    }
  },

  onQuestComplete:function(qid,api){
    if(qid==='mem_main'){
      S(api,'quest');
      TOAST(api,B('◈ Memory Maze · COMPLETE ◈ The Null Pointer Shard sits cool in your pack — pointing nowhere, cleaner than anywhere. …And far beneath the floor, for half a second, the noise sounds one syllable clearer.',
                  '◈ 内存迷宫 · 完成 ◈ 空指针碎片在包里微微发凉——指向无处, 却比哪儿都干净。……而地板下极深处, 有那么半秒, 杂音清楚了一个音节。'),true);
    }else if(qid==='mem_side'){
      var end=FLAG(api,'mem_zomb_end');
      TOAST(api,end==='rest'?B('◈ Side quest complete ◈ Line 2047 of the process table is clear. This time, the good kind of clear.',
                               '◈ 支线完成 ◈ 进程表第 2047 行清空了。这次, 是好的销号。')
        :end==='embellish'?B('◈ Side quest complete ◈ One sentence had no checksum, and was truer than any log.',
                             '◈ 支线完成 ◈ 有一句话没有校验和, 却比任何日志都真。')
        :B('◈ Side quest complete ◈ The extra while was living too.',
           '◈ 支线完成 ◈ 多赚的那一会儿, 也是活着。'),true);
    }
  },

  /* 纯逻辑判定导出 —— 供 node 单测(引擎请忽略) */
  _test:{
    STACK_INIT:STACK_INIT,STACK_TARGET:STACK_TARGET,STACK_LIMIT:STACK_LIMIT,
    STACK2_INIT:STACK2_INIT,STACK2_TARGET:STACK2_TARGET,STACK2_LIMIT:STACK2_LIMIT,
    BOOK_NAMES:BOOK_NAMES,
    stackNew:stackNew,stackMove:stackMove,stackRun:stackRun,
    stack2New:stack2New,stack2Move:stack2Move,stack2Run:stack2Run,
    LIST_NODES:LIST_NODES,LIST_ANSWER:LIST_ANSWER,DLIST_ANSWER_PREV:DLIST_ANSWER_PREV,
    listWalk:listWalk,chainWalk:chainWalk,dlistWalk:dlistWalk,
    CQ_CAP:CQ_CAP,CQ_EVENTS:CQ_EVENTS,cqNew:cqNew,cqIsFull:cqIsFull,cqIsEmpty:cqIsEmpty,
    cqEnqueue:cqEnqueue,cqDequeue:cqDequeue,cqTrialRun:cqTrialRun,
    CQ_CHAL_CAP:CQ_CHAL_CAP,CQ_CHAL_LOG:CQ_CHAL_LOG,cqReplay:cqReplay,
    /* RESERVED FOR A2 —— 原 LRU/OPT 判定逻辑, 仍保留导出供未来 A2 kernel 单测复用 */
    LRU_CAP:LRU_CAP,LRU_SEQ:LRU_SEQ,lruNew:lruNew,lruAccess:lruAccess,
    lruVictim:lruVictim,lruEvict:lruEvict,lruRun:lruRun,
    OPT_SEQ:OPT_SEQ,OPT_CAP:OPT_CAP,pageFaults:pageFaults,optFaults:optFaults,lruFaults:lruFaults,
    SWAMP:SWAMP
  }
};

/* ================================================================
   8. Codex 知识库条目 (教学层 — 供图鉴/📖按钮调用, 引擎侧待接线)
   ================================================================ */
window.GAME_CODEX=window.GAME_CODEX||[];
window.GAME_CODEX.push(
  {id:'stack',mod:'memory',syllabus:'10.2 Abstract Data Types: Stack',
   topic:B('Stack (LIFO)','栈 Stack (后进先出)'),
   body:B(
     'Definition: a stack is a linear data structure where items are added and removed from the same end, called the <b>TOP</b>. This gives LIFO behaviour — Last In, First Out.<br>'+
     '<pre>PUSH →  [ C ] ◂ top\n        [ B ]\n        [ A ] ◂ bottom</pre>'+
     'Operations: <b>PUSH(x)</b> adds x on top; <b>POP()</b> removes and returns the top item; <b>PEEK()/TOP()</b> looks at the top item without removing it; <b>ISEMPTY()</b> checks if anything is left.<br>'+
     'Exam tip: stacks are used for recursive calls (the "call stack"), undo history, and matching brackets — anywhere the most recent thing must be dealt with first.',
     '定义: 栈 (stack) 是一种线性数据结构, 只能从同一端(称为"顶" top)添加或移除元素。这就是 LIFO(Last In, First Out, 后进先出)行为。<br>'+
     '<pre>PUSH →  [ C ] ◂ 顶\n        [ B ]\n        [ A ] ◂ 底</pre>'+
     '操作: <b>PUSH(x)</b> 把 x 放到顶上; <b>POP()</b> 移除并返回顶上的元素; <b>PEEK()/TOP()</b> 只看顶上的元素、不移除; <b>ISEMPTY()</b> 检查是否还有元素。<br>'+
     '考点提示: 栈常用于递归调用(所谓"调用栈" call stack)、撤销 (undo) 历史、括号匹配——凡是"最后发生的事要最先处理"的场合都在用栈。'),
   example:B(
     'Push A, then B, then C onto an empty stack (C is now on top). First POP returns C and removes it. Second POP returns B. The stack now holds only A.',
     '把 A、B、C 依次 PUSH 进一个空栈(C 现在在顶上)。第一次 POP 返回 C 并移除它; 第二次 POP 返回 B。栈里现在只剩 A。')},

  {id:'queue',mod:'memory',syllabus:'10.2 Abstract Data Types: Queue',
   topic:B('Queue (FIFO)','队列 Queue (先进先出)'),
   body:B(
     'Definition: a queue is a linear data structure where items are added at one end (the <b>REAR</b>) and removed from the other end (the <b>FRONT</b>). This gives FIFO behaviour — First In, First Out.<br>'+
     '<pre>ENQUEUE →  [A][B][C]  → DEQUEUE\n           front   rear</pre>'+
     'Operations: <b>ENQUEUE(x)</b> adds x at the rear; <b>DEQUEUE()</b> removes and returns the item at the front.<br>'+
     'Exam tip: queues model real waiting lines — print jobs, keyboard buffers, tasks waiting for CPU time — whoever arrived first gets served first.',
     '定义: 队列 (queue) 是一种线性数据结构, 从一端(队尾 rear)添加元素, 从另一端(队首 front)移除元素。这就是 FIFO (First In, First Out, 先进先出)行为。<br>'+
     '<pre>ENQUEUE →  [A][B][C]  → DEQUEUE\n           队首     队尾</pre>'+
     '操作: <b>ENQUEUE(x)</b> 把 x 加到队尾; <b>DEQUEUE()</b> 从队首移除并返回该元素。<br>'+
     '考点提示: 队列对应现实里的排队——打印任务、键盘缓冲区、等待 CPU 时间的任务——谁先来谁先被处理。'),
   example:B(
     'Enqueue A, then B, then C — the queue front-to-rear is A, B, C. DEQUEUE() removes and returns A (the one who arrived first); B is now at the front.',
     '依次 ENQUEUE A、B、C——队列从队首到队尾是 A、B、C。DEQUEUE() 移除并返回 A(最先来的那个); B 现在排在队首。')},

  {id:'circular_queue',mod:'memory',syllabus:'10.2 ADT: Circular Queue (array-based FIFO with wraparound)',
   topic:B('Circular Queue','环形队列 Circular Queue'),
   body:B(
     'Definition: a circular queue is a queue implemented in a <b>fixed-size array</b> where the front and rear indices wrap back '+
     'to 0 after reaching the last slot, instead of shifting every remaining element down whenever the front leaves. This avoids '+
     'wasting the array space freed up at the front.<br>'+
     '<pre>seats:  [ 0 ][ 1 ][ 2 ][ 3 ]  (index wraps: after 3 comes 0 again)\nENQUEUE: place at rear, then rear=(rear+1) mod capacity\nDEQUEUE: remove at front, then front=(front+1) mod capacity</pre>'+
     'Key trap: <b>front === rear</b> can mean the queue is completely EMPTY or completely FULL — the two indices alone cannot '+
     'tell you which. Implementations solve this by also keeping a running <b>count</b> of stored items (or, alternatively, by '+
     'deliberately leaving one slot always empty).<br>'+
     'Exam tip: state clearly which convention you are using (a count variable is the simplest to reason about in pseudocode) — '+
     'markers look for an explicit way of distinguishing full from empty.',
     '定义: 环形队列 (circular queue) 是用一块<b>固定大小的数组</b>实现的队列, front 和 rear 下标走到数组末尾后直接绕回 0, '+
     '不用像普通队列那样每次 front 离开都把剩下的元素往前搬——这样就不会浪费 front 端腾出来的空间。<br>'+
     '<pre>座位:  [ 0 ][ 1 ][ 2 ][ 3 ]  (下标环绕: 走过 3 后又是 0)\nENQUEUE: 在 rear 落座, 然后 rear=(rear+1) mod 容量\nDEQUEUE: 请出 front, 然后 front=(front+1) mod 容量</pre>'+
     '关键陷阱: <b>front === rear</b> 既可能是队列完全为空, 也可能是完全坐满——光看这两个下标分不出来。'+
     '实现上通常另外维护一个 <b>count</b>(当前元素数)来解决(或者干脆约定永远留一格不用)。<br>'+
     '考点提示: 写伪代码时要明确说清你用的是哪种约定(维护 count 变量是推理起来最简单的一种)——判卷会找"如何区分满/空"这个明确交代。'),
   example:B(
     'A capacity-4 circular queue with front=0, rear=0, count=0 (empty). Three ENQUEUEs give front=0, rear=3, count=3. '+
     'One DEQUEUE gives front=1, rear=3, count=2. A fourth ENQUEUE gives front=1, rear=0 (wrapped from 3), count=3 — notice rear '+
     'wrapped straight back to slot 0, reusing the space the first DEQUEUE freed up.',
     '一个容量为 4 的环形队列, front=0, rear=0, count=0(空)。三次 ENQUEUE 后 front=0, rear=3, count=3。'+
     '一次 DEQUEUE 后 front=1, rear=3, count=2。第四次 ENQUEUE 后 front=1, rear=0(从 3 绕回), count=3——'+
     '注意 rear 直接绕回了 0 号槽, 重新用上了第一次 DEQUEUE 腾出来的空间。')},

  {id:'linked_list',mod:'memory',syllabus:'10.2 Abstract Data Types: Linked List',
   topic:B('Linked List','链表 Linked List'),
   body:B(
     'Definition: a linked list is a chain of nodes, where each node stores a data value plus a pointer ("next") to the following node. The list starts at a <b>HEAD</b> pointer and ends when a node\'s next pointer is <b>NULL</b>.<br>'+
     '<pre>HEAD → [7|•]→[23|•]→[42|•]→[91|NULL]</pre>'+
     'Unlike an array, nodes don\'t have to sit next to each other in memory — the pointers do all the connecting, so inserting or deleting a node only means rewiring two pointers, not shifting every element along.<br>'+
     'Exam tip: watch for a "wild pointer" (points nowhere valid → crash) and a "cycle" (a next pointer loops back to an earlier node → traversal never reaches NULL).',
     '定义: 链表 (linked list) 是一串节点 (node) 连成的链, 每个节点存一个数据值, 外加一个指向下一个节点的指针 (next)。链表从 <b>HEAD</b> 指针开始, 当某节点的 next 是 <b>NULL</b> 时就到了链尾。<br>'+
     '<pre>HEAD → [7|•]→[23|•]→[42|•]→[91|NULL]</pre>'+
     '和数组 (array) 不同, 链表的节点在内存里不需要挨在一起——全靠指针连接, 所以插入或删除一个节点只需要改两个指针, 不用把后面所有元素都搬一遍。<br>'+
     '考点提示: 留意"野指针"(wild pointer, 指向无效地址→崩溃)和"环"(cycle, 某个 next 绕回了前面的节点→遍历永远走不到 NULL)。'),
   example:B(
     'A list holding 7 → 23 → 91: HEAD points at the node with 7; 7\'s next points at 23; 23\'s next points at 91; 91\'s next is NULL. Traversal: start at HEAD(7), follow next to 23, then to 91, then to NULL — every node visited.',
     '一条存着 7 → 23 → 91 的链表: HEAD 指向存 7 的节点; 7 的 next 指向存 23 的节点; 23 的 next 指向存 91 的节点; 91 的 next 是 NULL。遍历: 从 HEAD(7) 出发, 顺 next 走到 23, 再走到 91, 再走到 NULL——每个节点都访问到了。')},

  {id:'lru_cache',mod:'memory',syllabus:'A2 §16 (reserved — not examinable at AS): Cache replacement (LRU)',
   topic:B('LRU Cache Replacement','LRU 缓存置换 (Cache Replacement)'),
   body:B(
     '<i>(This is A2-level content — page/cache replacement isn\'t on the AS §10.2 spec. Nothing in this maze currently tests it; '+
     'it\'s here for anyone curious enough to read ahead.)</i><br>'+
     'Definition: a cache is a small, fast storage area with a fixed number of slots, used to keep recently-used data close at hand. When the cache is full and a new item needs a slot, a <b>replacement policy</b> decides who leaves. <b>LRU (Least Recently Used)</b> evicts whichever item has gone the longest without being accessed.<br>'+
     '<pre>slots: [A(t=1)][B(t=4)][C(t=2)][D(t=3)]\nfull → new item E arrives → evict A (smallest t)</pre>'+
     'Key rule: every access — whether it\'s the first time an item is loaded, or a repeat "hit" on something already there — resets that item\'s clock to "now".<br>'+
     'Exam tip: LRU approximates the (theoretical, impossible-to-implement) OPT/Belady\'s algorithm, which would evict whoever is needed furthest in the future.',
     '<i>(这是 A2 阶段的内容——页面/缓存置换不在 AS §10.2 大纲里, 迷宫目前也没有谜题考它; 放在这儿纯粹给愿意提前读的人看。)</i><br>'+
     '定义: 缓存 (cache) 是一块位置数固定的小型高速存储区, 用来把最近用过的数据放在手边。缓存满了又来新数据时, 需要一个<b>置换策略</b> (replacement policy) 决定谁离开。<b>LRU (Least Recently Used, 最近最少使用)</b> 会淘汰"最久没被访问"的那个。<br>'+
     '<pre>坛位: [A(t=1)][B(t=4)][C(t=2)][D(t=3)]\n坛满 → 新来 E → 淘汰 A(t 最小)</pre>'+
     '关键规则: 每一次访问——不管是第一次载入, 还是命中 (hit) 已有的数据——都会把该项的时钟刷新为"现在"。<br>'+
     '考点提示: LRU 是对(理论上、实际不可能实现的) OPT/Belady 最优算法的近似——OPT 会淘汰"未来最晚才会再用到"的那个。'),
   example:B(
     'Cache holds A, B, C, D with last-used steps 1, 4, 2, 3. New item E arrives and the cache is full. A has the smallest last-used step (1) — so A is evicted, and E moves in with its clock set to "now".',
     '缓存里存着 A、B、C、D, 上次使用步号分别是 1、4、2、3。新数据 E 到达, 缓存已满。A 的上次使用步号最小(1)——所以淘汰 A, E 入驻, 时钟设为"现在"。')},

  {id:'out-of-bounds',mod:'memory',syllabus:'10.4 in practice: array bounds & runtime errors',
   topic:B('Array Bounds & Segmentation Fault','数组越界与段错误 (Segmentation Fault)'),
   body:B(
     'Definition: an array with N elements is indexed from <b>0 to N-1</b> (NOT 1 to N). Reading or writing an index outside that range is called "going out of bounds" — the program reaches into memory it doesn\'t own.<br>'+
     '<pre>Array of 10 elements: index  0 1 2 3 4 5 6 7 8 9\n                              ↑ valid range      ↑ index 10 is OUT OF BOUNDS</pre>'+
     'When a program touches memory it isn\'t allowed to access, the operating system stops it immediately with a "segmentation fault" (SIGSEGV) — better an instant crash than silently corrupting someone else\'s data.<br>'+
     'Exam tip: "off-by-one" errors (using &lt;= instead of &lt; in a loop condition, or forgetting arrays start at 0) are the single most common cause of out-of-bounds bugs.',
     '定义: 一个有 N 个元素的数组, 下标是 <b>0 到 N-1</b>(不是 1 到 N)。读写超出这个范围的下标, 叫"越界"(out of bounds)——程序碰到了不属于自己的内存。<br>'+
     '<pre>10 个元素的数组: 下标  0 1 2 3 4 5 6 7 8 9\n                      ↑ 合法范围        ↑ 下标 10 越界了</pre>'+
     '当程序碰到不该碰的内存, 操作系统会立刻用"段错误"(segmentation fault, SIGSEGV) 把它停掉——与其悄悄弄坏别人的数据, 不如当场崩溃。<br>'+
     '考点提示: "差一错误"(off-by-one, 比如循环条件写成 &lt;= 而不是 &lt;, 或者忘了数组从 0 开始)是越界 bug 最常见的原因。'),
   example:B(
     'An array declared with 10 elements has valid indices 0-9. Trying to access index 10 (the 11th slot) reads memory belonging to something else — undefined behaviour, often a crash.',
     '一个声明了 10 个元素的数组, 合法下标是 0~9。访问下标 10(第 11 格)会读到属于别的东西的内存——行为未定义, 常常直接崩溃。')},

  {id:'memory-layout',mod:'memory',syllabus:'10.4 in practice: runtime memory layout (stack vs heap)',
   topic:B('Memory Layout: Stack vs Heap','内存布局: 栈 (Stack) 与堆 (Heap)'),
   body:B(
     'Definition: a running program\'s memory is split into regions. Two grow toward each other from opposite ends: the <b>call stack</b> (holds function calls and local variables — grows DOWN from high addresses, automatically managed) and the <b>heap</b> (holds dynamically allocated memory, e.g. via malloc — grows UP from low addresses, manually managed).<br>'+
     '<pre>low addr [ heap ↑         ↓ stack ] high addr</pre>'+
     'If they grow enough to collide — usually caused by runaway recursion (each call adds a stack frame) or a bug that allocates endlessly — the result is a "stack overflow".<br>'+
     'Exam tip: don\'t confuse this memory-layout "stack" with the abstract data type "stack" (LIFO push/pop) — the call stack simply behaves like a stack ADT; one is a region of memory, the other is a way of organising data.',
     '定义: 一个运行中的程序, 内存分成几块区域。其中两块很重要, 从两端相向生长: <b>调用栈</b>(call stack, 存函数调用与局部变量, 从高地址往下长, 自动管理)与<b>堆</b>(heap, 存动态分配的内存, 比如 malloc 出来的, 从低地址往上长, 手动管理)。<br>'+
     '<pre>低地址 [ 堆 ↑          ↓ 栈 ] 高地址</pre>'+
     '如果两者长到相撞——通常是失控的递归(每次调用都加一层栈帧)或不断分配内存的 bug 导致——结果叫"栈溢出"(stack overflow)。<br>'+
     '考点提示: 别把这里说的内存布局意义上的"栈"和抽象数据类型 (ADT) 里的"栈"(LIFO push/pop)搞混——调用栈只是行为像一个栈 ADT; 一个是内存的一块区域, 另一个是组织数据的方式。'),
   example:B(
     'A function that calls itself with no stopping condition (infinite recursion) keeps adding stack frames, growing the stack downward until it collides with the heap or hits the memory limit — a stack overflow crash.',
     '一个没有停止条件、不断调用自己的函数(无限递归)会不断往栈里加新的栈帧, 栈一直往下长, 直到撞上堆或碰到内存上限——栈溢出崩溃。')},

  {id:'memory-leak',mod:'memory',syllabus:'10.4 in practice: dynamic memory (malloc/free)',
   topic:B('Dynamic Memory: malloc, free & Memory Leaks','动态内存: malloc、free 与内存泄漏'),
   body:B(
     'Definition: dynamic memory is allocated at runtime (e.g. with malloc in C) rather than fixed at compile time, and must be released manually with <b>free()</b> when no longer needed. A <b>memory leak</b> happens when a program allocates memory but loses every reference to it before calling free() — the memory stays marked "in use" so the OS can\'t reclaim it, yet nothing can reach it either.<br>'+
     '<pre>malloc(4KB) → use it → [forget to free()] → 4KB gone forever, silently</pre>'+
     'Exam tip: memory leaks don\'t crash a program immediately — they slowly eat available memory, and a long-running program (a server, an OS) with leaks will eventually slow down or run out of memory.',
     '定义: 动态内存 (dynamic memory) 是在程序运行时才分配的(比如 C 语言的 malloc), 不是编译时定死的, 用完后必须手动调用 <b>free()</b> 释放。<b>内存泄漏</b>(memory leak) 发生在: 程序分配了内存, 却在调用 free() 之前弄丢了指向它的所有引用——这块内存仍标记为"使用中", 操作系统收不回去, 但也没人能再访问它。<br>'+
     '<pre>malloc(4KB) → 用它 → [忘了 free()] → 4KB 悄悄地永远消失了</pre>'+
     '考点提示: 内存泄漏不会立刻让程序崩溃——它会慢慢吃光可用内存, 一个长期运行的程序(服务器、操作系统)如果一直泄漏, 最终会变慢甚至耗尽内存。'),
   example:B(
     'A program does ptr = malloc(4096) to grab 4KB, then later sets ptr = NULL without calling free(ptr) first. The 4KB block is now unreachable (no pointer points to it) but still marked allocated — a classic leak.',
     '程序执行 ptr = malloc(4096) 拿到 4KB, 之后却在没调用 free(ptr) 的情况下把 ptr 设成 NULL。这 4KB 现在没有任何指针指向它(够不着了), 但仍标记为已分配——典型的内存泄漏。')},

  {id:'garbage-collection',mod:'memory',syllabus:'10.4 in practice: automatic memory management',
   topic:B('Garbage Collection & Reference Counting','垃圾回收 (Garbage Collection) 与引用计数'),
   body:B(
     'Definition: garbage collection (GC) automatically frees memory a program no longer needs, so the programmer doesn\'t have to call free() manually. One common technique is <b>reference counting</b>: every block of memory keeps a count of how many things currently point to (reference) it. When that count drops to zero, the memory is safe to reclaim.<br>'+
     '<pre>refcount=2 → one reference dropped → refcount=1 → last reference dropped → refcount=0 → GC reclaims it</pre>'+
     'Exam tip: reference counting has one classic weakness — a "reference cycle" (A points to B, B points to A, but nothing outside points to either) never reaches refcount 0, even though both are unreachable garbage; simple reference counting can\'t detect this.',
     '定义: 垃圾回收 (garbage collection, GC) 会自动释放程序不再需要的内存, 程序员不用像 C 语言那样手动调用 free()。一种常见技术是<b>引用计数</b> (reference counting): 每块内存都记着当前有多少东西指向它(引用它)。这个计数一旦归零, 这块内存就可以安全回收了。<br>'+
     '<pre>引用计数=2 → 少了一个引用 → =1 → 最后一个引用也没了 → =0 → GC 回收它</pre>'+
     '考点提示: 引用计数有一个经典弱点: "引用环"(reference cycle, A 指向 B, B 又指向 A, 但外面没有任何东西指向它们俩)永远不会归零, 即使两者都已经是够不着的垃圾——单纯的引用计数发现不了这种情况。'),
   example:B(
     'Object X is pointed to by two variables, so refcount=2. One variable is reassigned elsewhere, refcount drops to 1. The last variable goes out of scope, refcount drops to 0 — X is now reclaimed.',
     '对象 X 被两个变量指着, 引用计数=2。其中一个变量被重新赋值, 计数降到 1。最后一个变量也离开了作用域, 计数降到 0——X 现在被回收。')}
);

window.GAME_MODULES=window.GAME_MODULES||[];
window.GAME_MODULES.push(MOD);
})();
