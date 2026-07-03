/* ================================================================
   BIT://ESCAPE 领域模块 —— 算法竞技场 The Algorithm Arena (domain_algo.js)
   9618 AS · Topic 9 Algorithms (sorting / searching) + Topic 8 Databases (SQL)
   ----------------------------------------------------------------
   模块协议 (与 domain_memory.js 一致):
     window.GAME_MODULES.push({ id,title,world,unlock,interior,npcs,
                                steles,quests,puzzles,onEnter,onQuestComplete })
   - unlock.afterQuest='m3' —— index.html 第一章末尾任务实际 id 是 m3。
   - 双语: 一切面向玩家的字符串都是 {en,zh}; render() 自建 DOM 过 T()。
   - 场景: 罗马斗兽场风竞技场。看台观众实时欢呼/嘘声/刷弹幕;
     司仪 daemon "MC stdout" 把每场谜题都当世纪大战宣布。
   - 谜题: ①冒泡竞速(§9.1 bubble sort) ②二分猎手(§9.1 binary search)
           ③Boss: SQL 酒馆(§8, 内置 ~80 行迷你 SQL 解释器)。
     每题: 三段递进提示 + 失败≥2 自动升级 + 通关后可选 ★Challenge
     (flags algo_challenge_1/2/3, 不影响主线)。
   - 纯逻辑判定导出在 _test 字段(供 node 单测, 引擎忽略)。
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

/* ---- 谜题1 · 冒泡竞速 (§9.1 bubble sort) ----
   5 个像素选手举数字牌, 只能比较相邻两人 (VS), 玩家选 换/不换。
   最少比较数 = 逆序对数 (每次比较都换对才打平)。            */
var BUBBLE_LINEUP=[42,7,88,23,61];
var BUBBLE2_LINEUP=[55,12,89,34,71,8,90,27];      // ★挑战: 8 人
function bubbleInversions(a){
  var n=0;
  for(var i=0;i<a.length;i++)for(var j=i+1;j<a.length;j++)if(a[i]>a[j])n++;
  return n;
}
var BUBBLE_BEST=bubbleInversions(BUBBLE_LINEUP);      // = 4
var BUBBLE2_BEST=bubbleInversions(BUBBLE2_LINEUP);    // = 14
var BUBBLE2_LIMIT=BUBBLE2_BEST+4;                     // 挑战: 比较预算 18
function bubbleSorted(a){
  for(var i=1;i<a.length;i++)if(a[i-1]>a[i])return false;
  return true;
}
function bubbleNew(lineup){return {arr:lineup.slice(),comps:0,swaps:0,log:[]};}
/* 一次 VS + 决定。swap=true 交换 / false 保持。
   good = 决定是否正确 (a>b 时该换, a<=b 时该不换)。
   返回 {ok,good,swapped,sorted}; i 越界 → {ok:false}。 */
function bubbleDecide(st,i,swap){
  if(!st||i<0||i>=st.arr.length-1)return {ok:false};
  var a=st.arr[i],b=st.arr[i+1],need=a>b;
  st.comps++;
  if(swap){var t2=st.arr[i];st.arr[i]=st.arr[i+1];st.arr[i+1]=t2;st.swaps++;}
  var good=(swap===need);
  st.log.push({i:i,a:a,b:b,swap:!!swap,good:good});
  return {ok:true,good:good,swapped:!!swap,sorted:bubbleSorted(st.arr)};
}
/* 最优机器人: 总是从左到右换第一个逆序对 (供演示/自测) */
function bubbleBotStep(st){
  for(var i=0;i<st.arr.length-1;i++)
    if(st.arr[i]>st.arr[i+1])return i;
  return -1;
}

/* ---- 谜题2 · 二分猎手 (§9.1 binary search) ----
   僵尸心里想 1..max 的数, guesses 次机会, 每次回 higher/lower。
   数轴排除区可视化: [lo,hi] 之外全部涂黑。                    */
var BIN_MAX=100,BIN_GUESSES=7;        // 2^7-1=127 ≥ 100 → 必胜
var BIN2_MAX=1000,BIN2_GUESSES=10;    // ★挑战: 2^10-1=1023 ≥ 1000
function binNew(max,guesses,secret){
  return {lo:1,hi:max,max:max,left:guesses,secret:secret,done:false,dead:false,history:[]};
}
/* 返回 {res:'hit'|'higher'|'lower'|'bad'|'over', dead?, used?} */
function binGuess(st,g){
  if(!st||st.done||st.dead)return {res:'over'};
  if(typeof g!=='number'||isNaN(g)||Math.floor(g)!==g||g<1||g>st.max)return {res:'bad'};
  st.left--;st.history.push(g);
  if(g===st.secret){st.done=true;return {res:'hit',used:st.history.length};}
  if(g<st.secret){if(g+1>st.lo)st.lo=g+1;}
  else{if(g-1<st.hi)st.hi=g-1;}
  if(st.left<=0){st.dead=true;return {res:(g<st.secret?'higher':'lower'),dead:true};}
  return {res:(g<st.secret?'higher':'lower')};
}
/* 中点策略需要几次猜中 secret (自测: 全域 ≤ guesses) */
function binMidGuesses(secret,max){
  var lo=1,hi=max,n=0;
  while(lo<=hi){
    n++;
    var m=Math.floor((lo+hi)/2);
    if(m===secret)return n;
    if(m<secret)lo=m+1;else hi=m-1;
  }
  return -1;
}

/* ---- 谜题3 · Boss: SQL 酒馆 (§8 Databases) ----
   酒保 GRANT 只听 SQL。迷你解释器支持:
   SELECT 列列表|*|COUNT(*), FROM 表, WHERE 比较(= > < >= <= <>/!=)
   + AND/OR (AND 优先), ORDER BY 列 [ASC|DESC], 末尾 ; 可选。   */
var SQL_TABLE={
  name:'patrons',
  cols:['name','drink','bounty','table_no'],
  rows:[
    {name:'Trojan Tom',  drink:'Root Beer',         bounty:250, table_no:3},
    {name:'Null Nancy',  drink:'Nothing',           bounty:0,   table_no:1},
    {name:'Loopy Lou',   drink:'Infinite Loop IPA', bounty:120, table_no:2},
    {name:'Segfault Sid',drink:'Core Dump Stout',   bounty:999, table_no:4},
    {name:'Daemon Dave', drink:'Silent Ale',        bounty:80,  table_no:3},
    {name:'Worm Wanda',  drink:'Phishing Punch',    bounty:310, table_no:2},
    {name:'Cache Carl',  drink:'Fresh Hit Fizz',    bounty:40,  table_no:1},
    {name:'Pixel Pete',  drink:'8-Bit Bitter',      bounty:150, table_no:3}
  ]
};
function sqlTokenize(q){
  var toks=[],i=0,s=String(q||''),m;
  while(i<s.length){
    var c=s[i];
    if(/\s/.test(c)){i++;continue;}
    if(c==="'"){
      var j=i+1,buf='';
      while(j<s.length&&s[j]!=="'"){buf+=s[j++];}
      if(j>=s.length)return {error:'unterminated_string',ch:"'"+buf};
      toks.push({t:'str',v:buf});i=j+1;continue;
    }
    if(/[0-9]/.test(c)){
      m=s.slice(i).match(/^[0-9]+(\.[0-9]+)?/);
      toks.push({t:'num',v:parseFloat(m[0])});i+=m[0].length;continue;
    }
    if(/[A-Za-z_]/.test(c)){
      m=s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      toks.push({t:'id',v:m[0]});i+=m[0].length;continue;
    }
    var two=s.substr(i,2);
    if(two==='>='||two==='<='||two==='<>'){toks.push({t:'op',v:two});i+=2;continue;}
    if(two==='!='){toks.push({t:'op',v:'<>'});i+=2;continue;}
    if('=><,*();'.indexOf(c)>=0){toks.push({t:'op',v:c});i++;continue;}
    return {error:'badchar',ch:c};
  }
  return {toks:toks};
}
var SQL_OPS=['=','>','<','>=','<=','<>'];
function sqlParse(q){
  var tk=sqlTokenize(q);
  if(tk.error)return {ok:false,code:tk.error,near:tk.ch||''};
  var t=tk.toks,p=0;
  function peek(){return t[p];}
  function kw(w){var x=t[p];return !!(x&&x.t==='id'&&x.v.toUpperCase()===w);}
  function isOp(v){var x=t[p];return !!(x&&x.t==='op'&&x.v===v);}
  function nearTok(){var x=t[p];return x?(x.t==='str'?"'"+x.v+"'":String(x.v)):'';}
  if(!t.length)return {ok:false,code:'empty',near:''};
  if(!kw('SELECT'))return {ok:false,code:'expect_select',near:nearTok()};
  p++;
  var ast={cols:null,count:false,table:null,where:null,order:null};
  if(kw('COUNT')){
    p++;
    if(!isOp('('))return {ok:false,code:'count_syntax',near:nearTok()};p++;
    if(!isOp('*'))return {ok:false,code:'count_syntax',near:nearTok()};p++;
    if(!isOp(')'))return {ok:false,code:'count_syntax',near:nearTok()};p++;
    ast.count=true;ast.cols=['COUNT(*)'];
  }else if(isOp('*')){p++;ast.cols=['*'];}
  else{
    var cols=[];
    for(;;){
      var x=peek();
      if(!x||x.t!=='id')return {ok:false,code:'expect_cols',near:nearTok()};
      cols.push(x.v.toLowerCase());p++;
      if(isOp(',')){p++;continue;}
      break;
    }
    ast.cols=cols;
  }
  if(!kw('FROM'))return {ok:false,code:'expect_from',near:nearTok()};
  p++;
  var tb=peek();
  if(!tb||tb.t!=='id')return {ok:false,code:'expect_from',near:nearTok()};
  ast.table=tb.v.toLowerCase();p++;
  if(kw('WHERE')){
    p++;
    var or=[];
    for(;;){
      var and=[];
      for(;;){
        var cTok=peek();
        if(!cTok||cTok.t!=='id')return {ok:false,code:'expect_cond',near:nearTok()};
        var col=cTok.v.toLowerCase();p++;
        var o=peek();
        if(!o||o.t!=='op'||SQL_OPS.indexOf(o.v)<0)return {ok:false,code:'expect_cmp',near:nearTok()};
        p++;
        var v=peek();
        if(!v||(v.t!=='num'&&v.t!=='str'))return {ok:false,code:'expect_val',near:nearTok()};
        p++;
        and.push({col:col,op:o.v,val:v.v});
        if(kw('AND')){p++;continue;}
        break;
      }
      or.push(and);
      if(kw('OR')){p++;continue;}
      break;
    }
    ast.where=or;
  }
  if(kw('ORDER')){
    p++;
    if(!kw('BY'))return {ok:false,code:'expect_by',near:nearTok()};
    p++;
    var oc=peek();
    if(!oc||oc.t!=='id')return {ok:false,code:'expect_by',near:nearTok()};
    p++;
    var desc=false;
    if(kw('DESC')){desc=true;p++;}
    else if(kw('ASC')){p++;}
    ast.order={col:oc.v.toLowerCase(),desc:desc};
  }
  if(isOp(';'))p++;
  if(p<t.length)return {ok:false,code:'trailing',near:nearTok()};
  return {ok:true,ast:ast};
}
function sqlExec(q,table){
  table=table||SQL_TABLE;
  var pr=sqlParse(q);
  if(!pr.ok)return pr;
  var ast=pr.ast,i,g,c;
  if(ast.table!==table.name)return {ok:false,code:'bad_table',near:ast.table};
  if(!ast.count&&ast.cols[0]!=='*'){
    for(i=0;i<ast.cols.length;i++)
      if(table.cols.indexOf(ast.cols[i])<0)return {ok:false,code:'unknown_col',near:ast.cols[i]};
  }
  if(ast.where){
    for(g=0;g<ast.where.length;g++)
      for(c=0;c<ast.where[g].length;c++)
        if(table.cols.indexOf(ast.where[g][c].col)<0)
          return {ok:false,code:'unknown_col',near:ast.where[g][c].col};
  }
  if(ast.order&&table.cols.indexOf(ast.order.col)<0)
    return {ok:false,code:'unknown_col',near:ast.order.col};
  function cmp(a,op,b){
    var x=a,y=b;
    if(typeof x==='string'||typeof y==='string'){
      x=String(x).toLowerCase();y=String(y).toLowerCase();
    }
    if(op==='=')return x===y;
    if(op==='<>')return x!==y;
    if(op==='>')return x>y;
    if(op==='<')return x<y;
    if(op==='>=')return x>=y;
    if(op==='<=')return x<=y;
    return false;
  }
  var rows=table.rows.filter(function(r){
    if(!ast.where)return true;
    for(var gg=0;gg<ast.where.length;gg++){
      var all=true;
      for(var cc=0;cc<ast.where[gg].length;cc++){
        var cd=ast.where[gg][cc];
        if(!cmp(r[cd.col],cd.op,cd.val)){all=false;break;}
      }
      if(all)return true;
    }
    return false;
  });
  if(ast.order){
    var oc=ast.order.col,sign=ast.order.desc?-1:1;
    rows=rows.slice().sort(function(a,b){
      var x=a[oc],y=b[oc];
      if(typeof x==='string')x=x.toLowerCase();
      if(typeof y==='string')y=y.toLowerCase();
      if(x<y)return -sign;
      if(x>y)return sign;
      return 0;
    });
  }
  if(ast.count)return {ok:true,cols:['COUNT(*)'],rows:[[rows.length]]};
  var outCols=(ast.cols[0]==='*')?table.cols.slice():ast.cols;
  var out=rows.map(function(r){return outCols.map(function(cn){return r[cn];});});
  return {ok:true,cols:outCols,rows:out};
}
/* 结果集等价: 列名逐位相同; 行集相同 (ordered=true 时顺序也要相同) */
function sqlResultEq(a,b,ordered){
  if(!a||!b||!a.ok||!b.ok)return false;
  if(a.cols.length!==b.cols.length)return false;
  for(var i=0;i<a.cols.length;i++)if(a.cols[i]!==b.cols[i])return false;
  if(a.rows.length!==b.rows.length)return false;
  function ser(r){return r.map(function(v){return '['+String(v)+']';}).join('|');}
  var ra=a.rows.map(ser),rb=b.rows.map(ser);
  if(!ordered){ra=ra.slice().sort();rb=rb.slice().sort();}
  for(var j=0;j<ra.length;j++)if(ra[j]!==rb[j])return false;
  return true;
}
/* 三轮点单 (主线) + 两轮挑战。判分 = 与参考查询结果集等价 (写法不唯一) */
var SQL_ROUNDS=[
  {id:'r1',ordered:false,
   ref:'SELECT name FROM patrons WHERE table_no = 3',
   ask:B('Table 3 is chanting for refills and I\'ve forgotten every face. Get me the <b>name</b> of everyone sitting at <b>table_no 3</b>. Names only — I pour, I don\'t gossip.',
         '3 号桌在敲杯子催酒, 可我把他们的脸全忘了。把坐在 <b>table_no 3</b> 的所有人的 <b>name</b> 给我调出来。只要名字——我只倒酒, 不八卦。')},
  {id:'r2',ordered:true,
   ref:'SELECT * FROM patrons WHERE bounty > 100 ORDER BY bounty DESC',
   ask:B('Bounty hunters at the door. I need the <b>full record (*)</b> of everyone with <b>bounty over 100</b> — and serve it <b>biggest bounty first</b> (ORDER BY, DESC). Hunters tip by row order.',
         '门口来了赏金猎人。给我所有 <b>bounty 超过 100</b> 的人的<b>完整档案 (*)</b>——并且<b>赏金从高到低</b>上菜 (ORDER BY … DESC)。猎人是按行序给小费的。')},
  {id:'r3',ordered:false,
   ref:'SELECT name, bounty FROM patrons WHERE bounty > 100 AND table_no = 3',
   ask:B('Final order — the WANTED list. Exactly two columns, in this order: <b>name, bounty</b>. Condition: <b>bounty over 100 AND sitting at table_no 3</b>. Two conditions, one AND, zero mercy.',
         '最后一单——通缉名单。恰好两列, 顺序是 <b>name, bounty</b>。条件: <b>bounty 超过 100 且坐在 table_no 3</b>。两个条件, 一个 AND。仁慈? 本店查无此列。')}
];
var SQL_CHAL=[
  {id:'c1',ordered:true,
   ref:'SELECT COUNT(*) FROM patrons WHERE table_no = 3',
   ask:B('Stocktake. Don\'t list them — <b>count</b> them: how many patrons at table_no 3? One number. Use COUNT(*).',
         '盘点时间。别列名单——<b>数人头</b>: table_no 3 一共几位? 一个数字。用 COUNT(*)。')},
  {id:'c2',ordered:true,
   ref:'SELECT name FROM patrons WHERE bounty >= 150 AND table_no <> 1 ORDER BY bounty DESC',
   ask:B('The syndicate order: <b>name</b> of everyone with <b>bounty at least 150 (>=)</b> who is <b>NOT at table 1 (table_no <> 1)</b>, richest first (ORDER BY bounty DESC). Get one clause wrong and we both retire.',
         '辛迪加的大单: 所有 <b>bounty 不低于 150 (>=)</b> 且<b>不坐 1 号桌 (table_no <> 1)</b> 的人的 <b>name</b>, 按赏金从高到低 (ORDER BY bounty DESC)。写错一个子句, 你我一起提前退休。')}
];
function sqlRoundCheck(round,playerQuery){
  var got=sqlExec(playerQuery);
  if(!got.ok)return {ok:false,err:got};
  var want=sqlExec(round.ref);
  return {ok:sqlResultEq(got,want,round.ordered),got:got,want:want};
}

