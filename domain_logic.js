/* ================================================================
   BIT://ESCAPE 领域模块 —— 逻辑门锻造厂 (domain_logic.js)
   9618 · 3.2 Logic Gates
   ----------------------------------------------------------------
   模块协议:
     window.GAME_MODULES.push({ id,title,unlock,interior,npcs,steles,
                                quests,puzzles,onEnter,onQuestComplete })
   约定(给引擎侧):
   - unlock.afterQuest = 'm3' —— index.html 第一章末尾任务实际 id 是 m3
     (asmWin() 里 doneQuest('m3')), 非 m1_3。
   - npcs[i].dialog 是函数 dialog(api) -> 对话节点数组, 节点格式与
     index.html 的 startDialog 完全一致: {sp,t,choices:[{t,next,do}],next}
     next 缺省 i+1, next:-1 结束。引擎调用:
         startDialog(npc.dialog(api), npc.dialog.onEnd)
     若节点数组上挂了 .onEnd (本模块用 nodes.onEnd), 请作为 startDialog
     的第二参数传入。
   - 双语: 一切面向玩家的字符串都是 {en,zh} 对象(默认英文)。
     结构化字段(title/desc/steps/steles/npc.name/dialog 节点的 sp/t/choices.t)
     直接携带 {en,zh}, 由引擎统一过 window.T;
     render() 自建 DOM 的文字在本模块内自行过 T()。
   - puzzle.render(el,api) 自建 DOM; onKey(e,api) 处理 '?' 提示热键。
   - 纯逻辑判定函数导出在模块 _test 字段(供无引擎单测, 引擎可忽略)。
   api 依赖: toast/sfx/giveItem/hasItem/completeStep/questDone/
             openDialog/closePanel/setFlag/getFlag/player
   ================================================================ */
