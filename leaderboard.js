/* ============================================================
   leaderboard.js — BIT://ESCAPE 云端排行榜模块 (独立自包含)
   ------------------------------------------------------------
   后端: 复用单词游戏的 Firebase Realtime Database (测试模式, REST 直连无 SDK)
     DB 根: https://cs-vocab-default-rtdb.asia-southeast1.firebasedatabase.app
     本游戏全部数据在 /bitescape/ 命名空间下:
       /bitescape/users/{nameKey} = {name, pw, created}   pw = SHA-256(密码+固定盐) hex
       /bitescape/board/{nameKey} = 进度条目(见 buildEntry)
     绝不读写 /leaderboard —— 那是单词游戏的命名空间。

   ★ 诚实说明(安全边界): 数据库是测试模式, 没有真实鉴权 ——
     任何人抓包都能改任何数据。这里的"密码"只防同学之间冒名顶替,
     不是安全机制。UI 里已提示玩家勿使用常用密码。

   对外接口 (window.LEADERBOARD):
     init(getStats, opts?)  — getStats() 返回
         {main,mainTotal,dex,dexTotal,side,hidden,endings,playMs,world}
         opts: {hotkey:true, onOpen, onClose}
     open() / close() / isOpen()
     report()               — 进度变化时调用, 内部 debounce ≥10s
     logout()
     _test                  — 纯函数出口, 供单测
   详细接线说明见 leaderboard_integration.md
   ============================================================ */
