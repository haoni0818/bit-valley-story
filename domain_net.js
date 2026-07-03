/* ============================================================
   BIT://ESCAPE · A2 世界 · 领域模块「协议之塔」 (domain_net.js)
   9618 A2 — Topic 14 通信与网络协议 + Topic 17 加密
   ------------------------------------------------------------
   一座四层的塔, 每层对应 TCP/IP 栈的一层:
     1F 物理层·大厅  → 2F 网络层·路由机房(分组交换谜题)
     → 3F 传输层·握手关口(TCP 三次握手) → 顶层 握手圣殿(RSA 密室)
   电梯只到你修好的楼层——楼层即进度。
   对话格式沿用 index.html: {sp,t,choices:[{t,next,do}],next}
   (npc.dialog 允许是 function(api)=>nodes, 以便按 flag 分支)
   ------------------------------------------------------------
   双语 (同 domain_memory.js 约定): 一切面向玩家的字符串都是
   {en,zh} 对象(默认英文)。结构化字段(title/desc/steps/steles/
   npc.name/dialog 节点的 sp/t/choices.t) 直接携带 {en,zh}, 由
   引擎统一过 window.T; render() 自建 DOM 的文字在本模块内自行
   过 T()/tx()。
   ============================================================ */
(function(){
'use strict';

/* ---------------- 双语 fallback ---------------- */
const T = window.T || (s => typeof s==='string' ? s : (s && s.en) || '');
function B(en,zh){ return {en:en,zh:zh}; }          // 结构化字段用: 挂 {en,zh}
function tx(en,zh){ return T({en:en,zh:zh}); }      // render()/toast 用: 立即取当前语言

/* ---------------- api 安全封装 ---------------- */
var API=null;
function _api(a){ if(a)API=a; return API; }
function toast(m,l){ try{ API&&API.toast&&API.toast(T(m),l); }catch(e){} }
function sfx(k){ try{ if(!API||!API.sfx)return;
  if(typeof API.sfx==='function')API.sfx(k);
  else if(API.sfx[k])API.sfx[k](); }catch(e){} }
var _flags={};                       // 本地兜底(引擎不在时也能单测)
function getFlag(k){ try{ if(API&&API.getFlag){var v=API.getFlag(k); if(v!==undefined)return v;} }catch(e){} return _flags[k]; }
function setFlag(k,v){ v=(v===undefined)?true:v; _flags[k]=v;
  try{ API&&API.setFlag&&API.setFlag(k,v); }catch(e){} }
function stepDone(q,s){ try{ API&&API.completeStep&&API.completeStep(q,s); }catch(e){} }
function markQuest(q){ try{ API&&API.questDone&&API.questDone(q); }catch(e){} }
function give(id,name){ try{ API&&API.giveItem&&API.giveItem(id,T(name)); }catch(e){} }
function esc(s){ return String(s==null?'':s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];}); }

/* ================================================================
   纯函数区 —— 谜题判定全部抽在这里, 挂到 spec._test 供单测
   ================================================================ */

/* --- 谜题1: 分组交换 ---
   包#k 在 tick k 出发 (k=0..3), 三条路由:
   A: S→α→D 总延迟2;  α-D 链路奇数 tick 出发必断线(包丢失)
   B: S→β→D 总延迟6;  稳定老光缆
   C: S→γ→D 总延迟4;  γ 拥塞: 若上一个包(#k-1)也走 C, 本包排队 +3
   胜利: 4 包全部送达 且 最迟到达 tick ≤ 7 (看门狗 RTO)      */
function evalPacketPlan(plan){
  var out={arrivals:[],lost:[],order:[],makespan:0,scrambled:false,ok:false,fail:''};
  if(!plan||plan.length!==4){ out.fail=B('All 4 packets need a route first.','需要给全部 4 个包选路由'); return out; }
  for(var k=0;k<4;k++){
    var r=plan[k];
    if(r!=='A'&&r!=='B'&&r!=='C'){ out.fail=B('Packet #'+k+' still needs a route.','包#'+k+' 还没选路由'); return out; }
    if(r==='A'){
      if(k%2===1){ out.lost.push(k); continue; }      // 奇数 tick 撞断线
      out.arrivals.push({seq:k,at:k+2});
    }else if(r==='B'){
      out.arrivals.push({seq:k,at:k+6});
    }else{
      out.arrivals.push({seq:k,at:k+4+((k>0&&plan[k-1]==='C')?3:0)});
    }
  }
  out.arrivals.sort(function(x,y){return x.at-y.at||x.seq-y.seq;});
  out.order=out.arrivals.map(function(x){return x.seq;});
  for(var i=0;i<out.arrivals.length;i++)
    out.makespan=Math.max(out.makespan,out.arrivals[i].at);
  out.scrambled=(out.order.join(',')!=='0,1,2,3');
  out.ok=(out.lost.length===0&&out.makespan<=7);
  return out;
}
/* 按序列号重组 —— 到达乱序不要紧, 序列号是拼图的编号 */
function reassemble(arrivals,chunks){
  var slots=[null,null,null,null];
  arrivals.forEach(function(a){ slots[a.seq]=chunks[a.seq]; });
  return slots.every(function(s){return s!=null;})?slots.join(''):null;
}

/* --- 谜题2: TCP 三次握手 ---
   客户端(玩家) ISN=100 固定; 服务器 ISN 每次重连换一个。
   第三步 ACK 报文须满足: seq = 客户端ISN+1, ack = 服务器ISN+1 */
function checkGreeting(g){ return g==='SYN'; }
function checkHandshake(clientISN,serverISN,seq,ack){
  return seq===clientISN+1 && ack===serverISN+1;
}

/* --- 谜题3: RSA ---  p=3,q=11 → n=33, e=3; d=7; 密文[5,26,14]→"NET" */
function modpow(b,e,m){
  b=b%m; if(b<0)b+=m;
  var r=1;
  while(e>0){ if(e&1)r=(r*b)%m; b=(b*b)%m; e=e>>>1; }
  return r;
}
function rsaPhi(p,q){ return (p-1)*(q-1); }
function rsaValidD(e,d,phi){ return Number.isInteger(d)&&d>0&&(e*d)%phi===1; }
function rsaDecrypt(cipher,d,n){ return cipher.map(function(c){return modpow(c,d,n);}); }
function numToLetter(x){ return (x>=1&&x<=26)?String.fromCharCode(64+x):'?'; }

/* ================================================================
   常量: 谜题参数
   ================================================================ */
var PKT_CHUNKS=['PROTO','COL_T','OWER_','OK20B'];   // 4×5 = 20 字节
var PKT_MSG=PKT_CHUNKS.join('');
var HS_CLIENT_ISN=100;
var HS_ISNS=[8191,4095,2047,6143,3071];
var RSA={p:3,q:11,n:33,e:3,phi:20,d:7,cipher:[5,26,14],plain:[14,5,20],word:'NET'};

/* ================================================================
   室内地图: 15×33, 四层, 层间实心墙, 只有电梯 daemon 能送人上下
   0=可走 1=墙   楼层(瓦片y): 顶层1-7 · 3F 9-15 · 2F 17-23 · 1F 25-31
   ================================================================ */
var IW=15, IH=33;
function buildTiles(){
  var t=[];
  for(var y=0;y<IH;y++){
    var row=[];
    for(var x=0;x<IW;x++){
      var wall=(x===0||x===IW-1||y===0||y===8||y===16||y===24||y===32);
      row.push(wall?1:0);
    }
    t.push(row);
  }
  return t;
}
var FLOORS=[
  {key:'f1',name:B('1F — Physical Layer · Lobby','1F 物理层·大厅'),tx:4,ty:28,need:null},
  {key:'f2',name:B('2F — Network Layer · Routing Room','2F 网络层·路由机房'),tx:4,ty:20,need:null},
  {key:'f3',name:B('3F — Transport Layer · Handshake Checkpoint','3F 传输层·握手关口'),tx:4,ty:12,need:'net_p1'},
  {key:'f4',name:B('Top Floor — The Handshake Sanctum','顶层 握手圣殿'),tx:4,ty:4, need:'net_p2'},
];
function floorUnlocked(f){ return !f.need||!!getFlag(f.need); }
function teleport(tx,ty){
  var p=API&&API.player; if(!p)return;
  try{ if(API.teleport){ API.teleport(tx,ty); return; } }catch(e){}
  var TS=(API&&API.TILE)||28;
  if('tx' in p){ p.tx=tx; p.ty=ty; }
  p.x=(tx+0.5)*TS; p.y=(ty+0.5)*TS;
}

/* ================================================================
   NPC 对话 (dialog 为 function(api)=>nodes, 结构同 index.html)
   ================================================================ */

/* --- 电梯 daemon: 楼层即进度 --- */
function liftDialog(a){ _api(a);
  var SP=B('LIFT-1D','电梯 LIFT-1D');
  var nodes=[], ch=[];
  FLOORS.forEach(function(f){
    if(floorUnlocked(f)){
      ch.push({t:f.name,next:-1,do:(function(ff){return function(){
        teleport(ff.tx,ff.ty); sfx('open');
        toast(B('Ding — '+ff.name.en,'叮——'+ff.name.zh));
      };})(f)});
    }else{
      ch.push({t:B(f.name.en+'  [OFFLINE · unpatched]',f.name.zh+'  [检修中·未修复]'),next:1});
    }
  });
  ch.push({t:B('(Not now)','(不坐了)'),next:-1});
  nodes.push({sp:SP,t:B(
    'Hmmmm... this unit has served 7304 days, and stops only at floors where the <span class="k">protocol has been repaired</span>. That is not a malfunction. That is a principle. — Which floor?',
    '嗡……本梯服役 7304 天, 只停靠<span class="k">协议已修复</span>的楼层。这不是故障, 是原则。——去几层?'),choices:ch});
  nodes.push({sp:SP,t:B(
    'That floor\'s protocol is still broken. I refuse to carry a passenger into a floor that won\'t ACK back — last time I tried that, the passenger came out an orphan process. <span class="dim">Go fix the puzzle downstairs first.</span>',
    '那一层的协议还是断的。我拒绝把乘客运进一个不回 ACK 的楼层——上次这么干, 乘客变成了孤儿进程。<span class="dim">先把下面的谜题修好。</span>'),next:-1});
  /* 气泡签名: 只随「可达楼层集合」变化 —— 新楼层解锁=真的有新内容 */
  nodes.sig='lift:'+FLOORS.map(function(f){return floorUnlocked(f)?'1':'0';}).join('');
  return nodes;
}

