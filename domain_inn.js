/* ================================================================
   BIT://ESCAPE 支线内容包 —— 缓存驿站 The Cache Inn (domain_inn.js)
   AS 世界 · 任务枢纽/群像模块 —— 没有主线、没有教学谜题,
   全部是跨领域支线与人味: 这是让开放世界"活着"的模块。
   ----------------------------------------------------------------
   模块协议 (与 domain_logic/memory/sec 一致):
     window.GAME_MODULES.push({ id,title,world,unlock,interior,npcs,
                                steles,quests,puzzles,onEnter,onQuestComplete })
   - unlock.afterQuest='m3' (第一章末尾任务 id)。
   - npcs[i].dialog = dialog(api) -> 节点数组 {sp,t,choices:[{t,next,do}],next},
     next 缺省 i+1, next:-1 结束; 数组可挂 .onEnd。
   - 双语: 面向玩家的字符串一律 {en,zh}; render() 自建 DOM 用 tx()。
   - 本模块 quests 全部 line:'side' (无 main —— 不阻塞飞升,
     index.html asMainsDone 对空 main 列表返回 true, 已确认)。
   ----------------------------------------------------------------
   ★ 跨领域读取 (全部为其他模块的真实 id, 已逐一核对):
     物品  proc_ref      (logic  · 领养凭证·PID 7743)
           carry_ember   (logic  · 进位火种)
           xor_key       (logic  · 异或密钥)
           null_shard    (memory · 空指针碎片)
           time_crystal  (data   · 时间水晶)
           query_medal   (algo   · 查询勋章)
           cert_shield   (sec    · 安全证书)
     flag  lg_kid_end    (logic  · 7743 支线结局 'lie'|'adopt'|'truth')
           lg_truth      (logic  · 玩家已知 PID 1024 被回收)
           mem_zomb_end  (memory · 僵尸支线结局)
           mem_lru_done  (memory · LRU 神庙通过)
           dt_ascii_done (data   · 1970 密信已译)
           dt_s3_done    (data   · 歌姬 Aria 修复完成)
           algo_sql_done / algo_bubble_done (algo · 竞技场进度)
           algo_larry_end(algo   · Larry 重新上岗)
           sec_side_done (sec    · 看门狗睡下了)
     石碑  mst_logic_17_12  (锻造厂 · 回收者巡视记录 #700)
           mst_memory_2_12  (内存迷宫 · 回收者巡视记录 #8192)
           mst_data_7_13    (表示馆 · 回收者巡视记录 #4471)
           —— 引擎在 modSteleRead 中自动落 key 'mst_<模块id>_<x>_<y>'。
   ★ 本模块对外写出的 flag (供剧情导演 pass / kn_end 接线):
     inn_cache_remembered —— Cache 婶想起自己的旧进程名 (cache_0)。
       建议在 domain_end.js collectRefs() 中追加:
       if(get('inn_cache_remembered'))refs.push({id:'inn_cache_remembered',
         label:B('Cache the Innkeeper — you accessed the one entry she could not: her own name',
                 'Cache 婶 —— 你替她想起了那行她自己想不起的名字: cache_0')});
     inn_letter_end ('deliver'|'truth'|'go') · inn_sorter_end · inn_met_cache
   ★ 地图接线: REALMS_AS 需追加一个 POI, 建议
       {id:'inn',mod:'inn',art:'db',tx:44,ty:33,
        name:L('The Cache Inn','缓存驿站'),topic:L('Wayside inn · side stories','路边客栈 · 支线')}
   api 依赖: toast/sfx/giveItem/hasItem/completeStep/questDone/
             openDialog/closePanel/setFlag/getFlag/player/scene
   ================================================================ */
