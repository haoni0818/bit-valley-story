/* ============================================================
   feedback.js — BIT://ESCAPE 玩家反馈/点子投稿模块 (独立自包含)
   ------------------------------------------------------------
   同模式标杆: leaderboard.js —— 独立文件 / REST 直连 Firebase(无 SDK) /
   DOM 自建自管(类名前缀 fb-) / 双语 window.T||fallback。

   后端: 复用 leaderboard.js 的 Firebase Realtime Database
     DB 根: https://cs-vocab-default-rtdb.asia-southeast1.firebasedatabase.app
     命名空间 /bitescape/ 下新增三张表(不碰 /leaderboard, 不碰 /bitescape/users|board):
       /bitescape/feedback/{questId}/{nameKey} =
         { stars(1-5|null), comment(≤200), name, ts, lang,
           hidden?(1=教师隐藏, 缺省=可见),
           plus?:{ [likerNameKey]: 1 }  // "+1/me too", 集合去重天然幂等 }
       /bitescape/ideas/{ideaKey} =                    ideaKey = ts + '_' + nameKey
         { type('quest'|'character'|'meme'|'gripe'), text(≤500), name, nameKey, ts, lang,
           status?('accepted'|'parked', 缺省=待定, 教师面板写) }
       /bitescape/wall/{ideaKey} =                      key 复用来源 idea 的 ideaKey(一点子一墙位)
         { name, ideaSummary, ts }

   ★ 安全边界与 leaderboard.js 相同: 测试模式数据库无真实鉴权, 反馈/点子不是敏感数据,
     没有再加验证。

   对外接口 (window.FEEDBACK):
     init(opts)                — opts: {getPlayer?, getLang?, api?}
     ask(questId, questTitle)  — 任务线三幕收尾后调用, 非阻断评分卡(右下角)
     board(questId, questTitle)— 随时重看某任务线留言板(日志 💬 按钮/信箱入口用)
     ideaBox()                 — 打开「维护者信箱」点子投稿面板
     getWall()                 — Promise<Array<{name,ideaSummary,ts}>> 提交者之墙数据
     _test                     — 纯函数出口, 供单测, 勿在生产逻辑里依赖
   详细接线说明见 feedback_integration.md
   ============================================================ */
