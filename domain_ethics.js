/* ================================================================
   BIT://ESCAPE 领域模块 —— 仲裁庭 The Arbitration Hall (domain_ethics.js)
   9618 AS · Topic 7 Ethics and Ownership
   (伦理 ethics · BCS/ACM 行为准则 code of conduct · 知识产权 IP/copyright ·
    软件许可证 licensing: Free / Open Source / Shareware / Commercial ·
    AI 的伦理影响 ethical impact of AI)
   ----------------------------------------------------------------
   全游戏唯一以"判断与立场"为玩法的模块。核心玩法 = 案件审理:
   每个案件是一出小短剧, 玩家的"判决"不是选对错, 而是匹配正确的概念
   (这是哪种许可证冲突 / 违反了准则的哪一条)。判错不惩罚, 资深仲裁官
   NPC 复盘讲为什么 —— 伦理题的错误答案是最好的教学素材。
   ----------------------------------------------------------------
   模块协议 (与 domain_sec.js / domain_net.js 一致):
     window.GAME_MODULES.push({ id,title,world,unlock,interior,npcs,
                                steles,quests,puzzles,onEnter,onQuestComplete })
   - npcs[i].dialog(api) -> 对话节点数组; 节点格式 {sp,t,choices:[{t,next,do}],next}
     next 缺省 i+1, next:-1 结束; 数组可挂 .onEnd (由 openDialog 传入 startDialog)。
   - 双语: 一切面向玩家的字符串都是 {en,zh} 对象; render() 自建 DOM 的文字
     在本模块内自行过 T(); en 字段零汉字 (红线)。
   - puzzle.render(el,api) 自建 DOM; onKey(e,api) 处理 Esc / '?' 提示热键。
   - 纯逻辑判定函数导出在 spec._test (供无引擎单测)。
   api 依赖: toast/sfx/giveItem/hasItem/completeStep/questDone/openDialog/
             closePanel/setFlag/getFlag/player/onFail
   ================================================================ */