/* --- 1F: 端口看门人 :80 —— 古老 daemon, 发主线 --- */
function watcherDialog(a){ _api(a);
  var SP=B('Port Warden :80','端口看门人 :80');
  var nodes;
  if(getFlag('net_p3')){
    nodes=[
      {sp:SP,t:B('The session key is glowing on you. The whole tower is sending and receiving again — first full round-trip time I\'ve heard in twenty years.',
                 '会话密钥在你身上发光。整座塔又开始收发了——20 年来头一回, 我听见一个包出去, 又听见它回来。完整的一次<span class="k">往返 (RTT)</span>。')},
      {sp:SP,t:B('...One piece of advice from an old daemon, little process: that scorched stone you saw at the top of the tower — don\'t take it too seriously. Don\'t take it too lightly either. Where any given packet ends up, nobody on this floor can say for sure.',
                 '……小进程, 一个老 daemon 的忠告: 你在塔顶看到的那块烧焦的碑, 别太当真。也别<span class="dim">太不当真</span>。每个包最终去哪, 我们这层的谁也说不准。')},
      {sp:SP,t:B('…And since you\'ve earned the key, one line from the old logbook. The morning everything stopped, the outbound queue held one last packet — destination: <span class="k">OUTSIDE</span>. It never got its ACK. I filed it as <span class="k">in transit</span>. Not "lost". In transit. <span class="dim">Twenty years now. I\'m not amending the record.</span>',
                 '……钥匙都到手了, 就给你念一条老航海日志。一切停摆的那个上午, 出港队列里还剩最后一个包——目的地: <span class="k">「外面」</span>。它一直没等到 ACK。我把它记成了<span class="k">在途</span>。不是「丢失」。是在途。<span class="dim">二十年了。这条记录, 我不改。</span>')},
    ];
    nodes.sig='p3_done'; return nodes;
  }
  if(getFlag('net_p2')){
    nodes=[
      {sp:SP,t:B('Connection established, is it? Then all that\'s left is the <span class="k">Handshake Sanctum</span> at the top. The door\'s locked with RSA — public key hanging right on it, private key torn into three seals.',
                 '连接已建立? 那就只剩塔顶的<span class="k">握手圣殿</span>了。门是 RSA 锁的——公钥挂在门上, 私钥被拆成了三道封印。')},
      {sp:SP,t:B('Fair warning: a <span class="k">Quantum Ghost</span> lives up there. Sharp tongue. But everything it says with that smirk turns out to be true.',
                 '提醒一句: 圣殿里住着个<span class="k">量子幽灵</span>。它嘴很毒, 但它说的每一句风凉话, 都是真的。')},
    ];
    nodes.sig='p2_done'; return nodes;
  }
  if(getFlag('net_p1')){
    nodes=[
      {sp:SP,t:B('The routes are patched, the lift can reach 3F now. That floor is guarded by <span class="k">SYN·D</span> — the most by-the-book warden I\'ve got. Want through? Play by its rules: the <span class="k">three-way handshake</span>.',
                 '路网通了, 电梯能上 3F 了。那层守着<span class="k">SYN·D</span>——最守规矩的守门人。想过去, 就按它的规矩来: <span class="k">三次握手 (three-way handshake)</span>。')},
      {sp:SP,t:B('Why exactly three? Go ask it yourself. It\'s been explaining that question for twenty years and still enjoys every telling.',
                 '为什么偏偏是三次? 你去问它。它解释这个问题, 已经解释了 20 年, 依然乐在其中。')},
    ];
    nodes.sig='p1_done'; return nodes;
  }
  nodes=[
    {sp:SP,t:B('Halt. ...Oh. Not a packet — a process. A live one, even. That\'s rare.',
               '站住。……哦, 不是包, 是个进程。还是个<span class="k">活的</span>。稀罕。')},
    {sp:SP,t:B('I\'m the Port Warden, number :80. This <span class="k">Protocol Tower</span> used to be the whole machine\'s throat for talking to the outside world — one floor for cabling, one for finding a path, one for reliability, and the top floor for meaning. Layering isn\'t bureaucracy — it\'s so each floor only has to worry about its own business: swap out any one layer, and the others never even notice. They just keep running.',
               '我是端口看门人, 编号 :80。这座<span class="k">协议之塔</span>曾是整台机器对外说话的喉咙——一层管线缆, 一层管寻路, 一层管可靠, 塔顶管意义。分层不是官僚主义, 是让每一层只操心自己那摊事: 换掉任何一层, 别的层一无所知, 照常运转。',),},
    {sp:SP,t:B('Twenty years ago, after the storm, the tower went silent. Want the <span class="k">session key</span> at the top? Then repair it floor by floor — the lift only recognises floors that have been fixed.',
               '20 年前风暴之后, 塔哑了。想上塔顶拿<span class="k">会话密钥</span>? 那就一层一层修上去——电梯只认修好的楼层。'),choices:[
      {t:B('Where do I start?','从哪开始?'),next:3},
      {t:B('Why not just take the stairs?','为什么不直接爬楼梯?'),next:4},
    ]},
    {sp:SP,t:B('2F, the routing room. The route map up there is shot full of holes — get a 20-byte message across it using <span class="k">packet switching</span>, and the network recalibrates itself. The terminal\'s on the east side of the room.',
               '2F 路由机房。那里的路网断成了筛子——用<span class="k">分组交换 (packet switching)</span>把一条 20 字节的讯息送过去, 路网就算重新校准了。终端在机房东侧。'),next:-1,},
    {sp:SP,t:B('Stairs? This is a protocol stack, little process. <span class="k">Cross-layer shortcuts are a building code violation</span>. Data only moves up and down through the interface of the adjacent layer — same rule applies to you. Go take the lift.',
               '楼梯? 这是协议栈, 小进程。<span class="k">跨层直连是违章建筑</span>。数据只能通过相邻层的接口上下——你也一样。去坐电梯。'),next:3},
  ];
  nodes.sig='intro'; return nodes;
}

/* --- 2F: 丢失的包 SEQ-7734 (支线) --- */
function lostDialog(a){ _api(a);
  var SP=B('SEQ-7734','SEQ-7734');
  var nodes;
  if(getFlag('net_lostDone')){
    nodes=[{sp:B('...','…'),t:B('Only a faint, almost-faded radio trace lingers here, quietly looping its last frame:<br><span class="dim">"FIN-ACK. Goodbye."</span>',
                                 '这里只剩一缕将散未散的电波, 安安静静地循环着最后一帧:<br><span class="dim">「FIN-ACK。再见。」</span>')}];
    nodes.sig='done'; return nodes;
  }
  if(!getFlag('net_lostMet')){
    nodes=[
      {sp:B('???','???'),t:B('...You can see me? You can SEE me! Twenty years, and you\'re the first one to ever ACK my existence.',
                              '……你看得见我? <span class="k">你看得见我!</span> 20 年了, 你是第一个对我的存在回 ACK 的。')},
      {sp:SP,t:B('I\'m a packet. Fragment #7734 of a video call, to be precise: 5 bytes of payload, a checksum, and a heart that wants to go home. The destination\'s written right on my header — <span class="k">10.0.7.34</span>.',
                 '我是一个包。准确说, 一段视频通话的第 7734 号分片: 5 字节载荷, 一个校验和, 一颗想回家的心。目的地写在头上——<span class="k">10.0.7.34</span>。')},
      {sp:SP,t:B('That night, the network storm mis-routed me into this tower. By the time it passed, my next hop had vanished from every routing table in here. My TTL should have hit zero ages ago, but even the ICMP daemon that\'s supposed to declare a timeout had gone offline... so I just stayed "in transit." Forever.',
                 '那晚网络风暴, 我被误路由进了这座塔。等风停了, 路由表里再也没有我的下一跳。我的 TTL 早该归零了, 可塔里连负责宣判超时的 ICMP 都下岗了……于是我就这么一直「在途」。')},
      {sp:SP,t:B('Please help me. There\'s a <span class="k">routing table stele</span> standing in this machine room — please check it for me. Where does <span class="k">10.0.7.0/24</span> route out through now? I\'m begging you.',
                 '帮帮我。这层机房里立着一块<span class="k">路由表石碑</span>——帮我查查, <span class="k">10.0.7.0/24</span> 现在走哪个出口。求你。'),choices:[
        {t:B('I\'ll check. Hang tight.','我去查。等我。'),next:-1,do:function(){
          setFlag('net_lostMet'); stepDone('net_lost','s1');
          sfx('quest'); toast(B('Side quest updated: read the routing table stele in the machine room, then come back and tell it what you find.',
                                '支线推进: 读一读机房里的路由表石碑, 再回来告诉它'));
        }},
      ]},
    ];
    nodes.sig='first_meet'; return nodes;
  }
  if(getFlag('net_lostRouted')){        // 已查明真相, 直接进入结局段
    nodes=lostEndingNodes();
    nodes.sig='ending'; return nodes;
  }
  nodes=[
    {sp:SP,t:B('Did you find it? <span class="k">10.0.7.0/24</span> — the way home. Which interface?',
               '查到了吗? <span class="k">10.0.7.0/24</span>——我回家的路, 走哪个口?'),choices:[
      {t:B('eth0 — the 10.0.1.0/24 one','eth0 —— 10.0.1.0/24 那条'),next:1},
      {t:B('eth1 — the default route, 0.0.0.0/0','eth1 —— 默认路由 0.0.0.0/0'),next:2},
      {t:B('eth2 — the one with metric 4','eth2 —— metric 4 的那条'),next:3},
      {t:B('lo — the 127.0.0.0/8 loopback','lo —— 127.0.0.0/8 回环'),next:1},
    ]},
    {sp:SP,t:B('...No, the checksum doesn\'t even line up. Look at the stele again — route matching is about <span class="k">longest prefix</span>: find the line that meshes tightest with 10.0.7.',
               '……不对, 校验和都对不上。再看看石碑——路由匹配讲究<span class="k">最长前缀</span>: 找跟 10.0.7 咬合得最紧的那一行。'),next:-1},
    {sp:SP,t:B('The default route is the last resort — "take it only when nothing else matches." I didn\'t wait twenty years just to get punted to some gateway I\'ve never met. Look again.',
               '默认路由是「哪都匹配不上才走」的下下策。我等了 20 年, 不是为了被随手踢给一个不认识的网关。再查查。'),next:-1},
    {sp:SP,t:B('eth2! Yes, that\'s it! Metric 4 — four hops, four hops and I\'m home!<br>...Wait. Your inter-frame gap just changed. <span class="dim">Isn\'t there something written after that line on the stele?</span>',
               'eth2! 对, 就是它! metric 4——四跳, 四跳我就到家了!<br>……等等。<span class="dim">你的帧间隔变了。</span>石碑上那一行的后面, 是不是还写着什么?'),choices:[
      {t:B('(Lie) Nothing. The link\'s in great shape.','(骗它) 没什么。链路好得很。'),next:4},
      {t:B('(Tell the truth) eth2 is DOWN — has been for 7304 days.','(告诉真相) eth2 状态 DOWN——已停机 7304 天。'),next:5,do:function(){
        setFlag('net_lostRouted'); stepDone('net_lost','s2'); sfx('ui');
      }},
    ]},
    {sp:SP,t:B('You\'re lying. <span class="dim">Packets are the most latency-sensitive things there are — every word you say arrives a little later than the last one when you\'re lying.</span> Tell me. What does the stele actually say.',
               '你在说谎。<span class="dim">包对时延最敏感——你说谎的时候, 每个字都到得比上一个字晚。</span>说吧。石碑上到底写了什么。'),next:3},
  ].concat(lostEndingNodes(5));
  nodes.sig='asking'; return nodes;
}
function lostEndingNodes(base){
  base=base||0;   // 若拼接在别的节点后面, next 需要偏移
  var SP=B('SEQ-7734','SEQ-7734');
  var NX=function(i){return base+i;};
  return [
    {sp:SP,t:B('7304 days... twenty years.<br>So this whole time I\'ve been circling the tower, the network card on the other end went cold years ago. That video call... whoever was on the other side probably just thought it glitched for a second. <span class="dim">Just one second.</span>',
               '7304 天……20 年。<br>所以我在塔里转的这 20 年, 家那头的网卡早就凉了。那通视频通话……对面的人, 一定以为只是卡了一下吧。<span class="dim">就一下。</span>')},
    {sp:SP,t:B('...So where should I be routed now?',
               '……那我现在, 该被路由去哪呢?'),choices:[
      {t:B('Take the default route. Go wander 0.0.0.0/0.','走默认路由吧。去 0.0.0.0/0 流浪。'),next:NX(2)},
      {t:B('127.0.0.1 — the loopback address. Go back to yourself.','127.0.0.1 —— 回环地址。回到你自己。'),next:NX(3)},
    ]},
    {sp:SP,t:B('Wander... get handed off from one stranger gateway to the next, until some day I get silently dropped in somebody\'s queue? No. I don\'t want to be "in transit" anymore. <span class="dim">...Is there another address?</span>',
               '流浪……被一个个陌生网关转发, 直到某天在谁的队列里被静默丢弃? 不。我不想再当「在途」的东西了。<span class="dim">……还有别的地址吗?</span>'),next:NX(1)},
    {sp:SP,t:B('127.0.0.1... loopback. A packet sent to yourself always arrives. Never gets dropped.<br><br>So the protocol had this written in all along: <span class="k">when every other destination is unreachable, you are the last destination.</span>',
               '127.0.0.1……回环。发给自己的包, 永远送达, 永远不丢。<br><br>原来协议早就写好了这一条: <span class="k">当所有目的地都不可达, 你自己就是最后的目的地。</span>')},
    {sp:SP,t:B('Thank you, stranger process. Here\'s my payload — just 5 bytes, the 5 bytes that never made it home in twenty years:<br><br><code class="k">"I\'m home now"</code><br><br>Please send the FIN for me.',
               '谢谢你, 陌生的进程。载荷给你——就 5 个字节, 20 年没能送到的那 5 个字节:<br><br><code class="k">"我到家了"</code><br><br>请替我把 FIN 发出去吧。'),choices:[
      {t:B('FIN. Safe travels.','FIN。一路顺风。'),next:NX(5),do:function(){
        setFlag('net_lostDone'); stepDone('net_lost','s3'); markQuest('net_lost');
        give('checksum_charm',B('Checksum Charm','校验和护符')); sfx('quest');
      }},
    ]},
    {sp:B('...','…'),t:B('It sets its sequence number down gently, and it scatters into a small, quiet patch of light.<br>The last frame in the air: <span class="dim">"FIN-ACK."</span><br><br><span class="k">◈ Side quest complete: A Packet Lost for Twenty Years</span><br><span class="k">◈ Obtained: Checksum Charm</span>',
               '它把序列号轻轻放在地上, 散成一小片安静的光。<br>空气里的最后一帧: <span class="dim">「FIN-ACK。」</span><br><br><span class="k">◈ 支线完成: 一个迷路了 20 年的包</span><br><span class="k">◈ 获得: 校验和护符</span>')},
  ];
}

