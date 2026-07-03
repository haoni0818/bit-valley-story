/* ============================================================
   inventory.js — BIT://ESCAPE 道具背包模块 (独立自包含)
   ------------------------------------------------------------
   模式沿用 leaderboard.js: 独立文件、window 全局、DOM 自建自管、
   样式内置(类名前缀 inv-, 无 !important, theme.css 可直接覆盖)。

   对外接口 (window.INVENTORY):
     init(opts)   — opts = {
                       getItems: () => [{id,name?,desc?}...],  // 优先: 动态回调
                       items:    [{id,name?,desc?}...],         // 次选: 静态快照(引擎没做动态查询时用)
                       api:      引擎 api 对象(预留, 未强依赖),
                       hotkey:   true,           // 默认注册 I 键开关
                       onOpen / onClose: fn
                     }
                     三选一都不给时: 尽力从 localStorage 存档猜(见 §5)。
     open() / close() / isOpen()
     notify(id, name?)   — 新道具入包: 记入获得顺序 + 播动画+toast
     _test                — 纯函数出口, 供单测
   详细接线说明见 inventory_integration.md
   ============================================================ */
(function () {
  'use strict';

  var HAS_DOM = (typeof document !== 'undefined') && (typeof window !== 'undefined');
  var G = (typeof window !== 'undefined') ? window : globalThis;

  /* ================= 双语 fallback (与 domain_*.js 同款) ================= */
  var T = G.T || function (s) { return typeof s === 'string' ? s : (s && s.en != null ? s.en : ''); };
  function B(en, zh) { return { en: en, zh: zh }; }

  /* ================= 色板 (GAME_ART.palette 优先, 否则内置同款兜底) ================= */
  var FALLBACK_PAL = {
    as: { bg: '#07090c', g0: '#0a120c', g1: '#101c13', dim: '#14532e', mid: '#1e8f4a',
          hi: '#33ff66', hi2: '#9fffbe', water: '#082a1e', acc: '#ffd45e', acc2: '#ff5e5e' },
    a2: { bg: '#0c0712', g0: '#140a1c', g1: '#1c1128', dim: '#4a1a72', mid: '#8a3ad8',
          hi: '#c86bff', hi2: '#efd8ff', water: '#22103a', acc: '#ff5ec8', acc2: '#ffd45e' }
  };
  function pal(world) {
    var GA = G.GAME_ART;
    if (GA && GA.palette && GA.palette[world]) return GA.palette[world];
    if (GA && GA.palette && GA.palette.as) return GA.palette.as;
    return FALLBACK_PAL[world] || FALLBACK_PAL.as;
  }
  function rgba(hex, a) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  /* 纸张固定用暖米色, 不随世界配色漂移(纸就是纸, 不是发光造物) */
  var PAPER = { face: '#e8dcb0', shade: '#c2b083', dark: '#a8955f', cut: '#7a6a44' };

  /* ================= 道具注册表 ================= */

  // 引擎里同一件道具偶尔用中文字面量当 id(如 ARG 幽灵密钥历史遗留), 这里做归一化
  var ALIASES = { '幽灵密钥': 'ghost_key', 'ghost key': 'ghost_key' };
  function normId(id) {
    id = String(id == null ? '' : id).trim();
    return ALIASES[id] || id;
  }

  var VALID_TYPES = { key: 1, ember: 1, shard: 1, note: 1, crystal: 1, badge: 1, charm: 1, medal: 1, chip: 1, block: 1 };

  // 引擎侧权威图标词汇(见 index.html 的 window.GAME_ITEMS[id].icon) → 本模块内部画法类型的映射。
  // 只在"本模块 ITEM_LORE 里没有登记的未知 id"时当兜底用(已登记的 id 用手工调好的 type/variant, 不被这里覆盖)。
  var ENGINE_ICON_ALIAS = {
    key: { type: 'key', variant: 'plain' },
    fire: { type: 'ember' },
    paper: { type: 'note', variant: 'slip' },
    shard: { type: 'shard' },
    gem: { type: 'crystal' },
    charm: { type: 'charm' },
    watch: { type: 'badge', variant: 'watch' },
    chip: { type: 'chip' }
  };

  var ITEM_LORE = {
    sys_source_of_babel: {
      type: 'crystal', variant: 'plain',
      name: B('Source of Babel', '巴别之源'),
      desc: B("The tower's oldest program, kept in the one language every translator refuses to touch: the original.",
              '巴别塔最老的那段程序, 用一种三位翻译官都不肯碰的语言保存着——原文。')
    },
    sys_ide_kit: {
      type: 'chip', variant: 'plain',
      name: B('Debugger Module', '调试器模块'),
      desc: B('Breakpoint, step, watch. Three small mercies for anyone who has ever been wrong.',
              '断点、单步、监视。给所有犯过错的人的三件小小的慈悲。')
    },
    sys_poem_scroll: {
      type: 'note', variant: 'slip',
      name: B('Decompiled Poem', '反编译的诗'),
      desc: B('Shifted back letter by letter until it rhymed again. Some translations run in reverse.',
              '一个字母一个字母移回去, 直到它重新押韵。有些翻译, 是倒着跑的。')
    },
    dev_footprint: {
      type: 'shard', variant: 'plain',
      name: B("Ghost's Footprint", '幽灵的脚印'),
      desc: B('One line, one step. It never guessed ahead, and neither should you.',
              '一行, 一步。它从不往前猜——你也别。')
    },
    dev_boundary_seal: {
      type: 'medal', variant: 'plain',
      name: B('Boundary Seal', '边界封印'),
      desc: B('Stamped exactly at 11 and 18, where most people never think to look.',
              '恰好盖在 11 和 18 上——大多数人想不起来看的那两个地方。')
    },
    dev_bugnet: {
      type: 'charm', variant: 'plain',
      name: B('Bug Net', '捕虫网'),
      desc: B('Catches exactly three species: the uninitialised, the off-by-one, and the loop that never ends.',
              '只捕三个品种: 未初始化、差一、还有那个永远不肯结束的循环。')
    },
    dev_cert: {
      type: 'medal', variant: 'plain',
      name: B("Debugger's Certificate", '调试者认证书'),
      desc: B('The proving grounds waited twenty years to sign one of these again.',
              '试炼场等了二十年, 才又签出这一张。')
    },
    dev_lifecycle_map: {
      type: 'note', variant: 'slip',
      name: B('Lifecycle Map', '生命周期图'),
      desc: B('A corridor drawn as a circle. You are allowed to walk it more than once.',
              '一条画成圆圈的走廊。允许你走不止一遍。')
    },
    dev_untested: {
      type: 'shard', variant: 'gold',
      name: B('The Untested Test', '未被测试的测试'),
      desc: B('A grader that judged for twenty years and was never judged itself. Now it says >=, not >.',
              '一台评判了二十年、自己却从未被评判的评分机。如今它说 >=, 不再说 >。')
    },
    eth_dissent: {
      type: 'note', variant: 'warrant',
      name: B('The Dissent', '异议判词'),
      desc: B('Case №0000, reopened after twenty years. Your opinion is on file now — the machine keeps minority reports.',
              '悬案 №0000, 二十年后重开。你的意见已经归档——这台机器, 保存少数派报告。')
    },
    med_fidelity_seal: {
      type: 'medal', variant: 'plain',
      name: B('Fidelity Seal', '保真印'),
      desc: B('Six items, sorted between what must stay whole and what only needed to stay recognisable.',
              '六件藏品, 分清了哪些必须完整无损, 哪些只需要还认得出来。')
    },
    med_photo_frame: {
      type: 'note', variant: 'slip',
      name: B('Salvaged Photograph', '抢救回的老照片'),
      desc: B('50×40, 4 bits deep, 1000 bytes of an opening night nobody had dared measure in twenty years.',
              '50×40, 4 bit 色深, 1000 字节的开馆之夜——二十年没人敢去量的那一晚。')
    },
    med_secret_pigment: {
      type: 'crystal', variant: 'plain',
      name: B('Secret Pigment', '秘藏颜料'),
      desc: B('Numbers that were never pixel runs at all. LOOK CLOSER, it said.',
              '从来就不是像素游程的一串数字。它说: LOOK CLOSER。')
    },
    ghost_key: {
      type: 'key', variant: 'ghost',
      name: B('Ghost Key', '幽灵密钥'),
      desc: B('A key humming for a door that does not exist yet — until the ninth one appears.',
              '一把还在等门出现的钥匙——第九道门出现之前, 它什么都不是。')
    },
    xor_key: {
      type: 'key', variant: 'hot',
      name: B('XOR Key', '异或密钥'),
      desc: B('Forged in truth-table iron. It only turns when the two sides disagree.',
              '真值表铁水浇铸而成。只有两侧不一致时, 它才会转动。')
    },
    carry_ember: {
      type: 'ember', variant: 'plain',
      name: B('Carry Ember', '进位火种'),
      desc: B('The one bit that refused to be forgotten in 1+1. Every ALU you meet later is its child.',
              '1+1 里那个不肯被遗忘的进位。以后见到的每一次进位, 都是它的孩子。')
    },
    null_shard: {
      type: 'shard', variant: 'plain',
      name: B('Null Pointer Shard', '空指针碎片'),
      desc: B('It points nowhere, and therefore can never point wrong.',
              '它不指向任何地方, 因此永远不会指错。')
    },
    wait_slip: {
      type: 'note', variant: 'warrant',
      name: B('wait() Warrant', 'wait() 委托书'),
      desc: B('A scorched-edge form, signed and port-stamped. Somewhere a process finally exits cleanly because of it.',
              '一张边缘烧焦、签了名盖了端口章的表单。因为它, 某个进程终于体面地退出了。')
    },
    session_key: {
      type: 'key', variant: 'session',
      name: B('Session Key', '会话密钥'),
      desc: B('One asymmetric handshake, a lifetime of symmetric whispers.',
              '非对称握手一次, 对称通信一世。')
    },
    time_crystal: {
      type: 'crystal', variant: 'plain',
      name: B('Time Crystal', '时间水晶'),
      desc: B('One second, dripped from the pendulum, frozen in your palm.',
              '钟摆滴下来的一秒, 冻在了掌心。')
    },
    query_medal: {
      type: 'medal', variant: 'plain',
      name: B('Querier’s Medal', '查询者勋章'),
      desc: B('Awarded to those who learned that SELECT is a question, not a demand.',
              '颁给弄懂 SELECT 是提问而非命令的人。')
    },
    proc_ref: {
      type: 'note', variant: 'slip',
      name: B('Adoption Slip · PID 7743', '领养凭证·PID 7743'),
      desc: B('PPID <- you. Written in green ink.',
              'PPID ← 你。绿色墨迹。')
    },
    '寄存器': {
      type: 'chip', variant: 'plain',
      name: B('Register Core', '寄存器核心'),
      desc: B('The reclaimed core of the Processor Temple. Warm, and faintly ticking.',
              '处理器神殿取回的核心。温热, 有轻微的滴答声。')
    },
    quantum_badge: {
      type: 'badge', variant: 'watch',
      name: B('100ms Pocket Watch', '百毫秒怀表'),
      desc: B('The scheduling judge renewed your slice — permanently.',
              '调度法官把你的 100ms 永久续期了。')
    },
    checksum_charm: {
      type: 'charm', variant: 'plain',
      name: B('Checksum Charm', '校验和护符'),
      desc: B('FIN-ACK, at last. A 20-year packet finally reached its destination.',
              'FIN-ACK, 终于。一个迷路了 20 年的包, 到家了。')
    }
  };

  // 剧情道具固定优先级(前段=主线通关必需, 后段=支线/隐藏但仍是"剧情道具"), 其余按获得顺序排在最后
  var FIXED_PRIORITY = [
    'ghost_key', 'xor_key', 'carry_ember', 'null_shard', 'session_key', 'time_crystal', '寄存器', 'query_medal',
    'wait_slip', 'proc_ref', 'quantum_badge', 'checksum_charm'
  ];
  var PRIORITY_INDEX = {};
  FIXED_PRIORITY.forEach(function (id, i) { PRIORITY_INDEX[id] = i; });

  // 兜底: 本模块没登记的 id, 先看引擎权威登记表 window.GAME_ITEMS[id].icon 能不能给个像样的图标类型,
  // 拿不到才退到最通用的"数据方块"(见 ENGINE_ICON_ALIAS 顶部注释)。
  function engineHint(id) {
    try {
      var reg = G.GAME_ITEMS && G.GAME_ITEMS[id];
      if (reg && reg.icon && ENGINE_ICON_ALIAS[reg.icon]) return ENGINE_ICON_ALIAS[reg.icon];
    } catch (e) { /* GAME_ITEMS 没加载/形状不对, 忽略 */ }
    return null;
  }
  function fallbackLore(id) {
    var hint = engineHint(id);
    return {
      type: hint ? hint.type : 'block',
      variant: hint ? (hint.variant || 'plain') : 'data',
      name: B(id || 'Unknown Object', id || '未知造物'),
      desc: B('An unlabeled data block. Its purpose is unclear — perhaps a later chapter will explain.',
              '一块没有标签的数据方块。用途不明——或许后面的章节会揭晓。')
    };
  }
  function loreOf(id) {
    id = normId(id);
    return ITEM_LORE[id] || fallbackLore(id);
  }
  function priorityIndex(id) {
    id = normId(id);
    return (id in PRIORITY_INDEX) ? PRIORITY_INDEX[id] : Infinity;
  }

  /* ================= 获得顺序记录 ================= */

  var acquireLog = {};   // normId -> {seq, name, ts}
  var seqCounter = 0;

  function recordAcquire(id, name) {
    var nid = normId(id);
    if (!nid) return null;
    if (!acquireLog[nid]) acquireLog[nid] = { seq: seqCounter++, name: name || null, ts: Date.now() };
    else if (name && !acquireLog[nid].name) acquireLog[nid].name = name;
    return acquireLog[nid];
  }

  /* ================= 排序 (剧情固定优先级 → 其余按获得顺序) ================= */

  function sortItems(list) {
    return (list || []).slice().sort(function (a, b) {
      var pa = priorityIndex(a.id), pb = priorityIndex(b.id);
      if (pa !== pb) return pa - pb;
      var sa = (a.seq == null) ? Infinity : a.seq, sb = (b.seq == null) ? Infinity : b.seq;
      if (sa !== sb) return sa - sb;
      return String(a.id).localeCompare(String(b.id));
    });
  }

  function registryProblems() {
    var problems = [];
    FIXED_PRIORITY.forEach(function (id) {
      if (!ITEM_LORE[id]) problems.push('FIXED_PRIORITY 里的 "' + id + '" 在 ITEM_LORE 里没有登记');
    });
    Object.keys(ITEM_LORE).forEach(function (id) {
      var e = ITEM_LORE[id];
      if (!e.type || !VALID_TYPES[e.type]) problems.push(id + ': type 非法 (' + e.type + ')');
      if (!e.name || !e.name.en || !e.name.zh) problems.push(id + ': name.en/zh 缺失');
      if (!e.desc || !e.desc.en || !e.desc.zh) problems.push(id + ': desc.en/zh 缺失');
    });
    return problems;
  }

  /* ================= 像素图标 (24×24 逻辑格, 程序化 canvas) ================= */

  function R(ctx, u) {
    return function (c, x, y, w, h) {
      ctx.fillStyle = c;
      var x1 = Math.round(x * u), y1 = Math.round(y * u),
          x2 = Math.round((x + w) * u), y2 = Math.round((y + h) * u);
      ctx.fillRect(x1, y1, Math.max(1, x2 - x1), Math.max(1, y2 - y1));
    };
  }
  // 行扫描实心圆(像素圆), 复用 r() 矩形工厂, 保持全库"只画矩形"的像素美术风格
  function disc(r, color, cx, cy, rad) {
    for (var yy = -rad; yy <= rad; yy++) {
      var span = Math.sqrt(Math.max(0, rad * rad - yy * yy));
      var w = span * 2;
      if (w < 0.6) continue;
      r(color, cx - span, cy + yy, w, 1);
    }
  }

  function drawKey(r, p, t, variant) {
    // 经典"钥匙"剪影: 圆环柄 + 直杆 + 齿, 任何配色下都一眼可辨
    var col = variant === 'hot' ? p.acc2 : (variant === 'ghost' ? p.hi2 : p.hi);
    var bcx = 7, bcy = 8, brad = 5.2, hole = 2.7;
    if (variant === 'ghost') {
      var gb = 0.16 + 0.12 * Math.sin(t / 300);
      disc(r, rgba(p.hi2, gb), bcx, bcy, brad + 3.5);   // 幽灵光晕(比环大一圈)
    }
    disc(r, col, bcx, bcy, brad);                        // 圆环外圈
    disc(r, p.bg, bcx, bcy, hole);                        // 环孔(镂空, 剩下一圈"O")
    r(col, bcx + brad - 1.2, bcy - 1.3, 12, 2.6);          // 直杆(从环边伸出)
    r(col, bcx + brad + 8.5, bcy + 1.3, 2.2, 3.6);        // 齿1
    r(col, bcx + brad + 5, bcy + 1.3, 2.2, 2.6);          // 齿2
    if (variant === 'hot') {
      r(rgba(p.acc, 0.6 + 0.35 * Math.sin(t / 160)), bcx - 1.5, bcy - brad - 1, 3, 3);   // 环顶熔滴/火星
      r(rgba(p.acc2, 0.5), bcx + brad + 1, bcy + 3.4, 2, 2);                              // 杆上余温
    } else if (variant === 'ghost') {
      r(rgba(p.hi2, 0.6 + 0.4 * Math.sin(t / 220)), bcx - 2, bcy - 2, 1.4, 1.4);          // 环上闪烁光点
      r(rgba(p.hi2, 0.4), bcx + brad + 9, bcy - 1, 1, 1);
    } else if (variant === 'session') {
      var bl = 0.5 + 0.5 * Math.sin(t / 260);                                             // 环心同步脉冲
      r(rgba(p.hi2, 0.35 + 0.5 * bl), bcx - 1.1, bcy - 1.1, 2.2, 2.2);
    }
  }

  function drawEmber(r, p, t) {
    r('rgba(0,0,0,.35)', 4, 20, 16, 2);              // 落影
    r('#241008', 4, 9, 16, 12);                      // 焦黑外壳
    r('#3a1810', 5, 10, 14, 10);
    r(p.acc2, 7, 12, 10, 6);                         // 熔芯(橙红)
    r(p.acc, 9, 14, 6, 3);                           // 高温核心(琥珀)
    var fl = 0.5 + 0.5 * Math.sin(t / 170);
    r(rgba(p.acc2, 0.45 + 0.4 * fl), 10, 6, 4, 4);   // 火苗
    r(rgba(p.acc, 0.55 + 0.35 * fl), 11, 3, 2, 4);
    r(rgba(p.acc, 0.3), 9, 5, 1, 2);
  }

  function drawShard(r, p, t) {
    // 上半晶体: 尖顶收窄的宝石轮廓(锥形棱面), 断裂处不齐
    r(p.mid, 11, 2, 2, 2);
    r(p.mid, 10, 4, 4, 2);
    r(p.hi2, 9, 6, 6, 2);
    r(p.dim, 8, 8, 8, 2);
    r(p.dim, 7, 10, 9, 2);            // 最宽处 = 断裂前的腰身
    r(p.g0, 7, 12, 4, 1); r(p.g0, 13, 12, 3, 1);   // 断口两侧参差的碎边(留中空)
    // 下半晶体: 跌落错位 + 变暗变尖, 尖端几乎融入背景("指向虚无")
    r(p.dim, 8, 14, 7, 2);
    r(p.dim, 9, 16, 5, 2);
    r(p.g1, 10, 18, 3, 2);
    r(p.bg, 11, 20, 1, 1);
    // 断面残光(裂开的瞬间还没散尽的一点引用)
    var bl = 0.25 + 0.3 * Math.sin(t / 260);
    r(rgba(p.hi, bl), 10, 12, 1, 2);
    r(rgba(p.hi, bl * 0.7), 14, 13, 1, 1);
    // 裂缝里漂浮的碎屑(强化"碎"感)
    var fl = 0.5 + 0.5 * Math.sin(t / 480);
    r(rgba(p.hi2, 0.25 + 0.35 * fl), 5, 9, 1, 1);
    r(rgba(p.hi2, 0.2), 18, 11, 1, 1);
  }

  function drawNote(r, p, t) {
    // "纸条要有纸条的样子": 米色纸身 + 折角 + 字线, 与世界配色无关(纸就是纸)
    r('rgba(0,0,0,.32)', 4, 4, 15, 17);              // 投影
    r(PAPER.face, 3, 2, 15, 17);                     // 纸身
    r(PAPER.shade, 3, 2, 15, 1);
    r(PAPER.shade, 3, 18, 15, 1);
    r(PAPER.shade, 3, 2, 1, 17);
    r(p.bg, 15, 2, 3, 3);                            // 折角缺口(露出底色)
    r(PAPER.dark, 15, 2, 3, 1); r(PAPER.dark, 17, 2, 1, 3);
    r(PAPER.cut, 15.6, 3.2, 1.6, 1.6);               // 折角阴影
    r(PAPER.shade, 5, 6, 9, 1);                      // 字线
    r(PAPER.shade, 5, 9, 11, 1);
    r(PAPER.shade, 5, 12, 7, 1);
    var bl = 0.75 + 0.2 * Math.sin(t / 400);
    r(rgba(p.acc2, 0.35), 11, 13, 6, 6);             // 印泥晕开(warrant: 红色官方图章)
    r(rgba(p.acc2, bl), 12, 14, 4, 4);
  }

  // wait_slip 用上面红色官方图章版; proc_ref("绿色墨迹"手写领养凭证)走这个变体——同样是纸, 但签名不是盖章
  function drawNoteSlip(r, p, t) {
    r('rgba(0,0,0,.32)', 4, 4, 15, 17);
    r(PAPER.face, 3, 2, 15, 17);
    r(PAPER.shade, 3, 2, 15, 1);
    r(PAPER.shade, 3, 18, 15, 1);
    r(PAPER.shade, 3, 2, 1, 17);
    r(p.bg, 15, 2, 3, 3);
    r(PAPER.dark, 15, 2, 3, 1); r(PAPER.dark, 17, 2, 1, 3);
    r(PAPER.cut, 15.6, 3.2, 1.6, 1.6);
    r(PAPER.shade, 5, 6, 9, 1);
    r(PAPER.shade, 5, 9, 11, 1);
    // 手写签名(绿色墨迹, 潦草的一道波浪线, 呼应"PPID ← 你。绿色墨迹。")
    var bl = 0.6 + 0.4 * Math.sin(t / 420);
    r(rgba(p.hi, 0.55 + 0.35 * bl), 5, 13, 3, 1);
    r(rgba(p.hi, 0.55 + 0.35 * bl), 8, 12.4, 2, 1);
    r(rgba(p.hi, 0.55 + 0.35 * bl), 10, 13, 3, 1);
    r(rgba(p.hi2, 0.5 + 0.4 * bl), 5, 15.2, 8, 0.8);   // 签名下划线
  }

  function drawCrystal(r, p, t) {
    r(p.dim, 9, 2, 6, 7); r(p.mid, 8, 2, 2, 7); r(p.mid, 14, 2, 2, 7);
    r(p.hi, 10, 3, 4, 5);
    r(p.dim, 7, 9, 10, 10); r(p.mid, 7, 9, 2, 10); r(p.mid, 15, 9, 2, 10);
    var bl = 0.45 + 0.4 * Math.sin(t / 240);
    r(p.hi2, 9, 11, 6, 6);
    r(rgba(p.hi, 0.3 + 0.5 * bl), 10, 12, 4, 4);
    r(p.acc, 11.5, 13, 1, 4);                        // 时针指线
    r(p.acc, 12, 9, 1, 3);
    r('rgba(0,0,0,.3)', 6, 19, 12, 2);
  }

  function drawBadge(r, p, t, variant) {
    if (variant === 'watch') {
      r(p.dim, 10, 0, 4, 2);                         // 表链
      disc(r, p.g1, 12, 13, 9); disc(r, p.dim, 12, 13, 8); disc(r, p.bg, 12, 13, 6.5);
      r(p.mid, 11.5, 6, 1, 1); r(p.mid, 11.5, 20, 1, 1); r(p.mid, 4, 12.5, 1, 1); r(p.mid, 20, 12.5, 1, 1);
      r(p.hi, 12, 8, 1, 5);                          // 时针
      r(p.hi, 12, 13, 4, 1);                         // 分针
      var bl = 0.5 + 0.5 * Math.sin(t / 220);
      r(rgba(p.acc, 0.5 + 0.4 * bl), 11, 12, 2, 2);
    } else {
      r('rgba(0,0,0,.32)', 3, 5, 18, 15);
      r(p.g1, 2, 4, 18, 15); r(p.dim, 2, 4, 18, 1);
      r(p.bg, 4, 6, 6, 6); r(p.mid, 5, 7, 4, 4); r(p.hi2, 6, 8, 2, 2);   // 照片剪影
      r(p.dim, 11, 7, 7, 1); r(p.dim, 11, 9, 7, 1); r(p.dim, 11, 11, 5, 1);
      var bl2 = 0.4 + 0.4 * Math.sin(t / 300);
      r(rgba(p.hi, bl2), 4, 16, 14, 1);
    }
  }

  function drawCharm(r, p, t) {
    r(p.dim, 10.5, 1, 3, 3);
    disc(r, p.g1, 12, 13, 8); disc(r, p.dim, 12, 13, 7); disc(r, p.bg, 12, 13, 5.5);
    r(p.hi, 9, 11, 2, 1); r(p.hi, 13, 11, 2, 1);
    r(p.hi, 9, 14, 2, 1); r(p.hi, 13, 14, 2, 1);
    var bl = 0.5 + 0.4 * Math.sin(t / 260);
    r(rgba(p.acc, 0.5 + 0.4 * bl), 11, 12, 2, 2);
  }

  function drawMedal(r, p, t) {
    r(p.acc2, 8, 1, 3, 8); r(p.mid, 13, 1, 3, 8);    // 双彩带
    disc(r, p.g1, 12, 15, 8.5); disc(r, p.dim, 12, 15, 7.5); disc(r, p.bg, 12, 15, 6);
    disc(r, p.hi, 11, 14, 2.6); disc(r, p.bg, 11, 14, 1.6);   // 放大镜镜面(查询者)
    r(p.hi, 13.5, 16.5, 3, 1.4);                     // 放大镜手柄
    var bl = 0.5 + 0.4 * Math.sin(t / 260);
    r(rgba(p.acc, 0.35 + 0.3 * bl), 10.4, 13.4, 1.4, 1.4);
  }

  function drawBlock(r, p, t) {
    r('rgba(0,0,0,.32)', 4, 18, 16, 2);
    r(p.g1, 4, 6, 16, 14); r(p.dim, 4, 6, 16, 1);
    r(p.mid, 4, 6, 2, 14); r(p.mid, 18, 6, 2, 14);
    r(p.bg, 7, 9, 10, 8);
    var bl = 0.4 + 0.4 * Math.sin(t / 300);
    r(rgba(p.hi, bl), 11, 10, 2, 2);                 // "?" 上点
    r(rgba(p.hi, 0.5 + 0.3 * bl), 10.5, 13, 3, 2);   // "?" 弯钩(近似)
    r(p.hi2, 11, 16, 2, 2);                          // "?" 下点
  }

  function drawChip(r, p, t) {
    // 处理器核心: 迷你版 sprites.js 'cpu' 神殿意象(引脚网格 + 发光 die), 呼应"寄存器核心"
    for (var i = 0; i < 3; i++) {
      r(p.dim, 1, 5 + i * 5, 3, 2); r(p.dim, 20, 5 + i * 5, 3, 2);      // 左右引脚
    }
    r(p.g1, 4, 3, 16, 18);                            // 芯片体
    r(p.dim, 4, 3, 16, 1); r(p.g0, 4, 20, 16, 1);
    r(p.bg, 8, 15, 8, 5);                              // 底部接口
    var bl = 0.4 + 0.4 * Math.sin(t / 260);
    r(p.dim, 6, 5, 12, 8);
    r(rgba(p.hi, 0.28 + 0.5 * bl), 7, 6, 10, 6);       // 顶部发光 die
    r(p.hi2, 10, 8, 4, 2);
  }

  function drawIcon(ctx, size, id, t, world) {
    var lore = loreOf(id), p = pal(world), u = size / 24, r = R(ctx, u);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    t = t || 0;
    switch (lore.type) {
      case 'key':     drawKey(r, p, t, lore.variant); break;
      case 'ember':   drawEmber(r, p, t); break;
      case 'shard':   drawShard(r, p, t); break;
      case 'note':    (lore.variant === 'slip' ? drawNoteSlip : drawNote)(r, p, t); break;
      case 'crystal': drawCrystal(r, p, t); break;
      case 'badge':   drawBadge(r, p, t, lore.variant); break;
      case 'charm':   drawCharm(r, p, t); break;
      case 'medal':   drawMedal(r, p, t); break;
      case 'chip':    drawChip(r, p, t); break;
      default:        drawBlock(r, p, t); break;
    }
  }

  /* ================= 数据来源 (getItems / items 快照 / localStorage 兜底猜) ================= */

  var opts = { getItems: null, items: null, api: null, hotkey: true, onOpen: null, onClose: null };

  function guessItemsFromSave() {
    if (typeof localStorage === 'undefined') return [];
    try {
      var raw = localStorage.getItem('bitescape_v3');
      if (!raw) return [];
      var d = JSON.parse(raw);
      if (!d) return [];
      var src = d.items || d.inventory || d.bag || null;
      if (Array.isArray(src)) {
        return src.map(function (it) {
          if (typeof it === 'string') return { id: it, name: null };
          if (it && typeof it === 'object') return { id: it.id || it.itemId || it.key || '', name: it.name || null };
          return null;
        }).filter(function (it) { return it && it.id; });
      }
      if (src && typeof src === 'object') {
        return Object.keys(src).map(function (k) {
          var v = src[k];
          return { id: k, name: (v && v.name) || null };
        });
      }
    } catch (e) { /* 存档坏了/形状不认识 —— 尽力而为, 静默放弃 */ }
    return [];
  }

  // 汇总当前应该显示的道具列表: [{id, name, desc}], 已去重(按 normId)
  function currentItems() {
    var raw;
    if (typeof opts.getItems === 'function') {
      try { raw = opts.getItems() || []; } catch (e) { console.warn('[INV] getItems 抛异常', e); raw = []; }
    } else if (Array.isArray(opts.items)) {
      raw = opts.items;
    } else {
      raw = guessItemsFromSave();
    }
    var seen = {}, out = [];
    (raw || []).forEach(function (it) {
      if (!it || it.id == null) return;
      var nid = normId(it.id);
      if (!nid || seen[nid]) return;
      seen[nid] = true;
      recordAcquire(nid, (typeof it.name === 'string') ? it.name : null);
      out.push({ id: nid, name: it.name != null ? it.name : null, desc: it.desc != null ? it.desc : null });
    });
    // 引擎没接入时, 至少把 notify() 记过的道具也显示出来(防止 getItems 漏报)
    Object.keys(acquireLog).forEach(function (nid) {
      if (!seen[nid]) {
        seen[nid] = true;
        out.push({ id: nid, name: acquireLog[nid].name, desc: null });
      }
    });
    return out;
  }

  function displayName(item, lore) {
    if (item.name != null && item.name !== '') return T(item.name);
    return T(lore.name);
  }
  function displayDesc(item, lore) {
    if (item.desc != null && item.desc !== '') return T(item.desc);
    return T(lore.desc);
  }

  function sortedDisplayList() {
    var items = currentItems();
    var withSeq = items.map(function (it) {
      var log = acquireLog[it.id];
      return { id: it.id, name: it.name, desc: it.desc, seq: log ? log.seq : null };
    });
    return sortItems(withSeq);
  }

  /* ================= 面板 UI ================= */

  var CSS = [
    '#inv-root{position:fixed;inset:0;z-index:61;display:none;align-items:center;justify-content:center;',
    '  background:rgba(2,5,3,.62);font-family:"Courier New",monospace}',
    '#inv-root.inv-on{display:flex}',
    '.inv-panel{width:min(760px,95vw);height:min(520px,90vh);display:flex;flex-direction:column;',
    '  background:rgba(4,9,6,.97);border:1px solid #2f6f2f;border-radius:6px;color:#bfeebf;',
    '  font-size:13px;line-height:1.6;box-shadow:0 0 34px rgba(40,120,60,.3)}',
    '.inv-head{display:flex;justify-content:space-between;align-items:center;gap:8px;',
    '  padding:9px 14px;border-bottom:1px solid #2f6f2f}',
    '.inv-title{color:#9fee9f;letter-spacing:2px;font-size:14px}',
    '.inv-count{color:#5a8a5a;font-size:11px;letter-spacing:1px}',
    '.inv-btn{background:#0a1f0a;color:#7CFC00;border:1px solid #2f6f2f;padding:4px 12px;',
    '  font-family:inherit;font-size:12px;cursor:pointer;letter-spacing:1px;border-radius:2px}',
    '.inv-btn:hover{background:#123312;box-shadow:0 0 10px #2b6}',
    '.inv-main{flex:1;display:flex;gap:0;min-height:0}',
    '.inv-gridwrap{flex:1.3;min-width:0;overflow-y:auto;overflow-x:hidden;padding:12px}',
    '.inv-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}',
    '.inv-slot{aspect-ratio:1;background:rgba(10,20,10,.4);border:1px solid #1f3f1f;border-radius:3px;',
    '  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer;',
    '  position:relative;padding:3px}',
    '.inv-slot:hover{border-color:#3a6a3a;background:rgba(20,40,20,.35)}',
    '.inv-slot.inv-sel{border-color:#7CFC00;box-shadow:0 0 10px rgba(43,102,43,.6);background:rgba(20,50,20,.4)}',
    '.inv-slot canvas{width:70%;height:70%;image-rendering:pixelated}',
    '.inv-slot-name{font-size:9.5px;color:#8ab88a;text-align:center;white-space:nowrap;overflow:hidden;',
    '  text-overflow:ellipsis;max-width:100%}',
    '.inv-slot.inv-empty{cursor:default;border-style:dashed;border-color:#152515}',
    '.inv-slot.inv-empty:hover{border-color:#152515;background:rgba(10,20,10,.4)}',
    '.inv-detail{flex:1;min-width:0;border-left:1px solid #1f3f1f;padding:18px 16px;display:flex;flex-direction:column;',
    '  align-items:center;text-align:center;gap:10px;overflow-y:auto}',
    '.inv-detail canvas{image-rendering:pixelated;filter:drop-shadow(0 0 10px rgba(51,255,102,.35))}',
    '.inv-detail-name{color:#9fee9f;font-size:15px;letter-spacing:1px}',
    '.inv-detail-desc{color:#bfeebf;font-size:12.5px;line-height:1.7;max-width:220px}',
    '.inv-detail-empty{color:#3f6a3f;font-size:12px;margin:auto}',
    '.inv-foot{display:flex;align-items:center;gap:12px;padding:8px 14px;border-top:1px solid #2f6f2f}',
    '.inv-hint{color:#3f6a3f;font-size:11px;flex:1}',
    /* 入包提示(右下角) */
    '.inv-notify{position:fixed;right:18px;z-index:70;display:flex;align-items:center;gap:8px;',
    '  background:rgba(4,9,6,.95);border:1px solid #2f6f2f;padding:6px 14px 6px 6px;border-radius:4px;',
    '  transform:translateX(130%);opacity:0;transition:transform .38s cubic-bezier(.2,.8,.3,1),opacity .3s,bottom .25s;',
    '  box-shadow:0 0 18px rgba(40,120,60,.35);pointer-events:none}',
    '.inv-notify.inv-show{transform:translateX(0);opacity:1}',
    '.inv-notify.inv-hide{transform:translateX(40%);opacity:0}',
    '.inv-notify canvas{width:32px;height:32px;image-rendering:pixelated}',
    '.inv-notify-text{font-size:12px;color:#bfeebf;white-space:nowrap}',
    '.inv-notify-text b{color:#ffce3a}'
  ].join('\n');

  var ui = null;               // {root, gridwrap, detail, count}
  var selectedId = null;
  var refreshHandle = null;    // rAF handle for icon glow animation while open

  function h(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function currentWorld() {
    if (typeof G.WORLD === 'string') return G.WORLD;
    if (HAS_DOM && document.body && document.body.classList.contains('world-a2')) return 'a2';
    return 'as';
  }

  function buildUI() {
    if (ui || !HAS_DOM) return;
    var style = document.createElement('style');
    style.id = 'inv-style';
    style.textContent = CSS;
    document.head.appendChild(style);

    var root = h(
      '<div id="inv-root">' +
      ' <div class="inv-panel">' +
      '  <div class="inv-head">' +
      '   <span class="inv-title">◤ BACKPACK ◢ 背包</span>' +
      '   <span class="inv-count"></span>' +
      '   <button class="inv-btn inv-close">✕</button>' +
      '  </div>' +
      '  <div class="inv-main">' +
      '   <div class="inv-gridwrap"><div class="inv-grid"></div></div>' +
      '   <div class="inv-detail"></div>' +
      '  </div>' +
      '  <div class="inv-foot"><span class="inv-hint">I / Esc 关闭 · 点击道具查看详情</span></div>' +
      ' </div>' +
      '</div>');
    document.body.appendChild(root);

    ui = {
      root: root,
      grid: root.querySelector('.inv-grid'),
      detail: root.querySelector('.inv-detail'),
      count: root.querySelector('.inv-count')
    };
    root.querySelector('.inv-close').addEventListener('click', close);
    root.addEventListener('click', function (e) { if (e.target === root) close(); });
  }

  var MIN_SLOTS = 24;   // 6×4

  function renderDetail(item, lore) {
    if (!ui) return;
    ui.detail.innerHTML = '';
    if (!item) {
      ui.detail.innerHTML = '<div class="inv-detail-empty">选择一件道具查看详情</div>';
      return;
    }
    var cv = document.createElement('canvas');
    cv.width = 96; cv.height = 96;
    ui.detail.appendChild(cv);
    drawIcon(cv.getContext('2d'), 96, item.id, performance.now(), currentWorld());
    var nm = h('<div class="inv-detail-name"></div>'); nm.textContent = displayName(item, lore);
    var ds = h('<div class="inv-detail-desc"></div>'); ds.textContent = displayDesc(item, lore);
    ui.detail.appendChild(nm); ui.detail.appendChild(ds);
  }

  function renderGrid() {
    if (!ui) return;
    var list = sortedDisplayList();
    ui.count.textContent = list.length + ' 件';
    ui.grid.innerHTML = '';
    var total = Math.max(MIN_SLOTS, Math.ceil(list.length / 6) * 6);
    if (selectedId && !list.some(function (it) { return it.id === selectedId; })) selectedId = null;
    if (!selectedId && list.length) selectedId = list[0].id;

    for (var i = 0; i < total; i++) {
      if (i < list.length) {
        var item = list[i], lore = loreOf(item.id);
        var slot = h('<div class="inv-slot" tabindex="0"></div>');
        if (item.id === selectedId) slot.classList.add('inv-sel');
        var cv = document.createElement('canvas');
        cv.width = 48; cv.height = 48;
        slot.appendChild(cv);
        drawIcon(cv.getContext('2d'), 48, item.id, performance.now(), currentWorld());
        var nmEl = h('<div class="inv-slot-name"></div>');
        nmEl.textContent = displayName(item, lore);
        slot.appendChild(nmEl);
        slot.title = displayName(item, lore);
        (function (it, lr, sl) {
          sl.addEventListener('click', function () {
            selectedId = it.id;
            ui.grid.querySelectorAll('.inv-slot').forEach(function (s) { s.classList.remove('inv-sel'); });
            sl.classList.add('inv-sel');
            renderDetail(it, lr);
          });
        })(item, lore, slot);
        ui.grid.appendChild(slot);
      } else {
        ui.grid.appendChild(h('<div class="inv-slot inv-empty"></div>'));
      }
    }
    var sel = list.find(function (it) { return it.id === selectedId; });
    renderDetail(sel || null, sel ? loreOf(sel.id) : null);
  }

  // 面板开着时给图标一点呼吸感光效(与游戏内建筑/NPC 呼吸光同风格), 低频重绘, 不重建 DOM
  function startGlow() {
    if (refreshHandle || !HAS_DOM) return;
    var last = 0;
    function tick(ts) {
      if (!isOpen()) { refreshHandle = null; return; }
      if (ts - last > 90) {   // ~11fps 足够, 省性能
        last = ts;
        var world = currentWorld();
        // 按当前排序重新映射 id → canvas(与 DOM 顺序一致), 不重建节点只重绘像素
        var list = sortedDisplayList();
        var canvases = ui.grid.querySelectorAll('.inv-slot:not(.inv-empty) canvas');
        canvases.forEach(function (cv, i) {
          if (list[i]) drawIcon(cv.getContext('2d'), 48, list[i].id, ts, world);
        });
        var dcv = ui.detail.querySelector('canvas');
        if (dcv && selectedId) drawIcon(dcv.getContext('2d'), 96, selectedId, ts, world);
      }
      refreshHandle = requestAnimationFrame(tick);
    }
    refreshHandle = requestAnimationFrame(tick);
  }
  function stopGlow() {
    if (refreshHandle) { cancelAnimationFrame(refreshHandle); refreshHandle = null; }
  }

  /* ================= 开关 ================= */

  function isOpen() { return !!(ui && ui.root.classList.contains('inv-on')); }

  function open() {
    if (!HAS_DOM) return;
    buildUI();
    if (isOpen()) return;
    ui.root.classList.add('inv-on');
    renderGrid();
    startGlow();
    if (typeof opts.onOpen === 'function') { try { opts.onOpen(); } catch (e) {} }
  }
  function close() {
    if (!isOpen()) return;
    ui.root.classList.remove('inv-on');
    stopGlow();
    if (document.activeElement && ui.root.contains(document.activeElement)) document.activeElement.blur();
    if (typeof opts.onClose === 'function') { try { opts.onClose(); } catch (e) {} }
  }

  /* ================= I 键 (与 leaderboard.js 的 L 键同套路: capture 阶段, 不与引擎打架) ================= */

  function engineBusy() {
    var els = document.querySelectorAll('.panel,.overlay,dialog[open]');
    for (var i = 0; i < els.length; i++) {
      if (els[i].closest && (els[i].closest('#inv-root') || els[i].closest('#lb-root'))) continue;
      var st = getComputedStyle(els[i]);
      if (st.display !== 'none' && st.visibility !== 'hidden') return true;
    }
    return false;
  }

  function onKeydown(e) {
    var k = (e.key || '').toLowerCase();
    var t = e.target, tag = t && t.tagName;
    var typing = tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable);

    if (isOpen()) {
      if (k === 'escape' || (k === 'i' && !typing)) {
        e.preventDefault(); e.stopPropagation(); close(); return;
      }
      if (ui && ui.root.contains(t)) e.stopPropagation();
      return;
    }
    if (!opts.hotkey) return;
    if (k !== 'i' || e.repeat || typing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (engineBusy()) return;
    e.preventDefault(); e.stopPropagation();
    open();
  }

  /* ================= 入包动画 + toast ================= */

  var activeNotifies = 0;
  function notify(id, name) {
    var nid = normId(id);
    if (!nid) return;
    recordAcquire(nid, name || null);
    if (isOpen()) renderGrid();
    if (!HAS_DOM) return;

    var lore = loreOf(nid);
    var box = h('<div class="inv-notify"></div>');
    var cv = document.createElement('canvas'); cv.width = 32; cv.height = 32;
    box.appendChild(cv);
    var label = h('<div class="inv-notify-text"></div>');
    label.innerHTML = '获得: <b>' + (String(name || T(lore.name)).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    })) + '</b>';
    box.appendChild(label);
    box.style.bottom = (18 + activeNotifies * 46) + 'px';
    document.body.appendChild(box);
    drawIcon(cv.getContext('2d'), 32, nid, performance.now(), currentWorld());
    activeNotifies++;

    requestAnimationFrame(function () { box.classList.add('inv-show'); });
    setTimeout(function () {
      box.classList.remove('inv-show'); box.classList.add('inv-hide');
      setTimeout(function () { box.remove(); activeNotifies = Math.max(0, activeNotifies - 1); }, 320);
    }, 2000);
  }

  /* ================= init ================= */

  var inited = false;
  function init(o) {
    o = o || {};
    if (typeof o.getItems === 'function') opts.getItems = o.getItems;
    if (Array.isArray(o.items)) opts.items = o.items;
    if (o.api) opts.api = o.api;
    if ('hotkey' in o) opts.hotkey = !!o.hotkey;
    if (o.onOpen) opts.onOpen = o.onOpen;
    if (o.onClose) opts.onClose = o.onClose;
    if (inited) return;
    inited = true;
    if (HAS_DOM) {
      window.addEventListener('keydown', onKeydown, true);
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildUI, { once: true });
      } else buildUI();
    }
  }

  /* ================= 导出 ================= */

  G.INVENTORY = {
    init: init,
    open: open,
    close: close,
    isOpen: isOpen,
    notify: notify,
    _test: {
      normId: normId,
      loreOf: loreOf,
      fallbackLore: fallbackLore,
      priorityIndex: priorityIndex,
      sortItems: sortItems,
      registryProblems: registryProblems,
      recordAcquire: recordAcquire,
      guessItemsFromSave: guessItemsFromSave,
      displayName: displayName,
      displayDesc: displayDesc,
      ITEM_LORE: ITEM_LORE,
      FIXED_PRIORITY: FIXED_PRIORITY,
      VALID_TYPES: VALID_TYPES,
      resetAcquireLog: function () { acquireLog = {}; seqCounter = 0; }
    }
  };
})();