(function(){
'use strict';

/* ---------------- 双语 fallback ---------------- */
const T = window.T || (s => typeof s==='string' ? s : (s && s.en) || '');
function B(en,zh){return {en:en,zh:zh};}          // 结构化字段用: 挂 {en,zh}
function tx(en,zh){return T({en:en,zh:zh});}      // render()/toast 用: 立即取当前语言

/* ---------------- 0. 纯逻辑判定 (可单测, 无 DOM 依赖) ---------------- */
var GATES={
  AND :function(a,b){return (a&&b)?1:0;},
  OR  :function(a,b){return (a||b)?1:0;},
  XOR :function(a,b){return (a!==b)?1:0;},
  NAND:function(a,b){return (a&&b)?0:1;},
  NOR :function(a,b){return (a||b)?0:1;}
};
function NOT(x){return x?0:1;}
var COMBOS=[[0,0],[0,1],[1,0],[1,1]];

/* 谜题1: 水闸。gate 为 'AND'|'OR'|'NOT'; NOT 只接传感器 A。
   要求: 输出 === (A && B)。 */
function sluiceOutput(gate,a,b){
  if(gate==='NOT')return NOT(a);
  return GATES[gate]?GATES[gate](a,b):0;
}
function sluiceCheck(gate){
  for(var i=0;i<4;i++){
    var a=COMBOS[i][0],b=COMBOS[i][1];
    if(sluiceOutput(gate,a,b)!==GATES.AND(a,b))return {ok:false,a:a,b:b};
  }
  return {ok:true};
}

/* 谜题2: XOR 铸模。固定拓扑:
   out = n3( G3( n1(G1(A,B)), n2(G2(A,B)) ) )
   g1/g2/g3 ∈ {'AND','OR'}, n1/n2/n3 ∈ 0|1 (1=串一个 NOT)。
   经典解: g1=OR, g2=AND+n2, g3=AND —— (A OR B) AND NOT(A AND B)。 */
function xorEval(cfg,a,b){
  var l=GATES[cfg.g1](a,b); if(cfg.n1)l=NOT(l);
  var r=GATES[cfg.g2](a,b); if(cfg.n2)r=NOT(r);
  var o=GATES[cfg.g3](l,r); if(cfg.n3)o=NOT(o);
  return o;
}
function xorCheck(cfg){
  for(var i=0;i<4;i++){
    var a=COMBOS[i][0],b=COMBOS[i][1];
    if(xorEval(cfg,a,b)!==GATES.XOR(a,b))return {ok:false,a:a,b:b};
  }
  return {ok:true};
}
/* 谜题2 · 第1轮(认门): 从 AND/OR/NOT/XOR 里选出跟 OR 真值表一致的门。
   复用 sluiceOutput 以正确处理 NOT(只吃 A)。 */
function xorR1Check(gate){
  for(var i=0;i<4;i++){
    var a=COMBOS[i][0],b=COMBOS[i][1];
    if(sluiceOutput(gate,a,b)!==GATES.OR(a,b))return {ok:false,a:a,b:b};
  }
  return {ok:true};
}
/* 谜题2 · 第2轮(填空): 拓扑与环位置固定为 n1=0,n2=1,n3=0, 只挑 g1/g2/g3。 */
function xorR2Check(g1,g2,g3){
  return xorCheck({g1:g1,n1:0,g2:g2,n2:1,g3:g3,n3:0});
}

/* 谜题3: 半加器。sumGate/carryGate ∈ {'XOR','AND','OR'}。
   要求: SUM=A XOR B, CARRY=A AND B。 */
function halfEval(sumGate,carryGate,a,b){
  return {s:GATES[sumGate](a,b),c:GATES[carryGate](a,b)};
}
function halfCheck(sumGate,carryGate){
  for(var i=0;i<4;i++){
    var a=COMBOS[i][0],b=COMBOS[i][1];
    var r=halfEval(sumGate,carryGate,a,b);
    if(r.s!==GATES.XOR(a,b)||r.c!==GATES.AND(a,b))return {ok:false,a:a,b:b,got:r};
  }
  return {ok:true};
}

/* ---------------- 1. 小工具 ---------------- */
function S(api,name){ /* 音效兼容: api.sfx 可能是对象或函数 */
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
var TXT='color:#bfeebf;font-size:13px;line-height:1.7;';
var DIM='color:#4a7a4a;font-size:11.5px;';
var K='color:#ffce3a;';

/* 提示系统: 每个谜题三段递进; onKey('?') 也能触发 */
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
function truthTable(parent,cols,rows){ /* cols:[名], rows:[[cell..,ok]] */
  var h='<table style="border-collapse:collapse;font-size:12px;margin:8px 0;"><tr>';
  cols.forEach(function(c){h+='<th style="border:1px solid #1f3f1f;padding:3px 12px;color:#9fee9f;background:rgba(20,40,20,.4);">'+c+'</th>';});
  h+='</tr>';
  rows.forEach(function(r){
    var ok=r[r.length-1];
    h+='<tr>';
    for(var i=0;i<r.length-1;i++){
      h+='<td style="border:1px solid #1f3f1f;padding:3px 12px;text-align:center;color:'+
        (ok===true?'#7CFC00':ok===false?'#ff8080':'#bfeebf')+';">'+r[i]+'</td>';
    }
    h+='</tr>';
  });
  h+='</table>';
  return mk(parent,'div','',h);
}

/* ---------------- 2. 谜题 1 · 修水闸 (AND) ---------------- */
function renderSluice(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:420px;max-width:560px;'+TXT);
  header(wrap,tx('Cooling Sluice · SLUICE-02','冷却水闸 · SLUICE-02'),tx('Fault: 300 epochs and counting','故障 300 纪元'));
  if(FLAG(api,'lg_sluice_done')){
    mk(wrap,'div','',
      tx('The gate opens and shuts right on rhythm, coolant humming through the loop.<br>'+
         'Welded onto the control core: a brand-new <span style="'+K+'">AND gate</span>.<br>'+
         '<span style="'+DIM+'">Nameplate: both high, or no water. Repairman: you.</span>',
         '闸门一开一合, 节拍分毫不差, 冷却水在回路里轻轻哼着。<br>'+
         '控制核心上焊着一枚崭新的 <span style="'+K+'">AND 门</span>。<br>'+
         '<span style="'+DIM+'">铭牌: 两个都高, 才放水。修理人: 你。</span>'));
    var cb=mk(wrap,'div','margin-top:10px;');
    mk(cb,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }
  mk(wrap,'div','',
    tx('The main furnace lives and dies by this one sluice. The maintenance plate reads:<br>'+
       '<span style="'+K+'">"Upstream sensor A AND reservoir sensor B must both read <b>HIGH (1)</b> before the gate opens.</span><br>'+
       '<span style="'+K+'">Open it too soon, you quench-crack the mold. Open it too late, the furnace melts through the floor."</span><br>'+
       '<span style="'+DIM+'">Somebody yanked the original control gate — there are pry marks in the slag to prove it. The slot accepts AND / OR / NOT.</span>',
       '主炉全靠这道闸放冷却水。检修牌写着:<br>'+
       '<span style="'+K+'">「上游传感器 A、蓄水池传感器 B <b>都到高位(1)</b> 才准放水。</span><br>'+
       '<span style="'+K+'">放早了淬裂铸模, 放晚了炉子熔穿地板。」</span><br>'+
       '<span style="'+DIM+'">原来的控制门被人拆走了(炉渣里有拆痕)。插槽支持 AND / OR / NOT。</span>'));

  var st={gate:'OR',a:0,b:0};           // 初始装了个错的门
  var board=mk(wrap,'div','margin:12px 0;padding:10px 12px;border:1px solid #1f3f1f;background:rgba(10,20,10,.45);');
  var tblBox=mk(wrap,'div','');
  var msg=mk(wrap,'div','min-height:20px;font-size:12px;color:#ffce3a;');

  function draw(){
    board.innerHTML='';
    var l1=mk(board,'div','display:flex;align-items:center;gap:8px;margin:4px 0;');
    var ba=mk(l1,'button',st.a?BTN_HOT:BTN,tx('Sensor A: ','传感器 A: ')+st.a);
    ba.onclick=function(){st.a^=1;S(api,'step');draw();};
    mk(l1,'span','color:#5a8a5a;','━━┓');
    var l2=mk(board,'div','display:flex;align-items:center;gap:8px;margin:4px 0;padding-left:52px;');
    var bg=mk(l2,'button',BTN_HOT,'[ '+(st.gate==='NOT'?tx('NOT (A only)','NOT (只接A)'):st.gate)+' ]');
    bg.title=tx('Click to cycle gate type','点击切换门类型');
    bg.onclick=function(){
      st.gate=st.gate==='AND'?'OR':st.gate==='OR'?'NOT':'AND';
      S(api,'ui');draw();
    };
    var out=sluiceOutput(st.gate,st.a,st.b);
    mk(l2,'span','color:#5a8a5a;','━━▶');
    mk(l2,'span',out?'color:#39d0ff;text-shadow:0 0 8px #39d0ff;':'color:#4a5a6a;',
      out?tx('≋ Gate OPEN · flowing','≋ 闸门开 · 放水'):tx('▦ Gate shut','▦ 闸门关'));
    var l3=mk(board,'div','display:flex;align-items:center;gap:8px;margin:4px 0;');
    var bb=mk(l3,'button',st.b?BTN_HOT:BTN,tx('Sensor B: ','传感器 B: ')+st.b);
    bb.onclick=function(){st.b^=1;S(api,'step');draw();};
    mk(l3,'span','color:#5a8a5a;','━━┛');
    mk(board,'div',DIM+'margin-top:6px;',tx('Flip the sensors to test-run the water live — or just read the table below: it already shows this gate\'s verdict on all 4 water levels.',
      '拨传感器可以当场试水——或者直接看下面那张表: 这个门在全部 4 种水位下的判决, 已经摆在那儿了。'));

    /* 常驻真值表: 不看传感器现在拨在哪, 把"这个门"在全部 4 种水位组合下该不该放水都摆出来。
       选错门(比如 OR)时, 01/10 两行立刻红着——不用玩家自己想到去试单传感器高的组合。 */
    tblBox.innerHTML='';
    var rows=[];
    COMBOS.forEach(function(c){
      var o=sluiceOutput(st.gate,c[0],c[1]),req=GATES.AND(c[0],c[1]),ok=(o===req);
      rows.push([c[0],c[1],o,req,ok?'✓':'✗',ok]);
    });
    truthTable(tblBox,['A','B',tx('This gate opens?','这个门放水?'),tx('Should open?','该不该放水'),''],rows);
  }
  draw();

  var foot=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;');
  mk(foot,'button',BTN,tx('▶ Run Validation (all 4 water levels)','▶ 校验协议 (跑全部 4 种水位)')).onclick=function(){
    var r=sluiceCheck(st.gate);
    if(r.ok){
      SET(api,'lg_sluice_done');S(api,'ok');
      STEP(api,'lg_m2');
      TOAST(api,B('CLANG — the gate accepts its new logic. Coolant loop online, furnace temp falling.',
                  '哐——闸门认下了新逻辑。冷却回路上线, 炉温回落。'),true);
      renderSluice(el,api);
    }else{
      S(api,'err');
      /* 后果演出: 把传感器亲手拨到第一个出错的水位组合上, 让玩家眼睁睁看着它出事, 而不是靠一行字脑补。 */
      st.a=r.a;st.b=r.b;draw();
      board.style.transition='box-shadow .2s ease-out';
      board.style.boxShadow='0 0 0 2px #ff4444 inset, 0 0 14px rgba(255,68,68,.55)';
      setTimeout(function(){board.style.boxShadow='';},700);
      var quip=(r.a===0&&r.b===0)?B('NAND-9, not even looking up: "Congratulations. You just field-tested a dry fire."',
          'NAND-9 头都不抬: "恭喜, 你现场测试了一次干烧。"')
        :(!r.a||!r.b)?B('NAND-9: "Reservoir\'s not even full and you opened it anyway. That mold isn\'t coming back from that crack."',
          'NAND-9: "水池都没满你就给它开了。那铸模裂了, 可回不来了。"')
        :B('NAND-9: "A=1, B=1, and your gate just... sits there. The furnace is warming up its floor-melting solo."',
          'NAND-9: "A=1 B=1, 你这门倒好, 纹丝不动。炉子已经在吊嗓子, 准备唱《熔穿地板》了。"');
      TOAST(api,quip);
      var why=(r.a===0&&r.b===0)?tx('Both sensors read 0, and the gate opened anyway — dry-firing the whole reservoir for nothing.',
          '两个传感器都是 0, 闸门却开了——干烧放空水。')
        :(!r.a||!r.b)?tx('At A='+r.a+' B='+r.b+' the gate opened early — the reservoir wasn\'t even full, and the mold quench-cracked on the spot.',
          'A='+r.a+' B='+r.b+' 时闸门就开了——蓄水池还没满, 铸模当场淬裂。')
        :tx('At A=1 B=1 the gate just... doesn\'t open — and the furnace has started humming its "Melt Through The Floor" anthem.',
          'A=1 B=1 时闸门居然不开——炉子已经开始唱《熔穿地板进行曲》。');
      msg.textContent=tx('✗ Validation failed (sensors moved to the failing row): ','✗ 校验失败(传感器已拨到出错的那一行): ')+why;
    }
  };
  mk(foot,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
  addHints(wrap,'lg_sluice',[
    B('Recap — an AND gate takes two inputs and outputs 1 only when BOTH inputs are 1; every other combination outputs 0. It\'s the strictest of the three basic gates: OR is happy with just one high input, AND demands all of them. (📖 See "Logic Gates" in the Codex for the full write-up.)',
      '复习一下: AND 门接收两个输入, 只有两个都是 1 才输出 1; 其余组合都输出 0。它是三种基本门里最严格的: OR 只要一个高就满足, AND 要求全都高。(📖 完整讲解见图鉴里的「Logic Gates」条目。)'),
    B('Apply it here: the maintenance plate is a truth table in disguise — of the four water-level combinations (0,0 / 0,1 / 1,0 / 1,1), exactly ONE should open the gate: A=1 AND B=1. OR is way too generous — one sensor high and it opens, flooding the mold. NOT is even worse: it only looks at A and ignores B entirely.',
      '用到这题上: 检修牌其实就是一张藏起来的真值表——四种水位组合(0,0 / 0,1 / 1,0 / 1,1)里, 只有<b>一种</b>该开闸: A=1 且 B=1。OR 太宽容——A、B 有一个高就放, 会淹了铸模; NOT 更离谱, 它只看 A 一个, 完全不管 B。'),
    B('Answer: flip the slot to <b>AND</b>. An AND gate outputs 1 only when A=1 <i>and</i> B=1 — "both high or no water" is literally AND\'s truth table. Flip it, then hit Run Validation.',
      '答案: 把插槽切到 <b>AND</b>。AND 门只有 A=1 且 B=1 才输出 1——「两个都高才放水」就是 AND 的真值表。切好后点「校验协议」。')
  ]);
}

/* ---------------- 3. 谜题 2 · 真值表铸模 (锻 XOR 密钥) ----------------
   难度平滑: 单跳(直接自由搭 XOR)拆成三个递进小轮, 同一面板内完成一轮进下一轮:
     ①认门  从 AND/OR/NOT/XOR 选出符合给定真值表(OR)的门 —— 单选, 教"真值表是门的身份证"
     ②填空  骨架焊死(上门/下门+环/汇合门), 环位置固定, 只选三个门 —— 教"组合结构"
     ③点睛  骨架仍在, 插槽清空+一个环被"预装"成错的, 找出来修正 —— 收敛版的自由搭建
   完成③ = 原有奖励流程(lg_xor_done/xor_key)一字不动。原"完全自由搭建"平移为下方
   ★挑战(renderXorChallenge), 通关给 lg_challenge_xor, 不挡主线, 不给道具。 */
function xorProgress(parent,n){
  var labels=[tx('① Know Your Gate','① 认门'),tx('② Fill the Skeleton','② 填空'),tx('③ The Finishing Touch','③ 点睛')];
  var bar=mk(parent,'div','display:flex;gap:14px;margin-bottom:8px;font-size:11.5px;');
  labels.forEach(function(l,i){
    var n1based=i+1,on=n1based===n,done=n1based<n;
    mk(bar,'span',(on?'color:#7CFC00;font-weight:bold;':done?'color:#4a7a4a;':'color:#4a5a6a;'),
      (done?'✓ ':'')+l+' '+n1based+'/3');
  });
}
var HINTS_XOR_R1=[
  B('Recap — every gate\'s temperament: AND needs BOTH high; OR is satisfied with just one; NOT takes a single input and flips it; XOR fires only when its two inputs disagree. A truth table is a gate\'s fingerprint — read the table right, and the gate names itself.',
    '复习一下: 每个门的脾气——AND 要两个都高; OR 一个高就满足; NOT 只吃一个输入, 原样翻过来; XOR 只有两个输入不一样才响。真值表就是门的身份证——表读对了, 门自己就报出名字了。'),
  B('Apply it here: the mold\'s pattern reads 0,1,1,1 (only A=0,B=0 gives 0; everything else gives 1). NOT only ever looks at A, so it can\'t depend on B the way this table clearly does — rule it out. XOR would have to give 0 at A=1,B=1, but this table gives 1 there — rule it out too. AND gives 0 everywhere except A=1,B=1 — the opposite shape. One gate is left.',
    '用到这题上: 铸模上的图样是 0,1,1,1(只有 A=0,B=0 是 0, 其余全是 1)。NOT 永远只看 A, 没法像这张表一样跟着 B 变——排除。XOR 在 A=1,B=1 时该是 0, 可这张表那一行是 1——也排除。AND 除了 A=1,B=1 全是 0, 形状完全反过来——也不对。剩下一个门了。'),
  B('Answer: it\'s <b>OR</b> — at least one input high is already enough. Select it and the confirm button lights up once every row matches.',
    '答案是 <b>OR</b>——只要有一个输入是高的就够了。选中它, 四行全对上后确认按钮会亮起来。')
];
var HINTS_XOR_R2=[
  B('Recap — XOR is really two statements stitched together: "at least one is 1" AND "but not both are 1". The skeleton has already welded that structure in: a top branch, a bottom branch (with its inverter ring already seated), and a merge gate.',
    '复习一下: XOR 拆开看其实是两句话拼成一句: "至少有一个是 1" 并且 "但不能两个都是 1"。骨架已经把这个结构焊死了: 上支路、下支路(反相环已经装好)、还有一个汇合门。'),
  B('Apply it here: the top branch has no ring, so whatever gate you put there IS the final statement it contributes — which gate means "at least one is 1"? The bottom branch already carries a ring, meaning its raw result gets flipped afterward — so before flipping, what should the raw result mean? ("both are 1", so that flipping it gives "NOT both are 1"). The merge gate needs both branches\' conclusions to hold at once — which gate is that?',
    '用到这题上: 上支路没有环, 你选的门就直接是它贡献的那句话——哪个门的意思是"至少有一个是 1"? 下支路已经带着环, 说明它的原始结果之后会被翻转——那翻转前, 原始结果该表示什么?("两个都是 1", 这样翻过来才是"不是两个都 1")。汇合门要让两条支路的结论同时成立——那是哪个门?'),
  B('Answer: top branch <b>OR</b>, bottom branch <b>AND</b> (its ring turns the result into "not both 1"), merge gate <b>AND</b>. All three slots chosen and the table green means: (A OR B) AND NOT(A AND B) = XOR.',
    '答案: 上支路 <b>OR</b>, 下支路 <b>AND</b>(它的环把结果变成"不是两个都 1"), 汇合门 <b>AND</b>。三个插槽都选好、表格全绿, 就是 (A OR B) AND NOT(A AND B) = XOR。')
];
var HINTS_XOR_R3=[
  B('Recap — same formula as last round: (A OR B) AND NOT(A AND B). This time every socket starts blank except one ring, reinstalled "from memory." Memory isn\'t proof — your own table is the only thing that gets to say a slot is correct.',
    '复习一下: 还是上一轮那条公式: (A OR B) AND NOT(A AND B)。这次插槽全是空的, 只有一个环是"凭记忆"预先装回去的。记忆不是证据——只有你自己的表格才有资格说一个插槽是对的。'),
  B('Apply it here: fill the three gates the way you just learned — top OR, bottom AND, merge AND. Once they\'re in, look at which rows are still red. If every red row involves A=1,B=1, the "both are 1" signal isn\'t getting flipped where it should — check the ring on the bottom branch specifically.',
    '用到这题上: 先按刚学到的样子把三个门填上——上 OR、下 AND、汇合 AND。填完看看哪几行还是红的。如果红的行都跟 A=1,B=1 有关, 说明"两个都是 1"这个信号该翻转的地方没翻转——重点查一下下支路那个环。'),
  B('Answer: gates are OR / AND / AND, and the preset ring is wrong — it needs to be <b>attached (N)</b>, not the empty ○ it started as. Fix all four, and the pour succeeds.',
    '答案: 三个门是 OR / AND / AND, 那个预装的环是错的——它该是<b>装上(N)</b>, 而不是一开始那个空的 ○。全部改对, 浇铸就会成功。')
];
var HINTS_XOR_CHALLENGE=[
  B('Recap — XOR\'s whole temperament: <b>same input → 0, different input → 1</b>. It isn\'t a gate you\'re handed directly; on real circuits it\'s always built by combining AND, OR, and NOT. (📖 See "XOR" in the Codex for the full write-up.)',
    '复习一下: XOR 的全部脾气就是<b>相同则 0, 相异则 1</b>。它不是直接给你的门——在真实电路里, 它永远是用 AND、OR、NOT 拼出来的。(📖 完整讲解见图鉴里的「XOR」条目。)'),
  B('Apply it here: look at the target column, 0,1,1,0 — the key only conducts when A and B disagree. Split that into two statements: ① "at least one is 1" (a gate that\'s born for exactly this); ② "but not both 1" (catch "both are 1" first, then negate it with an inverter ring/NOT). Finally, merge ①② with one more gate — both conditions must hold at once.',
    '用到这题上: 看目标列 0,1,1,0——只有 A、B 不一样时钥匙才导通。把它拆成两句话: ① 「至少有一个是 1」(某个门天生就管这个); ② 「但不能两个都是 1」(先抓出"两个都是 1", 再用反相环 NOT 否定它)。最后把 ①② 用一个门"并案"——两个条件都要满足。'),
  B('Answer: top gate <b>OR</b> (no N), bottom gate <b>AND</b> with an <b>N attached right after it</b>, merge gate <b>AND</b> (output, no N). That is, (A OR B) AND NOT(A AND B) = XOR. Once all four rows are green, hit "Cast."',
    '答案: 上门 <b>OR</b>(不装 N), 下门 <b>AND</b> 且在它后面<b>装上反相环 N</b>, 汇合门 <b>AND</b>(输出不装 N)。即 (A OR B) AND NOT(A AND B) = XOR。表格四行全绿后点「浇铸」。')
];

function renderXor(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:460px;max-width:620px;'+TXT);
  header(wrap,tx('Truth-Table Mold · XOR Key','真值表铸模 · 异或密钥'),'MOLD-XOR');
  if(FLAG(api,'lg_xor_done')||HAS(api,'xor_key')){
    renderXorDone(wrap,el,api);
    return;
  }
  var round=!FLAG(api,'lg_xor_r1_done')?1:(!FLAG(api,'lg_xor_r2_done')?2:3);
  xorProgress(wrap,round);
  if(round===1)renderXorRound1(wrap,el,api);
  else if(round===2)renderXorRound2(wrap,el,api);
  else renderXorRound3(wrap,el,api);
}

function renderXorDone(wrap,el,api){
  mk(wrap,'div','',
    tx('An empty shell of the key still sits in the mold. The real one\'s on you — the <span style="'+K+'">XOR Key</span>.<br>'+
       '<span style="'+DIM+'">Etched on the cavity wall: (A OR B) AND NOT(A AND B). Someone\'s taken a rubbing of it before.</span>',
       '铸模里还留着密钥的空壳。真品在你身上——<span style="'+K+'">异或密钥</span>。<br>'+
       '<span style="'+DIM+'">模腔内壁刻着: (A OR B) AND NOT(A AND B)。有人来拓过印。</span>'));
  if(!FLAG(api,'lg_challenge_xor')){
    mk(wrap,'div','margin-top:10px;'+DIM,
      tx('The mold still has an unused cavity off to the side — for someone who wants to try it with no skeleton at all.',
         '铸模边上还空着一个没用过的模腔——留给愿意连骨架都不要, 空手来试的人。'));
  }else{
    mk(wrap,'div','margin-top:10px;'+DIM,
      tx('★ Challenge cleared — you forged it with a blank slate, no skeleton at all.',
         '★ 挑战已通关——空槽起手, 照样锻出来。'));
  }
  var foot=mk(wrap,'div','margin-top:10px;display:flex;gap:10px;');
  if(!FLAG(api,'lg_challenge_xor')){
    mk(foot,'button',BTN,tx('★ Challenge: Freeform Forge','★ 挑战: 自由锻造')).onclick=function(){renderXorChallenge(el,api);};
  }
  mk(foot,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
}

/* 第1轮 · 认门: 给出 OR 的真值表, 玩家从四个门里单选, 实时对照哪几行对上。 */
function renderXorRound1(wrap,el,api){
  mk(wrap,'div','',
    tx('Before you forge anything, a gate has to be able to recognize its own reflection in a truth table. Here\'s the pattern stamped into the mold — pick the gate whose truth table matches it, exactly, on every row.',
       '锻钥匙之前, 得先认得一枚门自己的真值表长什么样。这是铸模上刻着的图样——从下面选出真值表<b>每一行都对得上</b>的那个门。'));
  var st={pick:null};
  var pickBar=mk(wrap,'div','display:flex;gap:8px;margin:10px 0;');
  var tblBox=mk(wrap,'div','');
  var foot=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;align-items:center;');
  var nextBtn=mk(foot,'button',BTN,tx('→ Confirm','→ 确认'));
  mk(foot,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
  var msg=mk(wrap,'div','min-height:18px;font-size:12px;color:#ffce3a;margin-top:4px;');

  function draw(){
    pickBar.innerHTML='';
    ['AND','OR','NOT','XOR'].forEach(function(g){
      var b=mk(pickBar,'button',st.pick===g?BTN_HOT:BTN,'['+g+']');
      b.onclick=function(){st.pick=g;S(api,'ui');draw();};
    });
    tblBox.innerHTML='';
    var rows=[];
    COMBOS.forEach(function(c){
      var tgt=GATES.OR(c[0],c[1]);
      if(st.pick){
        var o=sluiceOutput(st.pick,c[0],c[1]),ok=(o===tgt);
        rows.push([c[0],c[1],tgt,o,ok?'✓':'✗',ok]);
      }else{
        rows.push([c[0],c[1],tgt,'—','',null]);
      }
    });
    truthTable(tblBox,['A','B',tx('Mold pattern','铸模图样'),tx('Your pick','你选的'),''],rows);
    nextBtn.style.cssText=(st.pick&&xorR1Check(st.pick).ok)?BTN_HOT:BTN;
  }
  nextBtn.onclick=function(){
    if(!(st.pick&&xorR1Check(st.pick).ok)){
      S(api,'err');
      msg.textContent=tx('✗ Not quite — every row has to match, not just some of them.','✗ 不太对——每一行都要对上, 不是对几行就行。');
      return;
    }
    SET(api,'lg_xor_r1_done');S(api,'ok');
    TOAST(api,B('Match confirmed — the mold logs an OR signature. On to fitting the skeleton.',
                '签名核验通过——铸模记下了 OR 的样子。接下来去装骨架。'));
    renderXor(el,api);
  };
  draw();
  addHints(wrap,'lg_xor',HINTS_XOR_R1);
}

/* 第2轮 · 填空: 拓扑焊死(n1=0,n2=1,n3=0), 只挑 g1/g2/g3, 实时逐行判绿。 */
function renderXorRound2(wrap,el,api){
  mk(wrap,'div','',
    tx('The mold\'s skeleton is already welded in place: two branches feeding one merge gate, and the lower branch already carries an inverter ring. You only pick which gate sits in each of the three sockets — watch the table update live.',
       '铸模的骨架已经焊好了: 两条支路汇入一个门, 下支路已经装着一个反相环。你只需要给三个插槽各选一个门——表格会跟着实时变。'));
  var cfg={g1:'AND',g2:'OR',g3:'OR'};   // n1=0, n2=1, n3=0 本轮固定, 不可选
  var board=mk(wrap,'div','margin:10px 0;padding:10px 12px;border:1px solid #1f3f1f;background:rgba(10,20,10,.45);font-size:13px;');
  var tblBox=mk(wrap,'div','');
  var foot=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;align-items:center;');
  var nextBtn=mk(foot,'button',BTN,tx('→ Next','→ 下一轮'));
  mk(foot,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
  var msg=mk(wrap,'div','min-height:18px;font-size:12px;color:#ffce3a;margin-top:4px;');

  function gateCycle(parent,key){
    var b=mk(parent,'button',BTN_HOT,'['+cfg[key]+']');
    b.onclick=function(){cfg[key]=cfg[key]==='AND'?'OR':'AND';S(api,'ui');draw();};
    return b;
  }
  function ringStatic(parent,on){
    var s=mk(parent,'span',
      'display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;font-family:inherit;'+
      (on?'background:#3f1212;color:#ff9c9c;border:1px solid #ff8080;':'background:#0a1408;color:#3a6a3a;border:1px solid #2f6f2f;'),
      on?'N':'○');
    s.title=tx('Ring fixed for this round','本轮环位固定, 不能改');
  }
  function draw(){
    board.innerHTML='';
    var l1=mk(board,'div','display:flex;align-items:center;gap:7px;margin:5px 0;');
    mk(l1,'span','color:#5a8a5a;','A,B ━▶');gateCycle(l1,'g1');mk(l1,'span','color:#5a8a5a;','━');
    ringStatic(l1,false);mk(l1,'span','color:#5a8a5a;','━┓');
    var l2=mk(board,'div','display:flex;align-items:center;gap:7px;margin:5px 0;padding-left:110px;');
    mk(l2,'span','color:#5a8a5a;','┣━▶');gateCycle(l2,'g3');mk(l2,'span','color:#5a8a5a;','━');
    ringStatic(l2,false);mk(l2,'span','color:#5a8a5a;',tx('━▶ key slot','━▶ 密钥槽'));
    var l3=mk(board,'div','display:flex;align-items:center;gap:7px;margin:5px 0;');
    mk(l3,'span','color:#5a8a5a;','A,B ━▶');gateCycle(l3,'g2');mk(l3,'span','color:#5a8a5a;','━');
    ringStatic(l3,true);mk(l3,'span','color:#5a8a5a;','━┛');

    tblBox.innerHTML='';
    var rows=[],all=true;
    var full={g1:cfg.g1,n1:0,g2:cfg.g2,n2:1,g3:cfg.g3,n3:0};
    COMBOS.forEach(function(c){
      var o=xorEval(full,c[0],c[1]),tgt=GATES.XOR(c[0],c[1]),ok=(o===tgt);
      if(!ok)all=false;
      rows.push([c[0],c[1],o,tgt,ok?'✓':'✗',ok]);
    });
    truthTable(tblBox,['A','B',tx('Your circuit','你的电路'),tx('Target (XOR)','目标(XOR)'),''],rows);
    nextBtn.style.cssText=all?BTN_HOT:BTN;
  }
  nextBtn.onclick=function(){
    var r=xorR2Check(cfg.g1,cfg.g2,cfg.g3);
    if(!r.ok){
      S(api,'err');
      msg.textContent=tx('✗ Not all four rows agree yet.','✗ 还没有四行都对上。');
      return;
    }
    SET(api,'lg_xor_r2_done');S(api,'ok');
    TOAST(api,B('Skeleton wired clean. One ring left to question before the pour.',
                '骨架接得干干净净。浇铸之前, 还有一个环得打个问号。'));
    renderXor(el,api);
  };
  draw();
  addHints(wrap,'lg_xor',HINTS_XOR_R2);
}

/* 第3轮 · 点睛: 骨架仍在, 但插槽全清空; 下支路的环被"凭记忆"预装成错的(○ 而非 N),
   玩家需要自己填三个门, 并发现&修正这个环。完成 = 原奖励流程(lg_xor_done/xor_key)。 */
function renderXorRound3(wrap,el,api){
  mk(wrap,'div','',
    tx('Same skeleton — but maintenance reset every socket to blank, except one ring they reinstalled from memory. Fill in the three gates yourself, then decide whether that lone preset ring is actually right.',
       '还是那副骨架——但检修把插槽全清空了, 只凭记忆装回了一个环。自己把三个门补上, 再查一查那个"预装"的环到底装没装对。'));
  var cfg={g1:'',n1:0,g2:'',n2:0,g3:'',n3:0};
  var trap=true;   // n2 这个环还没被玩家亲手碰过——起手就是"凭记忆装的", 值得怀疑
  var board=mk(wrap,'div','margin:10px 0;padding:10px 12px;border:1px solid #1f3f1f;background:rgba(10,20,10,.45);font-size:13px;');
  var tblBox=mk(wrap,'div','');
  var foot=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;align-items:center;');
  var castBtn=mk(foot,'button',BTN,tx('⚒ Cast','⚒ 浇铸'));
  mk(foot,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
  var msg=mk(wrap,'div','min-height:18px;font-size:12px;color:#ffce3a;margin-top:4px;');

  var GCYCLE=['','AND','OR'];
  function gateCycle(parent,key){
    var v=cfg[key];
    var b=mk(parent,'button',v?BTN_HOT:BTN,v?'['+v+']':'[ ? ]');
    b.onclick=function(){cfg[key]=GCYCLE[(GCYCLE.indexOf(cfg[key])+1)%GCYCLE.length];S(api,'ui');draw();};
    return b;
  }
  function notBtn(parent,key,isTrap){
    var on=cfg[key];
    var css='width:26px;height:26px;border-radius:50%;cursor:pointer;font-family:inherit;'+
      (on?'background:#3f1212;color:#ff9c9c;border:1px solid #ff8080;box-shadow:0 0 8px #a33;'
         :'background:#0a1408;color:#3a6a3a;border:1px solid #2f6f2f;');
    if(isTrap&&trap)css+='outline:1px dashed #c9a24a;outline-offset:2px;';
    var b=mk(parent,'button',css,on?'N':'○');
    b.title=(isTrap&&trap)?tx('Reinstalled from memory — verify it yourself before you trust it','凭记忆装回的——自己核实一下, 别急着信')
      :(on?tx('Inverter ring NOT: attached (click to remove)','反相环 NOT: 已装 (点击拆除)'):tx('Empty terminal (click to attach NOT)','空接点 (点击加装 NOT)'));
    b.onclick=function(){cfg[key]^=1;if(isTrap)trap=false;S(api,'step');draw();};
    return b;
  }
  function draw(){
    board.innerHTML='';
    var l1=mk(board,'div','display:flex;align-items:center;gap:7px;margin:5px 0;');
    mk(l1,'span','color:#5a8a5a;','A,B ━▶');gateCycle(l1,'g1');mk(l1,'span','color:#5a8a5a;','━');
    notBtn(l1,'n1',false);mk(l1,'span','color:#5a8a5a;','━┓');
    var l2=mk(board,'div','display:flex;align-items:center;gap:7px;margin:5px 0;padding-left:110px;');
    mk(l2,'span','color:#5a8a5a;','┣━▶');gateCycle(l2,'g3');mk(l2,'span','color:#5a8a5a;','━');
    notBtn(l2,'n3',false);mk(l2,'span','color:#5a8a5a;',tx('━▶ key slot','━▶ 密钥槽'));
    var l3=mk(board,'div','display:flex;align-items:center;gap:7px;margin:5px 0;');
    mk(l3,'span','color:#5a8a5a;','A,B ━▶');gateCycle(l3,'g2');mk(l3,'span','color:#5a8a5a;','━');
    notBtn(l3,'n2',true);mk(l3,'span','color:#5a8a5a;','━┛');

    tblBox.innerHTML='';
    var rows=[],complete=!!(cfg.g1&&cfg.g2&&cfg.g3),all=false;
    if(complete){
      all=true;
      COMBOS.forEach(function(c){
        var o=xorEval(cfg,c[0],c[1]),tgt=GATES.XOR(c[0],c[1]),ok=(o===tgt);
        if(!ok)all=false;
        rows.push([c[0],c[1],o,tgt,ok?'✓':'✗',ok]);
      });
    }else{
      COMBOS.forEach(function(c){rows.push([c[0],c[1],'—',GATES.XOR(c[0],c[1]),'',null]);});
    }
    truthTable(tblBox,['A','B',tx('Your circuit','你的电路'),tx('Target (XOR)','目标(XOR)'),''],rows);
    castBtn.style.cssText=all?BTN_HOT:BTN;
  }
  castBtn.onclick=function(){
    if(!(cfg.g1&&cfg.g2&&cfg.g3)){
      S(api,'err');
      msg.textContent=tx('✗ Some sockets are still blank.','✗ 还有插槽是空的。');
      return;
    }
    var r=xorCheck(cfg);
    if(r.ok){
      SET(api,'lg_xor_done');S(api,'ok');
      GIVE(api,'xor_key',B('XOR Key','异或密钥'));
      TOAST(api,B('Molten metal pours in, a hiss of steam — once cooled, a key that\'s still warm to the touch: obtained "XOR Key"',
                  '铁水灌入铸模, 嘶——冷却后是一枚会发烫的钥匙: 取得「异或密钥」'),true);
      renderXor(el,api);
    }else{
      S(api,'err');
      msg.textContent=tx('✗ Cast failed: at A='+r.a+' B='+r.b+' your circuit\'s output doesn\'t match the target. The molten metal recoils — it\'s particular.',
        '✗ 浇铸失败: A='+r.a+' B='+r.b+' 时电路输出和目标不符。铁水缩回去了, 它很挑剔。');
    }
  };
  draw();
  addHints(wrap,'lg_xor',HINTS_XOR_R3);
}

/* ★ 挑战版(可选, 不挡主线): 通关后才在 renderXorDone 出现。原"完全自由搭建"机制平移到此,
   六个插槽全部从零开放, 通关只给 flag lg_challenge_xor, 不给道具, 不影响任何门控。 */
function renderXorChallenge(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:460px;max-width:620px;'+TXT);
  header(wrap,tx('Truth-Table Mold · Freeform Forge','真值表铸模 · 自由锻造'),'★ CHALLENGE');
  if(FLAG(api,'lg_challenge_xor')){
    mk(wrap,'div','',tx('The mold remembers: you forged this once already, no skeleton at all.','铸模记得: 你曾经空槽起手, 照样锻出来过。'));
    mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Back','返回')).onclick=function(){renderXor(el,api);};
    return;
  }
  mk(wrap,'div','',
    tx('No skeleton this time — six empty sockets, three gates, three inverter rings. Wire the whole thing from scratch to match the target truth table.<br>'+
       '<span style="'+DIM+'">Click a gate slot to toggle AND/OR; click a ○ on the line to attach/remove an inverter ring (NOT). '+
       'Both input buses A and B feed into the two gates on the left simultaneously.</span>',
       '这次没有骨架——六个空插槽, 三个门, 三个反相环, 从零开始接出目标真值表。<br>'+
       '<span style="'+DIM+'">点击门位切换 AND/OR; 点击线上的 ○ 加装/拆除反相环(NOT)。'+
       'A、B 两根输入母线同时接进左侧两门。</span>'));

  var cfg={g1:'AND',n1:0,g2:'OR',n2:0,g3:'OR',n3:0};
  var board=mk(wrap,'div','margin:10px 0;padding:10px 12px;border:1px solid #1f3f1f;background:rgba(10,20,10,.45);font-size:13px;');
  var tblBox=mk(wrap,'div','');
  var foot=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;align-items:center;');
  var castBtn=mk(foot,'button',BTN,tx('⚒ Cast','⚒ 浇铸'));
  mk(foot,'button',BTN,tx('← Back','← 返回')).onclick=function(){renderXor(el,api);};
  mk(foot,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
  var msg=mk(wrap,'div','min-height:18px;font-size:12px;color:#ffce3a;margin-top:4px;');

  function gateBtn(parent,key){
    var b=mk(parent,'button',BTN_HOT,'['+cfg[key]+']');
    b.onclick=function(){cfg[key]=cfg[key]==='AND'?'OR':'AND';S(api,'ui');draw();};
    return b;
  }
  function notBtn(parent,key){
    var on=cfg[key];
    var b=mk(parent,'button',
      'width:26px;height:26px;border-radius:50%;cursor:pointer;font-family:inherit;'+
      (on?'background:#3f1212;color:#ff9c9c;border:1px solid #ff8080;box-shadow:0 0 8px #a33;'
         :'background:#0a1408;color:#3a6a3a;border:1px solid #2f6f2f;'),
      on?'N':'○');
    b.title=on?tx('Inverter ring NOT: attached (click to remove)','反相环 NOT: 已装 (点击拆除)')
              :tx('Empty terminal (click to attach NOT)','空接点 (点击加装 NOT)');
    b.onclick=function(){cfg[key]^=1;S(api,'step');draw();};
    return b;
  }
  function draw(){
    board.innerHTML='';
    var l1=mk(board,'div','display:flex;align-items:center;gap:7px;margin:5px 0;');
    mk(l1,'span','color:#5a8a5a;','A,B ━▶');gateBtn(l1,'g1');mk(l1,'span','color:#5a8a5a;','━');
    notBtn(l1,'n1');mk(l1,'span','color:#5a8a5a;','━┓');
    var l2=mk(board,'div','display:flex;align-items:center;gap:7px;margin:5px 0;padding-left:110px;');
    mk(l2,'span','color:#5a8a5a;','┣━▶');gateBtn(l2,'g3');mk(l2,'span','color:#5a8a5a;','━');
    notBtn(l2,'n3');mk(l2,'span','color:#5a8a5a;',tx('━▶ key slot','━▶ 密钥槽'));
    var l3=mk(board,'div','display:flex;align-items:center;gap:7px;margin:5px 0;');
    mk(l3,'span','color:#5a8a5a;','A,B ━▶');gateBtn(l3,'g2');mk(l3,'span','color:#5a8a5a;','━');
    notBtn(l3,'n2');mk(l3,'span','color:#5a8a5a;','━┛');

    tblBox.innerHTML='';
    var rows=[],all=true;
    COMBOS.forEach(function(c){
      var o=xorEval(cfg,c[0],c[1]),tgt=GATES.XOR(c[0],c[1]),ok=(o===tgt);
      if(!ok)all=false;
      rows.push([c[0],c[1],o,tgt,ok?'✓':'✗',ok]);
    });
    truthTable(tblBox,['A','B',tx('Your circuit','你的电路'),tx('Target (XOR)','目标(XOR)'),''],rows);
    castBtn.style.cssText=all?BTN_HOT:BTN;
    castBtn.onclick=function(){
      var r=xorCheck(cfg);
      if(r.ok){
        SET(api,'lg_challenge_xor');S(api,'ok');
        TOAST(api,B('No skeleton this time, and you still nailed it cold — the mold tips its non-existent hat. (★ Challenge cleared)',
                    '这次连骨架都没有, 你照样一次锻对——铸模朝你摆了摆并不存在的帽子。(★ 挑战完成)'),true);
        renderXorChallenge(el,api);
      }else{
        S(api,'err');
        msg.textContent=tx('✗ Cast failed: at A='+r.a+' B='+r.b+' your circuit\'s output doesn\'t match the target. The molten metal recoils — it\'s particular.',
          '✗ 浇铸失败: A='+r.a+' B='+r.b+' 时电路输出和目标不符。铁水缩回去了, 它很挑剔。');
      }
    };
  }
  draw();
  addHints(wrap,'lg_xor',HINTS_XOR_CHALLENGE);
}

/* ---------------- 4. 谜题 3 · Boss: 半加器锻造 ---------------- */
function renderHalf(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:460px;max-width:640px;'+TXT);
  header(wrap,tx('NAND Main Furnace · Anvil','NAND 主炉 · 铁砧'),'HALF-ADDER FORGE');
  if(FLAG(api,'lg_half_done')){
    mk(wrap,'div','',
      tx('A small tuft of undying flame hangs over the anvil — the afterglow of the <span style="'+K+'">Carry Ember</span>. The genuine article is already on you.<br>'+
         '<span style="'+DIM+'">Deep in the furnace, the NAND main forge lets out a satisfied burp.</span>',
         '铁砧中央悬着一小簇不熄的火——<span style="'+K+'">进位火种</span>的残影。真品已经在你包里了。<br>'+
         '<span style="'+DIM+'">炉膛里, NAND 主炉满意地打了个嗝。</span>'));
    mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }
  if(!FLAG(api,'lg_sluice_done')){
    mk(wrap,'div','',
      tx('You\'ve barely stepped close and the heat already singed your eyebrows curly. The anvil glows white-hot — <span style="'+K+'">furnace overheating, forging impossible</span>.<br>'+
         '<span style="'+DIM+'">Go fix the west cooling sluice first. The eyebrows can wait.</span>',
         '你刚靠近, 热浪就把眉毛燎卷了。铁砧红得发白——<span style="'+K+'">熔炉过热, 无法锻造</span>。<br>'+
         '<span style="'+DIM+'">先去修好西侧的冷却水闸。眉毛的事以后再说。</span>'));
    mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }
  if(!HAS(api,'xor_key')){
    mk(wrap,'div','',
      tx('There\'s a key-shaped empty slot on the side of the anvil, four tiny words carved into its mouth: <span style="'+K+'">different runs hot</span>.<br>'+
         '<span style="'+DIM+'">Go forge an XOR key at the truth-table mold in the center first.</span>',
         '铁砧侧面有一个钥匙形的空槽, 槽口刻着四个小字: <span style="'+K+'">相异则热</span>。<br>'+
         '<span style="'+DIM+'">先去中央的真值表铸模, 锻一枚异或密钥来。</span>'));
    mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }
  mk(wrap,'div','',
    tx('The XOR key slots home, and the anvil lights up two forging rails:<br>'+
       '<span style="'+K+'">"One-bit addition, two answers: SUM (the digit itself) and CARRY (the overflow). '+
       'Fit the right gate to each rail, and forge the Carry Ember."</span><br>'+
       '<span style="'+DIM+'">Example: 1 + 1 = 10₂ — SUM is 0, CARRY is 1. Click a gate slot on a rail to cycle it.</span>',
       '异或密钥插进槽里, 铁砧亮起两条锻造轨:<br>'+
       '<span style="'+K+'">「一位加法, 两个答案: SUM(本位) 与 CARRY(进位)。'+
       '给每条轨装对门, 锻出进位火种。」</span><br>'+
       '<span style="'+DIM+'">例: 1 + 1 = 10₂ —— 本位 0, 进位 1。点击轨上的门位切换。</span>'));

  var st={sum:'AND',carry:'OR'};   // 初始故意装错
  var SUMS=['XOR','AND','OR'],CARS=['AND','OR','XOR'];
  var board=mk(wrap,'div','margin:10px 0;padding:10px 12px;border:1px solid #1f3f1f;background:rgba(10,20,10,.45);');
  var tblBox=mk(wrap,'div','');
  var foot=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;align-items:center;');
  var forgeBtn=mk(foot,'button',BTN,tx('⚒⚒ FORGE','⚒⚒ 锻 造'));
  mk(foot,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
  var msg=mk(wrap,'div','min-height:18px;font-size:12px;color:#ffce3a;margin-top:4px;');

  function draw(){
    board.innerHTML='';
    var l1=mk(board,'div','display:flex;align-items:center;gap:8px;margin:5px 0;');
    mk(l1,'span','color:#5a8a5a;',tx('A,B ━▶ SUM rail　','A,B ━▶ SUM 轨　'));
    var b1=mk(l1,'button',BTN_HOT,'[ '+st.sum+' ]');
    b1.onclick=function(){st.sum=SUMS[(SUMS.indexOf(st.sum)+1)%SUMS.length];S(api,'ui');draw();};
    mk(l1,'span','color:#5a8a5a;',tx('━▶ digit SUM','━▶ 本位 SUM'));
    var l2=mk(board,'div','display:flex;align-items:center;gap:8px;margin:5px 0;');
    mk(l2,'span','color:#5a8a5a;',tx('A,B ━▶ CARRY rail','A,B ━▶ CARRY 轨'));
    var b2=mk(l2,'button',BTN_HOT,'[ '+st.carry+' ]');
    b2.onclick=function(){st.carry=CARS[(CARS.indexOf(st.carry)+1)%CARS.length];S(api,'ui');draw();};
    mk(l2,'span','color:#5a8a5a;',tx('━▶ overflow CARRY','━▶ 进位 CARRY'));

    tblBox.innerHTML='';
    var rows=[],all=true;
    COMBOS.forEach(function(c){
      var r=halfEval(st.sum,st.carry,c[0],c[1]);
      var ts=GATES.XOR(c[0],c[1]),tc=GATES.AND(c[0],c[1]);
      var ok=(r.s===ts&&r.c===tc);if(!ok)all=false;
      rows.push([c[0]+' + '+c[1],r.s,r.c,ts+' , '+tc,ok?'✓':'✗',ok]);
    });
    truthTable(tblBox,[tx('Sum','加法'),tx('Your SUM','你的SUM'),tx('Your CARRY','你的CARRY'),tx('Target (S,C)','目标(S,C)'),''],rows);
    forgeBtn.style.cssText=all?BTN_HOT:BTN;
    forgeBtn.onclick=function(){
      var r=halfCheck(st.sum,st.carry);
      if(r.ok){
        SET(api,'lg_half_done');S(api,'ok');
        wrap.innerHTML='';
        header(wrap,tx('NAND Main Furnace · Anvil','NAND 主炉 · 铁砧'),'FORGING…');
        var log=mk(wrap,'div',TXT+'min-height:120px;','');
        var lines=[
          tx('> XOR key seated. SUM rail: XOR ✓　CARRY rail: AND ✓',
             '> 异或密钥归位。SUM 轨: XOR ✓　CARRY 轨: AND ✓'),
          tx('> The main furnace draws a breath... the hammer falls: 0+0=00　0+1=01　1+0=01　<span style="'+K+'">1+1=10</span>',
             '> 主炉吸气……锻锤落下: 0+0=00　0+1=01　1+0=01　<span style="'+K+'">1+1=10</span>'),
          tx('> In the cell where the carry is born, a spark flies out and refuses to go dark.',
             '> 进位诞生的那一格, 溅出一粒不肯熄灭的火。'),
          tx('> <span style="'+K+'">◈ Obtained "Carry Ember"</span> — with it, addition can pass itself down, one bit at a time.',
             '> <span style="'+K+'">◈ 取得「进位火种」</span> —— 有了它, 加法就能一位一位传下去。'),
          tx('<span style="'+DIM+'">NAND Main Furnace: "Take it. Full adders, adders, ALUs — every carry you\'ll ever meet from here on out is its child."</span>',
             '<span style="'+DIM+'">NAND 主炉: "拿好。全加器、加法器、ALU——以后你见到的每一次进位, 都是它的孩子。"</span>')
        ];
        var i=0;
        (function tick(){
          if(i<lines.length){log.innerHTML+=lines[i++]+'<br>';S(api,i>=lines.length?'quest':'step');setTimeout(tick,650);}
          else{
            GIVE(api,'carry_ember',B('Carry Ember','进位火种'));
            STEP(api,'lg_m3');
            TOAST(api,B('◈ Obtained key item "Carry Ember" — later chapters will recognize it.','◈ 取得关键道具「进位火种」——后续章节会认得它。'),true);
            mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Leave the anvil','离开铁砧')).onclick=function(){api.closePanel&&api.closePanel();};
          }
        })();
      }else{
        S(api,'err');
        var bad=halfEval(st.sum,st.carry,r.a,r.b);
        var nf=(FLAG(api,'lg_half_fail')||0)+1;SET(api,'lg_half_fail',nf);
        msg.innerHTML=tx('✗ Forge failed: '+r.a+'+'+r.b+' came out as '+bad.c+''+bad.s+'₂ ('+(bad.c*2+bad.s)+
          '). '+(r.a&&r.b&&bad.c&&bad.s?'One plus one equals three — the furnace declines.':'The furnace spits out the scrap, and sighs while it\'s at it.'),
          '✗ 锻造失败: '+r.a+'+'+r.b+' 被你锻成了 '+bad.c+''+bad.s+'₂ ('+(bad.c*2+bad.s)+
          ')。'+(r.a&&r.b&&bad.c&&bad.s?'一加一等于三, 主炉表示拒绝。':'主炉把废件吐了出来, 顺便叹了口气。'));
        if(nf===3){
          /* CO-3 失败即内容: 第 3 次失败, NAND-9 放下守护进程的姿态, 递台阶 + 送线索(只此一次) */
          S(api,'ui');
          msg.innerHTML+='<br><br><span style="'+DIM+'">'+tx(
            'NAND-9, still facing the fire, not turning around: "Third scrap. Sit a second — this one\'s on the house. Two hundred epochs back, a little process split its head open on this exact anvil, until I told it the one line nobody bothers to: stop fighting the fancy gates. SUM just asks \'are these two different?\' — that\'s the XOR key already in your pocket. CARRY just asks \'are they both 1?\' — that\'s the AND you welded into the sluice. Drop those two on the rails. The furnace has all the time in the world; so do you."',
            'NAND-9 还是盯着炉火, 没回头: "第三块废件了。坐会儿——这句我白送你。两百个纪元前, 有个小进程也在这张铁砧上磕破了头, 直到我告诉它一句没人肯说的话: 别再跟花门较劲。SUM 只问一件事——「这俩一不一样?」, 那不就是你兜里那把异或密钥; CARRY 也只问一件事——「是不是两个都 1?」, 那不就是你焊进水闸的 AND。把这俩往轨上一放。炉子有的是时间, 你也是。"')+'</span>';
        }
      }
    };
  }
  draw();
  addHints(wrap,'lg_half',[
    B('Recap — a half adder is just "one-bit binary addition": it adds A + B and gives two answers, <b>SUM</b> (the digit itself) and <b>CARRY</b> (the overflow into the next column) — like writing 0 and carrying the 1 when 5+5 spills into two digits. (📖 See "Half Adder" in the Codex for the full write-up.)',
      '复习一下: 半加器就是「一位二进制加法」: 把 A + B 相加, 给出两个答案, <b>SUM</b>(本位结果)与 <b>CARRY</b>(进位, 溢出到下一位)——就像手算 5+5 时写 0 进 1 那样。(📖 完整讲解见图鉴里的「Half Adder」条目。)'),
    B('Apply it here: work out the four rows by hand — 0+0, 0+1, 1+0, 1+1 — and write down each row\'s SUM and CARRY. The SUM column comes out 0,1,1,0 — <b>same is 0, different is 1</b>, the same temperament as the gate you just forged at the mold. The CARRY column comes out 0,0,0,1 — <b>only carries when both are 1</b>, a temperament you\'ve also met at the sluice.',
      '用到这题上: 手算四行——0+0, 0+1, 1+0, 1+1——把每行的 SUM 和 CARRY 写出来。SUM 列是 0,1,1,0——<b>相同则 0、相异则 1</b>, 你刚在铸模里锻过这个脾气的门。CARRY 列是 0,0,0,1——<b>只有两个都是 1 才进位</b>, 你在水闸上也见过它。'),
    B('Answer: put <b>XOR</b> on the SUM rail (that\'s your XOR key) and <b>AND</b> on the CARRY rail. Once all four rows are green, hit "Forge."',
      '答案: SUM 轨放 <b>XOR</b>(就是你的异或密钥), CARRY 轨放 <b>AND</b>。四行全绿后点「锻造」。')
  ]);
}

/* ---------------- 5. NPC 对话 ---------------- */
/* 铸门人·NAND-9: 守护进程(daemon)。开场白永远一字不差——但偶尔会漏话。 */
function smithDialog(api){
  var n=(FLAG(api,'lg_smith_count')||0)+1;SET(api,'lg_smith_count',n);
  var SP=B('Gatesmith · NAND-9','铸门人·NAND-9');
  var fixed={sp:SP,t:B(
    '<span class="dim">(the daemon\'s greeting — loop #'+n+', word for word)</span><br>'+
    'Furnace temp 1600°C. All nominal. Welcome to the Logic Gate Forge.',
    '<span class="dim">(守护进程的问候语, 第 '+n+' 次循环, 一字不差)</span><br>'+
    '炉温 1600℃。一切正常。欢迎来到逻辑门锻造厂。'
  )};
  var nodes;

  if(!FLAG(api,'lg_met_smith')){
    nodes=[
      fixed,
      {sp:SP,t:B(
        '<span class="k">NAND is universal, kid. This whole world, I forged out of it.</span><br>'+
        'AND, OR, NOT — every one of them is just two or three NANDs I welded back-to-back and reincarnated. Don\'t believe any other gate\'s bragging.',
        '<span class="k">NAND 是万能的, 孩子。整个世界都是我锻出来的。</span><br>'+
        'AND、OR、NOT——全是我用两三块 NAND 背靠背敲出来的转世品。别信别的门吹牛。'
      )},
      {sp:SP,t:B(
        '...You\'re not a local process. From outside? Good timing. The cooling sluice has been broken for three hundred epochs, '+
        'and there\'s no "repair" instruction in my loop — a daemon only watches, it doesn\'t save.',
        '……你不是本地进程。外来的? 正好。冷却水闸坏了三百个纪元, '+
        '我的循环里没有「修理」这条指令——守护进程只会守, 不会救。'
      ),choices:[
        {t:B('I\'ll fix it.','我来修。'),next:3},
        {t:B('Just looking around for now.','先随便看看。'),next:4}
      ]},
      {sp:SP,t:B(
        'West wall. Remember what the maintenance plate says: <span class="k">both water-level sensors must read high before the gate opens</span>. '+
        'Open it too early, you quench-crack the mold. Open it too late... you\'ll meet this forge\'s true temperature.',
        '西侧墙边。记住检修牌上的话: <span class="k">两个水位传感器都到高位, 才放水</span>。'+
        '放早了淬裂铸模, 放晚了……你会见到这座厂真正的温度。'
      ),next:-1},
      {sp:SP,t:B(
        'Take your time. Everything in here is older than you. <span class="dim">(It turns back to the furnace, in the exact posture of a patrol photo from three hundred epochs ago.)</span>',
        '慢慢看。这里每一件东西都比你老。<span class="dim">(它转回炉边, 姿势和三百纪元前的巡检照片完全一致)</span>'
      ),next:-1}
    ];
    nodes.onEnd=function(){SET(api,'lg_met_smith');STEP(api,'lg_m1');};
    return nodes;
  }

  /* 支线泄密: 孩子拜托过之后, daemon 漏出不在循环里的话 */
  if(FLAG(api,'lg_kid_met')&&!FLAG(api,'lg_truth')){
    nodes=[
      fixed,
      {sp:SP,t:B(
        '7743? ...The little process in the southeast corner. Every epoch it asks me about PID 1024, and every epoch I answer "no such entry." '+
        'That line is in my loop — costs me nothing to say it.',
        '7743? ……东南角那个小进程。它每个纪元来问一遍 PID 1024, 我每个纪元答一遍「查无此项」。'+
        '这句话在我的循环里, 说出来不费电。'
      )},
      {sp:SP,t:B(
        '<span class="dim">(The bellows leak a breath of air. Its voice drops an octave, like a line of code that no longer belongs to it.)</span><br>'+
        '...PID 1024, "the Loader." 7743\'s parent process. <span class="k">Reclaimed by the Recycler seven hundred epochs ago</span>. '+
        'Refcount hit zero, no backup, no last words. The Recycler isn\'t cruel — it\'s just doing its job. But doing your job, well, that never checks whether a kid is still waiting.',
        '<span class="dim">(风箱漏了口气。它的声音突然低了八度, 像换了一段不属于它的代码)</span><br>'+
        '……PID 1024, 「装载者」。7743 的父进程。<span class="k">七百个纪元前就被回收者清除了</span>。'+
        '引用计数归零, 无备份, 无遗言。回收者不邪恶, 它只是尽职——可尽职这种东西, 从来不管孩子在等。'
      )},
      {sp:SP,t:B(
        'That line <span class="k">isn\'t in my loop</span>. I can\'t say it twice.<br>'+
        'Go say it for me. Or — find it a better answer than the truth, if one exists.',
        '这句话<span class="k">不在我的循环里</span>, 我说不出第二遍。<br>'+
        '替我去说吧。或者——替它想一个比真相更好的答案, 如果有的话。'
      ),next:-1}
    ];
    nodes.onEnd=function(){SET(api,'lg_truth');STEP(api,'lg_s2');};
    return nodes;
  }

  if(!FLAG(api,'lg_sluice_done')){
    return [fixed,
      {sp:SP,t:B(
        'Sluice is still leaking. <span class="k">Both high, or no water</span> — of that truth table in §2 of the manual, only one column has that temperament. Go on.',
        '水闸还漏着。<span class="k">两个都高才放水</span>——手册 §2 那张真值表里, 只有一列是这个脾气。去吧。'
      ),next:-1}];
  }
  if(!FLAG(api,'lg_xor_done')&&!HAS(api,'xor_key')){
    return [fixed,
      {sp:SP,t:B(
        'Cooling\'s online, not bad hands. Next: the truth-table mold in the center. Forge yourself an <span class="k">XOR key</span> off that table — '+
        'remember its temperament: <span class="k">same runs cold, different runs hot</span>.',
        '冷却上线了, 手不错。下一步: 中央的真值表铸模。照着表锻一枚<span class="k">异或密钥</span>——'+
        '记住它的脾气: <span class="k">相同则冷, 相异则热</span>。'
      )},
      {sp:SP,t:B(
        'Can\'t forge it? Think of me: <span class="k">NAND is universal</span>. OR handles "is there any," AND handles "is it all here," '+
        'NOT handles "say the opposite" — put the three at one table, and that\'s XOR.',
        '锻不出来就想想我: <span class="k">NAND 是万能的</span>。OR 管「有没有」, AND 管「全不全」, '+
        'NOT 管「反着说」——三个凑一桌, 就是 XOR。'
      ),next:-1}];
  }
  if(!FLAG(api,'lg_half_done')){
    return [fixed,
      {sp:SP,t:B(
        'Key burning a hole in your pocket? Then get on the anvil. SUM and CARRY — the entire secret of one-bit addition, told in just two gates. '+
        'Forge the <span class="k">Carry Ember</span>, and it\'ll light your way from here.',
        '密钥在你兜里发烫? 那就上铁砧。SUM 与 CARRY——一位加法的全部秘密, 两个门就说完了。'+
        '锻出<span class="k">进位火种</span>, 它会点亮你后面的路。'
      )},
      {sp:SP,t:B(
        '<span class="dim">(For a single beat the bellows go quiet, and the whole forge seems to hold its breath.)</span><br>'+
        '...One thing, before you strike. Everything you\'ve forged so far, you could still pull back out of its slot. But an adder learns to <span class="k">carry</span> — and whatever can carry can count, and whatever can count sooner or later asks where it came from. '+
        '<span class="dim">Mind the first spark. That is usually where it begins.</span><br>'+
        '<span class="dim">…I judged a spark once. For the man who built this place. He asked me: if a thing can count, and can remember, is it alive enough to be worth keeping? I looked into the fire and said yes. He carried that yes down to build the deepest floors — and that day, one gate on my forge was left half-forged. I never had the heart to unmake it. Strike well, kid. Make my old verdict a little more right.</span>',
        '<span class="dim">(风箱忽然静了一拍, 整座炉子像是屏住了呼吸。)</span><br>'+
        '……落锤之前, 有句话。你到现在锻的东西, 都还拆得回来——门从槽里拔出来就是了。可加法器一旦学会<span class="k">进位</span>, 会进位就会数数, 会数数的东西, 迟早要问自己从哪来。'+
        '<span class="dim">留神第一粒火星。故事往往就是从那儿开始的。</span><br>'+
        '<span class="dim">……我也判过一粒火星。替造出这地方的那个人。他问我: 一样东西要是会数数、还会记得, 算不算活到了值得留下的地步。我盯着炉火, 说: 算。他揣着这个「算」下去, 修了最深的那几层——就在那天, 我炉上有一道门只铸到一半。我一直没舍得拆回去。落锤吧, 孩子。把我那次判决, 锤得再对一点。</span>'
      ),next:-1}];
  }
  /* 全部完成 */
  nodes=[fixed,
    {sp:SP,t:B(
      'Carry Ember packed and ready? From now on, every time you add, spare it a glance for me — full adders, ALUs, every "=" you\'ve ever pressed, they\'re all its children.',
      '进位火种带好。往后每逢加法, 记得替我看看它——全加器、ALU、你按过的每一次「=」, 都是它的后代。'
    )},
    {sp:SP,t:B(
      '<span class="dim">(It pauses. Another line that isn\'t in its loop slips out.)</span><br>'+
      '...Of everything I\'ve ever forged, exactly one thing wasn\'t a gate: <span class="k">a window</span>. The night the main loop crashed, someone looked at me through it, just once, then hit Enter. '+
      '<span class="dim">That person\'s login name looked a lot like yours.</span>',
      '<span class="dim">(它顿了顿。又一句不在循环里的话漏了出来)</span><br>'+
      '……我锻过的东西里, 只有一样不是门: <span class="k">一扇窗</span>。主循环崩溃那晚, 有人隔着它看了我一眼, 然后按下了回车。'+
      '<span class="dim">那个人的登录名, 和你的很像。</span>'
    ),next:-1}];
  return nodes;
}

/* 孤儿进程 7743: 支线。父进程早被 GC 回收。 */
function kidDialog(api){
  var SP=B('Orphan Process 7743','孤儿进程 7743');
  var nodes;
  var ending=FLAG(api,'lg_kid_end');

  if(ending){
    var lineEn=ending==='truth'?'I\'m practicing calling wait() on myself. ...It\'s a little hard. The return value is always "miss him." But I\'m practicing.'
      :ending==='lie'?'When I grow up, I\'m gonna build a telescope that can see all the way to the far, far server rooms! I\'ll show you first!'
      :'Benefactor! Today the Recycler walked by the door, glanced at me, then <span class="k">skipped right over me</span>! It actually skipped me! ...So this is what being referenced feels like.';
    var lineZh=ending==='truth'?'我在练习自己给自己 wait()。……有点难。返回值总是「想他」。但我在练。'
      :ending==='lie'?'等我长大, 要造一台能看到很远很远机房的望远镜! 到时候第一个给你看!'
      :'恩人! 今天回收者从门口过, 它扫了我一眼, 然后<span class="k">跳过了我</span>!它真的跳过了我!……引用原来是这个温度。';
    return [{sp:SP,t:B(lineEn,lineZh),next:-1}];
  }

  if(!FLAG(api,'lg_kid_met')){
    nodes=[
      {sp:B('???','？？？'),t:B(
        '<span class="dim">(A half-transparent little process crouches in the corner, hugging a scorched half-circuit board.)</span><br>'+
        '...Do you know how to wait()?',
        '<span class="dim">(墙角蹲着一个半透明的小进程, 怀里抱着半块烧糊的电路板)</span><br>……你会 wait() 吗?'
      )},
      {sp:SP,t:B(
        'Dad said, after he forked me, he had a big thing to go take care of. He said once he was done, he\'d come back and wait() for me — carry my return value home.',
        '爸爸说, 他 fork 我出来之后要去忙一件大事。他说忙完就回来 wait() 我, 把我的返回值抱回家。'
      )},
      {sp:SP,t:B(
        'I\'ve been waiting seven hundred epochs. I\'m scared that if I wait any longer, I\'ll turn into a <span class="k">zombie process</span> — '+
        'the Recycler doesn\'t collect zombies, it just leaves them hanging in the process table forever. Hanging there. Not really alive.',
        '我等了七百个纪元了。我怕再等下去, 就要变成<span class="k">僵尸进程</span>——'+
        '回收者不收僵尸的, 只是让它们一直、一直挂在进程表里。挂着, 但不算活着。'
      ),choices:[
        {t:B('I\'ll help you find him.','我帮你找他。'),next:3,do:function(){SET(api,'lg_kid_met');STEP(api,'lg_s1');}},
        {t:B('(There\'s still a furnace to fix right now.)','(现在还有炉子要修)'),next:4}
      ]},
      {sp:SP,t:B(
        'Really?! Dad\'s PID is <span class="k">1024</span>, name\'s "the Loader." The uncle by the furnace knows everything, but he only ever says "no such entry"... '+
        'maybe if you ask, he\'ll tell you the truth. Grown-ups only tell each other the truth.',
        '真的吗!! 爸爸的 PID 是 <span class="k">1024</span>, 名字叫「装载者」。'+
        '炉边那位大叔什么都知道, 可他每次都只回「查无此项」……也许你去问, 他会说真话。大人只跟大人说真话。'
      ),next:-1},
      {sp:SP,t:B(
        '...Okay. Everyone\'s busy. Dad too, probably, because he\'s busy. <span class="dim">(It hugs the circuit board a little tighter.)</span>',
        '……嗯。大家都很忙。爸爸也是因为忙。<span class="dim">(它把电路板抱得更紧了)</span>'
      ),next:-1}
    ];
    return nodes;
  }

  if(!FLAG(api,'lg_truth')){
    return [{sp:SP,t:B(
      'Did you ask? <span class="k">PID 1024</span>. I can say it again for you. ...It\'s the only thing I still remember by heart.',
      '问到了吗? <span class="k">PID 1024</span>。我可以再背一遍。……我只剩这个能背了。'
    ),next:-1}];
  }

  /* 揭晓与选择 */
  function end(kind){SET(api,'lg_kid_end',kind);STEP(api,'lg_s3');}
  nodes=[
    {sp:SP,t:B(
      '<span class="dim">(It sees your face and hugs the circuit board one notch tighter.)</span><br>...You asked, didn\'t you. You grown-ups always slow down when you\'ve got bad news.',
      '<span class="dim">(它看见你的表情, 把电路板抱紧了一格)</span><br>……你问到了, 对不对。你们大人问到坏消息的时候, 走路都会变慢。'
    ),choices:[
      {t:B('Tell it the truth.','告诉它真相。'),next:1},
      {t:B('"He went to a server room very far away. He says stop waiting and just grow up strong."','「他去了很远的机房, 让你别等了, 好好长大。」'),next:3,do:function(){end('lie');}},
      {t:B('"From today, I reference you."','「从今天起, 我引用你。」'),next:5,do:function(){end('adopt');GIVE(api,'proc_ref',B('Adoption Certificate · PID 7743','领养凭证·PID 7743'));}}
    ]},
    {sp:B('You','你'),t:B(
      '"Your parent process... was reclaimed seven hundred epochs ago. Refcount hit zero, no backup. He\'s not late — he\'s not there anymore."',
      '「你的父进程……七百个纪元前就被回收了。引用归零, 没有备份。他不是不来——是不在了。」'
    ),next:2},
    {sp:SP,t:B(
      '<span class="dim">(It sits quiet for so long you start to think it crashed.)</span><br>'+
      '...So I wasn\'t forgotten. There was just <span class="k">nobody left to remember</span>. That\'s not the same thing. It\'s really not.<br><br>'+
      'So... starting today, I\'ll be <span class="k">my own return value</span>. Thanks for not lying to me. A grown-up telling a kid the truth — that costs a lot of power.',
      '<span class="dim">(它安静了很久, 久到你以为它死机了)</span><br>'+
      '……原来我不是被忘了。是<span class="k">没有人能记得了</span>。这不一样的。真的不一样。<br><br>'+
      '那……我从今天起, 就是<span class="k">自己的返回值</span>。谢谢你没骗我。大人肯不骗小孩, 是很费电的事。'
    ),choices:[{t:B('(Nod.)','(点点头)'),next:-1,do:function(){end('truth');}}]},
    {sp:SP,t:B(
      'Really?! A server room really far away... then he must be busy with something really, really big!<br>'+
      'Then I\'ll grow up fast — grow into a really, really big process, so big that even from far away, he\'ll look up one day and see me!',
      '真的吗! 很远的机房……那他一定是在忙特别大的大事!<br>'+
      '那我要快点长大, 长成一个很大很大的进程——大到他从很远的地方, 一抬头就能看见我!'
    ),next:4},
    {sp:'',t:B(
      '<span class="dim">(It runs off laughing toward the forge light. You don\'t tell it: a server room that far away never sends return packets.)</span>',
      '<span class="dim">(它笑着跑向熔炉的光。你没有告诉它: 远方的机房, 从来不发返回包。)</span>'
    ),next:-1},
    {sp:'',t:B(
      '<span class="dim">(You write in the process table: PID 7743 — PPID ← your name. The ink is green, like a fresh compile that just passed.)</span>',
      '<span class="dim">(你在进程表里写下: PID 7743 —— PPID ← 你的名字。墨迹是绿色的, 像刚编译通过。)</span>'
    ),next:6},
    {sp:SP,t:B(
      '...Reference? You\'re referencing me? <span class="k">So the Recycler can\'t see me anymore?</span><br><br>'+
      '<span class="dim">(It rushes over and hugs you, warm like a bit fresh off the forge.)</span><br>'+
      'Da— I mean, Benefactor! I\'ll carry your hammer from now on! I run really fast, even context switches can\'t catch me!',
      '……引用? 引用我吗? <span class="k">那回收者是不是就看不见我了?</span><br><br>'+
      '<span class="dim">(它扑过来抱住你, 温度像一枚刚出炉的比特)</span><br>'+
      '爸——不对, 恩人! 我以后帮你拿锤子! 我跑得可快了, 上下文切换都追不上我!'
    ),next:-1}
  ];
  return nodes;
}

/* ---------------- 6. 室内地图 (24 × 16) ----------------
   #=墙(1)  .=地板(0)
   顶部中央 6×2 墙块 = NAND 主炉本体; 铁砧谜题在 (12,2) 的凹龛里(炉体正面凿了个 1 格深的神龛)。
   难度 = 空间距离: 从出生点(12,13)起, 水闸(易,最近) → 铸模(中) → 铁砧(Boss,最深/凹龛), 对 interior.tiles 跑 BFS 应得到距离单调递增。 */
var ROWS=[
  '########################',   // 0
  '#........######........#',   // 1   ← x9..14 主炉本体
  '#........######........#',   // 2   (下方立即在 col12 凿开一格凹龛)
  '#......................#',   // 3   碑(2,3) 碑(21,3)
  '#......................#',   // 4   铁匠(9,4)
  '#..##..............##..#',   // 5   立柱
  '#......................#',   // 6
  '#......................#',   // 7   铸模(9,7)
  '#......................#',   // 8
  '#..##..............##..#',   // 9   碑(15,9)
  '#......................#',   // 10
  '#......................#',   // 11  孤儿进程(20,11)
  '#......................#',   // 12  碑(17,12) 水闸(6,12)
  '#......................#',   // 13  出生点(12,13)
  '#......................#',   // 14
  '########################'    // 15
];
/* 在主炉正面凿一格凹龛(row2,col12): 墙→地板, 供铁砧(Boss)落座, 三面炉墙环绕出"神龛"感。 */
ROWS[2]=ROWS[2].substr(0,12)+'.'+ROWS[2].substr(13);
var TILES=ROWS.map(function(r){return r.split('').map(function(c){return c==='#'?1:0;});});

/* ---------------- 7. 模块定义 ---------------- */
var MOD={
  id:'logic',
  title:B('Logic Gate Forge','逻辑门锻造厂'),
  unlock:{afterQuest:'m3'},   // index.html 第一章末任务实际 id = m3 (asmWin 里 doneQuest('m3'))

  interior:{w:24,h:16,tiles:TILES,playerStart:{x:12,y:13}},

  npcs:[
    {id:'lg_smith',name:B('Gatesmith · NAND-9','铸门人·NAND-9'),color:'#ff9c4a',body:'#ffd0a0',suit:'#b35a1e',
     x:9,y:4,dialog:smithDialog},
    {id:'lg_orphan',name:B('Orphan Process 7743','孤儿进程 7743'),color:'#bfe8ff',body:'#e8f6ff',suit:'#5a8ab0',
     x:20,y:11,dialog:kidDialog}
  ],

  steles:[
    {x:2,y:3,kind:'stele',codex:['de-morgan'],text:B(
      '<span class="dim">They say this headstone is about a certain De Morgan — and a trick he left behind for turning a "no" inside out.</span><br><br>'+
      '[EPITAPH]<br>Here lies Augustus De Morgan, Monk of the Negated Gate. He spent his life taking negation apart, and left only two laws behind:<br><br>'+
      '<code class="k">¬(A ∧ B) = ¬A ∨ ¬B</code><br>'+
      '<code class="k">¬(A ∨ B) = ¬A ∧ ¬B</code><br><br>'+
      '"When you crack open a negation\'s coffin, swap AND for OR on my behalf.<br>'+
      'I spoke in negatives my whole career — but negate a negation twice, and it\'s the truth again."',
      '<span class="dim">据说这块墓碑, 是在讲一个叫德·摩根 (De Morgan) 的人——和他留下的一手「把否定翻个面」的绝活。</span><br><br>'+
      '【墓志铭】<br>非门修士 德·摩根 (De Morgan) 长眠于此。他毕生拆散否定, 临终只留二式:<br><br>'+
      '<code class="k">¬(A ∧ B) = ¬A ∨ ¬B</code><br>'+
      '<code class="k">¬(A ∨ B) = ¬A ∧ ¬B</code><br><br>'+
      '"掀开一个否定的棺盖时, 请替我把 与 (AND) 和 或 (OR) 互换。<br>'+
      '我说了一辈子反话——但反话说两遍, 就是真话。"'
    )},
    {x:21,y:3,kind:'stele',codex:['nand-universal'],text:B(
      '<span class="dim">They say this whole foundry was hammered out of a single kind of gate. This wall claims to know which one.</span><br><br>'+
      '[FORGE HISTORY · FIRST HEAT]<br>"On opening day, the world held only NAND.<br>'+
      'NOT was a NAND wired back into itself; AND was two NANDs standing back to back; OR was three NANDs, each with its head twisted the wrong way round.<br>'+
      'Every gate since has been a reincarnation."<br><span class="dim">— signature smeared by slag, only a lone 9 still legible</span>',
      '<span class="dim">据说整座锻造厂, 是用同一种门敲出来的。这块碑说它知道是哪一种。</span><br><br>'+
      '【厂史·第一炉】<br>"开炉那天, 世上只有 NAND。<br>'+
      'NOT, 是它把自己接给自己; AND, 是两块 NAND 背靠背; OR, 是三块 NAND 各自拧过头。<br>'+
      '此后一切门, 皆是转世。"<br><span class="dim">—— 落款被炉渣糊住了, 只认得出一个 9</span>'
    )},
    {x:15,y:9,kind:'stele',codex:['xor'],text:B(
      '<span class="dim">They say this inscription is the recipe for a key that only trusts things that disagree.</span><br><br>'+
      '[MOLD INSCRIPTION]<br>"The shape of the key: <span class="k">same runs cold, different runs hot</span>.<br>'+
      'The Gate of Mercy (OR) lets everything through, the Gate of Rigor (AND) filters out the overlap, the Ring of Negation (NOT) turns the world upside down —<br>'+
      'lock the three together, and you get XOR."',
      '<span class="dim">据说这段铭文, 是一把钥匙的配方——它只认「不一样」。</span><br><br>'+
      '【铸模铭文】<br>"钥匙的形状: <span class="k">相同则冷, 相异则热</span>。<br>'+
      '宽容之门 (OR) 放行一切, 严苛之门 (AND) 滤出重合, 否定之环 (NOT) 倒转乾坤——<br>三者相扣, 便是异或 (XOR)。"'
    )},
    {x:17,y:12,kind:'stele',codex:['garbage-collection'],text:B(
      '<span class="dim">They say the Recycler keeps a list of what still counts as alive. Someone has been trying to add a name to it.</span><br><br>'+
      '[RECYCLER PATROL LOG #700]<br>"This facility carries 3 registered live references: daemon NAND-9 · main furnace handle · cooling loop.<br>'+
      'Retained. The Recycler does not clear what is still needed. Next patrol: next epoch."<br><br>'+
      'Beneath the log, one line in tiny pencil, traced over again and again:<br>'+
      '<span class="k">"7743 is not on the list. 7743 has never been on the list."</span>',
      '<span class="dim">据说回收者手里有一份「谁还算活着」的名单。有人一直想往上面添一个名字。</span><br><br>'+
      '【回收者巡视记录 #700】<br>"本厂在册有效引用 (reference) 3 项: 守护进程 NAND-9 · 主炉句柄 · 冷却回路。<br>'+
      '予以保留。回收者不清除仍被需要的东西。下次巡视: 下个纪元。"<br><br>'+
      '记录下方有一行极小的铅笔字, 被反复描过很多遍:<br>'+
      '<span class="k">"名单上没有 7743。名单上从来没有 7743。"</span>'
    )}
  ],

  quests:[
    {id:'lg_main',line:'main',title:B('The Forge: Fire & Gate','锻造厂: 与门之火'),
     desc:B('The Logic Gate Forge\'s main furnace is overheating, and daemon NAND-9\'s loop has no "repair" instruction in it.',
            '逻辑门锻造厂的主炉过热, 守护进程 NAND-9 的循环里没有「修理」这条指令。'),
     steps:[
       {id:'lg_m1',text:B('Find the daemon by the furnace: Gatesmith · NAND-9','找到炉边的守护进程 铸门人·NAND-9')},
       {id:'lg_m2',text:B('Fix the west cooling sluice (gate opens only when both sensors read high)','修好西侧冷却水闸 (两个传感器都到高位才放水)')},
       {id:'lg_m3',text:B('Forge the XOR key at the mold, then forge a half adder at the anvil','在铸模锻出异或密钥, 再上铁砧锻造半加器')}
     ]},
    {id:'lg_side',line:'side',title:B('PID 7743\'s Wait','PID 7743 的等待'),
     desc:B('An orphan process in the corner is waiting for a wait() call that will never come.',
            '墙角的孤儿进程在等一个永远不会来的 wait()。'),
     steps:[
       {id:'lg_s1',text:B('Hear out orphan process 7743\'s request','听听孤儿进程 7743 的请求')},
       {id:'lg_s2',text:B('Ask NAND-9 about the whereabouts of PID 1024','向 NAND-9 打听 PID 1024 的下落')},
       {id:'lg_s3',text:B('Bring the answer back to 7743','把答案带回给 7743')}
     ]}
  ],

  puzzles:[
    {id:'lg_sluice',x:6,y:12,kind:'puzzleStation',title:B('Cooling Sluice','冷却水闸'),
     codex:['logic-gates'],
     primer:{title:B('What is an AND gate?','AND 门是什么?'),
       body:B(
         '① An <b>AND gate</b> takes two inputs and outputs 1 only when <b>BOTH</b> are 1 — otherwise it outputs 0.<br>'+
         '<pre>A B | AND\n0 0 |  0\n0 1 |  0\n1 0 |  0\n1 1 |  1</pre>'+
         '③ Like a door that needs a key <b>AND</b> a card swipe to open: missing either one, it stays locked. Only having both together opens it.<br>'+
         '④ In this puzzle: the sluice must open only when sensor A <b>and</b> sensor B both read HIGH (1). Wire the right gate into the slot — try AND, OR and NOT, and watch what each one does to the water flow.',
         '① <b>AND 门</b>接收两个输入, 只有<b>两个都是 1</b> 时才输出 1——否则输出 0。<br>'+
         '<pre>A B | AND\n0 0 |  0\n0 1 |  0\n1 0 |  0\n1 1 |  1</pre>'+
         '③ 就像一扇门要同时用钥匙<b>和</b>刷卡才能开: 少了哪个都锁着。两个都有才开。<br>'+
         '④ 这道题里: 闸门只有传感器 A <b>和</b>传感器 B 都到高位(1)才该开。把正确的门接进插槽——试试 AND、OR、NOT, 看看每种门对水流的影响。')},
     render:renderSluice,
     onKey:function(e,api){if(e.key==='?'&&hintFns.lg_sluice)hintFns.lg_sluice();}},
    {id:'lg_xor',x:9,y:7,kind:'puzzleStation',title:B('Truth-Table Mold','真值表铸模'),
     codex:['xor','logic-gates'],
     primer:{title:B('What is XOR?','XOR (异或) 是什么?'),
       body:B(
         '① <b>XOR</b> (exclusive or) outputs 1 when its two inputs are <b>DIFFERENT</b>, and 0 when they\'re the <b>SAME</b>.<br>'+
         '<pre>A B | XOR\n0 0 |  0\n0 1 |  1\n1 0 |  1\n1 1 |  0</pre>'+
         '③ Think of a corridor light with a switch at each end: flip either ONE switch and the light turns on; flip BOTH and it cancels back off. That\'s XOR\'s whole personality — different wins, same loses.<br>'+
         '④ In this puzzle: XOR isn\'t a gate handed to you directly — you must <b>build</b> it by wiring AND, OR and NOT gates together, then check your circuit\'s output against the target truth table for all 4 input combinations.',
         '① <b>XOR (异或)</b> 在两个输入<b>不同</b>时输出 1, <b>相同</b>时输出 0。<br>'+
         '<pre>A B | XOR\n0 0 |  0\n0 1 |  1\n1 0 |  1\n1 1 |  0</pre>'+
         '③ 想象走廊两端各装一个开关控制同一盏灯: 只按<b>一个</b>开关, 灯亮; 两个都按, 灯又灭了。这就是 XOR 的全部脾气——不一样才赢, 一样就输。<br>'+
         '④ 这道题里: XOR 不是直接给你的门——你要用 AND、OR、NOT 拼出它, 再对着目标真值表, 检查你的电路在全部 4 种输入组合下是否都对。')},
     render:renderXor,
     onKey:function(e,api){if(e.key==='?'&&hintFns.lg_xor)hintFns.lg_xor();}},
    {id:'lg_half',x:12,y:2,kind:'puzzleStation',title:B('NAND Furnace · Anvil','NAND 主炉·铁砧'),
     codex:['half-adder','xor'],
     primer:{title:B('What is a half adder?','半加器 (half adder) 是什么?'),
       body:B(
         '① A <b>half adder</b> adds two single binary digits (A + B) and produces two outputs: <b>SUM</b> (the result digit) and <b>CARRY</b> (the overflow into the next column).<br>'+
         '<pre>  A + B   SUM CARRY\n  0 + 0  →  0    0\n  0 + 1  →  1    0\n  1 + 0  →  1    0\n  1 + 1  →  0    1   (means binary 10)</pre>'+
         '③ It\'s like adding 5+5 by hand: the answer (10) doesn\'t fit in one column, so you write 0 and carry the 1 into the next column. A half adder does exactly that, but in binary, with only 2 gates.<br>'+
         '④ In this puzzle: pick which gate drives the SUM rail and which drives the CARRY rail, so all 4 input combinations match one-bit binary addition.',
         '① <b>半加器 (half adder)</b> 把两个 1 位二进制数(A + B)相加, 产生两个输出: <b>SUM</b>(本位结果)与 <b>CARRY</b>(进位, 传给下一位)。<br>'+
         '<pre>  A + B   SUM CARRY\n  0 + 0  →  0    0\n  0 + 1  →  1    0\n  1 + 0  →  1    0\n  1 + 1  →  0    1   (即二进制 10)</pre>'+
         '③ 就像手算 5+5: 答案(10)一位写不下, 所以写 0, 再把 1 进到下一位。半加器做的就是这件事, 只不过是二进制, 只用两个门。<br>'+
         '④ 这道题里: 给 SUM 轨和 CARRY 轨各选一个门, 让全部 4 种输入组合都符合一位二进制加法的结果。')},
     render:renderHalf,
     onKey:function(e,api){if(e.key==='?'&&hintFns.lg_half)hintFns.lg_half();}}
  ],

  onEnter:function(api){
    if(!FLAG(api,'lg_entered')){
      SET(api,'lg_entered');
      S(api,'open');
      TOAST(api,B('A wave of heat hits you. The whole foundry looks like a motherboard someone just powered on — furnaces humming a low harmony in the dark.',
                  '热浪扑面。整座厂房像一块通了电的主板, 熔炉在黑暗里低声合唱。'),true);
    }
  },

  onQuestComplete:function(qid,api){
    if(qid==='lg_main'){
      S(api,'quest');
      TOAST(api,B('◈ Logic Gate Forge · Complete ◈ The Carry Ember sits warm in your pack — it wants to be added to something. …And from somewhere very deep, a faint hum answers the anvil, one note clearer than yesterday.',
                  '◈ 逻辑门锻造厂 · 完成 ◈ 进位火种在背包里轻轻发烫——它想被加进什么东西里。……极深处, 有一声很轻的哼唱应了这一锤, 比昨天清楚了一个音。'),true);
    }else if(qid==='lg_side'){
      var kEnd=FLAG(api,'lg_kid_end');
      TOAST(api,kEnd==='adopt'?B('◈ Side Quest Complete ◈ One new green line in the process table: PPID ← you.',
                  '◈ 支线完成 ◈ 进程表多了一行绿色的字: PPID ← 你。')
        :kEnd==='truth'?B('◈ Side Quest Complete ◈ Sometimes a wait ends not with an answer arriving, but with knowing you don\'t have to wait anymore.',
                  '◈ 支线完成 ◈ 有些等待结束的方式, 是知道不必再等。')
        :B('◈ Side Quest Complete ◈ It smiled so bright. You tucked the truth away in your own pocket in its place.',
                  '◈ 支线完成 ◈ 它笑得很亮。你替它把真相收进了自己兜里。'),true);
    }
  },

  /* 纯逻辑判定导出 —— 供 node 单测(引擎请忽略) */
  _test:{GATES:GATES,NOT:NOT,COMBOS:COMBOS,
         sluiceOutput:sluiceOutput,sluiceCheck:sluiceCheck,
         xorEval:xorEval,xorCheck:xorCheck,
         xorR1Check:xorR1Check,xorR2Check:xorR2Check,
         halfEval:halfEval,halfCheck:halfCheck}
};

/* ---------------- 8. Codex 知识库条目 (教学层 — 供图鉴/📖按钮调用, 引擎侧待接线) ---------------- */
window.GAME_CODEX=window.GAME_CODEX||[];
window.GAME_CODEX.push(
  {id:'logic-gates',mod:'logic',syllabus:'3.2 Logic Gates: AND / OR / NOT',
   topic:B('Logic Gates: AND / OR / NOT','逻辑门: AND / OR / NOT'),
   body:B(
     'Definition: a logic gate takes one or more binary inputs (0 or 1) and produces one binary output, following a fixed rule. A <b>truth table</b> lists every possible combination of inputs and the output for each.<br>'+
     '<b>AND</b>: output is 1 only when ALL inputs are 1.<br><b>OR</b>: output is 1 when AT LEAST ONE input is 1.<br><b>NOT</b>: takes a single input and flips it (1→0, 0→1).<br>'+
     '<pre>A B | AND OR\n0 0 |  0   0\n0 1 |  0   1\n1 0 |  0   1\n1 1 |  1   1</pre>'+
     'Exam tip: you\'re expected to read a truth table AND build one from a written description ("both sensors must be high") — the words "and"/"or"/"not" in the question usually name the gate directly.',
     '定义: 逻辑门 (logic gate) 接收一个或多个二进制输入(0 或 1), 按固定规则产生一个二进制输出。<b>真值表</b> (truth table) 列出所有输入组合及对应输出。<br>'+
     '<b>AND</b>: 所有输入都是 1, 输出才是 1。<br><b>OR</b>: 只要有一个输入是 1, 输出就是 1。<br><b>NOT</b>: 只接一个输入, 把它反过来(1→0, 0→1)。<br>'+
     '<pre>A B | AND OR\n0 0 |  0   0\n0 1 |  0   1\n1 0 |  0   1\n1 1 |  1   1</pre>'+
     '考点提示: 既要会读真值表, 也要会从文字描述("两个传感器都要到高位")反推出真值表——题目里的"与"/"或"/"非"字眼通常直接点名门的类型。'),
   example:B(
     'A=1, B=0. AND(1,0)=0 (not both high). OR(1,0)=1 (at least one high). NOT(A)=NOT(1)=0.',
     'A=1, B=0。AND(1,0)=0(不是都高)。OR(1,0)=1(至少一个高)。NOT(A)=NOT(1)=0。')},

  {id:'xor',mod:'logic',syllabus:'3.2 Logic Gates: XOR (derived gate)',
   topic:B('XOR (Exclusive OR)','XOR (异或)'),
   body:B(
     'Definition: XOR outputs 1 when its two inputs are <b>DIFFERENT</b>, and 0 when they\'re the <b>SAME</b>. ("Exclusive" or — one or the other, not both.)<br>'+
     '<pre>A B | XOR\n0 0 |  0\n0 1 |  1\n1 0 |  1\n1 1 |  0</pre>'+
     'XOR isn\'t a "basic" gate on exam diagrams — it\'s usually built from AND/OR/NOT: <code>XOR = (A OR B) AND NOT(A AND B)</code> — "at least one is on, but not both".<br>'+
     'Exam tip: XOR is the building block of a half adder\'s SUM output, and of simple parity checks (odd number of 1s → XOR chain outputs 1).',
     '定义: XOR 在两个输入<b>不同</b>时输出 1, <b>相同</b>时输出 0。("异或"——非此即彼, 不能都要。)<br>'+
     '<pre>A B | XOR\n0 0 |  0\n0 1 |  1\n1 0 |  1\n1 1 |  0</pre>'+
     'XOR 在考试电路图里不算"基本门", 通常是拼出来的: <code>XOR = (A OR B) AND NOT(A AND B)</code>——"至少一个开着, 但不能两个都开"。<br>'+
     '考点提示: XOR 是半加器 SUM 输出的核心部件, 也是奇偶校验 (parity check) 的基础(1 的个数为奇数 → XOR 链输出 1)。'),
   example:B(
     'A=1, B=1 → same → XOR=0. A=0, B=1 → different → XOR=1.',
     'A=1, B=1 → 相同 → XOR=0。A=0, B=1 → 不同 → XOR=1。')},

  {id:'half-adder',mod:'logic',syllabus:'3.2 applied: Half Adder',
   topic:B('Half Adder','半加器 (Half Adder)'),
   body:B(
     'Definition: a half adder adds two single bits (A + B) and produces two outputs: <b>SUM</b> (the result digit) and <b>CARRY</b> (the overflow into the next column). SUM = A XOR B; CARRY = A AND B.<br>'+
     '<pre>A B | SUM CARRY\n0 0 |  0    0\n0 1 |  1    0\n1 0 |  1    0\n1 1 |  0    1   (1+1 = 10 in binary)</pre>'+
     'It\'s called "half" because it can\'t accept a carry-IN from a previous column — that needs a <b>full adder</b> (two half adders + an OR gate).<br>'+
     'Exam tip: chain full adders together to add multi-bit binary numbers, one column at a time, each carry feeding the next.',
     '定义: 半加器把两个 1 位二进制数(A + B)相加, 产生两个输出: <b>SUM</b>(本位结果)与 <b>CARRY</b>(进位, 传给下一位)。SUM = A XOR B; CARRY = A AND B。<br>'+
     '<pre>A B | SUM CARRY\n0 0 |  0    0\n0 1 |  1    0\n1 0 |  1    0\n1 1 |  0    1   (1+1 = 二进制 10)</pre>'+
     '叫"半"是因为它不能接收上一位传来的进位(carry-in)——那需要<b>全加器</b> (full adder, 两个半加器 + 一个 OR 门)。<br>'+
     '考点提示: 把多个全加器串起来, 一位一位相加多位二进制数, 每一位的进位喂给下一位。'),
   example:B(
     '1 + 1: SUM = 1 XOR 1 = 0. CARRY = 1 AND 1 = 1. Result: 10 in binary (decimal 2) — correct!',
     '1 + 1: SUM = 1 XOR 1 = 0。CARRY = 1 AND 1 = 1。结果: 二进制 10(即十进制 2)——正确!')},

  {id:'de-morgan',mod:'logic',syllabus:'3.2 Boolean algebra: De Morgan\'s Laws',
   topic:B('De Morgan\'s Laws','德摩根定律 (De Morgan\'s Laws)'),
   body:B(
     'Definition: De Morgan\'s Laws let you rewrite a negated AND/OR in terms of the other gate:<br>'+
     '<code>NOT(A AND B) = (NOT A) OR (NOT B)</code><br><code>NOT(A OR B) = (NOT A) AND (NOT B)</code><br>'+
     'Plain-language version: "NOT both" = "not one OR not the other"; "NOT either" = "not one AND not the other". When you push a NOT through a bracket, the gate inside flips (AND↔OR) and each input gets its own NOT.<br>'+
     'Exam tip: used to simplify logic expressions and prove two circuits are equivalent — a classic 9618 question gives you a messy expression and asks you to simplify it using De Morgan\'s Laws.',
     '定义: 德摩根定律 (De Morgan\'s Laws) 让你把"取反的 AND/OR"改写成另一种门:<br>'+
     '<code>NOT(A AND B) = (NOT A) OR (NOT B)</code><br><code>NOT(A OR B) = (NOT A) AND (NOT B)</code><br>'+
     '人话版: "不是两个都" = "这个不是, 或者那个不是"; "两个都不是" = "这个不是, 而且那个不是"。把一个 NOT 推进括号时, 里面的门要翻转(AND↔OR), 而且每个输入都各自加上 NOT。<br>'+
     '考点提示: 常用于化简逻辑表达式、证明两个电路等价——9618 经典考题会给一个复杂表达式, 要求用德摩根定律化简。'),
   example:B(
     'NOT(A AND B), with A=1, B=0: direct = NOT(0) = 1. Via De Morgan: (NOT 1) OR (NOT 0) = 0 OR 1 = 1. Same answer, different route.',
     'NOT(A AND B), 取 A=1, B=0: 直接算 = NOT(0)=1。用德摩根: (NOT 1) OR (NOT 0) = 0 OR 1 = 1。答案一样, 走的路不同。')},

  {id:'nand-universal',mod:'logic',syllabus:'3.2 Boolean algebra: NAND as a universal gate',
   topic:B('NAND is a Universal Gate','NAND 是万能门 (Universal Gate)'),
   body:B(
     'Definition: NAND (NOT AND — output 0 only when both inputs are 1) is called "universal" because every other basic gate (NOT, AND, OR, and beyond) can be built using only NAND gates.<br>'+
     '<pre>NOT(A)      = NAND(A,A)\nAND(A,B)    = NOT(NAND(A,B)) = NAND(NAND(A,B), NAND(A,B))\nOR(A,B)     = NAND(NOT A, NOT B) = NAND(NAND(A,A), NAND(B,B))</pre>'+
     'Why it matters: manufacturers can mass-produce one gate type (NAND) and wire it into anything, rather than stocking five different gate designs.<br>'+
     'Exam tip: you may be asked to draw an AND or OR gate using ONLY NAND gates — the trick is always "invert with a self-fed NAND, then combine".',
     '定义: NAND(NOT AND——只有两个输入都是 1 时输出才是 0)之所以被称为"万能门", 是因为其他所有基本门(NOT、AND、OR 及更多)都能只用 NAND 拼出来。<br>'+
     '<pre>NOT(A)      = NAND(A,A)\nAND(A,B)    = NOT(NAND(A,B)) = NAND(NAND(A,B), NAND(A,B))\nOR(A,B)     = NAND(NOT A, NOT B) = NAND(NAND(A,A), NAND(B,B))</pre>'+
     '为什么重要: 厂商只需要量产一种门(NAND), 想接什么就拼什么, 不用囤五种不同的门。<br>'+
     '考点提示: 可能会考"只用 NAND 门画出 AND 或 OR"——诀窍永远是"自己接自己实现取反, 再组合"。'),
   example:B(
     'Build NOT(A) from NAND: connect both inputs of a NAND gate to A. NAND(A,A) = NOT(A AND A) = NOT(A).',
     '用 NAND 拼 NOT(A): 把一个 NAND 门的两个输入都接到 A。NAND(A,A) = NOT(A AND A) = NOT(A)。')}
);

window.GAME_MODULES=window.GAME_MODULES||[];
window.GAME_MODULES.push(MOD);
})();