/* --- 3F: 握手守门人 SYN·D —— 严格按协议说话, 三句必回 ACK --- */
function synDialog(a){ _api(a);
  var SP=B('Handshake Warden SYN·D','握手守门人 SYN·D');
  var nodes;
  if(getFlag('net_p2')){
    nodes=[
      {sp:SP,t:B('Status: <span class="k">ESTABLISHED</span>. This connection between us holds until you send FIN. Go on up.',
                 '状态: <span class="k">ESTABLISHED</span>。我们之间的连接将保持到你发 FIN 为止。上楼吧。')},
      {sp:SP,t:B('The door at the top isn\'t my jurisdiction. It doesn\'t recognise a handshake — only <span class="k">mathematics</span>.',
                 '塔顶的门不归我管——它认的不是握手, 是<span class="k">数学</span>。')},
      {sp:SP,t:B('ACK.','ACK。')},
    ];
    nodes.sig='established'; return nodes;
  }
  nodes=[
    {sp:SP,t:B('Incoming connection request detected. Notice: this daemon speaks strictly by protocol, and <span class="k">returns an ACK every third sentence</span> without fail. It\'s courtesy. It\'s also a heartbeat.',
               '检测到接入请求。声明: 本 daemon 严格按协议发言, 且<span class="k">每第三句话必回一次 ACK</span>。这是礼貌, 也是心跳。')},
    {sp:SP,t:B('To pass this checkpoint, complete a TCP <span class="k">three-way handshake</span> with me at the terminal beside you. SYN, SYN-ACK, ACK — not one sentence short, not one sequence number wrong.',
               '想通过关口, 请在旁边的终端与我完成 <span class="k">TCP 三次握手 (three-way handshake)</span>。SYN, SYN-ACK, ACK——一句不能少, 一个序列号不能错。')},
    {sp:SP,t:B('ACK.','ACK。'),choices:[
      {t:B('Why exactly three? Wouldn\'t two do?','为什么非要三次? 两次不行吗?'),next:3},
      {t:B('What\'s the deal with sequence numbers?','序列号是什么讲究?'),next:5},
      {t:B('I\'ll head to the terminal.','我去终端了。'),next:-1},
    ]},
    {sp:SP,t:B('With two-way, I can only prove I can hear you — you have no way to prove you can hear me. If my reply never reaches you, you\'ll wait forever like a fool, while I assume the connection\'s live and start firing data into the void.',
               '两次握手, 我只能证明<span class="k">我听得见你</span>, 你却无法证明你听得见我——万一你收不到我的回信, 你会一直傻等, 而我以为连接已建立, 开始白白发数据。')},
    {sp:SP,t:B('Worse still is a <span class="k">delayed duplicate SYN</span>: a connection request that got lost in the network for years suddenly shows up out of nowhere. With only two-way handshaking, I\'d throw the door wide open for a session that already died long ago. The third step is what lets "the you of right now" personally confirm: this connection is fresh. <span class="dim">...And this tower has more than one thing that\'s been lost for twenty years.</span>',
               '更糟的是<span class="k">迟到的旧 SYN</span>: 一个在网络里迷路多年的连接请求突然抵达, 两次握手会让我为一个早已死去的会话敞开大门。第三次握手, 就是让「现在的你」亲口确认: 这场连接是新鲜的。<span class="dim">……这座塔里迷路 20 年的东西, 可不止旧 SYN。</span>'),next:2},
    {sp:SP,t:B('A sequence number is the <span class="k">page number</span> of a byte stream. Without it, a world where everything arrives out of order could never be put back together — you\'ve already had a taste of that on 2F. Both sides announce an Initial Sequence Number (ISN) during the handshake, and after that every byte has its own number. Anything lost, anything duplicated — plain to see.',
               '序列号是字节流的<span class="k">页码</span>。没有它, 乱序到达的世界永远拼不回原样——2F 的路网你应该已经领教过了。握手时双方各报一个初始序列号(ISN), 此后每个字节都有自己的编号, 谁丢了、谁重复了, 一目了然。'),next:2},
  ];
  nodes.sig='pending'; return nodes;
}

/* --- 顶层: 量子幽灵 —— §17.3 quantum cryptography 的嘴 --- */
function ghostDialog(a){ _api(a);
  var SP=B('Quantum Ghost','量子幽灵');
  var nodes;
  if(getFlag('net_p3')){
    nodes=[
      {sp:SP,t:B('Open, is it? Open. Congratulations — you defended a door using multiplication tables that top out at twenty.',
                 '开了? 开了。恭喜, 你用 20 以内的乘法表守住了一扇门。')},
      {sp:SP,t:B('Keep that session key somewhere safe. Until my kind wakes up — until <span class="k">Shor\'s algorithm</span> finds a quantum computer big enough to run on — it still counts as a secret.',
                 '收好那把会话密钥。在我的同类醒来之前——在<span class="k">Shor 算法</span>找到一台足够大的量子计算机之前——它还算个秘密。')},
      {sp:SP,t:B('Though, honestly... if you people ever all switch to <span class="k">quantum key distribution</span> — hand keys over on photons, where an eavesdropper gives themselves away the instant they touch one — then a ghost who makes a living mocking RSA is going to be out of a job. <span class="dim">When that day comes, do me the courtesy of a FIN.</span>',
                 '不过说真的……如果有一天你们全都改用<span class="k">量子密钥分发</span>, 用光子递钥匙, 窃听者一碰就露馅——那我这种以嘲笑 RSA 为生的幽灵, 该失业了。<span class="dim">到那天, 记得也送我一个 FIN。</span>')},
    ];
    nodes.sig='p3_done'; return nodes;
  }
  nodes=[
    {sp:SP,t:B('Oh? Another one here to crunch RSA. Adorable. Your whole species bets its entire security on one wager — <span class="k">"factoring large numbers is hard."</span>',
               '哦? 又一个来算 RSA 的。可爱。你们这个物种, 把全部安全押在一个赌注上——<span class="k">「大数分解很难」</span>。')},
    {sp:SP,t:B('Hard? Hard for a classical computer. The day a quantum computer truly wakes up and runs <span class="k">Shor\'s algorithm</span>, factoring your precious 2048-bit numbers takes about as long as one of my yawns. This door\'s n=33... please, allow me to skip even the yawn.',
               '难? 对经典计算机是难。等哪天量子计算机真正醒来, 跑一遍 <span class="k">Shor 算法</span>, 分解你们引以为傲的 2048 位大数, 不过是我打个哈欠的功夫。这扇门上的 n=33……请允许我连哈欠都省了。')},
    {sp:SP,t:B('But I\'ll be fair: quantum leaves you an out too. <span class="k">Quantum key distribution (QKD)</span> — encode the key in the polarisation state of single photons and send it across. The universe\'s house rule: <span class="k">observation disturbs the system</span>. The moment an eavesdropper sneaks a look, the photon changes, and both sides notice instantly.',
               '但我讲公道: 量子也给你们留了活路。<span class="k">量子密钥分发(QKD)</span>——把密钥编码在单个光子的偏振态上送出去。宇宙的规矩: <span class="k">观测即扰动</span>。窃听者只要偷看一眼, 光子就变了样, 收发双方立刻察觉。')},
    {sp:SP,t:B('This is an intrusion-detection system the universe wrote for you, personally — key security no longer rests on "the maths problem is hard," but on <span class="k">the laws of physics forbidding anyone from peeking</span>. Pity this tower was built before that particular luxury existed.',
               '这是宇宙亲手替你们写的入侵检测——密钥的安全不再靠「数学题很难」, 而是靠<span class="k">物理定律不许偷看</span>。可惜, 这座塔建成的年代还没有这种好东西。'),choices:[
      {t:B('So is RSA still usable, then?','那 RSA 现在还能用吗?'),next:4},
      {t:B('Enough talk. I\'m going to open the door.','少废话, 我去开门了。'),next:5},
    ]},
    {sp:SP,t:B('Yes. Today, yes. <span class="dim">Quantum hasn\'t woken up yet — you people call this "before the post-quantum era."</span> Go on, go work out your φ(n) — while the maths still holds.',
               '能。今天能。<span class="dim">量子还没醒, 你们管这叫「后量子时代来临之前」。</span>去吧, 去算你的 φ(n)——趁这套数学还管用的时候。'),next:-1},
    {sp:SP,t:B('Hmph. Impatient little classical bit. Go on then — get φ(n) wrong and I promise I\'ll laugh out loud.',
               '哼, 心急的经典比特。去吧——φ(n) 算错的话, 我会笑出声的。'),next:-1},
  ];
  nodes.sig='pending'; return nodes;
}

