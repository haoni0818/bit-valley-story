/* ================================================================
   BIT://ESCAPE 领域模块 —— 核心机房 The Core Vault (domain_asm.js)
   9618 AS · Topic 4.1/4.2 Processor fundamentals & Assembly language
   8 关汇编战役 (HRM × Zachtronics): 每关引入一个新指令/概念,
   关卡即课程表; 通关后 [指令数|周期] vs PAR, ≤PAR 得 ★最优解。
   ----------------------------------------------------------------
   模块协议 (与 domain_memory.js 一致):
     window.GAME_MODULES.push({ id,title,world,unlock,interior,npcs,
                                steles,quests,puzzles,onEnter,onQuestComplete })
   - unlock.afterQuest='m3' —— 与四领域同批解锁。
   - npcs[i].dialog 是函数 dialog(api) -> 节点数组 (可挂 .onEnd)。
   - 双语: 面向玩家的字符串都是 {en,zh}; render() 自建 DOM 过 T()。
   - 自带解释器: runProgram(code,{mem,inputs,maxSteps,ops}) 纯函数,
     复制并扩展 index.html 第一章解释器 (新增 LDI/LDX/LDR/MOV/CMI/IN;
     立即数支持 9618 的 #n / #Bnnnn / #&hh 三种写法, 0~255)。
     不依赖引擎的 stepCPU —— 引擎第一章终端保持只读。
   - 500 步死循环保护 (各关可放宽), 双语报错(带行号)。
   - 纯逻辑判定导出在 _test (node 单测用, 引擎忽略)。
   - 标志: asm_lv_N(过关) asm_par_N(★最优解) asm_best_N(最少指令数)
           asm_src_N(编辑器存档) asm_fail_N(失败计数→提示自动升级)
   - ⚠ 引擎侧接线(不在本文件内): REALMS_AS 需一条入口
     {id:'vault',mod:'asm',art:'cpu',tx:..,ty:..,name:...} 才能从野外进门。
   ================================================================ */
