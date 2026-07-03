/* ================================================================
   BIT://ESCAPE 领域模块 —— 安全哨站 The Firewall Bastion (domain_sec.js)
   9618 AS · Topic 6.1 Data Security
   (钓鱼/域名仿冒 phishing & pharming · 防火墙 firewall packet filtering ·
    恶意软件 malware: virus/worm/trojan/spyware/ransomware)
   ----------------------------------------------------------------
   模块协议 (与 domain_memory.js 一致):
     window.GAME_MODULES.push({ id,title,world,unlock,interior,npcs,
                                steles,quests,puzzles,onEnter,onQuestComplete })
   约定(给引擎侧):
   - unlock.afterQuest='m3' —— index.html 第一章末尾任务实际 id 是 m3。
   - npcs[i].dialog 是函数 dialog(api) -> 对话节点数组, 节点格式与
     index.html 的 startDialog 一致: {sp,t,choices:[{t,next,do}],next}
     next 缺省 i+1, next:-1 结束。节点数组可挂 .onEnd, 请作为
     startDialog 的第二参数传入。
   - 双语: 一切面向玩家的字符串都是 {en,zh} 对象(默认英文)。
     结构化字段(title/desc/steps/steles/npc.name/dialog 节点的 sp/t/choices.t)
     直接携带 {en,zh}, 由引擎统一过 window.T;
     render() 自建 DOM 的文字在本模块内自行过 T()。
   - puzzle.render(el,api) 自建 DOM; onKey(e,api) 处理 '?' 提示热键。
   - 难度: 主线谜题失败≥2次提示自动升到"近乎给答案";
     每个谜题通关后出现可选 ★Challenge (flags sec_challenge_1/2,
     不影响主线, 供排行榜探索分)。
   - 纯逻辑判定函数导出在模块 _test 字段(供无引擎单测, 引擎可忽略)。
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

/* ---- 谜题1 · 钓鱼鉴别射击场 (§6.1 phishing / pharming) ----
   PHISH_MAILS: 普通轮 10 封 (5 假 5 真); PHISH_MAILS_HARD: ★挑战轮
   (同形异义字符/子域名伪装, 更隐蔽)。判定: 点"击落"=block,
   点"放行"=allow; 正确 = (isPhish && block) || (!isPhish && allow)。 */
var PHISH_MAILS=[
  {id:'m1',isPhish:true,
   subject:B('URGENT: Your PayPa1 account will be suspended in 1 hour!!','紧急: 您的 PayPa1 账户将在 1 小时内被冻结!!'),
   from:B('security@paypa1.com','security@paypa1.com'),
   snippet:B('Click here immediately to verify your identity or lose access forever.','立即点击验证身份, 否则永久失去访问权限。'),
   tell:B('Domain typo-squat: that\'s a digit "1", not a letter "l" — <b>paypa1.com</b> ≠ paypal.com. Plus the classic countdown-panic.',
          '域名打字仿冒: 那是数字 "1", 不是字母 "l" —— <b>paypa1.com</b> 不等于 paypal.com。外加经典的倒计时恐慌话术。')},
  {id:'m2',isPhish:false,
   subject:B('Your order #48213 has shipped','您的订单 #48213 已发货'),
   from:B('shipping@amazon.com','shipping@amazon.com'),
   snippet:B('Track your package — estimated delivery Friday.','追踪包裹——预计周五送达。'),
   tell:B('Correct domain, no urgency, no link demanding a password. Just a receipt doing its job.',
          '域名正确, 没有紧迫感, 也没有索要密码的链接。就是一张安分守己的发货单。')},
  {id:'m3',isPhish:true,
   subject:B('You\'ve WON a free iPhone 15!! Claim within 10 minutes','恭喜您抽中 iPhone 15!! 请在 10 分钟内领取'),
   from:B('prize@totally-legit-rewards.biz','prize@totally-legit-rewards.biz'),
   snippet:B('You are our 1,000,000th visitor! Enter your card details to cover "shipping".','您是我们的第 1,000,000 位访客! 请填写卡号以支付"运费"。'),
   tell:B('Too good to be true + artificial 10-minute clock + a .biz domain that has never sold a phone in its life.',
          '天上掉馅饼 + 人造的 10 分钟倒计时 + 一个从没卖过一部手机的 .biz 域名。')},
  {id:'m4',isPhish:false,
   subject:B('Reminder: Team standup moved to 10:30am','提醒: 每日站会改到上午 10:30'),
   from:B('calendar@company-internal.com','calendar@company-internal.com'),
   snippet:B('Same room. Bring your own coffee, the machine is still broken.','会议室不变。自带咖啡, 机器还没修好。'),
   tell:B('Mundane, internal, nothing to click, nothing at stake. The most boring email is usually the safest one.',
          '平平无奇, 内部事务, 没什么好点的也没什么好慌的。越无聊的邮件, 往往越安全。')},
  {id:'m5',isPhish:true,
   subject:B('Unusual sign-in activity detected','检测到异常登录活动'),
   from:B('no-reply@micros0ft-security.com','no-reply@micros0ft-security.com'),
   snippet:B('Someone in a country you\'ve never visited tried to access your account. Verify now or be locked out.','有人在您从未去过的国家尝试登录您的账户。立即验证否则将被锁定。'),
   tell:B('That "0" isn\'t an "o" — <b>micros0ft-security.com</b> is nobody\'s official domain. Fear first, thinking second: the classic order of operations.',
          '那个 "0" 不是 "o" —— <b>micros0ft-security.com</b> 不是任何官方域名。先吓唬后思考, 钓鱼邮件的经典操作顺序。')},
  {id:'m6',isPhish:false,
   subject:B('Your monthly newsletter','您的月度简报'),
   from:B('news@nationalgeographic.com','news@nationalgeographic.com'),
   snippet:B('This month: deep-sea vents, and the octopus that counts to eight.','本月精选: 深海热泉, 以及那只会数到八的章鱼。'),
   tell:B('Subscribed content, correct domain, nothing asks for credentials. Just octopi.',
          '订阅内容, 域名正确, 没有索要任何凭证。只有章鱼。')},
  {id:'m7',isPhish:true,
   subject:B('Invoice attached: invoice_details.pdf.exe','附件发票: invoice_details.pdf.exe'),
   from:B('billing@yourbank-support.com','billing@yourbank-support.com'),
   snippet:B('Please review the attached invoice and confirm payment.','请查收附件发票并确认付款。'),
   tell:B('A double extension (<b>.pdf.exe</b>) is a PDF costume worn by a program. Also: "yourbank-support.com" is not your bank\'s domain, just a phrase that contains its name.',
          '双重扩展名 (<b>.pdf.exe</b>) 是一个程序穿着 PDF 的外套。另外: "yourbank-support.com" 不是你银行的域名, 只是一句包含了银行名字的话。')},
  {id:'m8',isPhish:false,
   subject:B('Password changed successfully','密码修改成功'),
   from:B('account-security@github.com','account-security@github.com'),
   snippet:B('If this wasn\'t you, reset your password from the app — not from any link in an email.','如果这不是您本人操作, 请从官方 App 内重置密码——不要点邮件里的任何链接。'),
   tell:B('Correct domain, purely informational, and it actively tells you NOT to click email links. That\'s a company that has read the syllabus too.',
          '域名正确, 纯粹告知性质, 甚至主动提醒你别点邮件链接。这家公司显然也读过考纲。')},
  {id:'m9',isPhish:true,
   subject:B('Grandma stuck abroad, please send gift cards NOW','奶奶滞留国外, 请立刻寄礼品卡'),
   from:B('grandma_real_i_promise@gmail.com','grandma_real_i_promise@gmail.com'),
   snippet:B('Lost my phone and passport, can only email. Please buy $200 in gift cards and send the codes.','手机护照都丢了, 只能发邮件。请买 200 美元礼品卡并把卡密发给我。'),
   tell:B('Gift cards are untraceable cash — no legitimate emergency, hospital, or embassy has ever asked for one. Also: no grandma is named "grandma_real_i_promise".',
          '礼品卡是无法追踪的现金——没有任何正规急救、医院或使馆会管你要礼品卡。而且没有奶奶会把自己的邮箱取名叫"grandma_real_i_promise"。')},
  {id:'m10',isPhish:false,
   subject:B('Your flight check-in is now open','您的航班值机已开放'),
   from:B('checkin@united.com','checkin@united.com'),
   snippet:B('Check in now to select your seat. Boarding pass available 24h before departure.','立即值机选座。登机牌将在起飞前 24 小时开放下载。'),
   tell:B('Correct airline domain, time-boxed but not panic-boxed, matches a real upcoming trip. Ordinary travel admin.',
          '域名正确, 有时间窗口但不制造恐慌, 对应一次真实存在的行程。普通的出行事务。')}
];

/* ★挑战轮: 同形异义字符 (homoglyph) / 子域名伪装 (subdomain spoofing) —— 破绽更隐蔽 */
var PHISH_MAILS_HARD=[
  {id:'h1',isPhish:true,
   subject:B('Verify your Apple ID','请验证您的 Apple ID'),
   from:B('security@аpple.com','security@аpple.com'),
   snippet:B('Your account was locked for your protection. Tap to verify.','为保护账户安全已将其锁定。点击验证。'),
   tell:B('Look VERY closely at that first letter — it\'s Cyrillic "а", not Latin "a". Pixel-identical, byte-different. This is why you never trust a domain by eye alone.',
          '仔细看第一个字母——那是西里尔字母 "а", 不是拉丁字母 "a"。像素上一模一样, 字节上完全不同。这就是为什么域名不能只靠肉眼判断。')},
  {id:'h2',isPhish:false,
   subject:B('Your receipt from Apple','您的 Apple 购买凭证'),
   from:B('no_reply@apple.com','no_reply@apple.com'),
   snippet:B('App Store purchase: 1x subscription renewal, ¥25.','App Store 购买记录: 订阅续费 1 笔, ¥25。'),
   tell:B('Plain ASCII "apple.com", matches a real subscription. Ordinary receipt.','纯 ASCII 的 "apple.com", 对应一笔真实订阅。普通收据。')},
  {id:'h3',isPhish:true,
   subject:B('Google security alert: new sign-in','谷歌安全提醒: 检测到新登录'),
   from:B('login@accounts.google.com.verify-session.net','login@accounts.google.com.verify-session.net'),
   snippet:B('We noticed a new sign-in. If this was you, no action needed. If not, secure your account here.','我们检测到一次新登录。如果是您本人, 无需操作; 如果不是, 请点此保护账户。'),
   tell:B('Read a domain from the RIGHT: the real domain here is <b>verify-session.net</b> — "accounts.google.com" is just a subdomain LABEL some stranger is allowed to name anything.',
          '读域名要从<b>右边</b>开始: 这里真正的域名是 <b>verify-session.net</b>——"accounts.google.com" 只是子域名标签, 陌生人爱怎么起名都行。')},
  {id:'h4',isPhish:false,
   subject:B('New device signed in','检测到新设备登录'),
   from:B('no-reply@accounts.google.com','no-reply@accounts.google.com'),
   snippet:B('A new device (Chromebook) signed in to your account just now.','刚刚有一台新设备 (Chromebook) 登录了您的账户。'),
   tell:B('"accounts.google.com" IS the real domain here — nothing hangs off the right side of it. Compare carefully with h3.',
          '这里的 "accounts.google.com" 就是真正的域名——它右边什么都没挂。和 h3 仔细比对一下。')},
  {id:'h5',isPhish:true,
   subject:B('Updated staff handbook — sign by EOD','员工手册更新——请今日下班前签收'),
   from:B('hr@bitvalley-acadamy.cn','hr@bitvalley-acadamy.cn'),
   snippet:B('Please review and digitally sign the attached policy update before 6pm today.','请于今日 18 点前审阅并电子签署附件中的政策更新。'),
   tell:B('"acad<b>a</b>my" — one swapped vowel from the real org domain, plus a same-day deadline to keep you from double-checking.',
          '"acad<b>a</b>my"——比真实机构域名少了个 e、错了个元音, 再配上一个"今天必须签"的截止日期让你来不及细看。')},
  {id:'h6',isPhish:false,
   subject:B('Reminder: submit timesheet by Friday','提醒: 请于周五前提交考勤表'),
   from:B('hr@bitvalley-academy.cn','hr@bitvalley-academy.cn'),
   snippet:B('Standard monthly reminder, link goes to the internal HR portal.','标准月度提醒, 链接指向内部 HR 系统。'),
   tell:B('Domain spelled correctly, deadline is days away (not hours), routine tone.','域名拼写正确, 截止日期是几天后而非几小时后, 语气也是例行公事。')},
  {id:'h7',isPhish:true,
   subject:B('Someone shared a file with you','有人与您共享了一个文件'),
   from:B('support@dropbox.com-file-share.ru','support@dropbox.com-file-share.ru'),
   snippet:B('Click to view the shared document (expires in 24h).','点击查看共享文档 (24 小时后过期)。'),
   tell:B('Read from the right again: the real domain is <b>com-file-share.ru</b>. "dropbox." is just a decoy label glued on the front.',
          '还是从右边读: 真正的域名是 <b>com-file-share.ru</b>。"dropbox." 只是粘在前面的诱饵标签。')},
  {id:'h8',isPhish:false,
   subject:B('Your file was successfully uploaded','您的文件已成功上传'),
   from:B('no-reply@dropbox.com','no-reply@dropbox.com'),
   snippet:B('report_final_v3.pdf uploaded to /Shared/Team.','report_final_v3.pdf 已上传至 /Shared/Team。'),
   tell:B('"dropbox.com" is the whole domain, nothing tacked onto the end. Clean.','"dropbox.com" 就是完整域名, 后面什么都没接。干净。')},
  {id:'h9',isPhish:true,
   subject:B('Mailbox full, click to expand storage','邮箱已满, 点击扩容'),
   from:B('it-support@bitvalley-academyy.cn','it-support@bitvalley-academyy.cn'),
   snippet:B('Your mailbox has reached 99% capacity and will stop receiving mail. Expand now.','您的邮箱容量已达 99%, 即将无法接收新邮件。请立即扩容。'),
   tell:B('Doubled letter typo-squat — "academ<b>yy</b>.cn". Also: real IT quota warnings almost never require you to click a link to "expand storage" yourself.',
          '重复字母打字仿冒——"academ<b>yy</b>.cn"。另外: 真正的 IT 配额提醒几乎不会要你自己点链接"扩容"。')},
  {id:'h10',isPhish:false,
   subject:B('Scheduled maintenance tonight 11pm-1am','今晚 23:00-01:00 系统维护'),
   from:B('it-support@bitvalley-academy.cn','it-support@bitvalley-academy.cn'),
   snippet:B('Email and file storage will be briefly unavailable during this window. No action needed.','此期间邮件与文件存储将短暂不可用, 无需任何操作。'),
   tell:B('Correctly spelled domain, and — the tell that\'s always true — it asks you to do <b>nothing</b>. Phishing always wants a click; maintenance notices rarely do.',
          '域名拼写正确, 而且——这条永远成立——它什么都<b>不要求你做</b>。钓鱼邮件永远想要一次点击; 维护通知很少需要。')}
];
var PHISH_PASS=8;        // 10 封 ≥8 对过关
var PHISH_PASS_HARD=9;   // ★挑战: 10 封 ≥9 对过关