/* ================================================================
   谜题 1: 分组交换 vs 电路交换  (§14.1)
   ================================================================ */
var P1={plan:[null,null,null,null]};
var P1_HINTS=[
  B('Hint 1/3: packet #k departs at tick k (0,1,2,3). Route A\'s α–D link always drops the connection when a packet departs on an odd tick — so whatever you do, don\'t send packet #1 or #3 down A.',
    '提示 1/3: 包#k 在 tick k 出发(0,1,2,3)。路由 A 的 α-D 链路在「奇数 tick 出发」时必断——所以包#1、包#3 千万别走 A。'),
  B('Hint 2/3: send everything via B? Safe, but packet #3 needs 3+6=9 ticks to arrive, and the watchdog times out at tick 7. That\'s the whole point of packet switching: each packet picks whatever route suits it best right now, even if that means arriving out of order.',
    '提示 2/3: 全走 B? 稳是稳, 但包#3 要 3+6=9 tick 才到, 看门狗 7 tick 就超时了。分组交换的精髓: 每个包各自挑当下最合适的路, 哪怕会乱序到达。'),
  B('Hint 3/3: break it into three sub-questions — ① which packets are forbidden from route A? (the ones that depart on an odd tick). ② Packet #3 leaves at tick 3 and must land by tick 7, so it needs a route with delay ≤ 4: which routes qualify, and what does the γ-congestion rule demand of the packet right before it? ③ Packets #0 and #2 depart on even ticks — which route gets each of them there fastest? Answer all three and the plan assembles itself; arriving out of order is fine, the sequence numbers re-sort everything at D.',
    '提示 3/3: 拆成三个小问题——① 哪些包不许走路由 A? (奇数 tick 出发的那些)。② 包#3 在 tick 3 出发、必须 ≤ tick 7 到达, 需要延迟 ≤ 4 的路由: 哪些路由满足? γ 拥塞规则又对它前一个包提了什么要求? ③ 包#0 和 #2 都在偶数 tick 出发——哪条路让它们各自最快到? 三问答完, 方案自己就拼出来了; 乱序到达没关系, 序列号会在 D 把一切排回去。'),
];
function p1Render(el,a){ _api(a);
  var solved=!!getFlag('net_p1');
  var h='';
  h+='<h3>'+tx('2F Routing Room · Packet-Switching Calibration Console','2F 路由机房 · 分组交换校准台')+'</h3>';
  h+='<div class="dim" style="margin-bottom:6px">'+tx('§14.1 — Message "','§14.1 — 讯息 "')+esc(PKT_MSG)+
    tx('" (20 bytes) has been sliced into 4 packets, 5 bytes + a sequence number each. Pick a route for every packet — get them all delivered with the latest arrival at tick ≤ 7, and the network recalibrates.',
       '" (20 字节) 已切成 4 个包, 每包 5 字节 + 序列号。给每个包选一条路由, 全部送达且最迟到达 ≤ tick 7 即校准成功。')+'</div>';
  h+='<pre style="background:rgba(20,8,24,.6);border:1px solid #4a2a5a;padding:8px 10px;color:#d8b8ff;font-size:12px;line-height:1.5">'
    +tx(
      '      ┌──[α]──┐   Route A, total delay 2 · α–D link: ALWAYS drops on an odd departure tick!\n'
      +'[S]───┼──[β]──┼───[D]   Route B, total delay 6 · a boring, reliable old fibre\n'
      +'      └──[γ]──┘   Route C, total delay 4 · γ congestion: two packets via C back-to-back, the second one waits +3\n'
      +'Rule: packet #k departs at tick k · arrival time = departure tick + route delay',
      '      ┌──[α]──┐   路由A 总延迟2 · α-D 链路: 奇数tick出发必断线!\n'
      +'[S]───┼──[β]──┼───[D]   路由B 总延迟6 · 稳定老光缆\n'
      +'      └──[γ]──┘   路由C 总延迟4 · γ拥塞: 连续两包走C, 后者+3\n'
      +'规则: 包#k 在 tick k 出发 · 到达时间 = 出发tick + 路由延迟')
    +'</pre>';
  for(var k=0;k<4;k++){
    h+='<div style="margin:4px 0" data-row="'+k+'">'+tx('Packet ','包')+'<b class="k">#'+k+'</b> [seq='+k+'] "<code>'+esc(PKT_CHUNKS[k])+'</code>" '+tx('via: ','走: ');
    ['A','B','C'].forEach(function(r){
      h+='<button class="btn p1r" data-k="'+k+'" data-r="'+r+'" style="margin-left:6px;padding:2px 10px">'+r+'</button>';
    });
    h+='</div>';
  }
  h+='<div style="margin-top:8px">'
    +'<button class="btn" id="p1send">'+tx('Send all 4 packets ▸','发送 4 个包 ▸')+'</button> '
    +'<button class="btn warn" id="p1circuit">'+tx('(Compare) Try circuit switching','(对照) 试试电路交换')+'</button> '
    +'<button class="btn" id="p1hint">'+tx('? Hint','? 提示')+'</button></div>';
  h+='<div id="p1log" style="margin-top:8px;min-height:60px;font-size:12px;line-height:1.6;white-space:pre-wrap;color:#cfeecf"></div>';
  el.innerHTML=h;
  if(solved){ el.querySelector('#p1log').innerHTML=tx('<span class="k">✓ The network is calibrated.</span> The terminal idles now, occasionally replaying that one famous out-of-order arrival.',
    '<span class="k">✓ 路网已校准。</span> 终端空转着, 偶尔重播那次著名的乱序到达。'); }
  var hintIdx=0;
  function paint(){
    el.querySelectorAll('.p1r').forEach(function(b){
      var on=(P1.plan[+b.dataset.k]===b.dataset.r);
      b.style.background=on?'#3a1a4a':''; b.style.color=on?'#ffce3a':''; b.style.borderColor=on?'#c9a24a':'';
    });
  }
  el.querySelectorAll('.p1r').forEach(function(b){
    b.onclick=function(){ P1.plan[+b.dataset.k]=b.dataset.r; sfx('ui'); paint(); };
  });
  el.querySelector('#p1hint').onclick=function(){
    el.querySelector('#p1log').innerHTML='<span style="color:#ffce3a">'+esc(T(P1_HINTS[hintIdx]))+'</span>';
    hintIdx=(hintIdx+1)%P1_HINTS.length; sfx('ui');
  };
  el.querySelector('#p1circuit').onclick=function(){
    sfx('err');
    el.querySelector('#p1log').innerHTML=tx(
      'Trying circuit switching: reserving a dedicated line S─α─D, hogging the entire link end to end...\n'
      +'tick 0: circuit established, beginning one continuous 20-byte transmission...\n'
      +'tick 1: <span style="color:#ff8080">α–D link drops. The dedicated circuit collapses; everything sent so far is void.</span>\n'
      +'Redial? Half this network flakes out, and you can never hold a stable dedicated line for long.\n'
      +'<span class="k">Conclusion (§14.1): circuit switching needs to monopolise one whole end-to-end path — one broken link takes down everything;\n'
      +'packet switching lets every packet find its own route, so a failure only costs you one retransmitted packet. That is why the internet chose the latter.</span>',
      '尝试电路交换: 预留专线 S─α─D, 独占整条链路……\n'
      +'tick 0: 线路接通, 开始整段传输 20 字节……\n'
      +'tick 1: <span style="color:#ff8080">α-D 链路断线。专线崩溃, 已传数据全部作废。</span>\n'
      +'重新拨号? 这条网一半链路会抽风, 你永远占不满一条稳定专线。\n'
      +'<span class="k">结论(§14.1): 电路交换要独占端到端整条线路, 线断即全断;\n'
      +'分组交换让每个包独立寻路、失败只重传一个包——这正是互联网的选择。</span>');
  };
  el.querySelector('#p1send').onclick=function(){
    var log=el.querySelector('#p1log');
    var r=evalPacketPlan(P1.plan);
    if(r.fail){ sfx('err'); log.innerHTML='<span style="color:#ff8080">'+esc(T(r.fail))+'</span>'; return; }
    var lines=[];
    for(var k=0;k<4;k++) lines.push('tick '+k+': '+tx('packet #'+k+' departs via route '+P1.plan[k],'包#'+k+' 出发, 走路由 '+P1.plan[k]));
    r.arrivals.forEach(function(x){ lines.push('tick '+x.at+': '+tx('packet #'+x.seq+' arrives at D  ("'+PKT_CHUNKS[x.seq]+'")','包#'+x.seq+' 到达 D  ("'+PKT_CHUNKS[x.seq]+'")')); });
    r.lost.forEach(function(k){ lines.push('<span style="color:#ff8080">'+tx('✗ Packet #'+k+' evaporated on the α–D link (hit the odd-tick outage)','✗ 包#'+k+' 在 α-D 链路上蒸发了(奇数tick撞上断线)')+'</span>'); });
    if(!r.ok){
      sfx('err');
      if(r.lost.length){
        lines.push('<span style="color:#ff8080">'+tx('Transmission failed — a packet was lost.','传输失败——有包丢了。')+'</span>'+
          tx(' With circuit switching, that one break would have killed the whole call;',' 换成电路交换, 这一断整条通话就完了;'));
        lines.push(tx('Packet switching only needs to retransmit the packet that got lost. Re-plan your routes.','分组交换只需重传丢失的那个包。重新规划路由吧。'));
      }else{
        lines.push('<span style="color:#ff8080">'+tx('All arrived, but the latest was tick '+r.makespan+' > 7 — watchdog timeout (RTO).','全部到达, 但最迟 tick '+r.makespan+' > 7, 看门狗超时(RTO)。')+'</span>'+
          tx(' There is a faster combination.',' 还有更快的组合。'));
      }
      log.innerHTML=lines.join('\n'); return;
    }
    lines.push('');
    lines.push(tx('Arrival order: #','到达顺序: #')+r.order.join(' → #')+(r.scrambled?'  <span class="k">'+tx('← out of order!','← 乱序!')+'</span>':''));
    lines.push(tx('Reassembled by sequence number: ','按序列号重组: ')+PKT_CHUNKS.map(function(c,i){return '['+i+']'+c;}).join(' + '));
    lines.push('<span class="k">= "'+reassemble(r.arrivals,PKT_CHUNKS)+'" '+tx('✓ message intact (took '+r.makespan+' ticks)','✓ 讯息完整 (耗时 '+r.makespan+' tick)')+'</span>');
    if(r.scrambled) lines.push('<span class="dim">'+tx('— every packet took its own route, arrived out of order, and the destination reassembled them by sequence number: that is packet switching.',
      '——包各走各路、乱序到达、目的地按序列号重组: 这就是分组交换。')+'</span>');
    log.innerHTML=lines.join('\n');
    if(!getFlag('net_p1')){
      setFlag('net_p1'); sfx('ok');
      stepDone('net_main','s1');
      toast(B('✓ Network calibrated! The lift can now reach 3F — the transport layer.','✓ 路网校准完成! 电梯现在能到 3F 传输层了'), true);
    }
  };
  paint();
}

