/* ============================================================
   social.js — BIT://ESCAPE 异步社交三件套 (独立自包含)
   ------------------------------------------------------------
   同模式标杆: leaderboard.js / feedback.js —— 独立文件 / DOM 自建自管
   (类名前缀 so-) / Firebase REST 直连无 SDK / 身份复用 leaderboard 登录态,
   否则回退本地匿名 id / 双语 window.T||fallback / fail-silent 网络容错。

   后端: 复用 leaderboard.js 的 Firebase Realtime Database (测试模式, 无真实鉴权)
     DB 根: https://cs-vocab-default-rtdb.asia-southeast1.firebasedatabase.app
     命名空间 /bitescape/ 下新增三张表(不碰 /leaderboard, 不碰
     /bitescape/users|board|feedback|ideas|wall):

     1) 留言牌(黑魂式短语拼接, 只能从预设词库拼句, 防审核):
        /bitescape/notes/{world}/{autoKey}   autoKey = Firebase push id
          = { tx, ty,                  // 放置的地图格坐标
              phrase:[actId,objId,tailId],   // 固定三段式, 见下 WORD_BANKS/TEMPLATE_ORDER
              name,                    // 展示名(不是 key)
              nameKey,                 // ★ 比给定示例结构多的一个字段, 见下 §设计取舍
              ts,
              plus:{ [likerNameKey]:1 }  // "+1", 集合语义天然幂等
            }

     2) 班级共同目标(老师在 teacher_dashboard 设置, 本模块只读+累加):
        /bitescape/goal/current
          = { id, title:{en,zh}, target, progress, reward:{en,zh}, until_ts }

     3) 接力门(死亡搁浅式"前人栽树"签名):
        /bitescape/relay/{doorId}
          = { slots:{ [nameKey]:{name,ts} }, need }   // need 缺省时客户端按 2 处理

   ★ 安全边界与 leaderboard.js/feedback.js 相同: 测试模式数据库无真实鉴权,
     以下数据都不敏感, 没有再加验证。留言短语只能从预设词库拼句(见 WORD_BANKS),
     整个模块没有任何自由文本输入框——这是"防审核"的硬约束, 不是疏漏。

   ★ 设计取舍(供 review 时对齐预期):
     - notes 条目比题面给的示例结构多了一个 `nameKey` 字段。示例结构里没有它,
       但没有它就无法判断"这是不是我自己的留言"(不能自己给自己 +1)、也无法做
       "谁读过谁的留言"的幂等去重。leaderboard/feedback 能省这个字段是因为它们
       的 key 本身就是 nameKey(`/board/{nameKey}`、`/feedback/{qid}/{nameKey}`);
       notes 的 key 是 push id(一个人可以留多条), 所以必须把作者身份另存一份。
     - goal.contribute(n) 不是真事务: RTDB REST 没有 SDK 的 transaction() 语义,
       要做到真原子只能上 Firebase SDK(增加一整套依赖 + 与"REST 直连无 SDK"的
       项目基调冲突)。这里用"读→算→PATCH 写回"的乐观并发, 多人同时贡献时
       存在极小概率互相覆盖(丢几点进度), 对课堂场景(全班并发写同一 goal 的
       概率本身就低、且丢的是"进度"这种可再生资源, 不是钱包余额)可接受。
       为了进一步降低碰撞概率, 本模块把同一个浏览器里 1.5 秒内的多次
       contribute() 调用在本地先合并成一次网络请求(见 flushContribute)。
     - relay 的 `need` 字段本模块从不写, 只读(缺省按 2)。这样老师/整合 agent
       如果想给某扇门自定义 need(比如 3 人门), 直接在 Firebase 里手写这一个
       字段, 不用担心被 signRelay() 的默认值覆盖。

   对外接口 (window.SOCIAL):
     init(opts?)                         — opts: {getPlayer?, api?}
     leaveNote(x, y, world)              — 打开短语拼接器(自建 UI, 挂 body)
     notesFor(world)                     — Promise<Array<note展示行>>, 30s 缓存
     notesSync(world)                    — 同步读最近一次 notesFor 的缓存(渲染循环用)
     readNote(world, key)                — 弹小卡片(留言者+句子+👍), 顺手 +1(幂等, 不能点自己)
     goalStatus()                        — Promise<目标状态>
     goalStatusSync()                    — 同步读最近一次 goalStatus 的缓存
     contribute(n)                       — 累加班级目标进度(本地 1.5s 合并批量写)
     claimGoalCelebration()              — 一次性"我看过这次达标庆祝了吗"判定(达标 toast 用)
     signRelay(doorId)                   — 在接力门签名
     relayStatus(doorId)                 — Promise<{signed,need,open}>
     _test                               — 纯函数出口, 供单测
   详细接线说明见 social_integration.md
   ============================================================ */