/* ================================================================
   1. 小工具 (与 domain_memory.js 同款)
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

/* 提示系统: 三段递进; onKey('?') 亦可触发; .max() 跳到末段 */
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
/* 失败计数: 达到 2 次自动把提示升到末段; 第 3 次递一句台阶(CO-3, 不嘲讽) */
function bumpFail(api,key,pid,consol){
  var n=(FLAG(api,key)||0)+1;SET(api,key,n);
  if(n>=2&&hintFns[pid]&&hintFns[pid].max){
    hintFns[pid].max();
    TOAST(api,B('Hints auto-upgraded — check the gold box (or press ?).',
                '提示已自动升级——看金色框 (或按 ? 键)。'));
  }
  if(n===3&&consol&&!FLAG(api,key+'_co3')){SET(api,key+'_co3');TOAST(api,consol,true);}
  return n;
}
function header(el,title,sub){
  mk(el,'div','color:#9fee9f;letter-spacing:2px;font-size:14px;border-bottom:1px solid #1f3f1f;'+
    'padding-bottom:6px;margin-bottom:8px;',title+
    (sub?' <span style="'+DIM+'float:right;">'+sub+'</span>':''));
}
/* 冒泡 + 二分 都完成 → 推进主线气氛, 酒馆开门 */
function afterDuo(api){
  if(FLAG(api,'algo_bubble_done')&&FLAG(api,'algo_bin_done')&&!FLAG(api,'algo_tavern_open')){
    SET(api,'algo_tavern_open');
    S(api,'open');
    TOAST(api,B('Across the arena a neon sign sputters awake: THE SELECT TAVERN — OPEN. Rumour says the bartender only understands SQL.',
                '竞技场东侧, 一块霓虹灯牌噼啪亮起: SELECT 酒馆 · 营业中。据说那位酒保只听得懂 SQL。'),true);
  }
}

/* ================================================================
   2. 看台观众 · 欢呼/嘘声/弹幕 (竞技感的心脏)
   ================================================================ */
var CROWD_CHEER=[
  B('666','666'),
  B('SWAP! SWAP! SWAP!','换! 换! 换!'),
  B('O(YEAH)!','O(爽)!'),
  B('clean swap, no cap','这一手, 换得丝滑'),
  B('MOM, I\'M ON THE JUMBOTRON','妈! 我上大屏幕了!'),
  B('textbook. TEXTBOOK!','教科书! 这就是教科书!'),
  B('somebody cache this moment','谁来把这一刻缓存下来'),
  B('+1 comparison, worth it','这次比较 (comparison), 值!')
];
var CROWD_BOO=[
  B('BOOOOO','嘘————'),
  B('my granny sorts faster','我奶奶打算盘都比这快'),
  B('REFUND! REFUND!','退钱! 退钱!'),
  B('O(no)','O(完)'),
  B('that swap hurt to watch','这一换看得我脚趾抠地'),
  B('did you even compare??','你比都没比吧??'),
  B('bogosort called, wants you back','bogosort 来电: 想你了')
];
var CROWD_WILD=[
  B('★ ARENA RECORD ★','★ 场上纪录 ★'),
  B('GOAT! GOAT! GOAT!','神! 神! 神!'),
  B('I was here.','我见证了历史。'),
  B('frame this run','把这局裱起来'),
  B('MVP! MVP!','MVP! MVP!'),
  B('log₂ my beloved','此生无悔入 log₂'),
  B('absolute cinema','这 就 是 电 影')
];
/* 弹幕看台: 返回 {cheer(n), boo(n), wild(n)} —— 文本从右往左飘 */
function crowdMake(host){
  var box=mk(host,'div','position:relative;height:46px;overflow:hidden;border:1px solid #1f3f1f;'+
    'background:rgba(5,15,5,.55);margin:8px 0;border-radius:2px;');
  mk(box,'div','position:absolute;left:6px;top:2px;'+DIM+'letter-spacing:1px;',
    tx('▦ THE STANDS','▦ 看台'));
  function fly(txt,color){
    var top=6+Math.floor(Math.random()*28);
    var dur=(2.4+Math.random()*1.4);
    var sp=mk(box,'span','position:absolute;white-space:nowrap;font-size:11.5px;color:'+color+';'+
      'left:100%;top:'+top+'px;transition:transform '+dur.toFixed(2)+'s linear;will-change:transform;',txt);
    var go=function(){
      try{sp.style.transform='translateX(-'+(box.offsetWidth+sp.offsetWidth+60)+'px)';}catch(e){}
    };
    if(window.requestAnimationFrame)requestAnimationFrame(function(){requestAnimationFrame(go);});
    else setTimeout(go,30);
    setTimeout(function(){if(sp.parentNode)sp.parentNode.removeChild(sp);},dur*1000+600);
  }
  function burst(pool,color,n){
    for(var i=0;i<n;i++)(function(k){
      setTimeout(function(){fly(T(pool[Math.floor(Math.random()*pool.length)]),color);},k*170);
    })(i);
  }
  return {
    cheer:function(n){burst(CROWD_CHEER,'#9fee9f',n||3);},
    boo:function(n){burst(CROWD_BOO,'#ff9c9c',n||3);},
    wild:function(n){burst(CROWD_WILD,'#ffce3a',n||6);}
  };
}


/* ================================================================
   3. 谜题 1 · 冒泡竞速 (§9.1 Sorting — bubble sort)
   ================================================================ */