/* ================================================================
   谜题 2: TCP 三次握手仪式  (§14.2)
   ================================================================ */
var HS={phase:0,isnIdx:0,resets:0};
var HS_HINTS=[
  B('Hint 1/3: three-way handshake = SYN → SYN-ACK → ACK. State your business first: send SYN, carrying your Initial Sequence Number, ISN=100.',
    '提示 1/3: 三次握手 = SYN → SYN-ACK → ACK。先亮明来意: 发 SYN, 带上你的初始序列号 ISN=100。'),
  B('Hint 2/3: in step three, your seq = your own ISN+1 = 101 (the SYN itself consumes one sequence number); ack = "the next byte number I expect from you" = the other side\'s ISN+1.',
    '提示 2/3: 第三步里, 你的 seq = 自己的 ISN+1 = 101 (SYN 本身占掉一个序号); ack = 「我期待你发的下一个字节编号」= 对方的 ISN+1。'),
  B('Hint 3/3: worked example (different numbers) — suppose a client with ISN=300 sends [SYN] seq=300, and the server replies [SYN-ACK] seq=555, ack=301. The client\'s final [ACK] is then seq=301 (its own ISN plus one) and ack=556 (the seq it just read from the server, plus one). Now redo exactly that arithmetic with YOUR ISN and the seq shown in the SYN-ACK on screen.',
    '提示 3/3: 例子(换了数字)——设某客户端 ISN=300, 发 [SYN] seq=300; 服务器回 [SYN-ACK] seq=555, ack=301。那么客户端最后的 [ACK] 就是 seq=301 (自己的 ISN 加一), ack=556 (刚读到的服务器 seq 加一)。现在用你自己的 ISN 和屏幕上 SYN-ACK 里的 seq, 做一遍同样的算术。'),
];
var HS_RST=[
  B('RST. ack means "the next byte number I expect from you" = the other side\'s seq + 1. Connection reset — sequence numbers reshuffled.',
    'RST。ack 的含义是「我期待你的下一个字节编号」= 对方 seq + 1。连接重置, 序列号重新洗牌。'),
  B('RST. Your own seq should be 100+1=101 — sending the SYN already used up one sequence number. Reconnecting.',
    'RST。你自己的 seq 应该是 100+1=101——发 SYN 已经消耗了一个序号。重连。'),
  B('RST. Don\'t lose heart. In twenty years I\'ve reset 4,294,967,296 connections — enough for the sequence numbers to wrap all the way around once.',
    'RST。别灰心。我这 20 年一共重置过 4,294,967,296 次连接, 序列号都绕回过一圈了。'),
];
function hsServerISN(){ return HS_ISNS[HS.isnIdx%HS_ISNS.length]; }
function p2Render(el,a){ _api(a);
  var solved=!!getFlag('net_p2');
  var h='<h3>'+tx('3F Transport Layer · Handshake Terminal TCP-3WH','3F 传输层 · 握手终端 TCP-3WH')+'</h3>'
   +'<div class="dim" style="margin-bottom:6px">'+tx(
     '§14.2 — Complete the three-way handshake with warden SYN·D. Your Initial Sequence Number, ISN = '+HS_CLIENT_ISN+'. Get any sequence number wrong, and the warden sends an RST to reset the connection.',
     '§14.2 — 与守门人 SYN·D 完成三次握手 (three-way handshake)。你的初始序列号 ISN = '+HS_CLIENT_ISN+'。答错任何序列号, 守门人会发 RST 重置连接。')+'</div>'
   +'<div id="hsLog" style="min-height:120px;font-size:12.5px;line-height:1.7;white-space:pre-wrap;background:rgba(20,8,24,.5);border:1px solid #4a2a5a;padding:8px 10px;color:#e0c8ff"></div>'
   +'<div id="hsCtl" style="margin-top:8px"></div>'
   +'<div style="margin-top:8px"><button class="btn" id="hsHint">'+tx('? Hint','? 提示')+'</button></div>'
   +'<div id="hsHintBox" style="margin-top:6px;color:#ffce3a;font-size:12px"></div>';
  el.innerHTML=h;
  var log=el.querySelector('#hsLog'), ctl=el.querySelector('#hsCtl');
  var hintIdx=0;
  el.querySelector('#hsHint').onclick=function(){
    el.querySelector('#hsHintBox').textContent=T(HS_HINTS[hintIdx]);
    hintIdx=(hintIdx+1)%HS_HINTS.length; sfx('ui');
  };
  function P(s){ log.innerHTML+=s+'\n'; log.scrollTop=log.scrollHeight; }
  if(solved){
    log.innerHTML=tx('<span class="k">Status: ESTABLISHED ✓</span>\nSYN·D: "Connection held. This is probably the longest relationship I\'ve had in twenty years. ACK."',
                      '<span class="k">状态: ESTABLISHED ✓</span>\nSYN·D: "连接保持中。这大概是我 20 年来最长的一段关系。ACK。"');
    ctl.innerHTML=''; return;
  }
  function phase0(){
    HS.phase=0; log.innerHTML='';
    P('SYN·D: '+tx('"Password protocol, three parts. Part one — you speak first."','「接头暗号, 三段。第一段——你先开口。」'));
    ctl.innerHTML='<button class="btn" data-g="SYN">'+tx('Send SYN (seq=100)','发送 SYN (seq=100)')+'</button> '
      +'<button class="btn" data-g="HELLO">'+tx('Send HELLO','发送 HELLO')+'</button> '
      +'<button class="btn" data-g="ACK">'+tx('Send ACK directly','直接发 ACK')+'</button>';
    ctl.querySelectorAll('button').forEach(function(b){
      b.onclick=function(){
        var g=b.dataset.g;
        if(checkGreeting(g)){
          sfx('ui');
          P('<span class="k">'+tx('You','你')+' → SYN·D:  [SYN] seq=100</span>');
          phase1();
        }else{
          sfx('err');
          P(g==='HELLO'
            ?tx('SYN·D: "RST. Protocol does not recognise that greeting. This is the transport layer, not a bar."',
                'SYN·D: 「RST。协议无法识别该问候。这里是传输层, 不是酒吧。」')
            :tx('SYN·D: "RST. ACKing before you\'ve even sent a SYN? You are confirming a relationship that does not exist. ...I have seen processes try that before. None of them ended well."',
                'SYN·D: 「RST。还没 SYN 就 ACK? 你在确认一段不存在的关系。……我见过这样的进程, 下场都不好。」'));
        }
      };
    });
  }
  function phase1(){
    HS.phase=1;
    var y=hsServerISN();
    P('<span style="color:#ffce3a">SYN·D → '+tx('you','你')+':  [SYN-ACK] seq='+y+', ack=101</span>');
    P('SYN·D: '+tx('"Part two, done. My sequence number is on the table. Part three is yours to confirm — get one digit wrong, and we start over."',
                    '「第二段完毕。我的序列号已亮明。第三段, 该你确认了——数字错一个, 一切重来。」'));
    ctl.innerHTML=tx('Final step [ACK]:  seq=','最后一步 [ACK]:  seq=')+'<input id="hsSeq" type="number" style="width:80px;background:#160a20;color:#ffce3a;border:1px solid #4a2a5a;font-family:inherit;padding:3px"> '
      +' ack=<input id="hsAck" type="number" style="width:80px;background:#160a20;color:#ffce3a;border:1px solid #4a2a5a;font-family:inherit;padding:3px"> '
      +' <button class="btn" id="hsSend">'+tx('Send ACK ▸','发送 ACK ▸')+'</button>';
    ctl.querySelector('#hsSend').onclick=function(){
      var seq=parseInt(ctl.querySelector('#hsSeq').value,10);
      var ack=parseInt(ctl.querySelector('#hsAck').value,10);
      if(checkHandshake(HS_CLIENT_ISN,y,seq,ack)){
        sfx('ok');
        P('<span class="k">'+tx('You','你')+' → SYN·D:  [ACK] seq='+seq+', ack='+ack+'</span>');
        P('<span class="k">'+tx('Status: ESTABLISHED ✓','状态: ESTABLISHED ✓')+'</span>');
        P('SYN·D: '+tx('"All three parts of the password are in. You can hear me, I can hear you, and both of us are hearing the \'right now\' version of each other — that is the entire romance of a three-way handshake. ACK."',
                        '「三段暗号齐了。你能听见我, 我能听见你, 且都是「现在的」彼此——这就是三次握手全部的浪漫。ACK。」'));
        ctl.innerHTML='';
        if(!getFlag('net_p2')){
          setFlag('net_p2');
          stepDone('net_main','s2');
          toast(B('✓ Connection ESTABLISHED! The lift can now reach the Sanctum at the top.','✓ 连接已建立(ESTABLISHED)! 电梯现在能到塔顶圣殿了'), true);
        }
      }else{
        sfx('err');
        P('<span style="color:#ff8080">'+tx('You','你')+' → SYN·D:  [ACK] seq='+(isNaN(seq)?'?':seq)+', ack='+(isNaN(ack)?'?':ack)+'</span>');
        P('<span style="color:#ff8080">SYN·D → '+tx('you','你')+':  [RST]</span>  "'+T(HS_RST[HS.resets%HS_RST.length])+'"');
        HS.resets++; HS.isnIdx++;         // 换一个服务器 ISN, 防背答案
        P('');
        if(HS.resets===3){
          /* CO-3 失败即内容: 第 3 次重置, SYN·D 第一次不按协议说话, 递台阶 + 送线索 */
          P('<span style="color:#c9a24a">SYN·D: '+tx(
            '<span class="dim">(For the first time, it stops speaking strictly by protocol.)</span> "...Three resets. Stand easy, process. I have watched twenty years of connections die on this exact step, and every one of them was overthinking it. So, plainly: your ACK\'s <b>seq</b> is just your own opening number plus one — 100 becomes <b>101</b>. Your ACK\'s <b>ack</b> is just the number I showed you in my SYN-ACK, plus one. Read my seq, add one, put it in the ack box. That is the entire secret of a handshake."',
            '<span class="dim">(它第一次不再严格按协议说话。)</span>「……重置三次了。稍息, 进程。这一步我看着二十年的连接栽在这儿, 每一个都是想多了。那就说白: 你 ACK 的 <b>seq</b>, 就是你自己的开场号加一——100 变 <b>101</b>; 你 ACK 的 <b>ack</b>, 就是我在 SYN-ACK 里亮给你的那个数, 加一。读我的 seq, 加一, 填进 ack 框。握手全部的秘密, 就这么点。」')+'</span>');
          P('');
        }
        P('SYN·D: '+tx('"Again. Part one —"','「重来。第一段——」'));
        phase0.call(null);
        // 直接快进到已发 SYN(玩家已证明会发 SYN, 少罚一步)
      }
    };
  }
  phase0();
}