(function () {
  'use strict';

  var HAS_DOM = (typeof document !== 'undefined') && (typeof window !== 'undefined');
  var G = (typeof window !== 'undefined') ? window : globalThis;

  var DB = 'https://cs-vocab-default-rtdb.asia-southeast1.firebasedatabase.app';
  var NS = '/bitescape';

  var LB_LS_KEY      = 'bitescape_lb_auth_v1';        // 只读: leaderboard.js 的登录态, 见其 loadAuth()
  var ANON_LS_KEY     = 'bitescape_social_anon_v1';    // 本模块自己的匿名身份持久化
  var NOTE_QUOTA_LS   = 'bitescape_social_note_quota_v1'; // {nameKey::yyyy-mm-dd: count} 每日限额(客户端)
  var NOTE_LIKED_LS   = 'bitescape_social_liked_v1';   // {world::noteKey::likerKey: 1} 本地 +1 去重缓存
  var GOAL_SEEN_LS    = 'bitescape_social_goal_seen_v1'; // {goalId: 1} 达标庆祝只弹一次

  var NOTES_CACHE_MS  = 30000;   // notesFor 缓存
  var GOAL_CACHE_MS   = 10000;   // goalStatus 缓存(HUD 高频轮询也不怕)
  var RELAY_CACHE_MS  = 8000;
  var NOTE_DAILY_LIMIT = 5;
  var CONTRIB_BATCH_MS = 1500;   // 本地合并连续 contribute() 调用的窗口
  var CONTRIB_RETRY_MS = 20000;
  var RELAY_DEFAULT_NEED = 2;
  var CARD_IDLE_MS = 6500;       // 留言卡片自动淡出

  /* ================= 双语 fallback (与 leaderboard.js/feedback.js 同一模式) ================= */
  var T = G.T || function (s) { return typeof s === 'string' ? s : (s && s.en != null ? s.en : ''); };
  function tx(en, zh) { return T({ en: en, zh: zh }); }
  function currentLang() { try { return T({ en: 'en', zh: 'zh' }); } catch (e) { return 'en'; } }

  /* ================= 纯函数区 (挂 _test) ================= */

  function num(v) { v = +v; return (isFinite(v) && v > 0) ? Math.floor(v) : 0; }

  // nameKey 规则与 leaderboard.js/feedback.js 完全一致(必须一致才能是"同一个玩家")
  function nameKeyOf(name) {
    return String(name == null ? '' : name).trim()
      .replace(/[.#$\[\]\/]/g, '_').slice(0, 40);
  }

  function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------- 留言词库: 只能从这里拼句, 没有任何自由文本框(防审核) ----------
     三段式固定顺序 [act, obj, tail]。en/zh 各自独立写作(不是逐词翻译),
     只要求"同一个 id 在两种语言里语义槽位一致", 拼出来的句子分别在各自语言里
     读着顺, 不追求逐字对应。每类 ~14 词, 两语各 ~42 词, 满足"各~40词"。 */
  var WORD_BANKS = {
    act: [
      { id: 'act_try',       en: 'Try',              zh: '试试' },
      { id: 'act_careful',   en: 'Careful with',      zh: '小心' },
      { id: 'act_praise',    en: 'Praise',            zh: '赞美' },
      { id: 'act_trust',     en: 'Trust',             zh: '相信' },
      { id: 'act_doubt',     en: 'Doubt',             zh: '怀疑' },
      { id: 'act_avoid',     en: 'Avoid',             zh: '绕开' },
      { id: 'act_remember',  en: 'Remember',          zh: '记得' },
      { id: 'act_donttrust', en: "Don't trust",       zh: '别信' },
      { id: 'act_lookfor',   en: 'Look for',          zh: '找找' },
      { id: 'act_wait',      en: 'Wait near',         zh: '等等' },
      { id: 'act_warn',      en: 'Warn about',        zh: '提防' },
      { id: 'act_help',      en: 'Help',              zh: '帮帮' },
      { id: 'act_listen',    en: 'Listen to',         zh: '听听' },
      { id: 'act_hurry',     en: 'Hurry past',        zh: '快步走过' }
    ],
    obj: [
      { id: 'obj_puzzle',    en: 'this puzzle',       zh: '这个谜题' },
      { id: 'obj_collector', en: 'the Collector',     zh: '回收者' },
      { id: 'obj_door',      en: 'this door',         zh: '这扇门' },
      { id: 'obj_wall',      en: 'this wall',         zh: '这堵墙' },
      { id: 'obj_binary',    en: 'the binary gate',   zh: '二进制门' },
      { id: 'obj_terminal',  en: 'the terminal',      zh: '终端' },
      { id: 'obj_ladder',    en: 'this ladder',       zh: '这架梯子' },
      { id: 'obj_recursion', en: 'the recursion',     zh: '这段递归' },
      { id: 'obj_loop',      en: 'this loop',         zh: '这个循环' },
      { id: 'obj_malloc',    en: "Granny malloc's stall", zh: 'malloc婆婆的摊子' },
      { id: 'obj_sentinel',  en: 'the Old Sentinel',  zh: '老哨兵' },
      { id: 'obj_echo',      en: 'Echo',              zh: '回声' },
      { id: 'obj_pointer',   en: 'this pointer',      zh: '这个指针' },
      { id: 'obj_npc',       en: 'this NPC',          zh: '这位角色' }
    ],
    tail: [
      { id: 'tail_nearby',     en: 'nearby',              zh: '在这附近' },
      { id: 'tail_ahead',      en: 'just ahead',          zh: '在前方' },
      { id: 'tail_behind',     en: 'behind you',          zh: '在你身后' },
      { id: 'tail_left',       en: 'to the left',         zh: '在左边' },
      { id: 'tail_right',      en: 'to the right',        zh: '在右边' },
      { id: 'tail_brilliant',  en: "it's brilliant",      zh: '太妙了' },
      { id: 'tail_trap',       en: "it's a trap",         zh: '是个陷阱' },
      { id: 'tail_worth',      en: "it's worth it",       zh: '值得一试' },
      { id: 'tail_nowaste',    en: "don't waste time",    zh: '别浪费时间' },
      { id: 'tail_fake',       en: "it's fake",           zh: '是假的' },
      { id: 'tail_real',       en: "it's the real deal",  zh: '是真的' },
      { id: 'tail_corner',     en: 'just around the corner', zh: '就在拐角' },
      { id: 'tail_trustme',    en: 'trust me on this',    zh: '相信我' },
      { id: 'tail_luck',       en: 'good luck',           zh: '祝你好运' }
    ]
  };
  var TEMPLATE_ORDER = ['act', 'obj', 'tail'];

  function bankHas(cat, id) {
    var bank = WORD_BANKS[cat];
    if (!bank) return false;
    for (var i = 0; i < bank.length; i++) if (bank[i].id === id) return true;
    return false;
  }
  // 合法性: 必须恰好 3 个 id, 且按 [act,obj,tail] 顺序各属于对应词库(防止拼进自由文本)
  function isLegalPhrase(ids) {
    if (!Array.isArray(ids) || ids.length !== TEMPLATE_ORDER.length) return false;
    for (var i = 0; i < TEMPLATE_ORDER.length; i++) {
      if (!bankHas(TEMPLATE_ORDER[i], ids[i])) return false;
    }
    return true;
  }
  function wordText(cat, id, lang) {
    var bank = WORD_BANKS[cat] || [];
    for (var i = 0; i < bank.length; i++) {
      if (bank[i].id === id) return lang === 'zh' ? bank[i].zh : bank[i].en;
    }
    return '';
  }
  // 组句: zh 直接三段拼接(词库本身按"可直接拼接成通顺短句"设计); en 用破折号断句更自然
  function phraseText(ids, lang) {
    if (!isLegalPhrase(ids)) return '';
    var act = wordText('act', ids[0], lang), obj = wordText('obj', ids[1], lang), tail = wordText('tail', ids[2], lang);
    if (lang === 'zh') return act + obj + tail;
    return act + ' ' + obj + ' — ' + tail + '.';
  }
  function phraseTextBoth(ids) { return { en: phraseText(ids, 'en'), zh: phraseText(ids, 'zh') }; }

  /* ---------- 每日限额(纯函数, map 由调用方从 localStorage 读入; 与 feedback.js 的点子限流同套路) ---------- */
  function dateStrOf(ts) {
    var d = new Date(ts || Date.now());
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function quotaMapKey(nameKey, ds) { return nameKey + '::' + ds; }
  function quotaUsed(map, nameKey, ds) { return Number((map && map[quotaMapKey(nameKey, ds)]) || 0); }
  function quotaAllowed(map, nameKey, ds, limit) { return quotaUsed(map, nameKey, ds) < (limit == null ? NOTE_DAILY_LIMIT : limit); }
  function incQuota(map, nameKey, ds) {
    map = map || {};
    var k = quotaMapKey(nameKey, ds);
    map[k] = quotaUsed(map, nameKey, ds) + 1;
    return map;
  }

  /* ---------- +1 本地幂等缓存(纯函数) ---------- */
  function likeMapKey(world, noteKey, likerKey) { return world + '::' + noteKey + '::' + likerKey; }
  function hasLiked(map, world, noteKey, likerKey) { return !!(map && map[likeMapKey(world, noteKey, likerKey)]); }
  function markLiked(map, world, noteKey, likerKey) {
    map = map || {};
    map[likeMapKey(world, noteKey, likerKey)] = 1;
    return map;
  }
  function canLikeNote(note, myKey) { return !!(note && note.nameKey && myKey && note.nameKey !== myKey); }
  function plusCountOf(note) { return note && note.plus ? Object.keys(note.plus).length : 0; }

  /* ---------- 接力门纯函数 ---------- */
  function relaySlotsToNames(slots) {
    return Object.keys(slots || {}).map(function (k) { return (slots[k] && slots[k].name) || k; }).filter(Boolean);
  }
  function relayOpenCalc(signedCount, need) { return signedCount >= (num(need) || RELAY_DEFAULT_NEED); }

  /* ---------- 共同目标纯函数 ---------- */
  function goalPct(progress, target) {
    target = Number(target) || 0;
    if (!target) return 0;
    return Math.max(0, Math.min(100, Math.round((Number(progress || 0) / target) * 100)));
  }
  function goalComplete(progress, target) {
    var t = Number(target) || 0;
    return t > 0 && Number(progress || 0) >= t;
  }
  function nextProgress(current, n) {
    return Math.max(0, Math.floor(Number(current) || 0) + Math.floor(Number(n) || 0));
  }

  /* ================= 身份解析(与 feedback.js 完全同一套逻辑, 复制而非依赖以保持独立自包含) ================= */
  function parseLbAuth(raw) {
    try {
      var a = JSON.parse(raw || 'null');
      if (a && a.name) {
        var k = nameKeyOf(a.name);
        if (k) return { name: String(a.name).slice(0, 16), nameKey: k };
      }
    } catch (e) { /* 存档坏了当没登录 */ }
    return null;
  }
  function makeAnonId(randFn, tsFn) {
    var r = (randFn || Math.random)();
    var t = (tsFn ? tsFn() : Date.now()).toString(36);
    var rnd = Math.floor(r * 1e9).toString(36);
    return 'anon_' + t + rnd;
  }
  function parseAnon(raw) {
    try { var a = JSON.parse(raw || 'null'); if (a && a.id) return a; } catch (e) {}
    return null;
  }

  /* ================= localStorage 小工具 ================= */
  function lsGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function lsSet(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }
  function lsGetJson(key, dflt) { try { var v = JSON.parse(localStorage.getItem(key) || 'null'); return v || dflt; } catch (e) { return dflt; } }
  function lsSetJson(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  /* ================= 网络层 (fail-silent + console.warn) ================= */
  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
      return r.json();
    });
  }
  function putJson(url, data) {
    return fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url); return r.json(); });
  }
  function postJson(url, data) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url); return r.json(); }); // {name:<pushId>}
  }
  function patchJson(url, data) {
    return fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url); return r.json(); });
  }

  /* ================= 身份解析(运行时) ================= */
  var cfg = { getPlayer: null, api: null };

  function getPlayer() {
    if (cfg.getPlayer) {
      try {
        var p = cfg.getPlayer();
        if (p && p.nameKey) return { name: p.name || p.nameKey, nameKey: nameKeyOf(p.nameKey) || String(p.nameKey) };
        if (p && p.name) return { name: p.name, nameKey: nameKeyOf(p.name) };
      } catch (e) { console.warn('[SOCIAL] getPlayer 回调抛异常, 回退本地身份', e); }
    }
    var lb = parseLbAuth(lsGet(LB_LS_KEY));
    if (lb) return lb;
    var anon = parseAnon(lsGet(ANON_LS_KEY));
    if (!anon) {
      anon = { id: makeAnonId(), created: Date.now() };
      lsSet(ANON_LS_KEY, JSON.stringify(anon));
    }
    return { name: anon.id, nameKey: anon.id };
  }

  function playSfx(name) {
    try { if (cfg.api && cfg.api.sfx && typeof cfg.api.sfx[name] === 'function') cfg.api.sfx[name](); } catch (e) {}
  }
  function toastMsg(msg) {
    try { if (cfg.api && typeof cfg.api.toast === 'function') cfg.api.toast(msg); } catch (e) {}
  }

  /* ================= 样式 (so- 前缀) ================================
     颜色一律从 theme.css 的 CSS 变量取(与全局皮肤联动, 含未来"明亮化"改版);
     变量不存在时(模块独立运行/theme.css 未挂载)才落到中性暖色兜底 ——
     兜底刻意不用荧光绿, 因为美术方向正在往明亮系走, 荧光绿是旧皮肤专属色。
     ================================================================ */
  var CSS = [
    /* ---- 拼接器(全屏轻遮罩居中面板, 同 feedback.js 信箱布局) ---- */
    '#so-note-root{position:fixed;inset:0;z-index:54;display:none;align-items:center;justify-content:center;',
    '  background:rgba(20,14,8,.45);font-family:var(--font,"Courier New",monospace)}',
    '#so-note-root.so-on{display:flex}',
    '.so-note-panel{width:min(460px,92vw);max-height:88vh;overflow-y:auto;',
    '  background:var(--panel-bg,#fbf1e4);border:1px solid var(--dim,#d8c6a8);border-radius:6px;',
    '  color:var(--ink,#3d2f20);font-size:13px;line-height:1.6;',
    '  box-shadow:0 0 30px var(--glow,rgba(201,121,58,.18));animation:so-in .18s ease-out}',
    '@keyframes so-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}',
    '.so-note-head{padding:12px 16px;border-bottom:1px solid var(--dim,#d8c6a8);',
    '  display:flex;justify-content:space-between;gap:8px;align-items:flex-start}',
    '.so-note-title{color:var(--hi,#c9793a);letter-spacing:1px;font-size:12.5px;flex:1}',
    '.so-close{background:none;border:1px solid var(--dim,#d8c6a8);color:var(--hi,#c9793a);',
    '  border-radius:2px;cursor:pointer;font-size:11px;line-height:1;padding:3px 7px;flex-shrink:0}',
    '.so-close:hover{background:var(--hi-08,rgba(201,121,58,.08))}',
    '.so-note-body{padding:12px 16px}',
    '.so-row-label{color:var(--ink-dim,#8a7660);font-size:10.5px;letter-spacing:1px;margin:9px 0 5px;text-transform:uppercase}',
    '.so-row-label:first-child{margin-top:0}',
    '.so-chips{display:flex;flex-wrap:wrap;gap:6px}',
    '.so-chip{background:transparent;color:var(--ink,#3d2f20);border:1px solid var(--dim,#d8c6a8);',
    '  border-radius:12px;padding:5px 11px;font-size:12px;cursor:pointer;font-family:inherit}',
    '.so-chip:hover{border-color:var(--hi,#c9793a);color:var(--hi,#c9793a)}',
    '.so-chip.so-cur{background:var(--hi,#c9793a);border-color:var(--hi,#c9793a);color:var(--panel-bg,#fbf1e4);font-weight:600}',
    '.so-preview{margin-top:12px;padding:10px 12px;border:1px dashed var(--dim,#d8c6a8);border-radius:4px;',
    '  min-height:20px;color:var(--hi2,#e3b287);background:var(--hi-08,rgba(201,121,58,.06))}',
    '.so-preview.so-empty{color:var(--ink-dim,#8a7660);font-style:italic}',
    '.so-note-foot{display:flex;align-items:center;justify-content:space-between;margin-top:12px;gap:8px}',
    '.so-quota{color:var(--ink-dim,#8a7660);font-size:11px}',
    '.so-btn{background:var(--hi,#c9793a);color:var(--panel-bg,#fbf1e4);border:1px solid var(--hi,#c9793a);',
    '  padding:7px 18px;font-family:inherit;font-size:12.5px;cursor:pointer;border-radius:3px;font-weight:600}',
    '.so-btn:hover{box-shadow:0 0 10px var(--glow,rgba(201,121,58,.25))}',
    '.so-btn:disabled{opacity:.45;cursor:default;box-shadow:none}',
    '.so-msg{margin-top:8px;font-size:11.5px;min-height:16px}',
    '.so-msg.so-ok{color:var(--hi,#c9793a)}',
    '.so-msg.so-err{color:var(--acc2,#b5563f)}',
    /* ---- 留言读卡(右下角非阻断小卡片, 同 feedback.js fb-card 位置语言) ---- */
    '#so-card-root{position:fixed;right:16px;bottom:16px;z-index:52;width:min(280px,88vw);',
    '  font-family:var(--font,"Courier New",monospace);pointer-events:none}',
    '#so-card-root>*{pointer-events:auto}',
    '.so-card{background:var(--panel-bg,#fbf1e4);border:1px solid var(--dim,#d8c6a8);border-radius:6px;',
    '  color:var(--ink,#3d2f20);font-size:12.5px;line-height:1.55;padding:10px 12px;',
    '  box-shadow:0 6px 22px rgba(0,0,0,.18),0 0 18px var(--glow,rgba(201,121,58,.14));',
    '  animation:so-in .18s ease-out;overflow:hidden}',
    '.so-card.so-fading{animation:so-fade .5s ease-in forwards}',
    '@keyframes so-fade{to{opacity:0;transform:translateY(8px)}}',
    '.so-card-name{color:var(--hi,#c9793a);font-weight:600;font-size:12px}',
    '.so-card-text{color:var(--ink,#3d2f20);margin-top:4px;word-break:break-word}',
    '.so-card-foot{display:flex;justify-content:space-between;align-items:center;margin-top:7px;',
    '  font-size:10.5px;color:var(--ink-dim,#8a7660)}',
    '.so-card-plus{color:var(--hi,#c9793a)}'
  ].join('\n');

  function ensureStyle() {
    if (!HAS_DOM || document.getElementById('so-style')) return;
    var style = document.createElement('style');
    style.id = 'so-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  function h(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  /* ================= 1. 留言牌(短语拼接) ================= */

  var notesCache = {}; // world -> {ts, rows}

  function noteRowFromRaw(key, raw) {
    return {
      key: key,
      tx: num(raw.tx), ty: num(raw.ty),
      phrase: Array.isArray(raw.phrase) ? raw.phrase.slice(0, 3) : [],
      name: raw.name || '???',
      nameKey: raw.nameKey || '',
      ts: raw.ts || 0,
      plus: raw.plus || {},
      plusCount: plusCountOf(raw)
    };
  }

  // 30s 缓存, 供引擎渲染循环批量取用(地上的发光小牌子)
  function notesFor(world) {
    world = (world === 'a2') ? 'a2' : 'as';
    var c = notesCache[world];
    if (c && (Date.now() - c.ts) < NOTES_CACHE_MS) return Promise.resolve(c.rows);
    return fetchJson(DB + NS + '/notes/' + encodeURIComponent(world) + '.json')
      .then(function (obj) {
        var rows = [];
        if (obj) Object.keys(obj).forEach(function (k) { rows.push(noteRowFromRaw(k, obj[k])); });
        notesCache[world] = { ts: Date.now(), rows: rows };
        return rows;
      })
      .catch(function (e) {
        console.warn('[SOCIAL] 拉取留言牌失败', e);
        return (notesCache[world] && notesCache[world].rows) || [];
      });
  }
  // 同步读最近一次 notesFor 的缓存, 给渲染循环用(不想在 60fps 里到处发 Promise)
  function notesSync(world) {
    world = (world === 'a2') ? 'a2' : 'as';
    var c = notesCache[world];
    return (c && c.rows) || [];
  }

  var noteRoot = null, noteCurAct = null, noteCurObj = null, noteCurTail = null, notePlaceCtx = null;

  function ensureNoteRoot() {
    if (noteRoot) return noteRoot;
    ensureStyle();
    noteRoot = h(
      '<div id="so-note-root">' +
      ' <div class="so-note-panel">' +
      '  <div class="so-note-head">' +
      '   <div class="so-note-title">' + esc(tx('LEAVE A MARK — build a phrase from the terminal\'s vocabulary',
        '留下痕迹——从终端词库里拼一句话')) + '</div>' +
      '   <button class="so-close" data-act="close">✕</button>' +
      '  </div>' +
      '  <div class="so-note-body"></div>' +
      ' </div>' +
      '</div>');
    document.body.appendChild(noteRoot);
    noteRoot.addEventListener('click', function (e) {
      if (e.target === noteRoot) closeNoteComposer();
      if (e.target.closest('[data-act="close"]')) closeNoteComposer();
    });
    return noteRoot;
  }

  function chipsHtml(cat, curId) {
    return '<div class="so-chips">' + WORD_BANKS[cat].map(function (w) {
      var label = currentLang() === 'zh' ? w.zh : w.en;
      return '<button class="so-chip' + (w.id === curId ? ' so-cur' : '') + '" data-cat="' + cat + '" data-id="' + w.id + '">' +
        esc(label) + '</button>';
    }).join('') + '</div>';
  }

  function renderNoteBody() {
    var body = noteRoot.querySelector('.so-note-body');
    var player = getPlayer();
    var ds = dateStrOf(Date.now());
    var quotaMap = lsGetJson(NOTE_QUOTA_LS, {});
    var used = quotaUsed(quotaMap, player.nameKey, ds);
    var remaining = Math.max(0, NOTE_DAILY_LIMIT - used);
    var ids = [noteCurAct, noteCurObj, noteCurTail];
    var legal = isLegalPhrase(ids);
    var preview = legal ? phraseText(ids, currentLang()) : '';

    body.innerHTML =
      '<div class="so-row-label">' + esc(tx('1 · attitude', '1 · 态度')) + '</div>' + chipsHtml('act', noteCurAct) +
      '<div class="so-row-label">' + esc(tx('2 · subject', '2 · 对象')) + '</div>' + chipsHtml('obj', noteCurObj) +
      '<div class="so-row-label">' + esc(tx('3 · note', '3 · 附言')) + '</div>' + chipsHtml('tail', noteCurTail) +
      '<div class="so-preview' + (legal ? '' : ' so-empty') + '">' +
      esc(legal ? preview : tx('pick one word from each row…', '每行挑一个词…')) + '</div>' +
      '<div class="so-note-foot">' +
      ' <span class="so-quota">' + esc(tx('today', '今日')) + ' ' + remaining + '/' + NOTE_DAILY_LIMIT + '</span>' +
      ' <button class="so-btn" data-act="submit"' + ((!legal || remaining <= 0) ? ' disabled' : '') + '>' +
      esc(tx('PLANT ▶', '插下 ▶')) + '</button>' +
      '</div>' +
      '<div class="so-msg"></div>';

    body.querySelectorAll('.so-chip').forEach(function (b) {
      b.addEventListener('click', function () {
        var cat = b.dataset.cat, id = b.dataset.id;
        if (cat === 'act') noteCurAct = (noteCurAct === id) ? null : id;
        else if (cat === 'obj') noteCurObj = (noteCurObj === id) ? null : id;
        else noteCurTail = (noteCurTail === id) ? null : id;
        renderNoteBody();
      });
    });
    var submitBtn = body.querySelector('[data-act="submit"]');
    var msgEl = body.querySelector('.so-msg');
    if (submitBtn) submitBtn.addEventListener('click', function () { submitNote(submitBtn, msgEl); });
  }

  function submitNote(btn, msgEl) {
    var ids = [noteCurAct, noteCurObj, noteCurTail];
    if (!isLegalPhrase(ids) || !notePlaceCtx) return;
    var player = getPlayer();
    var ds = dateStrOf(Date.now());
    var qMap = lsGetJson(NOTE_QUOTA_LS, {});
    if (!quotaAllowed(qMap, player.nameKey, ds, NOTE_DAILY_LIMIT)) {
      msgEl.className = 'so-msg so-err';
      msgEl.textContent = tx('daily quota used up — come back tomorrow.', '今日额度已用完，明天再来。');
      return;
    }
    btn.disabled = true;
    var entry = {
      tx: num(notePlaceCtx.x), ty: num(notePlaceCtx.y),
      phrase: ids, name: player.name, nameKey: player.nameKey, ts: Date.now()
    };
    postJson(DB + NS + '/notes/' + encodeURIComponent(notePlaceCtx.world) + '.json', entry)
      .then(function () {
        incQuota(qMap, player.nameKey, ds); lsSetJson(NOTE_QUOTA_LS, qMap);
        notesCache[notePlaceCtx.world] = null; // 让下次 notesFor 强制刷新, 立刻能看到自己插的牌
        msgEl.className = 'so-msg so-ok';
        msgEl.textContent = tx('planted. someone will find it.', '插好了。总会有人看到。');
        playSfx('pickup'); toastMsg(tx('note left', '留言已插下'));
        setTimeout(closeNoteComposer, 700);
      })
      .catch(function (e) {
        console.warn('[SOCIAL] 留言提交失败', e);
        btn.disabled = false;
        msgEl.className = 'so-msg so-err';
        msgEl.textContent = tx('network hiccup — try again.', '网络不好，稍后再试。');
      });
  }

  function leaveNote(x, y, world) {
    if (!HAS_DOM) return;
    notePlaceCtx = { x: x, y: y, world: (world === 'a2') ? 'a2' : 'as' };
    noteCurAct = null; noteCurObj = null; noteCurTail = null;
    ensureNoteRoot();
    renderNoteBody();
    noteRoot.classList.add('so-on');
  }
  function closeNoteComposer() { if (noteRoot) noteRoot.classList.remove('so-on'); }

  /* ---------- 读卡: E 读牌 → 弹小卡片 + 幂等 +1 ---------- */

  var cardRoot = null, cardTimer = null;
  function ensureCardRoot() {
    if (!HAS_DOM) return null;
    var r = document.getElementById('so-card-root');
    if (!r) { r = document.createElement('div'); r.id = 'so-card-root'; document.body.appendChild(r); }
    return r;
  }

  function showNoteCard(note) {
    ensureStyle();
    var root = ensureCardRoot();
    if (!root) return;
    root.innerHTML = '';
    var text = phraseText(note.phrase, currentLang());
    var card = h(
      '<div class="so-card">' +
      ' <div class="so-card-name">' + esc(note.name || '???') + '</div>' +
      ' <div class="so-card-text">' + esc(text) + '</div>' +
      ' <div class="so-card-foot"><span>[' + esc(note.tx) + ',' + esc(note.ty) + ']</span>' +
      ' <span class="so-card-plus">👍 ' + num(note.plusCount) + '</span></div>' +
      '</div>');
    root.appendChild(card);
    if (cardTimer) clearTimeout(cardTimer);
    cardTimer = setTimeout(function () {
      card.classList.add('so-fading');
      setTimeout(function () { if (card.parentNode) card.parentNode.removeChild(card); }, 520);
    }, CARD_IDLE_MS);
  }

  // world+key 找单条留言(优先缓存, 缓存没有才单独 GET); 读到之后弹卡片 + (若非自己且未点过) 幂等 +1
  function readNote(world, key) {
    if (!HAS_DOM) return Promise.resolve(null);
    world = (world === 'a2') ? 'a2' : 'as';
    var cached = (notesCache[world] && notesCache[world].rows || []).filter(function (r) { return r.key === key; })[0];
    var p = cached ? Promise.resolve(cached) :
      fetchJson(DB + NS + '/notes/' + encodeURIComponent(world) + '/' + encodeURIComponent(key) + '.json')
        .then(function (raw) { return raw ? noteRowFromRaw(key, raw) : null; })
        .catch(function (e) { console.warn('[SOCIAL] 读留言失败', e); return null; });

    return p.then(function (note) {
      if (!note) return null;
      showNoteCard(note);
      var me = getPlayer();
      if (canLikeNote(note, me.nameKey)) {
        var likedMap = lsGetJson(NOTE_LIKED_LS, {});
        if (!hasLiked(likedMap, world, key, me.nameKey)) {
          putJson(DB + NS + '/notes/' + encodeURIComponent(world) + '/' + encodeURIComponent(key) + '/plus/' + encodeURIComponent(me.nameKey) + '.json', 1)
            .then(function () {
              markLiked(likedMap, world, key, me.nameKey); lsSetJson(NOTE_LIKED_LS, likedMap);
              note.plus[me.nameKey] = 1; note.plusCount = plusCountOf(note);
              // 卡片可能已经渲染完了, 顺手把数字更新一下(卡片还在场的话)
              var plusEl = document.querySelector('#so-card-root .so-card-plus');
              if (plusEl) plusEl.textContent = '👍 ' + note.plusCount;
            })
            .catch(function (e) { console.warn('[SOCIAL] 留言 +1 失败(不重试)', e); });
        }
      }
      return note;
    });
  }

  /* ================= 2. 班级共同目标 ================= */

  var GOAL_URL = DB + NS + '/goal/current.json';
  var goalCache = null; // {ts, data}

  function goalStatus() {
    if (goalCache && (Date.now() - goalCache.ts) < GOAL_CACHE_MS) return Promise.resolve(goalCache.data);
    return fetchJson(GOAL_URL).then(function (g) {
      var data;
      if (!g || !g.id) data = { active: false };
      else {
        var target = num(g.target) || 0, progress = num(g.progress);
        data = {
          active: true, id: g.id, title: g.title || {}, target: target, progress: progress,
          reward: g.reward || {}, until_ts: num(g.until_ts),
          pct: goalPct(progress, target), complete: goalComplete(progress, target)
        };
      }
      goalCache = { ts: Date.now(), data: data };
      return data;
    }).catch(function (e) {
      console.warn('[SOCIAL] 拉取班级目标失败', e);
      return (goalCache && goalCache.data) || { active: false, offline: true };
    });
  }
  function goalStatusSync() { return (goalCache && goalCache.data) || { active: false }; }

  // 达标庆祝: 每个 goal.id 在本机只弹一次(不同学生各自本地判定, 符合"所有人登录见庆祝"的意图——
  // 登录/进游戏时调一次, 只要这台设备/浏览器还没见过这个 id 的达标就会拿到一次 true)
  function claimGoalCelebration() {
    return goalStatus().then(function (s) {
      if (!s.active || !s.complete) return null;
      var seen = lsGetJson(GOAL_SEEN_LS, {});
      if (seen[s.id]) return null;
      seen[s.id] = 1; lsSetJson(GOAL_SEEN_LS, seen);
      return s;
    });
  }

  var pendingContribute = 0, contribTimer = null;
  function contribute(n) {
    n = Math.max(1, Math.floor(Number(n) || 1));
    pendingContribute += n;
    if (!contribTimer) contribTimer = setTimeout(flushContribute, CONTRIB_BATCH_MS);
  }
  // 见文件头「设计取舍」: 读→算→PATCH 写回, 非真事务, 容忍并发误差
  function flushContribute() {
    contribTimer = null;
    var n = pendingContribute; pendingContribute = 0;
    if (!n) return;
    fetchJson(GOAL_URL).then(function (g) {
      var cur = num(g && g.progress);
      var np = nextProgress(cur, n);
      return patchJson(GOAL_URL, { progress: np });
    }).then(function () {
      goalCache = null; // 强制下次 goalStatus() 刷新
    }).catch(function (e) {
      console.warn('[SOCIAL] contribute 写入失败, 补回队列稍后重试', e);
      pendingContribute += n;
      if (!contribTimer) contribTimer = setTimeout(flushContribute, CONTRIB_RETRY_MS);
    });
  }

  /* ================= 3. 接力门 ================= */

  var relayCache = {}; // doorId -> {ts, data}

  function relayStatus(doorId) {
    doorId = String(doorId || '');
    if (!doorId) return Promise.resolve({ signed: [], need: RELAY_DEFAULT_NEED, open: false });
    var c = relayCache[doorId];
    if (c && (Date.now() - c.ts) < RELAY_CACHE_MS) return Promise.resolve(c.data);
    return fetchJson(DB + NS + '/relay/' + encodeURIComponent(doorId) + '.json').then(function (d) {
      d = d || {};
      var names = relaySlotsToNames(d.slots);
      var need = num(d.need) || RELAY_DEFAULT_NEED;
      var data = { signed: names, need: need, open: relayOpenCalc(names.length, need) };
      relayCache[doorId] = { ts: Date.now(), data: data };
      return data;
    }).catch(function (e) {
      console.warn('[SOCIAL] 拉取接力门状态失败', e);
      return (relayCache[doorId] && relayCache[doorId].data) || { signed: [], need: RELAY_DEFAULT_NEED, open: false, offline: true };
    });
  }

  function signRelay(doorId) {
    doorId = String(doorId || '');
    if (!doorId) return Promise.resolve(false);
    var player = getPlayer();
    if (!player || !player.nameKey) return Promise.resolve(false);
    return putJson(
      DB + NS + '/relay/' + encodeURIComponent(doorId) + '/slots/' + encodeURIComponent(player.nameKey) + '.json',
      { name: player.name, ts: Date.now() }
    ).then(function () {
      relayCache[doorId] = null; // 强制下次 relayStatus 刷新
      playSfx('quest'); toastMsg(tx('signed', '已签名'));
      return true;
    }).catch(function (e) {
      console.warn('[SOCIAL] 接力门签名失败', e);
      return false;
    });
  }

  /* ================= init ================= */
  var inited = false;
  function init(opts) {
    opts = opts || {};
    cfg.getPlayer = opts.getPlayer || null;
    cfg.api = opts.api || null;
    if (inited) return;
    inited = true;
    if (HAS_DOM) ensureStyle();
  }

  /* ================= 导出 ================= */
  G.SOCIAL = {
    init: init,
    leaveNote: leaveNote,
    notesFor: notesFor,
    notesSync: notesSync,
    readNote: readNote,
    goalStatus: goalStatus,
    goalStatusSync: goalStatusSync,
    contribute: contribute,
    claimGoalCelebration: claimGoalCelebration,
    signRelay: signRelay,
    relayStatus: relayStatus,
    _test: {
      num: num,
      nameKeyOf: nameKeyOf,
      WORD_BANKS: WORD_BANKS,
      TEMPLATE_ORDER: TEMPLATE_ORDER,
      bankHas: bankHas,
      isLegalPhrase: isLegalPhrase,
      wordText: wordText,
      phraseText: phraseText,
      phraseTextBoth: phraseTextBoth,
      dateStrOf: dateStrOf,
      quotaMapKey: quotaMapKey,
      quotaUsed: quotaUsed,
      quotaAllowed: quotaAllowed,
      incQuota: incQuota,
      likeMapKey: likeMapKey,
      hasLiked: hasLiked,
      markLiked: markLiked,
      canLikeNote: canLikeNote,
      plusCountOf: plusCountOf,
      relaySlotsToNames: relaySlotsToNames,
      relayOpenCalc: relayOpenCalc,
      goalPct: goalPct,
      goalComplete: goalComplete,
      nextProgress: nextProgress,
      parseLbAuth: parseLbAuth,
      parseAnon: parseAnon,
      makeAnonId: makeAnonId,
      noteRowFromRaw: noteRowFromRaw,
      // 测试专用: 强制清空模块内部缓存(notesFor/goalStatus/relayStatus 各自的 TTL 缓存),
      // 只给单测用来验证"状态变化后能读到最新值", 生产逻辑不应该依赖这个函数。
      clearCaches: function () { notesCache = {}; goalCache = null; relayCache = {}; }
    }
  };
})();