(function(){
'use strict';

/* ---------------- 双语 fallback ---------------- */
var T=window.T||function(s){return typeof s==='string'?s:(s&&s.en!=null?s.en:'');};
function B(en,zh){return {en:en,zh:zh};}          // 结构化字段: 挂 {en,zh}
function tx(en,zh){return T({en:en,zh:zh});}      // render()/toast: 取当前语言

/* ================================================================
   0. 解释器 (纯函数, 无 DOM / 无引擎依赖, 可单测)
   指令集 = 9618 大纲子集:
   LDM #n · LDD a · LDI a · LDX a · LDR #n · MOV IX · STO a
   ADD a|#n · SUB a|#n · INC ACC|IX · DEC ACC|IX
   CMP a|#n · CMI a · JMP l · JPE l · JPN l · IN · OUT · END
   立即数: #n(十进制) #Bnnnnnnnn(二进制) #&hh(十六进制), 0~255
   内存: 32 格 (0~31)。FLAG: CMP/CMI 置 EQ(true)/NE(false)。
   ================================================================ */
var MEMSIZE=32;
var OPSPEC={ LDM:'imm', LDR:'imm', LDD:'addr', LDI:'addr', LDX:'addr',
  STO:'addr', CMI:'addr', ADD:'val', SUB:'val', CMP:'val',
  INC:'reg', DEC:'reg', MOV:'regix', JMP:'label', JPE:'label', JPN:'label',
  IN:'none', OUT:'none', END:'none' };

/* 双语报错。err={code,ln,en,zh}; window.T(err) 直接可显示 */
var ERRS={
  unknown_op:  [ 'unknown instruction "%s" — not in this CPU\'s instruction set',
                 '未知指令 "%s" —— 不在本 CPU 的指令集里' ],
  op_locked:   [ 'instruction "%s" is still dark — its core has not been repaired yet',
                 '指令 "%s" 的电路还没通电 —— 对应的核心尚未修复' ],
  bad_imm:     [ 'bad immediate "%s" — write #n, #Bnnnn (binary) or #&hh (hex)',
                 '立即数格式错误 "%s" —— 请写 #n、#Bnnnn(二进制) 或 #&hh(十六进制)' ],
  imm_range:   [ 'immediate %s out of range — this bus carries 0~255 (#&FF)',
                 '立即数 %s 超范围 —— 本机总线只送 0~255 (#&FF)' ],
  bad_addr:    [ 'address must be 0~31, got "%s"', '地址须为 0~31, 你给了 "%s"' ],
  bad_reg:     [ '"%s"? this instruction takes ACC or IX', '"%s"? 这条指令后面写 ACC 或 IX' ],
  bad_movreg:  [ 'MOV only moves ACC into IX — write MOV IX', 'MOV 只能把 ACC 搬进 IX —— 写 MOV IX' ],
  bad_label:   [ 'bad label "%s"', '标签格式错误 "%s"' ],
  dup_label:   [ 'label "%s" defined twice — one name, one place',
                 '标签 "%s" 定义了两次 —— 一个名字只能站一个位置' ],
  label_missing:['label "%s" not found — jumps need somewhere to land',
                 '找不到标签 "%s" —— 跳转得有落点' ],
  no_arg:      [ 'instruction %s needs an operand', '指令 %s 需要一个操作数' ],
  extra_arg:   [ 'no operand allowed here: "%s" — the extra word confused it',
                 '这里不带操作数: "%s" —— 多出来的词把它搞死机了' ],
  no_cmp:      [ 'no CMP yet — the FLAG is empty, the jump has nothing to decide on',
                 '还没 CMP 过 —— FLAG 是空的, 跳转无从决定' ],
  in_empty:    [ 'IN, but the input queue is empty — you asked the silence a question',
                 'IN 时输入队列已空 —— 你对着寂静提了一个问题' ],
  off_end:     [ 'ran off the end without END — the PC fell off the cliff',
                 '程序跑完了但没有 END —— PC 掉下了悬崖' ],
  indirect_range:['indirect address points at %s — outside memory 0~31 (a wild pointer!)',
                 '间接地址指到了 %s —— 内存 0~31 之外 (野指针!)' ],
  index_range: [ 'address+IX = %s — outside memory 0~31 (the bucket arm swung too far)',
                 '地址+IX = %s —— 超出内存 0~31 (斗臂甩过头了)' ],
  empty:       [ 'the program is empty. Even a heartbeat needs at least one line.',
                 '程序是空的。哪怕心跳, 也至少要一行。' ],
  not_three:   [ 'the patch has room for exactly 3 instructions — you wrote %s',
                 '补丁体内只剩 3 条指令的空间 —— 你写了 %s 条' ]
};
function E(code,ln,s){
  var m=ERRS[code]||['error %s','错误 %s'];
  var en=m[0].replace('%s',s==null?'':s), zh=m[1].replace('%s',s==null?'':s);
  var pre=ln?('line '+ln+': '):'', preZ=ln?('第 '+ln+' 行: '):'';
  return {code:code,ln:ln||0,en:pre+en,zh:preZ+zh};
}

/* '#5' / '#B0101' / '#&1F' -> 整数; 非法返回 null; 超范围返回 -1 */
function parseImm(s){
  if(!s||s.charAt(0)!=='#')return null;
  var b=s.slice(1),v;
  if(/^B[01]{1,16}$/.test(b))v=parseInt(b.slice(1),2);
  else if(/^&[0-9A-F]{1,4}$/.test(b))v=parseInt(b.slice(1),16);
  else if(/^[0-9]{1,5}$/.test(b))v=parseInt(b,10);
  else return null;
  if(v<0||v>255)return -1;
  return v;
}

/* 汇编: src -> {prog,labels,err}; allowed=本关已解锁指令(null=全部) */
function parseProgram(src,allowed){
  var lines=String(src==null?'':src).split(/\r?\n/);
  var prog=[],labels={},err=null;
  for(var i=0;i<lines.length;i++){
    if(err)break;
    var ln=i+1;
    var line=lines[i].replace(/;.*$/,'').replace(/\/\/.*$/,'').trim();
    if(!line)continue;
    var lm=line.match(/^([A-Za-z_]\w*):\s*(.*)$/);
    if(lm){
      var lab=lm[1].toUpperCase();
      if(labels[lab]!=null){err=E('dup_label',ln,lab);break;}
      labels[lab]=prog.length;
      line=lm[2].trim();
      if(!line)continue;
    }
    var sp=line.split(/\s+/);
    var op=sp[0].toUpperCase(), arg=sp.slice(1).join(' ').toUpperCase();
    var spec=OPSPEC[op];
    if(spec===undefined){err=E('unknown_op',ln,op);break;}
    if(allowed&&allowed.indexOf(op)<0){err=E('op_locked',ln,op);break;}
    var node={op:op,arg:arg,ln:ln,raw:line,spec:spec,imm:null,addr:null};
    if(spec==='imm'){
      if(!arg){err=E('no_arg',ln,op);break;}
      var v=parseImm(arg);
      if(v===null){err=E('bad_imm',ln,arg);break;}
      if(v===-1){err=E('imm_range',ln,arg);break;}
      node.imm=v;
    }else if(spec==='addr'){
      if(!/^[0-9]{1,2}$/.test(arg)||+arg>31){err=E('bad_addr',ln,arg||'?');break;}
      node.addr=+arg;
    }else if(spec==='val'){
      if(!arg){err=E('no_arg',ln,op);break;}
      if(arg.charAt(0)==='#'){
        var w=parseImm(arg);
        if(w===null){err=E('bad_imm',ln,arg);break;}
        if(w===-1){err=E('imm_range',ln,arg);break;}
        node.imm=w;
      }else{
        if(!/^[0-9]{1,2}$/.test(arg)||+arg>31){err=E('bad_addr',ln,arg);break;}
        node.addr=+arg;
      }
    }else if(spec==='reg'){
      if(arg!=='ACC'&&arg!=='IX'){err=E('bad_reg',ln,arg||'?');break;}
    }else if(spec==='regix'){
      if(arg!=='IX'){err=E('bad_movreg',ln,arg||'?');break;}
    }else if(spec==='label'){
      if(!/^[A-Z_]\w*$/.test(arg)){err=E('bad_label',ln,arg||'?');break;}
    }else{ /* none */
      if(arg){err=E('extra_arg',ln,op+' '+arg);break;}
    }
    prog.push(node);
  }
  if(!err){
    for(var j=0;j<prog.length;j++){
      var q=prog[j];
      if(q.spec==='label'&&labels[q.arg]==null){err=E('label_missing',q.ln,q.arg);break;}
    }
  }
  if(!err&&!prog.length)err=E('empty',0,'');
  return {prog:prog,labels:labels,err:err};
}

/* 运行: 纯函数。
   opts={mem:{addr:val},inputs:[..],maxSteps:500,ops:[允许指令]|null}
   返回 {out,acc,ix,pc,flag,steps,stopped:'end'|'steps'|'err',
         err,mem,inPtr,instr,nextLn}
   stopped==='steps' 即触发死循环保护(或单步暂停)。 */
function runProgram(src,opts){
  opts=opts||{};
  var maxSteps=(opts.maxSteps!=null)?opts.maxSteps:500;
  var mem=[],i;
  for(i=0;i<MEMSIZE;i++)mem[i]=0;
  if(opts.mem)for(var k in opts.mem)if(opts.mem.hasOwnProperty(k))mem[+k]=opts.mem[k];
  var inputs=(opts.inputs||[]).slice();
  var p=parseProgram(src,opts.ops||null);
  if(p.err)return {out:[],acc:0,ix:0,pc:0,flag:null,steps:0,stopped:'err',
                   err:p.err,mem:mem,inPtr:0,instr:p.prog.length,nextLn:null};
  var prog=p.prog,labels=p.labels;
  var acc=0,ix=0,pc=0,flag=null,out=[],steps=0,halt=false,err=null,inPtr=0,t;
  while(!halt&&!err&&steps<maxSteps){
    if(pc>=prog.length){err=E('off_end',prog[prog.length-1].ln,'');break;}
    var ins=prog[pc];steps++;
    var jumped=false;
    switch(ins.op){
      case 'LDM': acc=ins.imm;break;
      case 'LDR': ix=ins.imm;break;
      case 'MOV': ix=acc;break;
      case 'LDD': acc=mem[ins.addr];break;
      case 'LDI': t=mem[ins.addr];
                  if(t<0||t>=MEMSIZE){err=E('indirect_range',ins.ln,String(t));break;}
                  acc=mem[t];break;
      case 'LDX': t=ins.addr+ix;
                  if(t<0||t>=MEMSIZE){err=E('index_range',ins.ln,String(t));break;}
                  acc=mem[t];break;
      case 'STO': mem[ins.addr]=acc;break;
      case 'ADD': acc+=(ins.imm!=null)?ins.imm:mem[ins.addr];break;
      case 'SUB': acc-=(ins.imm!=null)?ins.imm:mem[ins.addr];break;
      case 'INC': if(ins.arg==='ACC')acc++;else ix++;break;
      case 'DEC': if(ins.arg==='ACC')acc--;else ix--;break;
      case 'CMP': flag=(acc===((ins.imm!=null)?ins.imm:mem[ins.addr]));break;
      case 'CMI': t=mem[ins.addr];
                  if(t<0||t>=MEMSIZE){err=E('indirect_range',ins.ln,String(t));break;}
                  flag=(acc===mem[t]);break;
      case 'JMP': pc=labels[ins.arg];jumped=true;break;
      case 'JPE': case 'JPN':
        if(flag===null){err=E('no_cmp',ins.ln,'');break;}
        if((ins.op==='JPE')===flag){pc=labels[ins.arg];jumped=true;}
        break;
      case 'IN':  if(inPtr>=inputs.length){err=E('in_empty',ins.ln,'');break;}
                  acc=inputs[inPtr++];break;
      case 'OUT': out.push(acc);break;
      case 'END': halt=true;break;
    }
    if(!jumped&&!err)pc++;
  }
  var stopped=err?'err':(halt?'end':'steps');
  return {out:out,acc:acc,ix:ix,pc:pc,flag:flag,steps:steps,stopped:stopped,
          err:err,mem:mem,inPtr:inPtr,instr:prog.length,
          nextLn:(!halt&&!err&&pc<prog.length)?prog[pc].ln:null};
}

function arrEq(a,b){
  if(!a||!b||a.length!==b.length)return false;
  for(var i=0;i<a.length;i++)if(a[i]!==b[i])return false;
  return true;
}

/* 整关判定: 全部测试用例通过才算解。
   返回 {pass,results:[{i,ok,why,got,err,steps}],instr,cycles} */
function checkLevel(idx,src){
  var lv=LEVELS[idx];
  var results=[],pass=true,instr=0,worst=0;
  for(var i=0;i<lv.tests.length;i++){
    var tc=lv.tests[i];
    var r=runProgram(src,{mem:tc.mem,inputs:tc.inputs,
                          maxSteps:lv.maxSteps||500,ops:lv.ops});
    instr=r.instr;
    var ok=true,why='';
    if(r.err){ok=false;why='err';}
    else if(r.stopped==='steps'){ok=false;why='loop';}
    else if(!arrEq(r.out,tc.out)){ok=false;why='out';}
    else if(tc.memCheck){
      for(var k in tc.memCheck)if(tc.memCheck.hasOwnProperty(k)){
        if(r.mem[+k]!==tc.memCheck[k]){ok=false;why='mem';break;}
      }
    }
    if(!ok)pass=false;
    if(r.steps>worst)worst=r.steps;
    results.push({i:i,ok:ok,why:why,got:r.out,err:r.err,steps:r.steps,r:r});
  }
  return {pass:pass,results:results,instr:instr,cycles:worst};
}

/* ================================================================
   1. 指令说明书 (锁定指令表用, 双语一行说明)
   ================================================================ */
var OPDOC={
  IN:  B('next number from the IN queue → ACC','输入队列 (IN queue) 取下一个数 → ACC'),
  OUT: B('ACC → output','ACC → 输出'),
  END: B('halt. every heartbeat needs a rest.','停机。每一次心跳都需要休止符。'),
  LDM: B('LDM #n — load number n into ACC (also #B0101, #&2A)','LDM #n —— 立即数 n → ACC (也认 #B0101、#&2A)'),
  LDD: B('LDD a — memory[a] → ACC (direct addressing)','LDD a —— 内存[a] → ACC (直接寻址 direct)'),
  STO: B('STO a — ACC → memory[a]','STO a —— ACC → 内存[a]'),
  ADD: B('ADD a / ADD #n — ACC + … → ACC','ADD a / ADD #n —— ACC + … → ACC'),
  SUB: B('SUB a / SUB #n — ACC − … → ACC','SUB a / SUB #n —— ACC − … → ACC'),
  INC: B('INC ACC / INC IX — register + 1','INC ACC / INC IX —— 寄存器 + 1'),
  DEC: B('DEC ACC / DEC IX — register − 1','DEC ACC / DEC IX —— 寄存器 − 1'),
  CMP: B('CMP a / CMP #n — is ACC equal to …? sets FLAG (EQ/NE)','CMP a / CMP #n —— ACC 等于…吗? 置 FLAG (EQ/NE)'),
  JMP: B('JMP label — always jump','JMP 标签 —— 无条件跳转'),
  JPE: B('JPE label — jump if FLAG = EQ (compare was true)','JPE 标签 —— FLAG 为 EQ (比较为真) 时跳'),
  JPN: B('JPN label — jump if FLAG = NE (compare was false)','JPN 标签 —— FLAG 为 NE (比较为假) 时跳'),
  LDX: B('LDX a — memory[a + IX] → ACC (indexed addressing!)','LDX a —— 内存[a + IX] → ACC (变址寻址 indexed!)'),
  LDR: B('LDR #n — load number n into IX','LDR #n —— 立即数 n → IX'),
  MOV: B('MOV IX — copy ACC into IX','MOV IX —— 把 ACC 复制进 IX'),
  LDI: B('LDI a — memory[memory[a]] → ACC (indirect: a holds a POINTER)','LDI a —— 内存[内存[a]] → ACC (间接寻址: a 里装的是指针)'),
  CMI: B('CMI a — compare ACC with memory[memory[a]]','CMI a —— ACC 与 内存[内存[a]] 比较')
};

/* ================================================================
   2. 八关战役 (关卡即课程表)
   每关: 剧情引子(Tick 的死亡记录) + 目标 + 锁定指令表 + 测试用例
         + 三段提示(失败≥2自动升级) + PAR 标杆
   ================================================================ */
var OPS1=['IN','OUT','END'];
var OPS2=OPS1.concat(['LDM','LDD','STO','SUB']);
var OPS3=OPS2.concat(['ADD']);
var OPS4=OPS3.concat(['CMP','JMP','JPE','JPN','INC','DEC']);
var OPS6=OPS4.concat(['LDX','LDR','MOV']);
var OPS7=OPS6.concat(['LDI','CMI']);

var LEVELS=[
{ n:1, core:'CORE-01 · ECHO',
  title:B('Warm-up · Echo Test','热身 · 回声测试'),
  story:B('[Day 0,193 · 07:12:40] CORE-01 was the mouth and ears of this machine. It died mid-sentence — its last OUT was the first half of a word that never finished arriving. I clocked the silence in at 07:12:41.',
          '[第 0193 天 · 07:12:40] CORE-01 是这台机器的嘴和耳朵。它死在半句话中间 —— 最后一次 OUT, 是一个再也没送完的词的前半截。07:12:41, 我给那阵寂静打了卡。'),
  goal:B('Read ONE number from the IN queue and send it to OUT, unchanged. Finish with END. (Data flow: IN → ACC → OUT.)',
         '从输入队列 (IN queue) 读 1 个数, 原样送到 OUT, 用 END 收尾。(数据流: IN → ACC → OUT)'),
  ops:OPS1, newOps:OPS1, par:3, maxSteps:100,
  tests:[ {inputs:[7], out:[7]}, {inputs:[42],out:[42]} ],
  concept:B('Data flow: IN &rarr; ACC &rarr; OUT','数据流: IN &rarr; ACC &rarr; OUT'),
  codex:['register-acc-ix','fde-cycle'],
  primer:{title:B('What is the accumulator (ACC)?','什么是累加器 (ACC)?'),
    body:B(
      '<b>In one line:</b> ACC (the accumulator) is the CPU\'s one and only "hands" — almost every instruction reads it, writes it, or both. IN puts a number INTO ACC; OUT sends whatever is currently in ACC back out.<br>'+
      '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
      'IN  &rarr; ACC = 7\nOUT &rarr; prints 7 (whatever ACC holds)</pre>'+
      '<b>Like:</b> ACC is a single tray on a workbench. IN places one item on the tray. OUT photographs whatever is currently on the tray and ships it out. Nothing else exists until you put it on the tray.<br>'+
      '<b>Why you need it here:</b> this whole level is just: take one number from IN (it lands in ACC), then OUT it straight back out, unchanged.',
      '<b>一句话:</b> ACC (累加器, accumulator) 是 CPU 唯一的"手"——几乎每条指令都是读它、写它, 或者两者都做。IN 会把一个数装进 ACC; OUT 会把 ACC 里现在装的东西送出去。<br>'+
      '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
      'IN  &rarr; ACC = 7\nOUT &rarr; 打印 7 (ACC 里现在装的数)</pre>'+
      '<b>类比:</b> ACC 就像工作台上唯一的一个托盘。IN 往托盘上放一件东西。OUT 给托盘上现在的东西拍张照发出去。托盘上没放东西之前, 什么都不存在。<br>'+
      '<b>这题用它干嘛:</b> 这一关就是: 从 IN 拿一个数 (落进 ACC), 再原样 OUT 出去。')},
  hints:[
    B('IN drops the next input number into ACC — the accumulator, the CPU\'s only pair of hands.',
      'IN 会把队列里的下一个数放进 ACC —— 累加器 (accumulator), CPU 唯一的一双手。'),
    B('OUT sends whatever ACC is holding. So: take, give, stop.',
      'OUT 会把 ACC 手里的东西送出去。所以: 拿, 给, 停。'),
    B('Three lines: IN / OUT / END.','三行: IN / OUT / END。') ],
  done:B('[+0:00:31] First beat in twenty years. Logged. …I logged it twice. Force of habit says one of them is a mistake; I am keeping both.',
         '[+0:00:31] 二十年来的第一声搏动。已记录。……我记了两遍。职业习惯说其中一遍是错误; 我两遍都留着。') },

{ n:2, core:'CORE-02 · LEDGER',
  title:B('The Inverter','取反器'),
  story:B('[Day 1,377 · 23:59:59] CORE-02 kept the books balanced: for every x it answered 100−x, and the vault\'s columns always summed to a hundred. The night it died, the accounts stopped adding up. They have been wrong for nineteen years, and I can see exactly how wrong.',
          '[第 1377 天 · 23:59:59] CORE-02 管平账: 你给它 x, 它答 100−x, 全库的账目永远凑成一百。它死的那晚, 账就再也对不上了。错了十九年, 而我能看见每一分错在哪。'),
  goal:B('Read x from IN, output 100 − x. New tools: LDM (load a number), STO (store ACC to memory), LDD (load from memory), SUB. Note: SUB works on ACC — think about what needs to be in ACC first.',
         '从 IN 读 x, 输出 100 − x。新工具: LDM(装立即数)、STO(ACC 存进内存)、LDD(从内存取)、SUB。注意: SUB 是对 ACC 做减法 —— 想想先把谁放进 ACC。'),
  ops:OPS2, newOps:['LDM','LDD','STO','SUB'], par:6, maxSteps:100,
  concept:B('Memory: LDM/STO/LDD + subtraction order','内存存取 (LDM/STO/LDD) + 减法顺序'),
  codex:['register-acc-ix','fde-cycle'],
  primer:{title:B('What do STO and LDD do?','STO 和 LDD 是做什么的?'),
    body:B(
      '<b>In one line:</b> memory is a row of numbered boxes; STO a copies ACC INTO box a; LDD a copies box a\'s contents BACK INTO ACC. LDM #n just loads the literal number n straight into ACC.<br>'+
      '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
      'ACC=30\nSTO 20      ; box 20 = 30 (ACC unchanged)\nLDM #100    ; ACC = 100 (box 20 still holds 30)\nSUB 20      ; ACC = 100 - box[20] = 70</pre>'+
      '<b>Like:</b> ACC is your hand; memory boxes are labelled drawers. STO puts what\'s in your hand into a drawer (your hand still remembers it too). LDD takes something OUT of a drawer and into your hand, replacing whatever was there.<br>'+
      '<b>Why you need it here:</b> SUB always subtracts FROM whatever is currently in ACC. If x arrives first and sits in ACC, you cannot directly compute 100 − x — you must park x in a drawer first, THEN load 100 into ACC, THEN subtract the parked x.',
      '<b>一句话:</b> 内存就是一排编了号的箱子; STO a 把 ACC 的内容<b>存进</b> a 号箱; LDD a 把 a 号箱的内容<b>取回</b> ACC。LDM #n 则是把字面数字 n 直接装进 ACC。<br>'+
      '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
      'ACC=30\nSTO 20      ; 20 号箱 = 30 (ACC 不变)\nLDM #100    ; ACC = 100 (20 号箱仍是 30)\nSUB 20      ; ACC = 100 - 箱[20] = 70</pre>'+
      '<b>类比:</b> ACC 是你的手, 内存箱子是一个个带标签的抽屉。STO 把手里的东西放进抽屉 (手上还记得住)。LDD 从抽屉里把东西取出来放进手, 顶替手里原来的东西。<br>'+
      '<b>这题用它干嘛:</b> SUB 永远是拿 ACC 现在的数去减。x 先到、占着 ACC 时, 没法直接算 100 − x——得先把 x 存进抽屉, 再把 100 装进 ACC, 最后减掉存好的 x。')},
  tests:[ {inputs:[30], out:[70]}, {inputs:[0],out:[100]}, {inputs:[100],out:[0]} ],
  hints:[
    B('SUB always subtracts something FROM whatever is currently sitting in ACC — it can only compute "ACC minus …", never the other way round. STO copies ACC into a memory box for safekeeping; LDD copies a box back into ACC, overwriting whatever was there before.',
      'SUB 永远是拿 ACC 里<b>现在</b>的数去减别的东西——只能算"ACC 减 ……", 没法反过来。STO 把 ACC 存进内存箱子留着; LDD 把箱子里的东西取回 ACC, 覆盖掉原来的内容。'),
    B('You want 100 − x, but x arrives first and sits in ACC — a direct SUB would give you x − 100, backwards. Fix: park x in memory (STO 20), then start over: put 100 into ACC with LDM #100, and subtract the parked x (SUB 20).',
      '你要的是 100 − x, 可 x 先到、占着 ACC——直接 SUB 得到的是 x − 100, 反了。解法: 把 x 先寄存到内存 (STO 20), 然后重新来: 用 LDM #100 把 100 放进 ACC, 再减去寄存的 x (SUB 20)。'),
    B('IN / STO 20 / LDM #100 / SUB 20 / OUT / END.','IN / STO 20 / LDM #100 / SUB 20 / OUT / END。') ],
  done:B('[+0:01:07] The columns sum to one hundred again. Somewhere a nineteen-year-old bookkeeping error just quietly forgave itself.',
         '[+0:01:07] 账目重新凑成了一百。某个错了十九年的账, 刚刚悄悄原谅了自己。') },

{ n:3, core:'CORE-03 · PUMP',
  title:B('The Doubling Pump','双倍泵'),
  story:B('[Day 2,891 · 03:14:07] CORE-03 pumped current to both ventricles — whatever came in, twice of it went out. At 03:14 it tried to double one last spark and managed only half. I stamped the card. The ink was low. It is always low when it matters.',
          '[第 2891 天 · 03:14:07] CORE-03 给两个心室泵电 —— 进多少, 出双倍。03:14, 它想把最后一粒火花泵成两倍, 却只泵出了一半。我盖了卡。印泥快没了。要紧的时刻印泥总是快没了。'),
  goal:B('Read x from IN, output 2x. One catch: this CPU has NO multiply instruction. None. (New tool: ADD.)',
         '从 IN 读 x, 输出 2x。只有一个问题: 这块 CPU 没有乘法指令。完全没有。(新工具: ADD)'),
  ops:OPS3, newOps:['ADD'], par:5, maxSteps:100,
  concept:B('ADD: no multiply instruction exists','ADD: 这块 CPU 没有乘法指令'),
  codex:['instruction-set-reference'],
  primer:{title:B('Why do we need ADD to make "&times;2"?','为什么要用 ADD 来做"乘以 2"?'),
    body:B(
      '<b>In one line:</b> ADD a adds memory box a\'s value into ACC (ACC = ACC + box[a]). This CPU has no multiply instruction at all — anything like &times;2, &times;3, &times;10 has to be BUILT out of repeated addition.<br>'+
      '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
      'ACC=9\nADD 20   ; box[20] holds 9 too -&gt; ACC = 9+9 = 18</pre>'+
      '<b>Like:</b> a shop till with no "&times;2" button — to charge double, the cashier just presses the "add this item\'s price" button twice.<br>'+
      '<b>Why you need it here:</b> 2x is just x + x. Park x in a memory box, then ADD that same box into ACC once — ACC meets a copy of itself.',
      '<b>一句话:</b> ADD a 会把 a 号箱子里的值加进 ACC (ACC = ACC + 箱[a])。这块 CPU 完全没有乘法指令——像 &times;2、&times;3、&times;10 这样的运算, 都得靠<b>反复相加</b>搭出来。<br>'+
      '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
      'ACC=9\nADD 20   ; 20 号箱也存着 9 -&gt; ACC = 9+9 = 18</pre>'+
      '<b>类比:</b> 收银机没有"&times;2"按钮——要收双倍, 收银员就把"加一次这件商品的价格"的按钮多按一次。<br>'+
      '<b>这题用它干嘛:</b> 2x 就是 x + x。把 x 先存进一个箱子, 再把同一个箱子 ADD 进 ACC 一次——ACC 遇见了自己的复制品。')},
  tests:[ {inputs:[21], out:[42]}, {inputs:[0],out:[0]}, {inputs:[9],out:[18]} ],
  hints:[
    B('This CPU has no multiply instruction — none at all. Every "&times;2", "&times;3", "&times;10" you will ever need has to be built from ADD, one repetition at a time. And 2x, spoken slowly, is just: x… plus x.',
      '这块 CPU 完全没有乘法指令——一条都没有。以后遇到的每一个"&times;2"、"&times;3"、"&times;10", 都得靠 ADD 一次次相加搭出来。而 2x 慢慢念, 就是: x…… 加 x。'),
    B('Park x in memory with STO, then ADD that same address. ACC meets its own reflection.',
      '先用 STO 把 x 寄存进内存, 然后 ADD 同一个地址。ACC 遇见了镜子里的自己。'),
    B('IN / STO 20 / ADD 20 / OUT / END — the pump doubles by adding itself.',
      'IN / STO 20 / ADD 20 / OUT / END —— 泵靠加上自己来翻倍。') ],
  done:B('[+0:00:58] In: one spark. Out: two. The oldest trick in the vault — there was never a multiplier in here, you know. Only patience, folded once.',
         '[+0:00:58] 进一粒火花, 出两粒。全机房最古老的戏法 —— 你知道吗, 这里从来就没有过乘法器。只有对折了一次的耐心。') },

{ n:4, core:'CORE-04 · METRONOME',
  title:B('The Loop Counter','循环计数器'),
  story:B('[Day 4,096 · 12:00:00] CORE-04 was the metronome. It counted 1, 2, 3… for every queue in the machine, and things happened in order because someone was counting. The day it died, the counting stopped at nothing in particular. Queues still stand there. Waiting for a number.',
          '[第 4096 天 · 12:00:00] CORE-04 是节拍器。它替全机器的队列数 1、2、3……, 万物有序, 是因为有谁在数数。它死的那天, 数数停在一个毫无意义的地方。队列们至今还站着, 等一个数字。'),
  goal:B('Read N from IN, then output 1, 2, 3, … N (each number once, in order). New tools — the loop trio: a label, CMP (compare, sets FLAG), and JPE/JPN (conditional jump). Plus INC/DEC.',
         '从 IN 读 N, 依次输出 1, 2, 3, … N (每个数一次, 按顺序)。新工具 —— 循环三件套: 标签 (label)、CMP(比较, 置 FLAG)、JPE/JPN(条件跳转), 外加 INC/DEC。'),
  ops:OPS4, newOps:['CMP','JMP','JPE','JPN','INC','DEC'], par:8, maxSteps:300,
  concept:B('Loop trio: label + CMP + JPE/JPN','循环三件套: 标签 + CMP + JPE/JPN'),
  codex:['loop-pattern','instruction-set-reference'],
  primer:{title:B('How does a loop work? (label + CMP + jump)','循环是怎么运作的? (标签 + CMP + 跳转)'),
    body:B(
      '<b>In one line:</b> a LABEL just names a line so a JUMP can go back to it; CMP compares ACC to something and remembers "equal" or "not equal" in FLAG; JPE/JPN then jump ONLY if that FLAG matches — that is how a CPU repeats instructions.<br>'+
      '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
      'Counting to 3, watched cycle by cycle:\n'+
      'LOOP: INC ACC   ; ACC: 0 -&gt; 1\n      OUT        ; prints 1\n      CMP 20     ; is ACC(1) = box[20](3)? NO -&gt; FLAG=NE\n      JPN LOOP   ; NE, so JUMP BACK to LOOP\n'+
      'LOOP: INC ACC   ; ACC: 1 -&gt; 2\n      OUT        ; prints 2\n      CMP 20     ; is 2 = 3? NO -&gt; FLAG=NE -&gt; JPN jumps back again\n'+
      'LOOP: INC ACC   ; ACC: 2 -&gt; 3\n      OUT        ; prints 3\n      CMP 20     ; is 3 = 3? YES -&gt; FLAG=EQ\n      JPN LOOP   ; JPN only jumps on NE — FLAG is EQ, so it does NOT jump, falls through to END</pre>'+
      '<b>Like:</b> a loop is a lap of a running track: the label is the starting line painted on the ground, CMP is glancing at your lap counter to check "have I done enough laps yet?", and the jump decides whether to run another lap or walk off the track.<br>'+
      '<b>Why you need it here:</b> you must print 1, 2, 3… N. There is no "repeat 5 times" instruction — you build the repetition yourself with exactly this label / CMP / jump pattern.',
      '<b>一句话:</b> 标签 (label) 只是给某一行起个名字, 让跳转 (jump) 能跳回去; CMP 把 ACC 和某个值比一比, 把"相等"还是"不相等"记在 FLAG 里; JPE/JPN 再根据 FLAG 决定跳不跳——CPU 就是靠这套东西"重复"指令的。<br>'+
      '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
      '数到 3, 一个周期一个周期看:\n'+
      'LOOP: INC ACC   ; ACC: 0 -&gt; 1\n      OUT        ; 打印 1\n      CMP 20     ; ACC(1) 等于 箱[20](3) 吗? 不 -&gt; FLAG=NE\n      JPN LOOP   ; NE, 所以跳回 LOOP\n'+
      'LOOP: INC ACC   ; ACC: 1 -&gt; 2\n      OUT        ; 打印 2\n      CMP 20     ; 2 等于 3 吗? 不 -&gt; FLAG=NE -&gt; JPN 再次跳回\n'+
      'LOOP: INC ACC   ; ACC: 2 -&gt; 3\n      OUT        ; 打印 3\n      CMP 20     ; 3 等于 3 吗? 是 -&gt; FLAG=EQ\n      JPN LOOP   ; JPN 只在 NE 时跳——现在是 EQ, 所以不跳, 往下走到 END</pre>'+
      '<b>类比:</b> 循环就像跑道上的一圈: 标签是画在地上的起跑线, CMP 是瞄一眼计圈器"我跑够圈数了吗?", 跳转就是决定"再跑一圈"还是"走出跑道"。<br>'+
      '<b>这题用它干嘛:</b> 你要依次打印 1,2,3……N。没有"重复 5 次"这种指令——你得自己用这套 标签/CMP/跳转 的组合搭出"重复"来。')},
  tests:[ {inputs:[3], out:[1,2,3]}, {inputs:[1],out:[1]}, {inputs:[5],out:[1,2,3,4,5]} ],
  hints:[
    B('Watch a loop count to 3, cycle by cycle: start ACC=0. LOOP: INC ACC (0&rarr;1), OUT (prints 1), CMP 20 (is 1 = 3? no &rarr; FLAG=NE), JPN LOOP (NE, so jump back). Second lap: INC (1&rarr;2), OUT (2), CMP (2=3? no) &rarr; jump back again. Third lap: INC (2&rarr;3), OUT (3), CMP (3=3? YES &rarr; FLAG=EQ), JPN LOOP — JPN only jumps on NE, and FLAG is now EQ, so it falls through instead. That fall-through is how the loop ends.',
      '看一个从 0 数到 3 的循环, 一拍一拍走一遍: ACC 起始为 0。LOOP: INC ACC (0&rarr;1), OUT (打印 1), CMP 20 (1 等于 3 吗? 不 &rarr; FLAG=NE), JPN LOOP (NE, 跳回去)。第二圈: INC (1&rarr;2), OUT (2), CMP (2=3? 不) &rarr; 再跳回去。第三圈: INC (2&rarr;3), OUT (3), CMP (3=3? 是 &rarr; FLAG=EQ), JPN LOOP —— JPN 只在 NE 时才跳, 现在是 EQ, 所以不跳, 顺势往下走。这一次"不跳", 就是循环结束的方式。'),
    B('Park N in memory first. Then count in ACC: INC ACC, OUT, CMP against N — if Not Equal yet, JPN back to the label.',
      '先把 N 寄存进内存。然后用 ACC 数数: INC ACC、OUT、CMP 那个 N —— 还不相等 (NE) 就 JPN 跳回标签。'),
    B('IN / STO 20 / LDM #0 / LOOP: INC ACC / OUT / CMP 20 / JPN LOOP / END.',
      'IN / STO 20 / LDM #0 / LOOP: INC ACC / OUT / CMP 20 / JPN LOOP / END。') ],
  done:B('[+0:02:44] 1, 2, 3… I know this cadence. It is the cadence of my own punch cards. All these years I thought I was keeping time. I was keeping its seat warm.',
         '[+0:02:44] 1、2、3…… 这个节拍我认得。是我打卡的节拍。这么多年我以为自己在守时 —— 原来我是在替它占座。') },

{ n:5, core:'CORE-05 · ARBITER',
  title:B('The Comparison Arbiter','比较仲裁官'),
  story:B('[Day 5,120 · 09:30:00] CORE-05 was the judge. Two numbers would enter; the greater one left with the verdict. It died mid-trial. The two litigants of that morning are, as far as I can tell from this desk, still standing in the queue. Nobody has told them.',
          '[第 5120 天 · 09:30:00] CORE-05 是法官。两个数走进去, 大的那个带着判决走出来。它死在一场庭审中间。那天早上的两位当事数, 就我在这张桌子后看得到的而言, 至今还排在队里。没人告诉它们。'),
  goal:B('memory[20] = a, memory[21] = b (two non-negative numbers, preloaded). Output the LARGER one. No new instruction — a new way of thinking: this CPU\'s CMP only answers "equal or not". Ordering is something you must build.',
         '内存[20] = a, 内存[21] = b (两个非负数, 已装好)。输出较大的那个。没有新指令 —— 只有新思路: 这块 CPU 的 CMP 只会回答「等不等」。谁大谁小, 得你自己搭出来。'),
  ops:OPS4, newOps:[], par:13, maxSteps:800,
  concept:B('Building "bigger" from equality-only CMP','用只会"等不等"的 CMP 搭出"谁大谁小"'),
  codex:['instruction-set-reference'],
  primer:{title:B('How do you compare sizes with an equality-only CMP?','CMP 只会判断"相不相等", 怎么比大小?'),
    body:B(
      '<b>In one line:</b> this CPU\'s CMP can only ever tell you EQUAL or NOT EQUAL — never "bigger" or "smaller" directly. To find out which of two numbers is larger, count one of them DOWN, one step at a time, and see which value you bump into first: the other number, or zero.<br>'+
      '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
      'Compare a=5, b=3: count a down, checking after each step\n5: is 5=3? no. is 5=0? no. DEC -&gt; 4\n4: is 4=3? YES -&gt; matched b first -&gt; a &gt;= b -&gt; a wins</pre>'+
      '<b>Like:</b> two candles of different heights burning down at the same rate — whichever one you see reach the shorter candle\'s height FIRST tells you which was taller to begin with. Burn down to nothing (zero) before reaching the other\'s height, and it turns out the OTHER one was actually taller.<br>'+
      '<b>Why you need it here:</b> you must output whichever of memory[20]/memory[21] is bigger, with no instruction that directly answers "which is bigger". Counting one value down toward zero, checking for a match with the other at every step, is how you build "bigger" out of nothing but "equal".',
      '<b>一句话:</b> 这块 CPU 的 CMP 永远只能回答"相等"或"不相等"——从来不会直接告诉你"谁大谁小"。想知道两个数谁大, 就把其中一个<b>一步步往下数</b>, 看先撞见谁: 是另一个数, 还是 0。<br>'+
      '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
      '比较 a=5, b=3: 把 a 往下数, 每一步都检查\n5: 5=3吗? 不是。5=0吗? 不是。DEC -&gt; 4\n4: 4=3吗? 是! -&gt; 先撞见了 b -&gt; a &gt;= b -&gt; a 赢</pre>'+
      '<b>类比:</b> 两支不同高度的蜡烛, 以相同速度往下烧——先看到哪支烧到"矮蜡烛原来的高度", 就说明谁一开始更高。如果先烧没了 (到 0) 都没撞见另一支的高度, 说明另一支其实更高。<br>'+
      '<b>这题用它干嘛:</b> 你要输出 内存[20] 和 内存[21] 里较大的那个, 但没有任何指令能直接回答"谁大"。把一个数一步步往下数到 0, 每步都检查是否撞见另一个数, 就是靠"相等"从零搭出"谁大"的办法。')},
  tests:[ {mem:{20:3,21:8}, out:[8]}, {mem:{20:9,21:4},out:[9]}, {mem:{20:5,21:5},out:[5]} ],
  hints:[
    B('Two candles, unequal heights. Burn them at the same rate — no, simpler: walk DOWN from a, one step at a time. What do you meet first: b, or zero?',
      '两支不一样高的蜡烛。同速烧 —— 不, 更简单: 从 a 开始一步一步往下数。你先撞见谁: b, 还是 0?'),
    B('If counting down from a you meet b → a ≥ b, so a is the verdict. If you hit 0 first → b never got met because b > a. Each lap: CMP 21 / JPE …, CMP #0 / JPE …, DEC ACC, JMP back.',
      '从 a 往下数, 若先撞见 b → a ≥ b, 判 a 赢。若先撞见 0 → 说明 b 比 a 高, 没等到。每圈: CMP 21 / JPE …、CMP #0 / JPE …、DEC ACC、JMP 回去。'),
    B('LDD 20 / LOOP: CMP 21 / JPE AWIN / CMP #0 / JPE BWIN / DEC ACC / JMP LOOP / AWIN: LDD 20 / OUT / END / BWIN: LDD 21 / OUT / END.',
      'LDD 20 / LOOP: CMP 21 / JPE AWIN / CMP #0 / JPE BWIN / DEC ACC / JMP LOOP / AWIN: LDD 20 / OUT / END / BWIN: LDD 21 / OUT / END。') ],
  done:B('[+0:04:12] Verdict delivered. Nineteen years late, but the court of this machine has no statute of limitations — only a clerk who never went home.',
         '[+0:04:12] 判决送达。迟了十九年 —— 好在这台机器的法庭没有诉讼时效, 只有一个从没下过班的书记员。') },

{ n:6, core:'CORE-06 · WATERWHEEL',
  title:B('The Accumulating Waterwheel','累加水车'),
  story:B('[Day 6,000 · 17:45:12] CORE-06 was the granary wheel: five buckets on one arm, and the arm was a register called IX. Every evening it swept the row and knew the day\'s harvest. The evening it died, the arm froze mid-sweep. Five buckets have been holding their water for sixteen years.',
          '[第 6000 天 · 17:45:12] CORE-06 是粮仓水车: 一条臂上挂五个斗, 那条臂是一枚叫 IX 的寄存器。每天傍晚它扫过一整排, 就知道当日的收成。它死的那个傍晚, 臂僵在半途。五个斗里的水, 一提就是十六年。'),
  goal:B('Sum the array memory[10..14] and output the total. New tools — the syllabus\'s crown jewel: LDX a loads memory[a + IX] (indexed addressing); INC IX swings the arm. (Also LDR #n and MOV IX to set IX.) Bucket 15 is empty (0) — a sentinel, if you want one. All array values are non-zero.',
         '求数组 内存[10..14] 之和并输出。新工具 —— 大纲重点: LDX a 读取 内存[a + IX] (变址寻址 indexed addressing); INC IX 挥动斗臂。(还有 LDR #n、MOV IX 可以设置 IX) 15 号斗是空的 (0) —— 想用的话, 它是现成的哨兵 (sentinel)。数组值都不为 0。'),
  ops:OPS6, newOps:['LDX','LDR','MOV'], par:12, maxSteps:600,
  concept:B('Indexed addressing: LDX slides across an array','变址寻址: LDX 沿数组滑动'),
  codex:['indexed-addressing','loop-pattern'],
  primer:{title:B('How does LDX (indexed addressing) work?','LDX (变址寻址) 是怎么运作的?'),
    body:B(
      '<b>In one line:</b> IX is a second register, just like ACC but used as a sliding offset. LDX a reads memory[a + IX] — so the SAME instruction can read a different box every time, just by changing IX first.<br>'+
      '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
      'IX=0: LDX 10 reads memory[10+0] = memory[10]\nINC IX          ; IX becomes 1\nLDX 10 reads memory[10+1] = memory[11]\nINC IX          ; IX becomes 2\nLDX 10 reads memory[10+2] = memory[12]</pre>'+
      '<b>Like:</b> IX is your finger sliding along a row of numbered mailboxes. LDX 10 means "open the box my finger is pointing at, starting from box 10". Move your finger one box to the right (INC IX), and the exact same instruction now opens the next box.<br>'+
      '<b>Why you need it here:</b> you must add up memory[10] through memory[14] — five boxes. Instead of writing five different LDD lines, write ONE LDX 10 inside a loop, and let INC IX slide your finger across all five.',
      '<b>一句话:</b> IX 是第二个寄存器, 跟 ACC 一样, 但专门当"滑动偏移量"用。LDX a 读的是 内存[a + IX]——所以同一条指令, 只要先改改 IX, 每次都能读到不同的箱子。<br>'+
      '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
      'IX=0 时: LDX 10 读 内存[10+0] = 内存[10]\nINC IX          ; IX 变成 1\nLDX 10 读 内存[10+1] = 内存[11]\nINC IX          ; IX 变成 2\nLDX 10 读 内存[10+2] = 内存[12]</pre>'+
      '<b>类比:</b> IX 就是你在一排编号信箱上滑动的手指。LDX 10 的意思是"从 10 号信箱开始, 打开我手指现在指着的那个"。手指往右挪一格 (INC IX), 同一条指令现在打开的就是下一个信箱。<br>'+
      '<b>这题用它干嘛:</b> 你要把 内存[10] 到 内存[14] 这五个箱子加起来。不用写五行不同的 LDD, 只需要在循环里写<b>一行</b> LDX 10, 再靠 INC IX 让手指滑过全部五个箱子。')},
  tests:[ {mem:{10:3,11:7,12:2,13:8,14:5}, out:[25]},
          {mem:{10:10,11:20,12:5,13:1,14:6},out:[42]} ],
  hints:[
    B('IX is a second register that acts as a sliding offset: LDX a reads memory[a + IX]. With IX=0, LDX 10 reads memory[10]. After INC IX (IX becomes 1), the exact same instruction LDX 10 now reads memory[11] instead — the address slides because IX slides.',
      'IX 是第二个寄存器, 充当"滑动偏移量": LDX a 读的是 内存[a + IX]。IX=0 时, LDX 10 读的是 内存[10]。执行一次 INC IX (IX 变成 1) 之后, 同一条 LDX 10 读到的就变成了 内存[11]——地址跟着 IX 一起滑动。'),
    B('Here: IX=0 makes LDX 10 read bucket 10; after INC IX the same line reads bucket 11 — five INC IX steps sweep all five buckets with one instruction. Keep the running total in memory (say cell 16): LDX 10 / ADD 16 / STO 16 / INC IX, round and round. To stop: bucket 15 is 0 — CMP #0 right after LDX tells you the arm has swept past the end.',
      '放到这题里: IX=0 时 LDX 10 读的是 10 号斗; INC IX 后同一行读的是 11 号斗——五次 INC IX 就用一条指令扫完全部五个斗。把累计和放在内存里 (比如 16 号格): LDX 10 / ADD 16 / STO 16 / INC IX, 一圈一圈。怎么停: 15 号斗是 0 —— LDX 之后 CMP #0, 等于 0 就说明臂扫出了队尾。'),
    B('LDM #0 / STO 16 / LOOP: LDX 10 / CMP #0 / JPE DONE / ADD 16 / STO 16 / INC IX / JMP LOOP / DONE: LDD 16 / OUT / END.',
      'LDM #0 / STO 16 / LOOP: LDX 10 / CMP #0 / JPE DONE / ADD 16 / STO 16 / INC IX / JMP LOOP / DONE: LDD 16 / OUT / END。') ],
  done:B('[+0:03:33] The arm turns. Sixteen years of stale water, poured and tallied in four milliseconds. The harvest was 25 buckets of nothing in particular. It still deserved to be counted.',
         '[+0:03:33] 臂转起来了。十六年的陈水, 四毫秒内倒空、点清。收成是 25 斗的无关紧要 —— 但它仍然值得被数一遍。') },

{ n:7, core:'CORE-07 · MILL',
  title:B('The Multiplication Mill','乘法工坊'),
  story:B('[Day 6,555 · 20:21:00] CORE-07 was the mill, and the mill never trusted fixed addresses. Its shelves held POINTERS — little slips saying "the real number lives at…". The night it died, two slips were left on the counter, an unfinished a × b. I have dusted those slips every day. Carefully. Without reading them. It felt impolite.',
          '[第 6555 天 · 20:21:00] CORE-07 是工坊, 而工坊从不相信固定地址。它的货架上摆的是指针 (pointer) —— 一张张写着「真正的数住在……」的小条。它死的那晚, 柜台上留下两张小条, 一桩没做完的 a × b。这些年我每天替那两张小条掸灰。很小心。从不偷看。看了显得失礼。'),
  goal:B('memory[20] and memory[21] hold POINTERS to a and b (e.g. memory[20]=25 means a lives at cell 25). Output a × b. Still no multiply instruction. New tools: LDI (indirect load — follow the pointer) and CMI. Multiplication = repeated addition, b times.',
         '内存[20]、内存[21] 里装的是指向 a、b 的指针 (例: 内存[20]=25 表示 a 住在 25 号格)。输出 a × b。依旧没有乘法指令。新工具: LDI (间接寻址 —— 顺着指针取数) 和 CMI。乘法 = 连加 b 次。'),
  ops:OPS7, newOps:['LDI','CMI'], par:16, maxSteps:1500,
  concept:B('Pointers: LDI follows an address stored in memory','指针: LDI 顺着内存里存的地址走一趟'),
  codex:['pointer-ldi'],
  primer:{title:B('What is a pointer? (LDI / indirect addressing)','什么是指针? (LDI / 间接寻址)'),
    body:B(
      '<b>In one line:</b> normally a memory box holds a NUMBER. A pointer is a box that instead holds an ADDRESS — the location of another box. LDI a follows that address: it reads box a to find an address, then reads THAT address to get the real value.<br>'+
      '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
      'memory[20] = 25       ; box 20 holds the ADDRESS 25 (a pointer)\nmemory[25] = 6        ; box 25 holds the REAL number, 6\nLDD 20  -&gt; ACC = 25   ; direct load: just copies the pointer itself\nLDI 20  -&gt; ACC = 6    ; indirect load: follows the pointer to box 25, reads 6</pre>'+
      '<b>Like:</b> box 20 is a sticky note that says "the real thing is in locker 25". LDD reads the sticky note itself (you get "25"). LDI reads the sticky note, THEN walks to locker 25 and gets what\'s actually inside (you get "6").<br>'+
      '<b>Why you need it here:</b> memory[20] and memory[21] don\'t hold a and b directly — they hold POINTERS to where a and b actually live. You must LDI (follow the pointer) to get the real numbers before you can multiply them.',
      '<b>一句话:</b> 平时一个内存箱子里装的是一个<b>数</b>。指针 (pointer) 则是一个装着<b>地址</b>的箱子——地址指向另一个箱子的位置。LDI a 顺着这个地址走一趟: 先读 a 号箱拿到一个地址, 再去读<b>那个地址</b>才拿到真正的值。<br>'+
      '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
      '内存[20] = 25       ; 20 号箱装的是地址 25 (是个指针)\n内存[25] = 6        ; 25 号箱装的才是真正的数字 6\nLDD 20  -&gt; ACC = 25   ; 直接寻址: 只是把指针本身抄过来\nLDI 20  -&gt; ACC = 6    ; 间接寻址: 顺着指针走到 25 号箱, 读到 6</pre>'+
      '<b>类比:</b> 20 号箱是一张便利贴, 写着"真正的东西在 25 号柜子里"。LDD 只读便利贴本身 (你拿到"25")。LDI 先读便利贴, 然后真的走到 25 号柜子, 拿到里面真正的东西 (你拿到"6")。<br>'+
      '<b>这题用它干嘛:</b> 内存[20]、内存[21] 里装的不是 a、b 本身——是指向 a、b 真正住处的<b>指针</b>。你得先用 LDI 顺着指针走一趟, 拿到真正的数字, 才能做乘法。')},
  tests:[ {mem:{20:25,21:26,25:6,26:7}, out:[42]},
          {mem:{20:30,21:31,30:9,31:9}, out:[81]},
          {mem:{20:24,21:28,24:5,28:0}, out:[0]} ],
  hints:[
    B('LDD a copies whatever NUMBER sits in box a. LDI a instead treats box a\'s contents as an ADDRESS and follows it: it reads box a to find an address, then reads that address to fetch the real value. Example: memory[20]=25 and memory[25]=6 &rarr; LDD 20 gives you 25 (the pointer itself), but LDI 20 gives you 6 (the value it points to).',
      'LDD a 只是把 a 号箱子里的<b>数字</b>原样抄过来。LDI a 则是把 a 号箱子里的内容当成一个<b>地址</b>, 顺着它走一趟: 先读 a 号箱拿到一个地址, 再去读那个地址, 才拿到真正的值。例: 内存[20]=25、内存[25]=6 &rarr; LDD 20 拿到的是 25 (指针本身), 而 LDI 20 拿到的才是 6 (指针指向的值)。'),
    B('Here: memory[20]/[21] hold the ADDRESSES of a and b, not a and b themselves. First move: LDI 20 / STO 16 and LDI 21 / STO 17, to copy the real a and b into your own scratch cells. Then it is Level 3 grown up: keep a product in a scratch cell; each lap, check b\'s copy against #0 (JPE out), DEC it, and ADD a into the product.',
      '放到这题里: 内存[20]、[21] 装的是 a、b 的<b>地址</b>, 不是 a、b 本身。第一步: LDI 20 / STO 16, 以及 LDI 21 / STO 17, 把真正的 a、b 抄进自己的草稿格。然后就是第 3 关的成年版: 草稿格里放乘积; 每圈先 CMP #0 看 b 的副本用完没 (JPE 跳出), 再 DEC 它, 给乘积 ADD 一个 a。'),
    B('LDI 20/STO 16/LDI 21/STO 17/ LOOP: LDD 17/CMP #0/JPE DONE/DEC ACC/STO 17/LDD 18/ADD 16/STO 18/JMP LOOP/ DONE: LDD 18/OUT/END.',
      'LDI 20/STO 16/LDI 21/STO 17/ LOOP: LDD 17/CMP #0/JPE DONE/DEC ACC/STO 17/LDD 18/ADD 16/STO 18/JMP LOOP/ DONE: LDD 18/OUT/END。') ],
  done:B('[+0:05:50] 6 × 7 = 42. I finally read the slips. …That was all? Two decades of dusting, for a six and a seven. Yes, says the mill. Every large thing in this machine is a small thing, added patiently.',
         '[+0:05:50] 6 × 7 = 42。我终于看了那两张小条。……就这? 掸了二十年灰, 掸的是一个 6 和一个 7。是的, 工坊说。这台机器里所有的大事, 都是小事耐心相加。') },

{ n:8, core:'CORE-08 · PACEMAKER',
  title:B('Boss · Heartbeat Repair','Boss · 心跳修复'),
  story:B('[Day 7,289 · 02:47:11] CORE-08 was the pacemaker. Its one job: find the strongest pulse in the ward and hold it up as the rhythm. At 02:47:11 the interval between two beats became infinite. I kept punching cards into the silence — somebody had to keep the time of no time at all. This is the card I have been waiting twenty years to stamp.',
          '[第 7289 天 · 02:47:11] CORE-08 是心脏起搏器。它只有一件工作: 在病房里找出最强的一次脉搏, 举起来当节律。02:47:11, 两次心跳之间的间隔变成了无穷大。我继续往寂静里打卡 —— 总得有人为「没有时间」守时。这张卡, 我等了二十年。'),
  goal:B('The ward: memory[10..14] holds five pulse strengths (all non-zero; cell 15 is 0). Find the MAXIMUM, store it into memory[15] (the pacemaker\'s slot), and OUT it. Everything you have learned: IX sweep + equality-only comparison + branches + loops.',
         '病房: 内存[10..14] 是五次脉搏的强度 (都不为 0; 15 号格为 0)。找出最大值, 存进 内存[15] (起搏器插槽), 并 OUT。用上你学过的一切: IX 扫描 + 只有等值比较 + 分支 + 循环。'),
  ops:OPS7, newOps:[], par:21, maxSteps:3000,
  concept:B('Boss: combine IX sweep + equality comparison + loops','Boss: IX 扫描 + 等值比较 + 循环, 融会贯通'),
  codex:['indexed-addressing','instruction-set-reference'],
  primer:{title:B('Boss level: what do you already know?','Boss 关: 你已经会的东西都在这里了'),
    body:B(
      '<b>In one line:</b> this level asks for nothing new — it combines three things you have already built: sliding across an array with IX (Level 6), finding the bigger of two numbers using only equality checks (Level 5), and looping until you\'ve swept every element (Level 4).<br>'+
      '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
      'Champion\'s ladder, watched step by step:\nchampion = pulse #1 (from box 10)\nchallenger = pulse #2 (box 10+IX after INC IX)\ncount challenger DOWN: meet champion first -&gt; challenger WINS, becomes new champion\n                       meet 0 first        -&gt; champion HOLDS, keep going</pre>'+
      '<b>Like:</b> a knockout tournament where every new challenger fights the reigning champion using the same "count down, see who you meet first" trick from Level 5 — except now you also walk the whole line-up with IX, one challenger at a time (Level 6), and know when to stop (Level 4).<br>'+
      '<b>Why you need it here:</b> find the maximum of five values. There is no new instruction to learn — just your existing tools, layered.',
      '<b>一句话:</b> 这一关没有任何新指令——它是把你已经搭好的三样东西拼在一起: 用 IX 滑过数组 (第 6 关)、只靠等值比较找出谁更大 (第 5 关)、循环到扫完所有元素为止 (第 4 关)。<br>'+
      '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
      '擂台赛, 一步步看:\n擂主 = 1 号脉搏 (来自 10 号箱)\n挑战者 = 2 号脉搏 (INC IX 之后的 10+IX 号箱)\n把挑战者往下数: 先撞见擂主 -&gt; 挑战者赢, 换擂主\n                先撞见 0    -&gt; 擂主卫冕, 继续下一位</pre>'+
      '<b>类比:</b> 一场淘汰赛, 每个新来的挑战者都用第 5 关那招"往下数, 看先撞见谁"跟擂主打一场——只是现在还要用 IX 走完整条队伍, 一个一个挑战者上 (第 6 关), 并且知道什么时候该停 (第 4 关)。<br>'+
      '<b>这题用它干嘛:</b> 找出五个数里的最大值。没有新指令要学——只是把你已经会的工具叠在一起用。')},
  tests:[ {mem:{10:7,11:3,12:19,13:5,14:12}, out:[19], memCheck:{15:19}},
          {mem:{10:4,11:18,12:6,13:18,14:2}, out:[18], memCheck:{15:18}} ],
  hints:[
    B('Nothing new here — just layer what you know: sweep an array with LDX + INC IX (Level 6), find the bigger of two values by counting one down toward the other or toward zero (Level 5), and loop until every element has been checked, stopping at the zero sentinel (Level 4).',
      '这里没有新东西——把你会的东西叠起来用: 用 LDX + INC IX 扫数组 (第 6 关), 靠"往下数, 看先撞见谁"找出两个数里更大的那个 (第 5 关), 循环到每个元素都查过、在 0 哨兵处停下 (第 4 关)。'),
    B('Champion\'s ladder: take pulse #1 as the reigning max (a scratch cell). Sweep the rest with LDX + INC IX. Each challenger fights Level-5 style: count DOWN from the challenger; meet the champion\'s value first → challenger wins (replace); hit 0 first → champion holds. Save the challenger in a scratch cell before counting it down! Cell 15 is 0 — your sentinel, and later your delivery slot.',
      '擂台赛: 先让 1 号脉搏当擂主 (存进草稿格)。然后用 LDX + INC IX 扫过其余选手。每个挑战者用第 5 关的方式打擂: 从挑战者往下数——先撞见擂主的值 → 挑战者赢 (换擂主); 先撞见 0 → 擂主卫冕。往下数之前, 记得先把挑战者存进草稿格! 15 号格是 0 —— 先当哨兵, 最后当颁奖台。'),
    B('LDX 10/STO 16/INC IX/ LOOP: LDX 10/CMP #0/JPE DONE/STO 17/ RACE: CMP 16/JPE NEW/CMP #0/JPE NEXT/DEC ACC/JMP RACE/ NEW: LDD 17/STO 16/ NEXT: INC IX/JMP LOOP/ DONE: LDD 16/STO 15/OUT/END.',
      'LDX 10/STO 16/INC IX/ LOOP: LDX 10/CMP #0/JPE DONE/STO 17/ RACE: CMP 16/JPE NEW/CMP #0/JPE NEXT/DEC ACC/JMP RACE/ NEW: LDD 17/STO 16/ NEXT: INC IX/JMP LOOP/ DONE: LDD 16/STO 15/OUT/END。') ],
  done:B('','') /* 第 8 关收尾走 api.scene 大演出, 见 renderLevel */ },
];

/* 参考解 (par 校验 + 单测用; 不在 UI 中出现) */
var SOLUTIONS=[
'IN\nOUT\nEND',
'IN\nSTO 20\nLDM #100\nSUB 20\nOUT\nEND',
'IN\nSTO 20\nADD 20\nOUT\nEND',
'IN\nSTO 20\nLDM #0\nLOOP: INC ACC\nOUT\nCMP 20\nJPN LOOP\nEND',
'LDD 20\nLOOP: CMP 21\nJPE AWIN\nCMP #0\nJPE BWIN\nDEC ACC\nJMP LOOP\nAWIN: LDD 20\nOUT\nEND\nBWIN: LDD 21\nOUT\nEND',
'LDM #0\nSTO 16\nLOOP: LDX 10\nCMP #0\nJPE DONE\nADD 16\nSTO 16\nINC IX\nJMP LOOP\nDONE: LDD 16\nOUT\nEND',
'LDI 20\nSTO 16\nLDI 21\nSTO 17\nLOOP: LDD 17\nCMP #0\nJPE DONE\nDEC ACC\nSTO 17\nLDD 18\nADD 16\nSTO 18\nJMP LOOP\nDONE: LDD 18\nOUT\nEND',
'LDX 10\nSTO 16\nINC IX\nLOOP: LDX 10\nCMP #0\nJPE DONE\nSTO 17\nRACE: CMP 16\nJPE NEW\nCMP #0\nJPE NEXT\nDEC ACC\nJMP RACE\nNEW: LDD 17\nSTO 16\nNEXT: INC IX\nJMP LOOP\nDONE: LDD 16\nSTO 15\nOUT\nEND'
];

/* ================================================================
   3. 支线 · 未送达的补丁 P-1997 (微型汇编题: 补最后三行)
   前 2 行完好: LDD 20 / ADD 21 (把校验和的两半相加)
   使命: 把和存进 30 号格(维修回执槽), OUT 作完工信号, END 安息。
   ================================================================ */
var PATCH_PREFIX='LDD 20\nADD 21';
var PATCH_TESTS=[
  {mem:{20:19,21:23}, out:[42], memCheck:{30:42}},
  {mem:{20:5, 21:8},  out:[13], memCheck:{30:13}}
];
/* 玩家只写最后 3 条指令。返回 {ok,err,failTest} */
function patchRun(playerSrc){
  var pp=parseProgram(playerSrc,null);
  if(pp.err)return {ok:false,err:pp.err,failTest:-1};
  if(pp.prog.length!==3)return {ok:false,err:E('not_three',0,String(pp.prog.length)),failTest:-1};
  var full=PATCH_PREFIX+'\n'+playerSrc;
  for(var i=0;i<PATCH_TESTS.length;i++){
    var tc=PATCH_TESTS[i];
    var r=runProgram(full,{mem:tc.mem,maxSteps:100});
    var ok=!r.err&&r.stopped==='end'&&arrEq(r.out,tc.out);
    if(ok&&tc.memCheck)for(var k in tc.memCheck)if(tc.memCheck.hasOwnProperty(k))
      if(r.mem[+k]!==tc.memCheck[k])ok=false;
    if(!ok)return {ok:false,err:r.err,failTest:i};
  }
  return {ok:true,err:null,failTest:-1};
}

/* ================================================================
   4. 小工具 (与 domain_memory.js 同款)
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

function mk(parent,tag,css,html){
  var d=document.createElement(tag);
  if(css)d.style.cssText=css;
  if(html!=null)d.innerHTML=html;
  if(parent)parent.appendChild(d);
  return d;
}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
var BTN='background:#0a1f0a;color:#7CFC00;border:1px solid #2f6f2f;padding:5px 12px;'+
        'font-family:inherit;font-size:13px;cursor:pointer;letter-spacing:1px;border-radius:2px;';
var BTN_HOT='background:#123f12;color:#7CFC00;border:1px solid #7CFC00;padding:5px 12px;'+
        'font-family:inherit;font-size:14px;cursor:pointer;letter-spacing:1px;border-radius:2px;box-shadow:0 0 8px #2b6;';
var BTN_GOLD='background:#3a2c08;color:#ffce3a;border:1px solid #c9a24a;padding:5px 12px;'+
        'font-family:inherit;font-size:13px;cursor:pointer;letter-spacing:1px;border-radius:2px;';
var TXT='color:#bfeebf;font-size:13px;line-height:1.7;';
var DIM='color:#4a7a4a;font-size:11.5px;';
var K='color:#ffce3a;';
var BOX='border:1px solid #1f3f1f;background:rgba(10,20,10,.45);padding:6px 8px;font-size:11.5px;';

/* 提示系统: 三段递进; '?' 热键; .max() 跳到末段 */
var hintFns={};
function addHints(root,pid,hints){
  var idx=-1;
  var bar=mk(root,'div','margin-top:8px;display:flex;align-items:center;gap:10px;');
  var btn=mk(bar,'button',BTN,'? '+tx('Hint','提示')+' <span style="'+DIM+'">'+tx('(or press ?)','(按 ? 键)')+'</span>');
  var box=mk(root,'div','display:none;margin-top:6px;border:1px dashed #c9a24a;'+
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
/* 失败计数: ≥2 次自动把提示升到末段; 第 3 次递一句台阶(CO-3, 不嘲讽) */
function bumpFail(api,key,pid,consol){
  var n=(FLAG(api,key)||0)+1;SET(api,key,n);
  if(n>=2&&hintFns[pid]&&hintFns[pid].max){
    hintFns[pid].max();
    TOAST(api,B('Hints auto-upgraded — check the gold box (or press ?).',
                '提示已自动升级 —— 看金色框 (或按 ? 键)。'));
  }
  if(n===3&&consol&&!FLAG(api,key+'_co3')){SET(api,key+'_co3');TOAST(api,consol,true);}
  return n;
}
function header(el,title,sub){
  mk(el,'div','color:#9fee9f;letter-spacing:2px;font-size:14px;border-bottom:1px solid #1f3f1f;'+
    'padding-bottom:6px;margin-bottom:8px;',title+
    (sub?' <span style="'+DIM+'float:right;">'+sub+'</span>':''));
}

/* ================================================================
   4b. Primer 前置知识卡 (循序渐进教学层)
   谜题/关卡首次打开先显示概念卡 (可跳过), 之后仍可用 📖 按钮重看。
   primer={title:{en,zh}, body:{en,zh}(html, 允许 <pre>)}
   ================================================================ */
function renderPrimerCard(host,primer){
  var box=mk(host,'div','border:1px solid #c9a24a;background:rgba(40,30,5,.3);padding:10px 12px;margin-bottom:8px;max-width:640px;');
  mk(box,'div','color:#ffce3a;font-size:14px;letter-spacing:1px;margin-bottom:6px;','📖 '+T(primer.title));
  mk(box,'div','font-size:12.5px;line-height:1.7;color:#e8dcc0;',T(primer.body));
  return box;
}
/* 完整的"先示概念卡, 再进正题"页面。dismissKey=首次看过后置的 flag。
   renderRest()=真正渲染谜题内容的函数(dismiss/back 都会调它)。 */
function renderWithPrimer(el,api,primer,dismissKey,reviewFlagName,titleHtml,subHtml,renderRest){
  if(!primer||(FLAG(api,dismissKey)&&!VIEW[reviewFlagName])){renderRest();return;}
  el.innerHTML='';
  var wrap=mk(el,'div','padding:12px 16px;'+TXT);
  header(wrap,titleHtml,subHtml);
  renderPrimerCard(wrap,primer);
  var bar=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;');
  var first=!FLAG(api,dismissKey);
  mk(bar,'button',BTN_GOLD,first?tx('Got it — let\'s go','我懂了, 开始吧'):tx('Back','返回')).onclick=function(){
    SET(api,dismissKey);VIEW[reviewFlagName]=false;renderRest();
  };
}

var TICKNAME=B('Tick the Punch-Clock','打卡钟 Tick');

/* ================================================================
   5. 核心机房终端 —— 选关界面 (Zachtronics 关卡列表)
   ================================================================ */
var VIEW={mode:'select',lv:0,testSel:0,stepK:0,reviewVault:false,reviewLevel:false,reviewPatch:false};

function solvedCount(api){
  var n=0;for(var i=1;i<=8;i++)if(FLAG(api,'asm_lv_'+i))n++;
  return n;
}
/* 整座机房的"开工前"知识卡 (第一次开终端时看), 以及支线补丁的知识卡 */
var VAULT_PRIMER={title:B('Before you start: how does this CPU work?','开始之前: 这块 CPU 是怎么运作的?'),
  body:B(
    '<b>In one line:</b> every instruction goes through the same three-step heartbeat — FETCH it from memory, DECODE what it means, EXECUTE it — over and over, forever. This machine has two registers to work with: ACC (the accumulator — almost everything happens here) and IX (a helper register used for sliding across arrays, from Level 6 onward).<br>'+
    '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
    'FETCH   -&gt; get the next instruction from memory\nDECODE  -&gt; figure out what it means\nEXECUTE -&gt; actually do it\n(repeat)</pre>'+
    '<b>Like:</b> reading a recipe one line at a time — read the next line (fetch), understand what it is asking (decode), do it (execute), then move to the next line. Forever, until END.<br>'+
    '<b>Why you need it here:</b> eight cores, eight new instructions taught one at a time. Every level unlocks the next chunk of this CPU\'s instruction set — you never need to know more than the level in front of you.',
    '<b>一句话:</b> 每一条指令都要走同一套三步心跳: 取指 (FETCH, 从内存取出来) → 译码 (DECODE, 弄懂它是什么意思) → 执行 (EXECUTE, 真的去做)——一遍遍循环, 直到停机。这台机器只有两个寄存器可用: ACC (累加器, 几乎所有事都发生在这里) 和 IX (辅助寄存器, 第 6 关起用来滑过数组)。<br>'+
    '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
    'FETCH(取指)   -&gt; 从内存取出下一条指令\nDECODE(译码)  -&gt; 弄懂它是什么意思\nEXECUTE(执行) -&gt; 真的去做\n(循环)</pre>'+
    '<b>类比:</b> 照着菜谱一行行做菜——读下一行 (取指), 弄懂它要你干嘛 (译码), 动手做 (执行), 再读下一行。一直循环, 直到 END。<br>'+
    '<b>这题用它干嘛:</b> 八颗核心, 一次教你一条新指令。每一关都会解锁这块 CPU 指令集的下一小块——你永远只需要弄懂眼前这一关, 不用管后面的。')};
var PATCH_PRIMER={title:B('What are you finishing here?','这里要你接的是什么?'),
  body:B(
    '<b>In one line:</b> P-1997\'s first two lines already added two numbers together and the sum is sitting in ACC. You just need to finish the job: save it, announce it, and stop.<br>'+
    '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
    '(already run) LDD 20 / ADD 21   ; ACC now holds the sum\nyour turn:    STO 30            ; file the sum in the receipt slot\n              OUT                ; announce it\n              END                ; rest</pre>'+
    '<b>Like:</b> someone hands you a finished calculation and asks you to write the receipt, read the total out loud, and close the till.<br>'+
    '<b>Why you need it here:</b> exactly three lines, exactly three verbs — file (STO), announce (OUT), rest (END).',
    '<b>一句话:</b> P-1997 的前两行已经把两个数加到一起, 和就放在 ACC 里。你只需要收尾: 存好、宣告、停下。<br>'+
    '<pre style="color:#9fee9f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
    '(已经跑完) LDD 20 / ADD 21   ; ACC 现在是总和\n轮到你:    STO 30            ; 把总和归档到回执槽\n           OUT                ; 对外宣告\n           END                ; 休息</pre>'+
    '<b>类比:</b> 有人把算好的总数交给你, 让你写收据、念出总数, 然后关上收银台。<br>'+
    '<b>这题用它干嘛:</b> 正好三行, 正好三个动词——归档 (STO)、宣告 (OUT)、休息 (END)。')};

function renderVault(el,api){
  if(VIEW.mode==='level')return renderLevel(el,api,VIEW.lv);
  if(!FLAG(api,'asm_primer_seen_vault')||VIEW.reviewVault){
    renderWithPrimer(el,api,VAULT_PRIMER,'asm_primer_seen_vault','reviewVault',
      tx('THE CORE VAULT · CPU-9618/8','核心机房 · CPU-9618/8'),'',
      function(){renderVault(el,api);});
    return;
  }
  el.innerHTML='';
  var wrap=mk(el,'div','padding:12px 16px;'+TXT);
  var sc=solvedCount(api);
  var hearts='';
  for(var i=1;i<=8;i++)hearts+=FLAG(api,'asm_lv_'+i)
    ?'<span style="color:#7CFC00;text-shadow:0 0 6px #2b6;">♥</span>'
    :'<span style="color:#233f23;">♥</span>';
  header(wrap,tx('THE CORE VAULT · CPU-9618/8','核心机房 · CPU-9618/8'),
    hearts+' <span style="'+K+'">'+sc+' / 8</span>');
  mk(wrap,'div',DIM+'margin-bottom:8px;',
    sc===0?tx('Eight cores. Eight cardiac chambers. All dark. The punch-clock behind the counter is watching you very hard while pretending to read a logbook.',
              '八颗核心, 八个心室, 全部熄灭。柜台后的打卡钟一边假装看日志, 一边非常用力地看着你。')
    :sc<8?tx('The repaired cores glow like coals. The dark ones wait in dead silence. Somewhere, a punch-clock is counting.',
             '修好的核心烧成暗红的炭。没修的在死寂里等。某个角落, 一台打卡钟在数数。')
    :tx('Eight lights. One heartbeat. The vault hums in 4/4 time.',
        '八盏灯。一次心跳。整座机房以四四拍低鸣。'));

  var grid=mk(wrap,'div','display:grid;grid-template-columns:1fr 1fr;gap:8px;');
  LEVELS.forEach(function(lv,idx){
    var n=lv.n;
    var solved=!!FLAG(api,'asm_lv_'+n);
    var open=(n===1)||!!FLAG(api,'asm_lv_'+(n-1));
    var star=!!FLAG(api,'asm_par_'+n);
    var best=FLAG(api,'asm_best_'+n);
    var col=solved?'#7CFC00':(open?'#9fee9f':'#2f4f2f');
    var card=mk(grid,'div','border:1px solid '+(solved?'#2f6f2f':'#1f3f1f')+
      ';background:rgba(10,20,10,.5);padding:7px 10px;cursor:'+(open?'pointer':'default')+
      ';'+(solved?'box-shadow:inset 0 0 12px rgba(40,120,40,.25);':''));
    card.innerHTML=
      '<div style="font-size:10.5px;letter-spacing:1px;color:'+(solved?'#5aa05a':'#3a5a3a')+';">'+
        esc(lv.core)+' '+(solved?'· <span style="color:#7CFC00">ONLINE</span>':(open?'· OFFLINE':'· <span style="color:#233f23">SEALED</span>'))+
      '</div>'+
      '<div style="color:'+col+';font-size:13px;margin:2px 0;">'+
        (open?'':'🔒 ')+T(lv.title)+(star?' <span style="'+K+'">★</span>':'')+
      '</div>'+
      '<div style="'+DIM+'">'+
        (solved?tx('best ','最短 ')+best+tx(' instr · PAR ',' 条 · PAR ')+lv.par+(star?tx(' · optimal!',' · 最优解!'):'')
               :(open?tx('PAR ','PAR ')+lv.par+tx(' instructions',' 条指令')
                     :tx('repair the previous core first','先修好上一颗核心')))+
      '</div>'+
      (open&&lv.concept?'<div style="color:#c9a24a;font-size:10px;margin-top:2px;">📖 '+
        tx('new concept: ','本关新概念: ')+T(lv.concept)+'</div>':'');
    if(open)card.onclick=function(){
      S(api,'ui');VIEW.mode='level';VIEW.lv=idx;VIEW.testSel=0;VIEW.stepK=0;
      renderVault(el,api);
    };
  });

  var foot=mk(wrap,'div','margin-top:10px;display:flex;gap:10px;align-items:center;');
  mk(foot,'button',BTN,tx('Leave (Esc)','离开 (Esc)')).onclick=function(){try{api.closePanel();}catch(e){}};
  mk(foot,'button',BTN,tx('📖 How this CPU works','📖 这块 CPU 怎么运作')).onclick=function(){
    VIEW.reviewVault=true;renderVault(el,api);};
  mk(foot,'div',DIM,tx('Tip: each repaired core unlocks new instructions on the next terminal.',
                       '提示: 每修好一颗核心, 下一台终端就会亮起新的指令。'));
}

/* ---------------- 单关界面 ---------------- */
function fmtErr(err){return err?esc(T(err)):'';}
function renderLevel(el,api,idx){
  var lv0=LEVELS[idx],n0=lv0.n;
  var primerKey='asm_primer_seen_lv_'+n0;
  if(lv0.primer&&(!FLAG(api,primerKey)||VIEW.reviewLevel)){
    renderWithPrimer(el,api,lv0.primer,primerKey,'reviewLevel',
      esc(lv0.core)+' · '+T(lv0.title),tx('CONCEPT CARD','知识卡'),
      function(){renderLevel(el,api,idx);});
    return;
  }
  el.innerHTML='';
  var lv=LEVELS[idx],n=lv.n;
  var solved=!!FLAG(api,'asm_lv_'+n);
  /* CO-5 · Boss 前的一拍安静: 二十年只当记录员的 Tick 头一回破了自己的规矩 */
  if(n===8&&!solved&&!FLAG(api,'asm_boss_hush')){
    SET(api,'asm_boss_hush');
    TOAST(api,B('[07:12:40] The punch-clock has gone quiet. For the first time in twenty years, it speaks before it stamps. "…This is the one core I never clocked. When CORE-08 stopped, so did I — for half a second. I never filed that half-second anywhere. Go on. This one I just want to watch."',
                '[07:12:40] 打卡钟静了下来。二十年来头一回, 它说话之前没有先盖章。「……这颗核心, 我从没打过卡。CORE-08 停跳的那一刻, 我也停了——停了半秒。那半秒, 我从没往任何地方归档过。上吧。这一颗, 我只想看着。」'),true);
  }
  var wrap=mk(el,'div','padding:10px 14px;'+TXT);
  header(wrap,esc(lv.core)+' · '+T(lv.title),
    'PAR '+lv.par+(FLAG(api,'asm_par_'+n)?' <span style="'+K+'">★</span>':''));

  /* Tick 的死亡记录 (环境叙事) */
  mk(wrap,'div','border-left:2px solid #c9a24a;padding:2px 10px;margin-bottom:6px;'+
    'color:#c9b06a;font-size:11.5px;line-height:1.6;font-style:italic;',T(lv.story));
  mk(wrap,'div','margin-bottom:8px;font-size:12.5px;',
    '<span style="'+K+'">'+tx('GOAL','目标')+'</span> — '+T(lv.goal));

  var row=mk(wrap,'div','display:flex;gap:10px;align-items:stretch;');
  /* 左: 编辑器 */
  var left=mk(row,'div','flex:1.05;display:flex;flex-direction:column;gap:6px;min-width:240px;');
  var ta=mk(left,'textarea','flex:1;min-height:238px;background:#060d06;color:#aef0ae;'+
    'border:1px solid #1f3f1f;font-family:inherit;font-size:12.5px;line-height:1.55;'+
    'padding:8px;resize:vertical;outline:none;');
  ta.spellcheck=false;
  ta.value=FLAG(api,'asm_src_'+n)||tx('; write your program here\n; labels:  LOOP: ...\n',
                                      '; 在这里写程序\n; 标签写法:  LOOP: ...\n');
  ta.oninput=function(){VIEW.stepK=0;};
  var bar=mk(left,'div','display:flex;gap:6px;flex-wrap:wrap;');
  var runB=mk(bar,'button',BTN_HOT,tx('RUN ▸▸ all tests','运行 ▸▸ 全部用例'));
  var stepB=mk(bar,'button',BTN,tx('STEP ▸','单步 ▸'));
  var rstB=mk(bar,'button',BTN,'⟲');
  var backB=mk(bar,'button',BTN,tx('◂ CORES','◂ 核心列表'));
  if(lv.primer)mk(bar,'button',BTN,tx('📖 Concept','📖 知识卡')).onclick=function(){
    saveSrc();VIEW.reviewLevel=true;renderLevel(el,api,idx);};

  /* 右: 指令表 / 用例 / CPU 状态 */
  var right=mk(row,'div','flex:1;display:flex;flex-direction:column;gap:6px;min-width:250px;');
  var opsBox=mk(right,'div',BOX+'max-height:118px;overflow-y:auto;');
  var oh='<b style="color:#9fee9f;font-size:10.5px;letter-spacing:1px;">'+
    tx('INSTRUCTIONS ONLINE','已通电指令')+' '+lv.ops.length+'/'+Object.keys(OPSPEC).length+'</b>';
  lv.ops.forEach(function(op){
    var isNew=lv.newOps.indexOf(op)>=0;
    oh+='<div style="'+(isNew?'color:#ffce3a;':'color:#8fbf8f;')+'font-size:11px;">'+
      (isNew?'<b style="background:#3a2c08;padding:0 3px;">NEW</b> ':'')+
      '<b>'+op+'</b> — '+T(OPDOC[op])+'</div>';
  });
  opsBox.innerHTML=oh;

  var testBox=mk(right,'div',BOX);
  var cpuBox=mk(right,'div',BOX+'flex:1;');
  var status=mk(wrap,'div','min-height:18px;margin-top:6px;font-size:12px;color:#5a8a5a;');
  var result=mk(wrap,'div','');

  function testChip(tc,used){
    var h='';
    if(tc.inputs&&tc.inputs.length){
      h+='<span style="'+DIM+'">IN:</span> ';
      tc.inputs.forEach(function(v,i){
        h+='<span style="border:1px solid '+(i<used?'#233f23':'#2f6f2f')+';padding:0 5px;margin-right:3px;'+
          (i<used?'color:#2f4f2f;text-decoration:line-through;':'color:#ffce3a;')+'">'+v+'</span>';
      });
    }
    if(tc.mem){
      h+=' <span style="'+DIM+'">MEM:</span> <span style="color:#8fbf8f">';
      var parts=[];for(var k in tc.mem)if(tc.mem.hasOwnProperty(k))parts.push('['+k+']='+tc.mem[k]);
      h+=parts.join(' ')+'</span>';
    }
    h+=' <span style="'+DIM+'">→ OUT:</span> <span style="color:#7CFC00">'+tc.out.join(' ')+'</span>';
    if(tc.memCheck){
      var mp=[];for(var m2 in tc.memCheck)if(tc.memCheck.hasOwnProperty(m2))mp.push('['+m2+']='+tc.memCheck[m2]);
      h+=' <span style="'+DIM+'">&amp; '+mp.join(' ')+'</span>';
    }
    return h;
  }
  function drawTests(marks,usedIn){
    var h='<b style="color:#9fee9f;font-size:10.5px;letter-spacing:1px;">'+
      tx('TEST CASES (all must pass)','测试用例 (全过才算解)')+'</b>';
    lv.tests.forEach(function(tc,i){
      var mark=marks?(marks[i]?'<span style="color:#7CFC00">✓</span>':'<span style="color:#ff8080">✗</span>'):'·';
      var sel=(i===VIEW.testSel);
      h+='<div class="asmTC" data-i="'+i+'" style="cursor:pointer;padding:1px 3px;'+
        (sel?'background:rgba(40,80,40,.35);border-left:2px solid #7CFC00;':'border-left:2px solid transparent;')+
        '">'+mark+' T'+(i+1)+' — '+testChip(tc,(sel&&usedIn!=null)?usedIn:0)+'</div>';
    });
    h+='<div style="'+DIM+'margin-top:2px;">'+tx('click a case to select it for STEP debugging','点击用例可选中给「单步」调试用')+'</div>';
    testBox.innerHTML=h;
    var chips=testBox.querySelectorAll('.asmTC');
    for(var c=0;c<chips.length;c++)chips[c].onclick=function(){
      VIEW.testSel=+this.getAttribute('data-i');VIEW.stepK=0;
      drawTests(marks,null);drawCPU(null);
    };
  }
  function drawCPU(r){
    var h='<b style="color:#9fee9f;font-size:10.5px;letter-spacing:1px;">CPU · '+
      tx('REGISTERS & MEMORY','寄存器与内存')+'</b>';
    if(!r){h+='<div style="'+DIM+'">'+tx('(run or step to see the machine breathe)','(运行或单步, 看机器呼吸)')+'</div>';cpuBox.innerHTML=h;return;}
    h+='<div style="color:#ffce3a;font-size:12.5px;margin:2px 0;">ACC '+r.acc+
       ' &nbsp; IX '+r.ix+' &nbsp; FLAG '+(r.flag===null?'—':(r.flag?'EQ':'NE'))+
       ' &nbsp; <span style="'+DIM+'">'+tx('cycles ','周期 ')+r.steps+'</span></div>';
    h+='<div style="display:grid;grid-template-columns:repeat(8,1fr);gap:1px;margin:3px 0;">';
    for(var i=0;i<MEMSIZE;i++){
      h+='<div style="border:1px solid #163016;font-size:9px;text-align:center;color:'+
        (r.mem[i]?'#9fee9f':'#2f4f2f')+';padding:0;"><span style="color:#2f4f2f">'+i+'</span><br>'+r.mem[i]+'</div>';
    }
    h+='</div>';
    h+='<div style="font-size:11.5px;"><span style="'+DIM+'">OUT:</span> <span style="color:#7CFC00">'+
      (r.out.length?r.out.join(' '):tx('(nothing yet)','(还没有输出)'))+'</span></div>';
    cpuBox.innerHTML=h;
  }

  drawTests(null,null);drawCPU(null);

  function saveSrc(){SET(api,'asm_src_'+n,ta.value);}
  backB.onclick=function(){saveSrc();S(api,'ui');VIEW.mode='select';renderVault(el,api);};
  rstB.onclick=function(){VIEW.stepK=0;status.textContent=tx('Step counter reset.','单步计数已归零。');
    status.style.color='#5a8a5a';drawCPU(null);drawTests(null,null);};

  stepB.onclick=function(){
    saveSrc();
    VIEW.stepK++;
    var tc=lv.tests[VIEW.testSel];
    var r=runProgram(ta.value,{mem:tc.mem,inputs:tc.inputs,maxSteps:VIEW.stepK,ops:lv.ops});
    S(api,'step');
    drawCPU(r);drawTests(null,r.inPtr);
    if(r.err){status.innerHTML='<span style="color:#ff8080">✗ '+fmtErr(r.err)+'</span>';S(api,'err');}
    else if(r.stopped==='end')status.innerHTML='<span style="color:#7CFC00">'+
      tx('Halted clean (END) after ','END 停机, 共 ')+r.steps+tx(' cycles.',' 个周期。')+'</span>';
    else status.innerHTML=tx('T','用例 T')+(VIEW.testSel+1)+' · '+tx('cycle ','周期 ')+r.steps+
      (r.nextLn?(' · '+tx('next: line ','下一步: 第 ')+r.nextLn+tx('','') ):'');
  };

  runB.onclick=function(){
    saveSrc();VIEW.stepK=0;
    var chk=checkLevel(idx,ta.value);
    var marks=chk.results.map(function(x){return x.ok;});
    var showR=null;
    for(var i2=0;i2<chk.results.length;i2++)if(!chk.results[i2].ok){showR=chk.results[i2];VIEW.testSel=i2;break;}
    if(!showR)showR=chk.results[chk.results.length-1];
    drawTests(marks,showR.r.inPtr);drawCPU(showR.r);
    result.innerHTML='';
    if(chk.pass){S(api,'ok');onSolved(chk);}
    else{
      S(api,'err');
      var f=showR;
      var msg;
      if(f.why==='err')msg='✗ T'+(f.i+1)+': '+fmtErr(f.err);
      else if(f.why==='loop')msg='✗ T'+(f.i+1)+': '+tx((lv.maxSteps||500)+' cycles and still running — infinite loop guard tripped. Check your jump conditions.',
        '跑了 '+(lv.maxSteps||500)+' 个周期还没停 —— 死循环保护触发。检查跳转条件。');
      else if(f.why==='mem')msg='✗ T'+(f.i+1)+': '+tx('OUT is right but memory isn\'t — check what you were asked to STO, and where.',
        'OUT 对了但内存不对 —— 检查题目要 STO 到哪一格。');
      else msg='✗ T'+(f.i+1)+': '+tx('expected OUT [','期望 OUT [')+lv.tests[f.i].out.join(' ')+
        tx('], got [','], 实际 [')+(f.got.length?f.got.join(' '):'')+']';
      status.innerHTML='<span style="color:#ff8080">'+msg+'</span>';
      bumpFail(api,'asm_fail_'+n,'asm_lv_'+n,B(
        '[log] Tick, quietly, off the record: "Somebody stalled at this exact core once — a whole night. I clocked that too. …I moved your hint down to its plainest line. In the record, this does not count against you."',
        '[记录] 打卡钟 Tick 很轻地、不进记录地说: 「有人也在这颗核心前卡过——卡了一整晚。那次我也打了卡。……我把你的提示挪到最直白那一段了。记录里, 这一条不算在你头上。」'));
    }
  };

  function onSolved(chk){
    var star=chk.instr<=lv.par;
    var first=!FLAG(api,'asm_lv_'+n);
    var best=FLAG(api,'asm_best_'+n);
    if(best==null||chk.instr<best)SET(api,'asm_best_'+n,chk.instr);
    status.innerHTML='<span style="color:#7CFC00;font-size:13px;">✓ '+
      tx('ALL TESTS PASS','全部用例通过')+'</span>';
    var rh='<div style="border:1px solid #2f6f2f;background:rgba(10,30,10,.6);padding:8px 12px;margin-top:6px;">'+
      '<span style="color:#7CFC00;">◈ CORE-0'+n+' ONLINE</span> &nbsp; '+
      '<span style="'+K+'">['+chk.instr+' '+tx('instr','条指令')+' | '+chk.cycles+' '+tx('cycles','周期')+']</span>'+
      ' &nbsp;<span style="'+DIM+'">PAR '+lv.par+'</span> ';
    if(star){
      rh+='<span style="'+K+'">★ '+tx('OPTIMAL','最优解')+'</span>';
      if(!FLAG(api,'asm_par_'+n)){
        SET(api,'asm_par_'+n);
        TOAST(api,B('★ Optimal solution — CORE-0'+n+' purrs. The punch-clock stamps your card twice.',
                    '★ 最优解 —— CORE-0'+n+' 发出满足的嗡鸣。打卡钟给你的卡盖了两个章。'),true);
      }
    }else{
      rh+='<span style="'+DIM+'">'+tx('match PAR for the ★ badge — shorter is possible.',
                                      '打平 PAR 可得 ★ 徽章 —— 还能更短。')+'</span>';
    }
    rh+='</div>';
    result.innerHTML=rh;
    if(first){
      SET(api,'asm_lv_'+n);
      if(n===8){finale(api);return;}
      S(api,'quest');
      TOAST(api,B('◈ CORE-0'+n+' ONLINE — '+solvedCount(api)+' / 8 ◈','◈ CORE-0'+n+' 上线 —— '+solvedCount(api)+' / 8 ◈'),true);
      if(n===4)STEP(api,'asm_m2');
      if(lv.done&&T(lv.done)){
        var nb=mk(result,'div','border-left:2px solid #c9a24a;padding:2px 10px;margin-top:6px;'+
          'color:#c9b06a;font-size:11.5px;line-height:1.6;font-style:italic;',
          '<b>Tick</b> — '+T(lv.done));
      }
      var nx=mk(result,'div','margin-top:6px;');
      mk(nx,'button',BTN_GOLD,tx('Next core ▸','下一颗核心 ▸')).onclick=function(){
        saveSrc();VIEW.mode='select';renderVault(el,api);
      };
    }else if(lv.done&&T(lv.done)){
      /* 重解优化时不再刷剧情 */
    }
  }

  addHints(wrap,'asm_lv_'+n,lv.hints);
  if(solved)mk(wrap,'div',DIM+'margin-top:4px;',
    tx('Core already online — this terminal stays open for golfing.','核心已上线 —— 终端保持开放, 欢迎继续缩短指令数。'));
}

/* ---------------- 第 8 关 · 心跳恢复大演出 ---------------- */
function finale(api){
  try{
    api.scene([
      {run:function(){try{api.closePanel();}catch(e){}}},
      {glitch:0.9,ms:800},
      {wait:450},
      {toast:B('◈ CORE-08 ONLINE — 8 / 8 ◈','◈ CORE-08 上线 —— 8 / 8 ◈'),long:true},
      {wait:900},
      {sfx:'quest'},
      {say:{name:TICKNAME,text:B('[02:47:11] …Listen. No — put the tools down. <span class="k">Listen.</span>',
        '[02:47:11] ……听。别 —— 先把工具放下。<span class="k">听。</span>')}},
      {say:{name:TICKNAME,text:B('Thump. <span class="dim">(tick)</span> Thump. <span class="dim">(tick)</span> Twenty years I have punched cards into silence, always half a beat ahead of nothing. And now — <span class="k">my tick just landed ON the beat.</span> First time. First time in 7,289 days my clock and this machine agree what time it is.',
        '咚。<span class="dim">(嗒)</span> 咚。<span class="dim">(嗒)</span> 二十年, 我往寂静里打卡, 永远比「空无」抢半拍。而现在 —— <span class="k">我的嗒, 第一次落在了心跳上。</span>第一次。7289 天来, 我的钟和这台机器第一次对「现在几点」达成了一致。')}},
      {glitch:0.5,ms:420},
      {sfx:'tp'},
      {toast:B('◈ THE CORE VAULT · HEARTBEAT RESTORED ◈ eight chambers, one rhythm','◈ 核心机房 · 心跳恢复 ◈ 八室一律'),long:true},
      {wait:600},
      {say:{name:TICKNAME,text:B('[02:47:12] Time of resuscitation: logged. Attending engineer: you. …My clearance says "recorder". I record. So let the record show: <span class="k">the machine\'s heart stopped for twenty years, and somebody came.</span> Punch out whenever you like. This shift is over.',
        '[02:47:12] 复苏时刻: 已记录。主治工程师: 你。……我的权限等级写着「记录员」。我负责记录。那就让记录写明: <span class="k">这台机器的心脏停了二十年, 然后, 有人来了。</span>什么时候下班都行。这一班, 结束了。')}},
      {run:function(){
        SET(api,'asm_heart');
        STEP(api,'asm_m3');
      }}
    ]);
  }catch(e){
    /* 无演出环境时的兜底 */
    SET(api,'asm_heart');STEP(api,'asm_m3');
    TOAST(api,B('◈ THE CORE VAULT · HEARTBEAT RESTORED ◈','◈ 核心机房 · 心跳恢复 ◈'),true);
  }
}

/* ================================================================
   6. 支线谜题 · 未送达的补丁 (P-1997 的最后三行)
   ================================================================ */
function renderPatch(el,api){
  if(!FLAG(api,'asm_patch_done')&&FLAG(api,'asm_patch_met')&&FLAG(api,'asm_lv_2')&&
     (!FLAG(api,'asm_primer_seen_patch')||VIEW.reviewPatch)){
    renderWithPrimer(el,api,PATCH_PRIMER,'asm_primer_seen_patch','reviewPatch',
      tx('The Undelivered Patch · last three lines','未送达的补丁 · 最后三行'),'P-1997',
      function(){renderPatch(el,api);});
    return;
  }
  el.innerHTML='';
  var wrap=mk(el,'div','padding:12px 16px;max-width:600px;'+TXT);
  header(wrap,tx('The Undelivered Patch · last three lines','未送达的补丁 · 最后三行'),'P-1997');

  if(FLAG(api,'asm_patch_done')){
    mk(wrap,'div','',
      tx('An empty coil of cable where the patch used to sit. On the floor, printed in dot-matrix, one line:<br>'+
         '<span style="'+K+'">DELIVERED. 7,289 days late. Recipient: still grateful.</span>',
         '补丁蜷过的地方只剩一圈空电缆。地上有一行点阵打印的小字:<br>'+
         '<span style="'+K+'">已送达。迟了 7289 天。收件核心: 仍然感谢。</span>'));
    mk(mk(wrap,'div','margin-top:8px;'),'button',BTN,tx('Leave','离开')).onclick=function(){try{api.closePanel();}catch(e){}};
    return;
  }
  if(!FLAG(api,'asm_patch_met')){
    mk(wrap,'div','',
      tx('A ball of old code lies curled around a cable, breathing in 300-baud wheezes. It seems to be trying to say something.<br>'+
         '<span style="'+DIM+'">(Talk to P-1997 first — it is right beside you.)</span>',
         '一团旧代码蜷在电缆上, 以 300 波特的频率喘息。它好像想说什么。<br>'+
         '<span style="'+DIM+'">(先和它说话 —— P-1997 就在旁边。)</span>'));
    mk(mk(wrap,'div','margin-top:8px;'),'button',BTN,tx('Step back','退开')).onclick=function(){try{api.closePanel();}catch(e){}};
    return;
  }
  if(!FLAG(api,'asm_lv_2')){
    mk(wrap,'div','',
      tx('You look at the patch\'s exposed body — LDD, ADD… The words swim. You don\'t read this dialect yet.<br>'+
         '<span style="'+DIM+'">(Repair CORE-02 first: learn LDD / STO at the vault terminal.)</span>',
         '你看着补丁裸露的身体 —— LDD、ADD…… 字在眼前游动。你还读不懂这种方言。<br>'+
         '<span style="'+DIM+'">(先修好 CORE-02: 在机房终端学会 LDD / STO。)</span>'));
    mk(mk(wrap,'div','margin-top:8px;'),'button',BTN,tx('Step back','退开')).onclick=function(){try{api.closePanel();}catch(e){}};
    return;
  }

  mk(wrap,'div','',
    tx('P-1997\'s job order, faded but legible: <span style="'+K+'">"add the two checksum halves at cells 20 and 21; '+
       'file the total in cell 30 (the repair-receipt slot); announce it (OUT); then rest (END)."</span><br>'+
       'Its first two lines still run warm. The last three were corroded away. It cannot see its own ending — you must write it.',
       'P-1997 的工单, 褪色但可读: <span style="'+K+'">「把 20、21 号格里的两半校验和相加; '+
       '把总和归档到 30 号格 (维修回执槽); 对外宣告 (OUT); 然后休息 (END)。」</span><br>'+
       '它的前两行还温热。最后三行被电蚀掉了。它看不见自己的结尾 —— 结尾得由你来写。'));

  mk(wrap,'pre','background:rgba(10,25,10,.5);border:1px solid #1f3f1f;padding:6px 10px;'+
    'color:#9fee9f;font-size:12px;margin:8px 0 4px;line-height:1.5;',
    esc(PATCH_PREFIX)+'\n<span style="color:#3a5a3a">; ── '+tx('3 lines missing ──','缺 3 行 ──')+'</span>');

  var ta=mk(wrap,'textarea','width:100%;box-sizing:border-box;height:64px;background:#060d06;'+
    'color:#ffce3a;border:1px dashed #c9a24a;font-family:inherit;font-size:12.5px;padding:6px 10px;'+
    'line-height:1.5;resize:none;outline:none;');
  ta.spellcheck=false;
  ta.value=FLAG(api,'asm_src_patch')||'';
  var status=mk(wrap,'div','min-height:18px;margin-top:6px;font-size:12px;color:#ffce3a;');
  var bar=mk(wrap,'div','margin-top:4px;display:flex;gap:8px;');
  mk(bar,'button',BTN_HOT,tx('Run its last three lines','替它跑完最后三行')).onclick=function(){
    SET(api,'asm_src_patch',ta.value);
    var r=patchRun(ta.value);
    if(!r.ok){
      S(api,'err');
      bumpFail(api,'asm_fail_patch','asm_patch',B(
        'P-1997, gently: "I got my own ending wrong more times than you ever will. …It is three lines. Take the plainest hint and let me hear each one land. I am not going anywhere — I have practice at waiting."',
        '补丁 P-1997 轻声说: 「我自己的结尾, 写错的次数比你这辈子会犯的还多。……就三行。用最直白的提示, 让我听着每一行落位。我哪儿也不去——等这件事, 我熟。」'));
      status.innerHTML='✗ '+(r.err?fmtErr(r.err)
        :tx('The patch shivers — checksum test #'+(r.failTest+1)+' failed. (Cell 30 must hold the sum; OUT once; END.)',
            '补丁抖了一下 —— 校验用例 #'+(r.failTest+1)+' 没过。(30 号格要放总和; OUT 一次; END。)'));
      return;
    }
    S(api,'quest');
    SET(api,'asm_patch_done');
    STEP(api,'asm_s2');
    GIVE(api,'patch_receipt',B('Delivery Receipt · 20 Years Late','迟到 20 年的送达回执'));
    TOAST(api,B('◈ P-1997 finished its run. Exit status 0. It dissolves into warm, sorted bytes. ◈',
                '◈ P-1997 跑完了。exit status 0。它散成一把温热而有序的字节。◈'),true);
    renderPatch(el,api);
  };
  mk(bar,'button',BTN,tx('Leave','离开')).onclick=function(){SET(api,'asm_src_patch',ta.value);try{api.closePanel();}catch(e){}};
  mk(bar,'button',BTN,tx('📖 Concept','📖 知识卡')).onclick=function(){
    SET(api,'asm_src_patch',ta.value);VIEW.reviewPatch=true;renderPatch(el,api);};

  addHints(wrap,'asm_patch',[
    B('The order says: file the total (STO somewhere), announce (OUT), rest (END). Three verbs, three lines.',
      '工单说: 归档 (STO 到某格)、宣告 (OUT)、休息 (END)。三个动词, 三行。'),
    B('When your three lines begin, ACC already holds the sum — the first two lines did the adding.',
      '你的三行开始时, ACC 里已经是总和了 —— 前两行做完了加法。'),
    B('STO 30 / OUT / END.','STO 30 / OUT / END。')
  ]);
}

/* ================================================================
   7. NPC 对话
   ================================================================ */

/* 打卡钟 Tick —— 记录员 daemon, 每句话带时间戳。
   看着八颗核心一颗颗熄灭 20 年, 有记录权, 没有维修权。 */
function tickDialog(api){
  var SP=TICKNAME;
  var sc=solvedCount(api);
  var fixed={sp:SP,t:B(
    '<span class="dim">(Behind the counter stands an old punch-clock on two brass legs. '+
    'Its face is a dial; its voice is a stamp. Every sentence arrives pre-timestamped.)</span><br>'+
    '[--:--:--] Identify yourself for the record. …No, don\'t bother. The record can see you fine.',
    '<span class="dim">(柜台后站着一台装了两条黄铜腿的老式打卡钟。'+
    '它的脸是表盘, 声音是盖章。每句话出口前都先盖好了时间戳。)</span><br>'+
    '[--:--:--] 请报上姓名以便记录。……算了, 不用。记录看得见你。')};

  if(!FLAG(api,'asm_met_tick')){
    var nodes=[
      fixed,
      {sp:SP,t:B(
        '[00:00:04] I am the shift clock of the Core Vault. Clearance level: <span class="k">RECORDER</span>. '+
        'I may observe. I may log. I may not touch. For twenty years that distinction has been… educational.',
        '[00:00:04] 我是核心机房的值班钟。权限等级: <span class="k">记录员 (RECORDER)</span>。'+
        '可以看, 可以记, 不可以碰。整整二十年, 这条界线教会了我很多。……大多是我不想学的。')},
      {sp:SP,t:B(
        '[00:00:09] Eight cores in this vault. Eight chambers of one heart. They went dark one at a time — '+
        'I stood right here and clocked every death in. Day 193. Day 1,377. Day 2,891… '+
        '<span class="dim">I can recite the whole list. Please don\'t ask me to. I will do it anyway at some point.</span>',
        '[00:00:09] 机房里八颗核心, 是一颗心脏的八个心室。它们一颗一颗熄灭 —— '+
        '我就站在这里, 给每一次死亡打了卡。第 193 天。第 1377 天。第 2891 天……'+
        '<span class="dim">整张名单我背得出来。请别让我背。反正我迟早会自己背起来。</span>')},
      {sp:SP,t:B(
        '[00:00:11] And one card I never finished stamping. The last instruction ever issued here made it two stages down the pipeline — fetched, decoded. The execute tick never came. '+
        '<span class="dim">I have held that half-stamped card for twenty years. Regulations close a record on the execute tick. So the record is still open. So am I.</span>',
        '[00:00:11] 还有一张我没盖完的卡。这里发出的最后一条指令, 在流水线上走了两站——取了指, 译了码。执行那一拍, 一直没有来。'+
        '<span class="dim">这张盖了一半的卡, 我举了二十年。规程说, 记录要在执行拍落卡。所以这条记录还开着。所以我也还开着。</span>')},
      {sp:SP,t:B(
        '[00:00:15] You, though. You walked in through the front door, which means the system issued you '+
        '<span class="k">write access</span>. Maintenance clearance. The thing I have queued a request for, every midnight, 7,289 times.<br>'+
        'The terminal is in the middle of the hall. The cores will teach you their own language, one instruction at a time.',
        '[00:00:15] 而你。你是从正门走进来的 —— 说明系统给你发了<span class="k">写权限</span>。维修权限。'+
        '那个我每个午夜都申请一次、一共申请了 7289 次的东西。<br>'+
        '终端在大厅正中。核心们会亲自教你它们的语言 —— 一次一条指令。'),choices:[
        {t:B('I\'ll bring the heartbeat back.','我去把心跳修回来。'),next:4},
        {t:B('Why do you keep clocking in for a dead machine?','机器都停了, 你为什么还在打卡?'),next:5}
      ]},
      {sp:SP,t:B(
        '[00:00:22] Then the record will note: <span class="k">"repair commenced."</span> '+
        'I have waited a very long time to file something under that heading.<br>'+
        '<span class="dim">(quietly, almost off the record)</span> Start with CORE-01. It died first. It should wake first. Fair is fair.',
        '[00:00:22] 那么记录在案: <span class="k">「维修, 开始。」</span>'+
        '这个条目, 我等了很久才等到往里面归档的东西。<br>'+
        '<span class="dim">(很轻, 几乎不进记录)</span> 从 CORE-01 开始吧。它最先死, 就该最先醒。这才公平。'),next:-1},
      {sp:SP,t:B(
        '[00:00:22] Because a stopped machine and an unrecorded machine are two different tragedies, '+
        'and the second one is preventable.<br>'+
        '<span class="dim">(Its stamp arm twitches.)</span> Somebody must keep the time of no time at all. That somebody has been me.',
        '[00:00:22] 因为「机器停了」和「机器停了却无人记录」是两场不同的悲剧 —— '+
        '第二场是可以避免的。<br>'+
        '<span class="dim">(它的盖章臂抽动了一下)</span> 总得有人为「没有时间」守时。这个人一直是我。'),next:-1}
    ];
    nodes.onEnd=function(){SET(api,'asm_met_tick');STEP(api,'asm_m1');};
    return nodes;
  }

  if(FLAG(api,'asm_heart')){
    var done=[fixed,
      {sp:SP,t:B(
        '[NOW] That is what my timestamps say these days. Not elapsed-since-shutdown. Just: <span class="k">now</span>. '+
        'Eight chambers, one rhythm, and a clock that finally ticks <i>with</i> something instead of <i>at</i> it.',
        '[现在] 这几天我的时间戳都这么写。不再是「停机后第几秒」, 就只是: <span class="k">现在</span>。'+
        '八个心室, 一个节律 —— 而这台钟, 终于是在「和」什么一起走, 而不是「对着」什么走。')},
      {sp:SP,t:B(
        '[NOW+3s] For the record — and this line I am filing under <span class="k">assets</span> — '+
        'the heart of this machine stopped for twenty years, and somebody came. Shift over. '+
        '<span class="dim">…I think I will clock in tomorrow anyway. Habit. The good kind, now.</span>',
        '[现在+3秒] 记录在案 —— 这一条我归在<span class="k">资产</span>栏 —— '+
        '这台机器的心脏停了二十年, 然后, 有人来了。这一班结束了。'+
        '<span class="dim">……不过我想, 明天我还是会来打卡。习惯而已。从今往后, 是好的那种。</span>'),next:-1}];
    if(FLAG(api,'asm_patch_done'))done.splice(2,0,
      {sp:SP,t:B(
        '[NOW+2s] Also in the record: P-1997, delivered. 7,289 days late, exit status 0. '+
        'You know, I clocked that patch IN, twenty years ago. Tonight I finally got to clock it <span class="k">out</span>.',
        '[现在+2秒] 记录里还有一条: P-1997, 已送达。迟到 7289 天, exit status 0。'+
        '你知道吗, 二十年前是我给那个补丁打的上班卡。今晚, 我终于给它打上了<span class="k">下班卡</span>。')});
    return done;
  }

  if(sc>=4){
    return [fixed,
      {sp:SP,t:B(
        '[+00:04:0'+sc+'] '+sc+' of 8. The vault is half-warm. I have started making <span class="k">clerical errors</span> — '+
        'stamped one card twice, stamped one upside down. I checked my own gears. Nothing is wrong with my gears. '+
        '<span class="dim">I believe this is what hope does to precision instruments.</span>',
        '[+00:04:0'+sc+'] 8 颗修好 '+sc+' 颗。机房暖了一半。我开始出<span class="k">文书错误</span>了 —— '+
        '一张卡盖了两次章, 一张盖倒了。我检查过自己的齿轮, 齿轮没有任何问题。'+
        '<span class="dim">我怀疑这就是「希望」对精密仪器的作用。</span>')},
      {sp:SP,t:B(
        'The deepest cores are the oldest dialect: pointers on the mill\'s shelves, and at the very end — the pacemaker. '+
        'When you get there… <span class="k">work slowly.</span> Not for safety. I just want to hear the first beat arrive on a clean second.',
        '越深处的核心讲越老的方言: 工坊货架上的指针, 还有最里面的 —— 心脏起搏器。'+
        '走到那儿的时候……<span class="k">修慢一点。</span>不是为了安全。我只是想让第一声心跳, 落在一个干净的整秒上。'),next:-1}];
  }
  if(sc>=1){
    return [fixed,
      {sp:SP,t:B(
        '[+00:0'+sc+':11] '+sc+' core'+(sc>1?'s':'')+' back online. Noted, filed, and — off the record — '+
        '<span class="k">heard</span>. The vault sounds different already. Less like a warehouse. More like a ward at night.',
        '[+00:0'+sc+':11] '+sc+' 颗核心重新上线。已记录, 已归档, 以及 —— 不进记录地说 —— '+
        '<span class="k">已听见</span>。机房的声音已经变了。不太像仓库了, 更像深夜的病房。')},
      {sp:SP,t:B(
        'One more entry while you are here. South-east corner, by the cable drum: a repair patch, '+
        '<span class="k">P-1997</span>, dispatched twenty years ago, never arrived. It is still trying to finish. '+
        '<span class="dim">I cannot help it — recorder clearance. But you carry a pen with write access.</span>',
        '趁你在, 再补一条。东南角, 电缆盘旁边: 一个二十年前派出的修复补丁, <span class="k">P-1997</span>, '+
        '一直没送达。它到现在还想把活干完。'+
        '<span class="dim">我帮不了它 —— 记录员权限。但你手里那支笔, 是有写权限的。</span>'),next:-1}];
  }
  return [fixed,
    {sp:SP,t:B(
      '[+00:00:41] The terminal is waiting, centre of the hall. CORE-01 first — the echo core. '+
      'Its whole art was: <span class="k">what comes in, goes out.</span> Twenty years ago every apprentice learned that in sixty seconds. '+
      '<span class="dim">You have sixty seconds. I am, professionally, counting.</span>',
      '[+00:00:41] 终端在大厅正中等着。先修 CORE-01 —— 回声核心。'+
      '它一辈子的手艺就一句: <span class="k">进什么, 出什么。</span>二十年前, 每个学徒六十秒就能学会。'+
      '<span class="dim">给你六十秒。我在计时 —— 职业习惯。</span>'),next:-1}];
}

/* 未送达的补丁 P-1997 —— 20 年前没跑完的修复程序 */
function patchNpcDialog(api){
  var SP=B('Patch P-1997','补丁 P-1997');
  if(FLAG(api,'asm_patch_done')){
    return [{sp:B('',''),t:B(
      '<span class="dim">(Only a loop of cable remains, still warm. When the vault\'s heartbeat passes through it, '+
      'the cable hums one extra harmonic — small, in tune, and finally finished.)</span>',
      '<span class="dim">(只剩一圈电缆, 还有余温。机房的心跳流过时, '+
      '电缆会多哼出一个泛音 —— 很小, 在调上, 并且终于是完成时。)</span>'),next:-1}];
  }
  if(!FLAG(api,'asm_patch_met')){
    var nodes=[
      {sp:B('???','？？？'),t:B(
        '<span class="dim">(Something stirs by the cable drum: a small routine, curled up like a cat made of code, '+
        'its tail-end visibly eaten away by corrosion.)</span><br>'+
        '…Line 3. Line 3. I was ON line 3. Do you know what that is like, to be twenty years from your own line 3?',
        '<span class="dim">(电缆盘边有什么动了一下: 一小段程序, 蜷得像一只代码做的猫, '+
        '尾巴那一截被腐蚀啃得清清楚楚。)</span><br>'+
        '……第 3 行。第 3 行。我当时正要跑第 3 行。你知道那是什么感觉吗 —— 离自己的第 3 行, 隔了二十年?')},
      {sp:SP,t:B(
        'Patch P-1997. Dispatched to repair CORE-05\'s checksum, the year the arbiter died. '+
        'Two lines in, the power dropped. Five lines of me, and I have spent twenty years being <span class="k">two-fifths finished</span>.<br>'+
        '<span class="dim">The corrosion ate my last three lines. I know what they DID. I can no longer read what they WERE.</span>',
        '我是补丁 P-1997。仲裁官死掉那年, 被派来修 CORE-05 的校验和。'+
        '跑到第 2 行, 断电了。我一共五行, 却用二十年当一个<span class="k">五分之二的完成品</span>。<br>'+
        '<span class="dim">腐蚀吃掉了我最后三行。我记得它们「做什么」, 却再也读不出它们「是什么」。</span>')},
      {sp:SP,t:B(
        'My job order survives: add the two halves, file the total at cell 30, announce it, rest. '+
        'Four verbs. I have the first one and a half.<br>'+
        'You have write access. <span class="k">Write my ending for me?</span> Three lines. I will run them with everything I have left.',
        '我的工单还在: 两半相加, 总和归档到 30 号格, 对外宣告, 然后休息。'+
        '四个动词。我手里只剩前一个半。<br>'+
        '你有写权限。<span class="k">替我把结尾写完, 好吗?</span>三行。我会用剩下的全部电, 把它们跑完。'),choices:[
        {t:B('Show me your job order. I\'ll write the ending.','把工单给我看。结尾我来写。'),next:3,
         do:function(){SET(api,'asm_patch_met');STEP(api,'asm_s1');}},
        {t:B('(Come back later)','(先去忙别的)'),next:4}
      ]},
      {sp:SP,t:B(
        '<span class="dim">(It uncurls, very carefully, and turns so you can see the corroded stub where its code ends.)</span><br>'+
        'The terminal next to me still takes dictation. …Write slowly. I want to feel each line arrive.',
        '<span class="dim">(它非常小心地舒展开, 转过身, 让你看清代码结尾那截锈蚀的断口。)</span><br>'+
        '旁边那台小终端还能听写。……写慢一点。我想感觉每一行到位的样子。'),next:-1},
      {sp:SP,t:B(
        'Mm. Twenty years. A few more errands won\'t move the decimal. <span class="dim">(It curls back up, '+
        'around its own unfinished line 3, the way you curl around a bruise.)</span>',
        '嗯。都二十年了, 不差你这几件事。<span class="dim">(它重新蜷起来, '+
        '绕着自己那行没跑完的第 3 行 —— 像人蜷着护住一处淤青。)</span>'),next:-1}
    ];
    return nodes;
  }
  return [{sp:SP,t:B(
    '<span class="dim">(It is watching the little terminal beside it, not blinking, if code can blink.)</span><br>'+
    'Three lines. Just three. The order said: file at cell 30, announce, rest. '+
    '<span class="k">I am ready when you are.</span> I have been ready since 1997… wait. What year is it? Never mind. Ready.',
    '<span class="dim">(它一眨不眨地盯着旁边的小终端 —— 如果代码会眨眼的话。)</span><br>'+
    '三行。就三行。工单说: 归档到 30 号格, 宣告, 休息。'+
    '<span class="k">你准备好, 我就准备好。</span>我从 1997 年就准备好了……等等, 今年是哪年? 算了。准备好了。'),next:-1}];
}

/* ================================================================
   8. 室内地图 (22 × 14) —— 机房即心脏
   中央封闭腔体 = 心脏本体(不可入), 其外墙即八颗核心。
   ================================================================ */
var ROWS=[
  '######################',  // 0
  '#....................#',  // 1   冯·诺依曼奠基铭牌(2,1)  FDE 心跳报告(19,1)
  '#.##.....##.....##...#',  // 2
  '#.##.....##.....##...#',  // 3
  '#....................#',  // 4   Tick(8,4)  机房终端(11,4)
  '#......########......#',  // 5
  '#......#......#......#',  // 6   ← 中央心腔, 封死
  '#......#......#......#',  // 7
  '#......########......#',  // 8
  '#....................#',  // 9   中断告示(11,9)
  '#.##.....##.....##...#',  // 10
  '#.##.....##.....##...#',  // 11
  '#....................#',  // 12  三总线管道铭牌(2,12)  补丁终端(18,12) P-1997(19,12)
  '######################'   // 13  出生点(11,12)
];
var TILES=ROWS.map(function(r){return r.split('').map(function(c){return c==='#'?1:0;});});

/* ================================================================
   9. 模块定义
   ================================================================ */
var MOD={
  id:'asm',
  title:B('The Core Vault','核心机房'),
  world:'as',
  unlock:{afterQuest:'m3'},

  interior:{w:22,h:14,tiles:TILES,playerStart:{x:11,y:12}},

  npcs:[
    {id:'asm_tick',name:TICKNAME,color:'#e8c46a',body:'#f0e0b0',suit:'#8a6a2a',
     x:8,y:4,dialog:tickDialog},
    {id:'asm_patchnpc',name:B('Patch P-1997','补丁 P-1997'),color:'#9ad0a8',body:'#cfe0cf',suit:'#4a6a5a',
     x:19,y:12,dialog:patchNpcDialog}
  ],

  steles:[
    {x:2,y:1,kind:'stele',text:B(
      '<span class="dim"><i>They say this cornerstone explains why a machine can, in principle, eat its own homework.</i></span><br>'+
      '[FOUNDATION PLAQUE]<br>"This vault erected to the blueprints of the Architect <span class="k">v. NEUMANN</span>, '+
      'who decreed one radical thing:<br><br>'+
      '<span class="k">one storehouse shall hold both the grain and the recipe</span> — data and instructions, '+
      'side by side in the same memory, told apart only by how the processor reaches for them.<br><br>'+
      'Thus a machine may cook its own recipes, rewrite them, even mistake grain for recipe and eat itself. '+
      'The Architect called this a <i>feature</i>.<br>'+
      '<span class="dim">— cornerstone laid: cycle 0. stored-program architecture. no refunds.</span>"',
      '<span class="dim"><i>据说这块奠基石讲的是: 一台机器为什么, 原则上, 会一不留神把自己的作业吃掉。</i></span><br>'+
      '【奠基铭牌】<br>"本机房依建筑师 <span class="k">v. NEUMANN (冯·诺依曼)</span> 的图纸建造。'+
      '他只立了一条激进的规矩:<br><br>'+
      '<span class="k">一座仓库, 同时存粮食和菜谱</span> —— 数据 (data) 与指令 (instructions) '+
      '并排住在同一块内存里, 区别只在于处理器伸手去拿时的姿势。<br><br>'+
      '于是机器可以照着菜谱做菜, 可以改写菜谱, 甚至可能把粮食错当菜谱、把自己吃掉。'+
      '建筑师管这叫<i>特性 (feature)</i>。<br>'+
      '<span class="dim">—— 奠基于第 0 周期。存储程序体系 (stored-program)。概不退换。</span>"'),
     codex:['von-neumann']},
    {x:19,y:1,kind:'stele',text:B(
      '<span class="dim"><i>A doctor\'s note for a heart that beats in three steps. Read it as a diagnosis, not a manual.</i></span><br>'+
      '[CARDIOLOGY REPORT · UNIT CPU-9618]<br>'+
      '"Patient presents with a three-phase cardiac cycle, rate 3.2 GHz (historic):<br><br>'+
      '<span class="k">FETCH</span> — diastole. PC hands the next address to MAR; the instruction travels up the bus into MDR, then CIR. PC increments, already dreaming of the next beat.<br>'+
      '<span class="k">DECODE</span> — the CIR murmur is auscultated by the control unit and understood.<br>'+
      '<span class="k">EXECUTE</span> — systole. ALU contracts; registers flush; one instruction\'s worth of blood moves.<br><br>'+
      'Prognosis: excellent, provided the cycle NEVER stops.<br>'+
      '<span class="dim">Last entry, Day 7,289: prognosis revised.</span>"',
      '<span class="dim"><i>这台机器的心跳分三拍。下面这张诊断书, 一拍一拍, 是写给它的。</i></span><br>'+
      '【心内科报告 · 病员 CPU-9618】<br>'+
      '"患者心动周期呈三相, 心率 3.2 GHz (病史值):<br><br>'+
      '<span class="k">FETCH (取指)</span> —— 舒张期。PC 把下一条地址递给 MAR; 指令沿总线上行, 入 MDR, 再入 CIR。PC 自增, 已在梦见下一拍。<br>'+
      '<span class="k">DECODE (译码)</span> —— 控制器听诊 CIR 里的杂音, 并听懂它。<br>'+
      '<span class="k">EXECUTE (执行)</span> —— 收缩期。ALU 收缩, 寄存器冲刷, 泵出恰好一条指令的血量。<br><br>'+
      '预后: 极佳 —— 前提是这个周期<b>永不停跳</b>。<br>'+
      '<span class="dim">末次记录, 第 7289 天: 预后修正。</span>"'),
     codex:['fde-cycle']},
    {x:2,y:12,kind:'stele',text:B(
      '<span class="dim"><i>Three pipes run under this floor. The plate warns that crossing them once flooded a whole neighbourhood.</i></span><br>'+
      '[PIPEWORK PLATE · THE THREE BUSES]<br>'+
      '"Three mains run through this vault. Do not confuse them:<br><br>'+
      '<span class="k">DATA BUS</span> — carries the water itself, both directions.<br>'+
      '<span class="k">ADDRESS BUS</span> — carries only house numbers, one direction: CPU outward. The water never learns the address; the address never tastes the water.<br>'+
      '<span class="k">CONTROL BUS</span> — carries the knocking: read! write! interrupt! clock!<br><br>'+
      '<span class="dim">A leak in the first floods a value. A leak in the second floods a neighbourhood. Keep the caps on.</span>"',
      '<span class="dim"><i>地板下走着三根管子。铭牌警告说, 有人接错过一次, 淹掉了一整个街区。</i></span><br>'+
      '【管道铭牌 · 三总线】<br>'+
      '"机房里走三路干管, 切勿接错:<br><br>'+
      '<span class="k">数据总线 (data bus)</span> —— 送水本身, 双向。<br>'+
      '<span class="k">地址总线 (address bus)</span> —— 只送门牌号, 单向: 从 CPU 往外。水永远不知道门牌, 门牌也永远尝不到水。<br>'+
      '<span class="k">控制总线 (control bus)</span> —— 送敲门声: 读! 写! 中断! 时钟!<br><br>'+
      '<span class="dim">第一路漏, 淹掉一个值; 第二路漏, 淹掉一个街区。盖好盖子。</span>"'),
     codex:['buses']},
    {x:11,y:9,kind:'stele',text:B(
      '<span class="dim"><i>A notice about the one polite way to tap this machine on the shoulder — and a lonelier line hidden under it.</i></span><br>'+
      '[NOTICE OF AUTHORITY · INTERRUPTS]<br>'+
      '"Only one power in this vault may tap the processor on the shoulder mid-thought: the <span class="k">interrupt</span>.<br><br>'+
      'Protocol: the CPU finishes its CURRENT instruction, saves its place like a reader dog-earing a page, '+
      'services the caller by priority, then returns as if never disturbed.<br><br>'+
      '<span class="dim">Filed beneath, in punch-clock handwriting: "For twenty years I have wanted, just once, to be important enough to interrupt something." — T.</span>"',
      '<span class="dim"><i>一张告示, 讲拍这台机器肩膀的唯一礼貌姿势——底下还压着一张更孤独的字条。</i></span><br>'+
      '【权限告示 · 中断 (interrupt)】<br>'+
      '"本机房里只有一种权力, 可以在处理器想事情想到一半时拍它的肩: <span class="k">中断</span>。<br><br>'+
      '规程: CPU 先跑完<b>当前这条</b>指令, 像读书人折个书角一样存好现场, '+
      '按优先级服务来客, 然后回到原处 —— 仿佛从未被打扰。<br><br>'+
      '<span class="dim">告示下方压着一行打卡钟字迹: 「二十年了, 我只想有一次, 重要到足以中断点什么。」—— T.</span>"'),
     codex:['interrupts']}
  ],

  quests:[
    {id:'asm_main',line:'side',title:B('The Core Vault: Eight Hearts','核心机房: 八心归位'), /* side: 深度内容不进飞升门槛 */
     syllabus:'4.1/4.2 Processor & assembly — FDE cycle, registers, full 9618 instruction set',
     desc:B('Eight cores — eight chambers of one machine heart — went dark over twenty years while a punch-clock daemon logged every death, lacking the clearance to help. You have write access. Level by level, instruction by instruction, bring the heartbeat home.',
            '八颗核心 —— 一颗机器心脏的八个心室 —— 在二十年里逐一熄灭; 打卡钟 daemon 记录了每一次死亡, 却没有出手的权限。而你有写权限。一关一课, 一条指令一条指令, 把心跳修回来。'),
     steps:[
       {id:'asm_m1',text:B('Report to Tick the Punch-Clock behind the counter','到柜台后向打卡钟 Tick 报到')},
       {id:'asm_m2',text:B('Repair cores 1–4: I/O, arithmetic, and the loop trio (label · CMP · jump)',
                           '修复核心 1–4: 输入输出、算术, 以及循环三件套 (标签 · CMP · 跳转)'),
        check:function(api){return !!FLAG(api,'asm_lv_4');}},
       {id:'asm_m3',text:B('Repair cores 5–8: build ordering from equality, master IX & pointers, restore the heartbeat',
                           '修复核心 5–8: 用等值比较搭出大小、掌握 IX 与指针, 让心跳恢复'),
        check:function(api){return !!FLAG(api,'asm_lv_8');}}
     ]},
    {id:'asm_side',line:'side',title:B('The Undelivered Patch','未送达的补丁'),
     syllabus:'4.2 Assembly language: read & complete a routine (STO · OUT · END)',
     desc:B('A repair patch dispatched twenty years ago never arrived. Two of its five lines still run warm; corrosion ate the ending. It remembers what its last three lines did — it can no longer read what they were.',
            '一个二十年前派出的修复补丁, 始终没有送达。五行代码只剩前两行还温热, 结尾被腐蚀吃掉了。它记得最后三行「做什么」, 却再也读不出它们「是什么」。'),
     steps:[
       {id:'asm_s1',text:B('Hear P-1997 out by the cable drum (south-east corner)','在东南角电缆盘旁, 听 P-1997 说完')},
       {id:'asm_s2',text:B('Write and run its last three lines — let it finish','写出并替它跑完最后三行 —— 让它完工')}
     ]}
  ],

  puzzles:[
    {id:'asm_vault',kind:'puzzleStation',x:11,y:4,title:B('Vault Terminal · Eight Cores','机房终端 · 八颗核心'),
     syllabus:'4.2 Assembly — LDM/LDD/LDI/LDX/LDR/MOV/STO/ADD/SUB/INC/DEC/CMP/CMI/JMP/JPE/JPN/IN/OUT/END',
     primer:VAULT_PRIMER,
     codex:['fde-cycle','register-acc-ix','instruction-set-reference','von-neumann'],
     render:renderVault,
     onKey:function(e,api){
       if(e.key==='?'&&VIEW.mode==='level'){
         var f=hintFns['asm_lv_'+LEVELS[VIEW.lv].n];if(f)f();
       }
     }},
    {id:'asm_patch',kind:'puzzleStation',x:18,y:12,title:B('P-1997 · The Corroded Ending','P-1997 · 被蚀掉的结尾'),
     syllabus:'4.2 Assembly applied: completing a routine',
     primer:PATCH_PRIMER,
     codex:['instruction-set-reference'],
     render:renderPatch,
     onKey:function(e,api){if(e.key==='?'&&hintFns.asm_patch)hintFns.asm_patch();}}
  ],

  onEnter:function(api){
    if(!FLAG(api,'asm_entered')){
      SET(api,'asm_entered');
      S(api,'open');
      TOAST(api,B('The hall is vast and beat-less. Eight dark cores ring a sealed chamber; dead cables sag like tired veins. Somewhere behind a counter, something goes tick — half a beat ahead of nothing at all.',
                  '大厅空旷, 没有心跳。八颗熄灭的核心环着一间封死的腔室, 死电缆像疲惫的血管一样垂着。柜台后的某处传来一声「嗒」—— 比一片空无, 抢先了半拍。'),true);
    }
  },

  onQuestComplete:function(qid,api){
    if(qid==='asm_main'){
      S(api,'quest');
      TOAST(api,B('◈ The Core Vault · COMPLETE ◈ Eight chambers, one rhythm. Somewhere a punch-clock is stamping the same card again and again, and for once it is not an error. …And beneath the vault, in the gap between two heartbeats, something hums back — on tempo.',
                  '◈ 核心机房 · 完成 ◈ 八室一律。某处的打卡钟正把同一张卡盖了又盖 —— 这一次, 不算文书错误。……而机房之下, 在两次心跳的间隙里, 有什么按着这个节拍哼了回来。'),true);
    }else if(qid==='asm_side'){
      TOAST(api,B('◈ Side quest complete ◈ Five lines, twenty years, exit status 0. Some deliveries are late and still count.',
                  '◈ 支线完成 ◈ 五行代码, 二十年, exit status 0。有些送达虽然迟了, 依然作数。'),true);
    }
  },

  /* 纯逻辑导出 —— node 单测用 (引擎请忽略) */
  _test:{
    MEMSIZE:MEMSIZE,OPSPEC:OPSPEC,OPDOC:OPDOC,ERRS:ERRS,E:E,
    parseImm:parseImm,parseProgram:parseProgram,runProgram:runProgram,
    arrEq:arrEq,checkLevel:checkLevel,
    LEVELS:LEVELS,SOLUTIONS:SOLUTIONS,
    OPS1:OPS1,OPS2:OPS2,OPS3:OPS3,OPS4:OPS4,OPS6:OPS6,OPS7:OPS7,
    PATCH_PREFIX:PATCH_PREFIX,PATCH_TESTS:PATCH_TESTS,patchRun:patchRun,
    ROWS:ROWS,TILES:TILES,solvedCount:solvedCount
  }
};

/* ================================================================
   10. Codex 知识库条目 (手册查阅用; 关卡/谜题/石碑用 codex:[id] 关联)
   ================================================================ */
window.GAME_CODEX=window.GAME_CODEX||[];
window.GAME_CODEX.push(
  {id:'fde-cycle',mod:'asm',syllabus:'4.1 The processor — fetch-decode-execute cycle',
   topic:B('The fetch-decode-execute (FDE) cycle','取指-译码-执行 (FDE) 周期'),
   body:B('Every single instruction a CPU runs goes through the same three phases, over and over: FETCH — the address in the Program Counter (PC) is copied to the Memory Address Register (MAR); the instruction at that address travels to the Memory Data Register (MDR), then into the Current Instruction Register (CIR); PC increments to point at the next instruction. DECODE — the control unit works out what the instruction in CIR actually means. EXECUTE — the instruction actually happens (an ALU calculation, a memory write, etc). Then the cycle repeats from FETCH, forever, until END/HALT.',
          '每一条指令的执行都要走同样三个阶段, 一遍遍重复: 取指 (FETCH)—— 程序计数器 (PC) 里的地址被复制到内存地址寄存器 (MAR); 那个地址上的指令沿总线送进内存数据寄存器 (MDR), 再送进当前指令寄存器 (CIR); PC 自增, 指向下一条指令。译码 (DECODE)—— 控制器搞懂 CIR 里的指令到底是什么意思。执行 (EXECUTE)—— 真正把指令做了 (比如 ALU 做一次运算、写一次内存)。然后从取指重新开始, 一遍遍循环, 直到 END/HALT。'),
   example:B('OUT with ACC=7: FETCH brings the OUT instruction into CIR, DECODE recognises it as "output ACC", EXECUTE actually sends 7 to the output. Next cycle, PC has already moved on to fetch whatever comes after OUT.',
             'OUT 且 ACC=7 时: 取指把 OUT 指令送进 CIR, 译码认出它是"输出 ACC", 执行真的把 7 送到输出。下一个周期, PC 已经指向 OUT 后面那条指令了。')},
  {id:'register-acc-ix',mod:'asm',syllabus:'4.1 The processor — registers (ACC, IX)',
   topic:B('Registers: ACC and IX','寄存器: ACC 与 IX'),
   body:B('A register is a tiny storage slot INSIDE the CPU (much faster than memory, but there are very few of them). ACC (the accumulator) is where almost all arithmetic and data movement happens — LDM/LDD/LDI/LDX all load INTO it, ADD/SUB operate ON it, STO saves it OUT to memory. IX (the index register) is a second, smaller-purpose register: it holds an offset used by indexed addressing (LDX a reads memory[a+IX]) and can be set directly with LDR #n or copied from ACC with MOV IX.',
          '寄存器 (register) 是 CPU <b>内部</b>的一个微型存储格 (比内存快得多, 但数量很少)。ACC (累加器) 是几乎所有运算和数据搬运发生的地方——LDM/LDD/LDI/LDX 都是往里面装, ADD/SUB 是对它做运算, STO 是把它存出到内存。IX (变址寄存器) 是第二个、用途更专的寄存器: 它装着一个偏移量, 供变址寻址使用 (LDX a 读的是 内存[a+IX]), 可以用 LDR #n 直接设置, 也可以用 MOV IX 从 ACC 复制过去。'),
   example:B('LDM #5 (ACC=5) / MOV IX (IX=5, copied from ACC) / LDX 10 &rarr; reads memory[10+5] = memory[15].',
             'LDM #5 (ACC=5) / MOV IX (IX=5, 从 ACC 复制过来) / LDX 10 &rarr; 读 内存[10+5] = 内存[15]。')},
  {id:'instruction-set-reference',mod:'asm',syllabus:'4.2 Assembly language — instruction set overview',
   topic:B('Instruction set quick reference (by category)','指令集速查 (按类分组)'),
   body:B('Grouped by what they do — <b>data movement:</b> LDM #n (load immediate), LDD a (load direct), LDI a (load indirect via pointer), LDX a (load indexed, memory[a+IX]), LDR #n (load IX), MOV IX (ACC&rarr;IX), STO a (store). <b>arithmetic:</b> ADD, SUB (both operate on ACC), INC/DEC (&plusmn;1 on ACC or IX). <b>comparison &amp; branching:</b> CMP/CMI (set FLAG to EQ/NE), JMP (always jump), JPE (jump if EQ), JPN (jump if NE). <b>input/output:</b> IN, OUT. <b>control:</b> END (halt).',
          '按功能分组——<b>数据搬运:</b> LDM #n (装立即数), LDD a (直接寻址), LDI a (间接寻址, 顺着指针), LDX a (变址寻址, 内存[a+IX]), LDR #n (设置 IX), MOV IX (ACC&rarr;IX), STO a (存)。<b>算术:</b> ADD, SUB (都是对 ACC 操作), INC/DEC (对 ACC 或 IX 做 &plusmn;1)。<b>比较与分支:</b> CMP/CMI (把结果记进 FLAG 的 EQ/NE), JMP (无条件跳), JPE (EQ 时跳), JPN (NE 时跳)。<b>输入输出:</b> IN, OUT。<b>控制:</b> END (停机)。'),
   example:B('Need to repeat something until a counter matches a target? That is comparison + branching: CMP the counter, JPN back while not-yet-equal.',
             '需要重复某件事直到计数器达到目标? 那就是"比较+分支": CMP 计数器, 只要还没等于, JPN 跳回去。')},
  {id:'loop-pattern',mod:'asm',syllabus:'4.2 Assembly language — loops (label + CMP + conditional jump)',
   topic:B('The loop pattern: label + CMP + JPE/JPN','循环模式: 标签 + CMP + JPE/JPN'),
   body:B('This CPU has no "repeat N times" instruction — every loop is hand-built from three parts: a LABEL (a named line to jump back to), a CMP (which sets FLAG to EQ or NE by comparing ACC to something), and a conditional jump (JPE jumps if FLAG=EQ, JPN jumps if FLAG=NE) that sends execution back to the label — or lets it fall through once the condition changes.',
          '这块 CPU 没有"重复 N 次"这种指令——每一个循环都是靠三个部件手工搭出来的: 一个<b>标签</b> (label, 给某一行起名, 供跳转回来), 一个 <b>CMP</b> (把 ACC 和某个值比较, 结果记进 FLAG 的 EQ 或 NE), 以及一个<b>条件跳转</b> (JPE 在 FLAG=EQ 时跳, JPN 在 FLAG=NE 时跳), 把执行送回标签处——或者在条件变化后, 顺势往下走出循环。'),
   example:B('Count 1,2,3: LOOP: INC ACC / OUT / CMP 3 / JPN LOOP — each lap increments and prints, then jumps back UNLESS the count has just reached 3 (FLAG=EQ), at which point JPN does not jump and the program falls through to whatever comes after the loop.',
             '数 1,2,3: LOOP: INC ACC / OUT / CMP 3 / JPN LOOP —— 每圈自增并打印, 然后跳回去, 除非计数刚好到 3 (FLAG=EQ), 这时 JPN 不跳, 程序顺势走到循环后面的代码。')},
  {id:'indexed-addressing',mod:'asm',syllabus:'4.2 Assembly language — indexed addressing (LDX)',
   topic:B('Indexed addressing (LDX)','变址寻址 (LDX)'),
   body:B('LDX a reads memory[a + IX] instead of a fixed address — IX acts as a sliding offset added to the base address a. Changing IX (with INC IX, DEC IX, LDR #n, or MOV IX) lets the SAME instruction reach a different memory cell each time, which is exactly what you need to sweep across an array without writing one LDD line per element.',
          'LDX a 读的不是一个固定地址, 而是 内存[a + IX]——IX 充当加在基址 a 上的"滑动偏移量"。改变 IX (用 INC IX、DEC IX、LDR #n 或 MOV IX) 就能让<b>同一条指令</b>每次读到不同的内存格, 这正是扫过一个数组所需要的东西, 不用为每个元素都写一行 LDD。'),
   example:B('IX=0,1,2,3,4 in turn: LDX 10 reads memory[10],[11],[12],[13],[14] — five different cells, one line of code, one loop.',
             'IX 依次为 0,1,2,3,4: LDX 10 依次读 内存[10],[11],[12],[13],[14]——五个不同的格子, 一行代码, 一个循环。')},
  {id:'pointer-ldi',mod:'asm',syllabus:'4.2 Assembly language — indirect addressing (LDI/CMI, pointers)',
   topic:B('Pointers & indirect addressing (LDI)','指针与间接寻址 (LDI)'),
   body:B('A pointer is a memory cell whose VALUE is itself an ADDRESS of another cell. LDD a loads whatever number sits in cell a (direct addressing). LDI a instead treats the number in cell a AS an address, and loads from THAT address (indirect addressing) — it follows the pointer. CMI a does the same for comparison: it compares ACC to whatever the pointer in cell a points to.',
          '指针 (pointer) 是这样一种内存格: 它的<b>值</b>本身就是另一个格子的<b>地址</b>。LDD a 直接把 a 号格里的数字取回来 (直接寻址)。LDI a 则把 a 号格里的数字当成一个地址, 到<b>那个地址</b>去取值 (间接寻址)——顺着指针走一趟。CMI a 对比较做同样的事: 拿 ACC 和 a 号格指针所指向的值做比较。'),
   example:B('memory[20]=25, memory[25]=6 &rarr; LDD 20 gives 25 (the pointer itself); LDI 20 follows it and gives 6 (the real value).',
             '内存[20]=25, 内存[25]=6 &rarr; LDD 20 得到 25 (指针本身); LDI 20 顺着指针走, 得到 6 (真正的值)。')},
  {id:'von-neumann',mod:'asm',syllabus:'4.1 Von Neumann architecture — stored-program concept',
   topic:B('Von Neumann architecture','冯·诺依曼体系结构'),
   body:B('The core idea: data and instructions live in the SAME memory, told apart only by how the processor reaches for them (fetching an instruction vs loading a data value). This is what makes a "stored-program" computer: the program itself is just data sitting in memory, which means a computer can load, modify, or even generate its own instructions — the same trick that makes general-purpose computing possible at all.',
          '核心思想: 数据 (data) 和指令 (instructions) 住在<b>同一块内存</b>里, 区别只在于处理器伸手去拿的姿势 (是在取指令, 还是在取数据)。这就是"存储程序" (stored-program) 计算机的意思: 程序本身也只是内存里的数据, 所以计算机可以加载、修改、甚至生成自己的指令——正是这个特性, 让"通用计算"这件事成为可能。'),
   example:B('A program\'s own instructions sit at low memory addresses while its data sits at higher ones — but both are read off the exact same data bus. Nothing structurally stops a program from treating its own code as data (which is also why corrupted or malicious data can sometimes be mistaken for instructions — a security concern in real systems).',
             '程序自己的指令通常放在较低的内存地址, 数据放在较高的地址——但两者都是走同一条数据总线读出来的。结构上并没有什么能阻止程序把自己的代码当数据来处理 (这也是为什么被污染/恶意的数据有时会被误当成指令执行——真实系统里的一个安全隐患)。')},
  {id:'interrupts',mod:'asm',syllabus:'4.1 The processor — interrupts',
   topic:B('Interrupts','中断 (interrupt)'),
   body:B('An interrupt is a signal that can pause the CPU\'s current work to deal with something more urgent (e.g. a key press, a device finishing an operation). Protocol: the CPU finishes its CURRENT instruction (never mid-instruction), saves its place (the PC and other state — like dog-earing a page), services the interrupt by priority, then resumes exactly where it left off, as if nothing happened.',
          '中断 (interrupt) 是一种能让 CPU 暂停手头工作、去处理更紧急事情的信号 (比如一次按键、一个设备完成了操作)。规程: CPU 先跑完<b>当前这条</b>指令 (绝不会跑到一半被打断), 存好现场 (PC 和其他状态——像折个书角), 按优先级处理中断, 然后原样回到刚才的地方继续, 仿佛什么都没发生。'),
   example:B('Printer finishes a page &rarr; sends an interrupt &rarr; CPU finishes its current instruction, saves its place, handles the printer\'s request (e.g. sends the next page), then returns to exactly where it paused.',
             '打印机打完一页 &rarr; 发出中断 &rarr; CPU 跑完当前指令, 存好现场, 处理打印机的请求 (比如送下一页), 然后原样回到刚才暂停的地方。')},
  {id:'buses',mod:'asm',syllabus:'4.1 The processor — data/address/control buses',
   topic:B('The three buses: data / address / control','三总线: 数据 / 地址 / 控制'),
   body:B('Three buses (sets of wires) connect the CPU to memory and devices. The DATA BUS carries the actual values, in both directions. The ADDRESS BUS carries only locations (which cell to read/write) — one-way, from CPU outward; it never carries a value, only a "where". The CONTROL BUS carries signals like read/write/interrupt/clock that coordinate everything else.',
          '三条总线 (一组组导线) 把 CPU 和内存、设备连起来。<b>数据总线</b>送真正的数值, 双向。<b>地址总线</b>只送位置信息 (读/写哪个格子)——单向, 从 CPU 往外; 它从不送值, 只送"在哪"。<b>控制总线</b>送读/写/中断/时钟这类协调信号。'),
   example:B('Reading memory[10]: the address bus carries "10" from CPU to memory; the control bus carries the "read" signal; the data bus then carries memory[10]\'s VALUE back to the CPU.',
             '读 内存[10] 时: 地址总线把 "10" 从 CPU 送到内存; 控制总线送出"读"信号; 数据总线再把 内存[10] 的<b>值</b>送回 CPU。')}
);

window.GAME_MODULES=window.GAME_MODULES||[];
window.GAME_MODULES.push(MOD);
})();