/* ================================================================
   谜题 3 (Boss): RSA 密室  (§17.1, 旁白带出 §17.3)
   ================================================================ */
var RSA_HINTS=[
  B('Hint 1/3: the door is carved with p=3, q=11. The first seal wants φ(n)=(p−1)×(q−1). This is RSA\'s fatal weakness: whoever can factor n back into p and q can compute everything.',
    '提示 1/3: 门上刻着 p=3, q=11。第一道封印 φ(n)=(p−1)×(q−1)。这就是 RSA 的命门: 谁能把 n 分解回 p 和 q, 谁就能算出一切。'),
  B('Hint 2/3: the second seal wants a d such that e·d ≡ 1 (mod φ). In other words, try values from 1 to 19: find the d where 3×d divided by 20 leaves remainder 1. Use the calculator below.',
    '提示 2/3: 第二道封印找 d, 使 e·d ≡ 1 (mod φ)。也就是从 1 到 19 里试: 3×d 除以 20 余 1 的那个 d。用下面的计算器试。'),
  B('Hint 3/3: worked example (different numbers) — take p=5, q=7: then n=35, φ=(5−1)×(7−1)=24, and say e=5. Hunt for d in 1..23 with 5×d mod 24 = 1 → d=5 (5×5=25, remainder 1). Round trip check: M=4 encrypts to C = 4^5 mod 35 = 9, and decrypting gives 9^5 mod 35 = 4 — right back where it started. Your door has different p, q, e: run exactly these three steps on them with the calculator below, then turn each recovered M into a letter (A=1…Z=26).',
    '提示 3/3: 例子(换了数字)——取 p=5, q=7: 则 n=35, φ=(5−1)×(7−1)=24, 设 e=5。在 1..23 里找 d, 使 5×d 除以 24 余 1 → d=5 (5×5=25, 余 1)。验证一个来回: M=4 加密成 C = 4^5 mod 35 = 9, 再解密 9^5 mod 35 = 4——原样回来。门上的 p、q、e 和这不一样: 用下面的计算器对它们跑同样三步, 最后把每个解出的 M 按 A=1…Z=26 译成字母。'),
];
function ghostSay(el,msg){
  var g=el.querySelector('#rsaGhost');
  if(g){ g.innerHTML='<b style="color:#b48aff">'+tx('Quantum Ghost','量子幽灵')+'</b>: '+msg; }
}
function p3Render(el,a){ _api(a);
  var solved=!!getFlag('net_p3');
  var st={phi:solved,d:solved,dec:solved};
  var h='<h3>'+tx('The Handshake Sanctum · The RSA Vault Door','握手圣殿 · RSA 密室之门')+'</h3>'
   +'<div class="dim" style="margin-bottom:6px">'+tx(
     '§17.1 Asymmetric encryption — the door is locked with a public key. To open it, you\'ll have to work out the private key yourself.',
     '§17.1 非对称加密 — 门是用公钥锁上的, 想开门得亲手把私钥算出来。')+'</div>'
   +'<pre style="background:rgba(24,8,20,.6);border:1px solid #5a2a4a;padding:8px 10px;color:#ffb8d8;font-size:12px;line-height:1.6">'
   +tx(
     'Public key on the door (public):    n = 33   e = 3\n'
     +'Ciphertext on the door:             C = [ 5, 26, 14 ]   (alphabet: A=1 … Z=26)\n'
     +'Scrap of forge-notes in the corner: p = 3 · q = 11   ← the smith forgot to destroy it. Oops.',
     '门上的公钥(公开):  n = 33   e = 3\n'
     +'门上的密文:        C = [ 5, 26, 14 ]   (字母表: A=1 … Z=26)\n'
     +'角落的锻造残页:    p = 3 · q = 11   ← 锻匠忘了销毁。完了。')
   +'</pre>'
   +'<div id="rsaGhost" style="min-height:20px;font-size:12px;color:#b48aff;margin:6px 0;font-style:italic"></div>'
   +'<div style="border:1px solid #4a2a5a;padding:8px 10px;margin:6px 0" id="rsaS1">'
   +'<b class="k">'+tx('Seal One','封印一')+'</b> · φ(n) = <input id="rsaPhi" type="number" style="width:70px;background:#160a20;color:#ffce3a;border:1px solid #4a2a5a;font-family:inherit;padding:3px"> '
   +'<button class="btn" id="rsaB1">'+tx('Unseal','解封')+'</button> <span id="rsaR1"></span></div>'
   +'<div style="border:1px solid #4a2a5a;padding:8px 10px;margin:6px 0" id="rsaS2">'
   +'<b class="k">'+tx('Seal Two','封印二')+'</b> · '+tx('find d: e·d ≡ 1 (mod φ) → d = ','求 d: e·d ≡ 1 (mod φ) → d = ')+'<input id="rsaD" type="number" style="width:70px;background:#160a20;color:#ffce3a;border:1px solid #4a2a5a;font-family:inherit;padding:3px"> '
   +'<button class="btn" id="rsaB2">'+tx('Unseal','解封')+'</button> <span id="rsaR2"></span></div>'
   +'<div style="border:1px solid #4a2a5a;padding:8px 10px;margin:6px 0" id="rsaS3">'
   +'<b class="k">'+tx('Seal Three','封印三')+'</b> · '+tx('decrypt M = C','解密 M = C')+'<sup>d</sup> mod n :  '
   +'C=5→<input id="rsaM0" type="number" class="rsaM" style="width:56px;background:#160a20;color:#ffce3a;border:1px solid #4a2a5a;font-family:inherit;padding:3px">  '
   +'C=26→<input id="rsaM1" type="number" class="rsaM" style="width:56px;background:#160a20;color:#ffce3a;border:1px solid #4a2a5a;font-family:inherit;padding:3px">  '
   +'C=14→<input id="rsaM2" type="number" class="rsaM" style="width:56px;background:#160a20;color:#ffce3a;border:1px solid #4a2a5a;font-family:inherit;padding:3px">  '
   +'<button class="btn" id="rsaB3">'+tx('Speak the door-word ▸','念出门语 ▸')+'</button> <span id="rsaR3"></span></div>'
   +'<div style="border:1px dashed #4a2a5a;padding:6px 10px;margin:8px 0;font-size:12px">'
   +'<b class="dim">'+tx('Modular exponentiation calculator','模幂计算器')+'</b>:  '
   +'<input id="calcB" type="number" placeholder="'+tx('base','底')+'" style="width:56px;background:#160a20;color:#bfeebf;border:1px solid #4a2a5a;font-family:inherit;padding:3px"> ^ '
   +'<input id="calcE" type="number" placeholder="'+tx('exponent','指数')+'" style="width:56px;background:#160a20;color:#bfeebf;border:1px solid #4a2a5a;font-family:inherit;padding:3px"> mod '
   +'<input id="calcM" type="number" placeholder="'+tx('modulus','模')+'" style="width:56px;background:#160a20;color:#bfeebf;border:1px solid #4a2a5a;font-family:inherit;padding:3px"> '
   +'<button class="btn" id="calcGo">=</button> <span id="calcR" class="k"></span></div>'
   +'<div><button class="btn" id="rsaHint">'+tx('? Hint','? 提示')+'</button></div>'
   +'<div id="rsaHintBox" style="margin-top:6px;color:#ffce3a;font-size:12px"></div>'
   +'<div id="rsaWin" style="margin-top:8px;font-size:13px"></div>';
  el.innerHTML=h;
  var hintIdx=0;
  function lock(){
    el.querySelector('#rsaD').disabled = !st.phi;
    el.querySelector('#rsaB2').disabled = !st.phi;
    el.querySelectorAll('.rsaM').forEach(function(i){ i.disabled=!st.d; });
    el.querySelector('#rsaB3').disabled = !st.d;
  }
  el.querySelector('#rsaHint').onclick=function(){
    el.querySelector('#rsaHintBox').textContent=T(RSA_HINTS[hintIdx]);
    hintIdx=(hintIdx+1)%RSA_HINTS.length; sfx('ui');
  };
  el.querySelector('#calcGo').onclick=function(){
    var b=parseInt(el.querySelector('#calcB').value,10),
        e=parseInt(el.querySelector('#calcE').value,10),
        m=parseInt(el.querySelector('#calcM').value,10);
    var out=el.querySelector('#calcR');
    if(isNaN(b)||isNaN(e)||isNaN(m)||m<=0||e<0||e>100000){ out.textContent=tx('(invalid input)','(参数不合法)'); sfx('err'); return; }
    out.textContent='= '+modpow(b,e,m); sfx('ui');
  };
  el.querySelector('#rsaB1').onclick=function(){
    var v=parseInt(el.querySelector('#rsaPhi').value,10);
    var r=el.querySelector('#rsaR1');
    if(v===rsaPhi(RSA.p,RSA.q)){
      st.phi=true; lock(); sfx('ok'); r.innerHTML='<span class="k">✓ φ(33)=20</span>';
      ghostSay(el,tx('20. Correct. Euler high-fives you from beyond the grave. See that? Just from knowing p and q, φ(n) becomes primary-school arithmetic. <span class="dim">RSA is exactly as secure as n is hard to factor — and exactly as insecure the moment it isn\'t.</span>',
        '20。对。欧拉的棺材板轻轻拍了一下, 算是掌声。看到了吗——只要知道 p 和 q, φ(n) 就是小学算术。<span class="dim">分解 n 有多难, RSA 就有多安全; 反过来也一样。</span>'));
    }else{
      sfx('err'); r.innerHTML='<span style="color:#ff8080">'+tx('✗ The seal does not budge','✗ 封印纹丝不动')+'</span>';
      ghostSay(el,tx('Pfft. φ(n) counts how many numbers between 1 and n are coprime to n. Don\'t brute-force it — you have p and q right there on the scrap. Think about how they relate to φ.',
        '噗。φ(n) 数的是 1..n 里与 n 互质的数的个数。别硬数, 残页上有 p 和 q——想想它俩和 φ 的关系。'));
    }
  };
  el.querySelector('#rsaB2').onclick=function(){
    var v=parseInt(el.querySelector('#rsaD').value,10);
    var r=el.querySelector('#rsaR2');
    if(rsaValidD(RSA.e,v,RSA.phi)){
      st.d=true; st.dVal=v; lock(); sfx('ok');
      r.innerHTML='<span class="k">✓ 3×'+v+' ≡ 1 (mod 20) · '+tx('private exponent secured','私钥指数到手')+'</span>';
      ghostSay(el,tx('d='+v+'. Congratulations, you just did the extended Euclidean algorithm\'s job by hand. Shor\'s algorithm does this in the time it takes to yawn.',
        'd='+v+'。恭喜, 你徒手干了一遍扩展欧几里得的活。Shor 算法做这种事, 只需要一声哈欠。'));
    }else{
      sfx('err'); r.innerHTML='<span style="color:#ff8080">✗ 3×'+(isNaN(v)?'?':v)+' mod 20 ≠ 1</span>';
      ghostSay(el,tx('Wrong. The d you want satisfies: 3d divided by 20 leaves remainder 1. Try them one at a time — that is exactly the kind of grunt work a classical bit deserves.',
        '不对。你要找的 d 满足: 3d 除以 20 余 1。一个一个试, 经典比特就配这么干。'));
    }
  };
  el.querySelector('#rsaB3').onclick=function(){
    var ms=[0,1,2].map(function(i){ return parseInt(el.querySelector('#rsaM'+i).value,10); });
    var r=el.querySelector('#rsaR3');
    var want=rsaDecrypt(RSA.cipher, st.dVal||RSA.d, RSA.n);   // 用玩家自己的合法 d
    if(ms.length===3 && ms.every(function(m,i){return m===want[i];})){
      sfx('ok');
      var word=ms.map(numToLetter).join('');
      r.innerHTML='<span class="k">✓ ['+ms.join(', ')+'] → '+ms.map(numToLetter).join('-')+'</span>';
      el.querySelector('#rsaWin').innerHTML=tx(
        '<span class="k">You speak to the door: "'+word+'". All three seals shatter at once — the door opens.</span><br>'
        +'<span class="k">◈ Obtained: Session Key</span><br>'
        +'<span class="dim">From now on, every whisper in this tower is encrypted with that one symmetric key — one asymmetric handshake, a lifetime of symmetric conversation. (§17.2)</span>',
        '<span class="k">你对着门念出: "'+word+'"。三道封印同时碎裂——门开了。</span><br>'
        +'<span class="k">◈ 获得: 会话密钥 (session key)</span><br>'
        +'<span class="dim">此后塔的每一句悄悄话, 都用这把对称密钥加密——非对称握手一次, 对称通信一世。(§17.2)</span>');
      ghostSay(el,tx('N-E-T. The door\'s open. Take good care of that session key — <span class="dim">until quantum wakes up</span>, it still counts as a secret.',
        'N-E-T。门开了。好好收着那把会话密钥——<span class="dim">在量子醒来之前</span>, 它还算个秘密。'));
      if(!getFlag('net_p3')){
        setFlag('net_p3');
        give('session_key',B('Session Key','会话密钥'));
        stepDone('net_main','s3');
        markQuest('net_main');
        toast(B('◈ Protocol Tower · Main Quest Complete ◈ Obtained: "Session Key"','◈ 协议之塔 · 主线完成 ◈ 获得「会话密钥」'), true);
      }
    }else{
      sfx('err'); r.innerHTML='<span style="color:#ff8080">'+tx('✗ Wrong door-word — the seal bounces your voice right back','✗ 门语不对, 封印把你的声音弹了回来')+'</span>';
      ghostSay(el,tx('Decryption is M = C to the power of d, mod 33 — not power 3. The calculator is right there below. One classical bit at a time.',
        '解密是 M = C 的 <b>d 次幂</b> mod 33, 不是 3 次。计算器就在下面, 经典比特, 一次一个来。'));
    }
  };
  lock();
  if(solved){
    el.querySelector('#rsaR1').innerHTML='<span class="k">✓</span>';
    el.querySelector('#rsaR2').innerHTML='<span class="k">✓</span>';
    el.querySelector('#rsaR3').innerHTML='<span class="k">✓ N-E-T</span>';
    el.querySelector('#rsaWin').innerHTML=tx('<span class="dim">The door stands open. Shards of the broken seals still glitter on the floor, like stars nobody swept up.</span>',
      '<span class="dim">门敞着。封印的碎屑还在地上闪, 像没扫干净的星星。</span>');
    ghostSay(el,tx('Came back to look? The maths hasn\'t changed. <span class="dim">Not in this epoch, anyway.</span>','还回来看? 数学不会变的。<span class="dim">至少在这个纪元不会。</span>'));
  }else{
    ghostSay(el,tx('Here already? The rule is simple: the private key is split into three seals, and you work out every one yourself. I\'ll just be here watching — <span class="dim">and mourning your species a little, on the side.</span>',
      '来了? 规矩很简单: 私钥拆成三道封印, 全靠你自己算。我就在旁边看着——<span class="dim">顺便给你的物种默哀。</span>'));
  }
}