function judgePhish(mail,action){ // action: 'block' | 'allow'
  if(!mail)return false;
  return mail.isPhish?(action==='block'):(action==='allow');
}
function scorePhishRound(mails,actions){ // actions: array same length, 'block'|'allow'
  var correct=0,detail=[];
  for(var i=0;i<mails.length;i++){
    var ok=judgePhish(mails[i],actions[i]);
    if(ok)correct++;
    detail.push({id:mails[i].id,ok:ok});
  }
  return {correct:correct,total:mails.length,detail:detail};
}

/* ---- 谜题2 · 防火墙规则谜题 (§6.1 firewall / packet filtering) ----
   规则: {action:'ALLOW'|'DENY', proto:'TCP'|'UDP'|'*', port:n|'*', src:'inside'|'outside'|'*'}
   匹配: 从上到下第一条匹配的规则生效; 全不匹配则走默认策略 (固定 DENY,
   即"默认拒绝原则")。 */
var DEFAULT_POLICY='DENY';

var FW_PACKETS=[
  {id:'p_web80',proto:'TCP',port:80,src:'outside',legit:true,
   label:B('Inbound web request · TCP 80 · from Outside','入站网页请求 · TCP 80 · 来自 Outside'),
   why:B('Public gate — anyone should be able to browse the noticeboard page.','公开入口——谁都该能翻到公告板页面。')},
  {id:'p_web443',proto:'TCP',port:443,src:'outside',legit:true,
   label:B('Inbound HTTPS · TCP 443 · from Outside','入站 HTTPS · TCP 443 · 来自 Outside'),
   why:B('Same gate, locked carriage. Also should get in.','同一道门, 锁好的车厢。也该放行。')},
  {id:'p_ssh_in',proto:'TCP',port:22,src:'inside',legit:true,
   label:B('Admin login · TCP 22 (SSH) · from Inside','管理员登录 · TCP 22 (SSH) · 来自 Inside'),
   why:B('The sysadmin, at their own desk, doing their actual job.','系统管理员, 在自己工位上, 干他该干的活。')},
  {id:'p_dns',proto:'UDP',port:53,src:'outside',legit:true,
   label:B('DNS reply · UDP 53 · from Outside','DNS 应答 · UDP 53 · 来自 Outside'),
   why:B('The bastion asked "what\'s this address" and this is the answer coming back.','要塞问了句"这地址是啥", 这是回信。')},
  {id:'p_telnet',proto:'TCP',port:23,src:'outside',legit:false,
   label:B('Telnet probe · TCP 23 · from Outside','Telnet 探测 · TCP 23 · 来自 Outside'),
   why:B('A protocol so old it ships passwords in plain text. Nobody legitimate still knocks with this.','古老到密码明文传输的协议。正经人不会用这个敲门。')},
  {id:'p_rdp',proto:'TCP',port:3389,src:'outside',legit:false,
   label:B('Remote desktop knock · TCP 3389 · from Outside','远程桌面敲门 · TCP 3389 · 来自 Outside'),
   why:B('RDP, hammered from the internet at 3am. Not a remote worker — a script.','RDP, 凌晨三点从公网猛敲。不是在家办公的员工, 是个脚本。')},
  {id:'p_chargen',proto:'UDP',port:19,src:'outside',legit:false,
   label:B('Chargen flood · UDP 19 · from Outside','Chargen 洪流 · UDP 19 · 来自 Outside'),
   why:B('A character-generator amplification attack. It wants to make the bastion shout at someone else.','字符生成器放大攻击。它想借要塞的嗓子对别人大喊大叫。')},
  {id:'p_smb',proto:'TCP',port:445,src:'outside',legit:false,
   label:B('SMB probe · TCP 445 · from Outside','SMB 探测 · TCP 445 · 来自 Outside'),
   why:B('The port a whole generation of worms used to let themselves in. Never from Outside.','一整代蠕虫都爱用的自助开门端口。绝不能来自 Outside。')},
  {id:'p_ssh_out',proto:'TCP',port:22,src:'outside',legit:false,
   label:B('SSH login attempt · TCP 22 · from Outside','SSH 登录尝试 · TCP 22 · 来自 Outside'),
   why:B('Same port as the admin above — different address. The gate should know the difference.','和上面管理员同一个端口——地址不同。城门得分得清。')}
];
var FW_RULE_LIMIT=5;
/* 参考正解 (提示末段用, 也是最小可行解: 4 条规则, 默认拒绝兜底其余) */
var FW_SOLUTION=[
  {action:'ALLOW',proto:'TCP',port:80,src:'outside'},
  {action:'ALLOW',proto:'TCP',port:443,src:'outside'},
  {action:'ALLOW',proto:'TCP',port:22,src:'inside'},
  {action:'ALLOW',proto:'UDP',port:53,src:'outside'}
];

/* ★挑战: 只给 3 条规则名额 —— 逼玩家学会用 src:'inside' 通配 + 依赖默认拒绝 */
var FW_PACKETS_CHAL=[
  {id:'c_web80',proto:'TCP',port:80,src:'outside',legit:true,
   label:B('Inbound web request · TCP 80 · from Outside','入站网页请求 · TCP 80 · 来自 Outside'),
   why:B('Public gate.','公开入口。')},
  {id:'c_web443',proto:'TCP',port:443,src:'outside',legit:true,
   label:B('Inbound HTTPS · TCP 443 · from Outside','入站 HTTPS · TCP 443 · 来自 Outside'),
   why:B('Same gate, locked carriage.','同一道门, 锁好的车厢。')},
  {id:'c_ssh_in',proto:'TCP',port:22,src:'inside',legit:true,
   label:B('Admin login · TCP 22 · from Inside','管理员登录 · TCP 22 · 来自 Inside'),
   why:B('Sysadmin at their own desk.','管理员在自己工位上。')},
  {id:'c_dns_in',proto:'UDP',port:53,src:'inside',legit:true,
   label:B('Internal DNS lookup · UDP 53 · from Inside','内部 DNS 查询 · UDP 53 · 来自 Inside'),
   why:B('The bastion\'s own resolver, asking a question from the inside.','要塞自己的解析器, 从内部发出的问询。')},
  {id:'c_telnet',proto:'TCP',port:23,src:'outside',legit:false,
   label:B('Telnet probe · TCP 23 · from Outside','Telnet 探测 · TCP 23 · 来自 Outside'),why:B('Ancient and plaintext.','古老且明文。')},
  {id:'c_rdp',proto:'TCP',port:3389,src:'outside',legit:false,
   label:B('Remote desktop knock · TCP 3389 · from Outside','远程桌面敲门 · TCP 3389 · 来自 Outside'),why:B('Brute-force season.','暴力破解季。')},
  {id:'c_chargen',proto:'UDP',port:19,src:'outside',legit:false,
   label:B('Chargen flood · UDP 19 · from Outside','Chargen 洪流 · UDP 19 · 来自 Outside'),why:B('Amplification attack.','放大攻击。')},
  {id:'c_smb',proto:'TCP',port:445,src:'outside',legit:false,
   label:B('SMB probe · TCP 445 · from Outside','SMB 探测 · TCP 445 · 来自 Outside'),why:B('The worm door.','蠕虫的自助门。')},
  {id:'c_ssh_out',proto:'TCP',port:22,src:'outside',legit:false,
   label:B('SSH login attempt · TCP 22 · from Outside','SSH 登录尝试 · TCP 22 · 来自 Outside'),why:B('Same port, wrong address.','同一端口, 不该来的地址。')}
];
var FW_RULE_LIMIT_CHAL=3;
var FW_SOLUTION_CHAL=[
  {action:'ALLOW',proto:'*',port:'*',src:'inside'},
  {action:'ALLOW',proto:'TCP',port:80,src:'outside'},
  {action:'ALLOW',proto:'TCP',port:443,src:'outside'}
];

function ruleMatches(rule,pkt){
  if(!rule||!pkt)return false;
  if(rule.proto!=='*'&&rule.proto!==pkt.proto)return false;
  if(rule.port!=='*'&&rule.port!==pkt.port)return false;
  if(rule.src!=='*'&&rule.src!==pkt.src)return false;
  return true;
}
function evalPacket(rules,pkt,defaultPolicy){
  rules=rules||[];
  for(var i=0;i<rules.length;i++){
    if(ruleMatches(rules[i],pkt))return rules[i].action;
  }
  return defaultPolicy||DEFAULT_POLICY;
}
function evalAll(rules,packets,defaultPolicy){
  var results=(packets||[]).map(function(p){
    var action=evalPacket(rules,p,defaultPolicy);
    var want=p.legit?'ALLOW':'DENY';
    return {id:p.id,action:action,want:want,correct:action===want};
  });
  return {results:results,allCorrect:results.every(function(r){return r.correct;})};
}

/* ---- 谜题3 · Boss: 恶意软件动物园越狱事件 (§6.1 malware) ----
   5 种标本, 每种一个"越狱事件"(症状描述), 玩家需同时答对:
   ① 是谁跑了 (identifyMalware) ② 怎么隔离 (correctAction)。
   两者都对才算"捕获"; 错了不惩罚, 只是它换个笼子继续逃。 */
var MALWARE_TYPES=[
  {id:'virus',name:B('Virus','病毒'),action:'antivirus',
   desc:B('Can\'t move without a host file. Watch it twitch, piggybacked on some innocent .exe.',
          '离了宿主文件就动不了。趴在某个无辜的 .exe 上一抽一抽地蹦。')},
  {id:'worm',name:B('Worm','蠕虫'),action:'disconnect',
   desc:B('No host needed. It just… copies itself. Across the whole rack. All by itself.',
          '不需要宿主, 就是……不停复制自己。爬满了整个机架。全靠自己。')},
  {id:'trojan',name:B('Trojan','木马'),action:'antivirus',
   desc:B('Wrapped like a present. You will want to open it. That is the entire attack.',
          '包装成礼物的样子。你会很想拆开它。这就是整套攻击。')},
  {id:'spyware',name:B('Spyware','间谍软件'),action:'antivirus',
   desc:B('Sits quietly in the corner, taking notes on everything you type.',
          '安安静静蹲在角落, 把你敲的每一个字都记下来。')},
  {id:'ransomware',name:B('Ransomware','勒索软件'),action:'restore',
   desc:B('Padlocks the cage itself and slides a ransom note under the door.',
          '直接把笼子锁死, 从门缝底下塞出一张赎金字条。')}
];
var CONTAIN_ACTIONS=[
  {id:'antivirus',label:B('Run anti-malware scan & disinfect','跑反恶意软件扫描 · 清除')},
  {id:'disconnect',label:B('Pull the cable — isolate it from the network NOW','拔网线——立刻物理隔离')},
  {id:'restore',label:B('Wipe & restore from last clean backup','擦除 · 用最近一次干净备份恢复')}
];
var ESCAPE_EVENTS=[
  {id:'ev_worm',typeId:'worm',
   symptom:B('"It doesn\'t need a host anymore — it copied itself and it\'s crawling all over the server room."',
             '「它不需要宿主了——自己复制了一份, 爬满了整个机房。」')},
  {id:'ev_trojan',typeId:'trojan',
   symptom:B('"It walked out disguised as a free antivirus update. Everyone held the door for it."',
             '「它伪装成免费杀毒更新走出去的。所有人都替它开了门。」')},
  {id:'ev_ransom',typeId:'ransomware',
   symptom:B('"Every cage on the block just relocked itself, and there\'s a note taped to the bars asking for Bitcoin."',
             '「整排笼子突然全部重新上锁, 栏杆上贴了张纸条, 管你要比特币。」')},
  {id:'ev_spy',typeId:'spyware',
   symptom:B('"We didn\'t even notice it was gone. It\'s been quietly copying the visitor logbook for weeks."',
             '「我们根本没发现它跑了。它已经安安静静抄了好几周的访客登记簿。」')},
  {id:'ev_virus',typeId:'virus',
   symptom:B('"It\'s gone — but so is the file it was riding on. Those two never travel apart."',
             '「它跑了——驮着它的那个文件也一起不见了。这两个从不分开走。」')}
];