(function () {
  'use strict';

  var HAS_DOM = (typeof document !== 'undefined') && (typeof window !== 'undefined');
  var G = (typeof window !== 'undefined') ? window : globalThis;

  var DB = 'https://cs-vocab-default-rtdb.asia-southeast1.firebasedatabase.app';
  var NS = '/bitescape';

  var LB_LS_KEY   = 'bitescape_lb_auth_v1';    // 只读: leaderboard.js 的登录态键, 见其源码 loadAuth()
  var ANON_LS_KEY = 'bitescape_fb_anon_v1';    // 本模块自己的匿名身份持久化
  var ASKED_LS_KEY = 'bitescape_fb_asked_v1';  // {questId::nameKey: ts} 一次性判定
  var QUOTA_LS_KEY = 'bitescape_fb_idea_quota_v1'; // {nameKey::yyyy-mm-dd: count} 点子限流
  var PLUSED_LS_KEY = 'bitescape_fb_plused_v1';    // 本地乐观缓存, questId::authorKey::likerKey

  var ASK_IDLE_MS   = 15000;  // 评分卡: 15s 无操作(未提交/未跳过)算跳过, 直接淡出
  var PANEL_IDLE_MS = 25000;  // 留言板/信箱: 25s 无交互自动淡出(绝不挡操作, 只是清理)
  var BOARD_CACHE_MS = 30000; // 留言板拉取缓存/防抖
  var COMMENT_MAX = 200;
  var IDEA_MAX = 500;
  var IDEA_DAILY_LIMIT = 3;

  /* ================= 纯函数区 (挂 _test) ================= */

  // nameKey 规则与 leaderboard.js 完全一致(必须一致才能是"同一个玩家")
  function nameKeyOf(name) {
    return String(name == null ? '' : name).trim()
      .replace(/[.#$\[\]\/]/g, '_').slice(0, 40);
  }

  function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // 客户端过滤: 去 HTML 标签 → 折叠换行(可选保留) → trim → 截断
  function sanitizeText(str, maxLen, keepNewlines) {
    var s = String(str == null ? '' : str);
    s = s.replace(/<[^>]*>/g, '');
    s = keepNewlines ? s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : s.replace(/[\r\n\t]+/g, ' ');
    s = s.replace(/\s+$/g, '').replace(/^\s+/g, '');
    if (s.length > maxLen) s = s.slice(0, maxLen);
    return s;
  }

  // ---- 一次性判定(每 questId 每玩家只问一次) ----
  function askedMapKey(nameKey, questId) { return nameKey + '::' + questId; }
  function hasAsked(map, nameKey, questId) { return !!(map && map[askedMapKey(nameKey, questId)]); }
  function markAsked(map, nameKey, questId) { map = map || {}; map[askedMapKey(nameKey, questId)] = Date.now(); return map; }

  // ---- 身份: 复用排行榜登录态 → 否则本地匿名 ----
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

  // ---- 点子每日限流(纯函数, map 由调用方从 localStorage 读入) ----
  function dateStrOf(ts) {
    var d = new Date(ts || Date.now());
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function quotaMapKey(nameKey, ds) { return nameKey + '::' + ds; }
  function quotaUsed(map, nameKey, ds) { return Number((map && map[quotaMapKey(nameKey, ds)]) || 0); }
  function quotaAllowed(map, nameKey, ds, limit) { return quotaUsed(map, nameKey, ds) < (limit == null ? IDEA_DAILY_LIMIT : limit); }
  function incQuota(map, nameKey, ds) {
    map = map || {};
    var k = quotaMapKey(nameKey, ds);
    map[k] = quotaUsed(map, nameKey, ds) + 1;
    return map;
  }

  // ---- 留言板统计/过滤 ----
  function filterVisible(entries) {
    return (entries || []).filter(function (e) { return e && !e.hidden; });
  }
  function computeStats(entries) {
    var n = 0, total = 0, dist = [0, 0, 0, 0, 0];
    (entries || []).forEach(function (e) {
      var s = Number(e && e.stars);
      if (s >= 1 && s <= 5 && Math.floor(s) === s) { n++; total += s; dist[s - 1]++; }
    });
    return { avg: n ? (total / n) : 0, count: n, dist: dist };
  }
  function sortByTsDesc(entries) {
    return (entries || []).slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
  }
  function plusCount(entry) { return entry && entry.plus ? Object.keys(entry.plus).length : 0; }
  function hasPlused(entry, myKey) { return !!(entry && entry.plus && entry.plus[myKey]); }

  // ---- 对象转行数组(带上 firebase key, 即作者 nameKey) ----
  function objToRows(obj) {
    if (!obj) return [];
    return Object.keys(obj).map(function (k) {
      var row = Object.assign({}, obj[k]);
      row._key = k;
      return row;
    });
  }

  /* ================= 双语 fallback (与 domain_*.js 同一模式) ================= */
  var T = G.T || function (s) { return typeof s === 'string' ? s : (s && s.en != null ? s.en : ''); };
  function tx(en, zh) { return T({ en: en, zh: zh }); }
  // 巧妙探测当前语言: 复用同一个 T() 通道, 不需要知道引擎内部状态
  function currentLang() { try { return T({ en: 'en', zh: 'zh' }); } catch (e) { return 'en'; } }

  /* ================= localStorage 小工具 ================= */
  function lsGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function lsSet(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }
  function lsGetJson(key, dflt) { try { var v = JSON.parse(localStorage.getItem(key) || 'null'); return v || dflt; } catch (e) { return dflt; } }
  function lsSetJson(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  /* ================= 网络层 (fail-silent, 反馈不值得重试队列) ================= */
  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
      return r.json();
    });
  }
  function putJson(url, data) {
    return fetch(url, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url); return true; });
  }

  /* ================= 身份解析 ================= */
  var cfg = { getPlayer: null, getLang: null, api: null };

  function getPlayer() {
    if (cfg.getPlayer) {
      try {
        var p = cfg.getPlayer();
        if (p && p.nameKey) return { name: p.name || p.nameKey, nameKey: nameKeyOf(p.nameKey) || String(p.nameKey) };
      } catch (e) { console.warn('[FB] getPlayer 回调抛异常, 回退本地身份', e); }
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

  /* ================= 样式 (fb- 前缀, 终端绿语言) ================= */
  var CSS = [
    /* ---- 右下角非阻断卡片/留言板共用外壳 ---- */
    '#fb-root{position:fixed;right:16px;bottom:16px;z-index:52;width:min(300px,88vw);',
    '  font-family:"Courier New",monospace;pointer-events:none}',
    '#fb-root>*{pointer-events:auto}',
    '.fb-card,.fb-board{background:rgba(4,9,6,.97);border:1px solid #2f6f2f;border-radius:6px;',
    '  color:#bfeebf;font-size:12.5px;line-height:1.55;box-shadow:0 6px 28px rgba(0,0,0,.5),0 0 22px rgba(40,120,60,.25);',
    '  animation:fb-slide-in .22s ease-out;overflow:hidden}',
    '@keyframes fb-slide-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}',
    '.fb-fading{animation:fb-fade-out .5s ease-in forwards}',
    '@keyframes fb-fade-out{to{opacity:0;transform:translateY(8px)}}',
    '.fb-head{padding:8px 11px 2px;color:#9fee9f;letter-spacing:.5px;font-size:11.5px}',
    '.fb-quest{padding:0 11px 7px;color:#ffce3a;font-size:11.5px;border-bottom:1px dashed #1f3f1f;',
    '  margin-bottom:8px;word-break:break-word}',
    '.fb-stars{display:flex;gap:4px;padding:0 11px}',
    '.fb-star{cursor:pointer;font-size:20px;color:#2f6f2f;user-select:none;transition:color .08s,transform .08s}',
    '.fb-star:hover{transform:scale(1.12)}',
    '.fb-star.fb-fill{color:#ffce3a;text-shadow:0 0 6px rgba(255,206,58,.7)}',
    '.fb-submit{background:rgba(255,206,58,.12);color:#ffce3a;border:1px solid rgba(255,206,58,.55);',
    '  padding:3px 14px;font-family:inherit;font-size:11px;letter-spacing:2px;cursor:pointer;border-radius:3px}',
    '.fb-submit:hover:not(:disabled){background:rgba(255,206,58,.25)}',
    '.fb-submit:disabled{opacity:.35;cursor:default}',
    '.fb-comment{display:block;width:calc(100% - 22px);margin:8px 11px 0;background:#060d06;',
    '  color:#aef0ae;border:1px solid #2f6f2f;padding:6px 8px;font-family:inherit;font-size:12px;',
    '  outline:none;border-radius:2px;box-sizing:border-box}',
    '.fb-comment:focus{border-color:#7CFC00;box-shadow:0 0 8px rgba(43,102,43,.6)}',
    '.fb-foot{display:flex;align-items:center;justify-content:space-between;padding:8px 11px;gap:8px}',
    '.fb-skip{color:#5a8a5a;font-size:11px;cursor:pointer;text-decoration:underline dotted}',
    '.fb-skip:hover{color:#9fee9f}',
    '.fb-timerbar{flex:1;height:2px;background:#132213;border-radius:2px;overflow:hidden;max-width:70px}',
    '.fb-timerbar i{display:block;height:100%;background:#2f6f2f;width:100%;transform-origin:left;',
    '  animation-name:fb-shrink;animation-timing-function:linear;animation-fill-mode:forwards}',
    '@keyframes fb-shrink{from{transform:scaleX(1)}to{transform:scaleX(0)}}',
    '.fb-thanks{padding:16px 12px;text-align:center;color:#7CFC00;letter-spacing:1px}',
    /* ---- 留言板 ---- */
    '.fb-board{max-height:min(62vh,440px);display:flex;flex-direction:column}',
    '.fb-board-head{padding:8px 11px;color:#9fee9f;letter-spacing:.5px;font-size:11px;',
    '  border-bottom:1px solid #1f3f1f;display:flex;justify-content:space-between;align-items:flex-start;gap:6px}',
    '.fb-board-title{flex:1}',
    '.fb-board-quest{color:#ffce3a;display:block;font-size:11.5px;margin-top:2px}',
    '.fb-close{background:none;border:1px solid #2f6f2f;color:#7CFC00;border-radius:2px;',
    '  cursor:pointer;font-size:11px;line-height:1;padding:3px 7px;flex-shrink:0}',
    '.fb-close:hover{background:#123312}',
    '.fb-stats{display:flex;align-items:center;gap:10px;padding:9px 11px;border-bottom:1px dashed #1f3f1f}',
    '.fb-avg{font-size:24px;color:#ffce3a;text-shadow:0 0 8px rgba(255,206,58,.5)}',
    '.fb-avg small{font-size:11px;color:#5a8a5a;font-weight:normal}',
    '.fb-dist{flex:1;display:flex;flex-direction:column;gap:1px}',
    '.fb-dist-row{display:flex;align-items:center;gap:5px;font-size:9.5px;color:#5a8a5a}',
    '.fb-dist-bar{flex:1;height:5px;background:#0d1a0d;border-radius:2px;overflow:hidden}',
    '.fb-dist-bar i{display:block;height:100%;background:#3a7a3a}',
    '.fb-list{overflow-y:auto;padding:2px 0}',
    '.fb-row{padding:7px 11px;border-bottom:1px solid rgba(31,63,31,.35)}',
    '.fb-row.fb-me{background:rgba(60,110,40,.22);box-shadow:inset 2px 0 0 #7CFC00}',
    '.fb-row-top{display:flex;align-items:center;gap:6px;font-size:12px}',
    '.fb-row-stars{color:#ffce3a;letter-spacing:1px}',
    '.fb-row-name{color:#dff5df;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.fb-row-me-tag{color:#7CFC00;font-size:10px}',
    '.fb-row-comment{color:#bfeebf;margin-top:3px;word-break:break-word}',
    '.fb-row-bottom{display:flex;align-items:center;gap:8px;margin-top:4px}',
    '.fb-plus{background:none;border:1px solid #2f6f2f;color:#7aa87a;border-radius:9px;',
    '  font-size:10px;padding:1px 8px;cursor:pointer}',
    '.fb-plus:hover{border-color:#7CFC00;color:#9fee9f}',
    '.fb-plus.fb-plused{color:#7CFC00;border-color:#7CFC00;cursor:default}',
    '.fb-plus:disabled{opacity:.32;cursor:default;border-style:dashed}',
    '.fb-plus:disabled:hover{border-color:#2f6f2f;color:#7aa87a}',
    '.fb-empty{padding:24px 11px;text-align:center;color:#4a7a4a;font-size:11.5px}',
    /* ---- 维护者信箱(点子投稿) 全屏轻遮罩居中面板 ---- */
    '#fb-ib-root{position:fixed;inset:0;z-index:53;display:none;align-items:center;justify-content:center;',
    '  background:rgba(2,5,3,.6);font-family:"Courier New",monospace}',
    '#fb-ib-root.fb-on{display:flex}',
    '.fb-ib-panel{width:min(440px,92vw);max-height:88vh;overflow-y:auto;background:rgba(4,9,6,.97);',
    '  border:1px solid #2f6f2f;border-radius:6px;color:#bfeebf;font-size:13px;line-height:1.6;',
    '  box-shadow:0 0 34px rgba(40,120,60,.3);animation:fb-slide-in .18s ease-out}',
    '.fb-ib-head{padding:12px 16px;border-bottom:1px solid #2f6f2f;display:flex;justify-content:space-between;gap:8px}',
    '.fb-ib-title{color:#9fee9f;letter-spacing:1px;font-size:12.5px;flex:1}',
    '.fb-ib-tabs{display:flex;gap:4px;padding:8px 16px 0;border-bottom:1px solid #1f3f1f}',
    '.fb-ib-tab{background:none;border:1px solid #1f3f1f;border-bottom:none;color:#5a8a5a;',
    '  padding:5px 13px;font-family:inherit;font-size:12px;cursor:pointer;border-radius:4px 4px 0 0}',
    '.fb-ib-tab.fb-cur{background:rgba(20,50,20,.55);color:#7CFC00;border-color:#2f6f2f}',
    '.fb-ib-body{padding:14px 16px}',
    '.fb-ib-types{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}',
    '.fb-ib-type{background:#0a1f0a;color:#7aa87a;border:1px solid #2f6f2f;border-radius:2px;',
    '  padding:5px 10px;font-size:11.5px;cursor:pointer;font-family:inherit}',
    '.fb-ib-type.fb-cur{background:#123312;color:#7CFC00;border-color:#7CFC00}',
    '.fb-ib-text{width:100%;box-sizing:border-box;min-height:96px;resize:vertical;background:#060d06;',
    '  color:#aef0ae;border:1px solid #2f6f2f;padding:8px;font-family:inherit;font-size:12.5px;',
    '  outline:none;border-radius:2px}',
    '.fb-ib-text:focus{border-color:#7CFC00;box-shadow:0 0 8px rgba(43,102,43,.6)}',
    '.fb-ib-count{text-align:right;color:#4a7a4a;font-size:10.5px;margin-top:2px}',
    '.fb-ib-foot{display:flex;align-items:center;justify-content:space-between;margin-top:10px;gap:8px}',
    '.fb-ib-quota{color:#5a8a5a;font-size:11px}',
    '.fb-ib-btn{background:#0a1f0a;color:#7CFC00;border:1px solid #2f6f2f;padding:6px 16px;',
    '  font-family:inherit;font-size:12.5px;cursor:pointer;border-radius:2px}',
    '.fb-ib-btn:hover{background:#123312;box-shadow:0 0 10px #2b6}',
    '.fb-ib-btn:disabled{opacity:.45;cursor:default;box-shadow:none}',
    '.fb-ib-msg{margin-top:8px;font-size:11.5px;min-height:16px}',
    '.fb-ib-msg.fb-ok{color:#7CFC00}',
    '.fb-ib-msg.fb-err{color:#ff8080}',
    '.fb-ib-wall-row{padding:7px 0;border-bottom:1px solid rgba(31,63,31,.35);font-size:12px}',
    '.fb-ib-wall-name{color:#ffce3a}',
    '.fb-ib-wall-idea{color:#bfeebf;margin-top:2px}',
    '.fb-ib-wall-ts{color:#4a7a4a;font-size:10px;margin-top:2px}'
  ].join('\n');

  function ensureStyle() {
    if (!HAS_DOM || document.getElementById('fb-style')) return;
    var style = document.createElement('style');
    style.id = 'fb-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  function h(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function ensureRoot() {
    if (!HAS_DOM) return null;
    var r = document.getElementById('fb-root');
    if (!r) { r = document.createElement('div'); r.id = 'fb-root'; document.body.appendChild(r); }
    return r;
  }

  /* ================= 留言板拉取(30s 缓存) ================= */
  var boardCache = {}; // questId -> {ts, rows}
  function loadBoard(questId, force) {
    var c = boardCache[questId];
    if (!force && c && (Date.now() - c.ts) < BOARD_CACHE_MS) return Promise.resolve(c.rows);
    return fetchJson(DB + NS + '/feedback/' + encodeURIComponent(questId) + '.json')
      .then(function (obj) {
        var rows = objToRows(obj);
        boardCache[questId] = { ts: Date.now(), rows: rows };
        return rows;
      })
      .catch(function (e) {
        console.warn('[FB] 拉取留言板失败', e);
        return (boardCache[questId] && boardCache[questId].rows) || [];
      });
  }

  /* ================= 留言板渲染(卡片内 / 独立 board() 共用) ================= */
  function starChars(n) {
    n = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  function renderBoardHtml(questId, questTitle, rows, myKey) {
    var visible = sortByTsDesc(filterVisible(rows));
    var stats = computeStats(visible);
    var distMax = Math.max.apply(null, stats.dist.concat([1]));

    var head =
      '<div class="fb-board-head">' +
      ' <div class="fb-board-title">' + esc(tx('DIAGNOSTIC LOG — what others left behind', '诊断日志——其他人留下的话')) +
      (questTitle ? '<span class="fb-board-quest">' + esc(questTitle) + '</span>' : '') +
      ' </div>' +
      ' <button class="fb-close" data-act="close">✕</button>' +
      '</div>';

    var statsHtml =
      '<div class="fb-stats">' +
      ' <div class="fb-avg">' + (stats.count ? stats.avg.toFixed(1) : '–') + '<br><small>' + stats.count + ' ' + esc(tx('ratings', '人评分')) + '</small></div>' +
      ' <div class="fb-dist">' +
      [5, 4, 3, 2, 1].map(function (s) {
        var n = stats.dist[s - 1];
        var pct = Math.round(n / distMax * 100);
        return '<div class="fb-dist-row"><span>' + s + '★</span><span class="fb-dist-bar"><i style="width:' + pct + '%"></i></span><span>' + n + '</span></div>';
      }).join('') +
      ' </div>' +
      '</div>';

    var listHtml;
    if (!visible.length) {
      listHtml = '<div class="fb-empty">' + esc(tx('No one has rated this yet — be the first voice in the log.', '还没有人留言——做第一个在日志里发声的人。')) + '</div>';
    } else {
      listHtml = '<div class="fb-list">' + visible.map(function (r) {
        var isMe = myKey && r._key === myKey;
        var plused = hasPlused(r, myKey);
        var canPlus = !isMe && r.comment;
        return '<div class="fb-row' + (isMe ? ' fb-me' : '') + '">' +
          ' <div class="fb-row-top">' +
          (r.stars ? '<span class="fb-row-stars">' + starChars(r.stars) + '</span>' : '') +
          '<span class="fb-row-name">' + esc(r.name || '???') + '</span>' +
          (isMe ? '<span class="fb-row-me-tag">(' + esc(tx('you', '你')) + ')</span>' : '') +
          ' </div>' +
          (r.comment ? '<div class="fb-row-comment">' + esc(r.comment) + '</div>' : '') +
          (r.comment ?
            '<div class="fb-row-bottom">' +
            '<button class="fb-plus' + (plused ? ' fb-plused' : '') + '" ' +
            (canPlus ? ('data-act="plus" data-author="' + esc(r._key) + '"') : 'disabled') + '>' +
            (plused ? '✓ +1' : '+1 ' + esc(tx('me too', '我也这么想'))) + ' (' + plusCount(r) + ')' +
            '</button></div>' : '') +
          '</div>';
      }).join('') + '</div>';
    }
    return head + statsHtml + listHtml;
  }

  function wireBoardEvents(el, questId, questTitle, myKey, onClose) {
    el.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.dataset.act;
      if (act === 'close') { if (onClose) onClose(); return; }
      if (act === 'plus') {
        var authorKey = btn.dataset.author;
        if (!authorKey || !myKey) return;
        btn.disabled = true;
        putJson(DB + NS + '/feedback/' + encodeURIComponent(questId) + '/' + encodeURIComponent(authorKey) + '/plus/' + encodeURIComponent(myKey) + '.json', 1)
          .then(function () {
            // 乐观本地缓存 + 更新内存里的行, 立即重渲染(幂等: 同一 liker 重复 PUT 同一值)
            var pk = questId + '::' + authorKey + '::' + myKey;
            var pm = lsGetJson(PLUSED_LS_KEY, {}); pm[pk] = 1; lsSetJson(PLUSED_LS_KEY, pm);
            var rows = (boardCache[questId] && boardCache[questId].rows) || [];
            rows.forEach(function (r) { if (r._key === authorKey) { r.plus = r.plus || {}; r.plus[myKey] = 1; } });
            var body = el.querySelector('.fb-board') || el;
            body.innerHTML = renderBoardHtml(questId, questTitle, rows, myKey);
          })
          .catch(function (e2) { console.warn('[FB] +1 失败', e2); btn.disabled = false; });
      }
    });
  }

  /* ================= 面板生命周期(评分卡 → 留言板, 一次只显示一个) ================= */
  var root = null;
  var panelEl = null;      // 当前挂载的 .fb-card 或 .fb-board 元素
  var panelTimer = null;   // 自动淡出计时器
  var queue = [];          // 待问的 {questId,title,player}
  var busy = false;        // 是否有卡片/留言板占用槽位

  function clearPanelTimer() { if (panelTimer) { clearTimeout(panelTimer); panelTimer = null; } }

  function closePanel(advanceQueue) {
    clearPanelTimer();
    if (panelEl && panelEl.parentNode) {
      panelEl.classList.add('fb-fading');
      var dead = panelEl;
      setTimeout(function () { if (dead.parentNode) dead.parentNode.removeChild(dead); }, 480);
    }
    panelEl = null; busy = false;
    if (advanceQueue !== false) pump();
  }

  function pump() {
    if (busy || !queue.length || !HAS_DOM) return;
    var item = queue.shift();
    showRatingCard(item);
  }

  function mount(el) {
    ensureStyle();
    root = ensureRoot();
    root.innerHTML = '';
    root.appendChild(el);
    panelEl = el;
    busy = true;
  }

  function showRatingCard(item) {
    var askedMap = lsGetJson(ASKED_LS_KEY, {});
    markAsked(askedMap, item.player.nameKey, item.questId);
    lsSetJson(ASKED_LS_KEY, askedMap);

    var card = h(
      '<div class="fb-card">' +
      ' <div class="fb-head">' + esc(tx('[MAINTENANCE] Rate this experience — your diagnostics help the machine heal.',
        '[维护日志] 为这段经历评分——你的诊断数据会帮这台机器痊愈。')) + '</div>' +
      ' <div class="fb-quest">' + esc(item.title || item.questId) + '</div>' +
      ' <div class="fb-stars">' +
      [1, 2, 3, 4, 5].map(function (i) { return '<span class="fb-star" data-v="' + i + '">★</span>'; }).join('') +
      ' </div>' +
      ' <input class="fb-comment" maxlength="' + COMMENT_MAX + '" placeholder="' +
      esc(tx('leave a note for the maintainer…', '给维护者留句话…')) + '">' +
      ' <div class="fb-foot">' +
      '  <span class="fb-skip" data-act="skip">' + esc(tx('skip', '跳过')) + '</span>' +
      '  <button class="fb-submit" data-act="submit" disabled>' + esc(tx('SUBMIT', '提交')) + '</button>' +
      '  <span class="fb-timerbar"><i style="animation-duration:' + ASK_IDLE_MS + 'ms"></i></span>' +
      ' </div>' +
      '</div>');
    mount(card);
    playSfx('quest');

    var stars = card.querySelectorAll('.fb-star');
    var commentIn = card.querySelector('.fb-comment');
    var submitBtn = card.querySelector('[data-act="submit"]');
    var settled = false;
    var chosen = 0; // 选中的星数(0=未选)。选星不提交, 等显式提交按钮/回车。

    function preview(upTo) {
      stars.forEach(function (s) { s.classList.toggle('fb-fill', Number(s.dataset.v) <= upTo); });
    }
    function refreshSubmit() {
      submitBtn.disabled = !(chosen > 0 || commentIn.value.trim());
    }
    function engaged() { // 用户开始交互: 停掉 15s 自动淡出, 隐藏倒计时条
      clearPanelTimer();
      var tb = card.querySelector('.fb-timerbar'); if (tb) tb.style.display = 'none';
    }
    stars.forEach(function (s) {
      s.addEventListener('mouseenter', function () { preview(Number(s.dataset.v)); });
      s.addEventListener('click', function () { chosen = Number(s.dataset.v); preview(chosen); engaged(); refreshSubmit(); });
    });
    card.addEventListener('mouseleave', function () { if (!settled) preview(chosen); });
    commentIn.addEventListener('input', function () { engaged(); refreshSubmit(); });
    commentIn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !submitBtn.disabled) settle('rated', chosen || null);
    });
    submitBtn.addEventListener('click', function () { if (!submitBtn.disabled) settle('rated', chosen || null); });
    card.querySelector('[data-act="skip"]').addEventListener('click', function () { settle('skip', null); });

    function settle(kind, stars_) {
      if (settled) return;
      settled = true;
      clearPanelTimer();
      if (kind === 'rated') {
        var comment = sanitizeText(commentIn.value, COMMENT_MAX, false);
        var entry = { stars: stars_, comment: comment, name: item.player.name, ts: Date.now(), lang: currentLang() };
        putJson(DB + NS + '/feedback/' + encodeURIComponent(item.questId) + '/' + encodeURIComponent(item.player.nameKey) + '.json', entry)
          .catch(function (e) { console.warn('[FB] 上报评分失败(不重试)', e); });
        showThanksThenBoard(item);
      } else {
        // 显式点跳过: 不写入评分, 但作为一次主动交互, 顺手把留言板亮给他看
        showBoardIn(panelEl, item.questId, item.title, item.player.nameKey, true);
      }
    }

    panelTimer = setTimeout(function () {
      if (settled) return;
      settled = true;
      closePanel(); // 15s 静默无操作 = 纯跳过, 不看板, 直接淡出
    }, ASK_IDLE_MS);
  }

  function showThanksThenBoard(item) {
    clearPanelTimer();
    if (panelEl) panelEl.innerHTML = '<div class="fb-thanks">' + esc(tx('logged. thank you, operator.', '已记录。谢谢你, 操作员。')) + '</div>';
    setTimeout(function () {
      if (!panelEl) return;
      showBoardIn(panelEl, item.questId, item.title, item.player.nameKey, true);
    }, 850);
  }

  // wrap=true: 复用现有 panelEl(评分卡转场); wrap=false: 全新挂载(standalone board())
  function showBoardIn(targetEl, questId, questTitle, myKey, isTransform) {
    loadBoard(questId, false).then(function (rows) {
      var el = targetEl;
      if (!isTransform || !el || !el.parentNode) {
        el = h('<div class="fb-board"></div>');
        mount(el);
      } else {
        el.className = 'fb-board';
      }
      el.innerHTML = renderBoardHtml(questId, questTitle, rows, myKey);
      wireBoardEvents(el, questId, questTitle, myKey, function () { closePanel(); });
      clearPanelTimer();
      panelTimer = setTimeout(function () { closePanel(); }, PANEL_IDLE_MS);
    });
  }

  /* ================= 公开: ask / board ================= */

  function ask(questId, questTitle) {
    if (!HAS_DOM) return;
    questId = String(questId || '');
    if (!questId) return;
    var player = getPlayer();
    if (!player || !player.nameKey) return;
    var askedMap = lsGetJson(ASKED_LS_KEY, {});
    if (hasAsked(askedMap, player.nameKey, questId)) return;
    if (queue.some(function (q) { return q.questId === questId; })) return; // 防重复排队
    queue.push({ questId: questId, title: questTitle, player: player });
    pump();
  }

  function board(questId, questTitle) {
    if (!HAS_DOM) return;
    questId = String(questId || '');
    if (!questId) return;
    var player = getPlayer();
    clearPanelTimer();
    var el = h('<div class="fb-board"></div>');
    mount(el);
    showBoardIn(el, questId, questTitle, player && player.nameKey, true);
  }

  /* ================= 维护者信箱 (点子投稿 + 提交者之墙) ================= */

  var ibRoot = null, ibCurTab = 'submit', ibCurType = 'quest';
  var IDEA_TYPES = [
    { id: 'quest', en: 'Quest idea', zh: '任务点子' },
    { id: 'character', en: 'Character idea', zh: '角色点子' },
    { id: 'meme', en: 'Meme / Easter egg', zh: '梗·彩蛋' },
    { id: 'gripe', en: 'Gripe', zh: '吐槽' }
  ];

  function ensureIbRoot() {
    if (ibRoot) return ibRoot;
    ensureStyle();
    ibRoot = h(
      '<div id="fb-ib-root">' +
      ' <div class="fb-ib-panel">' +
      '  <div class="fb-ib-head">' +
      '   <div class="fb-ib-title">' + esc(tx(
        "The machine takes requests. Describe a quest, a character, a joke — if the Maintainer builds it, your name goes on the Wall of Commits.",
        '这台机器接受许愿。描述一个任务、一个角色、一个梗——如果维护者把它做出来, 你的名字会刻上提交者之墙 (Wall of Commits)。'
      )) + '</div>' +
      '   <button class="fb-close" data-act="ib-close">✕</button>' +
      '  </div>' +
      '  <div class="fb-ib-tabs">' +
      '   <button class="fb-ib-tab fb-cur" data-tab="submit">' + esc(tx('SUBMIT', '投稿')) + '</button>' +
      '   <button class="fb-ib-tab" data-tab="wall">' + esc(tx('WALL OF COMMITS', '提交者之墙')) + '</button>' +
      '  </div>' +
      '  <div class="fb-ib-body"></div>' +
      ' </div>' +
      '</div>');
    document.body.appendChild(ibRoot);
    ibRoot.addEventListener('click', function (e) {
      if (e.target === ibRoot) closeIdeaBox();
      var t = e.target.closest('[data-act="ib-close"]');
      if (t) closeIdeaBox();
      var tab = e.target.closest('[data-tab]');
      if (tab) { ibCurTab = tab.dataset.tab; renderIb(); }
    });
    return ibRoot;
  }

  function renderIb() {
    ibRoot.querySelectorAll('.fb-ib-tab').forEach(function (b) { b.classList.toggle('fb-cur', b.dataset.tab === ibCurTab); });
    var body = ibRoot.querySelector('.fb-ib-body');
    if (ibCurTab === 'wall') { renderIbWall(body); return; }
    renderIbSubmit(body);
  }

  function renderIbSubmit(body) {
    var player = getPlayer();
    var ds = dateStrOf(Date.now());
    var quotaMap = lsGetJson(QUOTA_LS_KEY, {});
    var used = quotaUsed(quotaMap, player.nameKey, ds);
    var remaining = Math.max(0, IDEA_DAILY_LIMIT - used);

    body.innerHTML =
      '<div class="fb-ib-types">' +
      IDEA_TYPES.map(function (t) {
        return '<button class="fb-ib-type' + (t.id === ibCurType ? ' fb-cur' : '') + '" data-type="' + t.id + '">' +
          esc(tx(t.en, t.zh)) + '</button>';
      }).join('') + '</div>' +
      '<textarea class="fb-ib-text" maxlength="' + IDEA_MAX + '" placeholder="' +
      esc(tx('describe your idea…', '描述你的点子…')) + '"></textarea>' +
      '<div class="fb-ib-count">0 / ' + IDEA_MAX + '</div>' +
      '<div class="fb-ib-foot">' +
      ' <span class="fb-ib-quota">' + esc(tx('today', '今日')) + ' ' + remaining + '/' + IDEA_DAILY_LIMIT + '</span>' +
      ' <button class="fb-ib-btn" data-act="ib-submit"' + (remaining <= 0 ? ' disabled' : '') + '>' +
      esc(tx('SEND ▶', '发送 ▶')) + '</button>' +
      '</div>' +
      '<div class="fb-ib-msg"></div>';

    body.querySelectorAll('.fb-ib-type').forEach(function (b) {
      // 只切类型高亮, 不整体重渲染 —— 否则会把用户已经打好的草稿冲掉
      b.addEventListener('click', function () {
        ibCurType = b.dataset.type;
        body.querySelectorAll('.fb-ib-type').forEach(function (x) { x.classList.toggle('fb-cur', x === b); });
      });
    });
    var textEl = body.querySelector('.fb-ib-text');
    var countEl = body.querySelector('.fb-ib-count');
    textEl.addEventListener('input', function () { countEl.textContent = textEl.value.length + ' / ' + IDEA_MAX; });

    var submitBtn = body.querySelector('[data-act="ib-submit"]');
    var msgEl = body.querySelector('.fb-ib-msg');
    submitBtn.addEventListener('click', function () {
      var text = sanitizeText(textEl.value, IDEA_MAX, true);
      if (!text) { msgEl.className = 'fb-ib-msg fb-err'; msgEl.textContent = tx('write something first…', '先写点什么…'); return; }
      var qMap = lsGetJson(QUOTA_LS_KEY, {});
      if (!quotaAllowed(qMap, player.nameKey, ds, IDEA_DAILY_LIMIT)) {
        msgEl.className = 'fb-ib-msg fb-err';
        msgEl.textContent = tx('daily quota used up — come back tomorrow.', '今日额度已用完，明天再来。');
        return;
      }
      submitBtn.disabled = true;
      var ts = Date.now();
      var ideaKey = ts + '_' + player.nameKey;
      var entry = { type: ibCurType, text: text, name: player.name, nameKey: player.nameKey, ts: ts, lang: currentLang() };
      putJson(DB + NS + '/ideas/' + encodeURIComponent(ideaKey) + '.json', entry)
        .then(function () {
          incQuota(qMap, player.nameKey, ds); lsSetJson(QUOTA_LS_KEY, qMap);
          textEl.value = ''; countEl.textContent = '0 / ' + IDEA_MAX;
          msgEl.className = 'fb-ib-msg fb-ok';
          msgEl.textContent = tx('received. the Maintainer is listening.', '已收到。维护者在听。');
          try { if (cfg.api && typeof cfg.api.toast === 'function') cfg.api.toast(tx('idea sent', '点子已发送')); } catch (e2) {}
          renderIbSubmit(body); // 刷新剩余额度
        })
        .catch(function (e) {
          console.warn('[FB] 点子提交失败', e);
          submitBtn.disabled = false;
          msgEl.className = 'fb-ib-msg fb-err';
          msgEl.textContent = tx('network hiccup — try again.', '网络不好，稍后再试。');
        });
    });
  }

  function renderIbWall(body) {
    body.innerHTML = '<div class="fb-ib-msg">' + esc(tx('loading…', '加载中…')) + '</div>';
    getWall().then(function (list) {
      if (!list.length) {
        body.innerHTML = '<div class="fb-empty">' + esc(tx('The wall is still blank. Be the first name on it.', '墙上还是空的。做第一个被刻上去的名字。')) + '</div>';
        return;
      }
      body.innerHTML = list.map(function (w) {
        return '<div class="fb-ib-wall-row">' +
          '<div class="fb-ib-wall-name">' + esc(w.name || '???') + '</div>' +
          '<div class="fb-ib-wall-idea">' + esc(w.ideaSummary || '') + '</div>' +
          '<div class="fb-ib-wall-ts">' + new Date(w.ts || 0).toLocaleDateString() + '</div>' +
          '</div>';
      }).join('');
    });
  }

  function ideaBox() {
    if (!HAS_DOM) return;
    ensureIbRoot();
    ibCurTab = 'submit';
    renderIb();
    ibRoot.classList.add('fb-on');
  }
  function closeIdeaBox() { if (ibRoot) ibRoot.classList.remove('fb-on'); }

  function getWall() {
    return fetchJson(DB + NS + '/wall.json').then(function (obj) {
      var rows = objToRows(obj);
      return sortByTsDesc(rows);
    }).catch(function (e) { console.warn('[FB] 拉取提交者之墙失败', e); return []; });
  }

  /* ================= ESC 关闭信箱(不影响评分卡: 评分卡从不吞键盘全局事件) ================= */
  function onKeydown(e) {
    if ((e.key === 'Escape') && ibRoot && ibRoot.classList.contains('fb-on')) closeIdeaBox();
  }

  /* ================= init ================= */
  var inited = false;
  function init(opts) {
    opts = opts || {};
    cfg.getPlayer = opts.getPlayer || null;
    cfg.getLang = opts.getLang || null;
    cfg.api = opts.api || null;
    if (inited) return;
    inited = true;
    if (HAS_DOM) {
      ensureStyle();
      window.addEventListener('keydown', onKeydown, true);
    }
  }

  /* ================= 导出 ================= */
  G.FEEDBACK = {
    init: init,
    ask: ask,
    board: board,
    ideaBox: ideaBox,
    getWall: getWall,
    _test: {
      nameKeyOf: nameKeyOf,
      sanitizeText: sanitizeText,
      hasAsked: hasAsked,
      markAsked: markAsked,
      askedMapKey: askedMapKey,
      parseLbAuth: parseLbAuth,
      parseAnon: parseAnon,
      makeAnonId: makeAnonId,
      dateStrOf: dateStrOf,
      quotaUsed: quotaUsed,
      quotaAllowed: quotaAllowed,
      incQuota: incQuota,
      filterVisible: filterVisible,
      computeStats: computeStats,
      sortByTsDesc: sortByTsDesc,
      plusCount: plusCount,
      hasPlused: hasPlused,
      objToRows: objToRows,
      starChars: starChars,
      renderBoardHtml: renderBoardHtml
    }
  };
})();