/* 像素选手: 头+躯干+数字牌 */
function fighter(host,val,hot,tint){
  var d=mk(host,'div','width:56px;text-align:center;transition:transform .18s;');
  if(hot)d.style.transform='translateY(-4px)';
  mk(d,'div','width:14px;height:14px;margin:0 auto;background:'+(tint||'#e8c48a')+';border:1px solid #7a5a2a;');
  mk(d,'div','width:22px;height:18px;margin:2px auto 0;background:'+(hot?'#2f8f2f':'#245c24')+';'+
    'border:1px solid '+(hot?'#7CFC00':'#1f3f1f')+';'+(hot?'box-shadow:0 0 8px #2b6;':''));
  mk(d,'div','margin:3px auto 0;width:34px;border:1px solid '+(hot?'#7CFC00':'#c9a24a')+';'+
    'background:#241c06;color:#ffce3a;font-size:14px;padding:1px 0;letter-spacing:1px;',val);
  return d;
}
function renderBubbleG(el,api,cfg){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:'+(cfg.chal?520:470)+'px;max-width:'+(cfg.chal?720:640)+'px;'+TXT);
  header(wrap,
    cfg.chal?tx('★ Challenge · The Ocho','★ 挑战 · 八人乱斗'):tx('The Bubble Grand Prix','冒泡竞速'),
    cfg.chal?'SORT .arena+':'SORT .arena');

  if(!cfg.chal&&FLAG(api,'algo_bubble_done')){
    mk(wrap,'div','',
      tx('The five fighters stand in perfect ascending order, waving at the stands. The sand still spells out your comparison count.<br>'+
         '<span style="'+DIM+'">MC stdout, hoarse: "BUBBLE SORT, ladies and gentlemen. Adjacent pairs only. Simple, honest, O(n&sup2;) — like a handshake that takes all afternoon."</span>',
         '五位选手按升序站得笔直, 朝看台挥手。沙地上还留着你的比较次数。<br>'+
         '<span style="'+DIM+'">MC stdout 喊哑了嗓子: "女士们先生们, 这就是冒泡排序 (bubble sort)! 只比相邻, 简单诚恳, O(n&sup2;)——像一场要握一下午的握手。"</span>'));
    var bar=mk(wrap,'div','margin-top:10px;display:flex;gap:10px;');
    if(FLAG(api,'algo_challenge_1')){
      mk(wrap,'div','margin-top:8px;'+K+'font-size:12px;',
        tx('★ Challenge cleared: eight fighters sorted inside the comparison budget.',
           '★ 挑战已通关: 八人乱斗, 比较预算内完成排序。'));
    }else{
      mk(bar,'button',BTN_GOLD,tx('★ Challenge: The Ocho (8 fighters, tight budget)','★ 挑战: 八人乱斗 (比较次数受限)')).onclick=function(){
        renderBubbleG(el,api,{chal:true,lineup:BUBBLE2_LINEUP,best:BUBBLE2_BEST,limit:BUBBLE2_LIMIT});
      };
    }
    mk(bar,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }
  if(cfg.chal&&FLAG(api,'algo_challenge_1')){
    mk(wrap,'div','',tx('Already conquered. The eight fighters bow whenever you walk past.',
      '已经征服过了。八位选手看到你路过都会鞠躬。'));
    mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Back','返回')).onclick=function(){
      renderBubbleG(el,api,{chal:false,lineup:BUBBLE_LINEUP,best:BUBBLE_BEST});};
    return;
  }

  mk(wrap,'div','',
    cfg.chal?
    tx('MC stdout drops an octave: "EIGHT fighters. And tonight the sponsors are stingy — <span style="'+K+'">a budget of '+cfg.limit+' comparisons</span> (perfect play needs '+cfg.best+'). Blow the budget and we restart the whole card."<br>'+
       '<span style="'+DIM+'">Optional. Walk away and the main quest will not judge you. The crowd might.</span>',
       'MC stdout 压低了一个八度: "八位选手。今晚赞助商很抠——<span style="'+K+'">比较预算 '+cfg.limit+' 次</span> (完美打法要 '+cfg.best+' 次)。超了预算, 整场重开。"<br>'+
       '<span style="'+DIM+'">纯选做。转身就走, 主线不评价你。看台可能会。</span>')
    :
    tx('MC stdout seizes the mic: "LADIES, GENTLEMEN, AND BACKGROUND PROCESSES! Five fighters! One rule older than the compiler: '+
       '<span style="'+K+'">you may only compare two ADJACENT fighters</span> — press VS, watch them flex, then decide: <b>SWAP or KEEP</b>. '+
       'Line them up <b>smallest to biggest</b> and the arena is yours!"<br>'+
       '<span style="'+DIM+'">The stands react to every call, and they are not always kind. Perfect play: '+cfg.best+' comparisons — the standing ARENA RECORD.</span>',
       'MC stdout 一把抢过话筒: "女士们! 先生们! 以及各位后台进程! 五位选手! 一条比编译器还古老的规矩: '+
       '<span style="'+K+'">只能比较相邻的两位</span>——按下 VS, 看他们亮肌肉, 然后你来判: <b>换 (SWAP) 还是不换 (KEEP)</b>。'+
       '把他们排成<b>从小到大</b>, 竞技场就是你的!"<br>'+
       '<span style="'+DIM+'">你每判一次, 看台就起一次哄, 而且未必嘴下留情。完美打法: '+cfg.best+' 次比较——场上纪录, 挂到今天没人碰得动。</span>'));

  var st=bubbleNew(cfg.lineup);
  var crowd=crowdMake(wrap);
  var stage=mk(wrap,'div','margin:6px 0 2px;');
  var deciBar=mk(wrap,'div','min-height:38px;margin-top:6px;text-align:center;');
  var msg=mk(wrap,'div','min-height:20px;font-size:12px;color:#ffce3a;text-align:center;');
  var meta=mk(wrap,'div',DIM+'margin-top:2px;text-align:center;','');
  var picking=null;

  function drawMeta(){
    meta.innerHTML=tx('comparisons: ','比较次数: ')+'<b style="'+K+'">'+st.comps+'</b>'+
      (cfg.limit?(' / '+cfg.limit):'')+
      '　·　'+tx('record pace: ','纪录线: ')+cfg.best;
  }
  function draw(){
    stage.innerHTML='';
    var row=mk(stage,'div','display:flex;justify-content:center;align-items:flex-end;gap:2px;flex-wrap:wrap;');
    for(var i=0;i<st.arr.length;i++){
      fighter(row,st.arr[i],picking!==null&&(i===picking||i===picking+1));
      if(i<st.arr.length-1){
        (function(idx){
          var vs=mk(row,'button','background:#1a0a0a;color:#ff9c9c;border:1px solid #7a2f2f;'+
            'padding:2px 6px;font-family:inherit;font-size:11px;cursor:pointer;align-self:center;border-radius:2px;'+
            (picking===idx?'box-shadow:0 0 8px #f66;color:#fff;':''),'VS');
          vs.onclick=function(){
            if(picking===idx){picking=null;deciBar.innerHTML='';draw();return;}
            picking=idx;S(api,'ui');decide();draw();
          };
        })(i);
      }
    }
    drawMeta();
  }
  function decide(){
    deciBar.innerHTML='';
    var a=st.arr[picking],b=st.arr[picking+1];
    mk(deciBar,'span','color:#ff9c9c;font-size:13px;margin-right:10px;',
      tx('⚔ '+a+' vs '+b+' — the crowd holds its breath…','⚔ '+a+' vs '+b+' —— 全场屏息…'));
    mk(deciBar,'button',BTN_HOT,tx('SWAP ⇄','换 ⇄')).onclick=function(){judge(true);};
    mk(deciBar,'button',BTN,tx('KEEP ▦','不换 ▦')).onclick=function(){judge(false);};
  }
  function judge(swap){
    var i=picking;picking=null;deciBar.innerHTML='';
    var r=bubbleDecide(st,i,swap);
    if(!r.ok)return;
    if(r.good){
      S(api,'step');crowd.cheer(swap?3:2);
      msg.textContent=swap?tx('The crowd ROARS — clean swap!','全场炸了——这一换, 干净!')
                          :tx('Polite applause — right call, no swap needed.','礼貌掌声——判得对, 不用换。');
    }else{
      S(api,'err');crowd.boo(3);
      bumpFail(api,cfg.chal?'algo_bub2_fails':'algo_bubble_fails','algo_bubble',B(
        'MC stdout drops the mic to a murmur, just for you: "Hey. The stands boo the swap, never the sorter — I have called this game for twenty years, remember. The whole trick is one line: compare NEIGHBOURS, swap when the left one is bigger, sweep left to right. I left the plainest hint out on the sand. Take the record on your own clock."',
        'MC stdout 把麦克风压成一句耳语, 只说给你听: 「嘿。看台嘘的是那一换, 从不是排序的人——这游戏我可解说了二十年。诀窍就一句话: 只比相邻两位, 左边更大就换, 从左往右扫。最直白的提示我给你撒在沙地上了。纪录嘛, 按你自己的节奏来。」'));
      msg.textContent=swap?tx('BOOOO — they were already in order and you swapped them anyway.','嘘声四起——人家本来就站对了, 你偏要换。')
                          :tx('BOOOO — that pair was upside down and you just… walked away.','嘘声四起——那俩明明站反了, 你居然装没看见。');
    }
    if(cfg.limit&&st.comps>=cfg.limit&&!r.sorted){
      S(api,'err');crowd.boo(5);
      msg.textContent=tx('✗ Comparison budget gone. MC stdout: "Sponsors are FURIOUS. We go again!"',
        '✗ 比较预算烧完了。MC stdout: "赞助商怒了。重赛!"');
      st=bubbleNew(cfg.lineup);
      setTimeout(draw,900);
      return;
    }
    if(r.sorted){win();return;}
    draw();
  }
  function win(){
    draw();
    var recordTied=(st.comps===cfg.best);
    if(cfg.chal){SET(api,'algo_challenge_1');}
    else{SET(api,'algo_bubble_done');STEP(api,'algo_a1');}
    S(api,'quest');
    if(recordTied)crowd.wild(8);else crowd.cheer(6);
    deciBar.innerHTML='';
    var box=mk(wrap,'div','margin-top:8px;border:1px dashed #c9a24a;background:rgba(40,30,5,.3);padding:8px 10px;font-size:12px;line-height:1.7;');
    box.innerHTML=[
      tx('<b style="color:#9fee9f;">MC stdout:</b> "IT. IS. SORTED! <b>Bubble sort, ladies and gentlemen!</b> '+
         'Small numbers sink, big numbers bubble, and nobody read the manual!"',
         '<b style="color:#9fee9f;">MC stdout:</b> "排! 好! 了! <b>女士们先生们, 这就是冒泡排序 (bubble sort)!</b> '+
         '小数下沉, 大数上浮, 全程没人看说明书!"'),
      tx('<b>Match stats</b> — comparisons: <b style="'+K+'">'+st.comps+'</b> · swaps: '+st.swaps+
         ' · record pace: '+cfg.best+(recordTied?' — <b style="color:#ffce3a;">★ ARENA RECORD EQUALLED ★</b> (every comparison earned its ticket)':''),
         '<b>赛后数据</b> —— 比较: <b style="'+K+'">'+st.comps+'</b> 次 · 交换: '+st.swaps+
         ' 次 · 纪录线: '+cfg.best+(recordTied?' —— <b style="color:#ffce3a;">★ 追平场上纪录 ★</b> (每一次比较都没白花)':'')),
      '<b>'+tx('Action replay','操作回放')+'</b>'
    ].join('<br>');
    var rep=mk(box,'div',DIM+'margin-top:4px;max-height:110px;overflow-y:auto;line-height:1.6;');
    st.log.forEach(function(L,n){
      rep.innerHTML+='#'+(n+1)+'　'+L.a+' vs '+L.b+' → '+
        (L.swap?tx('<span style="color:#7CFC00;">swapped</span>','<span style="color:#7CFC00;">交换</span>')
               :tx('kept','保持'))+
        (L.good?'':' <span style="color:#ff8080;">'+tx('(crowd booed)','(被喝了倒彩)')+'</span>')+'<br>';
    });
    if(cfg.chal){
      TOAST(api,B('★ Challenge 1 cleared — MC stdout: "Eight fighters, one budget, ZERO waste. Somebody sign this one!"',
                  '★ 挑战 1 通关 —— MC stdout: "八位选手, 一份预算, 零浪费。谁快把这人签了!"'),true);
    }else{
      TOAST(api,B('MC stdout: "Round One goes to the challenger! The zombie in the hunting pit just spat out its coffee."',
                  'MC stdout: "第一轮属于挑战者! 猎场里那只僵尸把咖啡都喷出来了。"'),true);
      afterDuo(api);
    }
    var bar=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;');
    if(cfg.chal)mk(bar,'button',BTN,tx('Back','返回')).onclick=function(){
      renderBubbleG(el,api,{chal:false,lineup:BUBBLE_LINEUP,best:BUBBLE_BEST});};
    mk(bar,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
  }
  draw();

  if(!cfg.chal){
    addHints(wrap,'algo_bubble',[
      B('Bubble sort\'s whole personality: <b>compare neighbours, swap if the left one is bigger</b>. Repeat until nobody needs swapping. Big numbers "bubble" toward the right end.',
        '冒泡排序 (bubble sort) 的全部人设: <b>比较相邻两人, 左边更大就交换</b>。重复到没有人需要换为止。大数会像气泡一样往右端"浮"。'),
      B('Do not compare at random — scan <b>left to right</b> and press VS only where the left fighter is bigger. A comparison that ends in KEEP is a comparison wasted (the crowd knows it, too).',
        '别乱点——<b>从左往右扫</b>, 只在"左边比右边大"的地方按 VS。一次以"不换"收场的比较就是浪费 (看台心里也有数)。'),
      B('Worked example, different numbers — sort [30, 5, 50, 20], swapping only where the left neighbour is bigger. Left to right: 30>5 swap (5 30 50 20); 30<50 keep; 50>20 swap (5 30 20 50). Next sweep: 5<30 keep; 30>20 swap (5 20 30 50); 30<50 keep — a full sweep with no swaps means done. Three swaps: 30-5, 50-20, 30-20. Your line-up is the same drill — scan left to right, press VS only on a left-bigger pair, repeat sweeps until one clean pass needs none.',
        '例子 (换了数字) —— 把 [30, 5, 50, 20] 排好, 只在"左边更大"处交换。从左往右: 30>5 换 (5 30 50 20); 30<50 不换; 50>20 换 (5 30 20 50)。下一趟: 5<30 不换; 30>20 换 (5 20 30 50); 30<50 不换——整趟扫下来一次都不换, 就排完了。三次交换: 30-5、50-20、30-20。你面前这排是同样的套路——从左往右扫, 只在"左大右小"处按 VS, 一趟趟重复, 直到有一趟完全不用换。')
    ]);
  }else{
    mk(wrap,'div',DIM+'margin-top:6px;',
      tx('Cold tip: budget = perfect + 4. You can afford exactly four "just checking" comparisons. Spend them like rent money.',
         '冷提示: 预算 = 完美打法 + 4。也就是说, 全场只有四次"我就看看"的额度。当救命钱花。'));
  }
}
function renderBubble(el,api){
  renderBubbleG(el,api,{chal:false,lineup:BUBBLE_LINEUP,best:BUBBLE_BEST});
}

/* ================================================================
   4. 谜题 2 · 二分猎手 (§9.1 Searching — binary search)
   ================================================================ */
var ZOMBIE_TAUNT_HI=[
  B('HIGHER, meatbag! My contempt is higher than your guess!','太小了, 肉体凡胎! 我对你的鄙视都比这个数高!'),
  B('Higher! I have socks older than that number!','往上猜! 就这数儿, 也好意思报出来?'),
  B('HIGHER. Were you even trying, or just warming the button?','再高点。你是在猜, 还是在给按钮暖手?'),
  B('Higher~ each wrong guess makes my hair grow back a little.','高一点~ 你每猜错一次, 我头发就长回来一根。')
];
var ZOMBIE_TAUNT_LO=[
  B('LOWER! Way to overshoot the entire postcode!','太大了! 你这一枪直接打出服务区了!'),
  B('Lower. My number saw yours and filed a restraining order.','往下。我的数看见你这个数, 连夜搬了个家。'),
  B('LOWER, hunter. The ceiling is not hiding any secrets.','再低点, 猎手。天花板上可没藏数字。'),
  B('Lower~ I felt the wind as that one flew over my head.','低一点~ 那个数从我头顶飞过去的时候带起了风。')
];
var ZOMBIE_ART=
'   ▄▄▄▄▄\n  █ x  x █\n  █  ──  █\n   ▀█▀▀█▀\n  ▄█    █▄';
function zombieShatter(host,cb){
  var box=mk(host,'div','margin:8px 0;padding:8px;border:1px solid #7a2f2f;background:rgba(40,5,5,.4);text-align:center;');
  var pre=mk(box,'pre','margin:0;color:#9ad0a8;font-size:13px;line-height:1.25;font-family:inherit;',ZOMBIE_ART);
  var frames=[
    '   ▄▄▄▄▄\n  █ ◉  ◉ █\n  █  ──  █\n   ▀█▀▀█▀\n  ▄█    █▄',
    '   ▄▄ ▄▄\n  █ ◉  ◉ █\n  ▀  ──  ▀\n   ▀█ ▀█▀\n  ▄▀    ▀▄',
    '   ▄   ▄\n  ▀ ◉  ◉ ▀\n     ──\n    ▀  ▀\n   ▀    ▀',
    '  ·  ▄ ·\n   ·◉  ◉·\n  ·  ─ ·\n   · · ·\n  ·   ·',
    '   ·   ·\n  ·  ·  ·\n    · ·\n  ·   · ·\n     ·'
  ];
  var i=0;
  var tm=setInterval(function(){
    pre.textContent=frames[Math.min(i,frames.length-1)];
    i++;
    if(i>frames.length+1){
      clearInterval(tm);
      pre.textContent='· · ·   E X I T   0   · · ·';
      if(cb)cb();
    }
  },170);
}
function renderBinaryG(el,api,cfg){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:500px;max-width:680px;'+TXT);
  header(wrap,
    cfg.chal?tx('★ Challenge · Hunt of a Thousand','★ 挑战 · 千数狩猎'):tx('The Binary Hunt','二分猎手'),
    cfg.chal?'SEARCH .pit+':'SEARCH .pit');

  if(!cfg.chal&&FLAG(api,'algo_bin_done')){
    mk(wrap,'div','',
      tx('The hunting pit is quiet. A chalk outline of a very smug zombie decorates the floor, split neatly down the middle.<br>'+
         '<span style="'+DIM+'">MC stdout\'s echo: "log&#8322;(100) &asymp; 6.6 — seven cuts and ANY number in a hundred has nowhere left to hide."</span>',
         '猎场安静下来。地上留着一个嚣张僵尸的粉笔轮廓, 正中间裂得整整齐齐。<br>'+
         '<span style="'+DIM+'">MC stdout 的回声: "log&#8322;(100) &asymp; 6.6 —— 七刀下去, 一百个数里任何一个都无处可藏。"</span>'));
    var bar=mk(wrap,'div','margin-top:10px;display:flex;gap:10px;');
    if(FLAG(api,'algo_challenge_2')){
      mk(wrap,'div','margin-top:8px;'+K+'font-size:12px;',
        tx('★ Challenge cleared: 1 to 1000 in ten guesses. The zombie\'s cousin refuses to visit this arena now.',
           '★ 挑战已通关: 1 到 1000, 十次拿下。僵尸的表哥现在拒绝来这座竞技场。'));
    }else{
      mk(bar,'button',BTN_GOLD,tx('★ Challenge: 1–1000, ten guesses','★ 挑战: 1–1000, 只给 10 次')).onclick=function(){
        renderBinaryG(el,api,{chal:true,max:BIN2_MAX,guesses:BIN2_GUESSES});
      };
    }
    mk(bar,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }
  if(cfg.chal&&FLAG(api,'algo_challenge_2')){
    mk(wrap,'div','',tx('Already hunted. A thousand numbers, and none of them sleeps soundly.',
      '已经猎杀过了。一千个数, 现在没有一个睡得踏实。'));
    mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Back','返回')).onclick=function(){
      renderBinaryG(el,api,{chal:false,max:BIN_MAX,guesses:BIN_GUESSES});};
    return;
  }

  var secret=1+Math.floor(Math.random()*cfg.max);
  var st=binNew(cfg.max,cfg.guesses,secret);
  var crowd=crowdMake(wrap);

  mk(wrap,'div','',
    tx('A zombie process lounges on the pit wall, filing its nails on a segfault.<br>'+
       '<b style="color:#9ad0a8;">Zombie:</b> "I\'m thinking of a number between <b>1 and '+cfg.max+'</b>. '+
       'You get <b style="'+K+'">'+cfg.guesses+' guesses</b>. Miss them all and I do my victory dance. '+
       'It\'s a TERRIBLE dance. You do NOT want to see the dance."',
       '一只僵尸进程斜倚在猎场墙上, 拿一枚段错误 (segfault) 锉指甲。<br>'+
       '<b style="color:#9ad0a8;">僵尸:</b> "我心里想了一个 <b>1 到 '+cfg.max+'</b> 之间的数。'+
       '给你 <b style="'+K+'">'+cfg.guesses+' 次机会</b>。全猜不中, 我就跳胜利之舞——'+
       '跳得奇丑无比, 看过的都后悔。"'));

  var artBox=mk(wrap,'div','text-align:center;');
  mk(artBox,'pre','display:inline-block;margin:6px 0 0;color:#9ad0a8;font-size:13px;line-height:1.25;font-family:inherit;',ZOMBIE_ART);
  var taunt=mk(wrap,'div','min-height:22px;font-size:12.5px;color:#9ad0a8;text-align:center;','…');
  /* 数轴: 50 格, 排除区涂黑 (二分可视化) */
  var lineBox=mk(wrap,'div','margin:10px 0 2px;');
  var lineLbl=mk(wrap,'div',DIM+'text-align:center;','');
  function drawLine(){
    lineBox.innerHTML='';
    var row=mk(lineBox,'div','display:flex;height:16px;border:1px solid #1f3f1f;');
    var cells=50,per=cfg.max/cells;
    for(var i=0;i<cells;i++){
      var a=Math.floor(i*per)+1,b=Math.floor((i+1)*per);
      var alive=!(b<st.lo||a>st.hi);
      mk(row,'div','flex:1;'+(alive
        ?'background:rgba(35,90,35,.8);border-right:1px solid rgba(10,30,10,.6);'
        :'background:#0a0a0a;border-right:1px solid #111;'));
    }
    lineLbl.innerHTML=tx('possible: ','剩余可能: ')+'<b style="'+K+'">['+st.lo+' … '+st.hi+']</b> ('+
      (st.hi-st.lo+1)+tx(' numbers left',' 个数')+')　·　'+
      tx('guesses left: ','剩余次数: ')+'<b style="'+K+'">'+st.left+'</b>';
  }
  var row=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;justify-content:center;align-items:center;');
  var inp=mk(row,'input','background:#04140a;color:#7CFC00;border:1px solid #2f6f2f;padding:5px 10px;'+
    'font-family:inherit;font-size:14px;width:86px;text-align:center;');
  inp.type='text';inp.placeholder='1–'+cfg.max;
  var btn=mk(row,'button',BTN_HOT,tx('FIRE 🡒','开猜 🡒'));
  var msg=mk(wrap,'div','min-height:20px;font-size:12px;color:#ffce3a;text-align:center;');
  var histBox=mk(wrap,'div',DIM+'text-align:center;margin-top:2px;','');

  function pick(pool){return T(pool[Math.floor(Math.random()*pool.length)]);}
  function fire(){
    var g=parseInt(inp.value,10);
    var r=binGuess(st,g);
    inp.value='';inp.focus();
    if(r.res==='bad'){S(api,'err');
      msg.textContent=tx('A whole number from 1 to '+cfg.max+', hunter. The zombie snickers at your keyboard.',
        '请输入 1 到 '+cfg.max+' 的整数, 猎手。僵尸对着你的键盘窃笑。');return;}
    if(r.res==='over')return;
    histBox.textContent=tx('your shots: ','弹道记录: ')+st.history.join(' → ');
    if(r.res==='hit'){
      var used=r.used;
      btn.disabled=true;S(api,'ok');crowd.wild(7);
      taunt.innerHTML='<b>'+g+'?!</b> '+tx('"…how. HOW. I hid it SO well—"','"……你怎么会。我明明藏得那么好——"');
      artBox.innerHTML='';
      zombieShatter(artBox,function(){
        var box=mk(wrap,'div','margin-top:8px;border:1px dashed #c9a24a;background:rgba(40,30,5,.3);padding:8px 10px;font-size:12px;line-height:1.7;');
        box.innerHTML=
          tx('<b style="color:#9fee9f;">MC stdout:</b> "DOWN in <b>'+used+'</b>! And THAT, dear spectators, is the dark magic of '+
             '<b>binary search</b>: every guess at the middle <b>halves</b> what remains. '+
             cfg.max+' → and log&#8322;('+cfg.max+') &asymp; '+(Math.log(cfg.max)/Math.LN2).toFixed(1)+
             ' — so '+cfg.guesses+' cuts always suffice. The zombie never stood a chance. <i>Nothing sorted ever does.</i>"',
             '<b style="color:#9fee9f;">MC stdout:</b> "第 <b>'+used+'</b> 枪, 猎杀完成! 观众朋友们, 这就是'+
             '<b>二分查找 (binary search)</b> 的黑魔法: 每次猜剩余区间的正中间, 可能性直接<b>砍半</b>。'+
             cfg.max+' 个数, log&#8322;('+cfg.max+') &asymp; '+(Math.log(cfg.max)/Math.LN2).toFixed(1)+
             ' —— 所以 '+cfg.guesses+' 刀永远够用。僵尸从一开始就没有胜算。<i>一切有序 (sorted) 的东西都没有。</i>"');
        if(cfg.chal){
          SET(api,'algo_challenge_2');S(api,'quest');
          TOAST(api,B('★ Challenge 2 cleared — a thousand hiding spots, ten cuts. MC stdout is speechless, which has never happened.',
                      '★ 挑战 2 通关 —— 一千个藏身处, 十刀清场。MC stdout 罕见地说不出话了。'),true);
        }else{
          SET(api,'algo_bin_done');STEP(api,'algo_a2');S(api,'quest');
          TOAST(api,B('The zombie shatters into polite pixels. Somewhere, its cousin updates the family group chat: "do NOT play their game."',
                      '僵尸碎成了一地礼貌的像素。它表哥在家族群里更新警告: "千万别跟这人玩猜数。"'),true);
          afterDuo(api);
        }
        var bar=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;');
        if(cfg.chal)mk(bar,'button',BTN,tx('Back','返回')).onclick=function(){
          renderBinaryG(el,api,{chal:false,max:BIN_MAX,guesses:BIN_GUESSES});};
        mk(bar,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
      });
      drawLine();return;
    }
    /* higher / lower */
    S(api,'step');
    taunt.innerHTML=(r.res==='higher'?pick(ZOMBIE_TAUNT_HI):pick(ZOMBIE_TAUNT_LO));
    drawLine();
    if(r.dead){
      S(api,'err');crowd.boo(4);
      bumpFail(api,cfg.chal?'algo_bin2_fails':'algo_bin_fails','algo_bin',B(
        'MC stdout, quietly, between rounds: "Don\'t let the dance rattle you — it\'s all bluff. Guess the MIDDLE of whatever is still green on the line, every single time. That one habit corners any hundred in seven cuts. Plainest hint\'s on the board. A reload costs you nothing here."',
        'MC stdout 趁着换局, 悄声说: 「别让那支舞晃了神——全是虚张声势。每一次, 都猜数轴上还绿着那段的正中间。就这一个习惯, 七刀之内逼死任意一百个数。最直白的提示挂牌子上了。在这儿, 重开一局不要你半分钱。」'));
      msg.innerHTML=tx('✗ Out of guesses. It was <b>'+st.secret+'</b>. The zombie does the dance. It is worse than advertised.<br>'+
        '<span style="'+DIM+'">It picks a NEW number and cracks its knuckles. Round two?</span>',
        '✗ 次数用完。答案是 <b>'+st.secret+'</b>。僵尸跳起了胜利之舞, 比宣传的还难看。<br>'+
        '<span style="'+DIM+'">它已经想好了一个新数字, 掰着指节等你。再来一局?</span>');
      secret=1+Math.floor(Math.random()*cfg.max);
      st=binNew(cfg.max,cfg.guesses,secret);
      histBox.textContent='';
      setTimeout(drawLine,1100);
      return;
    }
    msg.textContent='';
  }
  btn.onclick=fire;
  inp.onkeydown=function(e){if(e.key==='Enter')fire();};
  drawLine();

  if(!cfg.chal){
    addHints(wrap,'algo_bin',[
      B('Binary search only works because the list is sorted. Look at the middle value: if your target is bigger, the ENTIRE lower half can be thrown away in one go; if smaller, the entire upper half goes. You never re-check a discarded half — each guess should kill roughly half of whatever is still possible.',
        '二分查找 (binary search) 只对<b>已排序</b>的数据有效。看中间那个数: 目标更大, 下半区就整个扔掉; 目标更小, 上半区整个扔掉。扔掉的那一半再也不用看——每一次猜, 都该干掉大约一半的剩余可能。'),
      B('Here that plays out as: every guess the zombie shouts "higher" (kills your guess and everything at or below it) or "lower" (kills your guess and everything at or above it) — watch the number line turn black. Your best move each time is to guess the exact middle of what is still green: 100 → 50 → 25 → 12 → 6 → 3 → 1, seven halvings, guaranteed.',
        '放到这道题里就是: 每猜一次, 僵尸会喊 "higher"(你猜的数及以下全部出局) 或 "lower"(及以上全部出局)——看数轴变黑。每一步的最优解都是猜"还是绿色"的区间正中间: 100 → 50 → 25 → 12 → 6 → 3 → 1, 七次砍半, 必中。'),
      B('Recipe: guess floor((lo+hi)/2) of the shown [lo … hi]. "higher" → new lo = guess+1; "lower" → new hi = guess−1. Repeat. This is binary search — it is literally the whole algorithm.',
        '照抄公式: 对屏幕上的 [lo … hi] 猜 floor((lo+hi)/2)。喊 higher → lo = 猜数+1; 喊 lower → hi = 猜数−1。重复即可。这就是二分查找 (binary search)——整个算法就这么点。')
    ]);
  }else{
    mk(wrap,'div',DIM+'margin-top:6px;',
      tx('Cold tip: 2&#185;&#8304; = 1024 &ge; 1000. Ten perfect midpoints and the thousand runs dry. One lazy guess and the maths stops forgiving.',
         '冷提示: 2&#185;&#8304; = 1024 &ge; 1000。十次完美中点, 一千个数就见底。但只要偷懒猜偏一次, 数学就不再原谅你。'));
  }
}
function renderBinary(el,api){
  renderBinaryG(el,api,{chal:false,max:BIN_MAX,guesses:BIN_GUESSES});
}

/* ================================================================
   5. 谜题 3 · Boss: SQL 酒馆 (§8 Databases — SQL SELECT)
   ================================================================ */
/* 酒保的报错腔 (%N = near token) */
var SQL_ERR_LINES={
  empty:B('ERROR: empty order. GRANT polishes a glass at you, pointedly.',
          'ERROR: 空单。酒保 GRANT 对着你, 意味深长地擦了擦杯子。'),
  expect_select:B("ERROR near '%N': we don't serve %N here. Every order in this establishment begins with SELECT.",
          "ERROR near '%N': 本店不供应 %N。这里的每一份点单, 都以 SELECT 开头。"),
  expect_cols:B("ERROR near '%N': SELECT what, exactly? Give me column names, a *, or COUNT(*). I pour columns, not vibes.",
          "ERROR near '%N': SELECT 什么? 给我列名、* 或 COUNT(*)。我按列上酒, 不按感觉。"),
  expect_from:B("ERROR near '%N': lovely columns, but FROM which table? Drinks don't materialise out of thin schema.",
          "ERROR near '%N': 列选得不错, 但 FROM 哪张表? 酒可不会凭空从 schema 里冒出来。"),
  bad_table:B("ERROR: unknown table '%N'. This is the patrons bar. The '%N' bar burned down in the last garbage collection.",
          "ERROR: 查无此表 '%N'。本店只有 patrons 这张桌账。'%N' 那家店在上次垃圾回收 (GC) 里烧没了。"),
  unknown_col:B("ERROR: no column called '%N'. We stock: name, drink, bounty, table_no. Check the board above the bar.",
          "ERROR: 没有叫 '%N' 的列。本店库存: name, drink, bounty, table_no。抬头看吧台上方的牌子。"),
  expect_cond:B("ERROR near '%N': WHERE needs a condition, like bounty > 100. WHERE followed by silence is just loitering.",
          "ERROR near '%N': WHERE 后面要跟条件, 比如 bounty > 100。WHERE 后面接沉默, 那叫在店里闲逛。"),
  expect_cmp:B("ERROR near '%N': I know =, >, <, >=, <= and <>. Anything fancier and you're thinking of the cocktail bar upstairs.",
          "ERROR near '%N': 我只认 =, >, <, >=, <= 和 <>。更花哨的运算符, 你该去楼上的鸡尾酒吧问问。"),
  expect_val:B("ERROR near '%N': compare against a number or a 'quoted string'. Bare words evaporate before they reach the tap.",
          "ERROR near '%N': 比较的右边得是数字或 '带引号的字符串'。裸词还没流到酒龙头就蒸发了。"),
  expect_by:B("ERROR near '%N': ORDER needs its BY, then a column. ORDER alone is just you raising your voice at me.",
          "ERROR near '%N': ORDER 后面要跟 BY 和一个列名。光喊 ORDER, 那是在对酒保大声嚷嚷。"),
  count_syntax:B("ERROR near '%N': the headcount spell is spelt COUNT(*) — brackets, asterisk, no substitutions.",
          "ERROR near '%N': 数人头的咒语拼作 COUNT(*)——括号、星号, 一个都不能少。"),
  trailing:B("ERROR near '%N': the order was going great until '%N'. I stopped listening there, and so did the tap.",
          "ERROR near '%N': 这单本来点得挺好, 直到 '%N' 为止。从那儿开始我就不听了, 酒龙头也是。"),
  unterminated_string:B("ERROR: unterminated string %N… — close your quotes. The last patron who left a quote open flooded the cellar.",
          "ERROR: 字符串没收尾 %N…… 把引号闭合上。上一个不闭合引号的客人, 把酒窖淹了。"),
  badchar:B("ERROR near '%N': whatever '%N' is, it isn't SQL. Possibly a hairball.",
          "ERROR near '%N': 不管 '%N' 是什么, 反正不是 SQL。可能是个毛球。")
};
function sqlErrText(err){
  var line=SQL_ERR_LINES[err.code]||B("ERROR near '%N': syntax error.","ERROR near '%N': 语法错误。");
  var near=(err.near===''||err.near==null)?tx('end of order','单子末尾'):err.near;
  return T(line).split('%N').join(near);
}
/* 结果表渲染 */
function sqlResultTable(host,res){
  var t=mk(host,'table','border-collapse:collapse;margin:6px auto;font-size:12px;');
  var hr=mk(t,'tr','');
  res.cols.forEach(function(c){
    mk(hr,'th','border:1px solid #c9a24a;color:#ffce3a;padding:2px 10px;background:rgba(40,30,5,.4);font-weight:normal;letter-spacing:1px;',c);
  });
  res.rows.forEach(function(r){
    var tr=mk(t,'tr','');
    r.forEach(function(v){
      mk(tr,'td','border:1px solid #2f6f2f;color:#bfeebf;padding:2px 10px;text-align:center;',String(v));
    });
  });
  if(!res.rows.length)mk(host,'div',DIM+'text-align:center;',tx('(0 rows — the tavern echoes)','(0 行——酒馆里一阵回声)'));
  return t;
}
/* 像素酒杯从吧台滑过: 每行结果一杯 */
function beerSlide(host,n,api){
  var bar=mk(host,'div','position:relative;height:34px;margin:6px 0;border-bottom:2px solid #7a5a2a;'+
    'background:linear-gradient(rgba(60,40,10,.15),rgba(60,40,10,.35));overflow:hidden;');
  var count=Math.max(1,Math.min(n,8));
  for(var i=0;i<count;i++)(function(k){
    setTimeout(function(){
      var mug=mk(bar,'div','position:absolute;left:-26px;bottom:2px;width:16px;height:20px;'+
        'transition:left 1.15s cubic-bezier(.2,.8,.4,1);');
      mk(mug,'div','width:14px;height:5px;background:#fff8e0;border:1px solid #c9a24a;border-bottom:none;');   // 泡沫
      mk(mug,'div','width:14px;height:13px;background:#e8a020;border:1px solid #c9a24a;border-top:none;');     // 酒体
      mk(mug,'div','position:absolute;right:-4px;top:8px;width:4px;height:7px;border:1px solid #c9a24a;border-left:none;'); // 杯柄
      setTimeout(function(){mug.style.left=(18+k*30)+'px';},20);
      S(api,'step');
    },k*230);
  })(i);
  return bar;
}
function renderTavern(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:540px;max-width:720px;'+TXT);
  header(wrap,tx('BOSS · The SELECT Tavern','BOSS · SELECT 酒馆'),'DB .tavern');

  /* 未解锁: 先赢前两场 */
  if(!(FLAG(api,'algo_bubble_done')&&FLAG(api,'algo_bin_done'))){
    mk(wrap,'div','',
      tx('The tavern door is bolted. A note in immaculate handwriting:<br>'+
         '<span style="'+K+'">"Patrons must hold TWO arena victories. Sort something. Find something. THEN we talk queries."</span><br>'+
         '<span style="'+DIM+'">— GRANT, barkeep. (Below, smaller: "No, shouting SELECT through the keyhole does not count.")</span>',
         '酒馆大门闩着。门上贴着一张字迹一丝不苟的告示:<br>'+
         '<span style="'+K+'">「进店须持两场竞技胜绩。先排好点什么, 再找到点什么, 然后我们才谈查询 (query)。」</span><br>'+
         '<span style="'+DIM+'">—— 酒保 GRANT。(下方小字: "对着钥匙孔喊 SELECT 不算。")</span>'));
    mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }

  var mainDone=FLAG(api,'algo_sql_done');
  var chalDone=FLAG(api,'algo_challenge_3');
  var roundIdx=mainDone?0:(FLAG(api,'algo_sql_round')||0);
  var inChal=false;

  /* 通关后的门面 */
  if(mainDone&&!inChal){
    mk(wrap,'div','',
      tx('GRANT nods as you enter — the highest honour the tavern serves.<br>'+
         '<span style="'+DIM+'">Your Query Medal hangs behind the bar, between a fossilised bug and the shard of the last person who tried DROP TABLE.</span>',
         '你一进门, GRANT 就冲你点了点头——这是本店供应的最高荣誉。<br>'+
         '<span style="'+DIM+'">你的查询者勋章 (Query Medal) 挂在吧台后面, 位于一只化石虫 (bug) 和上一个想 DROP TABLE 的人的碎片之间。</span>'));
    var bar0=mk(wrap,'div','margin-top:10px;display:flex;gap:10px;');
    if(chalDone){
      mk(wrap,'div','margin-top:8px;'+K+'font-size:12px;',
        tx('★ Challenge cleared: the Syndicate orders. GRANT keeps your stool reserved.',
           '★ 挑战已通关: 辛迪加大单。GRANT 给你留了专座。'));
      mk(bar0,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
      return;
    }
    mk(bar0,'button',BTN_GOLD,tx('★ Challenge: the Syndicate orders','★ 挑战: 辛迪加大单')).onclick=function(){
      inChal=true;roundIdx=FLAG(api,'algo_sql_chal_round')||0;buildBar();
    };
    mk(bar0,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    /* 允许直接进挑战, 不重复画吧台 */
    return;
  }
  buildBar();

  function buildBar(){
    el.innerHTML='';
    wrap=mk(el,'div','padding:14px 18px;min-width:540px;max-width:720px;'+TXT);
    header(wrap,inChal?tx('★ The SELECT Tavern · Syndicate orders','★ SELECT 酒馆 · 辛迪加大单')
                      :tx('BOSS · The SELECT Tavern','BOSS · SELECT 酒馆'),'DB .tavern');
    if(!FLAG(api,'algo_sql_intro')&&!inChal){
      SET(api,'algo_sql_intro');
      TOAST(api,B('The tavern smells of ale and normalised data. Everything is exactly where the schema says it is.',
                  '酒馆里飘着麦酒和规范化数据 (normalised data) 的味道。每样东西都待在 schema 说它该待的地方。'),true);
    }
    /* CO-5 · Boss 前的一拍安静: 一整晚吵到没边的司仪, 忽然没词了 */
    if(!FLAG(api,'algo_boss_hush')&&!inChal){
      SET(api,'algo_boss_hush');
      TOAST(api,B('For the first time all night, MC stdout has nothing to announce. It drifts down and settles, quietly, into a chair at the back. (Behind the bar, GRANT sets out one clean glass too many, looks at it, and does not explain.) The tavern holds its breath. Then the ledger creaks open to page one.',
                  '整晚头一回, MC stdout 没词儿了。它悄悄飘下来, 在后排的椅子上坐定。(吧台后, GRANT 多摆出了一只擦得锃亮的空杯, 盯着它看了一眼, 什么也没解释。) 酒馆屏住了呼吸。然后, 桌账"吱呀"一声, 翻到了第一页。'),true);
    }
    mk(wrap,'div','',
      tx('Behind the bar stands <b style="color:#9fee9f;">GRANT</b> — a daemon in a spotless apron who has not spoken '+
         'a word of natural language since the great injection of \'03. Above the bar hangs the ledger — '+
         'the name on its spine reads <b style="color:#ffce3a;">patrons</b>. That is the table you query FROM:',
         '吧台后站着<b style="color:#9fee9f;">酒保 GRANT</b>——一个围裙一尘不染的 daemon, 自从 03 年那场注入攻击 (injection) 之后就再没说过一句自然语言。'+
         '吧台上方挂着桌账, 账本书脊上烫着表名: <b style="color:#ffce3a;">patrons</b>。你的 FROM 后面写的就是它:'));
    /* patrons 表 */
    var tbox=mk(wrap,'div','margin:8px 0;overflow-x:auto;');
    mk(tbox,'div','text-align:center;color:#ffce3a;letter-spacing:2px;margin-bottom:3px;font-size:12px;',
      'TABLE: patrons');
    var tb=mk(tbox,'table','border-collapse:collapse;margin:0 auto;font-size:12px;');
    var hr=mk(tb,'tr','');
    mk(hr,'th','border:1px solid #c9a24a;color:#6a8a5a;padding:2px 10px;background:rgba(40,30,5,.5);font-weight:normal;letter-spacing:1px;','#');
    SQL_TABLE.cols.forEach(function(c){
      mk(hr,'th','border:1px solid #c9a24a;color:#ffce3a;padding:2px 10px;background:rgba(40,30,5,.5);font-weight:normal;letter-spacing:1px;',c);
    });
    SQL_TABLE.rows.forEach(function(r,i){
      var tr=mk(tb,'tr','');
      mk(tr,'td','border:1px solid #2f6f2f;color:#4a7a4a;padding:2px 8px;text-align:center;',String(i+1));
      SQL_TABLE.cols.forEach(function(c){
        mk(tr,'td','border:1px solid #2f6f2f;color:#bfeebf;padding:2px 10px;text-align:center;',String(r[c]));
      });
    });

    var rounds=inChal?SQL_CHAL:SQL_ROUNDS;
    var ask=mk(wrap,'div','margin:8px 0;border-left:3px solid #c9a24a;padding:6px 10px;background:rgba(40,30,5,.25);font-size:12.5px;line-height:1.7;');
    var prog=mk(wrap,'div',DIM+'margin-bottom:4px;','');
    var inp=mk(wrap,'textarea','width:100%;box-sizing:border-box;background:#04140a;color:#7CFC00;'+
      'border:1px solid #2f6f2f;padding:6px 10px;font-family:inherit;font-size:13px;height:52px;resize:vertical;');
    inp.placeholder=tx('SELECT … FROM … WHERE …','SELECT … FROM … WHERE …');
    inp.spellcheck=false;
    var barRow=mk(wrap,'div','margin-top:6px;display:flex;gap:10px;align-items:center;');
    var run=mk(barRow,'button',BTN_HOT,tx('▶ Slide the order across the bar','▶ 把单子推给酒保'));
    mk(barRow,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    var msg=mk(wrap,'div','min-height:20px;font-size:12px;color:#ffce3a;margin-top:4px;line-height:1.7;');
    var fx=mk(wrap,'div','');

    function showRound(){
      var r=rounds[roundIdx];
      prog.innerHTML=(inChal?tx('Syndicate order ','辛迪加订单 '):tx('Order ','点单 '))+
        (roundIdx+1)+' / '+rounds.length;
      ask.innerHTML='<b style="color:#9fee9f;">GRANT</b> '+
        tx('slides over a fresh coaster and taps the ledger: ','推来一张新杯垫, 敲了敲桌账: ')+'<br>'+T(r.ask);
    }
    run.onclick=function(){
      fx.innerHTML='';
      var q=inp.value;
      var round=rounds[roundIdx];
      var chk=sqlRoundCheck(round,q);
      if(chk.err){
        S(api,'err');
        bumpFail(api,inChal?'algo_sql2_fails':'algo_sql_fails','algo_sql',B(
          'GRANT says nothing — he only slides a fresh coaster across, three words inked on it: "SELECT · FROM · WHERE." Then he taps the plainest hint, twice. From a chair at the back, MC stdout, softly: "The barkeep only looks stern. He is rooting for you. The whole tavern is."',
          'GRANT 一言不发——只把一张新杯垫推了过来, 上面用墨写着三个词: 「SELECT · FROM · WHERE。」然后在最直白的提示上敲了两下。后排椅子上, MC stdout 轻声说: 「酒保只是看着凶。他盼着你成呢。整间酒馆都盼着。」'));
        msg.innerHTML='<span style="color:#ff9c9c;">'+sqlErrText(chk.err)+'</span>';
        return;
      }
      if(!chk.ok){
        S(api,'err');
        bumpFail(api,inChal?'algo_sql2_fails':'algo_sql_fails','algo_sql',B(
          'GRANT says nothing — he only slides a fresh coaster across, three words inked on it: "SELECT · FROM · WHERE." Then he taps the plainest hint, twice. From a chair at the back, MC stdout, softly: "The barkeep only looks stern. He is rooting for you. The whole tavern is."',
          'GRANT 一言不发——只把一张新杯垫推了过来, 上面用墨写着三个词: 「SELECT · FROM · WHERE。」然后在最直白的提示上敲了两下。后排椅子上, MC stdout 轻声说: 「酒保只是看着凶。他盼着你成呢。整间酒馆都盼着。」'));
        var got=chk.got,want=chk.want;
        var diag;
        if(got.cols.length!==want.cols.length||got.cols.join(',')!==want.cols.join(','))
          diag=tx('That is a result set, friend — just not the one I asked for. Check <b>which columns</b> I wanted (and in what order).',
                  '朋友, 这确实是个结果集——只是不是我点的那份。看清我要的是<b>哪几列</b> (以及列的顺序)。');
        else if(got.rows.length!==want.rows.length)
          diag=tx('I asked for '+want.rows.length+' row(s); you poured '+got.rows.length+'. Re-read the <b>WHERE</b> — some patron is being over- or under-served.',
                  '我要的是 '+want.rows.length+' 行, 你端来了 '+got.rows.length+' 行。回去重读 <b>WHERE</b>——有客人被多算或漏算了。');
        else
          diag=tx('Right patrons, wrong order of service. When I say biggest first, I mean <b>ORDER BY … DESC</b>.',
                  '人都对, 上酒顺序不对。我说"从高到低", 指的就是 <b>ORDER BY … DESC</b>。');
        msg.innerHTML='<span style="color:#ff9c9c;">'+tx('GRANT eyes the tray: ','GRANT 盯着托盘: ')+'</span>'+diag;
        sqlResultTable(fx,got);
        return;
      }
      /* 正确! 上酒 */
      S(api,'ok');
      msg.innerHTML='<span style="color:#7CFC00;">'+
        tx('GRANT actually raises an eyebrow — 1 row of respect per glass.','GRANT 居然挑了一下眉——每上一杯, 敬意加一行。')+'</span>';
      beerSlide(fx,chk.got.rows.length,api);
      sqlResultTable(fx,chk.got);
      roundIdx++;
      SET(api,inChal?'algo_sql_chal_round':'algo_sql_round',roundIdx);
      if(roundIdx>=rounds.length){finale();return;}
      setTimeout(showRound,900);
    };
    function finale(){
      run.disabled=true;
      if(inChal){
        SET(api,'algo_challenge_3');S(api,'quest');
        mk(wrap,'div','margin-top:8px;border:1px dashed #c9a24a;background:rgba(40,30,5,.3);padding:8px 10px;font-size:12px;line-height:1.7;',
          tx('<b style="color:#9fee9f;">GRANT</b> pours something amber and ancient, on the house. On the coaster, in careful ink: '+
             '<span style="'+K+'">"COUNT(*), two predicates, a sort. You speak fluent bar."</span><br>'+
             '<span style="'+DIM+'">MC stdout, from the doorway: "AND THE SYNDICATE ORDERS ARE SERVED! I have never been prouder of a liver!"</span>',
             '<b style="color:#9fee9f;">GRANT</b> 倒了一杯琥珀色的陈年好酒, 店家请客。杯垫上是一行工整的墨字: '+
             '<span style="'+K+'">「COUNT(*)、双条件、再加排序。你的吧台语已经说得很流利了。」</span><br>'+
             '<span style="'+DIM+'">MC stdout 在门口喊: "辛迪加大单交付完毕! 点完这种单还能走直线的, 二十年头一个!"</span>'));
        TOAST(api,B('★ Challenge 3 cleared — GRANT reserves you a stool. Permanently.',
                    '★ 挑战 3 通关 —— GRANT 给你留了专座, 永久的。'),true);
      }else{
        SET(api,'algo_sql_done');S(api,'quest');
        GIVE(api,'query_medal','Query Medal');
        STEP(api,'algo_a3');
        mk(wrap,'div','margin-top:8px;border:1px dashed #c9a24a;background:rgba(40,30,5,.3);padding:8px 10px;font-size:12px;line-height:1.7;',
          tx('<b style="color:#9fee9f;">GRANT</b> reaches under the bar and pins something to your chest: '+
             '<span style="'+K+'">◈ the Query Medal</span>.<br>'+
             'Then — for the first time since \'03 — the daemon speaks: <b>"SELECT respect FROM me WHERE patron = you; -- 1 row returned."</b><br>'+
             '<span style="'+DIM+'">MC stdout bursts in: "THREE ORDERS! ZERO DROPPED TABLES! THE ARENA HAS A NEW CHAMPION OF THE BAR!" '+
             'The stands outside do the wave. Someone in row O(n&sup2;) faints.</span>',
             '<b style="color:#9fee9f;">GRANT</b> 从吧台底下摸出一样东西, 别在你胸口: '+
             '<span style="'+K+'">◈ 查询者勋章 (Query Medal)</span>。<br>'+
             '然后——03 年以来第一次——这个 daemon 开口了: <b>"SELECT respect FROM me WHERE patron = you; -- 返回 1 行。"</b><br>'+
             '<span style="'+DIM+'">MC stdout 破门而入: "三份订单! 零次删表! 竞技场迎来了新的吧台之王!" '+
             '场外看台掀起人浪, O(n&sup2;) 排有一位观众当场晕了过去。</span>'));
        TOAST(api,B('◈ Obtained: Query Medal — later chapters will recognise it.',
                    '◈ 取得「查询者勋章 (Query Medal)」——后续章节会认得它。'),true);
      }
      var bar2=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;');
      mk(bar2,'button',BTN,tx('Leave the tavern','离开酒馆')).onclick=function(){api.closePanel&&api.closePanel();};
      mk(bar2,'button',BTN,tx('Stay and admire the schema','留下欣赏 schema')).onclick=function(){renderTavern(el,api);};
    }
    showRound();

    addHints(wrap,'algo_sql',[
      B('Every SQL query has the same fixed skeleton, read left to right like a sentence: <b>SELECT</b> (which columns) → <b>FROM</b> (which table) → <b>WHERE</b> (which rows qualify — optional) → <b>ORDER BY</b> (how to sort — optional, always goes last). "Give me these columns, from this table, where this is true, sorted like this."',
        '每一句 SQL 查询都是同一个骨架, 从左到右念下来就像一句话: <b>SELECT</b>(要哪些列) → <b>FROM</b>(来自哪张表) → <b>WHERE</b>(哪些行合格——可选) → <b>ORDER BY</b>(怎么排序——可选, 永远放最后)。翻译成人话: "给我这些列, 来自这张表, 只要这个条件成立的, 按这个排序。"'),
      B('Order 1: SELECT name FROM patrons WHERE table_no = 3. Order 2 starts with SELECT * and needs ORDER BY bounty DESC at the end. Order 3 wants two columns (name, bounty) and TWO conditions glued with AND. GRANT grades the result rows, not your handwriting — any query returning the right rows is a right query.',
        '第 1 单: SELECT name FROM patrons WHERE table_no = 3。第 2 单以 SELECT * 开头, 结尾要 ORDER BY bounty DESC。第 3 单要两列 (name, bounty), 外加用 AND 粘住的两个条件。GRANT 只验结果的行对不对, 不验字迹——只要返回的行对, 怎么写都算对。'),
      B("Worked example on a DIFFERENT table — picture a table books(title, author, price, shelf). \"Titles of books on shelf 2\": SELECT title FROM books WHERE shelf = 2. \"Whole record of books over 20, dearest first\": SELECT * FROM books WHERE price > 20 ORDER BY price DESC. \"Title and price of books over 20 that are also on shelf 2\": SELECT title, price FROM books WHERE price > 20 AND shelf = 2. Map those three shapes straight onto patrons — same skeleton, swap in your own columns and conditions.",
        '换一张表的例子 —— 设想有张表 books(title, author, price, shelf)。"2 号书架上的书名": SELECT title FROM books WHERE shelf = 2。"价格超过 20 的完整记录, 最贵的排前面": SELECT * FROM books WHERE price > 20 ORDER BY price DESC。"价格超过 20 且在 2 号书架上的书名与价格": SELECT title, price FROM books WHERE price > 20 AND shelf = 2。把这三种形状原样套到 patrons 上——骨架相同, 换成你自己的列和条件即可。')
    ]);
    if(inChal){
      mk(wrap,'div',DIM+'margin-top:6px;',
        tx('Cold tip: COUNT(*) returns one number, not a list. And <> means "not equal" — the politest way SQL knows to exclude someone.',
           '冷提示: COUNT(*) 返回的是一个数, 不是名单。<> 意思是"不等于"——这是 SQL 请人出局最客气的说法。'));
    }
  }
}

/* ================================================================
   6. NPC 对话
   ================================================================ */

/* MC stdout —— 司仪 daemon。所有台词自带世纪大战滤镜。 */
function mcDialog(api){
  var SP=B('MC stdout','司仪 MC stdout');
  var fixed={sp:SP,t:B(
    '<span class="dim">(A daemon in a bow tie made of ribbon cable levitates six pixels off the sand, holding a microphone that is clearly just an old heat sink.)</span><br>'+
    'WELCOME! WELCOME, CONTESTANT, TO THE ONLY ARENA THAT NEVER CRASHES — <span class="k">because it was never stable to begin with!</span>',
    '<span class="dim">(一个系着排线领结的 daemon 悬浮在沙地上方六个像素处, 手里的麦克风明显是个旧散热片。)</span><br>'+
    '欢迎! 欢迎! 掌声送给新来的挑战者! 全机器独一份儿、从不崩溃的竞技场——<span class="k">为啥从不崩溃? 因为它压根儿就没稳定过!</span>')};

  /* 首次见面 */
  if(!FLAG(api,'algo_met_mc')){
    var nodes=[
      fixed,
      {sp:SP,t:B(
        'Twenty years this arena has waited for a headliner! The processes here fight over CPU slices, but YOU — you look like someone who fights over <span class="k">correctness</span>. Far more dangerous.',
        '这座竞技场等一位头牌选手, 等了二十年! 这儿的进程为 CPU 时间片打架, 而你——你看上去是为<span class="k">正确性</span>打架的人。危险得多。')},
      {sp:SP,t:B(
        'TONIGHT\'S CARD! <span class="k">In the west: THE BUBBLE GRAND PRIX</span> — five fighters, adjacent-only combat, sort them or be booed into next Tuesday! '+
        '<span class="k">In the east: THE BINARY HUNT</span> — a zombie, a secret number, and seven bullets of pure logarithm!',
        '今晚赛程! <span class="k">西侧: 冒泡竞速</span>——五位选手, 只许相邻互搏, 排不好序, 看台能把你嘘出主板! '+
        '<span class="k">东侧: 二分猎手</span>——一只僵尸, 一个秘密数字, 以及七发纯对数 (logarithm) 子弹!')},
      {sp:SP,t:B(
        'Win both, and the <span class="k">SELECT Tavern</span> beyond the east gate unbolts for the main event. The barkeep GRANT serves ONLY those who speak SQL. '+
        '<span class="dim">Last month a process asked him for "a beer, please". It is still being escorted off the premises.</span>',
        '两场全胜, 东门外的 <span class="k">SELECT 酒馆</span>就会为压轴战开门。酒保 GRANT 只招待说 SQL 的客人。'+
        '<span class="dim">上个月有个进程跟他说"请来杯啤酒"。到现在还在被请出去的路上。</span>'),choices:[
        {t:B('Point me at the fighters.','带我去见选手们。'),next:4},
        {t:B('Why is your microphone a heat sink?','你的麦克风为什么是个散热片?'),next:5}
      ]},
      {sp:SP,t:B(
        'THAT\'S THE SPIRIT! <span class="dim">(It gestures grandly at both ends of the arena at once, briefly dislocating an elbow.)</span> '+
        'And contestant — the crowd here boos honest mistakes and cheers honest logic. <span class="k">Play to the maths, not to the stands.</span>',
        '就是这股劲头! <span class="dim">(它同时朝竞技场两端做出宏大手势, 一度把手肘甩脱臼了。)</span> '+
        '还有, 挑战者——这里的观众会嘘诚实的失误, 也会为诚实的逻辑欢呼。<span class="k">打给数学看, 别打给看台看。</span>'),next:-1},
      {sp:SP,t:B(
        'Because, dear contestant, after twenty years of my commentary, <span class="k">it is the only object in the arena that never overheats</span>. '+
        '<span class="dim">(It taps the heat sink. It rings like a tiny gong.)</span> Now GO! Glory buffers for no one!',
        '问得好! 我这条嗓子解说了二十年, <span class="k">全场上下, 就剩它一个没被烧穿</span>。'+
        '<span class="dim">(它敲了敲散热片, 当的一声, 像面小锣。)</span> 去吧! 荣耀的缓冲区不等人!'),next:-1}
    ];
    nodes.onEnd=function(){SET(api,'algo_met_mc');};
    nodes.sig='intro';
    return nodes;
  }

  /* 支线: 玩家听完 Larry 的故事, 来找司仪要一份"无序数据"的差事 */
  if(FLAG(api,'algo_larry_met')&&!FLAG(api,'algo_contract')&&!FLAG(api,'algo_larry_end')){
    var side=[
      fixed,
      {sp:B('You','你'),t:B(
        '"It\'s about Larry. The old sequential searcher. He thinks the arena has no use for him since the binary rookie arrived."',
        '「是 Larry 的事。那位顺序查找 (linear search) 老将。自从二分新秀来了, 他觉得竞技场不再需要他了。」')},
      {sp:SP,t:B(
        '<span class="dim">(For once, the announcer voice drops. What is left sounds almost like a person.)</span><br>'+
        'Larry. Three hundred seasons. Never skipped a single element — not once. You know what the binary kid needs before it can even ENTER the pit? '+
        '<span class="k">Sorted data.</span> Everything in its neat little ascending row.',
        '<span class="dim">(播音腔第一次降了下来。剩下的声音, 几乎像个人。)</span><br>'+
        'Larry 啊。三百个赛季, 一个元素都没跳过——一次都没有。你知道那个二分小子上场之前需要什么吗? '+
        '<span class="k">有序数据 (sorted data)。</span>一切都得排得整整齐齐, 升序站好。')},
      {sp:SP,t:B(
        'Now walk backstage sometime. The <span class="k">lost-and-found</span> — twenty years of dropped packets, orphaned sockets, single gloves. '+
        '<span class="k">Nobody ever sorted it. Nobody ever WILL.</span> Binary search walks in there and just… stands still, weeping quietly.',
        '哪天你去后台看看。<span class="k">失物堆</span>——二十年攒下的掉包、孤儿 socket、单只手套。'+
        '<span class="k">从来没人排过序。将来也不会有。</span>二分查找走进去只能……原地站着, 小声哭。'),choices:[
        {t:B('So an unsorted pile needs a sequential searcher. Sign him.','所以无序的堆, 只有顺序查找啃得动。签他。'),next:4},
        {t:B('(Think it over first)','(再想想)'),next:-1}
      ]},
      {sp:SP,t:B(
        '<span class="dim">(It produces a contract from inside the bow tie and signs it with a flourish that sets two seat cushions on fire.)</span><br>'+
        '<span class="k">OFFICIAL POSTING — Chief Searcher, Backstage Lost-and-Found. Requirements: checks EVERY element. Guarantee: if it exists, HE FINDS IT.</span><br>'+
        'Take it to him. And tell him — <span class="dim">tell him the arena never retired him. It just filed him under the wrong index.</span>',
        '<span class="dim">(它从领结里抽出一份合同, 签名的花体甩得太用力, 点着了两个坐垫。)</span><br>'+
        '<span class="k">官方聘书——后台失物堆·首席查找官。任职要求: 逐个检查每一个元素。质量保证: 只要东西在, 他就一定找得到。</span><br>'+
        '拿去给他。再带一句话——<span class="dim">告诉他, 竞技场从没让他退役, 只是把他归错了索引 (index)。</span>'),next:-1}
    ];
    side.onEnd=function(){
      SET(api,'algo_contract');STEP(api,'algo_s2');
      GIVE(api,'linear_contract','Linear Search Contract');
    };
    side.sig='side_contract';
    return side;
  }

  var bd=FLAG(api,'algo_bubble_done'),bn=FLAG(api,'algo_bin_done'),sq=FLAG(api,'algo_sql_done');

  if(sq){
    var allCh=FLAG(api,'algo_challenge_1')&&FLAG(api,'algo_challenge_2')&&FLAG(api,'algo_challenge_3');
    var nodes2=[fixed,
      {sp:SP,t:B(
        'THE CHAMPION WALKS AMONG US! Sorting, searching, QUERYING — the triple crown! '+
        '<span class="dim">(It wipes a pixel from its eye.)</span> Twenty years I announced to empty stands. Tonight they chant a contestant\'s name, and it compiles.',
        '冠军就在我们中间! 排序、查找、查询——三冠加冕! '+
        '<span class="dim">(它抹掉眼角的一颗像素。)</span> 我对着空看台播了二十年。今晚他们喊的是一位挑战者的名字, 而且喊得能通过编译。')},
      {sp:SP,t:B(
        'One trade secret, champion, and I give it away free: <span class="k">bubble sort is a slow handshake, binary search is a guillotine, and SQL is just asking politely.</span> '+
        'Everything else in this syllabus is those three, wearing hats.',
        '送你一条免费的行业机密, 冠军: <span class="k">冒泡排序是一场慢握手, 二分查找是一把铡刀, SQL 则是把话问得体面。</span>'+
        '这份大纲里剩下的一切, 不过是这三样换了帽子。'),next:allCh?2:-1}];
    if(allCh)nodes2.push({sp:SP,t:B(
      '<span class="dim">(It floats down until its ribbon-cable bow tie is level with your eyes.)</span><br>'+
      'The Ocho. The thousand. The Syndicate orders. <span class="k">Three challenges, three clean sheets.</span> '+
      'When the historians of this machine write the arena\'s final commit message, <span class="k">your run goes in the header.</span>',
      '<span class="dim">(它降下来, 直到排线领结与你的视线齐平。)</span><br>'+
      '八人乱斗。千数狩猎。辛迪加大单。<span class="k">三项挑战, 三张零封。</span>'+
      '等这台机器的史官写下竞技场最后一条 commit message 时, <span class="k">第一行, 写的就是你这一轮。</span>'),next:-1});
    nodes2.sig=allCh?'champ_all':'champ';
    return nodes2;
  }
  if(bd&&bn){
    var nodesBoth=[fixed,
      {sp:SP,t:B(
        'TWO victories! The tavern beyond the east gate has unbolted — I heard the lock give up personally. '+
        '<span class="k">GRANT awaits.</span> Mind the house rules on the stone outside: <span class="dim">rule one concerns a boy named Bobby Tables.</span>',
        '两场全胜! 东门外的酒馆已经开闩——那把锁认输的声音我亲耳听见了。'+
        '<span class="k">GRANT 恭候。</span>进门前看看石碑上的店规: <span class="dim">第一条和一个叫 Bobby Tables 的男孩有关。</span>'),next:-1}];
    nodesBoth.sig='both_done';
    return nodesBoth;
  }
  if(bd||bn){
    var nodesOne=[fixed,
      {sp:SP,t:B(
        bd?'ONE down! The sorting pit still tells stories about you. Now the hunt, contestant — <span class="k">the zombie in the east pit</span> has been practising its victory dance. End its career.'
          :'ONE down! The zombie\'s cousin wants a rematch it will not get. Now the west pit, contestant — <span class="k">five fighters, adjacent swaps only</span>. The crowd is already warming up its boos.',
        bd?'拿下一场! 排序场至今还在传颂你的事迹。接下来是狩猎, 挑战者——<span class="k">东场那只僵尸</span>最近在偷偷练胜利之舞。终结它的职业生涯。'
          :'拿下一场! 僵尸的表哥想要复赛, 但它等不到了。接下来去西场, 挑战者——<span class="k">五位选手, 只许相邻交换</span>。观众已经在热身他们的嘘声了。'),next:-1}];
    nodesOne.sig=bd?'one_bubble':'one_bin';
    return nodesOne;
  }
  var nodesCard=[fixed,
    {sp:SP,t:B(
      'The card stands! <span class="k">Bubble Grand Prix, west pit. Binary Hunt, east pit.</span> Win both and the tavern opens. '+
      '<span class="dim">And if you meet an old fighter by the south wall… be kind. Legends bruise easier than rookies.</span>',
      '赛程照旧! <span class="k">西场冒泡竞速, 东场二分猎手。</span>两场全胜, 酒馆开门。'+
      '<span class="dim">对了, 要是在南墙边遇到一位老选手……客气点。传奇比新秀更经不起碰。</span>'),next:-1}];
  nodesCard.sig='card';
  return nodesCard;
}

/* Linear Larry —— 退役的顺序查找者。一辈子只会从头找到尾。 */
function larryDialog(api){
  var SP=B('Linear Larry','顺查老将 Larry');

  if(FLAG(api,'algo_larry_end')){
    var nodesEnd=[{sp:SP,t:B(
      '<span class="dim">(By the south wall, the old searcher is buffing a brass badge: CHIEF SEARCHER, LOST-AND-FOUND. A grateful socket hugs its ankle.)</span><br>'+
      'Found a widow\'s lost checksum this morning. Element by element, same as always. '+
      '<span class="k">Turns out the arena never retired me. It just filed me under the wrong index.</span> …Drop by if you ever lose anything, kid. If it exists, I find it.',
      '<span class="dim">(南墙边, 老查找者正在擦一枚黄铜徽章: 失物堆·首席查找官。一只被找回的 socket 感激地抱着他的脚踝。)</span><br>'+
      '今早帮一位遗孀找回了走失的校验和。逐个元素查, 和从前一样。'+
      '<span class="k">原来竞技场从没让我退役, 只是把我归错了索引。</span>……丢了东西就来找我, 孩子。只要它在, 我就找得到。'),next:-1}];
    nodesEnd.sig='larry_end';
    return nodesEnd;
  }

  if(FLAG(api,'algo_contract')){
    var nodes=[
      {sp:SP,t:B(
        '<span class="dim">(He sees the contract. He reads it three times, front to back — sequentially, of course.)</span><br>'+
        '"Requirements: checks EVERY element." …That\'s me. That\'s been the complaint my whole career, and this paper calls it a <span class="k">requirement</span>.',
        '<span class="dim">(他看见聘书, 从头到尾读了三遍——当然是顺序读的。)</span><br>'+
        '「任职要求: 逐个检查每一个元素。」……这是我。整个职业生涯别人都拿这个嫌我, 这张纸却管它叫<span class="k">任职要求</span>。')},
      {sp:SP,t:B(
        'Unsorted data. <span class="dim">(He says it slowly, like tasting it.)</span> The kid needs everything lined up ascending before it can throw a single punch. But a junk heap? A crash log? A crowd? '+
        '<span class="k">The world is mostly unsorted, kid. And in the unsorted world, I am undefeated.</span>',
        '无序数据。<span class="dim">(他慢慢念出这个词, 像在品它的味道。)</span> 那孩子出拳之前, 得让所有人升序列队。可垃圾堆呢? 崩溃日志呢? 人群呢? '+
        '<span class="k">这个世界大部分是无序的, 孩子。而在无序的世界里, 我从未输过。</span>'),choices:[
        {t:B('"The arena never retired you. It filed you under the wrong index." — MC stdout','「竞技场从没让你退役, 只是把你归错了索引。」——MC stdout 让我带的话'),next:2}
      ]},
      {sp:SP,t:B(
        '<span class="dim">(The old searcher stands very still. Somewhere in the stands, one spectator starts to clap. Then the row. Then the tier. Sequentially.)</span><br>'+
        '…Tell that loudmouth his index is corrected. <span class="k">Chief Searcher Larry reports for duty.</span> '+
        'First case: eight thousand unsorted regrets, and one glove.',
        '<span class="dim">(老查找者站得笔直, 一动不动。看台上, 一位观众开始鼓掌。然后是一排。然后是一层。按顺序地。)</span><br>'+
        '……告诉那个大嗓门, 他的索引修正了。<span class="k">首席查找官 Larry, 报到上岗。</span>'+
        '第一单业务: 八千件无序的遗憾, 和一只手套。'),next:-1}
    ];
    nodes.onEnd=function(){
      SET(api,'algo_larry_end');STEP(api,'algo_s3');S(api,'quest');
    };
    nodes.sig='contract';
    return nodes;
  }

  if(FLAG(api,'algo_larry_met')){
    var nodesWatch=[{sp:SP,t:B(
      '<span class="dim">(He is watching the binary pit from the shadow of the south wall, the way old boxers watch title fights.)</span><br>'+
      'Seven guesses. A hundred numbers. <span class="dim">In my day we called that witchcraft. Now they call it… logarithms.</span>',
      '<span class="dim">(他站在南墙的阴影里望着二分猎场, 像老拳手看新人的冠军战。)</span><br>'+
      '七次。一百个数。<span class="dim">我们那个年代管这叫巫术。现在他们管这叫……对数 (logarithm)。</span>'),next:-1}];
    nodesWatch.sig='larry_watching';
    return nodesWatch;
  }

  var first=[
    {sp:B('???','？？？'),t:B(
      '<span class="dim">(An old process sits by the south wall on an upturned crate, wearing a champion\'s belt so faded the engraving is almost gone. Almost: "…SEARCHER, 300 SEASONS".)</span><br>'+
      'Careful where you step, kid. That sand you\'re walking on — I searched every grain of it. Twice.',
      '<span class="dim">(南墙边, 一个老进程坐在倒扣的板条箱上, 腰间的冠军腰带褪色得几乎看不清刻字。只剩一点: "……查找者, 三百个赛季"。)</span><br>'+
      '脚下留神, 孩子。你踩的这片沙地——每一粒沙我都查过。两遍。')},
    {sp:SP,t:B(
      'Linear Larry. <span class="k">Sequential search.</span> Start at element one, check, step, check, step. No tricks, no shortcuts, <span class="k">no element left behind</span>. '+
      'Three hundred seasons, and if the thing existed, I FOUND it. Every. Single. Time.',
      '我叫 Larry。<span class="k">顺序查找 (linear search)。</span>从第一个元素开始, 看一眼, 挪一步, 再看一眼。不耍花招, 不抄近道, <span class="k">不落下任何一个元素</span>。'+
      '三百个赛季, 只要东西在, 我就找得到。每。一。次。')},
    {sp:SP,t:B(
      'Then the kid arrived. <span class="dim">(He nods at the east pit without looking at it.)</span> Binary search. Crowd of a hundred thousand, and it finds its man in <span class="k">seven questions</span>. '+
      'I was on element twenty-three of my warm-up when they cut my music.<br>'+
      '<span class="dim">Nobody boos a legend. They just… stop chanting O(n). It rhymes with nothing anyway.</span>',
      '然后那孩子来了。<span class="dim">(他朝东场点了点头, 眼睛却不看那边。)</span> 二分查找。十万人的场子, <span class="k">七个问题</span>就锁定目标。'+
      '我热身赛才查到第二十三个元素, 他们就把我的出场音乐掐了。<br>'+
      '<span class="dim">没有人嘘一个传奇。他们只是……不再喊 O(n) 了。看台安静下来的那种声音, 你听过吗?</span>'),choices:[
      {t:B('Seven guesses only works on SORTED data… wait. Let me talk to the MC.','七次机会只对有序数据管用……等等。我去找司仪谈谈。'),next:3},
      {t:B('(Leave him with his belt)','(让他和腰带独处一会儿)'),next:4}
    ]},
    {sp:SP,t:B(
      'Talk all you like, kid. <span class="dim">(He straightens the belt with two careful thumbs.)</span> '+
      'Just don\'t promise an old man anything the schedule can\'t keep.',
      '想谈就去谈吧, 孩子。<span class="dim">(他用两根拇指小心地扶正腰带。)</span> '+
      '只是别向一个老头子许下赛程兑现不了的承诺。'),next:-1},
    {sp:SP,t:B(
      '<span class="dim">(He goes back to watching the pit. From habit, his eyes sweep the stands: seat 1, seat 2, seat 3… he will finish all of them. He always finishes.)</span>',
      '<span class="dim">(他继续望着赛场。出于习惯, 他的目光从看台第 1 座扫到第 2 座、第 3 座……他会扫完全部。他从来都会扫完。)</span>'),next:-1}
  ];
  first.onEnd=function(){SET(api,'algo_larry_met');STEP(api,'algo_s1');};
  first.sig='larry_intro';
  return first;
}

/* ================================================================
   7. 室内地图 (26 × 18) —— 斗兽场: 外环看台回廊 + 内场沙地
   #=墙(1) .=地板(0)
   西场=冒泡竞速(7,8) 东场=二分猎手(18,8) 东回廊=SQL 酒馆(24,8)
   司仪(12,8) Larry(3,16) 石碑(5,1)(20,1)(24,10)
   ================================================================ */
var ROWS=[
  '##########################',  // 0
  '#........................#',  // 1   北回廊: Big-O 排名碑(5,1) 禁赛名单碑(20,1)
  '#.##########..##########.#',  // 2   内墙 + 北门
  '#.#....................#.#',  // 3
  '#.#....................#.#',  // 4
  '#.#...##..........##...#.#',  // 5   立柱
  '#.#....................#.#',  // 6
  '#.#....................#.#',  // 7
  '#.#....................#.#',  // 8   冒泡(7,8) 司仪(12,8) 二分(18,8) 酒馆(24,8)
  '#.#....................#.#',  // 9
  '#.#....................#.#',  // 10  店规碑(24,10)
  '#.#...##..........##...#.#',  // 11  立柱
  '#.#....................#.#',  // 12
  '#.#....................#.#',  // 13
  '#.#....................#.#',  // 14
  '#.##########..##########.#',  // 15  内墙 + 南门
  '#........................#',  // 16  南回廊: Larry(3,16) 出生点(12,16)
  '##########################'   // 17
];
var TILES=ROWS.map(function(r){return r.split('').map(function(c){return c==='#'?1:0;});});

/* 人浪巡检: 玩家首次踏进内场沙地 → 看台起立欢迎 (一次性) */
var ARENA={x0:3,y0:3,x1:22,y1:14};
var waveTimer=null;
function startWaveWatch(api){
  if(waveTimer)return;
  waveTimer=setInterval(function(){
    try{
      var p=api&&api.player;if(!p)return;
      if(p.x>=ARENA.x0&&p.x<=ARENA.x1&&p.y>=ARENA.y0&&p.y<=ARENA.y1){
        if(!FLAG(api,'algo_wave')){
          SET(api,'algo_wave');
          S(api,'open');
          TOAST(api,B('The moment your boot touches the sand, the stands RISE. Ten thousand idle processes doing the wave — in strict left-to-right order, naturally.',
                      '你的靴子刚碰到沙地, 看台齐刷刷起立。上万个空闲进程掀起人浪——当然, 是严格从左到右按顺序掀的。'),true);
          setTimeout(function(){
            TOAST(api,B('A vendor daemon works the rows: "HOT DOGS! HOT LOGS! O(n log n) DOGS, they never take all day!"',
                        '小贩 daemon 在座位间穿行叫卖: "热狗诶——热日志 (log) 诶——都是 O(n log n) 现出锅, 不耽误您看下半场!"'),true);
          },4200);
        }
      }
    }catch(e){}
  },700);
}

/* ================================================================
   8. 模块定义
   ================================================================ */
var MOD={
  id:'algo',
  title:B('The Algorithm Arena','算法竞技场'),
  world:'as',
  unlock:{afterQuest:'m3'},   // index.html 第一章末任务实际 id = m3

  interior:{w:26,h:18,tiles:TILES,playerStart:{x:12,y:16}},

  npcs:[
    {id:'algo_mc',name:B('MC stdout','司仪 MC stdout'),color:'#ffce3a',body:'#f5e0b0',suit:'#7a5a1a',
     x:12,y:8,dialog:mcDialog},
    {id:'algo_larry',name:B('Linear Larry','顺查老将 Larry'),color:'#9ab0c8',body:'#d8e2ec',suit:'#3a5a7a',
     x:3,y:16,dialog:larryDialog}
  ],

  steles:[
    {x:5,y:1,kind:'stele',text:B(
      '<span class="dim"><i>The arena ranks its fighters by one strange stat — not who is strongest, but who holds up as the crowd grows.</i></span><br>'+
      '[BIG-O ARENA RANKINGS · SEASON 4,096]<br>'+
      '<span class="k">O(1)</span> — "The Myth". Answers before you finish the question. Signs autographs in constant time.<br>'+
      '<span class="k">O(log n)</span> — "The Guillotine". Halves the field per move. Currently headlining the east pit.<br>'+
      '<span class="k">O(n)</span> — "The Honest One". Shakes every hand in the building. Beloved. Exhausted.<br>'+
      '<span class="k">O(n log n)</span> — "The Professional". As fast as comparison sorting is ever allowed to be. Knows it. Insufferable.<br>'+
      '<span class="k">O(n&sup2;)</span> — "The Sparring Partner". Compares everyone with everyone. Great cardio. Terrible schedule.<br>'+
      '<span class="k">O(2&#8319;)</span> — "The Spectator". Technically on the roster. Match pending since the machine booted.',
      '<span class="dim"><i>这座竞技场给选手排名, 靠的是一个古怪指标——不比谁最强, 比"人一多, 谁还扛得住"。</i></span><br>'+
      '【Big-O 竞技场排名榜 · 第 4096 赛季】<br>'+
      '<span class="k">O(1)</span> —— "神话选手"。问题还没问完就给出答案, 签名也只要常数时间。<br>'+
      '<span class="k">O(log n)</span> —— "铡刀"。每一步把对手砍掉一半, 现任东场头牌。<br>'+
      '<span class="k">O(n)</span> —— "老实人"。和全场每个人都握一遍手。人人爱他, 他很累。<br>'+
      '<span class="k">O(n log n)</span> —— "职业选手"。比较排序理论允许的最快速度。他知道这一点, 所以很难相处。<br>'+
      '<span class="k">O(n&sup2;)</span> —— "陪练"。让所有人和所有人都比一遍。锻炼心肺, 拖垮赛程。<br>'+
      '<span class="k">O(2&#8319;)</span> —— "观众席选手"。名义上在册。比赛自开机排到现在, 仍未轮到。'),
     codex:['big-o']},
    {x:20,y:1,kind:'stele',text:B(
      '<span class="dim"><i>The sports page nobody frames: three sorters barred for life, and the awful, funny reasons why.</i></span><br>'+
      '[BANNED ATHLETES BOARD]<br>'+
      '<span class="k">BOGOSORT</span> — shuffles the fighters and prays. Banned for gambling. Expected sentence: O(n · n!). Appeal expected never.<br>'+
      '<span class="k">SLEEP SORT</span> — told every number to "wait your value in seconds, then walk out". Banned for time manipulation and for what happened to 86,400.<br>'+
      '<span class="k">STALIN SORT</span> — achieved O(n) by <i>deleting every fighter who was out of order</i>. Banned. Also wanted for questioning.<br><br>'+
      '<span class="dim">The commissioner reminds all athletes: the crowd forgives slow. The crowd does not forgive missing elements.</span>',
      '<span class="dim"><i>没人会把这版体育新闻裱起来: 三名排序选手终身禁赛, 以及那些又可怕又好笑的理由。</i></span><br>'+
      '【禁赛选手公示栏】<br>'+
      '<span class="k">BOGOSORT (猴子排序)</span> —— 把选手洗乱, 然后祈祷。因聚众赌博禁赛, 预计刑期 O(n · n!), 预计永不上诉。<br>'+
      '<span class="k">SLEEP SORT (睡眠排序)</span> —— 让每个数"等自己数值那么多秒再出场"。因操纵时间禁赛, 也因为 86400 的遭遇。<br>'+
      '<span class="k">STALIN SORT</span> —— 靠<i>删掉一切不服从顺序的选手</i>达成 O(n)。禁赛, 并被有关部门带走问话。<br><br>'+
      '<span class="dim">赛事总监提醒各位选手: 观众可以原谅慢, 不能原谅弄丢元素。</span>'),
     codex:['big-o']},
    {x:24,y:10,kind:'stele',text:B(
      '<span class="dim"><i>Four house rules for a bar that only speaks database. Rule two is a warning — and a small tragedy.</i></span><br>'+
      '[THE SELECT TAVERN · HOUSE RULES]<br>'+
      '1. Orders in <span class="k">SQL</span> only. The barkeep\'s natural-language module was lost in the \'03 injection.<br>'+
      '2. Anyone ordering <span class="k">\'; DROP TABLE patrons;--</span> will be escorted out by the trigger, like little Bobby Tables before you. We remember Bobby. The school does not — <i>that is the point of the story.</i><br>'+
      '3. <span class="k">SELECT *</span> is for people who genuinely want everything. Own that choice.<br>'+
      '4. The ledger never lies: <span class="dim">every row a patron, every column a promise.</span>',
      '<span class="dim"><i>一家只讲数据库的酒馆, 立了四条店规。第二条是一句警告——也是一桩小小的悲剧。</i></span><br>'+
      '【SELECT 酒馆 · 店规】<br>'+
      '1. 点单只收 <span class="k">SQL</span>。酒保的自然语言模块在 03 年那场注入攻击 (injection) 里丢了。<br>'+
      '2. 胆敢点 <span class="k">\'; DROP TABLE patrons;--</span> 的客人, 将由触发器 (trigger) 亲自请出, 就像当年的小 Bobby Tables。我们都记得 Bobby。他学校的花名册不记得——<i>这个故事讲的就是这件事。</i><br>'+
      '3. <span class="k">SELECT *</span> 留给真心想要一切的人。点了就别后悔。<br>'+
      '4. 桌账从不说谎: <span class="dim">每一行是一位客人, 每一列是一句承诺。</span>'),
     codex:['sql-injection','sql-select']}
  ],

  quests:[
    {id:'algo_main',line:'main',title:B('The Algorithm Arena: Triple Crown','算法竞技场: 三冠之路'),
     syllabus:'9.1 Algorithms (bubble sort · linear/binary search) + 8.3 SQL (SELECT/WHERE/AND/ORDER BY)',
     desc:B('An arena that judges nothing but logic. Sort five fighters with your bare comparisons, out-think a smug zombie in seven guesses, then order three rounds from a bartender who only speaks SQL.',
            '一座只裁决逻辑的竞技场。徒手比较排好五位选手, 七次机会猜穿一只嚣张僵尸, 最后向一位只听得懂 SQL 的酒保点满三轮酒。'),
     steps:[
       {id:'algo_a1',text:B('Win the Bubble Grand Prix (adjacent compare & swap, ascending)',
                            '赢下冒泡竞速 (只比相邻·换或不换·升序站好)')},
       {id:'algo_a2',text:B('Defeat the zombie in the Binary Hunt (1–100, seven guesses)',
                            '在二分猎手中击碎僵尸 (1–100, 七次机会)')},
       {id:'algo_a3',text:B('Serve all three orders at the SELECT Tavern (SELECT · WHERE · ORDER BY · AND)',
                            '在 SELECT 酒馆交付全部三份点单 (SELECT · WHERE · ORDER BY · AND)')}
     ]},
    {id:'algo_side',line:'side',title:B('The Undefeated of the Unsorted','无序世界的不败者'),
     syllabus:'9.1 Searching: linear vs binary — binary requires sorted data; linear search works on anything',
     desc:B('A 300-season sequential-search champion sits by the south wall, retired by a rookie who halves crowds. But binary search has one demand the world rarely meets: the data must be sorted.',
            '三百个赛季的顺序查找冠军坐在南墙边, 被一个会砍半的新秀送进了退役名单。可二分查找有一个世界很少满足的要求: 数据必须有序。'),
     steps:[
       {id:'algo_s1',text:B('Hear out Linear Larry by the south wall','听南墙边的顺查老将 Larry 说完他的三百个赛季')},
       {id:'algo_s2',text:B('Ask MC stdout about work only a sequential searcher can do','向司仪 MC stdout 讨一份只有顺序查找啃得动的差事')},
       {id:'algo_s3',text:B('Deliver the contract — and the message about the wrong index','把聘书带回去——连同那句"归错了索引"')}
     ]}
  ],

  puzzles:[
    {id:'algo_bubble',kind:'puzzleStation',x:7,y:8,title:B('The Bubble Grand Prix','冒泡竞速'),
     syllabus:'9.1 Sorting: bubble sort — adjacent comparison & swap',
     primer:{title:B('What is a comparison sort?','什么是"比较排序"?'),
       body:B(
         '<b>In one line:</b> a comparison sort puts items in order by repeatedly asking just one question — '+
         '<i>"which of these two is bigger?"</i> — and swapping them when the answer says so. Nothing cleverer than that.<br>'+
         '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:12px;line-height:1.3;">'+
         '[5][2][8]\n compare 5,2 &rarr; 5&gt;2 &rarr; SWAP\n[2][5][8]\n compare 5,8 &rarr; 5&lt;8 &rarr; KEEP</pre>'+
         '<b>Like:</b> lining classmates up by height — you only ever grab two people standing <b>next to each other</b>, swap them if they\'re the wrong way round, then check the next pair. Keep walking the line until one full walk needs zero swaps.<br>'+
         '<b>Why you need it here:</b> every VS button is one of those comparisons. Judge SWAP or KEEP enough times, left to right, and the five fighters end up sorted smallest → biggest. That method has a name: <b>bubble sort</b>.',
         '<b>一句话:</b> 比较排序 (comparison sort) 靠反复问同一个问题——<i>"这两个谁大?"</i>——然后按答案决定要不要交换, 东西就排好序了。就这么简单。<br>'+
         '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:12px;line-height:1.3;">'+
         '[5][2][8]\n 比较 5,2 &rarr; 5&gt;2 &rarr; 交换\n[2][5][8]\n 比较 5,8 &rarr; 5&lt;8 &rarr; 不换</pre>'+
         '<b>类比:</b> 给同学按身高站队——你每次只抓<b>相邻</b>两个人比, 顺序反了就换, 换完看下一对。这样从头走到尾, 走到一整趟都不用换为止。<br>'+
         '<b>这题用它干嘛:</b> 每按一次 VS 就是一次这样的比较。从左到右不断判"换/不换", 五位选手就会从小排到大。这套方法就叫<b>冒泡排序 (bubble sort)</b>。')},
     codex:['bubble-sort','big-o'],
     render:renderBubble,
     onKey:function(e,api){if(e.key==='?'&&hintFns.algo_bubble)hintFns.algo_bubble();}},
    {id:'algo_bin',kind:'puzzleStation',x:18,y:8,title:B('The Binary Hunt','二分猎手'),
     syllabus:'9.1 Searching: binary search — halving the interval, log2(n) guesses',
     primer:{title:B('What is binary search?','什么是二分查找?'),
       body:B(
         '<b>In one line:</b> IF a list is already sorted, you don\'t have to check every item one by one — guess the <b>middle</b>, and whichever half that guess rules out, throw it away completely.<br>'+
         '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:12px;line-height:1.3;">'+
         '[1 ................ 100]\n guess 50 &rarr; "higher!" &rarr; keep [51..100]\n guess 75 &rarr; "lower!"  &rarr; keep [51..74]\n guess 63 &rarr; ...</pre>'+
         '<b>Like:</b> guessing a number 1–100 where a friend only answers "higher" or "lower" — the smart move is always guessing the exact middle of what\'s left, because that throws away half the remaining numbers <b>no matter which way</b> they answer.<br>'+
         '<b>Why you need it here:</b> the zombie\'s number is hidden somewhere in a range. Guess the middle every time and each guess halves what\'s left — that halving trick is the entire secret of <b>binary search</b>.',
         '<b>一句话:</b> 如果一份名单<b>已经排好序</b>, 就不用一个一个查——猜<b>中间</b>那个数, 不管答案是"大了"还是"小了", 都能直接扔掉一半可能性。<br>'+
         '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:12px;line-height:1.3;">'+
         '[1 ................ 100]\n 猜 50 &rarr; "大了!" &rarr; 剩 [51..100]\n 猜 75 &rarr; "小了!" &rarr; 剩 [51..74]\n 猜 63 &rarr; ……</pre>'+
         '<b>类比:</b> 猜 1 到 100 之间的数, 朋友只回答"大了"或"小了"——最聪明的打法永远是猜剩余区间的<b>正中间</b>, 因为不管答案是什么, 都能刷掉一半的可能性。<br>'+
         '<b>这题用它干嘛:</b> 僵尸藏的数字就在一个区间里。每次都猜正中间, 区间就砍半——这个"砍半"就是<b>二分查找 (binary search)</b> 的全部秘密。')},
     codex:['binary-search','big-o'],
     render:renderBinary,
     onKey:function(e,api){if(e.key==='?'&&hintFns.algo_bin)hintFns.algo_bin();}},
    {id:'algo_sql',kind:'puzzleStation',x:24,y:8,title:B('BOSS · The SELECT Tavern','BOSS · SELECT 酒馆'),
     syllabus:'8.3 SQL: SELECT / * / WHERE (comparison, AND, OR) / ORDER BY / COUNT(*)',
     primer:{title:B('What is SQL SELECT?','什么是 SQL 的 SELECT?'),
       body:B(
         '<b>In one line:</b> a database table is just rows and columns, like a spreadsheet; SQL\'s SELECT statement tells the computer which columns and which rows you want to see.<br>'+
         '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:12px;line-height:1.3;">'+
         'patrons table:\n name  | drink | bounty\n ------+-------+-------\n Kira  | ale   | 120\n Moss  | water |  10\n\n'+
         'SELECT name FROM patrons WHERE bounty &gt; 50;\n &rarr; Kira</pre>'+
         '<b>Like:</b> telling a librarian "give me just the TITLE column, only for books where PAGES &gt; 300" — SELECT chooses <b>columns</b>, FROM says which table, WHERE filters which <b>rows</b> qualify.<br>'+
         '<b>Why you need it here:</b> the bartender only understands SQL orders. Every drink you "order" is really a SELECT…FROM…WHERE query against the tavern\'s table of patrons.',
         '<b>一句话:</b> 数据库的表 (table) 就是行 (row) 和列 (column) 拼成的表格, 跟 Excel 差不多; SQL 的 SELECT 语句就是告诉电脑"我要看哪些列、哪些行"。<br>'+
         '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:12px;line-height:1.3;">'+
         'patrons 表:\n name  | drink | bounty\n ------+-------+-------\n Kira  | ale   | 120\n Moss  | water |  10\n\n'+
         'SELECT name FROM patrons WHERE bounty &gt; 50;\n &rarr; Kira</pre>'+
         '<b>类比:</b> 跟图书管理员说"给我书名这一列, 但只要页数 &gt; 300 的书"——SELECT 选<b>列</b>, FROM 说是哪张表, WHERE 负责挑<b>行</b>。<br>'+
         '<b>这题用它干嘛:</b> 酒保只听得懂 SQL 点单。你点的每一杯酒, 本质上都是对酒馆"客人表"的一句 SELECT…FROM…WHERE 查询。')},
     codex:['sql-select','sql-where','sql-orderby','sql-injection'],
     render:renderTavern,
     onKey:function(e,api){if(e.key==='?'&&hintFns.algo_sql)hintFns.algo_sql();}}
  ],

  onEnter:function(api){
    startWaveWatch(api);
    if(!FLAG(api,'algo_entered')){
      SET(api,'algo_entered');
      S(api,'open');
      TOAST(api,B('Torchlight, sand, and the hum of ten thousand idle processes. somewhere above, an announcer daemon clears its throat into a heat sink.',
                  '火把、沙地, 以及上万个空闲进程的嗡鸣。看台高处, 一个司仪 daemon 对着散热片清了清嗓子。'),true);
    }
  },

  onQuestComplete:function(qid,api){
    if(qid==='algo_main'){
      S(api,'quest');
      TOAST(api,B('◈ The Algorithm Arena · COMPLETE ◈ Sorted, searched, SELECTed. The Query Medal glints — the crowd chants in O(1), all at once.',
                  '◈ 算法竞技场 · 完成 ◈ 排过序, 猎过数, SELECT 到底。查询者勋章闪闪发亮——看台的欢呼是 O(1) 的: 全体同时爆发。'),true);
    }else if(qid==='algo_side'){
      TOAST(api,B('◈ Side quest complete ◈ In the unsorted world, the old champion remains undefeated. Some jobs only patience can index.',
                  '◈ 支线完成 ◈ 在无序的世界里, 老冠军依然不败。有些工作, 只有耐心能建立索引。'),true);
    }
  },

  /* 纯逻辑判定导出 —— 供 node 单测(引擎请忽略) */
  _test:{
    BUBBLE_LINEUP:BUBBLE_LINEUP,BUBBLE2_LINEUP:BUBBLE2_LINEUP,
    BUBBLE_BEST:BUBBLE_BEST,BUBBLE2_BEST:BUBBLE2_BEST,BUBBLE2_LIMIT:BUBBLE2_LIMIT,
    bubbleInversions:bubbleInversions,bubbleSorted:bubbleSorted,
    bubbleNew:bubbleNew,bubbleDecide:bubbleDecide,bubbleBotStep:bubbleBotStep,
    BIN_MAX:BIN_MAX,BIN_GUESSES:BIN_GUESSES,BIN2_MAX:BIN2_MAX,BIN2_GUESSES:BIN2_GUESSES,
    binNew:binNew,binGuess:binGuess,binMidGuesses:binMidGuesses,
    SQL_TABLE:SQL_TABLE,sqlTokenize:sqlTokenize,sqlParse:sqlParse,sqlExec:sqlExec,
    sqlResultEq:sqlResultEq,SQL_ROUNDS:SQL_ROUNDS,SQL_CHAL:SQL_CHAL,
    sqlRoundCheck:sqlRoundCheck,SQL_ERR_LINES:SQL_ERR_LINES,
    ARENA:ARENA
  }
};

/* ================================================================
   10. Codex 知识库条目 (手册查阅用; 谜题/石碑用 codex:[id] 关联)
   ================================================================ */
window.GAME_CODEX=window.GAME_CODEX||[];
window.GAME_CODEX.push(
  {id:'bubble-sort',mod:'algo',syllabus:'9.1 Sorting algorithms — bubble sort',
   topic:B('Bubble sort','冒泡排序'),
   body:B('Repeatedly scan the list left→right, comparing each pair of NEIGHBOURS. If the left one is bigger, swap them. One full pass moves the largest unsorted value all the way to its final spot ("bubbles up"). Keep passing until one whole pass makes zero swaps — that means it is sorted. Worst case: roughly n&sup2;/2 comparisons for n items — slow, but the easiest sort to trace by hand.',
          '从左到右反复扫描, 每次只比较<b>相邻</b>两个数。左边比右边大就交换。走完一整趟, 最大的未排数就会被"冒泡"到最终位置。一趟趟走, 直到有一趟从头到尾都没交换过, 就说明排好了。最坏情况约 n&sup2;/2 次比较——不快, 但是最容易用手照着走一遍的排序法。'),
   example:B('[5,2,8,1] → compare 5,2: swap → [2,5,8,1] → compare 5,8: keep → compare 8,1: swap → [2,5,1,8]. End of pass 1 (8 has bubbled to the end). Pass 2 finishes the job: [1,2,5,8].',
             '[5,2,8,1] → 比较 5,2: 交换 → [2,5,8,1] → 比较 5,8: 不换 → 比较 8,1: 交换 → [2,5,1,8]。第一趟结束 (8 已冒泡到末尾)。第二趟收尾: [1,2,5,8]。')},
  {id:'binary-search',mod:'algo',syllabus:'9.1 Searching — binary search',
   topic:B('Binary search','二分查找'),
   body:B('Only works on data that is already SORTED. Look at the middle item. If it is your target, done. If your target is smaller, the whole upper half can be discarded — repeat on the lower half only (and vice-versa). Each guess throws away half of what remains, so a list of n items needs at most log&#8322;(n) guesses — e.g. 100 items → about 7 guesses, 1000 → about 10.',
          '只对<b>已排序</b>的数据有效。先看正中间的那个数。是目标就结束。目标更小, 就把上半区整个扔掉, 只在下半区继续找 (反之亦然)。每猜一次就扔掉一半剩余可能, 所以 n 个数最多只需要 log&#8322;(n) 次——比如 100 个数约 7 次, 1000 个约 10 次。'),
   example:B('Find 42 in [1..100]: guess 50 → "lower" → guess 25 → "higher" → guess 37 → "higher" → guess 43 → "lower" → guess 40 → "higher" → guess 41 → "higher" → guess 42 → hit. Seven guesses for a hundred numbers.',
             '在 [1..100] 里找 42: 猜 50 → "小了" → 猜 25 → "大了" → 猜 37 → "大了" → 猜 43 → "小了" → 猜 40 → "大了" → 猜 41 → "大了" → 猜 42 → 命中。一百个数, 七次搞定。')},
  {id:'sql-select',mod:'algo',syllabus:'8.3 SQL — SELECT',
   topic:B('SQL — SELECT','SQL —— SELECT'),
   body:B('SELECT is how you choose which COLUMNS of a table to see. "SELECT name, bounty FROM patrons" returns only those two columns, for every row. "SELECT * FROM patrons" means "every column" — the asterisk is a wildcard for "all of them".',
          'SELECT 用来选你想看表里的哪些<b>列</b>。"SELECT name, bounty FROM patrons" 只返回这两列, 每一行都给。"SELECT * FROM patrons" 里的 * 是通配符, 意思是"全部列都要"。'),
   example:B('Table patrons(name, drink, bounty): "SELECT name FROM patrons;" → just the name column, one value per row.',
             '表 patrons(name, drink, bounty): "SELECT name FROM patrons;" → 只返回 name 这一列, 每行一个值。')},
  {id:'sql-where',mod:'algo',syllabus:'8.3 SQL — WHERE',
   topic:B('SQL — WHERE','SQL —— WHERE'),
   body:B('WHERE filters which ROWS make it into the result — it comes after FROM and holds a condition, e.g. "WHERE bounty > 100". Only rows where the condition is true are returned. Combine conditions with AND (both must be true) or OR (either can be true).',
          'WHERE 用来筛选哪些<b>行</b>能进结果——写在 FROM 后面, 跟一个条件, 比如 "WHERE bounty > 100"。只有让条件成立的行才会被返回。多个条件可以用 AND (都要成立) 或 OR (有一个成立就行) 连起来。'),
   example:B('"SELECT name FROM patrons WHERE bounty > 100 AND drink = \'ale\';" → only patrons with bounty over 100 who ordered ale.',
             '"SELECT name FROM patrons WHERE bounty > 100 AND drink = \'ale\';" → 只返回赏金 > 100 且点了 ale 的客人。')},
  {id:'sql-orderby',mod:'algo',syllabus:'8.3 SQL — ORDER BY',
   topic:B('SQL — ORDER BY','SQL —— ORDER BY'),
   body:B('ORDER BY sorts the rows of your result by a column: ascending by default (small→big, A→Z), or DESC for descending. It runs last, after SELECT/FROM/WHERE have already picked the columns and rows.',
          'ORDER BY 按某一列给结果排序: 默认升序 (小到大 / A 到 Z), 加 DESC 就是降序。它是最后一步——SELECT/FROM/WHERE 已经选好列和行之后, 才轮到它排序。'),
   example:B('"SELECT name, bounty FROM patrons ORDER BY bounty DESC;" → same rows, but listed richest bounty first.',
             '"SELECT name, bounty FROM patrons ORDER BY bounty DESC;" → 同样的行, 但按赏金从高到低排列。')},
  {id:'big-o',mod:'algo',syllabus:'9.1 Algorithms — efficiency / Big-O notation',
   topic:B('Big-O notation','Big-O 记号 (时间复杂度)'),
   body:B('Big-O describes how an algorithm\'s workload grows as the input size (n) grows — a rough "how does this scale" label, not an exact stopwatch time. O(1): same effort no matter how big n is. O(log n): each step throws away a chunk (binary search). O(n): effort grows in a straight line with n (checking every item once). O(n&sup2;): effort grows with every PAIR of items (bubble sort\'s neighbour comparisons). Bigger O usually means slower once n gets large.',
          'Big-O 描述的是: 输入规模 (n) 变大时, 算法的工作量大致怎么涨——是个"涨得多快"的粗略标签, 不是秒表读数。O(1): 不管 n 多大, 工作量都一样。O(log n): 每一步都能甩掉一大块 (二分查找)。O(n): 工作量跟 n 成正比 (把每个元素看一遍)。O(n&sup2;): 工作量跟"每一对元素"有关 (冒泡排序的相邻比较)。一般来说, n 一大, Big-O 越大就越慢。'),
   example:B('100 fighters: O(n) linear search checks up to 100 of them; O(log n) binary search needs about 7 checks; O(n&sup2;) bubble sort makes up to ~5,000 comparisons in the worst case.',
             '100 个选手: O(n) 的顺序查找最多查 100 次; O(log n) 的二分查找约 7 次; O(n&sup2;) 的冒泡排序最坏情况约 5000 次比较。')},
  {id:'sql-injection',mod:'algo',syllabus:'8.3 SQL applied — data security angle (injection attacks)',
   topic:B('SQL injection (and "little Bobby Tables")','SQL 注入 (以及"小 Bobby Tables"的故事)'),
   body:B('SQL injection happens when a program builds a query by gluing raw user input straight into SQL text — so a "clever" input can smuggle in extra SQL commands. Famous example: a school stores a student\'s name as <code>Robert\'); DROP TABLE Students;--</code> — if the program just glues that into a query unescaped, the database actually deletes the whole Students table. Defence: never trust raw input inside a query; use parameterised queries or escape special characters.',
          'SQL 注入 (injection) 发生在: 程序把用户输入的原始文字直接拼进 SQL 语句里——于是一段"耍小聪明"的输入, 就能夹带私货, 混入额外的 SQL 命令。经典例子: 某学校把学生姓名存成 <code>Robert\'); DROP TABLE Students;--</code>——如果程序没做处理就直接拼接执行, 数据库真的会把整张 Students 表删掉。防御办法: 永远不要相信直接拼进查询里的原始输入; 改用参数化查询 (parameterised queries) 或转义特殊字符。'),
   example:B('The tavern\'s house rule bans ordering \'; DROP TABLE patrons;-- for exactly this reason: unescaped input + string concatenation = the database believing your "order" is actually two commands.',
             '酒馆店规禁止点 \'; DROP TABLE patrons;-- 就是这个原因: 没转义的输入 + 字符串拼接 = 数据库把你的"点单"当成了两条命令来执行。')}
);

window.GAME_MODULES=window.GAME_MODULES||[];
window.GAME_MODULES.push(MOD);
})();