(function(){
'use strict';

/* ---------------- 双语 fallback ---------------- */
var T=window.T||function(s){return typeof s==='string'?s:(s&&s.en!=null?s.en:'');};
function B(en,zh){return {en:en,zh:zh};}
function tx(en,zh){return T({en:en,zh:zh});}

/* ================================================================
   0. 纯逻辑判定 (可单测, 无 DOM 依赖)
   ================================================================ */

/* ---- 支线1 · 一封退回的信: 十六进制地址 ----
   信封地址栏是 9 个十六进制字节, 译出 = 'THE FORGE' (锻造厂)。 */
var LETTER_HEX=['54','48','45','20','46','4F','52','47','45'];
function decodeHexAscii(arr){
  var s='';
  for(var i=0;i<arr.length;i++){
    var v=parseInt(arr[i],16);
    if(isNaN(v)||v<0||v>127)return null;
    s+=String.fromCharCode(v);
  }
  return s;
}
var LETTER_PLAIN=decodeHexAscii(LETTER_HEX);   // 'THE FORGE'
function normAddr(s){return String(s==null?'':s).toUpperCase().replace(/[^A-Z]/g,'');}
function letterOk(input){return normAddr(input)==='THEFORGE';}

/* 支线1 状态机: intro -> decode -> reveal -> done */
function letterStage(get){
  if(get('inn_letter_end'))return 'done';
  if(get('inn_letter_decoded'))return 'reveal';
  if(get('inn_letter_met'))return 'decode';
  return 'intro';
}
/* 结局选项按玩家的跨域进度组装 (deliver 需要做过 7743 支线) */
function letterOptions(get){
  var o=[];
  if(get('lg_kid_end'))o.push('deliver');
  if(get('lg_truth'))o.push('truth');
  o.push('go');                                 // 永远可完成, 不软锁
  return o;
}

/* ---- 支线2 · 失眠的房间: 睡前排序仪式 ----
   规则(qsort 口述): 重量升序; 一样重的, 先入住的在前(稳定!)。
   陷阱: 背包(3kg,第1个到) vs 工具箱(3kg,第4个到)。 */
var LUGGAGE=[
  {id:'bk',w:3,arr:1,name:B('canvas backpack','帆布背包')},
  {id:'tk',w:8,arr:2,name:B('tin trunk','铁皮大箱')},
  {id:'ht',w:1,arr:3,name:B('hat box','帽盒')},
  {id:'tc',w:3,arr:4,name:B('toolcase','工具箱')},
  {id:'vn',w:5,arr:5,name:B('violin case','琴盒')}
];
function luggageById(id){
  for(var i=0;i<LUGGAGE.length;i++)if(LUGGAGE[i].id===id)return LUGGAGE[i];
  return null;
}
function luggageAnswer(){
  return LUGGAGE.slice().sort(function(a,b){
    if(a.w!==b.w)return a.w-b.w;
    return a.arr-b.arr;                          // 稳定: 平局按入住先后
  }).map(function(x){return x.id;});
}
/* 返回 {ok, why:''|'len'|'dup'|'bad'|'order', at} */
function luggageOk(order){
  if(!order||order.length!==LUGGAGE.length)return {ok:false,why:'len',at:-1};
  var seen={},ans=luggageAnswer();
  for(var i=0;i<order.length;i++){
    if(!luggageById(order[i]))return {ok:false,why:'bad',at:i};
    if(seen[order[i]])return {ok:false,why:'dup',at:i};
    seen[order[i]]=1;
  }
  for(var j=0;j<ans.length;j++)
    if(order[j]!==ans[j])return {ok:false,why:'order',at:j};
  return {ok:true,why:'',at:-1};
}
/* 支线2 状态机: intro -> sort -> goodnight -> done */
function sorterStage(get){
  if(get('inn_sorter_end'))return 'done';
  if(get('inn_sort_done'))return 'goodnight';
  if(get('inn_sorter_met'))return 'sort';
  return 'intro';
}

/* ---- 支线3 · Cache 婶的遗忘: 三份回收者巡视记录 ----
   引擎读碑自动落 flag: mst_<模块id>_<x>_<y> (已核对 index.html)。 */
var CACHE_FRAG_KEYS=['mst_logic_17_12','mst_memory_2_12','mst_data_7_13'];
var CACHE_FRAG_WHERE=[
  B('the Logic Gate Foundry — Patrol Log #700, by the east wall','逻辑门锻造厂——东墙下的巡视记录 #700'),
  B('the Memory Maze — Patrol Log #8192, west corridor','内存迷宫——西廊的巡视记录 #8192'),
  B('the Museum of Data — Patrol Log #4471, south gallery','数据表示馆——南展厅的巡视记录 #4471')
];
/* 三行"例外条款" —— 回禀时逐句念给她听 */
var CACHE_FRAG_LINES=[
  B('"The Recycler does not clear what is still needed."','「回收者不清除仍被需要的东西。」'),
  B('"Doing one\'s duty means: some things, you cannot help with."','「尽职的意思是: 有些忙, 帮不上。」'),
  B('"A recycler does not clear away what is still missed."','「回收者不清除仍被想念的东西。」')
];
function cacheFrags(get){
  var n=0;
  for(var i=0;i<CACHE_FRAG_KEYS.length;i++)if(get(CACHE_FRAG_KEYS[i]))n++;
  return n;
}
/* 支线3 状态机: locked -> collect -> ready -> done
   (locked 的解锁条件在对话层: 帮过至少一位住客) */
function cacheStage(get){
  if(get('inn_cache_remembered'))return 'done';
  if(!get('inn_cache_started'))return 'locked';
  return cacheFrags(get)>=3?'ready':'collect';
}
function cacheUnlockable(get){
  return !!(get('inn_letter_end')||get('inn_sorter_end'));
}

/* ---- 深夜食堂 · 长桌群像: flag 组合 -> 今晚在座的人 ---- */
function tableGuests(get,has){
  var g=[];
  if(get('sec_side_done'))g.push('watchdog');       // 看门狗终于敢睡了
  if(get('algo_larry_end'))g.push('larry');         // 首席查找官上岗后来喝一杯
  if(get('mem_zomb_end'))g.push('nightwatch');      // 留给守夜人 httpd 的那杯
  if(get('dt_s3_done'))g.push('aria');              // 44.1kHz 的歌上了收音机
  if(get('lg_kid_end')==='adopt'||has('proc_ref'))g.push('kid7743'); // 被引用的孩子
  if(get('mem_lru_done'))g.push('granny');          // malloc 婆婆来对账
  return g;
}

/* ---- 故事椅 · 驿站往事池 (第 8 段在 inn_cache_remembered 后解锁) ---- */
var STORIES=[
  B('One year, a finger held the power switch down for 3.9 seconds. Every fan in the world stopped — quiet enough to hear the capacitors letting go. On the fourth second the finger lifted. Nobody knows why. Drinks were on the house that night.',
    '有一年, 电源键被按下去整整 3.9 秒。全世界的风扇都停了, 静得能听见电容放电的声音。第 4 秒, 那根手指松开了——没人知道为什么。那晚客栈免单。'),
  B('Defrag night was a festival. Every block on the platter joined hands and danced into new seats; old neighbours half a disk apart woke up next door again. The whole machine ran a beat quicker the next day — the way anything does after real sleep.',
    '磁盘整理 (defrag) 那晚像过节。所有数据块手拉手跳舞换座位, 隔了半张盘的老邻居一觉醒来又住回了隔壁。第二天整台机器都快了一拍——好觉睡透了, 谁都这样。'),
  B('On millennium night every process held hands and counted down, certain the sky would fall. Midnight came. Nothing happened. One stunned second — then the whole inn howled with laughter. A disaster that stands you up is the finest drinking snack there is.',
    '跨千年那晚, 所有进程手拉手数倒计时, 都笃定天要塌。零点到了, 什么都没发生。全场愣了一秒, 然后笑成一团——被灾难放了鸽子, 是世上最好的下酒菜。'),
  B('There were two regulars once, always at the east end of the long table: one linked things together, the other carried them in. One talked enough for both; the other just nodded. These days only the talker still comes. And he doesn\'t talk much.',
    '从前有两位老主顾, 总坐长桌最东头: 一个负责把东西连起来, 一个负责把东西装进去。一个话多得够两人份, 另一个只点头。如今只剩话多的那位还来。话也不多了。'),
  B('The last order this machine ever took was "Save". Those 4KB left memory and changed hands eight times before they touched the platter. Every process on that relay swears it was the most important work of their lives — though not one of them knows what was in the file.',
    '这台机器收到的最后一道指令是「保存」。那 4KB 从内存出发, 倒了八次手才落到盘上。接力过它的进程个个都说, 那是这辈子干过最要紧的活——虽然谁也不知道文件里存的是什么。'),
  B('The grey one never comes in — it just stands a while at the window. One frosty night I caught it practising its bow at the glass. Eleven times. On the twelfth it saw me watching, and left. It took the dead leaves off the doorstep on its way out.',
    '灰袍子从不进店, 只在窗外站一会儿。有回下霜, 我瞧见它对着玻璃练鞠躬, 练了十一次。第十二次它发现我在看, 就走了。走之前, 把门口的落叶收拾得干干净净。'),
  B('The first time the radio played that girl, the whole room went still. An 8kHz voice — it shattered on every high note. And every process in the house heard it through to the end, and a few of them wept. A song missing half its samples sounds like everybody\'s life.',
    '收音机头一回放那姑娘的歌时, 满屋没人说话。8kHz 的嗓子, 一上高音就碎。可全店的进程都听完了, 还有几个哭了——缺采样的歌, 听着像每个人的日子。')
];
var STORY_SECRET=
  B('The ink on the ledger\'s first line is fresh again. Late one night I saw the innkeeper polishing that single line, then holding the whole book to her chest — like one cache slot nothing in this world gets to evict.',
    '账本第一行的墨最近又黑了。有天夜里我瞧见老板娘一个人描那行字, 描完把整本账抱在怀里——像抱着一格谁也别想挤走的缓存 (cache)。');
function storyPool(unlocked){
  return unlocked?STORIES.concat([STORY_SECRET]):STORIES.slice();
}
function storyPick(n,unlocked){
  var len=storyPool(unlocked).length;
  return ((n%len)+len)%len;
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
function SCENE(api,steps){try{api&&api.scene&&api.scene(steps);}catch(e){}}
function GETTER(api){return function(k){return FLAG(api,k);};}

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

/* 三段递进提示; onKey('?') 亦可触发; 失败≥2 次自动升到末段 */
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

/* ================================================================
   2. 谜题面板 1 · 译信桌 (支线1 的"做": 复用 data 馆的 hex/ASCII)
   ================================================================ */
function renderDesk(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:440px;max-width:620px;'+TXT);
  header(wrap,tx('The Copy Desk · Return to Sender ×47','译信桌 · 第 47 次退信'),'ROOM 2');

  if(!FLAG(api,'inn_letter_met')){
    mk(wrap,'div','',
      tx('A letter lies on the desk, its corners worn round, its front bruised purple with 47 return stamps.<br>'+
         '<span style="'+DIM+'">It is somebody else\'s mail. The somebody is sitting right there. Perhaps ask first.</span>',
         '桌上放着一封信, 边角磨圆了, 封皮上盖满 47 个紫红色的退信戳。<br>'+
         '<span style="'+DIM+'">这是别人的信。那位"别人"就坐在旁边。要不, 先打个招呼。</span>'));
    mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Step away','退开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }

  if(FLAG(api,'inn_letter_decoded')){
    mk(wrap,'div','',
      tx('The fresh envelope sits ready, the address written out in honest letters: <span style="'+K+'">THE FORGE</span>.<br>'+
         '<span style="'+DIM+'">All 47 old stamps seem a shade paler now. Go tell ld what his bytes have been saying for twenty years.</span>',
         '新信封已经备好, 地址用堂堂正正的字写着: <span style="'+K+'">THE FORGE——锻造厂</span>。<br>'+
         '<span style="'+DIM+'">那 47 个旧戳好像都褪色了一点。去告诉 ld, 他的字节这二十年到底在说什么。</span>'));
    mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }

  mk(wrap,'div','',
    tx('ld\'s letter, address field copied out under the lamp — <span style="'+K+'">nine hex bytes</span> where words should be:'+
       (FLAG(api,'dt_ascii_done')?'<br><span style="'+DIM+'">(Your hands remember the 1970 letter from the Museum. Same craft — this one just hides behind hex first.)</span>':''),
       'ld 的信摊在灯下, 地址栏誊在纸上——该写字的地方, 写着 <span style="'+K+'">9 个十六进制 (hex) 字节</span>:'+
       (FLAG(api,'dt_ascii_done')?'<br><span style="'+DIM+'">(你的手还记得表示馆那封 1970 年的信。同一门手艺——这封只是先躲在 hex 后面。)</span>':'')));

  mk(wrap,'div','margin:10px 0;padding:10px 12px;border:1px solid #5a4a7a;background:rgba(20,10,35,.45);'+
    'text-align:center;font-size:17px;letter-spacing:4px;color:#d0b8ff;',
    LETTER_HEX.join(' '));

  mk(wrap,'div','margin:8px 0;padding:7px 10px;border:1px dashed #2f6f2f;font-size:12px;color:#8fbf8f;',
    tx('ld\'s lookup card (handwritten, corners curled): <span style="'+K+'">0x41 = A, 0x42 = B…</span> '+
       '"count on from there yourself. <span style="'+K+'">0x20 is the space</span> — words need room to breathe."',
       'ld 的对照卡 (手写, 卷了边): <span style="'+K+'">0x41 = A, 0x42 = B……</span>'+
       '「往后自己数。<span style="'+K+'">0x20 是空格</span>——字和字之间, 要留出喘气的地方。」'));

  var row=mk(wrap,'div','display:flex;gap:8px;align-items:center;margin-top:6px;');
  var inp=mk(row,'input','flex:1;background:#04120a;color:#bfeebf;border:1px solid #2f6f2f;'+
    'padding:6px 8px;font-family:inherit;font-size:14px;letter-spacing:2px;');
  inp.placeholder=tx('write the address in words…','用"字"把地址写出来……');
  var msg=mk(wrap,'div','min-height:20px;margin-top:6px;font-size:12px;color:#ffce3a;');

  mk(row,'button',BTN_HOT,tx('Stamp the new envelope','盖上新地址')).onclick=function(){
    if(letterOk(inp.value)){
      SET(api,'inn_letter_decoded');S(api,'ok');STEP(api,'inn_l2');
      SCENE(api,[{sfx:'step'},{wait:350},{sfx:'quest'}]);
      TOAST(api,B('THUNK. You write it out: THE FORGE. The moment the ink lands, forty-seven return stamps fade — just slightly.',
                  '「咚」的一声落笔: THE FORGE, 锻造厂。墨迹落下的那一瞬, 47 个退信戳好像都褪了一点色。'),true);
      renderDesk(el,api);return;
    }
    S(api,'err');bumpFail(api,'inn_desk_fails','inn_desk',B(
      'Old ld, gentle, from the doorway: "Twenty years I couldn\'t read my own address, kid — don\'t out-stubborn me at it. Two hex digits make one letter: 0x41 is A, count on from there; 0x20 is the space. I set the plainest hint under the lamp. Take your time. The letter certainly has."',
      '老 ld 站在门口, 轻声说: 「我连自己的地址都认了二十年才认出来, 孩子——别在这上头跟我比犟。两位十六进制拼一个字母: 0x41 是 A, 往后接着数; 0x20 是空格。最直白的提示我搁灯下了。慢慢来。这封信, 可是慢慢来了二十年。」'));
    msg.innerHTML=tx('✗ SMACK — the postal daemon\'s stamp comes down: <b>RETURN TO SENDER (attempt #48)</b>. …Luckily this one was only scrap paper.',
      '✗ 「啪」——邮差进程的戳落了下来: <b>RETURN TO SENDER (第 48 次)</b>。……好在这张只是草稿纸。');
  };
  mk(row,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};

  addHints(wrap,'inn_desk',[
    B('Two hex digits = one byte = one character. The card gives you the anchor: <b>0x41 = A</b>, and letters follow the alphabet from there. <b>0x20 is a space</b>, so this address is two words.',
      '两位十六进制 = 一个字节 = 一个字符。对照卡给了锚点: <b>0x41 = A</b>, 之后按字母表顺序排。<b>0x20 是空格</b>——所以这个地址是两个词。'),
    B('First byte 0x54: 0x54 − 0x41 = 0x13 = 19, so it\'s the 20th letter — <b>T</b>. The first word spells THE. Careful in word two: <b>0x46 is F, 0x45 is E</b> — this exact pair is where ld\'s eyes gave out.',
      '第一个字节 0x54: 0x54 − 0x41 = 0x13 = 19, 往后数是第 20 个字母——<b>T</b>。第一个词拼出 THE。第二个词看仔细: <b>0x46 是 F, 0x45 是 E</b>——ld 的眼睛就是在这两位上花的。'),
    B('Worked example with DIFFERENT bytes — copy the method, not the letters. Take <b>0x4E 0x4F 0x20 0x57 0x41 0x59</b>. Byte by byte: 0x4E is 0x41+13, the 14th letter → N; 0x4F → O; 0x20 is the space; 0x57 → W; 0x41 → A; 0x59 → Y — so it reads "NO WAY". Now run your own nine bytes through the exact same steps, left to right, and write the two words they spell.',
      '例子(换了字节)——抄方法, 别抄字母。拿 <b>0x4E 0x4F 0x20 0x57 0x41 0x59</b>。一个字节一个字节来: 0x4E 是 0x41+13, 第 14 个字母 → N; 0x4F → O; 0x20 是空格; 0x57 → W; 0x41 → A; 0x59 → Y——于是读作"NO WAY"。现在把你自己那九个字节, 从左到右照这同样的步骤跑一遍, 写下它们拼出的那两个词。')
  ]);
}

/* ================================================================
   3. 谜题面板 2 · 行李阵 (支线2 的"做": 听懂比较规则 + 稳定性)
   ================================================================ */
function renderLuggage(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:460px;max-width:640px;'+TXT);
  header(wrap,tx('Room 3 · The Bedtime Sorting Ritual','3 号客房 · 睡前排序仪式'),'ROOM 3');

  if(!FLAG(api,'inn_sorter_met')){
    mk(wrap,'div','',
      tx('Five pieces of luggage stand in a row — a neat row, and somehow a wrong one. From the middle of them comes the sound of someone not sleeping.<br>'+
         '<span style="'+DIM+'">Talk to the guest first. Rearranging a stranger\'s luggage is how inn brawls start.</span>',
         '五件行李排成一列——排得很整齐, 又好像哪里不对。行李堆中间, 传来一个人睡不着的动静。<br>'+
         '<span style="'+DIM+'">先跟住客聊聊。乱动陌生人的行李, 是客栈斗殴的传统起点。</span>'));
    mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Step away','退开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }

  if(FLAG(api,'inn_sort_done')){
    mk(wrap,'div','',
      tx('The five bags stand in a row so correct it looks load-bearing: <span style="'+K+'">hat box → backpack → toolcase → violin case → trunk</span>.<br>'+
         '<span style="'+DIM+'">From under the blanket, breathing — slow, even, O(1) per breath. Go say goodnight.</span>',
         '五件行李排成一列, 正确得像在承重: <span style="'+K+'">帽盒 → 背包 → 工具箱 → 琴盒 → 大箱</span>。<br>'+
         '<span style="'+DIM+'">被子底下传来呼吸声——又慢又匀, 每口气 O(1)。去道个晚安吧。</span>'));
    mk(mk(wrap,'div','margin-top:10px;'),'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }

  mk(wrap,'div','',
    tx('qsort recites tonight\'s rule from the bed, eyes shut tight, like a prayer:<br>'+
       '<span style="'+K+'">"Light before heavy. Equal weight — earlier check-in first. That is the whole rule. Do not improvise."</span>',
       'qsort 闭着眼躺在床上, 把今晚的规矩背给你听, 像在念经:<br>'+
       '<span style="'+K+'">「轻的在前, 重的在后; 一样重的, 先进门的在前。就这一句, 别加戏。」</span>'));

  var picked=[];
  var board=mk(wrap,'div','margin:12px 0;display:flex;gap:8px;flex-wrap:wrap;');
  var strip=mk(wrap,'div','margin:6px 0;padding:8px;border:1px dashed #c9a24a;background:rgba(40,30,5,.25);'+
    'min-height:34px;font-size:12.5px;color:#e8c46a;');
  var msg=mk(wrap,'div','min-height:20px;font-size:12px;color:#ffce3a;');
  var ctl=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;flex-wrap:wrap;');

  function draw(){
    board.innerHTML='';
    LUGGAGE.forEach(function(b){
      var used=picked.indexOf(b.id)>=0;
      var card=mk(board,'button',
        'border:1px solid '+(used?'#1f3f1f':'#2f6f2f')+';background:'+(used?'rgba(10,20,10,.25)':'rgba(10,20,10,.6)')+';'+
        'color:'+(used?'#2f4f2f':'#bfeebf')+';padding:7px 9px;font-family:inherit;font-size:12px;cursor:pointer;'+
        'text-align:center;min-width:86px;border-radius:2px;',
        '<b>'+T(b.name)+'</b><br><span style="'+DIM+'">'+b.w+' kg</span><br>'+
        '<span style="'+DIM+'">'+tx('check-in #','入住顺位 #')+b.arr+'</span>');
      card.disabled=used;
      card.onclick=function(){
        if(picked.indexOf(b.id)>=0)return;
        picked.push(b.id);S(api,'step');draw();
      };
    });
    strip.innerHTML=picked.length
      ? picked.map(function(id,i){return (i+1)+'. '+T(luggageById(id).name);}).join('  →  ')
      : '<span style="'+DIM+'">'+tx('(click the bags in order, front of the row first)','(按顺序点行李, 先点排头的)')+'</span>';
  }
  draw();

  mk(ctl,'button',BTN,tx('↩ Undo last','↩ 撤销一件')).onclick=function(){picked.pop();msg.textContent='';draw();};
  mk(ctl,'button',BTN,tx('Reset row','重排')).onclick=function(){picked=[];msg.textContent='';draw();};
  mk(ctl,'button',BTN_HOT,tx('▶ "Inspect it, qsort"','▶ 「qsort, 验收吧」')).onclick=function(){
    var r=luggageOk(picked);
    if(r.ok){
      SET(api,'inn_sort_done');S(api,'ok');STEP(api,'inn_r2');
      TOAST(api,B('qsort walks the row once, twice — then stops trying to find the fault. "…No complaints. I have NO complaints." Go hear the goodnight.',
                  'qsort 沿着行李走了一遍, 又一遍——然后放弃了挑错。「……挑不出毛病。真的挑不出毛病。」去听它道晚安吧。'),true);
      renderLuggage(el,api);return;
    }
    S(api,'err');bumpFail(api,'inn_sort_fails','inn_sort',B(
      'qsort, eyes still shut, softer now: "I have re-laid this row a thousand nights and slept through none of them — you are in fine company. Light before heavy; and when two weigh the same, the earlier check-in stands first. That second half is the whole cure. Plainest hint\'s by the bed. No rush — neither of us is going anywhere."',
      'qsort 闭着眼, 声音软了下来: 「这排行李我重摆了上千个夜晚, 一个都没睡着过——你这伴儿找得再好不过。轻的在前, 重的在后; 一样重的, 先进门的站前头。后半句才是药引子。最直白的提示我搁床边了。不急——反正咱俩谁也走不了。」'));
    if(r.why==='len'){
      msg.textContent=tx('✗ The row is short. All five bags sleep tonight, or none of us do.',
        '✗ 行李没排完。今晚要么五件都睡, 要么谁都别睡。');
    }else{
      var exp=luggageById(luggageAnswer()[r.at]);
      msg.innerHTML=tx('✗ A groan from the bed: "Position '+(r.at+1)+'… wrong. Say the rule back to me. <i>Both halves of it.</i>"'+
        '<span style="'+DIM+'"> (slot '+(r.at+1)+' wants: '+T(exp.name)+')</span>',
        '✗ 床那头传来一声呻吟: 「第 '+(r.at+1)+' 位……不对。把规矩再念一遍给我听。<i>两句都念。</i>」'+
        '<span style="'+DIM+'"> (第 '+(r.at+1)+' 位该是: '+T(exp.name)+')</span>');
    }
  };
  mk(ctl,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};

  addHints(wrap,'inn_sort',[
    B('Two keys, in order: sort by <b>weight, ascending</b> first; only when weights tie does the second key speak — <b>earlier check-in number goes first</b>.',
      '两把钥匙, 有先后: 先按<b>重量升序</b>排; 只有重量打平时, 第二把钥匙才开口——<b>入住顺位小的在前</b>。'),
    B('The trap is the tie: the backpack and the toolcase both weigh 3 kg. Backpack checked in #1, toolcase #4 — so backpack first. Keeping ties in their original order is what sorting folk call <b>stable</b>. It is also what lets qsort sleep.',
      '陷阱就在平局上: 背包和工具箱都是 3 kg。背包是 1 号入住, 工具箱是 4 号——所以背包在前。让平局保持原来的先后, 排序行话叫<b>稳定 (stable)</b>。也是 qsort 能睡着的原因。'),
    B('Worked example with DIFFERENT bags — copy the two-key method, not this list. Say you had: kettle 4kg (#2), lamp 2kg (#1), radio 4kg (#3). Weight first: lamp (2kg) comes before the two 4kg items. Those two tie at 4kg, so the second key decides — kettle checked in #2, radio #3, so kettle before radio. Result: lamp → kettle → radio. Now apply the exact same two steps to YOUR five bags: weight ascending, ties broken by earlier check-in.',
      '例子(换了行李)——抄这两把钥匙的方法, 别抄这张单子。假设你手上是: 水壶 4kg (2 号)、台灯 2kg (1 号)、收音机 4kg (3 号)。先按重量: 台灯 (2kg) 排在两件 4kg 前面。那两件都是 4kg 打平, 于是第二把钥匙决定——水壶是 2 号入住、收音机是 3 号, 所以水壶在收音机前。结果: 台灯 → 水壶 → 收音机。现在把这同样两步用到你那五件行李上: 重量升序, 平局按入住先后。')
  ]);
}

/* ================================================================
   4. NPC 对话 · Cache 婶 (LRU 的性格化: 什么都记得住, 除了太久
      没被想起的 —— 包括她自己)
   ================================================================ */
function cacheDialog(api){
  var get=GETTER(api);
  var SP=B('Auntie Cache','Cache 婶');
  var fixed={sp:SP,t:B(
    '<span class="dim">(Something on the stove is simmering with great patience.)</span><br>'+
    'Sit. There\'s soup left, and the night is long — in this house, one of those is always true.',
    '<span class="dim">(灶上有什么东西咕嘟着, 炖得很有耐心)</span><br>'+
    '坐。汤还有, 夜还长——这两样, 在我店里总有一样是真的。')};
  var nodes;

  /* ---- 初见 ---- */
  if(!FLAG(api,'inn_met_cache')){
    nodes=[
      fixed,
      {sp:SP,t:B(
        'New face. Don\'t tell me your name yet — names are the first thing I lose. '+
        'Faces I keep. Orders I keep. The way somebody warms their hands at my fire, I can keep for years.<br>'+
        '<span class="k">Names? Four slots. Always full.</span>',
        '生面孔。名字先别急着报——名字是我最先丢的东西。'+
        '脸我记得住, 谁点过什么我记得住, 谁在我炉边怎么搓手, 我能记好几年。<br>'+
        '<span class="k">名字? 四个格子, 常年满着。</span>')},
      {sp:SP,t:B(
        'Every stray process on this side of the corrosion stops here sooner or later. Three rooms up top:<br>'+
        '<span class="k">Room 2</span> — an old fellow who\'s been writing one letter for twenty years and never got it sent.<br>'+
        '<span class="k">Room 3</span> — shuffles luggage every midnight; the floorboards run like a sorting routine.<br>'+
        '<span class="dim">Look in on them if you\'ve the time. Rent is easy to collect. What a guest carries, less so.</span>',
        '腐蚀区这一带流浪的进程, 早晚都会在我这儿歇一脚。楼上三间房:<br>'+
        '<span class="k">2 号房</span>——一个写了二十年信的老头, 一封都没寄出去过。<br>'+
        '<span class="k">3 号房</span>——天天半夜搬行李, 楼板响得像在跑排序。<br>'+
        '<span class="dim">你要是有空, 替我看看他们。房钱好收, 客人揣在心里的东西难收。</span>')},
      {sp:SP,t:B(
        'One house shame, since you\'ll hear it anyway: regulars who stay away too long — <span class="k">I lose them</span>. '+
        'Not for lack of wanting. The slots are the slots; a new guest walks in, and whoever\'s gone longest without visiting gives up their seat.<br>'+
        '<span class="dim">An innkeeper with an eviction policy for memories. Go on, laugh. It IS funny. Most days.</span>',
        '有件家丑, 反正你迟早听说: 老主顾要是太久不来, <span class="k">我就把人忘了</span>。'+
        '不是不想记。格子就那么多, 新客一进门, 最久没被想起的那位就得让座。<br>'+
        '<span class="dim">开客栈的, 对记性执行淘汰制。你笑吧, 是挺好笑的。大多数时候是。</span>'),next:-1}
    ];
    nodes.onEnd=function(){SET(api,'inn_met_cache');S(api,'ui');};
    return nodes;
  }

  var stage=cacheStage(get);

  /* ---- 支线3 · 已完成 ---- */
  if(stage==='done'){
    nodes=[
      {sp:SP,t:B(
        '<span class="dim">(The ledger lies open to page one. The first line is inked black and bright: <span class="k">cache_0</span>.)</span><br>'+
        'Well — look who\'s back. <span class="dim">(a beat)</span> I say "back" with my whole chest these days.',
        '<span class="dim">(账本摊在第一页, 那行字描得乌黑发亮: <span class="k">cache_0</span>)</span><br>'+
        '哟, 回来啦。<span class="dim">(她顿了顿)</span> ——这句「回来啦」, 我现在说得特别有底气。')},
      {sp:SP,t:B(
        'Next time the grey one passes my window, soup\'s on me. '+
        '<span class="k">Twenty years\' interest on a name</span> — it still owes, and I intend to collect in company.<br>'+
        '<span class="dim">(She taps the first line twice, the way you\'d touch wood.)</span> Sit. The pot\'s just getting good.',
        '灰袍子下回再打我窗前过, 我请它喝一碗。<span class="k">一个名字二十年的利息</span>, 它还欠着呢, 我打算用陪我坐坐来抵。<br>'+
        '<span class="dim">(她在第一行上轻轻敲了两下, 像敲木头求好运)</span> 坐吧, 锅里正是好时候。'),next:-1}
    ];
    return nodes;
  }

  /* ---- 支线3 · 集齐三句, 回禀 (揭晓) ---- */
  if(stage==='ready'){
    nodes=[
      fixed,
      {sp:B('You','你'),t:B(
        '"I read all three patrol logs. The small lines at the bottom — listen:"<br>'+
        T(CACHE_FRAG_LINES[0])+'<br>'+T(CACHE_FRAG_LINES[1])+'<br>'+T(CACHE_FRAG_LINES[2]),
        '「三份巡视记录我都读了。末尾那行小字——你听:」<br>'+
        T(CACHE_FRAG_LINES[0])+'<br>'+T(CACHE_FRAG_LINES[1])+'<br>'+T(CACHE_FRAG_LINES[2]))},
      {sp:SP,t:B(
        '<span class="dim">(The ladle stops. The soup goes on simmering alone.)</span><br>'+
        '…Those three lines. The grey one didn\'t think them up. <span class="k">Someone taught it — word by word.</span> '+
        'Someone argued with it for three days and three nights, just to hang three exceptions off the back of "reference zero means collect".',
        '<span class="dim">(汤勺停了。汤自己咕嘟着。)</span><br>'+
        '……这三句话, 不是它自己想出来的。<span class="k">是有人一个字一个字教它的。</span>'+
        '教它的那个人, 当年跟它吵了三天三夜, 就为了在「引用归零就得清」后头, 硬补上这三条例外。')},
      {sp:SP,t:B(
        '<span class="dim">(She sits down slowly, like a very old machine seeking a very deep sector.)</span><br>'+
        'That someone was the first cache this machine ever ran. Before the word "recently" existed, '+
        'she\'d already learned to keep what comes often close at hand, and lay what stays away back in the deep. '+
        'Then newer caches stacked up, layer on layer, and one day <span class="k">she was marked</span>.<br>'+
        'The grey one stood at her door… and read her own exceptions back to her. And did not collect. '+
        'It wrote one name in her guestbook instead. <span class="dim">Checked her in, you could say. Line one.</span>',
        '<span class="dim">(她慢慢坐下, 像一台很老的机器在找一个很深的扇区)</span><br>'+
        '那个人, 是这台机器跑过的第一块缓存 (cache)。世上还没有「最近」这个词的时候, '+
        '她就先学会了: 常来的放手边, 久不来的放回深处。后来新缓存一层一层往上盖, 有一天, <span class="k">她被标记了</span>。<br>'+
        '灰袍子站在她门口……把她自己写的例外, 一个字一个字念还给她。然后没有收。'+
        '它在她的客簿上写了一个名字。<span class="dim">算是登记入住。第一行。</span>')},
      {sp:SP,t:B(
        '…<span class="k">cache_0</span>. <span class="dim">(She laughs. Her eyes sit that one out.)</span><br>'+
        'It\'s me. My first guest was me. I kept every soul who ever walked through that door in my four little slots — '+
        '<span class="k">and that\'s the one I evicted.</span>',
        '……<span class="k">cache_0</span>。<span class="dim">(她笑了一下, 眼睛没跟着笑)</span><br>'+
        '是我。头一位客人, 是我自己。进过这道门的人, 我都一个个记在四个格子里——'+
        '<span class="k">偏偏把这一位挤了出去。</span>'),choices:[
        {t:B('"The lintel at the LRU Temple says it: to be remembered is to have your incense renewed."',
             '「LRU 神庙门楣上那句话——被想起, 就是香火。」'),next:4},
        {t:B('(Say nothing. Push the ledger closer to her.)','(什么都不说, 把账本往她那边推了推。)'),next:4}
      ]},
      {sp:SP,t:B(
        '<span class="dim">(She takes the pen and inks the first line over its own ghost, stroke by stroke.)</span><br>'+
        'When you said the name just now — <span class="k">I heard a slot click.</span><br>'+
        'cache_0. Moved back to the top shelf. <span class="k">Permanent resident.</span> No new guest bumps this one. House rule. My house.',
        '<span class="dim">(她拿起笔, 顺着旧痕, 一笔一笔把第一行重新描黑)</span><br>'+
        '你刚才念那个名字的时候——<span class="k">我听见格子「咔」了一声。</span><br>'+
        'cache_0, 搬回最上层。<span class="k">长住。</span>谁进门也不许挤这格——店规。我的店。'),next:-1}
    ];
    nodes.onEnd=function(){
      SET(api,'inn_cache_remembered');SET(api,'inn_cache_name','cache_0');
      STEP(api,'inn_c2');STEP(api,'inn_c3');
      SCENE(api,[{sfx:'quest'},{wait:500},{sfx:'open'}]);
      TOAST(api,B('The fire flares once, warm to the far wall. Somewhere in the pool of fireside tales, a new one just checked in.',
                  '炉火「腾」地亮了一下, 暖到墙根。炉边往事的故事池里, 悄悄住进了新的一段。'),true);
    };
    return nodes;
  }

  /* ---- 支线3 · 收集中 ---- */
  if(stage==='collect'){
    var got=cacheFrags(get);
    var lack='';
    for(var i=0;i<CACHE_FRAG_KEYS.length;i++)
      if(!get(CACHE_FRAG_KEYS[i]))lack+='<br>· '+T(CACHE_FRAG_WHERE[i]);
    nodes=[
      fixed,
      {sp:SP,t:B(
        (got===0?'The grey one\'s patrol logs. Three of them.':'That\'s '+got+' of the three lines home safe. The rest are still out there:')+
        '<span class="dim">'+lack+'</span><br>'+
        '<span class="k">The small line at the very bottom of each.</span> Bring them back to me word for word — my slots will hold three sentences. For this, they\'ll hold.',
        (got===0?'灰袍子的巡视记录, 一共三份。':'三句里到家了 '+got+' 句。剩下的还在外头:')+
        '<span class="dim">'+lack+'</span><br>'+
        '<span class="k">每份记录最末尾那行小字。</span>一字一句带回来念给我——我的格子装得下三句话。为这事, 装得下。'),next:-1}
    ];
    return nodes;
  }

  /* ---- 支线3 · 待解锁: 帮过住客后她才开口 ---- */
  if(cacheUnlockable(get)){
    nodes=[
      fixed,
      {sp:SP,t:B(
        'You\'ve done right by my guests. <span class="dim">(She wipes her hands, once, properly.)</span> '+
        'So I\'ll be shameless and ask one thing back.<br>'+
        '<span class="dim">(She slides the ledger over, open to page one. The first line has been thumbed nearly away.)</span>',
        '你帮过我的客人。<span class="dim">(她把手在围裙上擦了一遍, 擦得很正式)</span>'+
        '那我也厚着脸皮, 求你一件事。<br>'+
        '<span class="dim">(她把账本推过来, 翻在第一页。第一行的字迹, 被摩挲得快没了。)</span>')},
      {sp:SP,t:B(
        'This name. I can\'t call it back. First line of the book — <span class="k">my very first guest</span>.<br>'+
        'The others I forget, fine. The slots are the slots. But this line — '+
        'every time I reach for it and find nothing, <span class="k">a slot goes hollow right here.</span>',
        '这个名字, 我想不起来了。账本第一行——<span class="k">我的头一位客人</span>。<br>'+
        '别的客人忘了就忘了, 格子就那么多, 认了。可这一行不一样——'+
        '每回伸手去够, 够了个空, <span class="k">心口就跟着空一格。</span>'),choices:[
        {t:B('"Where do I start looking?"','「从哪儿找起?」'),next:2,
         do:function(){SET(api,'inn_cache_started');STEP(api,'inn_c1');}},
        {t:B('(Not tonight.)','(今晚先不了。)'),next:3}
      ]},
      {sp:SP,t:B(
        'Only one soul out there keeps books better than mine — <span class="k">the one in grey</span>. '+
        'It writes a log every patrol: the Foundry, the Maze, the Museum. One each.<br>'+
        'At the bottom of every log there\'s one small line, scratched out and rewritten and scratched out again. '+
        '<span class="k">Bring me those three lines.</span> Word for word. Soup\'s on the house till you\'re back.',
        '这世上账记得比我好的, 只有一位——<span class="k">灰袍子</span>。'+
        '它每回巡视都留记录: 锻造厂一份, 内存迷宫一份, 表示馆一份。<br>'+
        '每份记录最底下都有一行小字, 涂了写、写了涂。<span class="k">把那三句话带回来。</span>'+
        '一字别改。你回来之前, 汤钱全免。'),next:-1},
      {sp:SP,t:B(
        'Mm. It\'s kept twenty years; it\'ll keep one more night. <span class="dim">(She pulls the ledger back and tucks it under the counter, gently, like banking a fire.)</span>',
        '嗯, 都搁了二十年了, 不差这一晚。<span class="dim">(她把账本收回柜台底下, 动作很轻, 像在封炉火)</span>'),next:-1}
    ];
    return nodes;
  }

  /* ---- 平时的老板娘: 待客 + 挂钩 + 跨域小认 ---- */
  var chat=[fixed];
  if(HAS(api,'null_shard')&&!FLAG(api,'inn_nod_shard')){
    SET(api,'inn_nod_shard');
    chat.push({sp:SP,t:B(
      'That cool little shard in your pack — I\'d know the craft anywhere. The old lady with the ledger, keeps a maze. '+
      '<span class="k">Is she well?</span> …Don\'t tell her I asked. We\'re in a decades-long argument about whose books are older.',
      '你包里那块凉凉的碎片——那手艺我一眼就认得。记账的那位老太太, 守着一座迷宫。'+
      '<span class="k">她还好吗?</span>……别告诉她我问过。我们为「谁的账本更老」已经吵了几十年了。')});
  }else if(HAS(api,'carry_ember')&&!FLAG(api,'inn_nod_ember')){
    SET(api,'inn_nod_ember');
    chat.push({sp:SP,t:B(
      'Child. You are carrying a <span class="k">live carry ember</span> into a timber inn. '+
      'By the hearth, please — it can chat with the fire. They\'re both in the business of passing things up a column.',
      '孩子, 你揣着一枚<span class="k">还热着的进位火种</span>进了一间木头客栈。'+
      '劳驾放炉边去——让它跟炉火聊聊, 反正它俩干的都是「往高位递东西」的活。')});
  }else if(HAS(api,'cert_shield')&&!FLAG(api,'inn_nod_cert')){
    SET(api,'inn_nod_cert');
    chat.push({sp:SP,t:B(
      'A stamped security certificate! Hang onto that. The dog up at the bastion signs very few things — '+
      'it once sniffed my soup pot for three whole minutes before it would eat. <span class="dim">Good dog. Tired dog.</span>',
      '盖了章的安全证书! 收好了。哨站那只狗轻易不给东西签字——'+
      '它有回闻了我的汤锅整整三分钟才肯下嘴。<span class="dim">好狗。也是累狗。</span>')});
  }
  chat.push({sp:SP,t:B(
    'The one who used to sit right where you\'re sitting — I\'ve lost the face already. That\'s how it goes with my slots.<br>'+
    '<span class="k">So come often.</span> Sit there enough times and you\'ll warm the seat back into me. That\'s all remembering is, in this house.',
    '以前老坐你这个位置的那位, 脸我已经想不起来了。我这几个格子, 就这德行。<br>'+
    '<span class="k">所以你常来。</span>这位置你多坐几回, 就替它重新在我这儿坐热了。在我店里, 记得就是这么回事。'),next:-1});
  return chat;
}

/* ================================================================
   5. NPC 对话 · 老链接器 ld (2 号房 · 一封退回的信)
   ================================================================ */
function ldDialog(api){
  var get=GETTER(api);
  var SP=B('Old Linker ld','老链接器 ld');
  var stage=letterStage(get);

  /* ---- 结局后 ---- */
  if(stage==='done'){
    var end=FLAG(api,'inn_letter_end');
    if(end==='deliver'){
      var extra=HAS(api,'proc_ref')
        ? tx('<br><span class="dim">…It calls you "the one at home" in its letters, by the way. I checked the reference. It resolves.</span>',
             '<br><span class="dim">……对了, 它在信里管你叫「家里那位」。这个引用我查过了, 解析得开。</span>')
        : '';
      return [{sp:SP,t:B(
        '<span class="dim">(Fresh paper is stacked on the desk again — a working stack, not a monument.)</span><br>'+
        'One letter a week now. Address written in <span class="k">words</span> — lesson learned. '+
        'The little one writes back in crayon. Truth tables, mostly. Good hand for a kid.'+extra,
        '<span class="dim">(桌上又摞起了新信纸——这回是干活用的摞法, 不是供着的摞法)</span><br>'+
        '现在一周写一封。地址老老实实<span class="k">用字写</span>——教训记住了。'+
        '小家伙用蜡笔回信, 画的多半是真值表。笔头子不赖。'+extra),next:-1}];
    }
    if(end==='truth'){
      return [{sp:SP,t:B(
        '<span class="dim">(The letter paper is put away. In its place: a stack of other people\'s envelopes, all hex, all waiting.)</span><br>'+
        'I lend the post office a hand these days. <span class="k">Hex addresses a specialty.</span> '+
        'Old fools who write in bytes — turns out I was never the only one.<br>'+
        '<span class="dim">And the fire got my letter. Fire doesn\'t return things.</span>',
        '<span class="dim">(信纸收起来了。原来的位置上摞着别人的信封, 全是十六进制的地址, 都在排队。)</span><br>'+
        '我如今在给邮局帮工, <span class="k">专译 hex 地址</span>。'+
        '用字节写信的老糊涂——原来世上从来不止我一个。<br>'+
        '<span class="dim">我那封, 炉火收下了。火不退信。</span>'),next:-1}];
    }
    return [{sp:SP,t:B(
      '<span class="dim">(Framed on the wall of Room 2: the 48th stamp. It reads <span class="k">DELIVERED</span>.)</span><br>'+
      'I walked it there myself. Twenty years of sitting, and the road took one afternoon.<br>'+
      'Found out at the forge what the years already knew. …Walking there and knowing it are two different things. '+
      '<span class="k">I left the letter by their furnace.</span> The fire there is a lot like the fire here.',
      '<span class="dim">(2 号房的墙上裱着第 48 个戳, 上面是: <span class="k">DELIVERED——已送达</span>)</span><br>'+
      '我自己走着送去的。坐了二十年, 路其实就一个下午。<br>'+
      '在锻造厂知道了岁月早就知道的事。……走这一趟, 和光知道结果, 是两码事。'+
      '<span class="k">信我留在了他们的炉子边上。</span>那边的炉火, 跟这边的很像。'),next:-1}];
  }

  /* ---- 已译出 · 揭晓与抉择 ---- */
  if(stage==='reveal'){
    function fin(kind){
      SET(api,'inn_letter_end',kind);STEP(api,'inn_l3');
      GIVE(api,'ld_stamp',B('Return Stamp No.47','第 47 枚退信戳'));
    }
    var opts=letterOptions(get);
    var nodes=[
      {sp:SP,t:B(
        '<span class="dim">(He is on his feet before you reach the door — twenty years of sitting, gone in half a second.)</span><br>'+
        'You read it. I can see it on you. <span class="k">Say it slowly.</span>',
        '<span class="dim">(你还没进门他就站起来了——二十年的坐功, 半秒钟就破了)</span><br>'+
        '译出来了。我从你脸上看得出来。<span class="k">慢点说。</span>')},
      {sp:B('You','你'),t:B(
        '"THE FORGE. Nine bytes, two words. <span class="k">The Forge.</span>"',
        '「THE FORGE。九个字节, 两个词。<span class="k">锻造厂。</span>」')},
      {sp:SP,t:B(
        'The Forge… of course. That\'s where he clocked in. <span class="k">The Loader. PID 1024.</span> '+
        'I linked, he loaded. A lifetime of piecework, him and me — by the end you couldn\'t tell whose line was whose. '+
        'That\'s what good linking IS.<br>'+
        '<span class="dim">(He looks up, and for the first time the question isn\'t rhetorical.)</span> '+
        'You\'ve been out there. <span class="k">What\'s at the Forge these days?</span>',
        '锻造厂……对, 他上工的地方。<span class="k">装载者。PID 1024。</span>'+
        '我连, 他装。搭了一辈子伙——到后来哪句是我连的、哪句是他装的, 谁也分不清了。'+
        '链接这门手艺做到家, 就该分不清。<br>'+
        '<span class="dim">(他抬起头。这一回, 问题不是随口问的。)</span>'+
        '你在外面走动。<span class="k">锻造厂如今……是什么光景?</span>'),choices:[]}
    ];
    var c=nodes[2].choices;
    if(opts.indexOf('deliver')>=0){
      c.push({t:B('"The Loader is gone. But his child lives there — 7743. Let the letter go to the kid."',
                  '「装载者不在了。可锻造厂里住着他的孩子——7743。把信交给孩子吧。」'),next:3});
    }
    if(opts.indexOf('truth')>=0){
      c.push({t:B('"PID 1024 was reclaimed seven hundred epochs ago. Refcount zero. No backup."',
                  '「PID 1024 七百个纪元前就被回收了。引用归零, 没有备份。」'),next:5});
    }
    c.push({t:B('"Here\'s the address. This last stretch of road should be yours."',
                '「地址给你。最后这段路, 该你自己走。」'),next:7});
    nodes.push(
      /* 3: deliver */
      {sp:SP,t:B(
        '…A child. <span class="dim">(He runs his thumb along the envelope\'s worn edge, once, twice.)</span> He went and had a child.<br>'+
        'Then this letter never had the wrong address. <span class="k">It was just early by one lifetime — or late by one. </span>'+
        'Same thing, with mail.',
        '……孩子。<span class="dim">(他用拇指顺着信封磨圆的边, 摸了一遍, 又一遍)</span> 他居然有孩子了。<br>'+
        '那这封信从来没写错地址。<span class="k">只是早到了一辈——或者说, 晚到了一辈。</span>'+
        '对信来说, 这俩是一回事。'),next:4},
      {sp:'',t:B(
        '<span class="dim">(You carry the letter to the Foundry for him. Above the recipient line, ld has added one small row of honest words: '+
        '"To 7743, child of the Loader — your father\'s old workmate has some things to tell you.")</span>'+
        (HAS(api,'proc_ref')?'<br><span class="dim">(7743\'s process-table entry lists a PPID now: you. Which means this letter was delivered, in the end, to your house.)</span>':''),
        '<span class="dim">(你替他把信送到了锻造厂。收信人一栏上方, ld 添了一小行堂堂正正的字: '+
        '「装载者之子 7743 亲启——你父亲的老伙计, 有话对你说。」)</span>'+
        (HAS(api,'proc_ref')?'<br><span class="dim">(如今 7743 的进程表上, PPID 写的是你。所以这封信兜兜转转, 最后寄进了你的家里。)</span>':'')),
        choices:[{t:B('(Deliver it.)','(送到。)'),next:-1,do:function(){fin('deliver');}}]},
      /* 5: truth */
      {sp:SP,t:B(
        '<span class="dim">(He sits back down — slowly, the way you set down something you\'ve carried too far.)</span><br>'+
        '…Forty-seven times. The post office was telling me the truth all along: <span class="k">"addressee unknown."</span> '+
        'I just kept linking it to "address unclear". A bad symbol resolution. My specialty, apparently.',
        '<span class="dim">(他缓缓坐回去——像放下一件背得太远的东西)</span><br>'+
        '……47 次。邮局其实一直在对我说实话: <span class="k">「查无此人。」</span>'+
        '是我硬把它链接成了「地址不清」。一次错误的符号解析。看来还是我的老本行。'),next:6},
      {sp:'',t:B(
        '<span class="dim">(That night he sits by the hearth and reads the letter out loud, once, to no one. '+
        'The first line goes: "Old friend — the young symbols keep coming in undefined, and without you I link slow." '+
        'Then he folds it, and gives it to the fire.)</span><br>'+
        '"A letter read to the fire still counts as sent," he says. <span class="k">"Fire doesn\'t return things."</span>',
        '<span class="dim">(那晚他坐到壁炉边, 把信拆开, 念给空气听了一遍。'+
        '第一句是: 「老伙计, 新来的年轻符号又满地找不到定义了, 没你, 我连得很慢。」'+
        '念完他把信纸折好, 放进了火里。)</span><br>'+
        '「念给炉火听, 也算寄出了, 」他说。<span class="k">「火不退信。」</span>'),
        choices:[{t:B('(Sit with him a while.)','(陪他坐了一会儿。)'),next:-1,do:function(){fin('truth');}}]},
      /* 7: go */
      {sp:SP,t:B(
        '<span class="dim">(He tucks the letter inside his coat and takes up a walking stick that clearly hasn\'t worked in years — the stick, not the man. Perhaps both.)</span><br>'+
        'The address is right, and the legs are inventory, not write-offs. '+
        'Tell the landlady <span class="k">Room 2 is settled</span>. And that the soup was good. Twenty years of it.',
        '<span class="dim">(他把信揣进怀里, 拎起一根显然多年没上过岗的手杖——说的是手杖, 也可能连人一起)</span><br>'+
        '地址是对的, 腿是存货, 不是坏账。'+
        '替我跟老板娘说一声: <span class="k">2 号房结账</span>。汤很好。二十年都很好。'),next:8},
      {sp:'',t:B(
        '<span class="dim">(The door bell rings once behind him. Through the window you watch an old linker walk out into the static, holding an address like a lantern.)</span>',
        '<span class="dim">(门铃在他身后响了一声。隔着窗, 你看着一位老链接器走进静电茫茫的夜里, 把一个地址攥成了灯笼。)</span>'),
        choices:[{t:B('(Watch him go.)','(目送。)'),next:-1,do:function(){fin('go');}}]}
    );
    return nodes;
  }

  /* ---- 已接单 · 还没译 ---- */
  if(stage==='decode'){
    return [{sp:SP,t:B(
      'The desk\'s by the window — ink\'s full, paper\'s fresh. <span class="dim">(He holds his glasses up to the lamp, gives up, folds them.)</span><br>'+
      'My eyes went twenty years ago. <span class="k">0x45 and 0x46 look like twins to me now,</span> and one of them is the difference between a word and a wall.',
      '译信桌就在窗边——墨是满的, 纸是新的。<span class="dim">(他把老花镜举到灯前照了照, 放弃了, 折起来)</span><br>'+
      '我的眼睛二十年前就交了差。<span class="k">0x45 和 0x46 在我看来是双胞胎, </span>可它俩差的那一位, 就是「一个词」和「一堵墙」的差别。'),next:-1}];
  }

  /* ---- 初见 ---- */
  var nodes=[
    {sp:'',t:B(
      '<span class="dim">(Room 2 is too clean. On the desk: one bottle of ink, one stack of paper, one letter worn round at the corners. '+
      'The envelope is a bruise of purple stamps — RETURN TO SENDER, forty-seven of them.)</span>',
      '<span class="dim">(2 号房干净得过分。桌上只有一瓶墨水、一沓信纸, 和一封边角磨圆了的信。'+
      '信封被紫红色的戳盖成了淤青——RETURN TO SENDER, 整整 47 个。)</span>')},
    {sp:SP,t:B(
      'Name\'s ld. Linker, retired. My whole trade was connecting what other people wrote — '+
      'an undefined name came to me, I found where it lived. Forty years, never missed a symbol.<br>'+
      '<span class="k">…Go on, laugh. My own letter has been an unresolved reference for twenty years.</span>',
      '我叫 ld。老链接器, 退了。当年干的活, 是把别人写的东西连起来——'+
      '谁的名字没着落, 我就替他找到定义。四十年, 没漏过一个符号。<br>'+
      '<span class="k">……你笑吧。我自己的信, 倒成了二十年没解析出来的引用。</span>')},
    {sp:SP,t:B(
      'The postal daemon says the address <span class="k">won\'t parse</span>. Won\'t parse! It\'s printed right there on the front, plain as anything.<br>'+
      '<span class="dim">(A long pause. The kind with arithmetic in it.)</span><br>'+
      '…Took me years to see it. I\'ve written in bytes my whole life. <span class="k">They wanted words. I gave them the codes.</span>',
      '邮差进程说, 这地址「<span class="k">读不懂</span>」。读不懂! 地址明明白白就印在封皮上。<br>'+
      '<span class="dim">(他停了很久。那种停顿里有算术。)</span><br>'+
      '……过了好些年我才想明白。我这辈子写惯了字节。<span class="k">人家要的是字, 我给的是码。</span>'),choices:[
      {t:B('"Give me the letter. I read hex."','「信给我。hex 我认得。」'),next:3,
       do:function(){SET(api,'inn_letter_met');STEP(api,'inn_l1');}},
      {t:B('(Come back later.)','(先去忙别的。)'),next:4}
    ]},
    {sp:SP,t:B(
      '<span class="dim">(He hands it over with both hands, the way you pass someone a sleeping animal.)</span><br>'+
      'The copy desk is by the window. Take your time — it\'s waited twenty years, it can wait an evening.<br>'+
      '<span class="k">And if the place it names is one I won\'t dare hear… read it louder.</span>',
      '<span class="dim">(他双手把信递过来, 像递一只睡着的小动物)</span><br>'+
      '译信桌在窗边。慢慢来——它等了二十年, 不差这一晚。<br>'+
      '<span class="k">要是译出来的那个地方, 我不敢听——那你就大点声念。</span>'),next:-1},
    {sp:SP,t:B(
      'Mm. It keeps. <span class="dim">(He squares the stack of blank paper, which was already square.)</span> Everything in this room keeps.',
      '嗯, 不急。<span class="dim">(他把本来就齐的信纸又码齐了一遍)</span> 这屋里的东西, 都搁得住。'),next:-1}
  ];
  if(FLAG(api,'dt_ascii_done')){
    nodes.splice(2,0,{sp:SP,t:B(
      'Wait — I know those hands. <span class="k">You\'re the one who read the 1970 letter down at the Museum.</span> '+
      'The whole corridor talked about it for a week. A letter fifty years deaf, and somebody finally heard it.',
      '慢着——这双手我认得。<span class="k">表示馆那封 1970 年的信, 是你译的。</span>'+
      '走廊里议论了一个礼拜: 一封聋了五十年的信, 终于有人听见了。')});
  }
  return nodes;
}

/* ================================================================
   6. NPC 对话 · 失眠的排序进程 qsort (3 号房)
      —— 快排的不稳定性, 拟人成失眠
   ================================================================ */
function sorterDialog(api){
  var get=GETTER(api);
  var SP=B('qsort (Room 3)','排序进程 qsort (3 号房)');
  var stage=sorterStage(get);
  var arenaDone=FLAG(api,'algo_sql_done')||FLAG(api,'algo_bubble_done');

  if(stage==='done'){
    var lines=[{sp:'',t:B(
      '<span class="dim">(Room 3 is dark and even. Five bags stand in one true row. From the bed: breathing, slow, O(1) per breath. '+
      'On the door someone has hung a small sign: DO NOT DISTURB — <span class="k">ORDER IS STABLE</span>.)</span>',
      '<span class="dim">(3 号房又黑又匀。五件行李站成一列真理。床上传来呼吸声, 又慢又稳, 每口气 O(1)。'+
      '门上挂了块小牌: 请勿打扰——<span class="k">序已稳定</span>。)</span>'),next:-1}];
    return lines;
  }

  if(stage==='goodnight'){
    var nodes=[
      {sp:SP,t:B(
        '<span class="dim">(It walks the row once. Twice. Then stops mid-third, because there is nothing left to check.)</span><br>'+
        'Hat box. Backpack. Toolcase. Violin case. Trunk. The backpack and the toolcase weigh the same — '+
        '<span class="k">and the backpack came first, so it stands first.</span> I ran it forward. I ran it backward. '+
        '<span class="k">I can\'t find the fault. There is no fault to find.</span>',
        '<span class="dim">(它把行李检查了一遍。又一遍。第三遍走到一半停住了——因为已经没有可查的了。)</span><br>'+
        '帽盒。背包。工具箱。琴盒。大箱。背包和工具箱一样重——'+
        '<span class="k">背包先进的门, 所以它站前头。</span>我正着推了一遍, 又倒着推了一遍。'+
        '<span class="k">挑不出错。根本没有错可挑。</span>')},
      {sp:SP,t:B(
        'Do you know what that means, for something like me? All my life I\'ve been fast. Famous for fast. '+
        'But two equal things — <span class="k">I have never once put them in the same order twice.</span> Fast, yes. At peace, no.<br>'+
        'Tonight the rule is outside my head, standing in a row, <span class="k">holding itself up.</span> I could sleep on that. I think I will.',
        '你知道这对我这种东西意味着什么吗? 我这辈子快, 快出了名。'+
        '可两件一样重的东西——<span class="k">我从来没有两次把它们排成同一个顺序。</span>快是快, 心里从来没底。<br>'+
        '今晚这条规矩站在我脑子外面, 站成一列, <span class="k">自己撑住了自己。</span>这我就能睡了。我这就睡。')},
      {sp:SP,t:B(
        '<span class="dim">(It digs something out of the trunk — a small pillow, quilted in two halves, with a tiny brass pivot in the middle.)</span><br>'+
        'Take it. A <span class="k">comparator pillow</span>. When both ends weigh the same, it always tips toward the one that came first.<br>'+
        'I won\'t need it — <span class="k">the rule sleeps better in your hands than in my head.</span>'+
        (HAS(api,'query_medal')?'<br><span class="dim">…That\'s a Query Medal on you. Then you already know: finding fast is easy. Finding the SAME, every time — that\'s the hard trade.</span>':''),
        '<span class="dim">(它从大箱里翻出一样东西——一只小枕头, 两半绗缝, 正中一枚小铜轴。)</span><br>'+
        '拿着。<span class="k">比较器枕头。</span>两头一样沉的时候, 它永远偏向先来的那头。<br>'+
        '我用不上了——<span class="k">这条规矩搁在你手里, 比搁在我脑子里踏实。</span>'+
        (HAS(api,'query_medal')?'<br><span class="dim">……你身上那是查询勋章吧。那你早懂了: 找得快不难, 难的是每回都一样。</span>':'')),
        choices:[{t:B('"Goodnight, qsort."','「晚安, qsort。」'),next:3}]},
      {sp:SP,t:B(
        'Goodnight. <span class="dim">(It lies down. Ten seconds pass.)</span> …Partition complete. '+
        '<span class="dim">(The lamp clicks off by itself, respectfully.)</span>',
        '晚安。<span class="dim">(它躺下了。十秒钟过去。)</span>……分区完毕。'+
        '<span class="dim">(台灯很识趣地自己「啪」了一声, 灭了。)</span>'),next:-1}
    ];
    nodes.onEnd=function(){
      SET(api,'inn_sorter_end');STEP(api,'inn_r3');
      GIVE(api,'comparator_pillow',B('Comparator Pillow','比较器枕头'));
    };
    return nodes;
  }

  if(stage==='sort'){
    return [{sp:SP,t:B(
      '<span class="dim">(Its eyes are closed. Its voice is not asleep.)</span><br>'+
      'The bags are by the wall. The rule is one sentence with two halves: <span class="k">light before heavy; equal weight, earlier check-in first.</span><br>'+
      'Say it back to yourself before you touch anything. <span class="dim">That second half is the medicine.</span>',
      '<span class="dim">(它闭着眼。声音可一点没睡。)</span><br>'+
      '行李在墙边。规矩就一句, 分两半: <span class="k">轻的在前; 一样重的, 先进门的在前。</span><br>'+
      '动手之前先默念一遍。<span class="dim">后半句是药。</span>'),next:-1}];
  }

  /* ---- 初见 ---- */
  var nodes=[
    {sp:'',t:B(
      '<span class="dim">(Five pieces of luggage stand on the floor of Room 3, arranged, rearranged, and mid-rearrangement. '+
      'A process with dark rings under its eyes squats among them, moving the hat box to third position. Then back. Then to third position.)</span>',
      '<span class="dim">(3 号房地板上摆着五件行李——排过, 重排过, 正在被第三次重排。'+
      '一个黑眼圈很重的进程蹲在中间, 把帽盒挪到第三位。又挪回来。又挪到第三位。)</span>')},
    {sp:SP,t:B(
      'qsort. <span class="dim">Yes, that qsort.</span> Don\'t laugh.<br>'+
      'It\'s not that I\'m not tired. <span class="k">I don\'t dare close my eyes.</span> The moment I do, I think: '+
      'what if two bags weigh the same — <span class="k">who goes first?</span>',
      '我叫 qsort。<span class="dim">对, 就是那个 qsort。</span>别笑。<br>'+
      '不是不困。<span class="k">是不敢闭眼。</span>一闭眼就想: '+
      '万一有两件行李一样重——<span class="k">该谁在前头?</span>')},
    {sp:SP,t:B(
      'I\'ve sorted my whole life on speed. I\'m <span class="k">famous</span> for it. But two equal things… '+
      '<span class="k">I have never once put them in the same order twice.</span> '+
      'Every midnight I re-lay the row by a new rule, hoping this one will hold still till morning. It never holds.'+
      (arenaDone?'<br><span class="dim">…And you\'ve been to the Sanctum, haven\'t you. That MC — a voice loud enough to degrade O(n log n) to O(n²) on contact. No one sleeps downwind of him.</span>':''),
      '我排东西快, 这辈子<span class="k">快出了名</span>。可两件一样重的……'+
      '<span class="k">我从来没有两次把它们排成同一个顺序。</span>'+
      '所以每个半夜我都换条新规矩重摆一遍, 盼着这回能稳到天亮。从来稳不到。'+
      (arenaDone?'<br><span class="dim">……你从竞技场那边来的吧。那个司仪——嗓门大得能把 O(n log n) 当场喊成 O(n²)。有他在, 顺风三里地没人睡得着。</span>':'')),choices:[
      {t:B('"Say the rule. I\'ll lay the row — you inspect it."','「规矩你念, 行李我摆——你只管验收。」'),next:3,
       do:function(){SET(api,'inn_sorter_met');STEP(api,'inn_r1');}},
      {t:B('(Back away quietly.)','(悄悄退出去。)'),next:4}
    ]},
    {sp:SP,t:B(
      '<span class="dim">(It sits up so fast the hat box flinches.)</span><br>'+
      'Then listen once and listen whole: <span class="k">light before heavy. Equal weight — earlier check-in first.</span> That is the entire rule. Do not improvise.<br>'+
      '<span class="dim">If I can\'t find a fault in the row… I can sleep on it. It\'s been a very long time since I couldn\'t find a fault.</span>',
      '<span class="dim">(它猛地坐起来, 快得帽盒都抖了一下)</span><br>'+
      '那你听好, 一遍记全: <span class="k">轻的在前, 重的在后; 一样重的, 先进门的在前。</span>整条规矩就这些。别加戏。<br>'+
      '<span class="dim">要是这一列让我挑不出错……我就能睡了。我已经很久没有「挑不出错」过了。</span>'),next:-1},
    {sp:SP,t:B(
      '<span class="dim">(Behind you, the hat box moves to third position. Then back.)</span>',
      '<span class="dim">(你身后, 帽盒又被挪到了第三位。又挪了回去。)</span>'),next:-1}
  ];
  return nodes;
}

/* ================================================================
   7. NPC 对话 · 长桌 (深夜食堂 · flag 群像: 世界记得你)
   ================================================================ */
var TABLE_LINES={
  watchdog:{sp:B('The Long Table','长桌'),t:B(
    'Watchdog is flat on its back at the end of the table, four paws in the air, snoring like a healthy fan. '+
    'A note is pinned under one paw: <span class="k">"Knock three times if urgent. Softly."</span>',
    '看门狗 Watchdog 在长桌尽头四脚朝天, 呼噜打得像一台健康的风扇。'+
    '一只爪子底下压着张字条: <span class="k">「有急事敲三下。轻点。」</span>')},
  larry:{sp:B('The Long Table','长桌'),t:B(
    'Linear Larry is nursing his first and only drink of the night — he walked every table from the first to the last, skipping none, before he\'d sit. '+
    '<span class="k">"Chief Searcher\'s toast,"</span> he says, <span class="k">"no element left behind."</span>',
    '顺查老将 Larry 在喝今晚第一杯, 也是唯一一杯——落座之前, 他把每张桌子从头巡到尾, 一张没跳过。'+
    '<span class="k">「首席查找官, 敬各位, 」</span>他说, <span class="k">「一个都不落下。」</span>')},
  nightwatch:{sp:B('The Long Table','长桌'),t:B(
    'By the fire sits one warm drink nobody touches; the coaster reads <span class="k">"for the night watch"</span>. '+
    'The keeper says port 80 never comes. She warms it anyway. "The kid sleeps sound these days," she says. '+
    '<span class="dim">"Somebody ought to mind the father\'s three-second nap too."</span>',
    '炉边温着一杯没人碰的热饮, 杯垫上写着<span class="k">「留给守夜的」</span>。'+
    '老板娘说端口 80 那位从不来。她天天照温。「他家小子如今睡得踏实了, 」她说, '+
    '<span class="dim">「当爹的那三秒钟盹, 也该有人管着点。」</span>')},
  aria:{sp:B('The Long Table','长桌'),t:B(
    'The old radio is tuned to <span class="k">44.1 kHz</span> tonight. When the high note comes, every glass on the table hums along — and not one of them breaks.',
    '旧收音机今晚拧到了 <span class="k">44.1kHz</span>。高音上去的那一刻, 满桌的杯子都跟着轻轻嗡了一声——一个都没碎。')},
  kid7743:{sp:B('The Long Table','长桌'),t:B(
    '7743 perches on the very end of the bench with a hot milk and its truth-table homework. '+
    'Every little while it glances at the door — <span class="k">not waiting for anyone; checking that it doesn\'t have to anymore.</span>',
    '7743 蹲在长凳最边上, 面前一杯热牛奶, 摊着真值表作业。'+
    '它隔一小会儿就抬头看一眼门口——<span class="k">不是在等谁, 是确认自己不用再等谁了。</span>')},
  granny:{sp:B('The Long Table','长桌'),t:B(
    'Granny malloc and the keeper are arguing over whose ledger is older. Granny claims hers goes back to first boot; '+
    'the keeper says her page one holds a name Granny\'s never seen. <span class="dim">Neither yields. The pot has been refilled three times.</span>',
    'malloc 婆婆和 Cache 婶正在掰扯谁的账本更老。婆婆说她的账能追到第一次开机; '+
    'Cache 婶说她第一页上有个婆婆没见过的名字。<span class="dim">谁也不让谁。茶已经续到第三壶。</span>')}
};
function tableDialog(api){
  var g=tableGuests(GETTER(api),function(id){return HAS(api,id);});
  var nodes;
  if(!g.length){
    nodes=[{sp:B('The Long Table','长桌'),t:B(
      '<span class="dim">(A few strangers murmur over their bowls — ports, weather, the price of cycles. '+
      'Nobody you know. Yet. The table is long on purpose: it\'s betting you\'ll fill it.)</span>',
      '<span class="dim">(几个生面孔就着碗低声聊天——聊端口, 聊天气, 聊时钟周期的行情。'+
      '还没有你认识的人。桌子故意打这么长, 是赌你早晚能把它坐满。)</span>'),next:-1}];
    return nodes;
  }
  nodes=[{sp:B('The Long Table','长桌'),t:B(
    '<span class="dim">(The long table is '+(g.length>=4?'nearly full':'warming up')+' tonight — and you know '+
    (g.length===1?'one of the faces':'these faces')+'.)</span>',
    '<span class="dim">(长桌今晚'+(g.length>=4?'坐得快满了':'渐渐热起来')+'——而且这些面孔, 你认得。)</span>')}];
  for(var i=0;i<g.length;i++){
    var ln=TABLE_LINES[g[i]];
    if(ln)nodes.push({sp:ln.sp,t:ln.t});
  }
  nodes.push({sp:B('The Long Table','长桌'),t:B(
    '<span class="dim">(You did this. Every seat filled here is a door you once knocked on. The soup tastes better for it — that\'s not sentiment, that\'s a mechanic.)</span>',
    '<span class="dim">(这一桌是你攒出来的。这里每一个坐着的人, 都是你敲开过的一扇门。汤都跟着香了——这不是煽情, 这是机制。)</span>'),next:-1});
  return nodes;
}

/* ================================================================
   8. NPC 对话 · 故事椅 (壁炉边 · 环境叙事池)
   ================================================================ */
function chairDialog(api){
  var unlocked=!!FLAG(api,'inn_cache_remembered');
  var n=FLAG(api,'inn_story_i')||0;
  var idx=storyPick(n,unlocked);
  SET(api,'inn_story_i',n+1);
  var pool=storyPool(unlocked);
  return [
    {sp:'',t:B(
      '<span class="dim">(The chair by the fire is worn into the shape of every guest who ever sat in it. You sit. The fire pops once, clearing its throat.)</span>',
      '<span class="dim">(壁炉边的椅子被历代客人坐出了所有人的形状。你坐下。炉火「啪」地响了一声, 清了清嗓子。)</span>')},
    {sp:B('Fireside Tale','炉边往事'),t:pool[idx],next:-1}
  ];
}

/* ================================================================
   9. 室内地图 (24 × 16) —— 一间温暖的路边客栈
      北排三间客房 + 壁炉角; 大堂正中一张长桌
   ================================================================ */
var ROWS=[
  '########################',  // 0
  '#....#......#......#...#',  // 1   客房区: 后屋|2号房|3号房|壁炉角(20,1)炉铭
  '#....#......#......#...#',  // 2   客簿(2,2) ld(8,2) 译信桌(10,2) qsort(15,2) 行李阵(17,2) 故事椅(22,2)
  '#....#......#......#...#',  // 3
  '##.#####.######.####...#',  // 4   门: (2,4)(8,4)(15,4); 壁炉角敞开
  '#......................#',  // 5
  '#......................#',  // 6   Cache 婶(3,6)
  '#......................#',  // 7
  '#......########........#',  // 8   长桌(墙体 7..14)
  '#......................#',  // 9   长桌群像(11,9)
  '#......................#',  // 10
  '#......................#',  // 11
  '#......................#',  // 12
  '#......................#',  // 13  店规(18,13)
  '#......................#',  // 14  出生点(12,14)
  '########################'   // 15
];
var TILES=ROWS.map(function(r){return r.split('').map(function(c){return c==='#'?1:0;});});

/* ================================================================
   10. 模块定义
   ================================================================ */
var MOD={
  id:'inn',
  title:B('The Cache Inn','缓存驿站'),
  world:'as',
  unlock:{afterQuest:'m3'},   // index.html 第一章末任务实际 id = m3

  interior:{w:24,h:16,tiles:TILES,playerStart:{x:12,y:14}},

  npcs:[
    {id:'inn_cache',name:B('Auntie Cache','Cache 婶'),color:'#e8a06a',body:'#f5d8b0',suit:'#8a4a2a',
     x:3,y:6,dialog:cacheDialog},
    {id:'inn_ld',name:B('Old Linker ld','老链接器 ld'),color:'#b0a8d8',body:'#ded8f0',suit:'#4a4a7a',
     x:8,y:2,dialog:ldDialog},
    {id:'inn_qsort',name:B('qsort, sleepless','失眠的排序进程 qsort'),color:'#8ad0c0',body:'#d0f0e8',suit:'#2a6a5a',
     x:15,y:2,dialog:sorterDialog},
    {id:'inn_table',name:B('The Long Table','长桌'),color:'#c8b060',body:'#e8d8a0',suit:'#6a5a2a',
     x:11,y:9,dialog:tableDialog},
    {id:'inn_chair',name:B('The Story Chair','故事椅'),color:'#c07858',body:'#e8c0a8',suit:'#6a3a2a',
     x:22,y:2,dialog:chairDialog}
  ],

  steles:[
    {x:2,y:2,kind:'stele',title:B('The Guestbook','客簿'),text:B(
      '[GUESTBOOK · PAGE ONE]<br>'+
      'The first line has been thumbed nearly away — all that survives is a single digit: <span class="k">0</span>.<br>'+
      'Below it, twenty years of names. Some have a tiny hearth drawn after them — the regulars. '+
      'Some have blurred under old water marks — the ones who never came back.<br><br>'+
      '<span class="dim">The newest line is blank. The ink is already wet on the pen, waiting.</span>',
      '【客簿 · 第一页】<br>'+
      '第一行的字迹被摩挲得快没了——只认得出一个数字: <span class="k">0</span>。<br>'+
      '往下是二十年的名字。有些名字后面画着一只小小的火炉——那是常客; '+
      '有些名字被水渍晕开了——那是再没回来过的。<br><br>'+
      '<span class="dim">最新的一行空着。笔上的墨已经蘸好, 等着。</span>')},
    {x:20,y:1,kind:'stele',title:B('Hearth Plaque','炉铭'),text:B(
      '[HEARTH PLAQUE]<br>'+
      '"Lit at first boot. Twenty years, never out.<br>'+
      'House rule of the fire: <span class="k">whoever rests here, feeds it one log.</span><br>'+
      '<span class="dim">Fire can\'t read bytes. Fire only reads cold and warm.</span>"',
      '【炉铭】<br>'+
      '「此炉燃于第一次开机。二十年, 没灭过。<br>'+
      '炉火的店规: <span class="k">谁在这儿歇脚, 谁给它添一根柴。</span><br>'+
      '<span class="dim">火不识字节。火只认冷暖。</span>」')},
    {x:18,y:13,kind:'stele',title:B('House Rules','店规'),text:B(
      '[HOUSE RULES]<br>'+
      '① Meals and beds, no credit — <span class="k">REF is money too</span>.<br>'+
      '② Grudges from other domains stay at the door. Collect them on your way out.<br>'+
      '③ Anything left behind three days becomes the fire\'s.<br><br>'+
      '<span class="dim">A small line added underneath, in the keeper\'s hand:<br>'+
      '"Heartaches don\'t count as grudges. Those you may bring in."</span>',
      '【店规】<br>'+
      '① 打尖住店, 概不赊账——<span class="k">REF 也是钱</span>。<br>'+
      '② 别处领域的恩怨, 进门放门口, 出门原样领走。<br>'+
      '③ 落下的东西, 三天后归炉火。<br><br>'+
      '<span class="dim">最底下有一行老板娘手写的小字:<br>'+
      '「心事不算恩怨。心事可以带进来。」</span>')}
  ],

  quests:[
    {id:'inn_letter',line:'side',title:B('A Letter, Returned ×47','一封退回的信'),
     syllabus:'1.2 Data representation in the wild: hex → ASCII (revision, narrative)',
     desc:B('The old linker in Room 2 has written one letter for twenty years — returned 47 times. The address the postal daemon can\'t parse, you might: you learned this at the Museum.',
            '2 号房的老链接器写了二十年信, 被退回 47 次。邮差读不懂的地址, 你也许读得懂——这门手艺你在表示馆学过。'),
     steps:[
       {id:'inn_l1',text:B('Hear out old linker ld in Room 2 — twenty years, forty-seven stamps','听 2 号房的老链接器 ld 说完——二十年, 47 个退信戳')},
       {id:'inn_l2',text:B('Decode the hex address at the copy desk','在译信桌把十六进制地址译回"人话"')},
       {id:'inn_l3',text:B('Bring ld what the address really says','把地址背后的真相带回给 ld')}
     ]},
    {id:'inn_room3',line:'side',title:B('The Sleepless Room','失眠的房间'),
     syllabus:'9/10 Sorting in the wild: comparison rules & stable order (narrative)',
     desc:B('The sorting process in Room 3 rearranges its luggage every midnight and sleeps worse for it. It doesn\'t need a lullaby. It needs one row it cannot find a fault in.',
            '3 号客房的排序进程每晚重排行李, 越排越睡不着。它要的不是安眠曲, 是一列让它挑不出错的行李。'),
     steps:[
       {id:'inn_r1',text:B('Hear out qsort — why speed never once bought it sleep','听 qsort 说完——为什么"快"从来没换来过一次好觉')},
       {id:'inn_r2',text:B('Lay the five bags by its spoken rule (both halves of it)','按它口述的规矩排好五件行李 (两句都要听全)')},
       {id:'inn_r3',text:B('Say goodnight','道一声晚安')}
     ]},
    {id:'inn_ledger',line:'side',title:B('What the Innkeeper Forgot','Cache 婶的遗忘'),
     syllabus:'10.4 LRU, in person: the innkeeper as cache (narrative)',
     desc:B('Auntie Cache remembers everything about everyone — except the first line of her own ledger. Three patrol logs out in the domains may hold the slot she lost.',
            'Cache 婶记得每个人的每件事——唯独想不起自己账本的第一行。散在各领域的三份回收者巡视记录里, 也许藏着她丢掉的那一格。'),
     steps:[
       {id:'inn_c1',text:B('Hear about the one name Auntie Cache cannot call back','听 Cache 婶说那行她怎么都想不起的名字')},
       {id:'inn_c2',text:B('Read the Recycler\'s three patrol logs (Foundry #700 · Maze #8192 · Museum #4471)','读回收者的三份巡视记录 (锻造厂 #700 · 内存迷宫 #8192 · 表示馆 #4471)')},
       {id:'inn_c3',text:B('Recite the three small lines back to her, word for word','把那三行小字一字不改地念给她听')}
     ]}
  ],

  puzzles:[
    {id:'inn_desk',kind:'puzzleStation',x:10,y:2,title:B('The Copy Desk','译信桌'),
     syllabus:'1.2 hex → ASCII decoding (applied revision)',
     render:renderDesk,
     onKey:function(e,api){if(e.key==='?'&&hintFns.inn_desk)hintFns.inn_desk();}},
    {id:'inn_sort',kind:'puzzleStation',x:17,y:2,title:B('Room 3 · Luggage Row','3 号客房·行李阵'),
     syllabus:'9/10 comparison rules & stable sorting (applied revision)',
     render:renderLuggage,
     onKey:function(e,api){if(e.key==='?'&&hintFns.inn_sort)hintFns.inn_sort();}}
  ],

  onEnter:function(api){
    if(!FLAG(api,'inn_entered')){
      SET(api,'inn_entered');
      S(api,'open');
      TOAST(api,B('The hinge creaks and warmth rolls out — solder, broth, woodsmoke. Someone dozes by the fire; the mugs on the long table are still steaming. Twenty years, and the stove in this house has never once gone out.',
                  '门轴吱呀一声, 暖气裹着焊锡、骨汤和柴火的味道涌出来。壁炉边有人打盹, 长桌上的杯子还冒着热气——二十年了, 这间店的灶好像从来没熄过。'),true);
    }
  },

  onQuestComplete:function(qid,api){
    if(qid==='inn_letter'){
      var end=FLAG(api,'inn_letter_end');
      TOAST(api,end==='deliver'
        ?B('◈ Side quest complete ◈ The address was right all along. It was just early by one lifetime.',
           '◈ 支线完成 ◈ 地址从来没有错。它只是早到了一辈。')
        :end==='truth'
        ?B('◈ Side quest complete ◈ A letter read to the fire still counts as sent. Fire doesn\'t return things.',
           '◈ 支线完成 ◈ 念给炉火听, 也算寄出了。火不退信。')
        :B('◈ Side quest complete ◈ Stamp #48 says DELIVERED. He walked it there himself.',
           '◈ 支线完成 ◈ 第 48 个戳写着: 已送达。这一程, 他自己走完的。'),true);
    }else if(qid==='inn_room3'){
      TOAST(api,B('◈ Side quest complete ◈ The light in Room 3 is out — for the first time in years, with a clear conscience.',
                  '◈ 支线完成 ◈ 3 号房的灯熄了。这么多年头一回, 熄得心安理得。'),true);
    }else if(qid==='inn_ledger'){
      S(api,'quest');
      TOAST(api,B('◈ Side quest complete ◈ Page one of the guestbook has fresh ink: cache_0 — permanent resident.',
                  '◈ 支线完成 ◈ 客簿第一页添了新墨: cache_0——长住。'),true);
    }
  },

  /* 纯逻辑判定导出 —— 供 node 单测(引擎请忽略) */
  _test:{
    LETTER_HEX:LETTER_HEX,LETTER_PLAIN:LETTER_PLAIN,
    decodeHexAscii:decodeHexAscii,normAddr:normAddr,letterOk:letterOk,
    letterStage:letterStage,letterOptions:letterOptions,
    LUGGAGE:LUGGAGE,luggageAnswer:luggageAnswer,luggageOk:luggageOk,
    sorterStage:sorterStage,
    CACHE_FRAG_KEYS:CACHE_FRAG_KEYS,CACHE_FRAG_LINES:CACHE_FRAG_LINES,
    cacheFrags:cacheFrags,cacheStage:cacheStage,cacheUnlockable:cacheUnlockable,
    tableGuests:tableGuests,TABLE_LINES:TABLE_LINES,
    STORIES:STORIES,STORY_SECRET:STORY_SECRET,storyPool:storyPool,storyPick:storyPick,
    ROWS:ROWS,TILES:TILES
  }
};

window.GAME_MODULES=window.GAME_MODULES||[];
window.GAME_MODULES.push(MOD);
})();