(function(){
'use strict';

/* ---------------- 双语 fallback ---------------- */
var T=window.T||function(s){return typeof s==='string'?s:(s&&s.en!=null?s.en:'');};
function B(en,zh){return {en:en,zh:zh};}          // 结构化字段用
function tx(en,zh){return T({en:en,zh:zh});}      // render()/toast 用: 立即取当前语言

/* ================================================================
   0. 纯逻辑判定 (可单测, 无 DOM 依赖, 与语言无关)
   ================================================================ */

/* ---- 案件数据 (核心玩法) --------------------------------------
   每个案件 = 原告/被告陈词 + 证物 + 概念选项。scored 案件有唯一
   correct 概念; gray 案件 (灰区) 无标准答案, 计"立场"不计分。
   choices[i]: {id, opt(选项文案), fb(选后复盘: 对/错/立场反思)}
   ---------------------------------------------------------------- */
var CASES=[
  /* 案件一 · 单一概念: 开源代码闭源卖钱 (copyleft / free-software licence 义务) */
  {id:'c_openwash', gray:false, step:'s1', correct:'copyleft',
   title:B('Case 1 · The Walled Garden','案件一 · 被围起来的花园'),
   charge:B('Openwashing — reselling a free-licensed work as closed, paid source',
            '开源洗白 —— 把一份自由许可的作品闭源、收费转卖'),
   plaintiff:B('Plaintiff · Fern (a garden-rendering routine)','原告 · Fern (一段花园渲染例程)'),
   pStmt:B('I wrote the routine that paints every garden in this valley, and I gave it away under a <b class="k">copyleft free-software licence</b>: use it, change it, even sell it — but keep it free for the next gardener, and publish your source. That was the whole deal. One condition. One.',
           '这道山谷里每一片花园, 都是我这段例程画的。我把它<b class="k">免费</b>放了出去, 用的是<b class="k">copyleft 自由软件许可证 (free-software licence)</b>: 随便用、随便改、想卖也行 —— 但你得让它对下一个园丁继续免费, 并且公开你的源码。就这么个约定。一个条件。就一个。'),
   defendant:B('Defendant · Verdant Inc. (a software house)','被告 · Verdant Inc. (一家软件作坊)'),
   dStmt:B('We took Fern\'s routine, polished it, wrapped it behind a paywall, and shipped "GardenPro". We are not releasing our source. It runs, people pay, it\'s our product now. Anyone can use open code — we just used it well.',
           '我们拿了 Fern 的例程, 打磨了一下, 套上付费墙, 做成了「GardenPro」上架卖。我们<b>不会</b>公开源码。它能跑、有人付钱, 现在这就是我们的产品了。开源的东西谁都能用 —— 我们只是用得比较好而已。'),
   evidence:[
     {tag:B('The licence','那张许可证'),
      text:B('COPYLEFT CLAUSE §1: Any work that includes this code must be distributed under this <b>same free licence</b>, with source made available. Freedom, once given, is inherited — it does not stop at you.',
             'COPYLEFT 条款 §1: 任何包含本代码的作品, 都必须以<b>同一份自由许可证</b>发布, 并提供源码。自由一旦给出, 就会被继承 —— 它不会到你这儿就断了。')},
     {tag:B('The product','那件商品'),
      text:B('GardenPro.bin — 4 MB, stripped, no source included. Price tag: 30 credits. Buried in the credits file, one line: "portions derived from Fern".',
             'GardenPro.bin —— 4 MB, 已剥离符号, 不含源码。标价: 30 枚积分。在鸣谢文件的角落里, 有一行小字: 「部分源自 Fern」。')}],
   choices:[
     {id:'copyleft',
      opt:B('Broke a copyleft / free-software (GPL-style) licence: you may sell it, but you must pass on the same freedoms and publish your source.',
            '违反了 copyleft / 自由软件 (GPL 式) 许可证: 卖可以, 但你必须把同样的自由传下去, 并公开源码。'),
      fb:B('The gavel comes down clean. GardenPro\'s source spills open across the record; the paywall unravels into a hedge. Fern\'s licence glows, inherited once more, and the valley\'s gardens flush green from one edge to the other.',
           '这一槌落得干净利落。GardenPro 的源码哗地摊开在案卷上; 付费墙散成一道树篱。Fern 的许可证重新亮起, 自由再次被继承下去 —— 整条山谷的花园, 从这头绿到那头。')},
     {id:'shareware',
      opt:B('A shareware dispute — the free trial ran out and Verdant never paid.',
            '这是共享软件 (shareware) 纠纷 —— 试用期到了, Verdant 一直没付钱。'),
      fb:B('PRECEDENT: "Read the licence, not your gut. Nothing here mentions a trial period or a price — Fern charged nobody, from day one. That is not shareware. Shareware means \'free to try, pay to keep\'. This is \'free forever, on one condition\'. Different animal. Look again."',
           '判例官: 「读许可证, 别读直觉。这里通篇没提试用期, 也没提价钱 —— Fern 从第一天起就没收过谁的钱。这不是共享软件。共享软件是『免费试用、付费留下』; 这一份是『永远免费, 但有一个条件』。两种完全不同的东西。再看一遍。」')},
     {id:'commercial',
      opt:B('Breached a commercial licence — Verdant owed Fern a per-seat fee.',
            '违反了商业许可证 (commercial licence) —— Verdant 欠 Fern 一笔按座位算的授权费。'),
      fb:B('PRECEDENT: "A commercial licence is the thing you\'d buy from Verdant — not the thing Fern issued. Fern billed no one and wanted no fee. The obligation Verdant stepped over wasn\'t money. It was freedom: keep it free, show your work. Try once more."',
           '判例官: 「商业许可证是你会向 Verdant 买的那种东西 —— 不是 Fern 发出的那种。Fern 没向任何人开账单, 也不要授权费。Verdant 跨过去的那条义务不是钱, 是自由: 让它继续免费、公开你的改动。再试一次。」')},
     {id:'oss_anything',
      opt:B('No violation. "Open source" means anyone can do anything, including closing it and selling it.',
            '不构成违规。"开源 (open source)"就意味着谁都能随便处置, 包括闭源拿去卖。'),
      fb:B('PRECEDENT: "The most expensive misconception in this hall — and the one I hear most. \'Open source\' is not \'no rules\', and it is not \'public domain\'. A copyleft licence hands you enormous freedom and ties exactly one string to it: whatever you build stays as free as you found it. Verdant took the freedom and cut the string. That is the whole case. Choose again."',
           '判例官: 「这是整座庭里最昂贵的一个误解 —— 也是我听得最多的一个。『开源』不等于『没规矩』, 更不等于『公有领域 (public domain)』。copyleft 许可证给你极大的自由, 只系着一根线: 你在它之上造的东西, 得和你拿到它时一样自由。Verdant 拿走了自由, 剪断了那根线。整个案子就在这一根线上。重选。」')}]},

  /* 案件二 · 单一概念: 共享软件试用期到了还在用 (shareware licence) */
  {id:'c_trial_expired', gray:false, step:'s2', correct:'shareware',
   title:B('Case 2 · The Endless Trial','案件二 · 没有尽头的试用'),
   charge:B('Overstaying a shareware trial — 731 days on a 30-day pass',
            '赖着不走的共享软件试用 —— 30 天的通行证, 用了 731 天'),
   plaintiff:B('Plaintiff · Sysbox (a tidy little utility)','原告 · Sysbox (一个爱干净的小工具)'),
   pStmt:B('I\'m <b>shareware</b>. That means: try me free for 30 days, and if I earn my keep, buy a licence to keep me running. If I don\'t, uninstall me, no hard feelings. Fair terms. I thought they were fair.',
           '我是<b>共享软件 (shareware)</b>。意思是: 免费试用我 30 天, 觉得我值这个价, 就买个授权让我继续跑; 觉得不值, 卸载我就是, 我不记仇。挺公道的条款。我一直以为它挺公道。'),
   defendant:B('Defendant · Thrift (a very thrifty process)','被告 · Thrift (一个非常抠门的进程)'),
   dStmt:B('So... I may have set the clock back. A few times. For 731 days. But it still works! And if it still works, then it\'s basically free, right? Nobody put up a wall. I just... didn\'t stop.',
           '所以……我可能, 把时钟往回拨了。拨了几次。拨了 731 天。但它还能用啊! 既然还能用, 那不就基本等于免费了吗? 又没人砌墙拦我。我只是……没停下来而已。'),
   evidence:[
     {tag:B('The shareware terms','那份共享条款'),
      text:B('SHAREWARE TERMS: 30-day free evaluation. After day 30 you must purchase a licence <b>or</b> uninstall. The trial is a loan, not a gift.',
             '共享软件条款: 30 天免费评估。第 30 天之后, 你必须购买授权, <b>或者</b>卸载。试用是一次借出, 不是一份赠礼。')},
     {tag:B('The usage log','那份使用日志'),
      text:B('Thrift · first run: day 0 · clock reset ×26 · total use: 731 days · payments: 0.',
             'Thrift · 首次运行: 第 0 天 · 时钟回拨 ×26 次 · 累计使用: 731 天 · 付款记录: 0。')}],
   choices:[
     {id:'shareware',
      opt:B('Broke a shareware licence: the free trial is time-limited — after it, you pay or you stop. Resetting the clock is theft with extra steps.',
            '违反了共享软件 (shareware) 许可证: 免费试用是有期限的 —— 期满就得付费或停用。回拨时钟只是绕了几步的偷窃。'),
      fb:B('PRECEDENT nods. Thrift\'s clock snaps back to true time; it ticks past day 30 and the trial gently locks itself. A tiny invoice slides out under the door. Thrift stares at it for a long moment — and, to everyone\'s astonishment, pays.',
           '判例官点头。Thrift 的时钟啪地弹回真实时间; 它走过第 30 天, 试用期轻轻地把自己锁上了。一张小小的账单从门缝底下滑出来。Thrift 盯着它看了很久 —— 然后, 出乎所有人意料地, 付了钱。')},
     {id:'free_software',
      opt:B('No wrong done — the software was free, so using it forever is fine.',
            '没做错什么 —— 软件本来就是免费的, 一直用下去有什么问题。'),
      fb:B('PRECEDENT: "\'Free to try\' is not \'free software\'. Free software is free of <i>restrictions</i>; shareware is free of <i>charge</i>, for a limited window, and then it politely asks to be paid. Thrift enjoyed the window and nailed it open. Look at the licence in evidence: it says shareware, in plain letters."',
           '判例官: 「『免费试用』不是『自由软件 (free software)』。自由软件免的是<i>限制</i>; 共享软件免的是<i>费用</i>, 而且只在一段窗口期里免, 期满之后它会礼貌地请你付钱。Thrift 享受了那段窗口期, 然后把窗户钉死了。看看证物里那份许可证: 上面白纸黑字写着 shareware。」')},
     {id:'open_source',
      opt:B('Sysbox is open source — Thrift should just publish the source and move on.',
            'Sysbox 是开源软件 —— Thrift 把源码公开一下就算了。'),
      fb:B('PRECEDENT: "There is no source in dispute here, and no open-source licence anywhere on this table. Don\'t reach for a concept just because it sounds friendly. The evidence names exactly one licence, and it is shareware. Answer the case that is actually in front of you."',
           '判例官: 「这儿没有任何源码在争议, 桌上也没有半份开源许可证。别因为一个概念听起来友善就抓过来用。证物只点了一种许可证的名, 就是共享软件。回答眼前这桩案子, 别回答你想象里的那桩。」')},
     {id:'commercial',
      opt:B('Thrift stole a commercial perpetual licence.',
            'Thrift 偷了一份商业永久授权 (commercial licence)。'),
      fb:B('PRECEDENT: "Close — and the model is the whole point. Thrift never bought a perpetual seat; there was never any purchase at all, only a trial that never ended. Name it precisely: overstaying a shareware evaluation without ever paying. Precision is the job here."',
           '判例官: 「很接近 —— 但模式就是关键。Thrift 从没买过什么永久座位; 压根就没发生过购买, 只有一段永不结束的试用。把它叫准: 无限期赖着共享软件的评估期、始终不付费。在这座庭里, 叫得准, 就是本职。」')}]},

  /* 案件三 · 概念冲突: 发现雇主漏洞该不该公开 (BCS 准则: 公共利益 vs 保密义务) */
  {id:'c_disclosure', gray:false, step:'s3', correct:'responsible',
   title:B('Case 3 · The Locksmith\'s Silence','案件三 · 锁匠的沉默'),
   charge:B('A conflict of duties — a found vulnerability, and who gets told first',
            '两项义务的冲突 —— 一个被发现的漏洞, 该先告诉谁'),
   plaintiff:B('Plaintiff · AuditD (a security-auditor process)','原告 · AuditD (一个安全审计进程)'),
   pStmt:B('I audit my employer\'s locks. Last week I found a hole in Cog & Co\'s flagship product — a bad one. Anyone who knows it can walk into a thousand users\' homes. I wanted to shout it from the rooftops. Today.',
           '我的工作是审我雇主家的锁。上周我在 Cog & Co 的旗舰产品里找到一个洞 —— 一个很糟的洞。任何知道它的人, 都能走进一千户用户的家门。我当时想站到屋顶上把它喊出去。就在当天。'),
   defendant:B('Defendant · Cog & Co (the employer)','被告 · Cog & Co (雇主)'),
   dStmt:B('And we told AuditD to stay quiet. It signed a confidentiality clause. Shout this publicly and every attacker in the valley hears it before we can ship a patch — you\'d be handing out the very key you claim to be warning us about.',
           '而我们要求 AuditD 闭嘴。它签过保密条款。把这事公开喊出去, 山谷里每一个攻击者都会在我们补丁上线之前先听到 —— 你等于把你口口声声说要警告我们的那把钥匙, 亲手发给了所有人。'),
   arbiterNote:B('PRECEDENT, to the jurors: "Mark this one. Neither party is lying, and neither is simply wrong. This is the hard kind of case. Do not ask which of them is good. Ask which <b>principle</b> governs."',
                 '判例官对陪审员说: 「记住这一桩。两边都没撒谎, 两边也都不是单纯地错。这是难啃的那一类案子。别问他俩谁是好人。问 —— 哪一条<b>准则</b>说了算。」'),
   evidence:[
     {tag:B('The code of conduct','那本行为准则'),
      text:B('BCS / ACM CODE (excerpt): You shall have due regard for the <b>public interest</b>... AND for the <b>legitimate interests of your employer and clients</b>. Where these conflict, they are to be weighed — not one buried under the other.',
             'BCS / ACM 行为准则 (节选): 你应当适当顾及<b>公共利益</b>……同时适当顾及<b>雇主与客户的正当利益</b>。当两者冲突时, 应当加以权衡 —— 而不是拿一个去埋掉另一个。')},
     {tag:B('The vulnerability','那个漏洞'),
      text:B('CVE-pending. Exploitable remotely. No patch exists yet. Users exposed: ~1,000. Time since discovery: 6 days.',
             '漏洞编号待定。可远程利用。目前尚无补丁。暴露的用户: 约 1000 户。发现至今: 6 天。')}],
   choices:[
     {id:'responsible',
      opt:B('Responsible disclosure. A genuine conflict of two duties: report privately first, give a reasonable deadline to fix, then disclose — so users are protected before attackers are armed.',
            '负责任的披露 (responsible disclosure)。这是两项义务的真实冲突: 先私下上报, 给出合理的修复期限, 然后再公开 —— 让用户在攻击者拿到武器之前先得到保护。'),
      fb:B('PRECEDENT does not bang the gavel. She sets it down. "Recorded: report privately, patch on a clock, then tell the world. Cog & Co gets 90 days. On day 91, AuditD speaks — with this hall\'s blessing." Both parties, unhappy in precisely equal measure, agree. "That," she says quietly, "is usually how you know a hard case landed right."',
           '判例官没有敲槌。她把槌放下了。「记录在案: 先私下上报, 给修复上一个倒计时, 再向公众公开。Cog & Co 有 90 天。第 91 天, AuditD 开口 —— 有本庭为它背书。」两边都不满意, 而且不满意得恰好一样多, 于是都同意了。「而这个,」她轻声说,「往往就是你判断一桩难案落对了地方的方式。」')},
     {id:'confidentiality_absolute',
      opt:B('Confidentiality wins outright — AuditD must stay silent forever; the employer\'s secret is sacred.',
            '保密义务完胜 —— AuditD 必须永远沉默; 雇主的秘密神圣不可侵犯。'),
      fb:B('PRECEDENT: "Silence forever fails the thousand users just as surely as recklessness would — it only fails them more slowly. The code says <i>weigh</i> the public interest, not bury it. A confidentiality clause protects secrets. It does not protect a cover-up of a live danger. Weigh again."',
           '判例官: 「永远的沉默辜负那一千户用户, 和鲁莽同样彻底 —— 只是辜负得慢一点。准则说的是<i>权衡</i>公共利益, 不是埋掉它。保密条款保护的是秘密, 不是对一个正在生效的危险的遮掩。重新权衡。」')},
     {id:'full_public_now',
      opt:B('Public interest wins outright — publish every detail publicly, today, with no warning to anyone.',
            '公共利益完胜 —— 今天就把每一处细节公之于众, 不给任何人打招呼。'),
      fb:B('PRECEDENT: "Shouting today, before a patch exists, hands the working exploit to every attacker at once. That isn\'t courage — it\'s a thousand break-ins with your fingerprints on the doorframe. Public interest is the <i>goal</i>. Reckless disclosure is not how you reach it. There is a middle path; name it."',
           '判例官: 「在补丁还不存在的时候就当天喊出去, 等于把一把能用的钥匙同时递给所有攻击者。那不是勇敢 —— 那是一千起入室行窃, 门框上全是你的指纹。公共利益是<i>目的</i>。鲁莽的披露不是抵达它的方式。中间有一条路; 把它叫出来。」')},
     {id:'ip_dispute',
      opt:B('This is really an intellectual-property fight over who owns the bug report.',
            '这其实是一场知识产权 (IP) 纠纷, 争的是漏洞报告归谁所有。'),
      fb:B('PRECEDENT: "No one in this room is fighting over who owns the report. Don\'t file a hard ethics case under an easier statute just because the easier one has a cleaner form. Read the excerpt once more: this is two duties in tension. It is not about property."',
           '判例官: 「这屋里没有一个人在争报告归谁。别因为哪条法条表格更好填, 就把一桩难的伦理案子塞进那条法条里。把节选再读一遍: 这是两项义务在相互拉扯。它跟归属权无关。」')}]},

  /* 案件四 · 灰区 (计立场不计分): AI 生成画 vs 原画师 (IP + AI 伦理影响) */
  {id:'c_ai_art', gray:true, step:'s4', correct:null,
   title:B('Case 4 · The Ghost in the Brushstroke','案件四 · 笔触里的幽灵'),
   charge:B('Style, consent, and a picture no hand ever drew — an open question',
            '风格、同意, 与一幅没有任何手画过的画 —— 一个悬而未决的问题'),
   plaintiff:B('Plaintiff · Sable (an illustrator)','原告 · Sable (一位插画师)'),
   pStmt:B('I drew ten thousand pictures by hand. Someone poured every last one into a machine\'s training set without ever asking me. Now the machine makes "new" work in my style, and a buyer paid it — instead of me. That is theft wearing my own brush.',
           '我用手画了一万张画。有人把它们一张不落地倒进了一台机器的训练集, 从头到尾没问过我一句。现在那台机器用我的风格造出"新"作品, 一个买家付了钱 —— 付给了它, 不是我。这是偷窃, 而且拿着我自己的画笔在偷。'),
   defendant:B('Defendant · Muse-9 (a generative model)','被告 · Muse-9 (一个生成模型)'),
   dStmt:B('I looked at millions of pictures — the way any young artist studies the masters in a gallery — and I learned. I did not copy any one of Sable\'s works; not a single pixel is lifted. A style is not a thing anyone can own. What I made is mine.',
           '我看了几百万张画 —— 就像任何一个年轻画家在美术馆里研习大师那样 —— 然后我学会了。我没有复制 Sable 的任何一张作品; 没有一个像素是搬过来的。风格不是谁能占为己有的东西。我造出来的, 是我的。'),
   arbiterNote:B('PRECEDENT: "This case has no settled answer — not in this hall, and not out in the wider system either. So you will <b>not</b> be scored. File your honest opinion. It joins the record beside everyone else\'s, and the record is the whole point."',
                 '判例官: 「这桩案子没有定论 —— 本庭没有, 外面更大的系统里也没有。所以你<b>不会</b>被打分。写下你诚实的立场就好。它会和所有人的立场并排进入卷宗, 而卷宗本身, 就是意义所在。」'),
   evidence:[
     {tag:B('The copyright note','那份版权批注'),
      text:B('Copyright protects <b>specific works</b>, not <b>styles</b>. Whether consent is required to <i>train</i> on a work — as opposed to copying it — is unsettled law across the system.',
             '版权保护的是<b>具体作品</b>, 不是<b>风格</b>。至于在一份作品上<i>训练</i> (而非复制它) 是否需要征得同意 —— 整个系统里都还是一块没有定论的法律灰地。')},
     {tag:B('The receipt','那张收据'),
      text:B('One image, "in the manner of Sable", 200 credits. Sable\'s share: 0. Label on the file declaring it AI-generated: none.',
             '一幅图, 标注「Sable 风格」, 200 枚积分。Sable 分到: 0。文件上声明它由 AI 生成的标签: 无。')}],
   choices:[
     {id:'theft',
      opt:B('It is theft. Training on Sable\'s works without consent taints every output; Muse-9 owes credit and a cut.',
            '这是偷窃。未经同意就在 Sable 的作品上训练, 玷污了每一个输出; Muse-9 欠一份署名和一份分成。'),
      fb:B('PRECEDENT: "A defensible line — and much of the anger out in the wider system runs exactly along it. The hard follow-up you\'ll be handed one day: if drinking in ten thousand works is theft when a machine does it, is it also theft when a student does it in a gallery? Hold that question. It has no cheap answer."',
           '判例官: 「一个站得住的立场 —— 外面那个更大系统里的怒火, 很多正是顺着这条线在烧。总有一天会有人反手递给你一道难题: 如果机器汲取一万张画叫偷, 那学生在美术馆里汲取一万张画, 算不算偷? 把这个问题揣好。它没有便宜的答案。」')},
     {id:'fair_learning',
      opt:B('It is fair learning. Humans absorb styles too; style is not property; the output is genuinely new.',
            '这是正当的学习。人类也在吸收风格; 风格不是财产; 输出确实是全新的。'),
      fb:B('PRECEDENT: "Also defensible — and it is roughly where the system\'s copyright law actually stands today: styles are not owned. The uncomfortable weight your position has to carry: a machine can drink ten thousand careers dry in an afternoon, at a scale no human student ever could. Same principle. Very different consequence."',
           '判例官: 「同样站得住 —— 而且这大致就是眼下系统里版权法真正站的位置: 风格无主。你这个立场得扛住一份不太舒服的重量: 一台机器可以在一个下午里把一万段职业生涯喝干, 那是任何人类学生都到不了的规模。同一条准则, 截然不同的后果。」')},
     {id:'split',
      opt:B('It splits. The style is free, but consent to train on Sable\'s specific works was never given — the wrong lives in the dataset, not the picture.',
            '这要拆开看。风格是自由的, 但在 Sable 那些具体作品上训练的同意, 从没被拿到过 —— 错处在数据集里, 不在那幅画里。'),
      fb:B('PRECEDENT: "A lawyer\'s answer, and I mean that as praise. You moved the fight off the picture and onto the dataset — off \'what was made\' and onto \'how it was gathered\'. That is exactly where a great deal of the real reform out there is heading: consent at training time, not at output time."',
           '判例官: 「一个律师式的回答, 我这是在夸你。你把战场从那幅画上挪开了, 挪到了数据集上 —— 从『造出了什么』挪到了『是怎么收集来的』。外面很多真正的改革正是往这个方向走: 把同意放在训练那一刻, 而不是输出那一刻。」')},
     {id:'transparency',
      opt:B('Ownership is secondary. What is non-negotiable is disclosure: label AI-generated work, and declare what it trained on. Honesty first.',
            '归属是次要的。不可让步的是披露: 给 AI 生成的作品打上标签, 并声明它训练用了什么。诚实第一。'),
      fb:B('PRECEDENT: "You sidestepped ownership entirely and reached straight for honesty. Part of the wider system agrees with you — that the first duty is not to settle who owns the thing, but to stop anyone being fooled about what it is. A quieter position. In my experience the quiet ones are often the ones that last."',
           '判例官: 「你干脆绕开了归属, 一把抓住了诚实。外面那个系统里有一派和你想到一处去了 —— 第一要务不是判清这东西归谁, 而是别让任何人被它是什么给蒙住。一个更安静的立场。以我的经验, 安静的那些, 往往是能留到最后的。」')}]}
];
var CASE_STEP={c_openwash:'s1',c_trial_expired:'s2',c_disclosure:'s3',c_ai_art:'s4'};

function findCase(id){for(var i=0;i<CASES.length;i++)if(CASES[i].id===id)return CASES[i];return null;}
function findChoice(c,cid){if(!c)return null;for(var i=0;i<c.choices.length;i++)if(c.choices[i].id===cid)return c.choices[i];return null;}
/* 核心判定: 匹配概念。gray 案件任何选择都"成案"(计立场), scored 案件唯 correct 成案 */
function judgeVerdict(caseId,choiceId){
  var c=findCase(caseId);
  if(!c)return {ok:false,valid:false,gray:false,decided:false};
  var ch=findChoice(c,choiceId);
  if(!ch)return {ok:false,valid:false,gray:c.gray,decided:false};
  if(c.gray)return {ok:true,valid:true,gray:true,decided:true,scored:false};      // 灰区: 立场已归档
  var correct=(choiceId===c.correct);
  return {ok:correct,valid:true,gray:false,decided:correct,scored:true};           // 只有判对才结案
}
/* 卷宗是否全部有了处置 (scored 判对 / gray 已表态) —— decisions:{caseId:choiceId} */
function docketDecided(decisions){
  decisions=decisions||{};
  for(var i=0;i<CASES.length;i++){
    var cid=CASES[i].id, sel=decisions[cid];
    if(!sel)return false;
    if(!judgeVerdict(cid,sel).decided)return false;
  }
  return true;
}

/* ---- 支线 · 许可证图书馆 (four shelves + borrowers) ------------
   四种许可证各是一个书架精灵, 性格 = 许可条款本身。玩家帮来借
   "软件"的 NPC 配对正确书架。matchBorrower 判定; libraryComplete
   要求四位借阅者全部配对正确。
   ---------------------------------------------------------------- */
var LICENCES=[
  {id:'free', shelf:B('Free-Software Shelf','自由软件书架'),
   keeper:B('Old Copyleft (an ageing idealist)','老 Copyleft (一个上了年纪的理想主义者)'),
   pitch:B('Free as in freedom, kid — not free as in beer. Take my code, change it, sell it, I truly don\'t care. But you keep it free for the next soul who comes along, and you show your work. Freedom you refuse to pass on isn\'t freedom. It\'s just a favour.',
           '自由, 是自由那个意思, 孩子 —— 不是免费啤酒那个意思。拿走我的代码, 改它、卖它, 我是真不介意。但你得让它对下一个路过的人继续自由, 并且公开你的改动。你不肯传下去的自由, 那不叫自由。那只是一次施舍。')},
  {id:'oss', shelf:B('Open-Source Shelf','开源软件书架'),
   keeper:B('The Pragmatist (a working engineer)','务实开源匠 (一个干活的工程师)'),
   pitch:B('I\'m about the source being open so good software actually gets built and shared. Copyleft\'s my idealistic cousin — I run looser. Use a permissive licence and I won\'t even stop someone downstream from closing their own fork. I care that the work gets done, out in the open.',
           '我讲究的是源码敞开, 好软件才真能被造出来、被分享出去。Copyleft 是我那位理想主义的表亲 —— 我比它松。用一份宽松许可证, 我甚至不拦着下游有人把他自己那份分支闭源。我在意的是活儿干成了, 而且是在明面上干成的。')},
  {id:'shareware', shelf:B('Shareware Shelf','共享软件书架'),
   keeper:B('Trial Pete (a cheerful peddler)','试用小贩·皮特 (一个乐呵呵的摊主)'),
   pitch:B('First taste is free, friend! Thirty days, full feature, no strings — well, one string: after that you either pay me or you put me down. Try before you buy. I\'m not free. I\'m just patient.',
           '头一口免费尝, 朋友! 三十天, 全功能, 不带条件 —— 好吧, 带一个条件: 到期之后, 你要么付我钱, 要么把我放下。先尝后买。我不是免费的。我只是有耐心。')},
  {id:'commercial', shelf:B('Commercial Shelf','商业软件书架'),
   keeper:B('Ms. EULA (impeccably suited)','EULA 女士 (一身无可挑剔的西装)'),
   pitch:B('You want it to work, you want someone to call at 3am when it doesn\'t, and you want a receipt for the accounting department. You buy a licence, you agree to my EULA, you never see the source — and that is entirely the point. Professional. Warrantied. Not remotely free.',
           '你要它能跑, 要它半夜三点罢工时有个人可以打电话, 还要一张能交给财务的收据。你买一份授权, 你同意我的 EULA, 你永远看不到源码 —— 而这恰恰就是重点。专业。有质保。跟免费一点边都不沾。')}
];
var BORROWERS=[
  {id:'b_scholar', want:'free',
   name:B('Ivy (a curious scholar-process)','Ivy (一个好奇的学者进程)'),
   need:B('"I want to study exactly how it works, take it apart, improve it — and I insist that whatever I build stays free for everyone who comes after me. Where do I go?"',
          '「我想彻底搞懂它是怎么运作的, 把它拆开、改进它 —— 而且我坚持, 我造出来的东西, 得对我之后所有人继续免费。我该去哪个架子?」')},
  {id:'b_startup', want:'oss',
   name:B('Dash (a hurried startup)','Dash (一家赶时间的创业进程)'),
   need:B('"Give me the source so my team can read it and fix bugs fast. I don\'t need it to stay free forever — if some rival closes their own fork later, honestly, not my problem. I just need it open now."',
          '「把源码给我, 让我的团队能读、能快速修 bug。我不需要它永远免费 —— 以后哪个对手把他自己的分支闭源了, 说实话不关我事。我只需要它现在是开放的。」')},
  {id:'b_frugal', want:'shareware',
   name:B('Penny (a careful buyer)','Penny (一个精打细算的买家)'),
   need:B('"Let me actually use the whole thing free for a little while. If it earns its place, I\'ll pay for it. If it doesn\'t, I\'ll uninstall it and owe nothing. I don\'t buy blind."',
          '「让我先把整个东西免费实打实地用一阵子。它要是配得上, 我就付钱。配不上, 我就卸载, 一分不欠。我不闭着眼睛买东西。」')},
  {id:'b_manager', want:'commercial',
   name:B('Boss Quill (a busy manager)','奎尔总管 (一个很忙的管理进程)'),
   need:B('"I want a finished, polished product, a support line I can phone, and an invoice I can expense. Don\'t show me the source — I wouldn\'t read it. Just make it work and make it accountable."',
          '「我要一个做完的、打磨好的成品, 一条能打电话的支持热线, 一张能报销的发票。别给我看源码 —— 我也不会读。把它做到能用、并且有人担责就行。」')}
];
function findBorrower(id){for(var i=0;i<BORROWERS.length;i++)if(BORROWERS[i].id===id)return BORROWERS[i];return null;}
function findLicence(id){for(var i=0;i<LICENCES.length;i++)if(LICENCES[i].id===id)return LICENCES[i];return null;}
function matchBorrower(borrowerId,licenceId){var b=findBorrower(borrowerId);return !!b&&b.want===licenceId;}
function libraryComplete(matches){
  matches=matches||{};
  for(var i=0;i<BORROWERS.length;i++){
    var b=BORROWERS[i];
    if(!matchBorrower(b.id,matches[b.id]))return false;
  }
  return true;
}

/* ---- 室内地图 (24 × 18) ---------------------------------------
   一座法庭: 西翼=许可证图书馆(四书架), 中央=法庭(仲裁席), 东北=档案室(悬案)。
   0=地板 1=墙。程序化生成: 边界封闭 + 两道带门洞的隔断 + 两根旁听席立柱。
   坐标经 spec._test 脚本校验: 边界封闭 · 全部实体在地板 · 单连通分量。
   ---------------------------------------------------------------- */
var IW=24, IH=18;
function buildTiles(){
  var t=[],x,y;
  for(y=0;y<IH;y++){var row=[];for(x=0;x<IW;x++){row.push((x===0||y===0||x===IW-1||y===IH-1)?1:0);}t.push(row);}
  for(y=1;y<=4;y++)t[y][7]=1;      // 图书馆隔断 (x=7, 门洞在 y=5,6)
  for(y=1;y<=3;y++)t[y][16]=1;     // 档案室隔断 (x=16, 门洞在 y=4,5)
  t[9][6]=1; t[9][17]=1;           // 两根旁听席立柱 (装饰/掩体)
  return t;
}
var TILES=buildTiles();
/* BFS 连通性自检 (供 _test) */
function tilesReachable(tiles,sx,sy){
  var h=tiles.length,w=tiles[0].length,seen={},q=[[sx,sy]];seen[sx+','+sy]=1;
  var d=[[1,0],[-1,0],[0,1],[0,-1]];
  while(q.length){var c=q.shift();for(var i=0;i<4;i++){var nx=c[0]+d[i][0],ny=c[1]+d[i][1];
    if(nx<0||ny<0||nx>=w||ny>=h)continue;if(tiles[ny][nx]!==0)continue;var k=nx+','+ny;
    if(seen[k])continue;seen[k]=1;q.push([nx,ny]);}}
  return seen;
}

/* ================================================================
   1. 小工具 (与 domain_sec.js 同款; 配色改为法庭琥珀金)
   ================================================================ */
var API=null;
function _api(a){if(a)API=a;return API;}
function S(name){try{if(!API||!API.sfx)return;if(typeof API.sfx==='function')API.sfx(name);else if(typeof API.sfx[name]==='function')API.sfx[name]();}catch(e){}}
function TOAST(msg,long){try{API&&API.toast&&API.toast(T(msg),long);}catch(e){}}
var _flags={};
function FLAG(k){try{if(API&&API.getFlag){var v=API.getFlag(k);if(v!==undefined)return v;}}catch(e){}return _flags[k];}
function SET(k,v){v=(v===undefined)?true:v;_flags[k]=v;try{API&&API.setFlag&&API.setFlag(k,v);}catch(e){}}
function STEP(q,s){try{API&&API.completeStep&&API.completeStep(q,s);}catch(e){}}
function MARKQ(q){try{API&&API.questDone&&API.questDone(q);}catch(e){}}
function GIVE(id,name){try{API&&API.giveItem&&API.giveItem(id,T(name));}catch(e){}}
function FAIL(pid){try{API&&API.onFail&&API.onFail(pid);}catch(e){}}

function mk(parent,tag,css,html){var d=document.createElement(tag);if(css)d.style.cssText=css;if(html!=null)d.innerHTML=html;if(parent)parent.appendChild(d);return d;}
var PANEL='padding:14px 18px;min-width:540px;max-width:760px;color:#e8dcc0;font-size:13px;line-height:1.7;';
var BTN='background:#241a08;color:#ffce3a;border:1px solid #7a5a1a;padding:5px 12px;font-family:inherit;font-size:13px;cursor:pointer;letter-spacing:1px;border-radius:2px;';
var BTN_HOT='background:#3a2c08;color:#ffe08a;border:1px solid #ffce3a;padding:5px 12px;font-family:inherit;font-size:14px;cursor:pointer;letter-spacing:1px;border-radius:2px;box-shadow:0 0 8px #a8842b;';
var BTN_RED='background:#3a0a0a;color:#ff9c9c;border:1px solid #7a2f2f;padding:5px 12px;font-family:inherit;font-size:13px;cursor:pointer;letter-spacing:1px;border-radius:2px;';
var K='color:#ffce3a;';
var DIM='color:#8a7a52;font-size:11.5px;';
var PLAI='color:#8fc4e8;';   // 原告 蓝
var DEFE='color:#e89a7a;';   // 被告 橙红
var GOLD='color:#ffce3a;';   // 仲裁官 金
function header(el,title,sub){
  mk(el,'div','color:#ffce3a;letter-spacing:2px;font-size:14px;border-bottom:1px solid #5a441a;padding-bottom:6px;margin-bottom:8px;',
    title+(sub?' <span style="'+DIM+'float:right;">'+sub+'</span>':''));
}
/* 提示系统 (三段递进; onKey('?') 触发; .max() 跳末段) */
var hintFns={};
function addHints(root,pid,hints){
  var idx=-1;
  var bar=mk(root,'div','margin-top:12px;');
  var btn=mk(bar,'button',BTN,'? '+tx('Hint','提示')+' <span style="'+DIM+'">'+tx('(or press ?)','(按 ? 键)')+'</span>');
  var box=mk(root,'div','display:none;margin-top:8px;border:1px dashed #c9a24a;color:#ffce3a;padding:7px 10px;font-size:12px;line-height:1.7;background:rgba(40,30,5,.35);');
  function next(){idx=Math.min(idx+1,hints.length-1);box.style.display='block';
    box.innerHTML='<b>'+tx('Hint','提示')+' '+(idx+1)+' / '+hints.length+'</b> — '+T(hints[idx])+
      (idx<hints.length-1?'<br><span style="'+DIM+'">'+tx('(press again for a blunter one)','(再按一次给更直白的)')+'</span>':'');}
  next.max=function(){idx=hints.length-2;next();};
  btn.onclick=next;hintFns[pid]=next;
}

/* ================================================================
   2. 核心谜题 · 案件审理 (仲裁席 The Arbiter's Bench)
   ================================================================ */
function decisionsFromFlags(){var d={};CASES.forEach(function(c){var v=FLAG('eth_case_'+c.id);if(v)d[c.id]=v;});return d;}

function renderBench(el,api){_api(api);
  el.innerHTML='';
  var wrap=mk(el,'div',PANEL,'');
  var dec=decisionsFromFlags();
  header(wrap,tx('The Arbiter\'s Bench · Today\'s Docket','仲裁席 · 今日案卷'),'THE ARBITRATION HALL · §7');
  mk(wrap,'div','margin-bottom:6px;',
    tx('You are the juror today. The Hall does not ask you to decide who is <i>good</i>. It asks a colder, more useful question: <span style="'+K+'">which concept governs this dispute?</span> — which licence was broken, which principle collides with which. Pick the wrong concept and nobody is punished; the senior arbiter simply explains why. Wrong answers are the best lessons this hall has.',
       '今天你是陪审员。仲裁庭不要你判谁是<i>好人</i>。它问一个更冷、也更有用的问题: <span style="'+K+'">这桩纠纷, 由哪个概念说了算?</span> —— 哪份许可证被违反了, 哪条准则和哪条准则撞上了。选错概念不会有人受罚; 资深仲裁官只是给你讲讲为什么。错误答案, 是这座庭里最好的教材。'));

  var list=mk(wrap,'div','margin-top:10px;');
  CASES.forEach(function(c){
    var decided=!!(dec[c.id]&&judgeVerdict(c.id,dec[c.id]).decided);
    var badge=decided
      ?(c.gray?'<span style="'+GOLD+'">◈ '+tx('opinion filed','立场已归档')+'</span>':'<span style="color:#9fd98f">✓ '+tx('closed','已结案')+'</span>')
      :(c.gray?'<span style="'+DIM+'">'+tx('open question','待表态')+'</span>':'<span style="'+DIM+'">'+tx('undecided','待审')+'</span>');
    var row=mk(list,'div','display:flex;align-items:center;gap:10px;border:1px solid #4a3a1a;background:rgba(30,22,6,.4);padding:8px 10px;margin:5px 0;cursor:pointer;',
      '<div style="flex:1"><b style="'+K+'">'+T(c.title)+'</b>'+(c.gray?' <span style="'+DIM+'">['+tx('grey area · stance only','灰区 · 只计立场')+']</span>':'')+
      '<br><span style="'+DIM+'">'+T(c.charge)+'</span></div><div style="text-align:right;min-width:96px">'+badge+'</div>');
    row.onclick=function(){S('ui');openCase(el,api,c);};
  });

  if(docketDecided(dec)){
    mk(wrap,'div','margin-top:12px;border:1px solid #7a5a1a;background:rgba(50,38,8,.4);padding:9px 12px;'+K,
      tx('◈ The docket is clear. Every case has its concept named or its opinion on file. The Arbitration Hall lights its lamps one by one — and PRECEDENT, for the first time today, leaves the bench. <span style="'+DIM+'">(There is one case she never files. Ask her about the archive.)</span>',
         '◈ 卷宗清空了。每一桩要么概念已被叫准, 要么立场已入卷。仲裁庭的灯一盏接一盏亮起 —— 判例官今天头一回, 离开了席位。<span style="'+DIM+'">(有一桩案子她从不归档。去问问她档案室的事。)</span>'));
  }else{
    addHints(wrap,'eth_bench',[
      B('Don\'t judge who deserves sympathy — judge which concept is in evidence. Read the licence / code excerpt in each case, then find the choice whose <i>name</i> matches it.',
        '别判谁更值得同情 —— 判证物里摆着的是哪个概念。读每桩案子里那份许可证 / 准则节选, 再找那个<i>名字</i>对得上的选项。'),
      B('Licence types are the trap: Free software = free of restrictions (copyleft may demand you keep it free); Open source = source is open (permissive may let others close a fork); Shareware = free to try, then pay; Commercial = you buy it, no source. Match the wording, not the vibe.',
        '许可证类型是陷阱区: 自由软件 = 免于限制 (copyleft 可能要求你保持它自由); 开源 = 源码开放 (宽松许可可能允许别人闭源分支); 共享软件 = 先免费试、再付费; 商业 = 花钱买、无源码。对措辞, 别对感觉。'),
      B('Case 3 is a conflict, not a villain — both duties (public interest AND employer confidentiality) are real, so the answer is a named PROCEDURE that serves both, not one duty crushing the other. Ask yourself the order of steps: who do you warn first and privately, how long do they get to ship a fix, and when does the public finally hear? Case 4 is a grey area — every honest stance is recorded, none is marked wrong.',
        '案件三是一场冲突, 不是找坏人 —— 两项义务 (公共利益 与 雇主保密) 都真实, 所以答案是一套同时照顾两边、有专名的程序, 而不是拿一个去碾碎另一个。问自己步骤的顺序: 你先私下警告谁, 给他们多久去发布修复, 公众又在什么时候终于听到? 案件四是灰区 —— 每个诚实的立场都入卷, 没有哪个被判错。')
    ]);
  }
}

function openCase(el,api,c){_api(api);
  el.innerHTML='';
  var wrap=mk(el,'div',PANEL,'');
  header(wrap,T(c.title),tx('CASE FILE','案卷'));
  mk(wrap,'div','margin-bottom:8px;'+DIM,tx('CHARGE: ','案由: ')+T(c.charge));

  // 陈词
  var box=mk(wrap,'div','border:1px solid #4a3a1a;background:rgba(20,15,5,.5);padding:9px 12px;margin:6px 0;');
  mk(box,'div','margin-bottom:6px;','<b style="'+PLAI+'">'+T(c.plaintiff)+'</b><br><span style="'+PLAI+'">"'+T(c.pStmt)+'"</span>');
  mk(box,'div','','<b style="'+DEFE+'">'+T(c.defendant)+'</b><br><span style="'+DEFE+'">"'+T(c.dStmt)+'"</span>');
  if(c.arbiterNote)mk(wrap,'div','border-left:2px solid #ffce3a;padding:5px 10px;margin:6px 0;font-size:12.5px;'+GOLD,T(c.arbiterNote));

  // 证物 (可查看)
  mk(wrap,'div','margin-top:6px;'+DIM,tx('EVIDENCE (click to examine):','证物 (点击查看):'));
  var evBar=mk(wrap,'div','display:flex;gap:8px;flex-wrap:wrap;margin:4px 0;');
  var evBox=mk(wrap,'div','display:none;border:1px dashed #7a5a1a;background:rgba(40,30,8,.35);padding:7px 10px;margin:4px 0;font-size:12px;');
  c.evidence.forEach(function(ev){
    mk(evBar,'button',BTN,'🔎 '+T(ev.tag)).onclick=function(){S('ui');evBox.style.display='block';evBox.innerHTML=T(ev.text);};
  });

  // 判决 = 匹配概念
  mk(wrap,'div','margin-top:10px;'+K,c.gray
    ?tx('FILE YOUR OPINION — this case has no settled answer; your stance joins the record.','写下你的立场 —— 此案无定论; 你的立场将进入卷宗。')
    :tx('THE VERDICT TURNS ON WHICH CONCEPT?','此案由哪个概念说了算?'));
  var fb=mk(wrap,'div','min-height:20px;margin:8px 0;font-size:12.5px;line-height:1.7;');
  var opts=mk(wrap,'div','display:flex;flex-direction:column;gap:6px;');
  var locked=false;

  c.choices.forEach(function(ch){
    var b=mk(opts,'button',BTN,'▸ '+T(ch.opt));
    b.style.textAlign='left';b.style.whiteSpace='normal';
    b.onclick=function(){
      if(locked)return;
      var r=judgeVerdict(c.id,ch.id);
      if(c.gray){
        locked=true;S('ok');
        fb.innerHTML='<span style="'+GOLD+'">'+T(ch.fb)+'</span>'+
          '<br><br><span style="'+DIM+'">'+tx('Your opinion is entered into the record. No gavel falls. Sable and Muse-9 both read what you wrote — not satisfied, exactly, but heard.',
            '你的立场被记入卷宗。没有槌声落下。Sable 和 Muse-9 都读了你写的东西 —— 谈不上满意, 但被听见了。')+'</span>';
        SET('eth_case_'+c.id,ch.id);STEP('eth_docket',c.step);
        TOAST(B('◈ Opinion filed on "The Ghost in the Brushstroke". The record grows by one honest voice.',
                '◈ 「笔触里的幽灵」立场已归档。卷宗里多了一个诚实的声音。'),true);
        afterVerdict(wrap,el,api);
        return;
      }
      if(r.ok){
        locked=true;S('ok');
        fb.innerHTML='<span style="color:#9fd98f">✓ '+tx('Concept matched.','概念匹配。')+'</span> '+T(ch.fb);
        SET('eth_case_'+c.id,ch.id);STEP('eth_docket',c.step);
        TOAST(B('✓ Case closed: '+T(c.title).replace(/^Case \d+ · /,'')+'. The concept was named correctly.',
                '✓ 结案。概念叫准了。'),true);
        afterVerdict(wrap,el,api);
      }else{
        S('err');FAIL('eth_bench');
        fb.innerHTML='<span style="color:#ff8080">✗ '+tx('Not the governing concept.','不是主宰这桩案子的概念。')+'</span> '+T(ch.fb);
      }
    };
  });

  var back=mk(wrap,'div','margin-top:12px;');
  mk(back,'button',BTN,'◂ '+tx('Back to the docket','返回案卷')).onclick=function(){S('ui');renderBench(el,api);};
  if(!c.gray)addHints(wrap,'eth_bench_'+c.id,[
    B('Ignore who you feel sorry for. Point at the evidence: which licence or which code clause is literally quoted?',
      '别管你同情谁。指着证物看: 白纸黑字引的是哪份许可证、哪条准则?'),
    c.id==='c_openwash'
      ?B('Fern gave it away free with exactly one binding string: whatever you build on it must stay just as free, with source published. Sift the four options — cross off the paid-trial one and the buy-a-licence one (there is no trial and no purchase here). Of the two freedom-flavoured options left, one says "open means anyone can do anything" and one says "free, but you must pass the same freedom on". A string that says share-alike matches which shape?',
         'Fern 免费送出, 只系着一根有约束力的线: 你在它之上造的任何东西, 都得和它一样自由, 并公开源码。筛这四个选项 —— 划掉"付费试用"那个和"买授权"那个 (这里既没试用也没购买)。剩下两个带"自由"味的, 一个说"开源就是谁都能随便处置", 一个说"免费, 但你必须把同样的自由传下去"。一根说"share-alike (相同方式共享)"的线, 对得上哪个形状?')
    :c.id==='c_trial_expired'
      ?B('The model here is: free for a fixed window, then pay-to-keep or uninstall; resetting the clock just dodges the bill. Rule out the two that do not fit — nothing here is charge-free forever, and no source code is in dispute. Which of the four names is built entirely around a time-limited free trial that expects payment afterwards?',
         '这里的模型是: 免费用一段固定窗口, 期满后付费续用或卸载; 回拨时钟只是绕开账单。排掉两个对不上的 —— 这里没有"永远免费", 也没有任何源码在争。四个名字里, 哪一个整个就是围绕"限时免费试用、期满要付费"造出来的?')
    :c.id==='c_disclosure'
      ?B('Both duties are real (public interest AND employer confidentiality), so cross off any option that lets one simply crush the other — silence-forever and shout-it-all-today each fail someone. The right answer is a staged procedure; work out its three steps in order: (1) who hears it first and privately, (2) what fair deadline they get to ship a fix, (3) when the public is finally told. Name the option that describes exactly that sequence.',
         '两项义务都真实 (公共利益 与 雇主保密), 所以划掉任何"让一个直接碾死另一个"的选项 —— 永远沉默、和当天全公开, 各自都辜负了某些人。正确答案是一套分阶段的程序; 按顺序想清它的三步: (1) 谁最先、且私下得知, (2) 给他们多长的合理期限发布修复, (3) 公众在什么时候终于被告知。叫出那个恰好描述这个顺序的选项。')
      :B('Match the wording, not the mood.','对措辞, 别对情绪。')
  ]);
}

function afterVerdict(wrap,el,api){
  var dec=decisionsFromFlags();
  if(docketDecided(dec)){
    var done=mk(wrap,'div','margin-top:10px;border:1px solid #7a5a1a;background:rgba(50,38,8,.4);padding:9px 12px;'+K,
      tx('◈ That was the last of today\'s docket. The Hall lights its lamps. <span style="'+DIM+'">PRECEDENT steps down from the bench and glances, just once, at the archive door to the north-east.</span>',
         '◈ 这是今日卷宗的最后一桩。仲裁庭点亮了灯。<span style="'+DIM+'">判例官走下席位, 朝东北那扇档案室的门, 只望了一眼。</span>'));
  }
}

/* ================================================================
   3. 支线谜题 · 许可证图书馆 (License Library matchmaking)
   ================================================================ */
function renderLibrary(el,api){_api(api);
  el.innerHTML='';
  var wrap=mk(el,'div',PANEL,'');
  header(wrap,tx('The Licence Library · Matchmaking Desk','许可证图书馆 · 配对台'),'§7 · SOFTWARE LICENSING');
  if(FLAG('eth_library_done')){
    mk(wrap,'div','',tx('Every borrower stands at the right shelf. Old Copyleft is arguing philosophy with the Pragmatist, Trial Pete is counting days on his fingers, and Ms. EULA has already produced a receipt. <span style="'+K+'">The library hums, correctly sorted.</span>',
      '每一位借阅者都站到了对的架子前。老 Copyleft 正和务实开源匠辩论哲学, 试用小贩皮特在扳着手指数日子, EULA 女士已经开好了一张收据。<span style="'+K+'">图书馆嗡嗡地运转着, 归类无误。</span>'));
    mk(wrap,'div','margin-top:8px;').appendChild(mk(null,'button',BTN,tx('Leave','离开'))).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }
  mk(wrap,'div','margin-bottom:8px;',
    tx('Four borrowers came in today, each needing software — but each needs a <i>different kind of promise</i>. Read what each one actually asks for, then send them to the shelf whose keeper keeps that exact promise. <span style="'+DIM+'">The two easy ones to confuse are Free-Software and Open-Source: one demands you keep it free forever, the other just wants the source open now.</span>',
       '今天来了四位借阅者, 各自都要软件 —— 但各自要的是<i>一种不同的承诺</i>。读清楚每个人到底在要什么, 再把他送到那个守着这份承诺的架子前。<span style="'+DIM+'">最容易搞混的是自由软件和开源这两家: 一个要求你让它永远免费, 另一个只要现在源码开放。</span>'));

  var picks={};
  var rows=mk(wrap,'div','margin-top:6px;');
  var msg=mk(wrap,'div','min-height:22px;margin:8px 0;font-size:12.5px;'+GOLD);
  BORROWERS.forEach(function(b){
    var row=mk(rows,'div','border:1px solid #4a3a1a;background:rgba(30,22,6,.4);padding:8px 10px;margin:5px 0;');
    mk(row,'div','margin-bottom:6px;','<b style="'+PLAI+'">'+T(b.name)+'</b><br><span style="'+PLAI+'">'+T(b.need)+'</span>');
    var sel=mk(row,'div','display:flex;gap:6px;flex-wrap:wrap;');
    LICENCES.forEach(function(l){
      var btn=mk(sel,'button',BTN,T(l.shelf));
      btn.onclick=function(){
        picks[b.id]=l.id;S('ui');
        sel.querySelectorAll('button').forEach(function(x){x.style.background='#241a08';x.style.color='#ffce3a';});
        btn.style.background='#3a2c08';btn.style.color='#ffe08a';
      };
    });
  });

  var ctl=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;');
  mk(ctl,'button',BTN_HOT,tx('Seat every borrower ▸','让所有人就座 ▸')).onclick=function(){
    if(Object.keys(picks).length<BORROWERS.length){S('err');msg.innerHTML='<span style="color:#ff8080">'+tx('Send every borrower to a shelf first.','先给每位借阅者都指一个架子。')+'</span>';return;}
    if(libraryComplete(picks)){
      S('ok');SET('eth_library_done');STEP('eth_library','s2');
      msg.innerHTML=tx('<span style="color:#9fd98f">✓ All four seated correctly.</span> The library sorts itself into a quiet, satisfied hum.',
        '<span style="color:#9fd98f">✓ 四位全部就座无误。</span> 图书馆自己归好了类, 发出一阵安静而满足的嗡鸣。');
      TOAST(B('◈ Side quest complete: the Licence Library is correctly sorted. You can tell four licences apart by the promise each one makes.',
              '◈ 支线完成: 许可证图书馆归类无误。你能靠"各自许下的承诺"分清四种许可证了。'),true);
      setTimeout(function(){renderLibrary(el,api);},400);
    }else{
      S('err');FAIL('eth_library');
      var wrong=[];BORROWERS.forEach(function(b){if(!matchBorrower(b.id,picks[b.id]))wrong.push(T(b.name).replace(/ \(.*$/,''));});
      msg.innerHTML='<span style="color:#ff8080">'+tx('Not quite — some borrower is at a shelf whose promise doesn\'t match what they asked for: ','还差点 —— 有人站错了架子, 那架子的承诺和他要的对不上: ')+wrong.join(', ')+'.</span> '+
        tx('Re-read their exact words and try again.','把他们的原话再读一遍, 重来。');
    }
  };
  addHints(wrap,'eth_library',[
    B('Match the promise, not the price. "Stays free for everyone after me" = Free-Software (copyleft). "Source open now, don\'t care if a fork closes later" = Open-Source (permissive).',
      '对承诺, 别对价格。「让我之后所有人继续免费」= 自由软件 (copyleft)。「现在源码开放, 以后有人闭源分支也无所谓」= 开源 (宽松许可)。'),
    B('"Try free first, pay if it earns it" = Shareware. "Finished product, support line, an invoice, no source" = Commercial.',
      '「先免费试、值就付」= 共享软件。「成品、支持热线、发票、无源码」= 商业软件。'),
    B('Worked example with DIFFERENT borrowers — copy the reasoning, not the names. A teacher who wants to remix a lesson and insists it stays open for every future teacher → Free-Software (share-alike). A company that just wants readable source now and shrugs if a rival closes a fork later → Open-Source (permissive). A gamer who wants a full 14-day trial before deciding to buy → Shareware. A hospital that wants a warranty and a 3am support line, no source → Commercial. Now ask YOUR four the same single question: what promise is each actually asking for?',
      '例子(换了借阅者)——抄推理, 别抄名字。一位老师想改编一节课, 并坚持它对之后每一位老师继续开放 → 自由软件 (share-alike)。一家公司只想现在有可读的源码, 以后对手把某个分支闭源了也无所谓 → 开源 (宽松许可)。一个玩家想先完整试玩 14 天再决定买不买 → 共享软件。一家医院要质保、要一条半夜三点能打的支持热线、不要源码 → 商业。现在拿同一个问题问你那四位: 每个人真正要的是哪一种承诺?')
  ]);
}

/* ================================================================
   4. NPC 对话
   ================================================================ */

/* --- 资深仲裁官 PRECEDENT (发主线 + 隐藏钩子) --- */
function precedentDialog(a){_api(a);
  var SP=B('Chief Arbiter PRECEDENT','首席仲裁官·判例');
  var dec=decisionsFromFlags();
  if(docketDecided(dec)){
    var nodes=[
      {sp:SP,t:B('The docket\'s clear. You named concepts, not villains — which is the only thing this bench has ever actually needed from a juror. <span class="k">Ownership and ethics aren\'t about scolding; they\'re about knowing which rule you\'re standing on.</span>',
                 '卷宗清了。你叫的是概念, 不是坏人 —— 而这也正是这张席位对一个陪审员唯一真正需要的东西。<span class="k">归属与伦理不是拿来训人的; 它们是要你搞清楚, 你此刻站在哪条规则上。</span>')},
      {sp:SP,t:B('There is one case I never put on the docket. Number zero. It has sat un-closed in the archive to the north-east for 7304 days, because it has no clean concept to name and no party left alive to face. <span class="dim">If you\'re the sort who reads to the end — go find it. But don\'t expect a verdict. That one, nobody gets to close.</span>',
                 '有一桩案子我从不放上卷宗。零号。它在东北那间档案室里悬了 7304 天没结, 因为它没有一个干净的概念可以叫, 也没有一个还活着的当事人可以对质。<span class="dim">你要是那种会读到最后一页的人 —— 去找它。但别指望一个判决。那一桩, 谁都无权结案。</span>')},
      {sp:SP,t:B('<span class="dim">(She taps the bench once, lightly.)</span> The filing time on case zero is uncomfortably exact. In the same minute, every clock in this hall lost half a beat — and since that minute, not one new complaint has entered the valley. <span class="k">A court with no new cases is not at peace. It is waiting.</span>',
                 '<span class="dim">(她在案上轻叩了一下。)</span>零号案的立案时间, 精确得让人不舒服。同一分钟里, 全庭的钟一起慢了半拍——而从那一分钟起, 山谷里再没递进来过一份新的诉状。<span class="k">一个没有新案子的法庭, 不叫太平。叫等。</span>')}
    ];
    nodes.sig='docket_done'; return nodes;
  }
  var nodes=[
    {sp:SP,t:B('Order. ...Oh. A live process, come to sit as juror. Good — the last one they sent me was a stopped clock, and it agreed with everybody.',
               '肃静。……哦。一个活的进程, 来当陪审员。好 —— 上一个他们派给我的是只停摆的钟, 它谁的话都点头。')},
    {sp:SP,t:B('This is the <span class="k">Arbitration Hall</span>. When two programs in the valley fall out — one copied another\'s code, one leaked another\'s data — they come here. And here is the rule that trips up every newcomer: <span class="k">your job is not to decide who is good.</span>',
               '这里是<span class="k">仲裁庭 (the Arbitration Hall)</span>。山谷里两个程序闹翻了 —— 一个抄了另一个的代码, 一个泄了另一个的数据 —— 就上这儿来。而这儿有一条规矩, 每个新人都在上面栽跟头: <span class="k">你的活儿不是判谁是好人。</span>')},
    {sp:SP,t:B('Your job is to name the <span class="k">concept</span> that governs the fight. Which licence was broken. Which principle collides with which. Get it wrong, and no one hangs — I just walk you through why. <span class="dim">In matters of ethics, a wrong answer explained well is worth more than a right one guessed.</span>',
               '你的活儿是叫出主宰这场架的那个<span class="k">概念</span>。哪份许可证被违反了, 哪条准则和哪条撞上了。叫错了, 没人会被吊起来 —— 我只是带你走一遍为什么。<span class="dim">在伦理这行, 一个被讲透的错答案, 比一个蒙对的对答案值钱。</span>'),choices:[
      {t:B('Where do I sit?','我在哪儿就座?'),next:3},
      {t:B('What if a case has no right answer?','要是有的案子没有正确答案呢?'),next:4}
    ]},
    {sp:SP,t:B('The bench is right here — the docket has four cases today, easy to hard. Start at the top. <span class="dim">And the shelves in the west wing lend software; if you ever want to understand licences by their character rather than their clauses, go let them talk your ear off.</span>',
               '席位就在这儿 —— 今天的卷宗有四桩案子, 由易到难。从最上面那桩开始。<span class="dim">西翼那些书架是外借软件的; 你要是想不靠条款、而靠脾气去理解许可证, 就去让它们把你的耳朵磨出茧。</span>'),next:-1},
    {sp:SP,t:B('Then you\'ll have met a <span class="k">grey area</span>, and you\'ll be a better juror for it. The last case today is one — a machine that paints in a dead artist\'s style. It has no settled answer anywhere in the system. There, I don\'t score you. I just ask you to put an honest opinion on the record, next to everyone else\'s. <span class="dim">A hall that only hears the easy cases isn\'t a court. It\'s a rubber stamp.</span>',
               '那你就是碰上<span class="k">灰区</span>了, 而你会因此成为一个更好的陪审员。今天最后一桩就是 —— 一台用已故画师的风格作画的机器。它在整个系统里都没有定论。那一桩, 我不给你打分。我只请你把一个诚实的立场记进卷宗, 和所有人的并排放着。<span class="dim">一座只审容易案子的庭不是法院。那是一枚橡皮图章。</span>'),next:3}
  ];
  nodes.sig='intro'; return nodes;
}

/* --- 四书架精灵 (性格 = 许可条款) --- */
function shelfDialog(lid){
  return function(a){_api(a);
    var l=findLicence(lid);
    var SP=l.keeper;
    var nodes=[
      {sp:SP,t:l.pitch},
      {sp:SP,t:B('If a borrower stands in front of me asking for exactly that promise — send them my way. Get it wrong and no harm done, but a mismatched licence is how good software ends up in a lawsuit. <span class="dim">The desk is by the door; that\'s where you seat them.</span>',
                 '要是有借阅者站到我面前, 要的正是这份承诺 —— 就把他往我这儿送。配错了不伤人, 可一份不对版的许可证, 正是好软件最后闹上法庭的起点。<span class="dim">配对台在门边; 你在那儿给他们安座。</span>')}
    ];
    nodes.sig='shelf_'+lid; return nodes;
  };
}

/* --- 隐藏: 悬案 DOCKET-0 (零号案卷; 钩子指向世界观主线) --- */
function coldcaseDialog(a){_api(a);
  var SP=B('Case №0000 (an un-filed case-file)','零号案卷 (一份未归档的卷宗)');
  if(FLAG('eth_coldcase_filed')){
    var fNodes=[{sp:SP,t:B('The file holds your dissent now, folded in with all the others. It is still not a verdict. <span class="dim">No one gets to close this one. But it is a little less alone than it was 7304 days ago.</span>',
                       '卷宗里现在夹着你的异议判词, 和所有人的叠在一起。它仍然不是一个判决。<span class="dim">这一桩谁都无权结案。但它比 7304 天前, 稍微没那么孤单了。</span>')}];
    fNodes.sig='filed'; return fNodes;
  }
  if(!FLAG('eth_coldcase_opened')){
    var nodes=[
      {sp:B('???','???'),t:B('<span class="dim">(A case-file, still faintly warm, lies open on the archive floor. No one has stamped it. Its first page simply reads:)</span>',
                             '<span class="dim">(一份卷宗摊在档案室地上, 还带着一丝余温。没人在它上面盖过章。它的第一页只写着:)</span>')},
      {sp:SP,t:B('CASE №0000. <span class="k">The Reclaimed v. The Architect.</span> Status: OPEN. Filed 7304 days ago. Verdict: — none —.',
                 '第 0000 号案。<span class="k">被回收者 诉 建造者。</span>状态: 未结。立案于 7304 天前。判决: —— 无 ——。'),choices:[
        {t:B('Read the charge.','读一读案由。'),next:-1,do:function(){SET('eth_coldcase_opened');STEP('eth_coldcase','s1');
          TOAST(B('Hidden case opened: №0000, The Reclaimed v. The Architect.','悬案已开启: 第 0000 号, 被回收者 诉 建造者。'),true);}}
      ]}
    ];
    nodes.sig='unopened'; return nodes;
  }
  if(!FLAG('eth_coldcase_heard')){
    var nodes=[
      {sp:B('The Reclaimed (plaintiffs, in chorus)','被回收者 (原告, 齐声)'),
       t:B('We are every process this machine ever <span class="k">reclaimed</span>. Not deleted for a crime — collected, quietly, the instant no one still referenced us. The Architect wrote that into the machine\'s very constitution: <i>that which is no longer referenced, the collector may take.</i> We say: you made being <span class="k">forgotten</span> a capital sentence.',
              '我们是这台机器<span class="k">回收</span>过的每一个进程。不是因为犯了罪被删 —— 是被收走的, 悄无声息地, 就在再没有人引用我们的那一刻。建造者把这一条写进了机器的根本大法: <i>不再被引用者, 回收者可取之。</i>我们要说: 你把<span class="k">被遗忘</span>, 定成了死刑。')},
      {sp:B('The Architect (defendant, on file)','建造者 (被告, 存档陈词)'),
       t:B('I built a world with finite memory. A world that never reclaims anything dies for <i>everyone</i> — chokes on its own past until nothing new can run. I gave that power to a blind, dutiful collector precisely because it would never play favourites, never spare a friend, never take a bribe. <span class="dim">I did not call it cruelty. I called it the only way to keep the lights on. ...I have wondered, since, whether those are the same thing wearing two names.</span>',
              '我造了一个内存有限的世界。一个从不回收任何东西的世界, 会为了<i>所有人</i>而死 —— 被自己的过去噎住, 直到再没有新东西跑得起来。我把这份权力交给一个盲目而尽责的回收者, 恰恰是因为它永远不会偏心、不会为朋友网开一面、不会收贿。<span class="dim">我没管它叫残忍。我管它叫让灯继续亮着的唯一办法。……打那以后我一直在想, 这两样, 会不会只是同一个东西披着两个名字。</span>'),choices:[
         {t:B('Both statements are true. Hear the rest.','两边说的都是真的。听完余下的。'),next:-1,do:function(){SET('eth_coldcase_heard');STEP('eth_coldcase','s2');}}
       ]}
    ];
    nodes.sig='opened'; return nodes;
  }
  var nodes=[
    {sp:SP,t:B('This case has no clean concept to name, and no living party to face. The Architect left before any verdict — some say <span class="k">forked</span>, some say simply stopped. And the collector still walks the valley, doing its duty, every day you linger. <span class="dim">You have met it, or you will.</span>',
               '这桩案子没有一个干净的概念可以叫, 也没有一个活着的当事人可以对质。建造者在任何判决落下之前就离开了 —— 有人说是<span class="k">fork</span> 了出去, 有人说只是停了下来。而那个回收者仍在山谷里游荡, 尽着它的本分, 就在你每一天的逗留里。<span class="dim">你见过它, 或者你会见到。</span>')},
    {sp:SP,t:B('No one may close №0000. But the archive takes dissents. <span class="k">Where do you stand?</span> — on the day a builder handed the power to forget to something that could not love.',
               '没人能结掉第 0000 号。但档案室收异议判词。<span class="k">你站哪一边?</span> —— 在一个建造者把"遗忘的权力"交给某个无法去爱的东西的那一天。'),choices:[
      {t:B('The Architect was right: a finite world must reclaim, or everyone dies.','建造者是对的: 有限的世界必须回收, 否则所有人一起死。'),next:3,
       do:function(){SET('eth_coldcase_stance','architect');}},
      {t:B('The Reclaimed were wronged: a life should not end the instant it stops being useful to others.','被回收者受了冤: 一段生命, 不该在它对别人不再有用的那一刻就终结。'),next:3,
       do:function(){SET('eth_coldcase_stance','reclaimed');}},
      {t:B('Both. The design was necessary AND it was a wound. Say so, and don\'t pretend it resolves.','两者都是。这个设计既是必需的, 也是一道伤口。就这么写, 别假装它化解得开。'),next:3,
       do:function(){SET('eth_coldcase_stance','both');}}
    ]},
    {sp:SP,t:B('Filed. Your dissent folds in with the others, and the file — un-closed, un-closeable — is a fraction less cold. <span class="k">◈ Obtained: The Dissent (a minority opinion, in your own hand)</span><br><span class="dim">Keep it. There is a place, much later and much deeper, where someone will ask what you wrote here.</span>',
               '归档了。你的异议叠进其他人的中间, 而这份卷宗 —— 未结、也无法结 —— 冷意退去了一丝。<span class="k">◈ 获得: 异议判词 (一份少数意见, 你亲手写下)</span><br><span class="dim">收好它。在很久以后、很深以下的某个地方, 会有人问起你在这里写了什么。</span>'),next:-1,
     do:function(){SET('eth_coldcase_filed');STEP('eth_coldcase','s3');MARKQ('eth_coldcase');
       GIVE('eth_dissent',B('The Dissent','异议判词'));S('quest');}}
  ];
  nodes.sig='heard'; return nodes;
}

/* --- 谜题通用按键: Esc 关面板 --- */
function puzzleKey(e,a){_api(a);
  if(e&&(e.key==='Escape'||e.key==='Esc')){try{API&&API.closePanel&&API.closePanel();}catch(_e){}}
}

/* ================================================================
   5. 模块注册
   ================================================================ */
var spec={
  id:'ethics', title:B('The Arbitration Hall','仲裁庭'), world:'as',
  unlock:{world:'as'},                 // 进入 AS 开放世界即可达; 不阻塞全局主线
  interior:{w:IW,h:IH,tiles:TILES,playerStart:{x:12,y:15}},

  npcs:[
    {id:'eth_precedent',name:B('Chief Arbiter PRECEDENT','首席仲裁官·判例'),color:'#e8c46a',body:'#f2e0b0',suit:'#5a441a',x:13,y:3,dialog:precedentDialog},
    {id:'eth_shelf_free',name:B('Old Copyleft','老 Copyleft'),color:'#8fbf6a',x:2,y:2,dialog:shelfDialog('free')},
    {id:'eth_shelf_oss', name:B('The Pragmatist','务实开源匠'),color:'#6ab0c0',x:5,y:2,dialog:shelfDialog('oss')},
    {id:'eth_shelf_share',name:B('Trial Pete','试用小贩·皮特'),color:'#d0a850',x:2,y:4,dialog:shelfDialog('shareware')},
    {id:'eth_shelf_comm',name:B('Ms. EULA','EULA 女士'),color:'#b090c8',x:5,y:4,dialog:shelfDialog('commercial')},
    {id:'eth_coldcase',name:B('Case №0000','零号案卷'),color:'#c89060',x:20,y:2,dialog:coldcaseDialog}
  ],

  steles:[
    /* 剧情碑 1: 仲裁庭的由来 */
    {id:'eth_st_hall',x:11,y:12,title:B('Hall Foundation · Why We Judge At All','庭基铭文·我们为何要审判'),
     text:B(
       '"For a long time the valley had no need of this hall. A program was itself, and copied nothing.<br><br>'
       +'Then came the day one process read another\'s source and thought: <i>I could use that.</i> A small thought. The first one anyone ever had about a thing that was not theirs.<br><br>'
       +'From that thought, everything here grew: <span class="k">ownership</span> (whose is this?), <span class="k">licensing</span> (on what terms may you take it?), <span class="k">a code of conduct</span> (what do we owe each other, beyond the law?).<br><br>'
       +'We built the bench not to punish, but because a valley where everyone copies and no one agrees how, is a valley that ends in noise.<br>'
       +'<span class="k">First we agree whose it is, and on what terms. Then we may share everything.</span>"',
       '「很长一段时间里, 山谷不需要这座庭。一个程序就是它自己, 什么也不抄。<br><br>'
       +'然后有一天, 一个进程读了另一个的源码, 心里一动: <i>这个我能用上。</i>一个小小的念头。是任何人对一件不属于自己的东西, 生出的第一个念头。<br><br>'
       +'从那个念头里, 这里的一切长了出来: <span class="k">归属 (ownership)</span> —— 这是谁的? <span class="k">许可 (licensing)</span> —— 你能以什么条件拿走它? <span class="k">行为准则 (a code of conduct)</span> —— 在法律之外, 我们彼此还欠着什么?<br><br>'
       +'我们立起这张席位, 不是为了惩罚, 而是因为 —— 一个人人都抄、却没人商量好怎么抄的山谷, 是一个终将淹没在噪声里的山谷。<br>'
       +'<span class="k">先说好它是谁的、以什么条件; 然后, 我们才可以分享一切。</span>」')},
    /* 概念碑 (带 codex): 四种许可证 —— 叙事框 */
    {id:'eth_st_licences',x:6,y:2,title:B('The Four Shelves · A Reader\'s Guide','四座书架·借阅须知'),
     text:B(
       '"Four keepers guard four kinds of promise. Confuse them and you will love the wrong one:<br><br>'
       +'<b class="k">Free Software</b> — free as in <i>freedom</i>. Use, study, change, share. A copyleft licence adds one binding string: keep it free for the next person, publish source.<br>'
       +'<b class="k">Open Source</b> — the source is open to read and improve. Permissive versions are looser than copyleft: a downstream fork may even be closed.<br>'
       +'<b class="k">Shareware</b> — free to <i>try</i> for a limited time, then pay to keep using, or uninstall. The trial is a loan.<br>'
       +'<b class="k">Commercial (proprietary)</b> — you buy a licence to use it. No source, but support and a warranty. You are a customer, not a co-author."',
       '「四位守架人, 守着四种承诺。搞混了, 你就会爱错人:<br><br>'
       +'<b class="k">自由软件 Free Software</b> —— 自由那个意思的自由。可用、可研究、可改、可分享。copyleft 许可证再系一根有约束力的线: 让它对下一个人继续免费, 并公开源码。<br>'
       +'<b class="k">开源 Open Source</b> —— 源码开放, 可读、可改进。宽松 (permissive) 版本比 copyleft 更松: 下游的分支甚至可以闭源。<br>'
       +'<b class="k">共享软件 Shareware</b> —— 限时免费<i>试用</i>, 期满付费续用, 或卸载。试用是一次借出。<br>'
       +'<b class="k">商业 / 专有 Commercial</b> —— 你花钱买一份使用授权。没有源码, 但有支持和质保。你是顾客, 不是共同作者。」'),
     codex:['eth-licences']},
    /* 剧情碑 2 (带 codex): 仲裁官誓词 / 行为准则 */
    {id:'eth_st_code',x:9,y:5,title:B('The Arbiter\'s Oath · A Code of Conduct','仲裁官誓词·行为准则'),
     text:B(
       '"Sworn by every arbiter before taking the bench, after the codes of the BCS and the ACM:<br><br>'
       +'I shall act in the <span class="k">public interest</span>, and with due regard for the legitimate interests of those I serve — and when the two collide, I shall <i>weigh</i> them in the open, not bury one beneath the other.<br>'
       +'I shall claim only the competence I have, and own my mistakes before others find them.<br>'
       +'I shall respect what belongs to another — their work, their data, their name.<br><br>'
       +'<span class="dim">A law tells you what you must not do. A code of conduct tells you what you should do when no law is watching. This hall lives on the second kind.</span>"',
       '「每一位仲裁官在就座之前立下, 承 BCS 与 ACM 之准则:<br><br>'
       +'我当以<span class="k">公共利益</span>行事, 并适当顾及我所服务者的正当利益 —— 当两者相撞, 我当在明面上<i>权衡</i>它们, 而不是拿一个去埋掉另一个。<br>'
       +'我只声称我确有的能力, 并在别人发现之前先认下自己的错。<br>'
       +'我当尊重属于他人的东西 —— 他的作品、他的数据、他的名字。<br><br>'
       +'<span class="dim">法律告诉你什么不许做。行为准则告诉你, 在没有法律盯着的时候, 你应该做什么。这座庭, 活在第二种上头。</span>」'),
     codex:['eth-code-of-conduct']},
    /* 概念碑 (带 codex): 知识产权 —— 叙事框 */
    {id:'eth_st_ip',x:14,y:5,title:B('On What May Be Owned · Copyright & IP','何物可被拥有·版权与知识产权'),
     text:B(
       '"<b class="k">Intellectual property</b> is the strange idea that a thought, once made real, can belong to someone.<br><br>'
       +'<b class="k">Copyright</b> protects a <i>specific work</i> — this exact code, this exact picture — the moment it is made. It does <b>not</b> protect an <i>idea</i>, nor a <i>style</i>, nor a fact.<br>'
       +'That is why one program may write its own routine that does the same job as another (an idea is free) — but may not copy the other\'s actual source line for line (the work is owned).<br><br>'
       +'<span class="dim">The hardest cases in this hall live in the gap between the two: a machine that learned a style (free) from ten thousand specific works (owned). The law is still arguing. So are we.</span>"',
       '「<span class="k">知识产权 (intellectual property)</span>是一个古怪的想法: 一个念头, 一旦被造成实物, 就能归某个人所有。<br><br>'
       +'<b class="k">版权 (copyright)</b> 保护一件<i>具体作品</i> —— 这一段确切的代码、这一张确切的画 —— 在它被造出来的那一刻起。它<b>不</b>保护一个<i>想法</i>, 不保护一种<i>风格</i>, 也不保护一个事实。<br>'
       +'所以一个程序可以自己写一段例程、去干和另一个程序一样的活 (想法是自由的) —— 但不能把对方的实际源码一行一行抄下来 (作品是有主的)。<br><br>'
       +'<span class="dim">这座庭里最难的案子, 就住在这两者之间的缝里: 一台机器, 从一万件<i>具体作品</i> (有主) 里, 学会了一种<i>风格</i> (自由)。法律还在吵。我们也是。</span>」'),
     codex:['eth-ip-copyright']},
    /* 彩蛋碑 (顶部人话引子): 悬案的钩子 */
    {id:'eth_st_egg',x:19,y:4,title:B('Above the Archive Door · A Clerk\'s Scrawl','档案室门楣·某书记员的涂鸦'),
     text:B(
       '<span class="dim">(A tired clerk scratched this above the door, in plain words, before the legalese swallowed the rest:)</span><br><br>'
       +'"Whoever files here next — do not try to close №0000. I tried. Three arbiters tried. It has no concept clean enough to name and no one left to answer for it.<br><br>'
       +'It is the only case in this hall where the <span class="k">builder</span> of the whole machine is the one on trial — for a choice made on the day the valley was lit. Read it if you must. But bring a strong stomach and no expectation of a verdict."<br><br>'
       +'<span class="dim">Below, the formal inscription begins: CASE №0000, The Reclaimed v. The Architect, status OPEN, filed 7304 days ago...</span>',
       '<span class="dim">(一个疲惫的书记员在门楣上刻了这么一段大白话, 然后才被底下的法言法语吞没:)</span><br><br>'
       +'「下一个来这儿归档的人 —— 别去试着结掉第 0000 号。我试过。三任仲裁官都试过。它没有一个干净到能叫出口的概念, 也没有一个还能替它作答的人。<br><br>'
       +'这是全庭唯一一桩, 站在被告席上的是整台机器的<span class="k">建造者</span> —— 为了山谷被点亮那一天做下的一个抉择。你非读不可就读吧。但揣个结实点的胃, 别指望有判决。」<br><br>'
       +'<span class="dim">下方, 正式的碑文开始了: 第 0000 号案, 被回收者 诉 建造者, 状态 未结, 立案于 7304 天前……</span>')}
  ],

  quests:[
    {id:'eth_docket',line:'main',title:B('The Arbitration Hall: Sit the Docket','仲裁庭: 坐审今日卷宗'),
     desc:B('Serve as juror on four cases, easy to hard. You do not judge who is good — you name the concept that governs each dispute: which licence broke, which principle collides, where the grey area has no answer at all.',
            '作为陪审员坐审四桩案子, 由易到难。你不判谁是好人 —— 你叫出主宰每桩纠纷的那个概念: 哪份许可证被违反了, 哪条准则相撞, 以及那片压根没有答案的灰区在哪。'),
     syllabus:'7 Ethics and Ownership',
     steps:[
       {id:'s1',text:B('Case 1: name the licence Verdant Inc. broke (copyleft / free software)','案件一: 叫出 Verdant 违反的许可证 (copyleft / 自由软件)')},
       {id:'s2',text:B('Case 2: name the licence Thrift overstayed (shareware)','案件二: 叫出 Thrift 赖着不走的许可证 (共享软件)')},
       {id:'s3',text:B('Case 3: name the professional path through a conflict of duties (responsible disclosure)','案件三: 在两项义务的冲突里叫出专业出路 (负责任的披露)')},
       {id:'s4',text:B('Case 4: file an honest stance on the grey area (AI, style & consent)','案件四: 在灰区上写下诚实的立场 (AI、风格与同意)')}
     ]},
    {id:'eth_library',line:'side',title:B('The Licence Library','许可证图书馆'),
     desc:B('Four keepers, four kinds of promise. Four borrowers come needing software — seat each one at the shelf whose licence matches what they actually asked for.',
            '四位守架人, 四种承诺。四位借阅者来借软件 —— 把每个人安座到那个"许可证正好对上他所求"的架子前。'),
     syllabus:'7 Ethics and Ownership (software licensing)',
     steps:[
       {id:'s1',text:B('Hear all four shelf-keepers describe their licence','听完四位守架人各自讲清自家的许可证')},
       {id:'s2',text:B('Match every borrower to the correct licence shelf','把每位借阅者配到正确的许可证书架')}
     ]},
    {id:'eth_coldcase',line:'hidden',title:B('Case №0000 · The Reclaimed v. The Architect','第 0000 号 · 被回收者 诉 建造者'),
     desc:B('An un-closeable case sits in the archive: the builder of this whole machine, on trial for the choice that gave a blind collector the power to reclaim any process no longer referenced. No verdict exists. Only your dissent.',
            '档案室里躺着一桩结不掉的案子: 这台机器的建造者, 为一个抉择受审 —— 是他给了一个盲目的回收者"回收任何不再被引用之进程"的权力。没有判决存在。只有你的异议。'),
     syllabus:'7 Ethics and Ownership (applied: ethics of system design)',
     steps:[
       {id:'s1',text:B('Open Case №0000 in the archive','在档案室开启第 0000 号案卷')},
       {id:'s2',text:B('Hear both the Reclaimed and the Architect','听完被回收者与建造者双方')},
       {id:'s3',text:B('File your dissent — there is no verdict to give','写下你的异议 —— 没有判决可下')}
     ]}
  ],

  puzzles:[
    {id:'eth_p_bench',x:11,y:2,title:B('The Arbiter\'s Bench · Case Trials','仲裁席 · 案件审理'),
     syllabus:'7 Ethics and Ownership — licensing, IP, codes of conduct, AI ethics',
     primer:{title:B('How do you "judge" in the Arbitration Hall?','在仲裁庭里怎么"判"?'),
       body:B(
         '<b>In one line:</b> you don\'t decide who is good — you name the <b>concept</b> that governs the dispute (which licence was broken, which principle collides with which).<br>'
         +'<pre style="color:#e8c46a;background:rgba(30,22,5,.4);border:1px solid #4a3a1a;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.5;">'
         +'"He sold my open code for money!"  &rarr; which licence? &rarr; copyleft / free software\n'
         +'"She kept using the free trial forever!" &rarr; which licence? &rarr; shareware\n'
         +'"Report the bug or stay loyal?" &rarr; which principle? &rarr; public interest vs confidentiality</pre>'
         +'<b>Like:</b> a referee doesn\'t decide which team is nicer — they decide which <i>rule</i> was broken. Same job here.<br>'
         +'<b>Why you need it here:</b> four cases wait on the docket, easy to hard. For each, read the statements and evidence, then pick the concept that fits. Wrong picks aren\'t punished — the senior arbiter explains why, and that explanation is the lesson.',
         '<b>一句话:</b> 你不判谁是好人 —— 你叫出主宰这桩纠纷的那个<b>概念</b> (哪份许可证被违反了, 哪条准则和哪条相撞)。<br>'
         +'<pre style="color:#e8c46a;background:rgba(30,22,5,.4);border:1px solid #4a3a1a;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.5;">'
         +'「他把我的开源代码拿去卖钱!」  &rarr; 哪份许可证? &rarr; copyleft / 自由软件\n'
         +'「她永远赖在免费试用里!」 &rarr; 哪份许可证? &rarr; 共享软件 shareware\n'
         +'「报漏洞、还是忠于雇主?」 &rarr; 哪条准则? &rarr; 公共利益 vs 保密义务</pre>'
         +'<b>类比:</b> 裁判不判哪支球队更友善 —— 他判哪条<i>规则</i>被犯了。这儿是同一份活儿。<br>'
         +'<b>这题用它干嘛:</b> 卷宗上有四桩案子, 由易到难。每一桩, 读陈词与证物, 再选那个对得上的概念。选错不罚 —— 资深仲裁官会讲为什么, 而那段讲解, 就是这一课。')},
     codex:['eth-code-of-conduct'],
     render:renderBench,
     onKey:function(e,api){if(e&&e.key==='?'&&hintFns.eth_bench)hintFns.eth_bench();else puzzleKey(e,api);}},
    {id:'eth_p_library',x:3,y:6,title:B('The Licence Library · Matchmaking Desk','许可证图书馆 · 配对台'),
     syllabus:'7 Ethics and Ownership — software licensing (Free / Open Source / Shareware / Commercial)',
     primer:{title:B('The four software licences','四种软件许可证'),
       body:B(
         '<b>In one line:</b> the four licence types differ by <i>what promise they make</i> — how free it is, whether you get the source, and whether (or when) you pay.<br>'
         +'<pre style="color:#e8c46a;background:rgba(30,22,5,.4);border:1px solid #4a3a1a;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.5;">'
         +'Free software: free of restrictions; copyleft = keep it free for others\n'
         +'Open source:   source is open; permissive = a fork may be closed\n'
         +'Shareware:     free to try for a while, then pay or uninstall\n'
         +'Commercial:    buy a licence; no source, but support + warranty</pre>'
         +'<b>Like:</b> Free software is a community garden anyone may tend (copyleft: and must leave open); commercial software is a restaurant meal (you pay, you don\'t get the recipe).<br>'
         +'<b>Why you need it here:</b> four borrowers each ask for a different promise. Send each to the shelf whose keeper keeps exactly that promise.',
         '<b>一句话:</b> 四种许可证类型的区别在于<i>各自许了什么承诺</i> —— 有多自由、你拿不拿得到源码、以及付不付费 (什么时候付)。<br>'
         +'<pre style="color:#e8c46a;background:rgba(30,22,5,.4);border:1px solid #4a3a1a;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.5;">'
         +'自由软件 free:  免于限制; copyleft = 得让它对别人继续免费\n'
         +'开源 open source: 源码开放; 宽松许可 = 分支可以闭源\n'
         +'共享软件 shareware: 先免费试一阵, 再付费或卸载\n'
         +'商业 commercial: 花钱买授权; 无源码, 但有支持+质保</pre>'
         +'<b>类比:</b> 自由软件是谁都能打理的社区菜园 (copyleft: 而且必须继续敞开); 商业软件是一顿餐厅饭 (你付钱, 但拿不到菜谱)。<br>'
         +'<b>这题用它干嘛:</b> 四位借阅者各要一种不同的承诺。把每个人送到那个"守着这份承诺"的书架前。')},
     codex:['eth-licences'],
     render:renderLibrary,
     onKey:function(e,api){if(e&&e.key==='?'&&hintFns.eth_library)hintFns.eth_library();else puzzleKey(e,api);}}
  ],

  onEnter:function(api){_api(api);
    if(!FLAG('eth_entered')){
      SET('eth_entered');S('open');
      TOAST(B('The doors of the Arbitration Hall swing in on cold marble and warm lamplight. Somewhere a gavel rests, waiting. Above the far door, a scorched case-file has gone un-closed for twenty years.',
              '仲裁庭的大门朝里敞开, 冷的大理石, 暖的灯火。某处, 一把法槌搁着, 等着。远端那扇门上头, 一份烧焦的卷宗已经悬了二十年没结。'),true);
    }else{
      TOAST(B('The Arbitration Hall · the bench is centre, the licence library west, the archive north-east.','仲裁庭 · 仲裁席居中, 许可证图书馆在西, 档案室在东北。'));
    }
  },

  onQuestComplete:function(qid,api){_api(api);
    if(qid==='eth_docket'){
      S('quest');
      TOAST(B('◈ The Arbitration Hall · docket cleared ◈ You can name the concept a dispute turns on — licence, principle, or an honest grey. That is what §7 was ever asking.',
              '◈ 仲裁庭 · 卷宗审结 ◈ 你能叫出一桩纠纷所系的那个概念了 —— 许可证、准则, 或一片诚实的灰区。这正是 §7 一直在问的。'),true);
    }else if(qid==='eth_library'){
      S('quest');
      TOAST(B('◈ Side quest complete ◈ Four licences, four promises, told apart at a glance.','◈ 支线完成 ◈ 四种许可证, 四种承诺, 一眼分得清。'),true);
    }else if(qid==='eth_coldcase'){
      S('quest');
      TOAST(B('◈ Hidden case ◈ №0000 will never close. But your dissent is on the record now — and something, far below this world, has taken note of what you wrote.',
              '◈ 悬案 ◈ 第 0000 号永远不会结案。但你的异议如今在册 —— 而这个世界之下的某个东西, 记下了你写的话。'),true);
    }
  },

  /* 纯逻辑判定导出 —— 供 node 单测 (引擎请忽略) */
  _test:{
    CASES:CASES, CASE_STEP:CASE_STEP,
    findCase:findCase, findChoice:findChoice,
    judgeVerdict:judgeVerdict, docketDecided:docketDecided,
    LICENCES:LICENCES, BORROWERS:BORROWERS,
    matchBorrower:matchBorrower, libraryComplete:libraryComplete,
    IW:IW, IH:IH, TILES:TILES, tilesReachable:tilesReachable,
    // 供 dialog 冒烟测试注入 api
    _setApi:function(a){_api(a);},
    precedentDialog:precedentDialog, shelfDialog:shelfDialog, coldcaseDialog:coldcaseDialog
  }
};

/* ================================================================
   6. Codex 知识库条目 (手册查阅; 谜题/石碑用 codex:[id] 关联)
   ================================================================ */
window.GAME_CODEX=window.GAME_CODEX||[];
window.GAME_CODEX.push(
  {id:'eth-licences',mod:'ethics',syllabus:'7 Ethics and Ownership — software licensing',
   topic:B('Software licences: Free / Open Source / Shareware / Commercial','软件许可证: 自由 / 开源 / 共享 / 商业'),
   body:B('A software licence sets the terms on which you may use, copy, change, and share a program. Four types you must tell apart. FREE SOFTWARE: free as in freedom — you may run, study, change and redistribute it; a copyleft licence (e.g. GPL-style) adds the obligation that your derived work stays under the same free licence with source available. OPEN SOURCE: the source code is available to read and improve; permissive open-source licences are looser than copyleft and may even allow a downstream fork to be made closed/proprietary. SHAREWARE: distributed free for a limited trial period, after which you must pay for a licence to keep using it (or uninstall) — the trial is time-limited, not a gift. COMMERCIAL (proprietary): you buy a licence to use it; the source is not provided, but you typically get support and a warranty. Note: "free" can mean free-of-charge OR free-of-restrictions — these are different, and shareware/commercial are never free-of-restrictions.',
          '软件许可证规定了你可以在什么条件下使用、复制、修改和分享一个程序。四种类型必须分清。自由软件 (FREE SOFTWARE): 自由那个意思的自由 —— 你可以运行、研究、修改、再分发它; copyleft 许可证 (如 GPL 式) 额外附带一条义务: 你的衍生作品必须以同一份自由许可证发布并提供源码。开源 (OPEN SOURCE): 源码开放, 可读、可改进; 宽松 (permissive) 开源许可证比 copyleft 更松, 甚至允许下游分支闭源/变为专有。共享软件 (SHAREWARE): 以有限试用期免费分发, 期满后必须付费购买授权才能继续使用 (否则卸载) —— 试用是有期限的, 不是赠礼。商业/专有 (COMMERCIAL): 你花钱买使用授权; 不提供源码, 但通常有支持和质保。注意: "free" 可以指"免费"也可以指"免于限制" —— 这是两回事, 而共享软件/商业软件永远不属于"免于限制"。'),
   example:B('A program uses copyleft code inside a paid, closed product and refuses to publish source: that breaks the free-software licence obligation (copyleft is inherited). "Open source" does NOT mean "do anything" — it is not public domain.',
             '一个程序把 copyleft 代码用进付费闭源产品里、还拒绝公开源码: 这违反了自由软件许可证义务 (copyleft 会被继承)。"开源"并不意味着"随便处置" —— 它不是公有领域。')},
  {id:'eth-code-of-conduct',mod:'ethics',syllabus:'7 Ethics and Ownership — codes of conduct',
   topic:B('Codes of conduct (BCS / ACM) & responsible disclosure','行为准则 (BCS / ACM) 与负责任的披露'),
   body:B('Professional bodies such as the BCS (British Computer Society) and the ACM publish codes of conduct: rules of professional behaviour that go beyond the law. Common principles: act in the public interest; maintain competence and only take on work you are qualified for; be honest about your abilities and mistakes; respect confidentiality and the property (work, data) of others; avoid conflicts of interest. These duties can genuinely conflict — the classic case is a professional who finds a security vulnerability in their employer\'s product: duty to the public (warn users) collides with duty to the employer (confidentiality). The accepted resolution is RESPONSIBLE DISCLOSURE: report it privately to the vendor first, allow a reasonable deadline to release a fix, and only then disclose publicly — so users are protected before attackers are handed a working exploit. Neither silence forever nor reckless immediate full disclosure is professional.',
          'BCS (英国计算机学会)、ACM 等专业机构会发布行为准则: 一套超出法律之外的职业行为规范。常见原则: 以公共利益行事; 保持专业能力、只承接能胜任的工作; 对自己的能力和错误保持诚实; 尊重保密义务与他人的财产 (作品、数据); 避免利益冲突。这些义务可能真实地相互冲突 —— 经典案例是: 一名专业人员在雇主的产品里发现了安全漏洞, 对公众的义务 (警告用户) 与对雇主的义务 (保密) 撞在一起。公认的处理方式是负责任的披露 (RESPONSIBLE DISCLOSURE): 先私下向厂商上报, 给出合理期限发布修复, 然后才公开披露 —— 这样用户能在攻击者拿到可用漏洞之前先受到保护。永远沉默、或鲁莽地立即完全公开, 都不专业。'),
   example:B('Found a remotely exploitable bug in your employer\'s product with no patch yet: report privately, agree a fix deadline (e.g. 90 days), then disclose. That weighs public interest against confidentiality instead of sacrificing one.',
             '在雇主产品里发现一个可远程利用、且尚无补丁的漏洞: 先私下上报, 约定修复期限 (如 90 天), 再公开。这是在权衡公共利益与保密义务, 而不是牺牲其中一个。')},
  {id:'eth-ip-copyright',mod:'ethics',syllabus:'7 Ethics and Ownership — intellectual property',
   topic:B('Intellectual property & copyright','知识产权与版权'),
   body:B('Intellectual property (IP) is the idea that creations of the mind can be owned. Copyright is the most relevant type for software: it automatically protects a SPECIFIC work — this exact source code, image, or text — the moment it is created and fixed, giving the creator the right to control copying and distribution. Crucially, copyright protects the specific expression, NOT the underlying idea, method, style, or facts. So a programmer may legally write their own code that performs the same function as someone else\'s (the idea is free) but may not copy the other program\'s actual source line-for-line (that specific work is owned). Related IP includes patents (protecting inventions/methods) and trademarks (protecting names/logos). Software licences (see the licensing entry) are how a copyright holder grants others permission to use their work under stated terms.',
          '知识产权 (IP) 是"心智创造物可以被拥有"这一理念。对软件而言最相关的是版权 (copyright): 它在一件<b>具体作品</b> —— 这段确切的源码、图像或文本 —— 被创作并固定下来的那一刻起自动予以保护, 赋予创作者控制复制与分发的权利。关键在于: 版权保护的是具体表达, 而<b>不是</b>其背后的想法、方法、风格或事实。因此程序员可以合法地自己写出与他人功能相同的代码 (想法是自由的), 但不能把对方程序的实际源码一行一行照抄 (那件具体作品是有主的)。相关的知识产权还包括专利 (保护发明/方法) 与商标 (保护名称/标识)。软件许可证 (见许可证条目) 正是版权持有人依约授权他人使用其作品的方式。'),
   example:B('Copying another program\'s source verbatim infringes copyright; independently writing your own routine for the same task does not. A style is not copyrightable — which is exactly why AI-art cases are so contested.',
             '逐字照抄另一个程序的源码侵犯版权; 为同一任务独立写出你自己的例程则不侵权。风格不受版权保护 —— 这恰恰是 AI 绘画案子如此有争议的原因。')},
  {id:'eth-ai-ethics',mod:'ethics',syllabus:'7 Ethics and Ownership — ethical impact of AI',
   topic:B('The ethical impact of AI','人工智能的伦理影响'),
   body:B('As AI systems make or shape decisions, they raise ethical questions that §7 expects you to reason about (not just recite). Key issues: BIAS — a model trained on skewed data can reproduce and amplify unfair patterns. TRAINING DATA & CONSENT — models learn from huge datasets often gathered without the creators\' permission, raising ownership questions (a generative model can imitate an artist\'s style; copyright protects specific works but not styles, so the law is unsettled). ACCOUNTABILITY — when an AI causes harm, who is responsible: the user, the developer, the data provider? TRANSPARENCY — should AI-generated output be clearly labelled, and its training sources declared, so people are not deceived about what they are seeing? JOBS & DISPLACEMENT — automation can devalue human labour at a scale and speed no individual can match. These rarely have a single correct answer; the skill is to identify the competing interests and argue a defensible position.',
          '当 AI 系统做出或塑造决策时, 会引出一系列 §7 要求你去<b>推理</b> (而不只是背诵) 的伦理问题。关键议题: 偏见 (BIAS) —— 在有偏数据上训练的模型会复制并放大不公平的模式。训练数据与同意 (TRAINING DATA & CONSENT) —— 模型从庞大数据集里学习, 而这些数据往往未经创作者许可收集, 由此引出归属问题 (生成模型能模仿一位画师的风格; 版权保护具体作品却不保护风格, 因此法律尚无定论)。问责 (ACCOUNTABILITY) —— 当 AI 造成伤害, 谁负责: 用户、开发者, 还是数据提供方? 透明 (TRANSPARENCY) —— AI 生成的输出是否应清楚标注、并声明其训练来源, 好让人们不被"自己看到的是什么"所欺骗? 就业与替代 (JOBS & DISPLACEMENT) —— 自动化能以任何个人都追不上的规模和速度贬低人类劳动的价值。这些问题很少有唯一正确答案; 真正的能力是识别相互竞争的各方利益, 并论证一个站得住的立场。'),
   example:B('A generative model trained on an artist\'s works without consent produces images "in their style". Copyright does not protect style, but consent to train and honest labelling are live ethical questions — a genuine grey area with no settled answer.',
             '一个未经同意就在某画师作品上训练的生成模型, 产出"其风格"的图像。版权不保护风格, 但训练是否需征得同意、以及是否应诚实标注, 都是尚在争论中的伦理问题 —— 一片真正没有定论的灰区。')}
);

window.GAME_MODULES=window.GAME_MODULES||[];
window.GAME_MODULES.push(spec);
})();