(function () {
  'use strict';

  var HAS_DOM = (typeof document !== 'undefined') && (typeof window !== 'undefined');
  var G = (typeof window !== 'undefined') ? window : globalThis;

  var DB = 'https://cs-vocab-default-rtdb.asia-southeast1.firebasedatabase.app';
  var NS = '/bitescape';
  var SALT = 'bit://escape::9618::salt-v1';   // 固定盐(公开无妨, 见上方安全说明)
  var LS_KEY = 'bitescape_lb_auth_v1';
  var REPORT_MIN_MS = 10000;                  // 上传 debounce ≥10 秒
  var RETRY_MS = 30000;                       // 失败重试间隔
  var AUTO_REFRESH_MS = 30000;                // 面板开着时自动刷新

  /* ================= 双语 fallback (与 domain_*.js/feedback.js 同一模式) ================= */
  var T = G.T || function (s) { return typeof s === 'string' ? s : (s && s.en != null ? s.en : ''); };
  function tx(en, zh) { return T({ en: en, zh: zh }); }

  /* ================= 纯函数区 (挂 _test) ================= */

  function num(v) { v = +v; return (isFinite(v) && v > 0) ? Math.floor(v) : 0; }

  // nameKey 规则沿用单词游戏: trim → .#$[]/ 换 _ → ≤40 字符; 空串 = 拒绝(返回 '')
  function nameKey(name) {
    return String(name == null ? '' : name).trim()
      .replace(/[.#$\[\]\/]/g, '_').slice(0, 40);
  }

  var ENDING_ORDER = ['exit0', 'exit1', 'return', 'fork'];
  var ENDING_BONUS = { exit0: 200, exit1: 0, 'return': 600, fork: 600 };

  // 结局数组清洗: 只留合法值、去重、按固定顺序
  function normEndings(a) {
    var set = [];
    (Array.isArray(a) ? a : []).forEach(function (e) {
      if (ENDING_ORDER.indexOf(e) >= 0 && set.indexOf(e) < 0) set.push(e);
    });
    set.sort(function (x, y) { return ENDING_ORDER.indexOf(x) - ENDING_ORDER.indexOf(y); });
    return set;
  }

  // 综合分: main*100 + dex*40 + side*60 + hidden*150 + 结局加成(exit0+200, return/fork 各+600)
  function computeScore(s) {
    s = s || {};
    var sc = num(s.main) * 100 + num(s.dex) * 40 + num(s.side) * 60 + num(s.hidden) * 150;
    normEndings(s.endings).forEach(function (e) { sc += ENDING_BONUS[e] || 0; });
    return sc;
  }

  var byTs = function (a, b) { return (a.ts || 0) - (b.ts || 0); };  // 同分先到先排

  function sortComp(list) {
    return list.slice().sort(function (a, b) {
      return (num(b.score) - num(a.score)) || byTs(a, b);
    });
  }
  function sortMain(list) {
    return list.slice().sort(function (a, b) {
      return (num(b.main) - num(a.main)) || (num(b.score) - num(a.score)) || byTs(a, b);
    });
  }
  function sortDex(list) {
    return list.slice().sort(function (a, b) {
      return (num(b.dex) - num(a.dex)) || (num(b.score) - num(a.score)) || byTs(a, b);
    });
  }
  function sortExplore(list) {
    return list.slice().sort(function (a, b) {
      return ((num(b.side) + num(b.hidden)) - (num(a.side) + num(a.hidden)))
        || (num(b.hidden) - num(a.hidden)) || byTs(a, b);
    });
  }
  // 速通榜: 只收有 return / fork 结局的玩家, playMs 升序
  function sortSpeed(list) {
    return list.filter(function (e) {
      var es = normEndings(e.endings);
      return es.indexOf('return') >= 0 || es.indexOf('fork') >= 0;
    }).sort(function (a, b) {
      var pa = num(a.playMs) || Infinity, pb = num(b.playMs) || Infinity;
      return (pa - pb) || byTs(a, b);
    });
  }

  // 互助值榜: 留言互助 + 接力签名合计降序(同分先到先排), 让不擅长解题的学生也有上榜路径(CO-30)
  function sortHelp(list) {
    return list.slice().sort(function (a, b) {
      return ((num(b.helpValue) + num(b.ideasAdopted)) - (num(a.helpValue) + num(a.ideasAdopted)))
        || (num(b.helpValue) - num(a.helpValue)) || byTs(a, b);
    });
  }

  /* ---------- CO-30: 非学业维度聚合(留言 +1 / 接力签名 / 点子上墙) ---------- */

  // notesObj = { world: { pushId: {nameKey, plus:{likerKey:1}, ...}, ... }, ... } (见 social.js)
  // relayObj = { doorId: { slots: {nameKey:{name,ts}}, need }, ... }             (见 social.js)
  // 容错: 传 null/undefined/坏结构一律当空表, 不抛异常(节点不存在则显示 0)
  function aggregateHelp(notesObj, relayObj) {
    var map = {};
    function bump(key, field) {
      if (!key) return;
      if (!map[key]) map[key] = { plusReceived: 0, relaySigned: 0 };
      map[key][field]++;
    }
    Object.keys(notesObj || {}).forEach(function (world) {
      var worldNotes = (notesObj && notesObj[world]) || {};
      Object.keys(worldNotes).forEach(function (pid) {
        var note = worldNotes[pid];
        if (!note || !note.nameKey) return;
        var plusKeys = note.plus ? Object.keys(note.plus) : [];
        plusKeys.forEach(function () { bump(note.nameKey, 'plusReceived'); });
      });
    });
    Object.keys(relayObj || {}).forEach(function (doorId) {
      var slots = (relayObj && relayObj[doorId] && relayObj[doorId].slots) || {};
      Object.keys(slots).forEach(function (nk) { bump(nk, 'relaySigned'); });
    });
    Object.keys(map).forEach(function (k) {
      map[k].helpValue = map[k].plusReceived + map[k].relaySigned;
    });
    return map;
  }

  // wallObj = { ideaKey: {name, ideaSummary, ts}, ... }, ideaKey = ts + '_' + nameKey (见 feedback.js)
  function aggregateIdeas(wallObj) {
    var map = {};
    Object.keys(wallObj || {}).forEach(function (key) {
      var us = key.indexOf('_');
      var nk = us >= 0 ? key.slice(us + 1) : '';
      if (!nk) return;
      map[nk] = (map[nk] || 0) + 1;
    });
    return map;
  }

  // 把聚合结果叠加到单条榜单条目上, 缺失一律 0(容错)。只加字段, 不改动原字段
  function decorateEntry(entry, helpMap, ideaMap) {
    var nk = nameKey(entry && entry.name);
    var help = (helpMap && helpMap[nk]) || { plusReceived: 0, relaySigned: 0, helpValue: 0 };
    var ideas = (ideaMap && ideaMap[nk]) || 0;
    return Object.assign({}, entry, {
      plusReceived: num(help.plusReceived),
      relaySigned: num(help.relaySigned),
      helpValue: num(help.helpValue),
      ideasAdopted: num(ideas)
    });
  }
  function decorateRows(rows, helpMap, ideaMap) {
    return (rows || []).map(function (r) { return decorateEntry(r, helpMap, ideaMap); });
  }

  /* ---------- CO-17: 分布直方图(纯函数, div 条渲染在 UI 层) ---------- */

  // values 里的数按 [min,max] 均分 bucketCount 桶计数。min===max(全员同值/单人)时退化成 1 桶。
  function histogram(values, bucketCount) {
    bucketCount = (bucketCount > 0) ? Math.floor(bucketCount) : 9;
    var nums = (values || []).map(num).filter(function (v) { return v >= 0; });
    if (!nums.length) return { min: 0, max: 0, bucketCount: 1, counts: [0] };
    var min = Math.min.apply(null, nums), max = Math.max.apply(null, nums);
    if (min === max) return { min: min, max: max, bucketCount: 1, counts: [nums.length] };
    var counts = new Array(bucketCount).fill(0);
    nums.forEach(function (v) {
      var idx = Math.floor((v - min) / (max - min) * bucketCount);
      if (idx >= bucketCount) idx = bucketCount - 1;
      if (idx < 0) idx = 0;
      counts[idx]++;
    });
    return { min: min, max: max, bucketCount: bucketCount, counts: counts };
  }
  // 给定一个值, 落在 histogram() 产出的哪个桶(下标)
  function histogramBucketIndex(hist, value) {
    if (!hist || hist.bucketCount <= 1) return 0;
    value = num(value);
    if (hist.max === hist.min) return 0;
    var idx = Math.floor((value - hist.min) / (hist.max - hist.min) * hist.bucketCount);
    if (idx >= hist.bucketCount) idx = hist.bucketCount - 1;
    if (idx < 0) idx = 0;
    return idx;
  }

  // 我的分数在全体分布里超过了多少比例的人(同分算半个), 单人/空表返回 1(视为"独一档")
  function percentileOf(value, values) {
    var arr = (values || []).map(num);
    var n = arr.length;
    if (n <= 1) return 1;
    value = num(value);
    var below = 0, equal = 0;
    arr.forEach(function (v) {
      if (v < value) below++; else if (v === value) equal++;
    });
    return (below + equal / 2) / n;
  }

  // CO-29: 只给区间, 不给具体名次。5 档, 语气不打击后进生
  var RANK_BANDS = [
    { min: 0.85, key: 'top',       en: 'Leading the pack',        zh: '遥遥领先' },
    { min: 0.60, key: 'aboveMid',  en: 'Above the middle',        zh: '中段偏上' },
    { min: 0.35, key: 'mid',       en: 'Right in the middle',     zh: '中段' },
    { min: 0.12, key: 'catchingUp',en: 'Catching up steadily',    zh: '稳步追赶' },
    { min: 0,    key: 'starting',  en: 'Just getting started',    zh: '刚起步' }
  ];
  function bandFor(pct) {
    pct = (typeof pct === 'number' && isFinite(pct)) ? pct : 0;
    for (var i = 0; i < RANK_BANDS.length; i++) {
      if (pct >= RANK_BANDS[i].min) return RANK_BANDS[i];
    }
    return RANK_BANDS[RANK_BANDS.length - 1];
  }

  // CO-29: 较上次登录的进步幅度。prevScore 为 null/undefined = 从未记录过(首次), 与"上次是 0 分"区分开
  function progressDelta(score, prevScore) {
    score = num(score);
    if (prevScore == null) return { state: 'first', delta: 0 };
    prevScore = num(prevScore);
    var delta = score - prevScore;
    if (delta > 0) return { state: 'up', delta: delta };
    return { state: 'flat', delta: 0 };
  }

  var BADGES = {
    exit0:    { ch: '⏻', cls: 'lb-bd-exit0',  tip: 'EXIT(0) 普通结局' },
    exit1:    { ch: '☠', cls: 'lb-bd-exit1',  tip: 'EXIT(1) 坏结局' },
    'return': { ch: '↩', cls: 'lb-bd-return', tip: 'RETURN 真结局' },
    fork:     { ch: '⑂', cls: 'lb-bd-fork',   tip: 'FORK() 隐藏结局 · 最稀有' }
  };
  function badgeChars(endings) {  // 纯文本版(单测用)
    return normEndings(endings).map(function (e) { return BADGES[e].ch; }).join('');
  }

  var MEDALS = ['█', '▓', '▒'];  // █ ▓ ▒ 前三名

  function fmtMs(ms) {
    ms = num(ms);
    var s = Math.floor(ms / 1000), h = Math.floor(s / 3600),
        m = Math.floor(s % 3600 / 60), ss = s % 60;
    var p = function (n) { return String(n).padStart(2, '0'); };
    return h ? (h + ':' + p(m) + ':' + p(ss)) : (m + ':' + p(ss));
  }

  function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------- SHA-256: WebCrypto 优先, 纯 JS 回退(非 https/file 兜底) ---------- */

  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var s = unescape(encodeURIComponent(str)), a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }

  var _K = null, _H0 = null;
  function initShaConsts() {
    if (_K) return;
    _K = []; _H0 = [];
    var isC = {}, cnt = 0, n, m;
    var frac = function (x) { return ((x - Math.floor(x)) * 0x100000000) | 0; };
    for (n = 2; cnt < 64; n++) {
      if (isC[n]) continue;
      for (m = n * 2; m < 640; m += n) isC[m] = true;
      if (cnt < 8) _H0[cnt] = frac(Math.pow(n, 1 / 2));
      _K[cnt++] = frac(Math.pow(n, 1 / 3));
    }
  }

  function sha256HexSync(str) {
    initShaConsts();
    var bytes = utf8Bytes(str);
    var len = bytes.length;
    var total = Math.ceil((len + 1 + 8) / 64) * 64;
    var buf = new Uint8Array(total);
    buf.set(bytes); buf[len] = 0x80;
    var dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, Math.floor(len / 0x20000000));
    dv.setUint32(total - 4, (len << 3) >>> 0);

    var rr = function (v, r) { return (v >>> r) | (v << (32 - r)); };
    var h = _H0.slice(), w = new Array(64);
    for (var i = 0; i < total; i += 64) {
      var t;
      for (t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
      for (t = 16; t < 64; t++) {
        var s0 = rr(w[t - 15], 7) ^ rr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rr(w[t - 2], 17) ^ rr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (t = 0; t < 64; t++) {
        var S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (hh + S1 + ch + _K[t] + w[t]) >>> 0;
        var S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
        var mj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + mj) >>> 0;
        hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
      h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
    }
    return h.map(function (x) { return x.toString(16).padStart(8, '0'); }).join('');
  }

  function sha256Hex(str) {
    try {
      if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
        return crypto.subtle.digest('SHA-256', utf8Bytes(str)).then(function (buf) {
          return Array.prototype.map.call(new Uint8Array(buf), function (b) {
            return b.toString(16).padStart(2, '0');
          }).join('');
        }).catch(function (e) {
          console.warn('[LB] WebCrypto 失败, 用 JS 回退', e);
          return sha256HexSync(str);
        });
      }
    } catch (e) { console.warn('[LB] WebCrypto 不可用, 用 JS 回退', e); }
    return Promise.resolve(sha256HexSync(str));
  }

  /* ================= 网络层 (fail-silent + console.warn) ================= */

  function fetchJson(url, opts) {
    return fetch(url, Object.assign({ cache: 'no-store' }, opts || {})).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
      return r.json();
    });
  }
  function putJson(url, data) {
    return fetchJson(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }

  /* ================= 登录态 ================= */

  var auth = null;   // {name, key, pw(hash)}

  function loadAuth() {
    if (typeof localStorage === 'undefined') return;
    try {
      var a = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (a && a.name && a.pw) {
        var k = nameKey(a.name);
        if (k) auth = { name: String(a.name).slice(0, 16), key: k, pw: a.pw };
      }
    } catch (e) { /* 存档坏了当没登录 */ }
  }
  function saveAuth() {
    if (typeof localStorage === 'undefined') return;
    try {
      if (auth) localStorage.setItem(LS_KEY, JSON.stringify({ name: auth.name, pw: auth.pw }));
      else localStorage.removeItem(LS_KEY);
    } catch (e) { /* 隐私模式等, 只影响"记住我" */ }
  }

  // 名字+密码登录; 名字不存在则注册。resolve({ok, fresh?, msg?})
  function login(name, pwPlain) {
    name = String(name || '').trim().slice(0, 16);
    var key = nameKey(name);
    if (!key) return Promise.resolve({ ok: false, msg: '代号不能为空' });
    if (!pwPlain) return Promise.resolve({ ok: false, msg: '密码不能为空' });
    return sha256Hex(pwPlain + SALT).then(function (hash) {
      return fetchJson(DB + NS + '/users/' + encodeURIComponent(key) + '.json').then(function (user) {
        if (user == null) {  // 首次即注册
          return putJson(DB + NS + '/users/' + encodeURIComponent(key) + '.json',
            { name: name, pw: hash, created: Date.now() })
            .then(function () {
              auth = { name: name, key: key, pw: hash }; saveAuth();
              return { ok: true, fresh: true };
            })
            .catch(function (e) {
              console.warn('[LB] 注册失败', e);
              return { ok: false, msg: '注册失败(网络问题?), 稍后再试' };
            });
        }
        if (user.pw === hash) {
          auth = { name: user.name || name, key: key, pw: hash }; saveAuth();
          return { ok: true, fresh: false };
        }
        return { ok: false, msg: '密码不对, 该名字已被占用' };
      }).catch(function (e) {
        console.warn('[LB] 查询用户失败', e);
        return { ok: false, msg: '连不上排行榜服务器, 稍后再试' };
      });
    });
  }

  function logout() {
    auth = null; pending = null; sessionBaseline = null; saveAuth();
    if (ui) { renderHead(); renderBody(); }
  }

  /* ================= 上报 (debounce + 断网排队) ================= */

  var getStats = null;
  var pending = null;        // 最多存一条最新待传条目
  var lastUpload = 0;
  var flushTimer = null, retryTimer = null;

  // CO-29: 本次登录会话的"起点快照"——只在 captureBaseline() 时设一次, 之后整个会话冻结不变,
  // 用来算"较上次登录的增量"。null = 还没抓到基线(还没登录, 或抓取失败/首次玩家没有旧条目)。
  var sessionBaseline = null;   // {prevScore, lastSeen} | null

  // 登录成功后、report() 之前调用: 去抓"这次覆盖之前"的旧条目当基线。
  // fail-silent: 查不到(新玩家)或网络失败, 都退化为 {prevScore:null, lastSeen:null}(= "首次记录"文案),
  // 不阻塞后续 report() 流程。
  function captureBaseline() {
    if (!auth) { sessionBaseline = null; return Promise.resolve(); }
    return fetchJson(DB + NS + '/board/' + encodeURIComponent(auth.key) + '.json').then(function (prior) {
      sessionBaseline = prior
        ? { prevScore: num(prior.score), lastSeen: num(prior.ts) || null }
        : { prevScore: null, lastSeen: null };
    }).catch(function (e) {
      console.warn('[LB] 抓取基线失败, 进步卡按"首次记录"展示', e);
      sessionBaseline = { prevScore: null, lastSeen: null };
    });
  }

  function buildEntry(s) {
    s = s || {};
    var base = sessionBaseline || { prevScore: null, lastSeen: null };
    return {
      name: auth.name,
      score: computeScore(s),
      main: num(s.main), mainTotal: num(s.mainTotal),
      dex: num(s.dex), dexTotal: num(s.dexTotal),
      side: num(s.side), hidden: num(s.hidden),
      endings: normEndings(s.endings),
      playMs: num(s.playMs),
      world: (s.world === 'a2') ? 'a2' : 'as',
      ts: Date.now(),
      prevScore: base.prevScore,   // CO-29: 本会话开始时的分数快照(null = 首次), 供"进步幅度"用
      lastSeen: base.lastSeen      // CO-29: 上一次上报的时间戳(null = 首次)
    };
  }

  function report() {
    if (!auth || !getStats) return;
    var s;
    try { s = getStats(); } catch (e) { console.warn('[LB] getStats 抛异常', e); return; }
    if (!s) return;
    pending = buildEntry(s);   // 覆盖旧待传条目, 永远只留最新
    scheduleFlush();
  }

  function scheduleFlush() {
    if (flushTimer || !pending) return;
    var wait = Math.max(0, lastUpload + REPORT_MIN_MS - Date.now());
    flushTimer = setTimeout(flush, wait);
  }

  function flush() {
    flushTimer = null;
    if (!pending || !auth) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // 断网: 挂到 online 事件再试
      if (HAS_DOM) window.addEventListener('online', scheduleFlush, { once: true });
      else retryLater();
      return;
    }
    var entry = pending;
    lastUpload = Date.now();
    putJson(DB + NS + '/board/' + encodeURIComponent(auth.key) + '.json', entry)
      .then(function () {
        if (pending === entry) pending = null;   // 期间没有更新的新条目才清
      })
      .catch(function (e) {
        console.warn('[LB] 上传失败, ' + (RETRY_MS / 1000) + 's 后重试', e);
        retryLater();
      });
  }
  function retryLater() {
    if (retryTimer) return;
    retryTimer = setTimeout(function () { retryTimer = null; scheduleFlush(); }, RETRY_MS);
  }

  /* ================= 面板 UI (DOM 自建自管, 类名前缀 lb-) ================= */

  var CSS = [
    '#lb-root{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;',
    '  background:rgba(2,5,3,.62);font-family:"Courier New",monospace}',
    '#lb-root.lb-on{display:flex}',
    '.lb-panel{width:min(780px,95vw);height:min(570px,92vh);display:flex;flex-direction:column;',
    '  background:rgba(4,9,6,.97);border:1px solid #2f6f2f;border-radius:6px;color:#bfeebf;',
    '  font-size:13px;line-height:1.6;box-shadow:0 0 34px rgba(40,120,60,.3)}',
    '.lb-head{display:flex;justify-content:space-between;align-items:center;gap:8px;',
    '  padding:9px 14px;border-bottom:1px solid #2f6f2f}',
    '.lb-title{color:#9fee9f;letter-spacing:2px;font-size:14px}',
    '.lb-headr{display:flex;align-items:center;gap:8px}',
    '.lb-who{color:#ffce3a;font-size:12px}',
    '.lb-btn{background:#0a1f0a;color:#7CFC00;border:1px solid #2f6f2f;padding:4px 12px;',
    '  font-family:inherit;font-size:12px;cursor:pointer;letter-spacing:1px;border-radius:2px}',
    '.lb-btn:hover{background:#123312;box-shadow:0 0 10px #2b6}',
    '.lb-btn:disabled{opacity:.5;cursor:default}',
    '.lb-login{padding:26px 34px;display:flex;flex-direction:column;gap:10px;max-width:420px;margin:20px auto 0}',
    '.lb-login-t{color:#9fee9f;letter-spacing:2px;text-align:center;margin-bottom:6px}',
    '.lb-in{background:#060d06;color:#aef0ae;border:1px solid #2f6f2f;padding:7px 10px;',
    '  font-family:inherit;font-size:14px;outline:none;border-radius:2px}',
    '.lb-in:focus{border-color:#7CFC00;box-shadow:0 0 8px rgba(43,102,43,.6)}',
    '.lb-err{color:#ff8080;font-size:12px;min-height:18px;text-align:center}',
    '.lb-fine{color:#4a7a4a;font-size:11px;line-height:1.5;border-top:1px dashed #1f3f1f;padding-top:8px}',
    '.lb-tabs{display:flex;gap:4px;padding:8px 14px 0;border-bottom:1px solid #1f3f1f}',
    '.lb-tab{background:none;border:1px solid #1f3f1f;border-bottom:none;color:#5a8a5a;',
    '  padding:5px 14px;font-family:inherit;font-size:12.5px;cursor:pointer;letter-spacing:2px;',
    '  border-radius:4px 4px 0 0}',
    '.lb-tab:hover{color:#9fee9f}',
    '.lb-tab.lb-cur{background:rgba(20,50,20,.55);color:#7CFC00;border-color:#2f6f2f}',
    '.lb-body{flex:1;overflow-y:auto;padding:6px 14px}',
    '.lb-table{width:100%;border-collapse:collapse;font-size:12.5px}',
    '.lb-table th{color:#5a8a5a;font-size:11px;letter-spacing:2px;text-align:left;',
    '  border-bottom:1px dashed #1f3f1f;padding:4px 8px;font-weight:normal}',
    '.lb-table td{padding:4px 8px;border-bottom:1px solid rgba(31,63,31,.35);color:#bfeebf;white-space:nowrap}',
    '.lb-table td.lb-num{text-align:right;color:#9fee9f}',
    '.lb-rank{color:#5a8a5a;width:34px}',
    '.lb-medal-0{color:#ffd75e;text-shadow:0 0 8px rgba(255,206,58,.8)}',
    '.lb-medal-1{color:#cfd8cf}',
    '.lb-medal-2{color:#cd8a4a}',
    'tr.lb-me td{background:rgba(60,110,40,.28)}',
    'tr.lb-me td:first-child{box-shadow:inset 2px 0 0 #7CFC00}',
    '.lb-name{color:#dff5df}',
    '.lb-bd{margin-left:5px;font-size:13px;cursor:help}',
    '.lb-bd-exit0{color:#9fee9f}',
    '.lb-bd-exit1{color:#ff8080}',
    '.lb-bd-return{color:#7CFC00;text-shadow:0 0 6px rgba(124,252,0,.7)}',
    '.lb-bd-fork{color:#ffce3a;text-shadow:0 0 8px rgba(255,206,58,.9)}',
    '.lb-world{border:1px solid #2f6f2f;padding:0 5px;font-size:10px;color:#7aa87a;border-radius:2px}',
    '.lb-world-a2{color:#ffce3a;border-color:#c9a24a}',
    '.lb-star{color:#ffce3a}',
    '.lb-empty{color:#4a7a4a;text-align:center;padding:36px 0;letter-spacing:1px}',
    '.lb-foot{display:flex;align-items:center;gap:12px;padding:8px 14px;border-top:1px solid #2f6f2f}',
    '.lb-status{color:#5a8a5a;font-size:11px;flex:1}',
    '.lb-hint{color:#3f6a3f;font-size:11px}',
    /* ---- CO-29 我的进步卡 ---- */
    '.lb-prog{padding:16px 20px;display:flex;flex-direction:column;gap:11px}',
    '.lb-prog-score{font-size:36px;color:#eafff0;text-shadow:0 0 12px rgba(124,252,0,.35);line-height:1.1}',
    '.lb-prog-score-u{font-size:13px;color:#5a8a5a;margin-left:7px;letter-spacing:1px}',
    '.lb-prog-delta{font-size:13px;color:#9fee9f}',
    '.lb-prog-delta.lb-prog-up{color:#aef8ae}',
    '.lb-prog-arrow{color:#7CFC00;text-shadow:0 0 6px rgba(124,252,0,.7)}',
    '.lb-prog-medal{font-size:13px;color:#ffd75e}',
    '.lb-prog-band{font-size:13px;color:#bfeebf}',
    '.lb-prog-row{font-size:12.5px;color:#bfeebf;display:flex;gap:9px;align-items:baseline}',
    '.lb-prog-k{color:#5a8a5a;min-width:64px;flex-shrink:0}',
    '.lb-prog-help{color:#9fee9f;line-height:1.6}',
    '.lb-dim{color:#4a7a4a}',
    '.lb-prog-goboard{align-self:flex-start;margin-top:6px}',
    /* ---- CO-17 分布直方图 ---- */
    '.lb-hist-title{color:#9fee9f;font-size:11.5px;letter-spacing:1.5px;margin:2px 0 12px;text-align:center}',
    '.lb-hist{display:flex;align-items:flex-end;gap:5px;height:118px;padding:0 4px;',
    '  border-bottom:1px dashed #1f3f1f}',
    '.lb-hist-col{flex:1;display:flex;flex-direction:column;align-items:center;',
    '  justify-content:flex-end;height:100%;position:relative;min-width:0}',
    '.lb-hist-bar{width:100%;background:#234a23;border:1px solid #2f6f2f;',
    '  border-radius:2px 2px 0 0;min-height:3px}',
    '.lb-hist-col.lb-hist-me .lb-hist-bar{background:#3d8f2c;border-color:#7CFC00;',
    '  box-shadow:0 0 10px rgba(124,252,0,.6)}',
    '.lb-hist-tag{position:absolute;top:-15px;font-size:9px;color:#7CFC00;white-space:nowrap}',
    '.lb-hist-n{font-size:9.5px;color:#4a7a4a;margin-top:3px}',
    '.lb-hist-me-line{font-size:12px;color:#7CFC00;margin:8px 0 4px;text-align:center}',
    '.lb-hist-rank{color:#9fee9f;margin-right:5px}',
    '.lb-detail-toggle{display:block;margin:10px auto 8px}',
    '.lb-detail{margin-top:4px}'
  ].join('\n');

  // CO-29: "我的进步"是第一个 tab, 打开面板默认落在这里而不是名次表
  var TABS = [
    { id: 'progress', label: '我的进步' },
    { id: 'comp',  label: '综合' },
    { id: 'main',  label: '主线' },
    { id: 'dex',   label: '图鉴' },
    { id: 'expl',  label: '探索' },
    { id: 'help',  label: '互助' },
    { id: 'speed', label: '速通' }
  ];

  var ui = null;          // {root, body, tabsEl, ...}
  var curTab = 'progress';
  var lastRows = null;    // 上次拉到的榜单缓存(已叠加互助值/点子采纳, 见 refresh())
  var lastHelpMap = {};   // nameKey -> {plusReceived, relaySigned, helpValue}, 见 aggregateHelp
  var lastIdeaMap = {};   // nameKey -> ideasAdopted 次数, 见 aggregateIdeas
  var detailOpenTabs = {}; // CO-17: 各榜"详情"(绝对名次表)展开状态, tabId -> bool, 默认收起
  var refreshTimer = null;
  var opts = { hotkey: true, onOpen: null, onClose: null };

  function isMe(r) { return !!(auth && r && nameKey(r.name) === auth.key); }

  // 每个榜(除"我的进步")的直方图/排序配置——CO-17 直方图扩展到全部五(+互助=六)榜
  var BOARD_CFG = {
    comp:  { sortFn: sortComp,    metric: function (r) { return num(r.score); },
             label: { en: 'Overall score distribution', zh: '综合分分布' } },
    main:  { sortFn: sortMain,    metric: function (r) { return num(r.main); },
             label: { en: 'Main quest progress distribution', zh: '主线进度分布' } },
    dex:   { sortFn: sortDex,     metric: function (r) { return num(r.dex); },
             label: { en: 'Codex collection distribution', zh: '图鉴收集分布' } },
    expl:  { sortFn: sortExplore, metric: function (r) { return num(r.side) + num(r.hidden); },
             label: { en: 'Exploration distribution', zh: '探索度分布' } },
    help:  { sortFn: sortHelp,    metric: function (r) { return num(r.helpValue) + num(r.ideasAdopted); },
             label: { en: 'Mutual-aid distribution', zh: '互助值分布' } },
    speed: { sortFn: sortSpeed,   metric: function (r) { return num(r.playMs); },
             label: { en: 'Speedrun time distribution', zh: '速通用时分布' } }
  };

  function h(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function buildUI() {
    if (ui || !HAS_DOM) return;
    var style = document.createElement('style');
    style.id = 'lb-style';
    style.textContent = CSS;
    document.head.appendChild(style);

    var root = h(
      '<div id="lb-root">' +
      ' <div class="lb-panel">' +
      '  <div class="lb-head">' +
      '   <span class="lb-title">◤ NET://RANKINGS ◢ 排行榜</span>' +
      '   <span class="lb-headr">' +
      '    <span class="lb-who"></span>' +
      '    <button class="lb-btn lb-logout" style="display:none">登出</button>' +
      '    <button class="lb-btn lb-close">✕</button>' +
      '   </span>' +
      '  </div>' +
      '  <div class="lb-tabs" style="display:none"></div>' +
      '  <div class="lb-body"></div>' +
      '  <div class="lb-foot">' +
      '   <button class="lb-btn lb-refresh">↻ 刷新</button>' +
      '   <span class="lb-status"></span>' +
      '   <span class="lb-hint">L / Esc 关闭 · 面板开着时每 30s 自动刷新</span>' +
      '  </div>' +
      ' </div>' +
      '</div>');
    document.body.appendChild(root);

    ui = {
      root: root,
      tabsEl: root.querySelector('.lb-tabs'),
      body: root.querySelector('.lb-body'),
      who: root.querySelector('.lb-who'),
      logoutBtn: root.querySelector('.lb-logout'),
      status: root.querySelector('.lb-status')
    };

    TABS.forEach(function (t) {
      var b = h('<button class="lb-tab" data-tab="' + t.id + '">' + t.label + '</button>');
      b.addEventListener('click', function () { curTab = t.id; renderBody(); });
      ui.tabsEl.appendChild(b);
    });

    root.querySelector('.lb-close').addEventListener('click', close);
    root.querySelector('.lb-refresh').addEventListener('click', refresh);
    ui.logoutBtn.addEventListener('click', logout);
    root.addEventListener('click', function (e) { if (e.target === root) close(); });

    renderHead(); renderBody();
  }

  function setStatus(msg) { if (ui) ui.status.textContent = msg || ''; }

  function renderHead() {
    if (!ui) return;
    ui.who.textContent = auth ? ('● ' + auth.name) : '';
    ui.logoutBtn.style.display = auth ? '' : 'none';
    ui.tabsEl.style.display = auth ? 'flex' : 'none';
  }

  /* ---------- 登录表单 ---------- */
  function renderLogin(errMsg) {
    ui.body.innerHTML = '';
    var box = h(
      '<div class="lb-login">' +
      ' <div class="lb-login-t">接入排行榜网络 — 首次提交即自动注册</div>' +
      ' <input class="lb-in lb-in-name" maxlength="16" placeholder="代号 (≤16字)" autocomplete="off">' +
      ' <input class="lb-in lb-in-pw" type="password" placeholder="密码" autocomplete="off">' +
      ' <button class="lb-btn lb-go">接入 ▶</button>' +
      ' <div class="lb-err"></div>' +
      ' <div class="lb-fine">⚠ 测试模式数据库，无真实鉴权：' +
      '密码只用于防同学冒名，不是安全边界。' +
      '<b>请勿使用常用密码。</b></div>' +
      '</div>');
    ui.body.appendChild(box);
    var nameIn = box.querySelector('.lb-in-name'),
        pwIn = box.querySelector('.lb-in-pw'),
        go = box.querySelector('.lb-go'),
        err = box.querySelector('.lb-err');
    if (errMsg) err.textContent = errMsg;

    function submit() {
      err.textContent = ''; go.disabled = true; go.textContent = '接入中…';
      login(nameIn.value, pwIn.value).then(function (r) {
        go.disabled = false; go.textContent = '接入 ▶';
        if (r.ok) {
          renderHead(); renderBody(); refresh();
          setStatus(r.fresh ? ('欢迎新玩家，' + auth.name + '！') : ('欢迎回来，' + auth.name));
          // CO-29: 先抓"这次覆盖之前"的旧分数当基线, 再上报, 否则进步幅度无从算起
          captureBaseline().then(report);
        } else {
          err.textContent = r.msg || '登录失败';
        }
      });
    }
    go.addEventListener('click', submit);
    pwIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    nameIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') pwIn.focus(); });
    setTimeout(function () { nameIn.focus(); }, 30);
  }

  /* ---------- 榜单渲染 ---------- */

  function badgeHtml(endings) {
    return normEndings(endings).map(function (e) {
      var b = BADGES[e];
      return '<span class="lb-bd ' + b.cls + '" title="' + b.tip + '">' + b.ch + '</span>';
    }).join('');
  }

  function nameCell(row, rank) {
    var medal = rank < 3 ? '<span class="lb-medal-' + rank + '">' + MEDALS[rank] + '</span> ' : '';
    return medal + '<span class="lb-name">' + esc(row.name) + '</span>' + badgeHtml(row.endings);
  }

  function rowTr(r, i, cells) {
    return '<tr class="' + (isMe(r) ? 'lb-me' : '') + '">' +
      '<td class="lb-rank">' + (i + 1) + '</td>' +
      '<td>' + nameCell(r, i) + '</td>' + cells + '</tr>';
  }

  // 把自己"待上传"的最新条目叠进榜单(还没传上去也先看到), 顺带补上互助/点子的聚合字段
  function mergedRows() {
    var rows = (lastRows || []).slice();
    if (auth && pending) {
      var decorated = decorateEntry(pending, lastHelpMap, lastIdeaMap);
      var i = rows.findIndex(function (r) { return nameKey(r.name) === auth.key; });
      if (i >= 0) rows[i] = decorated; else rows.push(decorated);
    }
    return rows;
  }

  // 绝对名次表(CO-17: 现在收进各榜的「详情」折叠区, 保留原实现不改列)
  function tableHtml(tabId, sorted) {
    if (tabId === 'comp') {
      return '<table class="lb-table"><tr><th>#</th><th>玩家</th><th>SCORE</th><th>主线</th><th>图鉴</th><th>探索</th></tr>' +
        sorted.map(function (r, i) {
          return rowTr(r, i,
            '<td class="lb-num"><b>' + num(r.score) + '</b></td>' +
            '<td class="lb-num">' + num(r.main) + '/' + num(r.mainTotal) + '</td>' +
            '<td class="lb-num">' + num(r.dex) + '/' + num(r.dexTotal) + '</td>' +
            '<td class="lb-num">' + (num(r.side) + num(r.hidden)) + '</td>');
        }).join('') + '</table>';
    }
    if (tabId === 'main') {
      return '<table class="lb-table"><tr><th>#</th><th>玩家</th><th>主线进度</th><th>当前世界</th></tr>' +
        sorted.map(function (r, i) {
          var w = (r.world === 'a2')
            ? '<span class="lb-world lb-world-a2">A2</span>'
            : '<span class="lb-world">AS</span>';
          return rowTr(r, i,
            '<td class="lb-num">' + num(r.main) + ' / ' + num(r.mainTotal) + '</td>' +
            '<td>' + w + '</td>');
        }).join('') + '</table>';
    }
    if (tabId === 'dex') {
      return '<table class="lb-table"><tr><th>#</th><th>玩家</th><th>9618 大纲图鉴</th><th>收集率</th></tr>' +
        sorted.map(function (r, i) {
          var pct = num(r.dexTotal) ? Math.round(num(r.dex) / num(r.dexTotal) * 100) : 0;
          return rowTr(r, i,
            '<td class="lb-num">' + num(r.dex) + ' / ' + num(r.dexTotal) + '</td>' +
            '<td class="lb-num">' + pct + '%</td>');
        }).join('') + '</table>';
    }
    if (tabId === 'expl') {
      return '<table class="lb-table"><tr><th>#</th><th>玩家</th><th>支线</th><th>隐藏任务</th><th>合计</th></tr>' +
        sorted.map(function (r, i) {
          var star = num(r.hidden) ? ' <span class="lb-star">' + '★'.repeat(Math.min(5, num(r.hidden))) + '</span>' : '';
          return rowTr(r, i,
            '<td class="lb-num">' + num(r.side) + '</td>' +
            '<td class="lb-num">' + num(r.hidden) + star + '</td>' +
            '<td class="lb-num">' + (num(r.side) + num(r.hidden)) + '</td>');
        }).join('') + '</table>';
    }
    if (tabId === 'help') {  // CO-30: 互助值 = 留言获赞 + 接力签名; 另列点子采纳
      return '<table class="lb-table"><tr><th>#</th><th>玩家</th><th>互助值</th><th>留言获赞</th><th>接力签名</th><th>点子采纳</th></tr>' +
        sorted.map(function (r, i) {
          return rowTr(r, i,
            '<td class="lb-num"><b>' + (num(r.helpValue) + num(r.ideasAdopted)) + '</b></td>' +
            '<td class="lb-num">' + num(r.plusReceived) + '</td>' +
            '<td class="lb-num">' + num(r.relaySigned) + '</td>' +
            '<td class="lb-num">' + num(r.ideasAdopted) + '</td>');
        }).join('') + '</table>';
    }
    // speed
    return '<table class="lb-table"><tr><th>#</th><th>玩家</th><th>用时</th><th>结局</th></tr>' +
      sorted.map(function (r, i) {
        return rowTr(r, i,
          '<td class="lb-num">' + fmtMs(r.playMs) + '</td>' +
          '<td>' + badgeHtml(r.endings) + '</td>');
      }).join('') + '</table>';
  }

  // CO-17: 直方图条形(纯 div, 无 canvas 依赖), myBucket<0 = 我不在这个桶分布里(还没有数据)
  function histogramHtml(hist, myBucket) {
    var maxCount = Math.max.apply(null, hist.counts.concat([1]));
    return '<div class="lb-hist">' + hist.counts.map(function (c, i) {
      var pct = maxCount ? Math.round(c / maxCount * 100) : 0;
      var barPct = c > 0 ? Math.max(pct, 6) : 2;
      var mine = (i === myBucket);
      return '<div class="lb-hist-col' + (mine ? ' lb-hist-me' : '') + '">' +
        (mine ? '<div class="lb-hist-tag">' + esc(tx('you', '你')) + '</div>' : '') +
        '<div class="lb-hist-bar" style="height:' + barPct + '%"></div>' +
        '<div class="lb-hist-n">' + c + '</div>' +
        '</div>';
    }).join('') + '</div>';
  }

  /* ---------- CO-29: 「我的进步」默认首屏 ---------- */
  function renderProgressCard() {
    var rows = mergedRows();
    var mine = rows.filter(isMe)[0];
    if (!mine) {
      ui.body.innerHTML = '<div class="lb-empty">' + esc(tx('Syncing your progress…', '正在同步你的进度…')) + '</div>';
      return;
    }

    var compSorted = sortComp(rows);
    var compScores = compSorted.map(function (r) { return num(r.score); });
    var pct = percentileOf(mine.score, compScores);
    var band = bandFor(pct);
    var pd = progressDelta(mine.score, mine.prevScore);

    var deltaText;
    if (pd.state === 'up') {
      deltaText = tx('+' + pd.delta + ' since last visit. The machine remembers your work.',
                     '比上次来时多了 ' + pd.delta + '。这台机器记得你做过的事。');
    } else if (pd.state === 'flat') {
      deltaText = tx('No change since last visit yet — the next step is still open.',
                     '比上次来时还没有变化——下一步还等着你。');
    } else {
      deltaText = tx('First time on record. The machine starts watching now.',
                     '这是你第一次留下记录。这台机器从现在开始记住你做的每一步。');
    }

    // CO-30: 前三名奖牌保留(头部激励), 但不对非前十玩家报具体名次——进步卡里干脆完全不提名次数字
    var myIdxComp = compSorted.findIndex(isMe);
    var medalHtml = '';
    if (myIdxComp >= 0 && myIdxComp < 3) {
      medalHtml = '<div class="lb-prog-medal"><span class="lb-medal-' + myIdxComp + '">' + MEDALS[myIdxComp] + '</span> ' +
        esc(tx('You are in the overall top 3!', '你目前排名综合榜前三!')) + '</div>';
    }

    var endingsHtml = normEndings(mine.endings).length
      ? badgeHtml(mine.endings)
      : ('<span class="lb-dim">' + esc(tx('No endings unlocked yet — keep exploring.', '还没有解锁结局——继续探索吧')) + '</span>');

    var help = num(mine.helpValue), plusR = num(mine.plusReceived), relayS = num(mine.relaySigned), ideas = num(mine.ideasAdopted);
    var helpText = (help + ideas) > 0
      ? tx('Mutual aid ' + help + ' (notes liked ' + plusR + '× + relay doors signed ' + relayS + '×) · Ideas adopted ' + ideas,
           '互助值 ' + help + '(留言被点赞 ' + plusR + ' 次 + 签下接力门 ' + relayS + ' 次) · 点子采纳 ' + ideas)
      : tx('No mutual-aid record yet — try liking a classmate’s note, or signing a relay door.',
           '还没有互助记录——去给同学的留言点个赞，或者签下一扇接力门试试');

    ui.body.innerHTML =
      '<div class="lb-prog">' +
      '<div class="lb-prog-score">' + num(mine.score) + '<span class="lb-prog-score-u">' + esc(tx('pts', '分')) + '</span></div>' +
      '<div class="lb-prog-delta' + (pd.state === 'up' ? ' lb-prog-up' : '') + '">' +
        (pd.state === 'up' ? '<span class="lb-prog-arrow">↑</span> ' : '') + esc(deltaText) + '</div>' +
      medalHtml +
      '<div class="lb-prog-band">' + esc(tx('Your standing in the class distribution: ', '你目前在班级分布中: ')) +
        '<b>' + esc(tx(band.en, band.zh)) + '</b></div>' +
      '<div class="lb-prog-row"><span class="lb-prog-k">' + esc(tx('Endings', '结局徽章')) + '</span>' + endingsHtml + '</div>' +
      '<div class="lb-prog-row lb-prog-help">' + esc(helpText) + '</div>' +
      '<button class="lb-btn lb-prog-goboard">' + esc(tx('See the full distribution →', '查看完整分布 →')) + '</button>' +
      '</div>';

    var goBtn = ui.body.querySelector('.lb-prog-goboard');
    if (goBtn) goBtn.addEventListener('click', function () { curTab = 'comp'; renderBody(); });
  }

  /* ---------- CO-17: 各榜默认展示直方图, 绝对名次收进「详情」 ---------- */
  function renderBoardTab(tabId) {
    var cfg = BOARD_CFG[tabId];
    var rows = mergedRows();
    var sorted = cfg.sortFn(rows);

    var empty = (tabId === 'speed')
      ? tx('No one has reached RETURN / FORK() yet — the speedrun board is wide open.', '还没有人达成 RETURN / FORK() 结局 — 速通榜等你开荒')
      : tx('No data yet — complete quests to appear here.', '暂无数据 — 完成任务后自动上榜');

    if (!sorted.length) {
      ui.body.innerHTML = '<div class="lb-empty">' + esc(empty) + '</div>';
      return;
    }

    var myIdx = sorted.findIndex(isMe);
    var values = sorted.map(cfg.metric);
    var hist = histogram(values, values.length > 30 ? 10 : 8);
    var myBucket = myIdx >= 0 ? histogramBucketIndex(hist, cfg.metric(sorted[myIdx])) : -1;

    // CO-30: 前三名奖牌可见; 前十给个小名次标; 十名以外(含未上榜)一律只说"你在这里", 不报数字
    var rankBadge = '';
    if (myIdx === 0 || myIdx === 1 || myIdx === 2) {
      rankBadge = '<span class="lb-medal-' + myIdx + '">' + MEDALS[myIdx] + '</span> ';
    } else if (myIdx >= 3 && myIdx < 10) {
      rankBadge = '<span class="lb-hist-rank">#' + (myIdx + 1) + '</span> ';
    }
    var meLine = (myIdx >= 0)
      ? ('<div class="lb-hist-me-line">' + rankBadge + esc(tx('You are here', '你在这里')) + '</div>')
      : ('<div class="lb-hist-me-line lb-dim">' + esc(tx('You have no entry on this board yet.', '你在这个榜上还没有数据')) + '</div>');

    var detailOpen = !!detailOpenTabs[tabId];
    var toggleLabel = detailOpen
      ? tx('Hide full ranking ▲', '收起完整名次 ▲')
      : tx('Full ranking (opt-in) ▸', '详情：完整名次表 ▸');

    ui.body.innerHTML =
      '<div class="lb-hist-title">' + esc(tx(cfg.label.en, cfg.label.zh)) + '</div>' +
      histogramHtml(hist, myBucket) +
      meLine +
      '<button class="lb-btn lb-detail-toggle" data-tab="' + tabId + '">' + esc(toggleLabel) + '</button>' +
      (detailOpen ? '<div class="lb-detail">' + tableHtml(tabId, sorted) + '</div>' : '');

    var toggleBtn = ui.body.querySelector('.lb-detail-toggle');
    if (toggleBtn) toggleBtn.addEventListener('click', function () {
      detailOpenTabs[tabId] = !detailOpenTabs[tabId];
      renderBoardTab(tabId);
    });
  }

  function renderBody() {
    if (!ui) return;
    if (!auth) { renderLogin(); return; }

    ui.tabsEl.querySelectorAll('.lb-tab').forEach(function (b) {
      b.classList.toggle('lb-cur', b.dataset.tab === curTab);
    });

    if (curTab === 'progress') { renderProgressCard(); return; }
    renderBoardTab(curTab);
  }

  /* ---------- 拉榜 ---------- */

  var refreshing = false;
  function refresh() {
    if (!HAS_DOM || refreshing) return;
    refreshing = true;
    setStatus('同步中…');
    fetchJson(DB + NS + '/board.json').then(function (obj) {
      var rawRows = obj ? Object.keys(obj).map(function (k) { return obj[k]; })
        .filter(function (e) { return e && e.name; }) : [];
      // CO-30: 互助值(留言 +1 / 接力签名)+ 点子采纳是补充维度, 三张表各自容错——
      // 任何一张拉不到都只影响对应维度显示 0, 不连累主榜(board)本身的展示
      return Promise.all([
        fetchJson(DB + NS + '/notes.json').catch(function (e) {
          console.warn('[LB] notes 拉取失败, 互助值(留言部分)按 0 显示', e); return null;
        }),
        fetchJson(DB + NS + '/relay.json').catch(function (e) {
          console.warn('[LB] relay 拉取失败, 互助值(接力部分)按 0 显示', e); return null;
        }),
        fetchJson(DB + NS + '/wall.json').catch(function (e) {
          console.warn('[LB] wall 拉取失败, 点子采纳按 0 显示', e); return null;
        })
      ]).then(function (res) {
        lastHelpMap = aggregateHelp(res[0] || {}, res[1] || {});
        lastIdeaMap = aggregateIdeas(res[2] || {});
        lastRows = decorateRows(rawRows, lastHelpMap, lastIdeaMap);
      });
    }).then(function () {
      renderBody();
      setStatus('已更新 ' + new Date().toLocaleTimeString());
    }).catch(function (e) {
      console.warn('[LB] 拉榜失败', e);
      setStatus('网络不通，显示缓存');
      renderBody();
    }).finally(function () { refreshing = false; });
  }

  /* ---------- 开关 ---------- */

  function isOpen() { return !!(ui && ui.root.classList.contains('lb-on')); }

  function open() {
    if (!HAS_DOM) return;
    buildUI();
    if (isOpen()) return;
    ui.root.classList.add('lb-on');
    renderHead(); renderBody();
    if (auth) refresh();
    if (!refreshTimer) refreshTimer = setInterval(function () {
      if (isOpen() && auth) refresh();
    }, AUTO_REFRESH_MS);
    if (typeof opts.onOpen === 'function') { try { opts.onOpen(); } catch (e) {} }
  }

  function close() {
    if (!isOpen()) return;
    ui.root.classList.remove('lb-on');
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (document.activeElement && ui.root.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    if (typeof opts.onClose === 'function') { try { opts.onClose(); } catch (e) {} }
  }

  /* ---------- L 键: 引擎按键系统之外的 document 级监听 ----------
     capture 阶段注册, 排行榜面板打开时吞掉按键, 不让游戏引擎响应
     (整合 agent 可改为接入引擎 mode 状态机, 见 leaderboard_integration.md) */

  function engineBusy() {
    // 有其他面板 / 开场遮罩显示时不抢 L 键
    var els = document.querySelectorAll('.panel,.overlay,dialog[open]');
    for (var i = 0; i < els.length; i++) {
      if (els[i].closest && els[i].closest('#lb-root')) continue;
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
      if (k === 'escape' || (k === 'l' && !typing)) {
        e.preventDefault(); e.stopPropagation(); close(); return;
      }
      // 面板打开期间把面板内输入拦在引擎外(引擎在 window 冒泡阶段监听)
      if (ui && ui.root.contains(t)) e.stopPropagation();
      return;
    }
    if (!opts.hotkey) return;
    if (k !== 'l' || e.repeat || typing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (engineBusy()) return;
    e.preventDefault(); e.stopPropagation();
    open();
  }

  /* ---------- init ---------- */

  var inited = false;
  function init(statsCb, options) {
    getStats = statsCb || null;
    if (options) {
      if ('hotkey' in options) opts.hotkey = !!options.hotkey;
      if (options.onOpen) opts.onOpen = options.onOpen;
      if (options.onClose) opts.onClose = options.onClose;
    }
    if (inited) return;
    inited = true;
    loadAuth();
    if (HAS_DOM) {
      window.addEventListener('keydown', onKeydown, true);   // capture, 先于引擎
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildUI, { once: true });
      } else buildUI();
    }
  }

  /* ================= 导出 ================= */

  G.LEADERBOARD = {
    init: init,
    open: open,
    close: close,
    isOpen: isOpen,
    report: report,
    logout: logout,
    _test: {
      num: num,
      nameKey: nameKey,
      normEndings: normEndings,
      computeScore: computeScore,
      sortComp: sortComp,
      sortMain: sortMain,
      sortDex: sortDex,
      sortExplore: sortExplore,
      sortSpeed: sortSpeed,
      sortHelp: sortHelp,
      badgeChars: badgeChars,
      fmtMs: fmtMs,
      sha256HexSync: sha256HexSync,
      BADGES: BADGES,
      MEDALS: MEDALS,
      ENDING_BONUS: ENDING_BONUS,
      // CO-17/29/30 新增纯函数出口
      histogram: histogram,
      histogramBucketIndex: histogramBucketIndex,
      percentileOf: percentileOf,
      bandFor: bandFor,
      RANK_BANDS: RANK_BANDS,
      progressDelta: progressDelta,
      aggregateHelp: aggregateHelp,
      aggregateIdeas: aggregateIdeas,
      decorateEntry: decorateEntry,
      decorateRows: decorateRows
    }
  };
})();