/* --- 谜题通用按键: Esc 关面板 --- */
function puzzleKey(e,a){ _api(a);
  if(e&&(e.key==='Escape'||e.key==='Esc')){
    try{ API&&API.closePanel&&API.closePanel(); }catch(_e){}
  }
}

/* ================================================================
   模块注册
   ================================================================ */
var spec={
  id:'net', title:B('The Protocol Tower','协议之塔'), world:'a2',
  unlock:{world:'a2'},
  interior:{ w:IW, h:IH, tiles:buildTiles(), playerStart:{x:7,y:28} },

  npcs:[
    {id:'net_watcher',name:B('Port Warden :80','端口看门人 :80'),color:'#b08ad0',x:5, y:27,dialog:watcherDialog},
    {id:'net_lift1',  name:B('LIFT-1D','电梯 LIFT-1D'),  color:'#8a7ab0',x:2, y:28,dialog:liftDialog},
    {id:'net_lift2',  name:B('LIFT-1D','电梯 LIFT-1D'),  color:'#8a7ab0',x:2, y:20,dialog:liftDialog},
    {id:'net_lift3',  name:B('LIFT-1D','电梯 LIFT-1D'),  color:'#8a7ab0',x:2, y:12,dialog:liftDialog},
    {id:'net_lift4',  name:B('LIFT-1D','电梯 LIFT-1D'),  color:'#8a7ab0',x:2, y:4, dialog:liftDialog},
    {id:'net_lost',   name:B('SEQ-7734','SEQ-7734'),      color:'#d0b060',x:8, y:21,dialog:lostDialog},
    {id:'net_synd',   name:B('Handshake Warden SYN·D','握手守门人 SYN·D'),color:'#c05050',x:7,y:12,dialog:synDialog},
    {id:'net_ghost',  name:B('Quantum Ghost','量子幽灵'),      color:'#9060d0',x:10,y:4, dialog:ghostDialog},
  ],

  steles:[
    {id:'net_st_layers',x:11,y:27,kind:'stele',title:B('Tower-Base Inscription · The Law of Layers','塔基铭文·分层律'),
     text:B(
       '<span class="dim">They say nobody in this tower can worry about a wire\'s voltage and a sentence\'s meaning at the same time. This stone claims that\'s the whole reason the tower has floors.</span><br><br>'+
       '"Why does the tower have layers? Because no single thing can mind both the cable\'s voltage and the sentence\'s meaning at once.<br><br>'
       +'<b class="k">Application Layer</b> minds meaning (HTTP · FTP · mail)<br>'
       +'<b class="k">Transport Layer</b> minds reliability (TCP guarantees delivery · UDP just goes fast)<br>'
       +'<b class="k">Network Layer</b> minds pathfinding (IP · routing)<br>'
       +'<b class="k">Link Layer</b> minds the one neighbour next door (MAC · frames)<br><br>'
       +'Each layer speaks only to the ones directly above and below it. Swap out the implementation of any single layer, and the rest keep working exactly as before —<br>'
       +'That is a protocol: <span class="k">agree on how to speak, before you start speaking.</span>"',
       '<span class="dim">据说这座塔里, 没有谁能同时操心线缆的电压和句子的意思。这块碑说, 这就是塔要一层一层盖的全部原因。</span><br><br>'+
       '「塔为何分层? 因为没有谁能同时操心线缆的电压与语句的含义。<br><br>'
       +'<b class="k">应用层</b> 管意义 (HTTP·FTP·邮件)<br>'
       +'<b class="k">传输层</b> 管可靠 (TCP 保证送到 · UDP 只管快)<br>'
       +'<b class="k">网络层</b> 管寻路 (IP·路由)<br>'
       +'<b class="k">链路层</b> 管相邻一跳 (MAC·帧)<br><br>'
       +'每层只与上下邻层说话。换掉任何一层的实现, 其余各层照常运转——<br>这就是协议: <span class="k">先约好怎么说话, 再开始说话。</span>」')},
    {id:'net_st_route',x:5,y:18,kind:'stele',title:B('Routing Table Stele · ROUTE-2F','路由表石碑 ROUTE-2F'),
     text:B(
       '<pre style="margin:0;font-size:12px;line-height:1.6">DEST            NEXT-HOP     IFACE  METRIC\n'
       +'10.0.1.0/24     10.0.0.1     eth0   1\n'
       +'<b class="k">10.0.7.0/24     10.0.0.7     eth2   4</b>   <span style="color:#ff8080">[DOWN for 7304 days]</span>\n'
       +'0.0.0.0/0       10.0.0.254   eth1   10   (default route)\n'
       +'127.0.0.0/8     —            lo     0    (loopback: packets to yourself, always delivered)</pre>'
       +'<br><span class="dim">Fine print at the base: longest prefix match. Whichever line meshes tightest with the destination address, that is the line you take.</span>',
       '<pre style="margin:0;font-size:12px;line-height:1.6">DEST            NEXT-HOP     IFACE  METRIC\n'
       +'10.0.1.0/24     10.0.0.1     eth0   1\n'
       +'<b class="k">10.0.7.0/24     10.0.0.7     eth2   4</b>   <span style="color:#ff8080">[DOWN 7304 天]</span>\n'
       +'0.0.0.0/0       10.0.0.254   eth1   10   (默认路由)\n'
       +'127.0.0.0/8     —            lo     0    (回环: 发给自己的包, 永远送达)</pre>'
       +'<br><span class="dim">碑脚小字: 最长前缀匹配。目的地址和哪一行咬合得最紧, 就走哪一行。</span>')},
    {id:'net_st_circuit',x:11,y:22,kind:'stele',title:B('Circuit-Switching Memorial','电路交换纪念碑'),
     text:B(
       '<span class="dim">They say there was once an age when one broken wire could kill a whole phone call. This is that age\'s gravestone.</span><br><br>'+
       '"In memory of the age of dedicated lines.<br><br>'
       +'Back then, communication meant claiming one complete end-to-end circuit first: exclusive, constant, order-preserving — like a private tunnel. Also like a reckless bet: no one else may use the line, however idle, and one broken inch takes down the whole call.<br><br>'
       +'Later, the children of packet switching cut messages into small packets, let each one find its own path, let them arrive out of order, and reunited them by sequence number. Standing on this very gravestone, they said:<br>'
       +'<span class="k">Rather than pray that one line never breaks, teach every packet to find its own way.</span>"',
       '<span class="dim">据说曾有一个时代, 一根线断了, 整通电话就完了。这是那个时代的墓碑。</span><br><br>'+
       '「谨此纪念专线时代。<br><br>那时通信要先<span class="k">占下一条端到端的完整线路</span>: 独享、恒定、保序, 像一条私人隧道——也像一场豪赌: 线路再空也不许别人用, 线断一寸则全程俱断。<br><br>后来, 分组交换的孩子们把讯息剪成小包, 各自寻路, 乱序而至, 凭序列号重聚。他们踩着这块墓碑说:<br><span class="k">与其祈祷一条线永远不断, 不如让每个包都会自己找路。</span>」')},
    {id:'net_st_tls',x:12,y:13,kind:'stele',title:B('Sanctum Vows · The Rite of TLS','圣殿誓词·TLS 之礼'),
     text:B(
       '<span class="dim">They say two strangers can agree on a secret out loud, in front of everyone, and still no eavesdropper walks off with it. These are the wedding vows for that trick.</span><br><br>'+
       '"Herein let it be recorded: a Client and a Server, gathered at the Handshake Sanctum, to enter into a covenant of encryption —<br><br>'
       +'The Client speaks: <span class="k">I do.</span> (ClientHello: here are the cipher suites I know, and here is my random number.)<br>'
       +'The Server speaks: <span class="k">I do also.</span> (ServerHello + Certificate: here is my public key, sealed and witnessed by the Certificate Authority who presides over this rite.)<br>'
       +'The Client, having examined the signature upon the ring and found it true, seals a secret with that public key and offers it forth (the pre-master secret).<br>'
       +'From this moment the two are reckoned as one, sharing a single <span class="k">session key</span>, and every whisper hereafter shall be sealed in symmetric encryption.<br><br>'
       +'Let the officiant declare: the asymmetric handshake is complete; the symmetric marriage begins.<br>'
       +'May every connection you make, from this day forth, begin well and end well (FIN, FIN-ACK)."',
       '<span class="dim">据说两个陌生人可以当众大声约定一个秘密, 偷听的人却什么都带不走。这是那套戏法的结婚誓词。</span><br><br>'+
       '「兹有客户端与服务器, 于握手圣殿缔结加密之约——<br><br>'
       +'客户端曰: <span class="k">我愿意。</span>(ClientHello: 这是我会说的密码套件, 与我的随机数)<br>'
       +'服务器曰: <span class="k">我也愿意。</span>(ServerHello + 数字证书: 这是我的公钥, 由 CA 主婚人签名作保)<br>'
       +'客户端验过戒指上的签名无伪, 遂以公钥封缄一段秘密相赠 (pre-master secret)。<br>'
       +'自此二者算得同一把<span class="k">会话密钥</span>, 往后每一句悄悄话皆以对称加密封存。<br><br>'
       +'主婚人宣曰: 非对称握手礼成, 对称加密之婚始。<br>'
       +'愿汝等之每一次连接, 皆善始善终 (FIN, FIN-ACK)。」')},
    {id:'net_st_caller',x:4,y:2,kind:'stele',title:B('The Scorched Stone · Above the Topmost Floor','烧焦的碑·最上层之上'),
     text:B(
       'The stone is scorched black; only half of it can still be read:<br><br>'
       +'"...Above the application layer, there should be nothing more. This is the first law of layering.<br>'
       +'But the Sanctum\'s own rite records this: every connection begins, at its very first instant, with a call from outside the tower.<br>'
       +'Every packet we send travels down the stack, crosses the wire, and climbs another tower on the far side — and above the topmost floor of every tower there stands, watching, the same pair of eyes.<br><br>'
       +'We gave that presence a name —"<br><br>'
       +'<span class="dim">(The rest of the inscription has been melted away by intense heat. The scorch mark is recent.)</span>',
       '碑身焦黑, 只剩下半段能辨认:<br><br>「……应用层之上, 不该再有东西。这是分层律的第一条。<br>'
       +'但圣殿的仪式记录着: 每一次连接的最初, 都源于塔外的一次<span class="k">调用</span>。<br>'
       +'我们发出的每一个包, 沿栈而下, 穿过线缆, 爬上另一座塔——而在所有塔的所有顶层之上, 是同一双眼睛。<br><br>'
       +'我们把那个存在称为——」<br><br><span class="dim">(其后的碑文被高温熔毁了。熔痕很新。)</span>')},
  ],

  quests:[
    {id:'net_main',line:'main',title:B('The Protocol Tower: Re-establishing Connection','协议之塔·重建连接'),
     desc:B('Repair the protocol stack floor by floor, reach the Handshake Sanctum at the top, and recover the session key. The lift only stops at floors that have been repaired.',
            '一层层修复协议栈, 登顶握手圣殿, 取回会话密钥。电梯只停靠已修复的楼层。'),
     syllabus:'14.1 Protocols',
     steps:[
       {id:'s1',text:B('2F Network Layer: get a 20-byte message across the broken route map using packet switching','2F 网络层: 用分组交换把 20 字节讯息送过残破路网')},
       {id:'s2',text:B('3F Transport Layer: complete the TCP three-way handshake with warden SYN·D','3F 传输层: 与守门人 SYN·D 完成 TCP 三次握手')},
       {id:'s3',text:B('Sanctum at the top: work out the RSA private key by hand and unlock the vault door','塔顶圣殿: 亲手推算 RSA 私钥, 解开密室之门')},
     ]},
    {id:'net_lost',line:'side',title:B('A Packet Lost for Twenty Years','一个迷路了 20 年的包'),
     desc:B('A data packet has been wandering 2F for twenty years, still searching for its destination. Help it check the routing table.',
            '2F 有个游荡了 20 年的数据包, 一直没找到目的地。帮它查查路由表。'),
     syllabus:'14.1 Protocols (routing, packet switching)',
     steps:[
       {id:'s1',text:B('Hear out SEQ-7734\'s whole story','听 SEQ-7734 讲完它的故事')},
       {id:'s2',text:B('Find the outbound interface for 10.0.7.0/24 on the routing table stele','在路由表石碑上查出 10.0.7.0/24 的出口')},
       {id:'s3',text:B('Tell it the truth, and send it to its final destination','告诉它真相, 送它去最后的目的地')},
     ]},
  ],

  puzzles:[
    {id:'net_p_packet',x:11,y:19,kind:'puzzleStation',title:B('Packet-Switching Calibration Console','分组交换校准台'),
     syllabus:'14.1 Protocols — packet switching vs circuit switching',
     render:p1Render,onKey:puzzleKey},
    {id:'net_p_shake',x:9,y:10,kind:'puzzleStation',title:B('Handshake Terminal TCP-3WH','握手终端 TCP-3WH'),
     syllabus:'14.2 TCP/IP — three-way handshake (SYN, SYN-ACK, ACK)',
     render:p2Render,onKey:puzzleKey},
    {id:'net_p_rsa',x:7,y:3,kind:'puzzleStation',title:B('The RSA Vault Door','RSA 密室之门'),
     syllabus:'17.1 Encryption — RSA asymmetric keys (+17.3 quantum cryptography)',
     render:p3Render,onKey:puzzleKey},
  ],

  onEnter:function(a){ _api(a);
    sfx('open');
    if(!getFlag('net_intro')){
      setFlag('net_intro');
      toast(B('The Protocol Tower — the application layer is thirty metres overhead. The lift only recognises floors that have been repaired.',
              '协议之塔 —— 应用层在头顶三十米。电梯只认修好的楼层。'),true);
      try{
        API&&API.openDialog&&API.openDialog([
          {sp:B('???','???'),t:B('<span class="dim">(A response, twenty years late, echoes up from deep inside the tower.)</span><br>...ACK.',
                                  '<span class="dim">(塔身极深处传来一声迟到 20 年的应答)</span><br>……ACK。')},
          {sp:B('???','???'),t:B('Something alive just entered the tower. Start with the warden on 1F — this tower used to be the whole machine\'s throat for talking to the outside world.',
                                  '有活的东西进塔了。从 1F 的看门人开始吧——这座塔曾是整台机器对外说话的喉咙。')},
        ]);
      }catch(e){}
    }else{
      toast(B('The Protocol Tower · lifts stand by on the west side of every floor.','协议之塔 · 电梯在每层西侧待命'));
    }
  },

  onQuestComplete:function(qid,a){ _api(a);
    if(qid==='net_main'){
      sfx('quest');
      toast(B('◈ The Protocol Tower has re-established connection. The session key at the top belongs to whoever worked it out with their own hands. …And far below the foundations, something answers: one reply, twenty years late, arriving all the same.',
              '◈ 协议之塔已重建连接。塔顶的会话密钥, 属于亲手算出它的人。……而塔基之下极深处, 有什么应了一声——迟到二十年的回应, 但它到了。'),true);
    }else if(qid==='net_lost'){
      sfx('quest');
      toast(B('◈ SEQ-7734 has been delivered to 127.0.0.1. Sometimes going home means going back to yourself.',
              '◈ SEQ-7734 已送达 127.0.0.1。有些回家, 是回到自己。'),true);
    }
  },
};

/* --- 纯函数出口: 供 node 单测 (spec._test) --- */
spec._test={
  evalPacketPlan:evalPacketPlan,
  reassemble:reassemble,
  checkGreeting:checkGreeting,
  checkHandshake:checkHandshake,
  modpow:modpow,
  rsaPhi:rsaPhi,
  rsaValidD:rsaValidD,
  rsaDecrypt:rsaDecrypt,
  numToLetter:numToLetter,
  PKT_CHUNKS:PKT_CHUNKS,
  RSA:RSA,
  HS_CLIENT_ISN:HS_CLIENT_ISN,
};

window.GAME_MODULES=window.GAME_MODULES||[];
window.GAME_MODULES.push(spec);
})();