function findMalwareType(id){for(var i=0;i<MALWARE_TYPES.length;i++)if(MALWARE_TYPES[i].id===id)return MALWARE_TYPES[i];return null;}
function findEvent(id){for(var i=0;i<ESCAPE_EVENTS.length;i++)if(ESCAPE_EVENTS[i].id===id)return ESCAPE_EVENTS[i];return null;}
function identifyMalware(eventId,typeId){var e=findEvent(eventId);return !!e&&e.typeId===typeId;}
function correctAction(typeId,actionId){var t=findMalwareType(typeId);return !!t&&t.action===actionId;}
function judgeCapture(eventId,typeId,actionId){return identifyMalware(eventId,typeId)&&correctAction(typeId,actionId);}
function bossRun(answers){ // answers: [{event,type,action}] 覆盖全部 ESCAPE_EVENTS 才算过关
  var captured={};
  (answers||[]).forEach(function(a){
    if(judgeCapture(a.event,a.type,a.action))captured[a.event]=true;
  });
  var need=ESCAPE_EVENTS.map(function(e){return e.id;});
  var got=need.filter(function(id){return captured[id];});
  return {captured:got.length,total:need.length,allCaptured:got.length===need.length};
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
var BTN_RED='background:#3a0a0a;color:#ff9c9c;border:1px solid #7a2f2f;padding:5px 12px;'+
        'font-family:inherit;font-size:13px;cursor:pointer;letter-spacing:1px;border-radius:2px;';
var SEL='background:#0a1f0a;color:#7CFC00;border:1px solid #2f6f2f;padding:3px 6px;'+
        'font-family:inherit;font-size:12px;border-radius:2px;';
var TXT='color:#bfeebf;font-size:13px;line-height:1.7;';
var DIM='color:#4a7a4a;font-size:11.5px;';
var K='color:#ffce3a;';

/* 提示系统: 三段递进; onKey('?') 亦可触发; .max() 直接跳到末段(近乎给答案) */
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
  try{api&&api.onFail&&api.onFail(pid);}catch(e){}
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
/* 两处主线谜题(射击场+防火墙)都清了, 动物园的旧锁才松 —— 收尾+新钩子 */
function afterGateCheck(api){
  if(FLAG(api,'sec_phish_done')&&FLAG(api,'sec_fw_done')&&!FLAG(api,'sec_zoo_unlocked')){
    SET(api,'sec_zoo_unlocked');
    TOAST(api,B('Somewhere below, iron groans — the Zoo\'s old locks just gave up one layer. Watchdog left the keys on the counter, like it always meant to.',
                '地底深处传来铁器呻吟——动物园的旧锁松了一层。看门狗把钥匙放在柜台上, 像是早就想好了。'),true);
  }
}
/* Watchdog 的"插话": 失败时按日志格式吠一句, 挂在各谜题的错误反馈里 */
function watchdogBark(kind){
  var lines={
    falsepos:B('[WATCHDOG] WARN false_positive=1 target=legit_mail — <span class="dim">(a long, wounded howl)</span>',
               '[WATCHDOG] WARN 误伤=1 目标=合法邮件 —— <span class="dim">(一声悠长又受伤的嗷呜)</span>'),
    falseneg:B('[WATCHDOG] ERROR threat_passed=1 — <span class="dim">(low growl, ears flat)</span>',
               '[WATCHDOG] ERROR 威胁放行=1 —— <span class="dim">(低吼, 耳朵贴平)</span>'),
    breach:B('[WATCHDOG] ALERT unauthorized_ingress — <span class="dim">(scrambles to the gate, barking log lines)</span>',
             '[WATCHDOG] ALERT 未授权闯入 —— <span class="dim">(冲到城门口, 吠出一行行日志)</span>'),
    lockout:B('[WATCHDOG] WARN legit_traffic_denied — <span class="dim">(whines apologetically at the shut gate)</span>',
              '[WATCHDOG] WARN 合法流量被拒 —— <span class="dim">(对着紧闭的城门歉意地哼哼)</span>')
  };
  return lines[kind]||B('','');
}

/* ================================================================
   2. 谜题 1 · 钓鱼鉴别射击场 (§6.1 phishing & pharming)
   ================================================================ */
function renderPhish(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:520px;max-width:700px;'+TXT);
  header(wrap,tx('Junk Traffic Range · Phishing Gallery','垃圾流量靶场 · 钓鱼鉴别射击场'),'SEG .phish');

  if(FLAG(api,'sec_phish_done')){
    mk(wrap,'div','',
      tx('The range gate rolls shut behind the last shot. A scoreboard glows: <span style="'+K+'">'+
         (FLAG(api,'sec_phish_score')||PHISH_PASS)+' / '+PHISH_MAILS.length+'</span>.<br>'+
         '<span style="'+DIM+'">Outside the walls, the rejected mail keeps piling into the Junk Traffic Wasteland. It has its own weather system now.</span>',
         '打靶场大门在最后一枪后缓缓合拢。记分牌亮着: <span style="'+K+'">'+
         (FLAG(api,'sec_phish_score')||PHISH_PASS)+' / '+PHISH_MAILS.length+'</span>。<br>'+
         '<span style="'+DIM+'">墙外, 被拦下的邮件还在往垃圾流量荒原上堆。那地方现在都有自己的天气系统了。</span>'));
    var bar=mk(wrap,'div','margin-top:10px;display:flex;gap:10px;');
    if(FLAG(api,'sec_challenge_1')){
      mk(wrap,'div','margin-top:8px;'+K+'font-size:12px;',
        tx('★ Challenge cleared: Homoglyph & Subdomain-Spoof round, 9/10 or better.',
           '★ 挑战已通关: 同形异义字符 / 子域名伪装轮, 10 中 9 以上。'));
    }else{
      mk(bar,'button',BTN_GOLD,tx('★ Challenge: Look Closer','★ 挑战: 再看仔细点')).onclick=function(){renderPhishChal(el,api);};
    }
    mk(bar,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }

  mk(wrap,'div','',
    tx('A conveyor of "mail" flies past the firing slit. Ten pieces, one round: <span style="'+K+'">shoot down phishing</span> (fake), '+
       '<span style="'+K+'">let real mail through</span>. Score <span style="'+K+'">'+PHISH_PASS+' / 10</span> or better to pass.<br>'+
       '<span style="'+DIM+'">Classic tells live in the small print: spoofed domains, invented urgency, "too good to be true", weird attachment names. '+
       'Read the sender address like it owes you money.</span>',
       '一条传送带载着"邮件"从射击口飞过。十封一轮: <span style="'+K+'">击落钓鱼邮件</span>(假的), '+
       '<span style="'+K+'">放行正常邮件</span>(真的)。命中 <span style="'+K+'">'+PHISH_PASS+' / 10</span> 及以上算过关。<br>'+
       '<span style="'+DIM+'">经典破绽都藏在细节里: 仿冒域名、人造的紧迫感、天上掉馅饼、诡异的附件名。'+
       '读发件地址要像它欠你钱一样仔细。</span>'));

  var idx=0,correct=0,busy=false;
  var stage=mk(wrap,'div','margin:12px 0;border:1px solid #2f6f2f;background:rgba(10,20,10,.5);padding:10px 12px;min-height:120px;');
  var progress=mk(wrap,'div',DIM+'margin-bottom:4px;','');
  var msg=mk(wrap,'div','min-height:40px;font-size:12px;color:#ffce3a;line-height:1.6;');
  var ctl=mk(wrap,'div','display:flex;gap:10px;margin-top:6px;');

  function drawProgress(){progress.textContent=tx('Round ','轮次 ')+(idx+1)+' / '+PHISH_MAILS.length+'   '+tx('hits ','命中 ')+correct;}
  function drawMail(m){
    stage.innerHTML='<div style="'+DIM+'">'+tx('FROM','发件人')+'</div>'+
      '<div style="color:#e8c46a;font-size:13px;margin-bottom:6px;">'+T(m.from)+'</div>'+
      '<div style="'+DIM+'">'+tx('SUBJECT','主题')+'</div>'+
      '<div style="color:#bfeebf;font-size:14px;margin-bottom:6px;"><b>'+T(m.subject)+'</b></div>'+
      '<div style="'+DIM+'">'+tx('BODY','正文')+'</div>'+
      '<div style="color:#8fbf8f;font-size:12.5px;">'+T(m.snippet)+'</div>';
  }
  function next(){
    if(idx>=PHISH_MAILS.length){finish();return;}
    drawProgress();drawMail(PHISH_MAILS[idx]);msg.innerHTML='';busy=false;
  }
  function act(action){
    if(busy)return;busy=true;
    var m=PHISH_MAILS[idx];
    var ok=judgePhish(m,action);
    if(ok){
      correct++;S(api,'step');
      msg.innerHTML='<span style="color:#7CFC00;">✓</span> '+T(m.tell);
    }else{
      S(api,'err');
      var kind=(action==='block')?'falsepos':'falseneg'; // 击落了真邮件 vs 放走了假邮件
      msg.innerHTML='<span style="color:#ff8080;">✗</span> '+T(m.tell)+'<br>'+T(watchdogBark(kind));
    }
    idx++;
    setTimeout(next,1050);
  }
  ctl.innerHTML='';
  mk(ctl,'button',BTN_HOT,tx('🔫 Shoot down (phishing)','🔫 击落 (是钓鱼)')).onclick=function(){act('block');};
  mk(ctl,'button',BTN,tx('✅ Let through (looks legit)','✅ 放行 (像是真的)')).onclick=function(){act('allow');};
  mk(wrap,'div',DIM+'margin-top:2px;',tx('(judgment locks in for 1s after each shot — read the tell before the next one flies in)',
                                          '(每次判定后锁定约 1 秒——趁下一封飞来前把破绽读一遍)'));
  next();

  function finish(){
    stage.innerHTML='';ctl.innerHTML='';
    SET(api,'sec_phish_score',correct);
    if(correct>=PHISH_PASS){
      S(api,'ok');
      msg.innerHTML=tx('<b>'+correct+' / '+PHISH_MAILS.length+'</b> — range cleared.','<b>'+correct+' / '+PHISH_MAILS.length+'</b> ——打靶场清场。');
      SET(api,'sec_phish_done');STEP(api,'sec_m1');afterGateCheck(api);
      TOAST(api,B('The conveyor stops. Watchdog trots over and, for once, does not bark — just leans its whole weight against your leg.',
                  '传送带停了。看门狗小跑过来, 难得没有叫——只是把整个身子靠在你腿上。'),true);
      var b=mk(wrap,'div','margin-top:8px;');
      mk(b,'button',BTN,tx('Continue','继续')).onclick=function(){renderPhish(el,api);};
    }else{
      S(api,'err');
      bumpFail(api,'sec_phish_fails','sec_phish',B(
        '[WATCHDOG] INFO — (it stops barking and rests its chin on your knee) I misread these for twenty years too, kid. The first hundred are the hard ones. I nudged the hint down to its plainest. Read the sender domain, breathe, run it once more.',
        '[WATCHDOG] INFO —— (它不叫了, 把下巴搁在你膝盖上) 这些, 我也看走眼过二十年, 孩子。头一百封最难。我把提示挪到最直白那句了。看发件域名, 喘口气, 再跑一轮。'));
      msg.innerHTML=tx('<b>'+correct+' / '+PHISH_MAILS.length+'</b> — under '+PHISH_PASS+'. The belt resets and runs again.',
                        '<b>'+correct+' / '+PHISH_MAILS.length+'</b> ——没到 '+PHISH_PASS+' 分。传送带重置, 再来一轮。');
      var b=mk(wrap,'div','margin-top:8px;');
      mk(b,'button',BTN_HOT,tx('Run it again','再来一轮')).onclick=function(){renderPhish(el,api);};
    }
  }

  addHints(wrap,'sec_phish',[
    B('Read the <b>sender domain</b> first, always — not the display name, the part after the @. Urgency ("act now!", countdowns) and "too good to be true" prizes are the second big flag.',
      '永远先看<b>发件域名</b>——不是显示名, 是 @ 后面那部分。"立即行动"式的紧迫感和"天上掉馅饼"是第二大信号。'),
    B('Compare letters carefully: <b>paypa1.com</b> (digit 1), <b>micros0ft-security.com</b> (digit 0) are look-alike domains, not the real thing. Ordinary emails almost never demand your password or card number.',
      '仔细比对字母: <b>paypa1.com</b>(数字 1)、<b>micros0ft-security.com</b>(数字 0) 都是形似域名, 不是真的。正常邮件几乎不会索要密码或卡号。'),
    B('The answer key, mail by mail: m1 phish(typo domain) · m2 legit · m3 phish(too-good+fake urgency) · m4 legit · m5 phish(typo domain) · m6 legit · m7 phish(double extension+fake domain) · m8 legit · m9 phish(gift-card scam) · m10 legit.',
      '逐封答案: m1 钓鱼(仿冒域名) · m2 真 · m3 钓鱼(天上掉馅饼+假紧迫) · m4 真 · m5 钓鱼(仿冒域名) · m6 真 · m7 钓鱼(双扩展名+假域名) · m8 真 · m9 钓鱼(礼品卡骗局) · m10 真。')
  ]);
}

/* ---- ★挑战: 同形异义字符 / 子域名伪装 (更隐蔽的破绽) ---- */
function renderPhishChal(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:520px;max-width:700px;'+TXT);
  header(wrap,tx('★ Challenge · Look Closer','★ 挑战 · 再看仔细点'),'HOMOGLYPH · SUBDOMAIN');
  mk(wrap,'div','',
    tx('Watchdog slides over a meaner belt: <span style="'+K+'">look-alike letters and fake subdomains</span>. Score <span style="'+K+'">'+
       PHISH_PASS_HARD+' / 10</span> to pass.<br><span style="'+DIM+'">Tip: read domains from the RIGHT — the real domain is whatever sits just before the final ".com/.net/.cn". Everything to its left is a label anyone can invent.</span>',
       '看门狗推来一条更狠的传送带: <span style="'+K+'">形似字母与伪造子域名</span>。命中 <span style="'+K+'">'+
       PHISH_PASS_HARD+' / 10</span> 过关。<br><span style="'+DIM+'">提示: 域名要从<b>右边</b>往左读——紧挨着最后 ".com/.net/.cn" 前面那段才是真域名, 左边的都是谁都能起的标签。</span>'));

  var idx=0,correct=0,busy=false;
  var stage=mk(wrap,'div','margin:12px 0;border:1px solid #c9a24a;background:rgba(40,30,5,.25);padding:10px 12px;min-height:120px;');
  var progress=mk(wrap,'div',DIM+'margin-bottom:4px;','');
  var msg=mk(wrap,'div','min-height:40px;font-size:12px;color:#ffce3a;line-height:1.6;');
  var ctl=mk(wrap,'div','display:flex;gap:10px;margin-top:6px;');

  function drawProgress(){progress.textContent=tx('Round ','轮次 ')+(idx+1)+' / '+PHISH_MAILS_HARD.length+'   '+tx('hits ','命中 ')+correct;}
  function drawMail(m){
    stage.innerHTML='<div style="'+DIM+'">'+tx('FROM','发件人')+'</div>'+
      '<div style="color:#e8c46a;font-size:13px;margin-bottom:6px;">'+T(m.from)+'</div>'+
      '<div style="'+DIM+'">'+tx('SUBJECT','主题')+'</div>'+
      '<div style="color:#bfeebf;font-size:14px;margin-bottom:6px;"><b>'+T(m.subject)+'</b></div>'+
      '<div style="'+DIM+'">'+tx('BODY','正文')+'</div>'+
      '<div style="color:#8fbf8f;font-size:12.5px;">'+T(m.snippet)+'</div>';
  }
  function next(){
    if(idx>=PHISH_MAILS_HARD.length){finish();return;}
    drawProgress();drawMail(PHISH_MAILS_HARD[idx]);msg.innerHTML='';busy=false;
  }
  function act(action){
    if(busy)return;busy=true;
    var m=PHISH_MAILS_HARD[idx];
    var ok=judgePhish(m,action);
    if(ok){correct++;S(api,'step');msg.innerHTML='<span style="color:#7CFC00;">✓</span> '+T(m.tell);}
    else{S(api,'err');msg.innerHTML='<span style="color:#ff8080;">✗</span> '+T(m.tell);}
    idx++;setTimeout(next,1150);
  }
  ctl.innerHTML='';
  mk(ctl,'button',BTN_HOT,tx('🔫 Shoot down (phishing)','🔫 击落 (是钓鱼)')).onclick=function(){act('block');};
  mk(ctl,'button',BTN,tx('✅ Let through (looks legit)','✅ 放行 (像是真的)')).onclick=function(){act('allow');};
  next();

  function finish(){
    stage.innerHTML='';ctl.innerHTML='';
    if(correct>=PHISH_PASS_HARD){
      S(api,'quest');SET(api,'sec_challenge_1');
      msg.innerHTML=tx('<b>'+correct+' / '+PHISH_MAILS_HARD.length+'</b> — you read domains right-to-left now. Most people never learn to.',
                        '<b>'+correct+' / '+PHISH_MAILS_HARD.length+'</b> ——你现在会从右往左读域名了。大多数人一辈子学不会这个。');
      TOAST(api,B('Watchdog\'s tail does something it hasn\'t done in a while.','看门狗的尾巴做了个它很久没做过的动作。'),true);
      var b=mk(wrap,'div','margin-top:8px;');
      mk(b,'button',BTN,tx('Back','返回')).onclick=function(){renderPhish(el,api);};
    }else{
      msg.innerHTML=tx('<b>'+correct+' / '+PHISH_MAILS_HARD.length+'</b> — under '+PHISH_PASS_HARD+'. Optional round; the main gate stays open either way.',
                        '<b>'+correct+' / '+PHISH_MAILS_HARD.length+'</b> ——没到 '+PHISH_PASS_HARD+'。纯选做, 没过也不影响主线。');
      var b=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;');
      mk(b,'button',BTN_HOT,tx('Try again','再试一次')).onclick=function(){renderPhishChal(el,api);};
      mk(b,'button',BTN,tx('Back','返回')).onclick=function(){renderPhish(el,api);};
    }
  }
}

/* ================================================================
   3. 谜题 2 · 防火墙规则谜题 (§6.1 firewall)
   ================================================================ */
function breachShow(host,kind){ // kind: 'leak'(恶意包混进) | 'lockout'(合法包被挡)
  var box=mk(host,'div','margin:8px 0;padding:8px;border:1px solid '+(kind==='leak'?'#7a2f2f':'#7a5a2f')+
    ';background:rgba('+(kind==='leak'?'40,5,5':'40,25,5')+',.4);text-align:center;');
  var pre=mk(box,'pre','margin:0;color:'+(kind==='leak'?'#ff9c9c':'#ffce9c')+';font-size:13px;line-height:1.3;font-family:inherit;','');
  var frames=(kind==='leak')
    ?['  ┌──▓──┐\n  │ gate │\n  └──▓──┘','  ┌──▒──┐\n  │ gate │\n  └──░──┘','  ┌─────┐\n  │ IN!  │\n  └─────┘']
    :['  ┌──█──┐\n  │ gate │\n  └──█──┘','  ┌──█──┐\n  │DENIED│\n  └──█──┘'];
  var i=0,n=0;
  var tm=setInterval(function(){
    pre.textContent=frames[i++%frames.length];
    if(++n>=6){
      clearInterval(tm);
      var cap=mk(box,'div','color:#ffce3a;font-size:12px;margin-top:4px;','');
      cap.innerHTML=(kind==='leak')
        ?tx('A hostile packet strolls through the open gate and spray-paints the noticeboard.<br><span style="'+DIM+'">'+T(watchdogBark('breach'))+'</span>',
            '一个恶意包大摇大摆走进城门, 在公告板上喷了漆。<br><span style="'+DIM+'">'+T(watchdogBark('breach'))+'</span>')
        :tx('A legitimate visitor gets turned away at the gate, muttering about paperwork.<br><span style="'+DIM+'">'+T(watchdogBark('lockout'))+'</span>',
            '一个合法访客在城门口被拦下, 嘟囔着什么手续问题走了。<br><span style="'+DIM+'">'+T(watchdogBark('lockout'))+'</span>');
    }
  },160);
  return box;
}

var FW_PORTS=['*','19','22','23','53','80','443','445','3389'];
function fwRuleRow(container,rule,onChange,onRemove){
  var row=mk(container,'div','display:flex;gap:6px;align-items:center;margin-bottom:5px;');
  function sel(opts,val,onSet){
    var s=mk(row,'select',SEL);
    opts.forEach(function(o){
      var op=document.createElement('option');op.value=o.v;op.textContent=o.t;
      if(String(o.v)===String(val))op.selected=true;
      s.appendChild(op);
    });
    s.onchange=function(){onSet(s.value);onChange();};
    return s;
  }
  sel([{v:'ALLOW',t:'ALLOW'},{v:'DENY',t:'DENY'}],rule.action,function(v){rule.action=v;});
  mk(row,'span',DIM,tx('proto','协议'));
  sel([{v:'*',t:'*'},{v:'TCP',t:'TCP'},{v:'UDP',t:'UDP'}],rule.proto,function(v){rule.proto=v;});
  mk(row,'span',DIM,tx('port','端口'));
  sel(FW_PORTS.map(function(p){return {v:p,t:p};}),rule.port,function(v){rule.port=(v==='*')?'*':parseInt(v,10);});
  mk(row,'span',DIM,tx('from','来自'));
  sel([{v:'*',t:'*'},{v:'inside',t:tx('inside','inside 内网')},{v:'outside',t:tx('outside','outside 外网')}],rule.src,function(v){rule.src=v;});
  var rm=mk(row,'button',BTN_RED,'✕');
  rm.onclick=function(){onRemove();};
  return row;
}

function renderFirewall(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:600px;max-width:780px;'+TXT);
  header(wrap,tx('Gate Control Room · Firewall Rules','城门控制室 · 防火墙规则'),'SEG .fw');

  if(FLAG(api,'sec_fw_done')){
    mk(wrap,'div','',
      tx('The ruleset is bolted in. Nine packets an hour try the gate; four get through, five bounce off a wall that was never even written down for them — '+
         '<span style="'+K+'">default policy: DENY</span>.<br><span style="'+DIM+'">Guilty until explicitly allowed. That\'s the whole trick.</span>',
         '规则表已经钉死。每小时九个包来试城门, 四个进得去, 五个撞在一堵从没为它们专门写过规则的墙上——'+
         '<span style="'+K+'">默认策略: DENY</span>。<br><span style="'+DIM+'">未经明确允许, 一律有罪。诀窍就这一句。</span>'));
    var bar=mk(wrap,'div','margin-top:10px;display:flex;gap:10px;');
    if(FLAG(api,'sec_challenge_2')){
      mk(wrap,'div','margin-top:8px;'+K+'font-size:12px;',
        tx('★ Challenge cleared: full policy in 3 rules or fewer.',
           '★ 挑战已通关: 3 条以内规则搞定全部策略。'));
    }else{
      mk(bar,'button',BTN_GOLD,tx('★ Challenge: Three Rules Only','★ 挑战: 只给 3 条规则')).onclick=function(){renderFirewallChal(el,api);};
    }
    mk(bar,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }

  mk(wrap,'div','',
    tx('Nine packets are queued at the gate (see below). Write <span style="'+K+'">3–5 rules</span>: '+
       '<code style="'+K+'">[ALLOW|DENY] [TCP|UDP|*] port [n|*] from [inside|outside|*]</code>.<br>'+
       'Rules are checked <span style="'+K+'">top to bottom — first match wins</span>. Anything that matches nothing hits the '+
       '<span style="'+K+'">default policy: DENY</span>. You never have to write a rule for every attacker — you only have to write one for everyone you trust.',
       '城门口排着九个包 (见下方)。写 <span style="'+K+'">3–5 条规则</span>: '+
       '<code style="'+K+'">[ALLOW|DENY] [TCP|UDP|*] 端口 [n|*] 来自 [inside|outside|*]</code>。<br>'+
       '规则从<span style="'+K+'">上到下检查——第一条匹配的生效</span>。谁都不匹配就撞上'+
       '<span style="'+K+'">默认策略: DENY</span>。你不需要给每个攻击者都写一条规则——只需要给每个你信任的人写一条。</span>'));

  var pkList=mk(wrap,'div','margin:10px 0;border:1px solid #1f3f1f;padding:8px;font-size:12px;max-height:150px;overflow:auto;');
  pkList.innerHTML=FW_PACKETS.map(function(p){
    return '<div style="padding:2px 0;color:#8fbf8f;">'+T(p.label)+' <span style="'+DIM+'">— '+T(p.why)+'</span></div>';
  }).join('');

  var rules=[{action:'ALLOW',proto:'*',port:'*',src:'outside'}];
  var ruleBox=mk(wrap,'div','margin:10px 0;');
  var addBar=mk(wrap,'div','display:flex;gap:10px;margin-bottom:6px;');
  var addBtn=mk(addBar,'button',BTN,'+ '+tx('Add rule','添加规则'));
  var cnt=mk(addBar,'span',DIM,'');
  var msg=mk(wrap,'div','min-height:20px;font-size:12px;color:#ffce3a;');
  var fx=mk(wrap,'div','');

  function drawRules(){
    ruleBox.innerHTML='';
    rules.forEach(function(r,i){
      fwRuleRow(ruleBox,r,drawRules,function(){rules.splice(i,1);drawRules();});
    });
    cnt.textContent=rules.length+' / '+FW_RULE_LIMIT+' '+tx('rules','条规则');
    addBtn.disabled=(rules.length>=FW_RULE_LIMIT);
    addBtn.style.opacity=addBtn.disabled?'0.4':'1';
  }
  addBtn.onclick=function(){
    if(rules.length>=FW_RULE_LIMIT)return;
    rules.push({action:'ALLOW',proto:'*',port:'*',src:'outside'});drawRules();
  };
  drawRules();

  var foot=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;');
  mk(foot,'button',BTN_HOT,tx('▶ Deploy ruleset','▶ 部署规则')).onclick=function(){
    fx.innerHTML='';
    var r=evalAll(rules,FW_PACKETS,DEFAULT_POLICY);
    if(r.allCorrect){
      S(api,'ok');SET(api,'sec_fw_done');STEP(api,'sec_m2');afterGateCheck(api);
      TOAST(api,B('The gate slams down on everything that isn\'t on the list — and swings wide for everything that is. Watchdog checks the log once, then stops checking.',
                  '城门对所有不在名单上的东西狠狠关上——对所有在名单上的东西又敞得大大的。看门狗查了一遍日志, 然后就不再查了。'),true);
      msg.innerHTML=tx('✓ All 9 packets correctly handled.','✓ 全部 9 个包处理正确。');
      var b=mk(wrap,'div','margin-top:8px;');
      mk(b,'button',BTN,tx('Continue','继续')).onclick=function(){renderFirewall(el,api);};
      return;
    }
    S(api,'err');
    bumpFail(api,'sec_fw_fails','sec_fw',B(
      '[WATCHDOG] INFO — (it lies down beside the console) I judged this gate wrong more nights than I judged it right. Default-deny does the hard part for you: write ALLOW only for who you trust, let the rest fall through. Plainest hint is open. No rush — the wall is patient, and so, finally, am I.',
      '[WATCHDOG] INFO —— (它在控制台旁趴下) 这道门, 我判错的夜晚比判对的还多。默认拒绝会替你干最难那部分: 只给信任的人写 ALLOW, 剩下的让它们自己掉进去。最直白的提示我开好了。不急——墙有耐心, 如今我也总算有了。'));
    var bad=r.results.filter(function(x){return !x.correct;})[0];
    var pkt=FW_PACKETS.filter(function(p){return p.id===bad.id;})[0];
    var kind=(bad.action==='ALLOW')?'leak':'lockout'; // 该拒的被放 vs 该放的被拒
    breachShow(fx,kind);
    var wrongCount=r.results.filter(function(x){return !x.correct;}).length;
    msg.innerHTML=tx('✗ '+wrongCount+' packet(s) mishandled. First offender: <b>'+T(pkt.label)+'</b> got <b>'+bad.action+
                      '</b>, should be <b>'+bad.want+'</b>.',
                      '✗ '+wrongCount+' 个包处理错误。首个: <b>'+T(pkt.label)+'</b> 判成了 <b>'+bad.action+
                      '</b>, 应该是 <b>'+bad.want+'</b>。');
  };
  mk(foot,'button',BTN,tx('Leave','离开')).onclick=function(){api.closePanel&&api.closePanel();};

  addHints(wrap,'sec_fw',[
    B('Rules run top-to-bottom, <b>first match wins</b>. Anything nobody wrote a rule for falls through to <b>default DENY</b> — so you only need ALLOW rules for what you trust, not DENY rules for every attacker.',
      '规则从上到下走, <b>第一条匹配的生效</b>。没人写规则管的包会掉进<b>默认 DENY</b>——所以你只需要为信任的流量写 ALLOW, 不需要为每个攻击者都写 DENY。'),
    B('You need exactly four kinds of "yes": web (TCP 80 & 443) from outside, admin SSH (TCP 22) from inside only, and DNS (UDP 53) from outside. Everything else on the list is an attack and should simply have no matching rule.',
      '你只需要四种"放行": 来自 outside 的网页流量 (TCP 80 与 443)、只来自 inside 的管理员 SSH (TCP 22)、来自 outside 的 DNS (UDP 53)。列表里剩下的全是攻击, 不写规则、让它们摔进默认拒绝就好。'),
    B('The 4-rule answer: ALLOW TCP 80 from outside · ALLOW TCP 443 from outside · ALLOW TCP 22 from inside · ALLOW UDP 53 from outside. Notice there is no rule at all for SSH-from-outside — the default policy handles it.',
      '4 条参考答案: ALLOW TCP 80 来自 outside · ALLOW TCP 443 来自 outside · ALLOW TCP 22 来自 inside · ALLOW UDP 53 来自 outside。注意"来自 outside 的 SSH"根本没有专门规则——默认策略自动接管。')
  ]);
}

/* ---- ★挑战: 只给 3 条规则名额 ---- */
function renderFirewallChal(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:600px;max-width:780px;'+TXT);
  header(wrap,tx('★ Challenge · Three Rules Only','★ 挑战 · 只给 3 条规则'),'MINIMAL RULESET');
  mk(wrap,'div','',
    tx('Same nine packets (DNS and admin SSH now both originate from Inside). Watchdog\'s budget got cut: <span style="'+K+'">3 rules, no more</span>.<br>'+
       '<span style="'+DIM+'">"If you need a rule for every single thing, you\'ve misunderstood default-deny." — the terminal that never sleeps</span>',
       '还是那九个包 (这次 DNS 和管理员 SSH 都改成来自 Inside)。看门狗的预算被砍了: <span style="'+K+'">只给 3 条规则</span>。<br>'+
       '<span style="'+DIM+'">「如果你觉得每样东西都要单写一条规则, 那你还没理解默认拒绝。」——那台从不休眠的终端</span>'));

  var pkList=mk(wrap,'div','margin:10px 0;border:1px solid #c9a24a;padding:8px;font-size:12px;max-height:150px;overflow:auto;');
  pkList.innerHTML=FW_PACKETS_CHAL.map(function(p){
    return '<div style="padding:2px 0;color:#8fbf8f;">'+T(p.label)+' <span style="'+DIM+'">— '+T(p.why)+'</span></div>';
  }).join('');

  var rules=[{action:'ALLOW',proto:'*',port:'*',src:'inside'}];
  var ruleBox=mk(wrap,'div','margin:10px 0;');
  var addBar=mk(wrap,'div','display:flex;gap:10px;margin-bottom:6px;');
  var addBtn=mk(addBar,'button',BTN,'+ '+tx('Add rule','添加规则'));
  var cnt=mk(addBar,'span',DIM,'');
  var msg=mk(wrap,'div','min-height:20px;font-size:12px;color:#ffce3a;');

  function drawRules(){
    ruleBox.innerHTML='';
    rules.forEach(function(r,i){
      fwRuleRow(ruleBox,r,drawRules,function(){rules.splice(i,1);drawRules();});
    });
    cnt.textContent=rules.length+' / '+FW_RULE_LIMIT_CHAL+' '+tx('rules','条规则');
    addBtn.disabled=(rules.length>=FW_RULE_LIMIT_CHAL);
    addBtn.style.opacity=addBtn.disabled?'0.4':'1';
  }
  addBtn.onclick=function(){
    if(rules.length>=FW_RULE_LIMIT_CHAL)return;
    rules.push({action:'ALLOW',proto:'*',port:'*',src:'outside'});drawRules();
  };
  drawRules();

  var foot=mk(wrap,'div','margin-top:8px;display:flex;gap:10px;');
  mk(foot,'button',BTN_HOT,tx('▶ Deploy ruleset','▶ 部署规则')).onclick=function(){
    var r=evalAll(rules,FW_PACKETS_CHAL,DEFAULT_POLICY);
    if(r.allCorrect){
      S(api,'quest');SET(api,'sec_challenge_2');
      msg.innerHTML=tx('✓ All 9 packets, 3 rules. Turns out "trust the whole inside, vet the outside port by port" was the entire syllabus point.',
                        '✓ 9 个包, 3 条规则全搞定。原来"整个内网可信, 外网逐端口审"就是这道题想教的全部道理。');
      TOAST(api,B('Watchdog looks at the three-line ruleset for a long moment, then at you. "…Efficient," it barks, in a tone it has never used before.',
                  '看门狗盯着这三行规则看了很久, 又看看你。「……高效。」它用一种从没用过的语气吠了一声。'),true);
      var b=mk(wrap,'div','margin-top:8px;');
      mk(b,'button',BTN,tx('Back','返回')).onclick=function(){renderFirewall(el,api);};
      return;
    }
    S(api,'err');
    var bad=r.results.filter(function(x){return !x.correct;})[0];
    msg.innerHTML=tx('✗ Not quite — packet <b>'+bad.id+'</b> got <b>'+bad.action+'</b>, wanted <b>'+bad.want+
                      '</b>. Think about which zone can be trusted wholesale.',
                      '✗ 还不对——包 <b>'+bad.id+'</b> 判成了 <b>'+bad.action+'</b>, 应为 <b>'+bad.want+
                      '</b>。想想哪个区域可以被整体信任。');
  };
  mk(foot,'button',BTN,tx('Back','返回')).onclick=function(){renderFirewall(el,api);};
}

/* ================================================================
   4. 谜题 3 · Boss: 恶意软件动物园越狱事件 (§6.1 malware)
   ================================================================ */
function renderZoo(el,api){
  el.innerHTML='';
  var wrap=mk(el,'div','padding:14px 18px;min-width:560px;max-width:740px;'+TXT);
  header(wrap,tx('The Malware Zoo · Jailbreak','恶意软件动物园 · 越狱事件'),'BOSS');

  if(!FLAG(api,'sec_zoo_unlocked')){
    mk(wrap,'div','',
      tx('The cage-room door is bolted three ways. A note in Watchdog\'s handwriting (all caps, naturally): '+
         '<span style="'+K+'">"NOT UNTIL THE RANGE AND THE GATE ARE CLEAN. — WATCHDOG"</span>',
         '笼室的门上了三道锁。看门狗的笔迹(理所当然全是大写): <span style="'+K+'">「靶场和城门都清干净之前, 别想。——看门狗」</span>'));
    mk(wrap,'div','margin-top:10px;').appendChild(mk(null,'button',BTN,tx('Leave','离开')));
    wrap.lastChild.firstChild.onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }

  if(FLAG(api,'sec_zoo_done')){
    mk(wrap,'div','',
      tx('Five cages, five fresh locks. The escapees are back where they belong, and the <span style="'+K+'">Security Certificate</span> sits warm in your pack.<br>'+
         '<span style="'+DIM+'">The old trojan in the corner cage gives you a slow, approving nod. It would know.</span>',
         '五个笼子, 五把新锁。逃犯们都回到了该待的地方, <span style="'+K+'">安全证书 Security Certificate</span> 在你包里还带着余温。<br>'+
         '<span style="'+DIM+'">角落笼子里的老木马朝你缓缓点了点头, 一副"内行"的表情。它确实是内行。</span>'));
    mk(wrap,'div','margin-top:10px;').appendChild(mk(null,'button',BTN,tx('Leave','离开')));
    wrap.lastChild.firstChild.onclick=function(){api.closePanel&&api.closePanel();};
    return;
  }

  /* CO-5 · Boss 前的一拍安静: 全程全大写咆哮的看门狗, 忽然掉了大写 */
  if(!FLAG(api,'sec_zoo_hush')){
    SET(api,'sec_zoo_hush');
    TOAST(api,B('[WATCHDOG] …(the all-caps drops out of its voice, all at once) Before you open these — one thing, once. The old trojan in the corner cage? Twenty years ago it walked out of THIS zoo wearing my own clearance badge. I signed it out myself. …That is why I have never slept. Okay. Okay. Open the cages. I am right behind you.',
                '[WATCHDOG] ……(它嗓子里的全大写, 一下子全掉了) 开笼子之前——有句话, 只说一次。角落笼子里那只老木马? 二十年前, 它就是戴着我的权限牌, 从这座动物园大摇大摆走出去的。放行, 是我亲手签的。……这就是我从没睡过的原因。好了。好了。开笼吧。我就在你身后。'),true);
  }
  mk(wrap,'div','',
    tx('Alarm lights. Five cages, five empty nameplates. Watchdog, breathless: "One escapee at a time — I need you to '+
       '<span style="'+K+'">name the species</span> AND <span style="'+K+'">choose how to contain it</span>. Get both right or it just finds another cage and keeps running."',
       '警报灯亮起。五个笼子, 五张空铭牌。看门狗上气不接下气: 「一次一只——我需要你<span style="'+K+
       '">认出品种</span>, 还要<span style="'+K+'">选对隔离手段</span>。两个都对才算数, 错了它就换个笼子接着跑。」'));

  var idx=0,captured=0;
  var stage=mk(wrap,'div','margin:12px 0;border:1px solid #7a2f2f;background:rgba(30,8,8,.35);padding:10px 12px;');
  var progress=mk(wrap,'div',DIM+'margin-bottom:4px;','');
  var pick=mk(wrap,'div','margin:8px 0;');
  var msg=mk(wrap,'div','min-height:36px;font-size:12px;color:#ffce3a;line-height:1.6;');

  var chosenType=null,chosenAction=null;

  function drawProgress(){progress.textContent=tx('Escapee ','逃犯 ')+(idx+1)+' / '+ESCAPE_EVENTS.length+'   '+tx('captured ','已捕获 ')+captured;}
  function drawEvent(){
    var ev=ESCAPE_EVENTS[idx];
    stage.innerHTML='<div style="'+DIM+'">'+tx('EYEWITNESS REPORT','目击报告')+'</div>'+
      '<div style="color:#ff9c9c;font-size:13.5px;margin-top:4px;">'+T(ev.symptom)+'</div>';
  }
  function drawPick(){
    pick.innerHTML='';
    var typeRow=mk(pick,'div',DIM+'margin-bottom:4px;',tx('① Which one escaped?','① 逃跑的是哪一只?'));
    var typeBtns=mk(pick,'div','display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;');
    MALWARE_TYPES.forEach(function(t){
      var b=mk(typeBtns,'button',(chosenType===t.id)?BTN_HOT:BTN,T(t.name));
      b.onclick=function(){chosenType=t.id;drawPick();};
    });
    var actRow=mk(pick,'div',DIM+'margin-bottom:4px;',tx('② How do you contain it?','② 怎么隔离它?'));
    var actBtns=mk(pick,'div','display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;');
    CONTAIN_ACTIONS.forEach(function(a){
      var b=mk(actBtns,'button',(chosenAction===a.id)?BTN_HOT:BTN,T(a.label));
      b.onclick=function(){chosenAction=a.id;drawPick();};
    });
    var go=mk(pick,'button',BTN_HOT,'🔒 '+tx('Capture','捕获'));
    go.disabled=!(chosenType&&chosenAction);
    go.style.opacity=go.disabled?'0.4':'1';
    go.onclick=submit;
  }
  function submit(){
    var ev=ESCAPE_EVENTS[idx];
    var idOk=identifyMalware(ev.id,chosenType);
    var actOk=correctAction(chosenType,chosenAction);
    if(idOk&&actOk){
      S(api,'ok');captured++;
      var t=findMalwareType(chosenType);
      msg.innerHTML=tx('✓ Captured: <b>'+T(t.name)+'</b>, contained via '+T(CONTAIN_ACTIONS.filter(function(a){return a.id===chosenAction;})[0].label)+'.',
                        '✓ 已捕获: <b>'+T(t.name)+'</b>, 隔离方式: '+T(CONTAIN_ACTIONS.filter(function(a){return a.id===chosenAction;})[0].label)+'。');
      idx++;chosenType=null;chosenAction=null;
      setTimeout(function(){
        if(idx>=ESCAPE_EVENTS.length)finish();
        else{drawProgress();drawEvent();drawPick();msg.innerHTML='';}
      },1200);
    }else{
      S(api,'err');
      bumpFail(api,'sec_zoo_fails','sec_zoo',B(
        '[WATCHDOG] INFO — (still breathless, but it slows right down for you) When we miss, it only relocates; nothing is lost, nobody is hurt. Match the behaviour to the name FIRST, then the cure follows on its own. Plainest hint is open. We have all night. Again.',
        '[WATCHDOG] INFO —— (还喘着, 却为你彻底放慢了) 抓错了, 它也只是换个笼子, 什么都没丢, 谁也没受伤。先把"行为"对上"名字", 解法自己就跟上来了。最直白的提示我开好了。整晚都是我们的。再来。'));
      var why=!idOk?tx('Wrong species — it slips past you and ducks into another cage.','认错品种——它从你手边溜走, 钻进了另一个笼子。')
                    :tx('Right species, wrong containment — it wriggles free and relocates.','品种没认错, 隔离方式错了——它挣脱了, 换了个地方。');
      msg.innerHTML='✗ '+why+' <span style="'+DIM+'">'+tx('(no penalty — just try again)','(不惩罚——重试就好)')+'</span>';
      chosenType=null;chosenAction=null;drawPick();
    }
  }
  drawProgress();drawEvent();drawPick();

  function finish(){
    stage.innerHTML='';pick.innerHTML='';
    S(api,'quest');SET(api,'sec_zoo_done');STEP(api,'sec_m3');
    GIVE(api,'cert_shield',B('Security Certificate','安全证书'));
    msg.innerHTML=tx('<b>5 / 5 captured.</b> The alarm lights fade to green.','<b>5 / 5 全部捕获。</b> 警报灯转为绿色。');
    TOAST(api,B('◈ The Malware Zoo · JAILBREAK CONTAINED ◈ Watchdog stamps the paperwork with a paw, badly. It doesn\'t care.',
                '◈ 恶意软件动物园 · 越狱已平息 ◈ 看门狗用爪子在文件上盖了个很不整齐的章。它不在乎。'),true);
    var b=mk(wrap,'div','margin-top:8px;');
    mk(b,'button',BTN,tx('Continue','继续')).onclick=function(){renderZoo(el,api);};
  }

  addHints(wrap,'sec_zoo',[
    B('Five signatures: <b>virus</b> needs a host file · <b>worm</b> self-replicates with no host · <b>trojan</b> disguises itself as something wanted · <b>spyware</b> silently records activity · <b>ransomware</b> locks files/systems for payment.',
      '五个特征: <b>病毒 virus</b> 需要宿主文件 · <b>蠕虫 worm</b> 无需宿主自我复制 · <b>木马 trojan</b> 伪装成想要的东西 · <b>间谍软件 spyware</b> 悄悄记录活动 · <b>勒索软件 ransomware</b> 锁文件/系统换赎金。'),
    B('Containment mostly follows the type: virus/trojan/spyware → <b>run anti-malware and remove it</b>. Worm → <b>disconnect from the network first</b>, it spreads while you dawdle. Ransomware → <b>restore from a clean backup</b>, paying the ransom is never the syllabus answer.',
      '隔离手段基本跟着类型走: 病毒/木马/间谍软件 → <b>跑反恶意软件清除</b>。蠕虫 → <b>先断网</b>, 你犹豫的每一秒它都在扩散。勒索软件 → <b>用干净备份恢复</b>, 交赎金永远不是考纲答案。'),
    B('Answer key: worm→disconnect · trojan→antivirus · ransomware→restore · spyware→antivirus · virus→antivirus. Match the symptom text to the definition, then pick the action.',
      '参考答案: 蠕虫→断网 · 木马→杀毒 · 勒索软件→备份恢复 · 间谍软件→杀毒 · 病毒→杀毒。先把症状描述对上定义, 再选隔离方式。')
  ]);
}

/* ================================================================
   5. NPC 对话
   ================================================================ */

/* Watchdog —— 看门狗 daemon, 吠叫都是日志格式。核心支线 NPC。 */
function watchdogDialog(api){
  var SP=B('Watchdog','看门狗 Watchdog');
  var fixed={sp:SP,t:B(
    '<span class="dim">(It sits bolt upright at the gate, ears never quite relaxing. A tag on its collar reads "uptime: 20y 0d 0h 0m".)</span><br>'+
    '[WATCHDOG] INFO post=gate status=nominal — <span class="dim">state your business.</span>',
    '<span class="dim">(它笔直坐在城门口, 耳朵从没真正放松过。项圈上挂着一块牌子, 写着 "uptime: 20y 0d 0h 0m")</span><br>'+
    '[WATCHDOG] INFO 岗位=城门 状态=正常 —— <span class="dim">说说你来干什么。</span>')};
  var nodes;

  if(!FLAG(api,'sec_met_watchdog')){
    nodes=[
      fixed,
      {sp:SP,t:B(
        '<span class="dim">(It blinks — slowly, the way something does when it hasn\'t properly slept in a very long time.)</span><br>'+
        '[WATCHDOG] DEBUG uptime=20y — I have not missed a shift. Not one. Every packet that ever knocked, I logged, sniffed, and judged myself. Personally. By paw.',
        '<span class="dim">(它眨了眨眼——很慢, 那种很久没好好睡过的慢)</span><br>'+
        '[WATCHDOG] DEBUG uptime=20y —— 我一班没缺过。一次都没有。每一个来敲门的包, 我都亲自闻、亲自判、亲自记。用爪子。')},
      {sp:SP,t:B(
        'Everyone keeps telling me to write it down as <span class="k">rules</span> — a list, once, that judges for me forever after. '+
        '<span class="dim">Sounds efficient. Sounds like giving up the post.</span> What if the list is wrong? What if I fall asleep trusting a piece of paper?',
        '所有人都劝我把它写成<span class="k">规则 (rules)</span>——写一次, 从此以后让它替我判断。'+
        '<span class="dim">听着挺高效。听着也像是擅离职守。</span>万一那张纸写错了呢? 万一我信着一张纸就睡过去了呢?'),choices:[
        {t:B('A good ruleset would still be watching, just… on paper.','一套写得好的规则, 也还是在盯着——只是换了张纸。'),next:3},
        {t:B('(Say nothing. Just listen.)','(什么都不说, 就听着。)'),next:4}
      ]},
      {sp:SP,t:B(
        '[WATCHDOG] WARN unverified_claim — <span class="dim">(ears twitch — the closest thing it has to hope)</span><br>'+
        '…Maybe. There\'s an old trojan locked in the cages downstairs. Reformed, it says. It used to BE what I\'m guarding against — '+
        'it might know something about which papers deserve trust. <span class="k">Go ask it.</span> I\'ll be here. I\'m always here.',
        '[WATCHDOG] WARN 未经核实的说法 —— <span class="dim">(耳朵动了动——这是它离"抱有希望"最近的一次)</span><br>'+
        '……也许吧。楼下笼子里关着一只老木马, 说是改邪归正了。它以前就是我要防的那种东西——'+
        '也许它知道哪种纸值得信。<span class="k">去问问它。</span>我在这儿。我一直在这儿。'),next:5},
      {sp:SP,t:B(
        '[WATCHDOG] INFO silence_logged — <span class="dim">(it seems to appreciate that more than an answer)</span><br>'+
        'There\'s an old trojan locked in the cages downstairs. Says it reformed. It used to BE the threat — it might know something about trust that I don\'t. '+
        '<span class="k">Go ask it,</span> if you\'re headed that way.',
        '[WATCHDOG] INFO 沉默已记录 —— <span class="dim">(它似乎比起听到答案, 更喜欢这个)</span><br>'+
        '楼下笼子里关着一只老木马, 说是改邪归正了。它以前就是威胁本身——也许它懂一些我不懂的"信任"。'+
        '<span class="k">顺路的话去问问它。</span>'),next:5},
      {sp:SP,t:B(
        '[WATCHDOG] INFO end_of_transmission — <span class="dim">(it settles back onto its haunches, eyes already back on the road)</span>',
        '[WATCHDOG] INFO 通讯结束 —— <span class="dim">(它重新坐回原位, 目光已经回到大路上)</span>'),next:-1}
    ];
    nodes.onEnd=function(){SET(api,'sec_met_watchdog');STEP(api,'sec_s1');};
    return nodes;
  }

  if(FLAG(api,'sec_side_done')){
    nodes=[fixed,
      {sp:SP,t:B(
        '[WATCHDOG] INFO ruleset=active fatigue=0.0 — <span class="dim">(its eyes are, for the first time you\'ve seen, fully closed — and it is still, somehow, sitting perfectly upright)</span><br>'+
        'I trust the list. I still hear everything that hits the gate. I just… don\'t have to be the one holding my breath about it anymore.',
        '[WATCHDOG] INFO 规则表=生效中 疲劳度=0.0 —— <span class="dim">(它的眼睛第一次完全闭上了——却依然莫名其妙地坐得笔直)</span><br>'+
        '我信那张规则表。城门上发生的一切我照样听得见。只是……不用再是那个屏着呼吸的人了。'),next:-1}];
    return nodes;
  }

  if(FLAG(api,'sec_fw_done')&&!HAS(api,'wd_ready')){
    nodes=[fixed,
      {sp:SP,t:B(
        '[WATCHDOG] INFO gate_ruleset=deployed — <span class="dim">(it is staring at the control room like it doesn\'t quite believe it.)</span><br>'+
        'That ruleset in there — four lines, and it caught everything I\'ve been catching by hand for twenty years. <span class="k">Bring it here.</span> '+
        'Say it out loud. I need to hear it from someone who isn\'t me.',
        '[WATCHDOG] INFO 城门规则表=已部署 —— <span class="dim">(它盯着控制室的方向, 一副还没缓过来的样子)</span><br>'+
        '那套规则——就四行, 却拦下了我用爪子守了二十年的每一样东西。<span class="k">带过来给我。</span>'+
        '大声念给我听。我需要从一个不是我自己的人嘴里听到它。'),choices:[
        {t:B('(Read the ruleset aloud: ALLOW web, ALLOW admin SSH from inside, ALLOW DNS. Everything else — DENY, by default, forever.)',
             '(大声念出规则表: 放行网页流量, 放行来自内网的管理员 SSH, 放行 DNS。其余一切——默认拒绝, 永远如此。)'),next:2}
      ]},
      {sp:SP,t:B(
        '<span class="dim">(Its whole body sags, all at once, like a service finally allowed to return.)</span><br>'+
        '"…Everything else, DENY, by default, forever." <span class="k">I don\'t have to check the ones nobody vouched for. I never had to.</span><br>'+
        'Twenty years I stood here re-deciding the same "no" every single time, one packet at a time — like it might change its mind. It never did.',
        '<span class="dim">(它整个身体一下子松垮下来, 像一项终于被批准归还的服务)</span><br>'+
        '「……其余一切, 默认拒绝, 永远如此。」<span class="k">没人担保的, 我根本不用查。我从来就不必。</span><br>'+
        '二十年了, 我天天在这儿把同一句"不行"重新判一遍, 一个包一个包地判——好像它哪天会改主意似的。它从没改过。')},
      {sp:SP,t:B(
        '<span class="dim">(It looks toward the cages, then back at you.)</span><br>'+
        'I\'m going to sleep. Really sleep — not the ear-twitching kind. <span class="k">The ruleset is the watch now. I am just… allowed to be a dog for a while.</span><br>'+
        'Wake me if the log ever says something the rules don\'t expect. Until then — <span class="dim">good night. First one in twenty years.</span>',
        '<span class="dim">(它看了看笼子的方向, 又看回你)</span><br>'+
        '我要睡了。真正的睡——不是那种耳朵还会动的假寐。<span class="k">现在守夜的是规则表。我……终于被允许当一会儿狗了。</span><br>'+
        '要是哪天日志里出现了规则表意料之外的东西, 再叫醒我。在那之前——<span class="dim">晚安。二十年来第一次。</span>'),next:-1}
    ];
    nodes.onEnd=function(){
      SET(api,'sec_side_done');STEP(api,'sec_s3');
      GIVE(api,'wd_ready',B('(used) Perfect Rule, read aloud','(已用) 念出口的完美规则'));
    };
    return nodes;
  }

  if(FLAG(api,'sec_trojan_advice')){
    return [fixed,{sp:SP,t:B(
      '[WATCHDOG] INFO waiting_on=gate_control_room — <span class="dim">(it keeps glancing toward the control room, then catching itself.)</span><br>'+
      'The trojan\'s advice keeps rattling in my head: "a good rule is just a promise you keep even when you\'re not watching." '+
      '<span class="k">Go finish the gate ruleset.</span> I want to see if that\'s true.',
      '[WATCHDOG] INFO 等待中=城门控制室 —— <span class="dim">(它时不时瞟一眼控制室的方向, 又强迫自己收回视线)</span><br>'+
      '木马的话一直在我脑子里转: 「一条好规则, 就是你不盯着也照样兑现的承诺。」'+
      '<span class="k">去把城门规则写完。</span>我想看看这话是不是真的。'),next:-1}];
  }

  return [fixed,{sp:SP,t:B(
    '[WATCHDOG] INFO waiting_on=trojan_advice — <span class="dim">(it looks pointedly toward the cages downstairs.)</span><br>'+
    'Go on. Ask the old trojan. I\'ll keep barking at packets in the meantime — it\'s what I do.',
    '[WATCHDOG] INFO 等待中=木马的建议 —— <span class="dim">(它意有所指地看向楼下笼子的方向)</span><br>'+
    '去吧。问问那只老木马。我在这儿继续对着包吠叫——反正这就是我的工作。'),next:-1}];
}

/* 改邪归正的老 trojan —— 笼中"内部顾问", 台词是忏悔录, 好笑 + 教学。 */
var TROJAN_CONFESSIONS=[
  B('"…Back in my day I dressed up as a free antivirus. The irony still keeps me up at night. What kept ME up was everyone else\'s webcam."',
    '「……想当年我伪装成免费杀毒软件。这份讽刺我现在想起来还睡不着。倒是当年多少人的摄像头因为我睡不着觉。」'),
  B('"I once posed as a game crack. Nineteen thousand downloads in a week. Nineteen thousand people wanted something for free and got ME for free instead."',
    '「我还伪装过一次游戏破解补丁。一周下载量一万九。一万九个人都想白嫖点什么, 结果白嫖到了我。」'),
  B('"The trick was never the disguise. Wrapping paper is easy. The trick was making the click feel like YOUR idea."',
    '「诀窍从来不是伪装本身。包装纸谁都会做。诀窍是让那一下点击, 感觉像是你自己的主意。」'),
  B('"A virus needs a host. A worm needs a network. I needed exactly one thing: someone in a hurry."',
    '「病毒需要宿主。蠕虫需要网络。我只需要一样东西: 一个赶时间的人。」')
];
function trojanDialog(api){
  var SP=B('Reformed Trojan','改邪归正的老木马');
  var fixed={sp:SP,t:B(
    '<span class="dim">(A cage in the corner, chewed lock, a battered "REFORMED — PROBABLY" sign zip-tied to the bars.)</span><br>'+
    'Oh good, a visitor who isn\'t Watchdog reciting uptime at me. Sit. Well — you can\'t sit, there\'s a cage. You know what I mean.',
    '<span class="dim">(角落一个笼子, 锁被啃得坑坑洼洼, 栏杆上用扎带绑着一块破牌子, 写着"已改邪归正——大概")</span><br>'+
    '哦, 太好了, 终于有个不是看门狗跟我念叨在线时长的访客。坐。呃——你没法坐, 这儿有个笼子。你懂我意思。')};
  var nodes;

  if(!FLAG(api,'sec_met_trojan')){
    nodes=[fixed,
      {sp:SP,t:B(
        'Don\'t worry, I\'m housebroken. Mostly. <span class="dim">(It gestures with a paw-shaped… something, at the cage door.)</span> '+
        'They keep me around as "the guy who knows how the other side thinks." Consultant work. Very respectable. I have a lanyard.',
        '别担心, 我"没有攻击性"了。大概吧。<span class="dim">(它用一只爪子形状的……什么东西, 朝笼门比划了一下)</span>'+
        '他们把我留在这儿当"了解对方阵营的人"。顾问工作, 很体面, 我还有个工作牌。'),choices:[
        {t:B('So what did you used to be, exactly?','那你以前到底是干什么的?'),next:2}
      ]},
      {sp:SP,t:B('(random confession)','(随机忏悔)')},
      {sp:SP,t:B(
        'These days I mostly tell Watchdog it can trust its own rules — the poor thing thinks vigilance means never looking away. '+
        '<span class="k">I used to exploit exactly that assumption.</span> A good default-deny policy doesn\'t need a babysitter. Tell it I said so.',
        '现在我大部分时间在劝看门狗: 它可以信任自己写的规则——那可怜家伙以为"警惕"就是一刻都不能移开视线。'+
        '<span class="k">我以前专门利用的就是这种执念。</span>写得好的默认拒绝策略不需要人守着。替我告诉它这句话。'),next:-1}
    ];
    nodes.onEnd=function(){SET(api,'sec_met_trojan');};
    return nodes;
  }

  if(FLAG(api,'sec_side_started')&&!FLAG(api,'sec_trojan_advice')){
    nodes=[fixed,
      {sp:SP,t:B(
        'Watchdog sent you, didn\'t it. Poor overworked thing — twenty years of manually judging every packet because it doesn\'t believe a written rule can be trusted.',
        '看门狗让你来的吧。可怜的过劳鬼——二十年了, 每个包都亲自判, 就因为它不相信一条写下来的规则能靠得住。')},
      {sp:SP,t:B(
        'Here\'s the thing it won\'t hear from me, because I\'m — well, me. <span class="k">A rule doesn\'t get tired. Doesn\'t blink at 4am. '+
        'Doesn\'t make an exception because someone SOUNDED urgent.</span> That\'s not carelessness. That\'s the whole point of writing it down.',
        '有件事它不会从我这儿听进去, 毕竟我是——好吧, 我是我。<span class="k">规则不会累。凌晨四点不会打瞌睡。'+
        '也不会因为谁"听起来很急"就破例。</span>这不是漫不经心, 这恰恰就是把它写下来的意义。')},
      {sp:SP,t:B(
        'Tell it: "a good rule is a promise you keep even when you\'re not watching." <span class="dim">Corny. Also — for once — true. '+
        'Coming from a professional liar, that should count for something.</span>',
        '告诉它: 「一条好规则, 就是你不盯着也照样兑现的承诺。」<span class="dim">是有点土。但——难得地——是真的。'+
        '一个职业骗子说出这话, 好歹也算个背书吧。</span>'),next:-1}
    ];
    nodes.onEnd=function(){SET(api,'sec_trojan_advice');STEP(api,'sec_s2');};
    return nodes;
  }

  var i=(FLAG(api,'sec_trojan_visits')||0);SET(api,'sec_trojan_visits',i+1);
  var c=TROJAN_CONFESSIONS[i%TROJAN_CONFESSIONS.length];
  return [fixed,{sp:SP,t:c,next:-1}];
}

/* ================================================================
   6. 室内地图 (26 × 18) —— 一座要塞: 北翼靶场/控制室, 南部动物园
   #=墙(1) .=地板(0)
   北翼西=射击场 北翼东=城门控制室(防火墙) 中段=城门大厅(看门狗)
   南段=恶意软件动物园(含牢笼柱); 老木马蹲在东南角笼子
   坐标经脚本校验: 边界封闭 · 全部实体在地板 · 单连通分量
   ================================================================ */
var ROWS=[
  '##########################',  // 0
  '#...........#............#',  // 1
  '#...........#............#',  // 2  石碑·钓鱼名人墙(3,2) 石碑·默认拒绝碑(22,2)
  '#...........#............#',  // 3  谜题·射击场(5,3)      谜题·控制室(19,3)
  '#...........#............#',  // 4
  '#...........#............#',  // 5
  '#........................#',  // 6  石碑·CIA 三条祖训(12,6)
  '#........................#',  // 7  NPC·Watchdog(12,7)
  '#........................#',  // 8
  '#........................#',  // 9
  '#........................#',  // 10
  '#........................#',  // 11
  '#.....#...........#......#',  // 12  石碑·动物园警示牌(3,12)
  '#........#.....#.........#',  // 13  谜题·动物园Boss(12,13)  NPC·老木马(20,13)
  '#.....#...........#......#',  // 14
  '#........................#',  // 15
  '#........................#',  // 16  出生点(12,16)
  '##########################'   // 17
];
var TILES=ROWS.map(function(r){return r.split('').map(function(c){return c==='#'?1:0;});});

/* ================================================================
   7. 模块定义
   ================================================================ */
var MOD={
  id:'sec',
  title:B('The Firewall Bastion','安全哨站'),
  world:'as',
  unlock:{afterQuest:'m3'},   // index.html 第一章末任务实际 id = m3

  interior:{w:26,h:18,tiles:TILES,playerStart:{x:12,y:16}},

  npcs:[
    {id:'sec_watchdog',name:B('Watchdog','看门狗 Watchdog'),color:'#d8b46a',body:'#f0dcae',suit:'#6a4a2a',
     x:12,y:7,dialog:watchdogDialog},
    {id:'sec_trojan',name:B('Reformed Trojan','改邪归正的老木马'),color:'#e08a5a',body:'#f5c9a0',suit:'#7a3a2a',
     x:20,y:13,dialog:trojanDialog}
  ],

  steles:[
    {x:12,y:6,kind:'stele',text:B(
      '<span class="dim"><i>Three words the first Watchdog carved before it would trust any wall at all. Every one since has had to read them aloud.</i></span><br>'+
      '[THE BASTION\'S THREE COMMANDMENTS · C-I-A]<br>'+
      '① <span class="k">Confidentiality</span> — only the authorised may read. What you are not cleared to see, the wall shows you nothing of.<br>'+
      '② <span class="k">Integrity</span> — only the authorised may change, and every change leaves a mark. Tampering is not invisible; it is just unwitnessed, briefly.<br>'+
      '③ <span class="k">Availability</span> — the authorised may ALWAYS get in. A wall that keeps everyone out isn\'t security. It\'s just a very expensive way of losing.<br><br>'+
      '<span class="dim">— Carved by the first Watchdog. Re-read by every one since.</span>',
      '<span class="dim"><i>第一代看门狗在肯信任任何一堵墙之前, 先刻下的三个词。后来每一代看门狗, 都得把它们念出声。</i></span><br>'+
      '【要塞三条祖训 · 机密性-完整性-可用性】<br>'+
      '① <span class="k">机密性 Confidentiality</span> —— 唯授权者可读。没有权限看的, 墙什么都不会给你看。<br>'+
      '② <span class="k">完整性 Integrity</span> —— 唯授权者可改, 且改动必留痕迹。篡改从不隐形, 只是暂时没被看见。<br>'+
      '③ <span class="k">可用性 Availability</span> —— 授权者永远进得来。一堵谁都挡在外面的墙不叫安全, 那只是一种代价很高的失败方式。<br><br>'+
      '<span class="dim">——第一代看门狗刻下。历代看门狗都要重读一遍。</span>'),
     codex:['cia-triad']},
    {x:3,y:2,kind:'stele',text:B(
      '<span class="dim"><i>A wall of the worst lies ever posted to this fortress. A few of them are almost art.</i></span><br>'+
      '[PHISHING HALL OF SHAME · GREATEST HITS]<br>'+
      '"You are our 1,000,000th visitor" (there is no counter). '+
      '"Verify within 10 minutes" (nothing legitimate is ever that urgent). '+
      '"paypa1.com" (that\'s a one). "grandma_real_i_promise@gmail.com" (grandma does not name her own email like a hostage note).<br><br>'+
      '<span class="dim">Outside these walls, every rejected letter gets thrown over the rampart. It has been twenty years. '+
      'The Junk Traffic Wasteland out there has its own climate now, mostly made of glitter and false urgency.</span>',
      '<span class="dim"><i>一整面墙, 挂着寄到这座要塞的最烂的谎言。有那么几条, 骗得都快有艺术感了。</i></span><br>'+
      '【钓鱼邮件名人墙 · 精选集】<br>'+
      '"您是我们的第 1,000,000 位访客"(压根没有计数器)。'+
      '"请在 10 分钟内验证"(正经事从不会这么急)。'+
      '"paypa1.com"(那是个数字 1)。"grandma_real_i_promise@gmail.com"(哪个奶奶会把自己邮箱取名取得像绑架信)。<br><br>'+
      '<span class="dim">城墙外面, 每一封被拒的信都会被扔过垛口。二十年下来, 墙外那片垃圾流量荒原已经有了自己的气候, 主要成分是闪粉和假紧迫感。</span>'),
     codex:['phishing-tells']},
    {x:22,y:2,kind:'stele',text:B(
      '<span class="dim"><i>One cold sentence that has held this gate for twenty years. It sounds heartless. It has never once been wrong.</i></span><br>'+
      '[DEFAULT-DENY STONE]<br>"A gate has two ways to fail: let the wrong thing in, or keep the right thing out. '+
      'Most fortresses spend their whole lives trying to list every enemy. We do not.<br>'+
      '<span class="k">We list who we trust. Everyone else — by default, without exception, without a written line — stays out.</span><br>'+
      '<span class="dim">Guilty until named innocent. It sounds cold. It has worked for twenty years.</span>"',
      '<span class="dim"><i>一句冷话, 守了这道门二十年。听着无情, 却一次都没错过。</i></span><br>'+
      '【默认拒绝碑】<br>"城门失守只有两种方式: 放错了人进来, 或者拦住了对的人。大多数要塞穷极一生想列全每一个敌人的名字, 我们不。<br>'+
      '<span class="k">我们只列出信任谁。剩下所有人——默认地、无一例外地、不需要专门写一行——都被挡在外面。</span><br>'+
      '<span class="dim">未经点名, 一律有罪。听着挺冷酷, 但它管用了二十年。</span>"'),
     codex:['firewall-default-deny']},
    {x:3,y:12,kind:'stele',text:B(
      '<span class="dim"><i>Read this before you touch a single cage. The five things inside all bite differently.</i></span><br>'+
      '[MALWARE ZOO · CONTAINMENT PROTOCOL]<br>'+
      'Five specimens, five behaviours, memorise before you open any cage:<br>'+
      '<span class="k">Virus</span> — needs a host file to move. '+
      '<span class="k">Worm</span> — needs nothing, copies itself across the network. '+
      '<span class="k">Trojan</span> — needs your trust, disguised as a gift. '+
      '<span class="k">Spyware</span> — needs your ignorance, silent and watching. '+
      '<span class="k">Ransomware</span> — needs your fear, and a wallet.<br><br>'+
      '<span class="dim">Do not negotiate with the one behind the locked note. Restore from backup. That is the whole answer key.</span>',
      '<span class="dim"><i>碰任何一个笼子之前, 先读它。里头这五样, 咬人的方式各不相同。</i></span><br>'+
      '【恶意软件动物园 · 收容协议】<br>'+
      '五个标本, 五种行为, 开笼子之前先背下来:<br>'+
      '<span class="k">病毒 Virus</span>——移动需要宿主文件。'+
      '<span class="k">蠕虫 Worm</span>——什么都不需要, 靠网络自我复制。'+
      '<span class="k">木马 Trojan</span>——需要你的信任, 伪装成礼物。'+
      '<span class="k">间谍软件 Spyware</span>——需要你的无知, 悄无声息地盯着。'+
      '<span class="k">勒索软件 Ransomware</span>——需要你的恐惧, 和一个钱包。<br><br>'+
      '<span class="dim">别跟锁在字条后面的那位谈判。用备份恢复。这就是全部答案。</span>'),
     codex:['malware-overview']}
  ],

  quests:[
    {id:'sec_main',line:'main',title:B('The Firewall Bastion: Hold the Wall','安全哨站: 守住城墙'),
     syllabus:'6.1 Data Security (malware · phishing/pharming · firewalls)',
     desc:B('A fortress of rejected packets and worse jokes. Watchdog has held this gate alone for twenty years, and something down in the cages has just gotten loose.',
            '一座由拒绝的数据包和更烂的笑话堆成的要塞。看门狗独自守了这道门二十年, 而笼子里刚刚有什么东西跑出来了。'),
     steps:[
       {id:'sec_m1',text:B('Clear the Phishing Shooting Range (8/10 to pass)','打赢钓鱼鉴别射击场 (10 中 8 过关)')},
       {id:'sec_m2',text:B('Write a firewall ruleset that lets every legitimate packet in and keeps every hostile one out','写一套防火墙规则: 放行全部合法包、拦下全部恶意包')},
       {id:'sec_m3',text:B('Survive the Malware Zoo jailbreak — identify and contain all 5 escapees','挺过恶意软件动物园越狱事件——指认并隔离全部 5 只逃犯')}
     ]},
    {id:'sec_side',line:'side',title:B('Watchdog\'s Day Off','看门狗的假期'),
     syllabus:'6.1 Data Security applied: firewall policy as institutional trust (narrative)',
     desc:B('Watchdog has not taken a single day off in twenty years — not out of duty, but because it has never trusted a written rule enough to close its eyes.',
            '看门狗二十年没休过一天假——不是因为多尽职, 而是它从没信任过一条写下来的规则到能闭眼的地步。'),
     steps:[
       {id:'sec_s1',text:B('Hear Watchdog out — 20 years, not one day off','听看门狗说完——20 年, 一天没休过')},
       {id:'sec_s2',text:B('Ask the reformed old trojan in the cages for advice on trust','去笼子里找改邪归正的老木马请教"信任"这回事')},
       {id:'sec_s3',text:B('Bring Watchdog a firewall rule good enough to finally sleep on','给看门狗带一条能让它安心睡下的防火墙规则')}
     ]}
  ],

  puzzles:[
    {id:'sec_phish',kind:'puzzleStation',x:5,y:3,title:B('Junk Traffic Range · Phishing Gallery','垃圾流量靶场 · 钓鱼鉴别射击场'),
     syllabus:'6.1 Data Security: phishing & pharming (spot the threat)',
     primer:{title:B('What is phishing?','什么是"钓鱼" (phishing)?'),
       body:B(
         '<b>In one line:</b> phishing is a fake message pretending to be someone trustworthy (your bank, a shop, a prize) to trick you into handing over a password, card number, or a click.<br>'+
         '<pre style="color:#e8c46a;background:rgba(30,20,5,.4);border:1px solid #4a3a1a;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
         'FROM: security@paypa1.com   &larr; real domain is paypal.com (digit "1", not letter "l")\n'+
         'SUBJECT: URGENT! Verify within 10 minutes!!   &larr; manufactured panic, no real company does this</pre>'+
         '<b>Like:</b> a stranger calls pretending to be your bank: "your account freezes in 10 minutes — read me your card number NOW." Real banks never manufacture that kind of countdown panic.<br>'+
         '<b>Why you need it here:</b> ten "emails" fly past on a conveyor belt. Read the sender domain, watch for fake urgency and too-good-to-be-true prizes, then shoot down the fakes and let the real ones through.',
         '<b>一句话:</b> 钓鱼 (phishing) 就是一条冒充可信身份 (银行、网店、中奖通知) 的假消息, 想骗你交出密码、卡号, 或者点一个链接。<br>'+
         '<pre style="color:#e8c46a;background:rgba(30,20,5,.4);border:1px solid #4a3a1a;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
         'FROM: security@paypa1.com   &larr; 真域名是 paypal.com (数字 "1", 不是字母 "l")\n'+
         'SUBJECT: 紧急! 请在 10 分钟内验证!!   &larr; 人造恐慌, 正经公司不会这样</pre>'+
         '<b>类比:</b> 有人打电话冒充你的银行: "账户 10 分钟后冻结, 现在马上报你的卡号。" 正经银行从不制造这种倒计时恐慌。<br>'+
         '<b>这题用它干嘛:</b> 十封"邮件"会从传送带飞过。看发件域名、看有没有人造紧迫感和天上掉馅饼式奖品, 击落假的, 放行真的。')},
     codex:['phishing-tells'],
     render:renderPhish,
     onKey:function(e,api){if(e.key==='?'&&hintFns.sec_phish)hintFns.sec_phish();}},
    {id:'sec_fw',kind:'puzzleStation',x:19,y:3,title:B('Gate Control Room · Firewall Rules','城门控制室 · 防火墙规则'),
     syllabus:'6.1 Data Security: firewalls (packet-filtering rules)',
     primer:{title:B('What is a firewall?','什么是防火墙 (firewall)?'),
       body:B(
         '<b>In one line:</b> a firewall checks every network packet trying to cross the boundary, and only lets through the ones that match an explicit ALLOW rule; everything else hits a safe default of DENY.<br>'+
         '<pre style="color:#8fbf8f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
         'packet arrives &rarr; check rules top-to-bottom &rarr; first match wins\n'+
         '  matched nothing at all? &rarr; default policy: DENY</pre>'+
         '<b>Like:</b> a bouncer with a guest list — instead of memorising every troublemaker\'s face, they just check "is this name on the list?" Not on it? Not coming in. Full stop.<br>'+
         '<b>Why you need it here:</b> nine packets are queued at the gate. Write a handful of ALLOW rules for the traffic you trust; everything else silently bounces off the default DENY.',
         '<b>一句话:</b> 防火墙检查每一个想穿过边界的数据包, 只放行匹配了明确 ALLOW 规则的包; 剩下的一律撞上安全的默认值——DENY。<br>'+
         '<pre style="color:#8fbf8f;background:rgba(10,25,10,.4);border:1px solid #1f3f1f;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
         '包到达 &rarr; 规则从上到下检查 &rarr; 第一条匹配的生效\n'+
         '  一条都没匹配上? &rarr; 默认策略: DENY (拒绝)</pre>'+
         '<b>类比:</b> 门口保安拿着一张名单——他不需要记住每个坏人的长相, 只需要查"这名字在不在名单上"。不在? 不让进, 没得商量。<br>'+
         '<b>这题用它干嘛:</b> 城门口排着九个包。你只需要为信任的流量写几条 ALLOW 规则; 剩下的全部悄无声息地撞上默认 DENY。')},
     codex:['firewall-default-deny'],
     render:renderFirewall,
     onKey:function(e,api){if(e.key==='?'&&hintFns.sec_fw)hintFns.sec_fw();}},
    {id:'sec_zoo',kind:'puzzleStation',x:12,y:13,title:B('The Malware Zoo · Jailbreak','恶意软件动物园 · 越狱事件'),
     syllabus:'6.1 Data Security: malware — virus/worm/trojan/spyware/ransomware',
     primer:{title:B('What is malware?','什么是恶意软件 (malware)?'),
       body:B(
         '<b>In one line:</b> malware is software built to harm, spy on, or exploit a system without permission — different "species" spread and hide in different ways.<br>'+
         '<pre style="color:#ff9c9c;background:rgba(30,8,8,.35);border:1px solid #4a2a2a;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
         'virus:      rides a host file, can\'t move without one\n'+
         'worm:       copies itself alone, no host needed\n'+
         'trojan:     disguised as something you want\n'+
         'spyware:    watches quietly, sends data out\n'+
         'ransomware: locks your files, demands payment</pre>'+
         '<b>Like:</b> a virus is a hitchhiker (needs a host file to move); a worm just walks on its own two feet across the network; a trojan is a gift box with something nasty hidden inside.<br>'+
         '<b>Why you need it here:</b> five escapees are loose in the zoo. For each one you must (1) name the species from its behaviour, then (2) pick the matching containment action — both have to be right to capture it.',
         '<b>一句话:</b> 恶意软件 (malware) 是专门用来搞破坏、偷窥、或未经许可利用系统的软件——不同"物种"的传播和藏身方式各不相同。<br>'+
         '<pre style="color:#ff9c9c;background:rgba(30,8,8,.35);border:1px solid #4a2a2a;padding:6px 8px;margin:6px 0;font-size:11.5px;line-height:1.4;">'+
         '病毒 virus:      趴在宿主文件上, 离了它动不了\n'+
         '蠕虫 worm:       自己复制自己, 不需要宿主\n'+
         '木马 trojan:     伪装成你想要的东西\n'+
         '间谍软件 spyware: 悄悄盯着, 把数据发出去\n'+
         '勒索软件 ransomware: 锁死你的文件, 要赎金</pre>'+
         '<b>类比:</b> 病毒是搭便车的 (得靠宿主文件才能挪动); 蠕虫自己会走, 靠网络到处爬; 木马是一个礼物盒, 里面藏着坏东西。<br>'+
         '<b>这题用它干嘛:</b> 动物园里跑了五只逃犯。每一只你都要: ① 从行为认出品种, ② 选对隔离手段——两个都对才算捕获。')},
     codex:['malware-overview'],
     render:renderZoo,
     onKey:function(e,api){if(e.key==='?'&&hintFns.sec_zoo)hintFns.sec_zoo();}}
  ],

  onEnter:function(api){
    if(!FLAG(api,'sec_entered')){
      SET(api,'sec_entered');
      S(api,'open');
      TOAST(api,B('The gate creaks open onto a fortress of grey stone and greener log-scrolls. Beyond the ramparts, a wasteland of rejected mail piles into dunes — twenty years of "no" you can see from here.',
                  '城门吱呀打开, 露出一座灰石与更绿日志卷轴筑成的要塞。垛口之外, 被拒的邮件堆成沙丘般的荒原——二十年的"不行", 站在这儿就看得见。'),true);
    }
  },

  onQuestComplete:function(qid,api){
    if(qid==='sec_main'){
      S(api,'quest');
      TOAST(api,B('◈ The Firewall Bastion · COMPLETE ◈ The Security Certificate is filed away. Somewhere outside, the Wasteland keeps growing — that\'s not a bug, that\'s the wall working.',
                  '◈ 安全哨站 · 完成 ◈ 安全证书已归档。城外的荒原还在长大——那不是故障, 那是墙在正常工作。'),true);
    }else if(qid==='sec_side'){
      TOAST(api,B('◈ Side quest complete ◈ Somewhere in the bastion, a dog is asleep with all four paws in the air, for the first time in twenty years.',
                  '◈ 支线完成 ◈ 要塞里某个角落, 一只狗四脚朝天睡着了——二十年来第一次。'),true);
    }
  },

  /* 纯逻辑判定导出 —— 供 node 单测(引擎请忽略) */
  _test:{
    PHISH_MAILS:PHISH_MAILS,PHISH_MAILS_HARD:PHISH_MAILS_HARD,
    PHISH_PASS:PHISH_PASS,PHISH_PASS_HARD:PHISH_PASS_HARD,
    judgePhish:judgePhish,scorePhishRound:scorePhishRound,
    DEFAULT_POLICY:DEFAULT_POLICY,
    FW_PACKETS:FW_PACKETS,FW_RULE_LIMIT:FW_RULE_LIMIT,FW_SOLUTION:FW_SOLUTION,
    FW_PACKETS_CHAL:FW_PACKETS_CHAL,FW_RULE_LIMIT_CHAL:FW_RULE_LIMIT_CHAL,FW_SOLUTION_CHAL:FW_SOLUTION_CHAL,
    ruleMatches:ruleMatches,evalPacket:evalPacket,evalAll:evalAll,
    MALWARE_TYPES:MALWARE_TYPES,CONTAIN_ACTIONS:CONTAIN_ACTIONS,ESCAPE_EVENTS:ESCAPE_EVENTS,
    identifyMalware:identifyMalware,correctAction:correctAction,judgeCapture:judgeCapture,bossRun:bossRun,
    ROWS:ROWS,TILES:TILES
  }
};

/* ================================================================
   6. Codex 知识库条目 (手册查阅用; 谜题/石碑用 codex:[id] 关联)
   ================================================================ */
window.GAME_CODEX=window.GAME_CODEX||[];
window.GAME_CODEX.push(
  {id:'phishing-tells',mod:'sec',syllabus:'6.1 Data Security — phishing & pharming',
   topic:B('Phishing & pharming — spotting the tells','钓鱼 (phishing) 与域名嫁接 (pharming) —— 怎么认破绽'),
   body:B('Phishing: a fake message (email/SMS/call) pretending to be a trusted sender, trying to trick you into revealing information or clicking a malicious link. Pharming: redirects you to a fake website even when you typed the real address correctly (e.g. by poisoning DNS), so the address bar can lie too. Common tells: look-alike domains (paypa1.com, micros0ft.com), manufactured urgency ("act within 10 minutes!"), too-good-to-be-true offers, and requests for passwords/card numbers that a legitimate sender would never ask for by email.',
          '钓鱼 (phishing): 一条伪装成可信发件人的假消息 (邮件/短信/电话), 想骗你交出信息或点恶意链接。域名嫁接 (pharming): 就算你自己输对了网址, 也会被重定向到假网站 (比如靠污染 DNS 实现), 所以地址栏也可能说谎。常见破绽: 形似域名 (paypa1.com、micros0ft.com)、人造紧迫感("10 分钟内处理!")、天上掉馅饼式优惠、以及索要密码/卡号——正经发件人从不会用邮件问你要这些。'),
   example:B('security@paypa1.com ("1" not "l") demanding you "verify within 10 minutes" is a textbook phish: fake domain + manufactured urgency, both at once.',
             'security@paypa1.com (数字 "1" 而非字母 "l") 还要求你"10 分钟内验证", 是教科书级钓鱼: 仿冒域名 + 人造紧迫感, 两个信号一起出现。')},
  {id:'firewall-default-deny',mod:'sec',syllabus:'6.1 Data Security — firewalls',
   topic:B('Firewalls & default-deny','防火墙与"默认拒绝"'),
   body:B('A firewall inspects packets trying to cross a network boundary and decides ALLOW or DENY based on a rule list — checked top to bottom, first match wins. The safest design uses a default-deny policy: you only write rules for traffic you explicitly trust (by port/protocol/source); anything matching no rule is denied automatically. This means you never have to list every possible attacker — only everyone you trust.',
          '防火墙检查试图穿越网络边界的数据包, 依据规则表判定 ALLOW(放行) 或 DENY(拒绝)——规则从上到下检查, 第一条匹配的生效。最安全的设计是"默认拒绝 (default-deny)": 你只需要为明确信任的流量 (按端口/协议/来源) 写规则; 没有任何规则匹配的包自动被拒绝。这样你就不用列全每一个可能的攻击者, 只需要列出你信任的人。'),
   example:B('ALLOW TCP port 443 from outside (HTTPS web traffic) · ALLOW TCP port 22 from inside only (admin SSH) · everything else — including an SSH attempt from outside — matches no rule and falls to default DENY.',
             'ALLOW TCP 443 来自 outside (HTTPS 网页流量) · ALLOW TCP 22 仅来自 inside (管理员 SSH) · 其余一切——包括一次来自 outside 的 SSH 尝试——都没有匹配规则, 自动落入默认 DENY。')},
  {id:'malware-overview',mod:'sec',syllabus:'6.1 Data Security — malware types',
   topic:B('Malware: five species','恶意软件: 五种类型速览'),
   body:B('Malware is software designed to damage, disrupt, or spy without permission. Virus: attaches to a host file and needs that file to run/spread. Worm: spreads by itself across a network, no host file needed. Trojan: disguised as something desirable; the user is tricked into running it themselves. Spyware: runs quietly, recording activity (keystrokes, screens) and sending it out. Ransomware: encrypts/locks files or systems and demands payment to restore access. Typical containment: virus/trojan/spyware &rarr; anti-malware scan & remove; worm &rarr; disconnect from the network immediately (it keeps spreading while connected); ransomware &rarr; restore from a clean backup (paying is never guaranteed to work).',
          '恶意软件 (malware) 泛指未经许可、意在破坏/干扰/窃密的软件。病毒 (virus): 附着在宿主文件上, 要靠宿主文件运行/传播。蠕虫 (worm): 靠网络自己传播, 不需要宿主文件。木马 (trojan): 伪装成想要的东西, 骗用户自己运行它。间谍软件 (spyware): 悄悄运行, 记录活动 (按键、截屏) 并发送出去。勒索软件 (ransomware): 加密/锁定文件或系统, 索要赎金才"恢复"访问。典型隔离手段: 病毒/木马/间谍软件 &rarr; 杀毒扫描并清除; 蠕虫 &rarr; 立刻断网 (连着网它就一直在传播); 勒索软件 &rarr; 用干净备份恢复 (交赎金也不保证真的能拿回数据)。'),
   example:B('"It copied itself and crawled across the whole server room, no host file involved" &rarr; worm &rarr; containment: disconnect from the network first.',
             '「它自己复制了一份, 爬满了整个机房, 没有借助任何宿主文件」&rarr; 蠕虫 (worm) &rarr; 隔离: 先断网。')},
  {id:'cia-triad',mod:'sec',syllabus:'6.1 Data Security — the CIA triad',
   topic:B('The CIA triad','CIA 三要素 (机密性-完整性-可用性)'),
   body:B('A standard way to describe what "security" means, in three properties. Confidentiality: only authorised people can READ the data — encryption and access control keep outsiders from seeing anything. Integrity: only authorised people can CHANGE the data, and any change is detectable — checksums, hashes, and logs mean tampering always leaves a trace. Availability: authorised people can ALWAYS access the data/system when they need it — backups, redundancy, and defences against attacks like DoS keep the service up. A "secure" system must balance all three: a wall so strict that nobody (not even legitimate users) can get in has just traded Availability away for nothing.',
          '描述"安全"到底指什么的一个标准框架, 分三个属性。机密性 (Confidentiality): 只有授权者能<b>读</b>数据——加密与访问控制让外人什么都看不到。完整性 (Integrity): 只有授权者能<b>改</b>数据, 且任何改动都能被发现——校验和、哈希、日志让篡改总会留下痕迹。可用性 (Availability): 授权者<b>永远能</b>在需要时访问数据/系统——备份、冗余, 以及对抗 DoS 之类攻击的防御, 保证服务不掉线。一个"安全"的系统要三者兼顾: 一堵连合法用户都进不去的墙, 只是拿可用性换来了一场毫无意义的胜利。'),
   example:B('A firewall with default-deny protects Confidentiality & Integrity by keeping attackers out — but if it is misconfigured and blocks legitimate staff too, it has just destroyed Availability instead.',
             '一道"默认拒绝"的防火墙靠挡住攻击者来保护机密性和完整性——但如果配置出错, 连合法员工也一并挡住, 那就是在牺牲可用性。')}
);

window.GAME_MODULES=window.GAME_MODULES||[];
window.GAME_MODULES.push(MOD);
})();
