/* ================================================================
   BIT://ESCAPE — sprites.js 「阳光下的机器花园 Sunlit Machine Garden」
   程序化像素美术库 (art v3)
   ----------------------------------------------------------------
   · 零外部资源, 全部 canvas 程序化绘制
   · 16px 逻辑格; 任意 size 缩放, 内部对物理像素取整保证锐利
   · 锚点约定:
       drawTile              → (x,y) = 格子左上角
       drawPlayer / drawNPC  → (x,y) = 脚底中心
       drawBuilding          → (x,y) = 地基底边中心 (逻辑 32×32 覆盖域)
       drawDecor             → (x,y) = 底边中心
   · world: 'as'(白天·阳光草原) | 'a2'(黄昏·星空机器花园)
   · 腐蚀是"局部点缀": decor kind 'corruption' — 世界越亮, 那一小片越刺眼
   · 使用前请确保 ctx.imageSmoothingEnabled = false
   ================================================================ */
(function(){
'use strict';

/* ---------------- 色板 (全库唯一颜色来源) ----------------
   基础 10 键保持"暗→亮"值阶(bg 最深, hi2 最亮; hi=发光, acc/acc2=强调),
   inventory.js 等外部消费者按此语义取色。v3 新增语义键(grass·leaf·path·
   waterD·waterL·cloth·cor 系)只增不删。任何绘制只允许取此处颜色或其 rgba 派生。 */
const PALETTE={
  as:{ /* 白天: 清爽冷调科幻 (CrossCode/Eastward 档) —
         青灰草原 + 金属结构 + 霓虹青电路 + 暖金强调 */
       bg:'#232a33',  g0:'#98a2ac', g1:'#c2cbd4', dim:'#5f6b7a', mid:'#dde5ec',
       hi:'#3fd4c4',  hi2:'#eef7f9', water:'#3e9ed2',
       acc:'#ffb454', acc2:'#ff5e5e',
       grass:'#6aa876', grass2:'#7cb886', grassD:'#54885f',
       leaf:'#3f8a5f', leaf2:'#54a56e', leaf3:'#7cc48b', wood:'#6b5644',
       path:'#b9c0b4', path2:'#cdd4c8',
       waterD:'#2b7cb0', waterL:'#a5dcf2',
       cloth:'#3a6f9e', clothD:'#2b5578',
       cor:'#2a1c3e', cor2:'#8b5cd6', cor3:'#c99aff' },
  a2:{ /* 黄昏/星空: 深蓝紫天幕 + 暖橙灯火 (星穹铁道式浪漫深邃) */
       bg:'#1c1a38',  g0:'#4a4674', g1:'#5c5890', dim:'#7d76b5', mid:'#9c93cf',
       hi:'#ffcf6e',  hi2:'#fff2d4', water:'#2f4a7a',
       acc:'#ff9e58', acc2:'#ff6f9a',
       grass:'#3f6472', grass2:'#4d7683', grassD:'#325260',
       leaf:'#2f5d68', leaf2:'#3f7a80', leaf3:'#5da3a0', wood:'#4e3f66',
       path:'#565081', path2:'#6a639a',
       waterD:'#243a63', waterL:'#8fb8ff',
       cloth:'#6ea8d8', clothD:'#4a7ba8',
       cor:'#170b22', cor2:'#b04de0', cor3:'#e79aff' }
};
function pal(w){return PALETTE[w]||PALETTE.as;}

/* 确定性伪随机 (同一坐标永远同一结果, 画面不闪) */
function hash(x,y,s){const n=Math.sin(x*127.1+y*311.7+(s||0)*74.7)*43758.5453;return n-Math.floor(n);}
function rgba(hex,a){
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return 'rgba('+r+','+g+','+b+','+a+')';
}

/* 像素矩形工厂: 逻辑格坐标 → 物理像素取整 */
function R(ctx,ox,oy,u){
  return function(c,x,y,w,h){
    ctx.fillStyle=c;
    const x1=Math.round(ox+x*u), y1=Math.round(oy+y*u);
    const x2=Math.round(ox+(x+w)*u), y2=Math.round(oy+(y+h)*u);
    ctx.fillRect(x1,y1,Math.max(1,x2-x1),Math.max(1,y2-y1));
  };
}

/* ================= 1. 地形 =================
   type: 数字(兼容引擎 0草 1树 2山 3水 4路 5沙 6门) 或字符串名
   tx,ty: 可选 — 该格的地图整数坐标(用于稳定纹理变化);
          不传则按屏幕坐标推算(镜头移动时纹理会轻微漂移, 建议传)。 */
const TILE_BY_NUM=['ground','tree','rock','water','road','sand','gate'];
function drawTile(ctx,type,x,y,size,t,world,tx,ty){
  const p=pal(world), u=size/16, r=R(ctx,x,y,u);
  const tn=(typeof type==='number')?(TILE_BY_NUM[type]||'ground'):type;
  if(tx==null)tx=Math.round(x/size);
  if(ty==null)ty=Math.round(y/size);
  t=t||0;
  const h1=hash(tx,ty,1), h2=hash(tx,ty,2);

  if(tn==='ground'){                                       // 阳光草地
    r(p.grass,0,0,16,16);
    if(h1>0.35)r(p.grass2,(h1*12)|0,(h2*12)|0,3,3);       // 受光草斑
    if(h2>0.45)r(p.grass2,(h2*11)|0,(h1*11)|0,2,2);
    if(h2>0.72)r(p.grassD,(h2*13)|0,(h1*13)|0,2,2);       // 草影斑
    if(hash(tx,ty,3)>0.6)r(p.grassD,(h1*14)|0,(h2*14)|0,1,1);
    if(hash(tx,ty,4)>0.91){                               // 小野花(白瓣+暖芯, 稀疏点缀)
      const fx2=(2+h2*11)|0, fy=(2+h1*11)|0;
      r(rgba(p.hi2,0.85),fx2-1,fy,1,1); r(rgba(p.hi2,0.85),fx2+1,fy,1,1);
      r(rgba(p.hi2,0.85),fx2,fy-1,1,1); r(rgba(p.hi2,0.85),fx2,fy+1,1,1);
      r(hash(tx,ty,7)>0.5?p.acc:p.hi,fx2,fy,1,1);
    }
    if(h1>0.92){                                          // 符文刻线(淡金希卡纹) + 呼吸节点
      const mx=4+((h2*7)|0);
      r(rgba(p.hi,0.40),2,11,mx,1); r(rgba(p.hi,0.40),mx+1,4,1,8);
      r(rgba(p.hi,0.40),mx+1,4,Math.max(1,13-mx),1);
      const bl=0.5+0.5*Math.sin(t/620+tx*2.3+ty);
      r(rgba(p.hi,0.22+0.45*bl),mx,10,3,3);
      r(rgba(p.hi2,0.30+0.30*bl),mx+1,11,1,1);
    }else if(h2<0.05){                                    // 草间微光苔点(慢闪)
      const on=(((t/900)|0)+tx+ty)%2===0;
      r(on?rgba(p.hi,0.5):p.grass2,7,7,2,2);
    }
  }
  else if(tn==='tree'){                                    // 圆润数据果树
    r(p.grass,0,0,16,16);
    if(h1>0.6)r(p.grass2,2,12,3,2);
    r('rgba(22,40,34,.30)',4,13,8,2);                     // 软落影
    r(p.wood,7,10,2,4);                                   // 干
    r(p.leaf,3,4,10,7);                                   // 冠底(深)
    r(p.leaf2,4,3,8,7);
    r(p.leaf2,3,5,10,4);
    r(p.leaf3,6,3,4,2); r(p.leaf3,5,5,2,2);               // 受光面
    if(hash(tx,ty,8)>0.55)r(p.acc,(5+h1*6)|0,(5+h2*4)|0,1,1); // 数据果实
    if(((((t/700)|0)+tx*2+ty)%3)===0)                     // 阳光透叶闪点
      r(p.hi2,(5+h2*6)|0,(3+h1*5)|0,1,1);
  }
  else if(tn==='rock'){                                    // 岩体(整格无边距→连片成山, 不像房子)
    r(p.g0,0,0,16,16);
    r(rgba(p.dim,0.30),0,0,16,16);                        // 整体压一档(区别于亮结构)
    const ly1=(3+h1*4)|0, ly2=(9+h2*5)|0;
    r(rgba(p.bg,0.38),0,ly1,16,1);                        // 横向层理(跨格连线)
    r(rgba(p.bg,0.30),0,ly2,16,1);
    r(rgba(p.g1,0.40),(h1*10)|0,ly1+1,5,1);               // 层理下沿反光
    r(rgba(p.g1,0.45),(1+h2*9)|0,(1+h1*7)|0,4,3);         // 凸岩受光
    r(rgba(p.bg,0.30),(h1*12)|0,(4+h2*8)|0,3,2);          // 岩窝
    if(hash(tx,ty,5)>0.7)r(rgba(p.grass,0.75),(h2*12)|0,(h1*12)|0,3,2); // 苔草
    if(hash(tx,ty,6)>0.87)r(rgba(p.grass2,0.7),(1+h1*11)|0,(1+h2*11)|0,2,1);
    if(h1>0.86){                                          // 发光晶脉(稀少)
      const bl=0.3+0.3*Math.sin(t/800+tx*1.3+ty*0.7);
      r(rgba(p.hi,bl),(2+h2*11)|0,(2+h1*9)|0,1,3);
    }
  }
  else if(tn==='water'){                                   // 天蓝水面
    r(p.water,0,0,16,16);
    const w1=(((t/260)+h1*16)%16)|0, w2=(((t/380)+h2*16+8)%16)|0;
    r(rgba(p.waterL,0.5),0,w1,16,1);                      // 亮波光
    r(rgba(p.waterD,0.85),0,w2,16,1);                     // 深波影
    if(h1>0.9){
      const bl=0.5+0.5*Math.sin(t/300+tx*7.7);
      r(rgba(p.hi2,0.30+0.45*bl),(h2*14)|0,(h1*14)|0,2,1); // 阳光碎金
    }
  }
  else if(tn==='road'){                                    // 奶油石板路
    r(p.path,0,0,16,16);
    r(p.path2,1,1,14,14);
    r(rgba(p.dim,0.55),0,0,16,1); r(rgba(p.dim,0.55),0,15,16,1); // 路缘
    if(h1>0.55)r(rgba(p.path,0.9),(1+h2*10)|0,(2+h1*10)|0,4,3);  // 石板拼缝
    if(h2>0.7)r(rgba(p.dim,0.30),(1+h1*12)|0,(1+h2*12)|0,3,1);
    const ph=(tx+ty+((t/240)|0))%6;
    if(ph===0){r(p.hi,6,7,3,2); r(rgba(p.hi,0.35),2,7,3,2);}   // 流动数据包+拖尾
    else if(h2>0.85)r(rgba(p.hi,0.35),7,7,2,2);           // 路面符文点
  }
  else if(tn==='sand'){                                    // 暖沙地
    r(p.path,0,0,16,16);
    r(p.g0,(h1*12)|0,(h2*12)|0,4,2);
    r(p.g0,(h2*10)|0,(h1*13)|0,2,2);
    r(p.mid,(hash(tx,ty,5)*14)|0,(hash(tx,ty,6)*14)|0,2,1); // 亮沙纹
    if(h1>0.6)r(p.dim,(h2*14)|0,(h1*14)|0,1,1);
    if(h2>0.8)r(rgba(p.hi,0.4),(h1*14)|0,(h2*13)|0,1,1);  // 阳光碎金
  }
  else if(tn==='gate'){                                    // 能量封锁门
    r(p.grassD,0,0,16,16);
    r(p.g0,0,0,3,16); r(p.g0,13,0,3,16);                  // 石门柱
    r(p.g1,0,0,3,1); r(p.g1,13,0,3,1);
    r(p.bg,0,15,3,1); r(p.bg,13,15,3,1);
    const bl=0.42+0.38*Math.sin(t/170+ty*2.1);
    for(let i=0;i<3;i++)r(rgba(p.acc2,Math.max(0.10,bl-i*0.10)),4+i*3.5,1,2,14);
    r(rgba(p.acc2,0.9),3,7,10,1);                          // 封锁横线
  }
  else { r(p.grass,0,0,16,16); }                           // 未知类型兜底
}

/* ================= 2. 玩家 =================
   dir: 'down'|'left'|'right'|'up' 或 0..3; frame: 0|1 (走路两帧) */
const DIRS={down:0,left:1,right:2,up:3};
function drawPlayer(ctx,x,y,size,dir,frame,t,world){
  const p=pal(world), u=size/16;
  const r=R(ctx,x-8*u,y-16*u,u);
  const d=(typeof dir==='string')?(DIRS[dir]||0):((dir|0)%4);
  const f=(frame|0)%2, b=f?-1:0;
  t=t||0;
  r('rgba(20,28,38,.30)',4,14,8,2);                        // 软落地影
  r(p.bg,4,2+b,8,7); r(p.bg,3,8+b,10,6);                   // 深描边剪影
  r(p.hi,5,2+b,6,3); r(p.hi,4,3+b,8,3);                    // 金色兜帽
  if(d!==3){
    r(p.hi2,5,5+b,6,3);                                    // 脸
    if(d===0){r(p.bg,6,6+b,1,1);r(p.bg,9,6+b,1,1);}
    else if(d===1)r(p.bg,5,6+b,2,1);
    else r(p.bg,9,6+b,2,1);
  }else{
    r(rgba(p.hi,0.75),5,5+b,6,3);                          // 背面兜帽
    r(p.hi,7,5+b,2,3);
  }
  r(p.acc,5,8+b,6,1);                                      // 暖橙围巾(标志色)
  r(p.cloth,4,9+b,8,4);                                    // 天蓝短衣
  r(p.clothD,4,12+b,8,1);
  if(d===1)r(p.clothD,3,9+b,1,3);                          // 侧向手臂
  if(d===2)r(p.clothD,12,9+b,1,3);
  if(f){r(p.clothD,4,13,2,3); r(p.clothD,10,13,2,2);}      // 步态两帧
  else {r(p.clothD,5,13,2,3); r(p.clothD,9,13,2,3);}
  const bl=0.35+0.4*Math.sin(t/350);                       // 头顶信号点
  r(rgba(p.hi,bl),7,b,2,1);
}

/* ================= 3. NPC =================
   kind: 'daemon'守护进程兜帽 | 'orphan'孤儿进程小只 | 'zombie'僵尸进程缺角
         'gc'GC死神(指针钩镰刀) | 'echo'残响幽灵 | 'merchant'进制商人 */
function drawNPC(ctx,x,y,size,kind,t,world){
  const p=pal(world), u=size/16;
  t=t||0;
  const b=Math.sin(t/420+x*0.013)>0?0:-1;                  // 整像素慢浮动
  const r=R(ctx,x-8*u,y-16*u,u);
  r('rgba(20,28,38,.28)',4,14,8,2);

  if(kind==='daemon'){                                     // 圆润小机器人·灯笼精灵
    r(p.bg,4,2+b,8,7);                                     // 圆头描边
    r(p.bg,5,1+b,6,1);
    r(p.hi2,5,2+b,6,6);                                    // 奶白圆壳
    r(p.mid,5,6+b,6,2);                                    // 下巴壳影
    r(p.bg,6,4+b,1,2); r(p.bg,9,4+b,1,2);                  // 圆豆眼
    const bl=0.55+0.45*Math.sin(t/260);
    r(rgba(p.hi,bl),6,4+b,1,1); r(rgba(p.hi,bl),9,4+b,1,1);// 眼中暖光
    r(p.dim,7,0+b,2,1);                                    // 小天线
    r(rgba(p.acc,0.5+0.5*Math.sin(t/300)),7,-1+b,2,1);     // 天线暖灯
    r(p.bg,4,9+b,8,5);                                     // 小圆身描边
    r(p.cloth,5,9+b,6,4);                                  // 天蓝机身
    r(rgba(p.hi,0.85),6,10+b,4,1);                         // 胸前符文条
    r(p.clothD,5,12+b,6,1);
    r(p.bg,5,14,2,1); r(p.bg,9,14,2,1);                    // 小圆脚
  }
  else if(kind==='orphan'){                                // 小只, 独眼, 天线
    r(p.bg,5,6+b,6,8);
    r(p.hi2,6,6+b,4,4);
    r(p.bg,7,8+b,2,2); r(rgba(p.hi,0.9),7,8+b,2,1);        // 大独眼
    r(p.cloth,6,10+b,4,4);
    r(p.dim,7,3+b,1,3);                                    // 天线
    r((((t/500)|0)%2)?p.hi:p.dim,7,2+b,2,1);               // 天线灯
    r(p.bg,6,14,1,2); r(p.bg,9,14,1,2);                    // 小短腿
  }
  else if(kind==='zombie'){                                // 缺角 + 抖动(腐蚀感)
    const j=(((t/800)|0)%5===0)?1:0;
    const z=R(ctx,x-8*u+j*u,y-16*u,u);
    z(p.bg,4,2,8,13);
    z(p.g0,5,3,6,4);                                       // 头(褪色壳)
    z(p.g0,4,7,8,7);                                       // 身
    z(rgba(p.cor2,0.35),4,8,8,2);                          // 腐蚀渗纹
    z(p.bg,10,2,3,4);                                      // 缺角: 头右上
    z(p.bg,4,11,2,3);                                      // 缺角: 身左下
    z(rgba(p.cor2,0.55),2,9,9,1);                          // 错位切片(紫蚀)
    z(p.acc2,6,5,1,1);                                     // 残存红目
    z(p.bg,8,5,2,1);                                       // 空目
    z(p.dim,5,14,2,2); z(p.dim,9,14,2,1);                  // 拖行腿
  }
  else if(kind==='gc'){                                    // GC — 提灯的安静收灯人
    r(p.bg,3,0+b,9,14);
    r(p.g0,4,0+b,7,5);                                     // 兜帽(暖灰袍)
    r(p.g1,4,0+b,7,1);
    r(p.bg,5,2+b,5,3);
    r(p.hi2,6,2+b,3,2);                                    // 安静的脸
    r(p.bg,6,3+b,1,1); r(p.bg,8,3+b,1,1);                  // 阖目
    r(p.g0,4,5+b,7,9);                                     // 罩袍
    r(p.g1,4,5+b,1,9);
    r(p.g0,3,13,9,2);
    r(p.wood,13,1+b,1,13);                                 // 提灯杖
    r(p.wood,11,1+b,3,1);                                  // 挑臂
    r(p.bg,12,2+b,3,4);                                    // 灯笼框
    const gl=0.5+0.45*Math.sin(t/380);
    r(rgba(p.acc,gl),12.6,2.6+b,1.8,2.8);                  // 灯焰(呼吸暖光)
    r(rgba(p.acc,0.22*gl),11,1.6+b,5,5.4);                 // 灯晕
  }
  else if(kind==='echo'){                                  // 残响(半透明, 无腿)
    const fl=0.72+0.11*Math.sin(t/560);                    // J批: 慢呼吸(≤缓慢渐变), 不再像提示信号频闪
    ctx.save(); ctx.globalAlpha=fl;
    r(p.bg,4,2+b,8,11);
    r(p.hi2,5,3+b,6,4);                                    // 头
    r(p.bg,6,4+b,1,1); r(p.bg,9,4+b,1,1);
    r(rgba(p.hi,0.85),5,7+b,6,5);                          // 飘浮躯体
    r(rgba(p.bg,0.9),4,9+b,8,1);                           // 扫描断层
    r(rgba(p.hi,0.5),6,12+b,4,1);                          // 散逸尾
    ctx.restore();
    const ph=((t/200)|0)%4;                                // 上浮粒子
    r(rgba(p.hi2,0.55),5+ph*2,13-ph+b,1,1);
  }
  else{                                                    // merchant / 兜底
    r(p.bg,3,1+b,10,13);
    r(p.acc,4,1+b,8,2);                                    // 宽檐帽
    r(p.acc,3,3+b,10,1);
    r(p.hi2,5,4+b,6,3);                                    // 脸
    r(p.bg,6,5+b,1,1); r(p.bg,9,5+b,1,1);
    r(p.g1,4,7+b,8,6);                                     // 大衣
    r(p.acc,4,7+b,1,6); r(p.acc,11,7+b,1,6);               // 衣缘
    if((((t/400)|0)%3)===0)r(p.acc,12,8+b,2,2);            // 抛币闪光
    r(p.dim,5,13,2,3); r(p.dim,9,13,2,3);
  }
}

/* ================= 4. 领域建筑 =================
   domainId: 'beacon'信标塔 |'logic'逻辑锻造屋(NAND烟囱) |'cpu'处理器神殿(巨型芯片)
             'crypto'密码地窟(钥匙孔) |'db'数据库图书馆(叠盘) |'net'网络灯塔(旋转光束)
             'algo'算法秘境(未排序石阶) |'os'系统机房(服务器机柜) |'reboot'重启之塔
   locked: true → 半透明暗化 + 锁链 + 红锁
   opts:   {lit:n} — reboot 塔点亮段数 0..8 */
function drawBuilding(ctx,x,y,size,domainId,locked,t,world,opts){
  const p=pal(world), u=size/16;
  t=t||0;
  const b=R(ctx,x-16*u,y-30*u,u);                          // 32×30 逻辑域, 地面 y=30

  ctx.save();
  if(locked)ctx.globalAlpha=0.55;

  if(domainId==='beacon'){
    b('rgba(20,28,38,.30)',9,29,14,2);
    b(p.g1,12,6,8,21);
    b(p.dim,12,6,1,21); b(p.dim,19,6,1,21);
    b(p.g0,10,26,12,4); b(p.dim,10,26,12,1);
    b(p.dim,15,2,2,4);                                     // 天线
    b(p.dim,11,4,10,1);
    const bl=0.5+0.5*Math.sin(t/240);
    b(rgba(p.acc,0.3+0.6*bl),14,0,4,3);                    // 信标灯
    b(p.bg,14,10,4,3);                                     // 观察窗
    b(rgba(p.hi,0.6),14,16,4,1); b(rgba(p.hi,0.3),14,20,4,1);
    if(!locked){                                           // 广播环
      const rr=(t/150)%15;
      ctx.strokeStyle=rgba(p.hi,Math.max(0,0.5-rr*0.035));
      ctx.lineWidth=Math.max(1,u*0.6);
      ctx.beginPath(); ctx.arc(x,y-28*u,Math.max(1,rr*u),0,7); ctx.stroke();
    }
  }
  else if(domainId==='logic'){
    b('rgba(20,28,38,.30)',5,29,22,2);
    b(p.g1,6,16,20,13);
    b(p.dim,5,14,22,3);                                    // 屋檐
    b(p.g0,6,26,20,3);
    b(p.bg,14,21,5,8);                                     // 门
    b(rgba(p.hi,0.5),8,18,4,3); b(rgba(p.hi,0.5),22,18,3,3);
    b(p.g0,19,6,6,8);                                      // NAND 烟囱: 柱体
    b(p.dim,19,6,1,8); b(p.dim,24,6,1,8);
    b(p.g0,20,5,4,1); b(p.g0,21,4,2,1);                    // 圆顶
    const bl=0.55+0.45*Math.sin(t/300);
    b(rgba(p.hi,bl),21,2,2,2);                             // NAND 泡(发光)
    const ph=((t/300)|0)%4;                                // 数据烟
    b(rgba(p.hi2,Math.max(0.1,0.55-0.13*ph)),21+(ph%2),0-ph,2,1);
  }
  else if(domainId==='cpu'){
    b('rgba(20,28,38,.30)',3,29,26,2);
    for(let i=0;i<5;i++){b(p.dim,2,11+i*4,3,2); b(p.dim,27,11+i*4,3,2);}  // 引脚
    b(p.g1,5,9,22,20);                                     // 芯片体
    b(p.dim,5,9,22,1); b(p.g0,5,27,22,2);
    for(let i=0;i<4;i++)b(p.g0,7+i*5,13,2,9);              // 立柱=引脚网格
    b(p.bg,13,23,6,6);                                     // 门
    const bl=0.5+0.5*Math.sin(t/300);
    b(p.dim,11,2,10,1); b(p.dim,11,8,10,1);
    b(rgba(p.hi,0.22+0.5*bl),12,3,8,5);                    // 顶部发光 die
    b(p.hi2,15,5,2,1);
  }
  else if(domainId==='crypto'){
    b('rgba(20,28,38,.30)',5,29,22,2);
    b(p.g1,5,14,22,15);                                    // 岩丘
    b(p.g0,7,11,18,4); b(p.g0,10,9,12,3);
    b(p.dim,5,14,22,1); b(p.dim,10,9,12,1);
    b(p.bg,13,17,6,6);                                     // 钥匙孔: 圆部
    b(p.bg,14.5,22,3,7);                                   // 钥匙孔: 柄
    const bl=((t/450)|0)%4;
    [[8,20],[23,19],[9,25],[22,25]].forEach(function(q,i){
      b(rgba(p.hi,i===bl?0.85:0.22),q[0],q[1],1,2);        // 符文轮闪
    });
  }
  else if(domainId==='db'){
    b('rgba(20,28,38,.30)',5,29,22,2);
    [[6,22,20,7],[7,14,18,7],[8,6,16,7]].forEach(function(s){ // 叠盘
      b(p.g1,s[0],s[1],s[2],s[3]);
      b(p.dim,s[0],s[1],s[2],2);
      b(p.g0,s[0],s[1]+s[3]-1,s[2],1);
    });
    b(p.bg,13,24,6,5);                                     // 门
    const ph=((t/350)|0)%3;
    for(let i=0;i<3;i++)b(i===ph?p.hi:rgba(p.hi,0.2),11+i*4,17,2,1); // 索引灯
  }
  else if(domainId==='net'){
    b('rgba(20,28,38,.30)',9,29,14,2);
    b(p.g1,12,10,8,17);
    for(let i=0;i<4;i++)b(p.dim,12,12+i*4,8,2);            // 条纹
    b(p.g0,10,26,12,3); b(p.dim,10,26,12,1);
    b(p.g0,11,8,10,2);                                     // 灯室底
    b(rgba(p.acc,0.9),13,5,6,3);                           // 灯
    b(p.dim,12,4,8,1);
    if(!locked){                                           // 旋转光束
      const a=t/700, cx=x, cy=y-23.5*u;
      ctx.save(); ctx.globalAlpha=0.16; ctx.fillStyle=p.hi;
      ctx.beginPath(); ctx.moveTo(cx,cy);
      ctx.lineTo(cx+Math.cos(a-0.22)*24*u, cy+Math.sin(a-0.22)*24*u);
      ctx.lineTo(cx+Math.cos(a+0.22)*24*u, cy+Math.sin(a+0.22)*24*u);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }
  else if(domainId==='algo'){                              // 未排序石阶
    b('rgba(20,28,38,.30)',3,29,26,2);
    const hs=[8,16,11,20,14,9,17];
    for(let i=0;i<7;i++){
      const hh=hs[i], xi=2+i*4;
      b(p.g1,xi,29-hh,3,hh);
      b(p.dim,xi,29-hh,3,1);
      if(hash(i,3)>0.5)b(p.g0,xi,29-((hh/2)|0),3,1);       // 岩缝
    }
    b(p.bg,15,25,3,4);                                     // 门洞(在 20 高柱)
    const k=((t/500)|0)%7;                                 // 比较指针在柱间跳
    b(p.hi,3+k*4,29-hs[k]-3,1,2);
    b(rgba(p.hi,0.4),3+k*4,29-hs[k]-4,1,1);
  }
  else if(domainId==='os'){                                // 服务器机柜
    b('rgba(20,28,38,.30)',6,29,20,2);
    b(p.g1,7,6,18,23);
    b(p.dim,7,6,18,1); b(p.g0,7,27,18,2);
    for(let i=0;i<4;i++){
      b(p.g0,9,9+i*4,14,2);                                // 机架槽
      for(let j=0;j<4;j++){
        const on=hash(i,j,(t/280)|0)>0.5;
        b(on?p.hi:rgba(p.hi,0.14),10+j*3,9.5+i*4,1,1);     // LED 阵
      }
    }
    b(p.bg,14,25,4,4);                                     // 门
    b(p.dim,13,25,1,4); b(p.dim,18,25,1,4);
  }
  else if(domainId==='reboot'){                            // 重启之塔(8 段锁)
    const lit=(opts&&opts.lit)|0;
    b('rgba(20,28,38,.30)',8,29,16,2);
    for(let i=0;i<8;i++){
      const gy=26-i*3.4, on=i<lit;
      b(on?rgba(p.hi,0.85):p.g1,10,gy,12,3);
      b(on?p.hi2:p.dim,10,gy,12,1);
    }
    b(p.dim,15,-3,2,3);                                    // 顶针
    const bl=0.4+0.5*Math.sin(t/200);
    b(rgba(p.acc,bl),14,-4,4,1);
  }
  else{                                                    // 未知 → 通用方碉
    b('rgba(20,28,38,.30)',7,29,18,2);
    b(p.g1,8,12,16,17); b(p.dim,7,10,18,3);
    b(p.bg,14,23,4,6);
  }
  ctx.restore();

  if(locked){                                              // 锁链 + 锁
    const c=R(ctx,x-16*u,y-30*u,u);
    for(let i=0;i<15;i++){                                 // 交叉双链(连续链节)
      const lx=2+i*2, ly=7+i*1.5;
      c(i%2?p.dim:p.g1, lx, ly, 2.4,1.8);
      c(i%2?p.g1:p.dim, 30-lx-2.4, ly, 2.4,1.8);
      if(i%4===0){c(rgba(p.hi,0.35),lx+0.6,ly+0.4,1,1);    // 链节高光
                  c(rgba(p.hi,0.35),30-lx-1.8,ly+0.4,1,1);}
    }
    c(p.bg,11,13,10,9);                                    // 锁底衬
    c(p.g1,12,14,8,7); c(p.dim,12,14,8,1); c(p.dim,12,14,1,7); // 锁体
    c(p.dim,13,11,1,3); c(p.dim,18,11,1,3); c(p.dim,13,10,6,1); // 锁梁
    const bl=(((t/600)|0)%2)?0.95:0.4;
    c(rgba(p.acc2,bl),15,16,2,2); c(rgba(p.acc2,bl),15.5,18,1,2); // 红色锁眼
  }
}

/* ================= 5. 装饰物 =================
   kind: 'puzzleStation'谜题站 |'stele'石碑 |'wall'刻痕墙
         'terminal'/'infoTerminal'信息终端 |'signal'信号塔
         'vending'售货机 |'cave'洞口 |'cache'数据缓存箱
         'particles'环境粒子 |'corruption'腐蚀污渍(纯氛围)
   —— 可交互物三级视觉分类(重要度=视觉重量) ——
   ① puzzleStation(最高): 双格宽装置+台座+垂直光柱+大屏滚动内容,
      缩小视图里也"跳出来" — 关卡/谜题入口用这个。
   ② terminal(中): 单格小终端, 小屏静态微光, 无光柱 — 提示/信息用。
   ③ stele(低): lore 可读物, 最低调, 只有微弱刻痕光。
   touched(可选, 第 8 参): 该物是否已交互过。
     未交互(缺省) → 正常亮度 + 每 ~4.5s 单次 glint 星光划过(引导注意)
     已交互      → 各 kind 自己的"完成形态"(有故事的残留, 不是涂黑):
       cache=开盖空箱 / stele=刻字暗但轮廓清晰 / terminal=屏幕熄灭机身在
       signal=顶灯熄灭停波 / vending=灯灭窗暗 / cave=洞内无光
       puzzleStation=光柱熄灭+屏幕定格。
       亮度降档但内部对比度保留(描边/结构线全在), 动画冻结。
   图底分离: 上述可交互 kind 有深描边+亮body+glint;
     particles/corruption 属"氛围档", 永不闪 glint。 */
function drawDecor(ctx,x,y,size,kind,t,world,touched){
  if(kind==='infoTerminal')kind='terminal';                // 语义别名
  const p=pal(world), u=size/16;
  t=t||0;
  const INTERACTIVE=(kind!=='particles'&&kind!=='corruption');
  if(INTERACTIVE&&touched)t=0;                             // 完成态: 动画冻结

  if(kind==='puzzleStation'){                              // ① 谜题站(最高级)
    const r=R(ctx,x-12*u,y-16*u,u);                        // 24 宽覆盖域
    if(!touched){                                          // 垂直光柱(远处可见的"正事"信标)
      const bl=0.5+0.3*Math.sin(t/520+x*0.01);
      ctx.fillStyle=rgba(p.hi,0.12+0.08*bl);
      ctx.fillRect(Math.round(x-4*u),Math.round(y-46*u),Math.max(1,Math.round(8*u)),Math.round(33*u));
      ctx.fillStyle=rgba(p.hi,0.24+0.14*bl);
      ctx.fillRect(Math.round(x-2*u),Math.round(y-46*u),Math.max(1,Math.round(4*u)),Math.round(33*u));
      ctx.fillStyle=rgba(p.hi2,0.35+0.25*bl);              // 柱心亮线
      ctx.fillRect(Math.round(x-0.6*u),Math.round(y-46*u),Math.max(1,Math.round(1.2*u)),Math.round(33*u));
    }
    r('rgba(20,28,38,.30)',1,14,22,2);                     // 影
    r(p.bg,1.2,11.4,21.6,3.8);                             // 台座描边
    r(p.g0,2,12,20,2.6); r(p.mid,2,12,20,1);               // 台座(dais)
    r(p.bg,4.2,0.2,15.6,13);                               // 机身描边
    r(p.g1,5,1,14,11.4); r(p.mid,5,1,14,1);                // 机身
    r(rgba(p.hi2,0.55),5,1,1,11.4);                        // 左受光边
    r(p.bg,6.4,2.6,11.2,6.4);                              // 大屏
    const off=touched?0:((t/260)|0)%3;                     // 滚动内容
    for(let i=0;i<3;i++)
      r(rgba(p.hi,touched?0.10:((i+off)%3===0?0.9:0.35)),7.4,3.6+i*1.8,5+((i*3+off)%3)*2,1);
    r(p.dim,6.6,10,4,1); r(p.dim,12.4,10,4.6,1);           // 控制键排
    r(p.bg,10.4,-1.8,3.2,2.4);                             // 顶灯座
    r(touched?rgba(p.dim,0.9):rgba(p.hi,0.5+0.5*Math.sin(t/300)),11,-1.4,2,1.6); // 顶灯
  }
  else if(kind==='stele'){
    const r=R(ctx,x-8*u,y-16*u,u);
    r('rgba(20,28,38,.30)',3,14,10,2);
    r(p.bg,4.2,1.2,7.6,13);                                 // 深描边(从背景站出来)
    r(p.g1,5,2,6,12); r(p.mid,5,2,6,1); r(rgba(p.hi2,0.6),5,2,1,12);
    r(p.bg,2.2,12.2,11.6,3);                                // 底座描边
    r(p.g0,3,13,10,2); r(p.mid,3,13,10,1);
    if(touched){                                            // 完成态: 刻字暗但清晰
      for(let i=0;i<3;i++)r(rgba(p.bg,0.55),6,4+i*3,4,1);
    }else{                                                  // ③ 低级: 微弱刻痕光(最低调)
      const off=((t/700)|0)%3;
      for(let i=0;i<3;i++)
        r(rgba(p.hi,(i+off)%3===0?0.55:0.20),6,4+i*3,4,1);
    }
  }
  else if(kind==='wall'){                                   // 刻痕之墙 (24 宽)
    const r=R(ctx,x-12*u,y-16*u,u);
    r('rgba(20,28,38,.30)',1,14,22,2);
    r(p.bg,0.2,1.2,23.6,14);                                // 深描边
    r(p.g1,1,2,22,12); r(p.mid,1,2,22,1); r(p.g0,1,13,22,2);
    r(p.bg,17,3,1,5);                                       // 裂缝
    if(touched){                                            // 完成态: 刻痕暗但在
      for(let i=0;i<8;i++){
        r(rgba(p.bg,0.5),3+i*2.4,5,1.6,1);
        r(rgba(p.bg,0.5),3+i*2.4,9,1.6,1);
      }
    }else{
      const bl=0.5+0.35*Math.sin(t/320);
      for(let i=0;i<8;i++){                                 // 两行刻痕比特(强调色)
        r(rgba(p.acc,i%2?bl:0.75),3+i*2.4,5,1.6,1);
        r(rgba(p.acc,i%2?0.75:bl),3+i*2.4,9,1.6,1);
      }
    }
  }
  else if(kind==='terminal'){
    const r=R(ctx,x-8*u,y-16*u,u);
    r('rgba(20,28,38,.30)',3,14,10,2);
    r(p.bg,3.2,3.2,9.6,11.6);                               // 深描边
    r(p.g1,4,4,8,10); r(p.mid,4,4,8,1);
    r(p.bg,5,5,6,5);                                        // 屏
    if(touched){                                            // 完成态: 屏幕熄灭机身在
      r(rgba(p.hi2,0.14),6,7,4,1);                          // 余晖一线
    }else{                                                  // ② 中级: 静态微光, 不闪不抢
      r(rgba(p.hi,0.55),6,6,4,1); r(rgba(p.hi,0.35),6,8,3,1);
    }
    r(p.dim,6,11,4,1);                                      // 键位
    r(p.g0,6,14,4,2);                                       // 底座
  }
  else if(kind==='signal'){
    const r=R(ctx,x-8*u,y-16*u,u);
    r('rgba(20,28,38,.30)',4,14,8,2);
    r(p.bg,6.3,2.3,3.4,12);                                 // 杆深描边
    r(p.g0,7,3,2,11);                                       // 杆
    r(p.bg,3.2,12.2,9.6,3);
    r(p.g1,4,13,8,2); r(p.mid,4,13,8,1);                    // 底
    r(p.bg,3.4,3.4,9.2,1.6); r(p.g0,4,4,8,1); r(p.g0,5,6,6,1); // 横臂
    if(touched){                                            // 完成态: 灯灭停波
      r(rgba(p.dim,0.9),7,1,2,2);
    }else{
      const pl=0.5+0.5*Math.sin(t/220);
      r(rgba(p.acc,0.3+0.6*pl),7,1,2,2);                    // 顶灯
      const rr=(t/180)%10;                                  // 波纹
      ctx.strokeStyle=rgba(p.acc,Math.max(0,0.5-rr*0.05));
      ctx.lineWidth=Math.max(1,u*0.6);
      ctx.beginPath(); ctx.arc(x,y-14*u,Math.max(1,rr*u),0,7); ctx.stroke();
    }
  }
  else if(kind==='vending'){
    const r=R(ctx,x-8*u,y-16*u,u);
    r('rgba(20,28,38,.30)',3,14,10,2);
    r(p.bg,3.2,0.2,9.6,15);                                 // 深描边
    r(p.g1,4,1,8,14); r(p.mid,4,1,8,1); r(rgba(p.hi2,0.6),4,1,1,14);
    r(p.bg,5,3,4,6);                                        // 展示窗
    r(rgba(p.hi,touched?0.12:0.5),5,3,4,1);                 // 窗内光(完成态近灭)
    r(p.g0,10,3,1,6);                                       // 投币槽
    if(touched)r(rgba(p.dim,0.8),10,10,1,1);                // 完成态: 故障灯熄
    else r((((t/700)|0)%2)?p.acc2:rgba(p.acc2,0.3),10,10,1,1); // 故障灯
    r(p.g0,5,11,6,2);                                       // 出货口
  }
  else if(kind==='cave'){
    const r=R(ctx,x-8*u,y-16*u,u);
    r('rgba(20,28,38,.30)',2,14,12,2);
    r(p.bg,1.2,5.2,13.6,10);                                // 深描边
    r(p.g0,2,6,12,9); r(p.g1,4,4,8,3); r(p.mid,2,6,12,1);
    r(p.bg,5,9,6,6);                                        // 洞口
    if(!touched){
      const bl=0.3+0.3*Math.sin(t/500);
      r(rgba(p.hi,bl),7,12,2,1);                            // 洞内微光(完成态无光)
    }
  }
  else if(kind==='cache'){                                  // 数据缓存箱
    const r=R(ctx,x-8*u,y-16*u,u);
    r('rgba(20,28,38,.30)',3,14,10,2);
    if(!touched){                                           // 未开: 闭合+锁缝发光
      r(p.bg,3.2,5.2,9.6,10);                               // 深描边
      r(p.g0,4,6,8,9);                                      // 箱体
      r(p.g1,4,6,8,3); r(p.mid,4,6,8,1);                    // 盖
      const bl=0.6+0.35*Math.sin(t/360);
      r(rgba(p.hi,bl),4,9.4,8,1);                           // 发光锁缝
      r(p.hi,7,8.6,2,2.4); r(rgba(p.hi2,0.9),7.4,9,1,1);    // 锁扣
    }else{                                                  // 完成态: 开盖空箱(有故事的残留)
      r(p.bg,2.6,3.6,10.8,4.2);                             // 掀开的盖(靠后立着)描边
      r(p.g1,3.4,4.2,9.2,3); r(p.mid,3.4,4.2,9.2,1);        // 盖面(受光)
      r(p.bg,3.2,7.6,9.6,7.6);                              // 箱体描边
      r(p.g0,4,8.4,8,6);                                    // 箱体
      r(p.bg,4.8,9.2,6.4,3.6);                              // 空箱内里(深)
      r(rgba(p.g1,0.5),4.8,9.2,6.4,1);                      // 内壁上沿反光
      r(rgba(p.dim,0.7),4.8,12,6.4,0.8);                    // 内底
      r(rgba(p.hi,0.18),7,10,2,1);                          // 一点残余数据微光
    }
  }
  else if(kind==='corruption'){                             // 腐蚀污渍(局部点缀!)
    /* 紫黑斑块贴地 + 瘴气脉动 + 悬浮碎片 — BotW 灾厄质感。
       世界越明亮, 这一小片越刺眼: 只在坏核心附近撒, 别铺满。 */
    const r=R(ctx,x-12*u,y-16*u,u);                        // 24 宽覆盖域
    r(rgba(p.cor,0.92),4,10,16,5);                         // 主污渍
    r(rgba(p.cor,0.80),1,12,6,3); r(rgba(p.cor,0.80),17,11,6,4);
    r(rgba(p.cor,0.62),7,8,9,3);  r(rgba(p.cor,0.45),12,7,4,2);
    r(rgba(p.cor2,0.38),5,11,13,3);                        // 内部紫光晕
    const bl=0.55+0.40*Math.sin(t/480+x*0.011);
    r(rgba(p.cor2,bl),8,11,3,3);                           // 脉动气泡
    r(rgba(p.cor2,bl*0.8),15,12,2,2);
    r(rgba(p.cor3,bl*0.7),12,10,2,1);
    r(rgba(p.cor3,bl*0.5),9,9,1,1);
    r(rgba(p.cor2,0.6),3,13,1,1); r(rgba(p.cor2,0.6),20,13,1,1); // 溅点
    r(rgba(p.cor,0.5),0,14,3,1);  r(rgba(p.cor,0.5),21,14,3,1);  // 蔓延须
    for(let i=0;i<3;i++){                                  // 悬浮碎片(缓慢上浮)
      const ph=((t/40)+i*37)%100;
      const sx=x+(hash(i,13)*20-10)*u+Math.sin(t/600+i*2.1)*2*u;
      const sy=y-4*u-(ph/100)*14*u;
      ctx.fillStyle=rgba(i===1?p.cor3:p.cor2,0.8*(1-ph/100));
      const s=Math.max(1,Math.round(u*(1.6-i*0.3)));
      ctx.fillRect(Math.round(sx),Math.round(sy),s,s);
    }
  }
  else if(kind==='particles'){                              // 环境光尘(花粉/萤光)
    for(let i=0;i<4;i++){
      const ph=((t/28)+i*29)%110;
      const sx=x+(hash(i,7)*28-14)*u, sy=y-(ph/110)*22*u;
      ctx.fillStyle=rgba(i%2?p.hi:p.hi2,0.65*(1-ph/110));
      const s=Math.max(1,Math.round(u));
      ctx.fillRect(Math.round(sx),Math.round(sy),s,s);
    }
  }

  if(INTERACTIVE&&touched){ ctx.restore(); }
  else if(INTERACTIVE){                                     // 待机 glint: ~4.5s 单次星光划过
    const cyc=(t+(((x*13+y*7)|0)%4600)+4600)%4600;          // 相位按坐标错开
    if(cyc<420){
      const pr=cyc/420, ga=Math.sin(Math.PI*pr);
      const gx=x+(pr*10-5)*u, gy=y-(14.5-pr*2.5)*u;
      const s1=Math.max(1,Math.round(u));
      ctx.fillStyle=rgba(p.hi2,0.95*ga);
      ctx.fillRect(Math.round(gx-s1),Math.round(gy),s1*3,s1);   // 星形: 横
      ctx.fillRect(Math.round(gx),Math.round(gy-s1),s1,s1*3);   //        竖
      ctx.fillStyle=rgba(p.hi,0.5*ga);
      ctx.fillRect(Math.round(gx),Math.round(gy),s1,s1);        // 芯
    }
  }
}

/* ================= 6. 全屏特效 =================
   art v3: CRT 时代结束 — 扫描线/暗角不再绘制(函数签名保留,
   引擎每帧照常调用, 这里是干净 no-op)。glitch 保留为"腐蚀侵入"
   剧情瞬间特效, 色散条改为腐蚀紫/符文金。 */
const fx={
  /* (v3 no-op) 旧 CRT 扫描线 — 明亮世界不需要 */
  scanlineCanvas(ctx,w,h){},
  /* (v3 no-op) 旧 CRT 暗角 — 阳光世界不压四角 */
  vignette(ctx,w,h){},
  /* 腐蚀撕裂: intensity 0..1, 只在切章/腐蚀事件等瞬间连放 6~12 帧 */
  glitch(ctx,w,h,intensity){
    const k=Math.max(0,Math.min(1,intensity==null?0.5:intensity));
    const n=(2+k*6)|0;
    for(let i=0;i<n;i++){
      const y=(Math.random()*h)|0, hh=(2+Math.random()*10*k)|0, dx=((Math.random()-0.5)*44*k)|0;
      if(hh<1||dx===0)continue;
      ctx.drawImage(ctx.canvas,0,y,w,hh,dx,y,w,hh);
    }
    if(Math.random()<k){                                    // 腐蚀色条(紫+金)
      const y=(Math.random()*h)|0;
      ctx.fillStyle='rgba(139,92,214,'+(0.10*k).toFixed(3)+')'; ctx.fillRect(0,y,w,2);
      ctx.fillStyle='rgba(247,201,72,'+(0.08*k).toFixed(3)+')'; ctx.fillRect(0,y+2,w,2);
    }
  },
  /* NPC 名牌: 名牌是 UI 不是场景元素 — 自带对比度, 永不依赖背景。
     (cx,cy)=名牌中心。半透明深色胶囊底板 + 近白文字(不随世界色板走)。
     hot=true(有新话/重要) → 文字提亮为暖金 + 底板描边亮一档。 */
  nameplate(ctx,cx,cy,text,hot){
    if(!text)return;
    ctx.save();
    ctx.font="13px 'Cascadia Code','Consolas','Microsoft YaHei','PingFang SC','Noto Sans SC',monospace"; ctx.textAlign='center'; ctx.textBaseline='middle';
    const w=ctx.measureText(text).width+20, h=21, r0=10;
    const x0=cx-w/2, y0=cy-h/2;
    ctx.beginPath();                                        // 圆角胶囊
    ctx.moveTo(x0+r0,y0);
    ctx.arcTo(x0+w,y0,x0+w,y0+h,r0); ctx.arcTo(x0+w,y0+h,x0,y0+h,r0);
    ctx.arcTo(x0,y0+h,x0,y0,r0);     ctx.arcTo(x0,y0,x0+w,y0,r0);
    ctx.closePath();
    ctx.fillStyle='rgba(12,17,24,.55)'; ctx.fill();
    ctx.strokeStyle=hot?'rgba(255,207,110,.75)':'rgba(255,255,255,.18)';
    ctx.lineWidth=1; ctx.stroke();
    ctx.lineWidth=2; ctx.strokeStyle='rgba(10,14,20,.85)';  // 文字深描边
    ctx.strokeText(text,cx,cy+0.5);
    ctx.fillStyle=hot?'#ffe9a8':'#f2f6fa';                  // 近白(名牌专用色)
    ctx.fillText(text,cx,cy+0.5);
    ctx.restore();
  },
  /* Q 键 ping 扫描脉冲: 以玩家为圆心的雷达波。引擎每帧传当前半径
     (自己推进 radius, 建议 ~420px/s, 波前扫过的可交互物由引擎高亮)。
     world 可选, 默认 as 金色 / a2 灯火金。 */
  pingWave(ctx,cx,cy,radius,t,world){
    const p=pal(world);
    const a=Math.max(0,1-radius/560);
    if(a<=0||radius<=0)return;
    ctx.save();
    ctx.strokeStyle=rgba(p.hi,0.55*a); ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(cx,cy,Math.max(1,radius),0,7); ctx.stroke();
    ctx.strokeStyle=rgba(p.hi2,0.35*a); ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(cx,cy,Math.max(1,radius-3),0,7); ctx.stroke();
    ctx.restore();
  }
};

/* ================================================================
   7. v2 — 3/4 俯视伪透视增量 API (塞尔达 ALttP / 星露谷式)
   ----------------------------------------------------------------
   v1 全部函数原样保留, v2 是升级开关(引擎按需切换)。核心约定:
   · 墙/山体: 顶面(亮)画在自身上方一格(y-size), 立面(暗,1格高)画在
     本格——且只在「南邻不是墙」时画。连排竖墙因此自动拼成整片屋顶,
     只有每段最南一排露出立面; 上/下相邻的墙格互相天然拼接, 无缝。
   · 高楼: 锚点仍是地基底边中心(与 v1 drawBuilding 一致),
     高度 heightOf(id) 格, 全部向"上"溢出——远处能越过 1 格高的墙看到。
   · 遮挡: 一律按 ySortHint(kind, 基线世界y) 升序绘制;
     玩家基线 y 小于建筑基线 → 先画玩家 → 被立面盖住(=站在楼后)。
   ================================================================ */

const V2_HEIGHT={                                          // 单位: 格
  wall:1, rock:1, tree:1,
  logic:2.5, crypto:2.5, cpu:3, algo:3, db:3.5, os:3.5,
  beacon:4, net:4, reboot:4, building:3,
  stele:1, terminal:1, vending:1, cave:1, wall_carve:1, signal:2,
  puzzleStation:3, cache:1,
  player:1, npc:1
};
function heightOf(kind){ return V2_HEIGHT[kind]!=null?V2_HEIGHT[kind]:1; }

/* 排序键: 返回值升序绘制。baseY=基线世界像素 y(脚底/地基底边/墙格下缘)。
   偏置保证同一基线时 地面<墙<装饰<建筑<NPC<玩家, 画面稳定不打架。 */
const Y_BIAS={ground:-0.6,tile:-0.45,wall:-0.45,decor:-0.10,building:-0.05,npc:0.04,player:0.10,fx:0.5};
function ySortHint(kind,baseY){ return baseY+(Y_BIAS[kind]!=null?Y_BIAS[kind]:0); }

/* 邻接归一化: {up,down,left,right} / {n,s,w,e} / 位掩码(1上2右4下8左) / 数组[上右下左] */
function nbrs(n){
  if(n==null)return{up:false,right:false,down:false,left:false};
  if(typeof n==='number')return{up:!!(n&1),right:!!(n&2),down:!!(n&4),left:!!(n&8)};
  if(Array.isArray(n))return{up:!!n[0],right:!!n[1],down:!!n[2],left:!!n[3]};
  return{up:!!(n.up!=null?n.up:n.n),right:!!(n.right!=null?n.right:n.e),
         down:!!(n.down!=null?n.down:n.s),left:!!(n.left!=null?n.left:n.w)};
}

/* ---------- 7.1 两段式墙/山体 ----------
   (x,y)=本格屏幕左上角。顶面永远画在 (x,y-size)——调用方需保证墙格
   在其北邻行内容之后绘制(逐行 painter 或把墙当实体排序, 见接入文档)。
   kind(可选第 8 参): 'rock'(默认, 自然断崖 — 世界地图的山体/边界用这个,
   顶面不规则起伏+岩层立面, 不会被误读成房子) | 'wall'(人造墙 — interior
   房间墙/要塞城墙用, 平顶直立面的建筑语言)。 */
function drawWallTall(ctx,x,y,size,neighbors,world,t,kind,wx,wy){
  const p=pal(world), u=size/16, n=nbrs(neighbors);
  /* 细节斑点种子必须用世界格坐标 (wx,wy), 否则镜头一滚屏幕坐标就变→斑点每步重掷。
     兼容旧调用: 未传世界坐标时退回屏幕坐标推算(仅无缓存/静止时可用)。 */
  const tx=(wx!=null)?wx:Math.round(x/size), ty=(wy!=null)?wy:Math.round(y/size);
  t=t||0; kind=kind||'rock';
  const h1=hash(tx,ty,11), h2=hash(tx,ty,12);

  if(kind==='rock'){
    /* ---- 自然断崖: 顶面不规则 + 岩层立面 ---- */
    const dy=(h1*3)|0;                                     // 顶面北缘起伏(0..2px)
    const rt=R(ctx,x,y-size+dy*u,u);
    const th=16-dy;                                        // 本格顶面实际高度
    rt(p.g0,0,0,16,th);                                    // 岩顶基底(中灰)
    rt(rgba(p.mid,0.45),0,0,16,th);                        // 受光提亮(弱于人造墙)
    rt(rgba(p.g1,0.9),(1+h2*9)|0,(1+h1*8)|0,5,3);          // 亮岩板
    rt(rgba(p.dim,0.55),(h1*11)|0,(3+h2*9)|0,4,2);         // 暗岩窝
    rt(rgba(p.grass,0.9),(h2*12)|0,(h1*7)|0,4,2);          // 顶面苔草
    if(hash(tx,ty,13)>0.5)rt(rgba(p.grass2,0.85),(1+h1*11)|0,(2+h2*9)|0,3,2);
    if(!n.up){                                             // 北缘: 锯齿受光棱
      rt(rgba(p.hi2,0.85),0,0,16,1);
      rt(rgba(p.hi2,0.7),(h1*6)|0,1,3,1); rt(rgba(p.hi2,0.7),(8+h2*5)|0,1,3,1);
      rt(rgba(p.g0,0.9),(2+h2*10)|0,0,2,1);                // 缺口
    }
    if(!n.left){ rt(rgba(p.mid,0.8),0,0,1,th); if(h2>0.5)rt(p.g0,0,(2+h1*8)|0,1,3); }
    if(!n.right){ rt(rgba(p.dim,0.7),15,0,1,th); }
    if(hash(tx,ty,14)>0.80){                               // 顶面点缀: 发光晶簇
      const bl=0.4+0.35*Math.sin(t/700+tx*1.7+ty);
      const cx2=(3+h2*9)|0, cy2=(3+h1*8)|0;
      rt(rgba(p.hi,bl),cx2,cy2,2,2); rt(rgba(p.hi2,bl*0.8),cx2+0.5,cy2-1,1,1);
    }else if(hash(tx,ty,15)>0.82){                         // 或: 小灌木
      rt(rgba(p.leaf2,0.95),(2+h1*10)|0,(2+h2*8)|0,3,2);
      rt(rgba(p.leaf3,0.9),(3+h1*10)|0,(1.5+h2*8)|0,1,1);
    }

    /* 立面: 岩层理 + 碎石, 只有南侧无墙时露出 */
    if(!n.down){
      const rf=R(ctx,x,y,u);
      rf(p.g0,0,0,16,16);
      rf(rgba(p.bg,0.42),0,0,16,16);                       // 背光压暗
      rf(rgba(p.mid,0.5),0,0,16,1);                        // 崖口
      rf('rgba(20,28,38,.30)',0,1,16,1.2);                 // 崖口投影
      for(let i=0;i<3;i++){                                // 横向层理(不等距)
        const ly=(3+i*4+hash(tx,ty,30+i)*2.5)|0;
        rf(rgba(p.bg,0.55),0,ly,16,1);
        rf(rgba(p.g1,0.30),0,ly+1,16,0.8);                 // 层理下沿反光
      }
      rf(rgba(p.bg,0.5),(1+h1*11)|0,(4+h2*7)|0,3,2);       // 凹坑
      rf(rgba(p.g1,0.4),(2+h2*11)|0,(2+h1*5)|0,2,1);       // 凸石受光
      if(hash(tx,ty,24)>0.84){                             // 裂缝晶脉(青)
        const bl=0.25+0.25*Math.sin(t/560+tx*2.1);
        rf(rgba(p.hi,bl),(3+h1*10)|0,3,1,8);
      }
      if(!n.left)rf(rgba(p.bg,0.8),0,0,1,16);              // 端头收边(软)
      if(!n.right)rf(rgba(p.bg,0.8),15,0,1,16);
      rf('rgba(20,28,38,.36)',0,14,16,2);                  // 接地暗带
      rf(rgba(p.g0,0.9),(h1*12)|0,14,3,1.4);               // 坡脚碎石
      rf(rgba(p.g1,0.6),(3+h2*10)|0,14.4,2,1);
    }
    return;
  }

  /* ---- 人造墙(interior/城墙): 平顶 + 板材立面 ---- */
  /* 顶面(亮) — 画在上方一格。值阶: 顶面 > 立面 > 地面 */
  const rt=R(ctx,x,y-size,u);
  rt(p.g1,0,0,16,16);
  rt(rgba(p.mid,0.75),0,0,16,16);                          // 受光提亮罩(明确高于地面)
  rt(rgba(p.g0,0.9),(2+h1*10)|0,(2+h2*10)|0,4,3);          // 顶面拼板
  if(hash(tx,ty,13)>0.55)rt(rgba(p.g0,0.7),(h1*13)|0,(3+h2*10)|0,2,1);
  if(!n.up){ rt(p.hi2,0,0,16,2); rt(rgba(p.hi2,0.9),0,0,16,1); } // 北棱受光
  if(!n.left)rt(p.hi2,0,0,1,16);                           // 西棱
  if(!n.right)rt(p.hi2,15,0,1,16);                         // 东棱
  if(!n.up&&!n.left)rt(p.hi2,0,0,2,2);                     // 角高光
  if(!n.up&&!n.right)rt(p.hi2,14,0,2,2);
  if(h1>0.86){                                             // 顶面导光条微光
    const bl=0.3+0.3*Math.sin(t/700+tx*1.7+ty);
    rt(rgba(p.hi,bl),(2+h2*11)|0,(3+h1*10)|0,3,1);
  }

  /* 立面(暗于顶面、亮于地面, 1格高) — 只有南侧无墙时露出 */
  if(!n.down){
    const rf=R(ctx,x,y,u);
    rf(p.g0,0,0,16,16);
    rf(rgba(p.dim,0.45),0,0,16,16);                        // 立面背光罩(压暗)
    rf(p.mid,0,0,16,1);                                    // 檐口接缝
    rf('rgba(20,28,38,.30)',0,1,16,1.4);                       // 檐下投影
    for(let i=0;i<3;i++){                                  // 竖向体块分缝
      const px=(1+hash(tx,ty,20+i)*14)|0;
      rf(rgba(p.bg,0.75),px,2,1,12);
    }
    if(h2>0.6)rf(rgba(p.bg,0.35),(2+h1*11)|0,(5+h2*6)|0,3,2); // 立面剥落
    if(hash(tx,ty,24)>0.8){                                // 立面导光缝(青)
      const bl=0.25+0.25*Math.sin(t/560+tx*2.1);
      rf(rgba(p.hi,bl),(3+h1*10)|0,4,1,7);
    }
    if(!n.left)rf(p.bg,0,0,1,16);                          // 段落端头描边
    if(!n.right)rf(p.bg,15,0,1,16);
    rf('rgba(20,28,38,.36)',0,14,16,2);                        // 接地暗带
  }
}

/* ---------- 7.2 立体高楼 ----------
   签名与 v1 drawBuilding 对齐: (x,y)=地基底边中心, 逻辑宽 32(=2格)。
   总高 heightOf(domainId)*16 逻辑格, 向上溢出。opts:{lit} 供 reboot。 */

/* 体块 helper: 顶面(亮, rd 进深) + 正立面(中明度) + 右侧影 + 描边
   值阶: 顶面 > 立面 > 地面 — 高度感的根基 */
function slab(b,p,x0,topY,w,botY,rd){
  b(p.g1,x0,topY+rd,w,botY-topY-rd);                       // 正立面基底(暖沙)
  b(rgba(p.dim,0.28),x0,topY+rd,w,botY-topY-rd);           // 立面背光罩(压暗一档)
  b(rgba(p.hi2,0.30),x0+1,topY+rd,1.4,botY-topY-rd);       // 左内受光边
  b('rgba(20,28,38,.26)',x0+w-3,topY+rd,3,botY-topY-rd);      // 右侧影(体积)
  b(p.g1,x0,topY,w,rd);                                    // 顶面基底
  b(rgba(p.mid,0.85),x0,topY,w,rd);                        // 顶面阳光提亮
  b(p.hi2,x0,topY,w,1);                                    // 北棱高光
  b(rgba(p.hi,0.5),x0,topY,3,1);                           // 北棱西端金斑
  b(p.mid,x0,topY+rd,w,1);                                 // 檐口
  b('rgba(20,28,38,.30)',x0,topY+rd+1,w,1.4);                 // 檐下投影
  b(p.bg,x0,topY,1,botY-topY);                             // 左描边
  b(p.bg,x0+w-1,topY,1,botY-topY);                         // 右描边
  b('rgba(20,28,38,.34)',x0,botY-1.5,w,1.5);                  // 接地暗
}

function drawBuildingTall(ctx,x,y,size,domainId,locked,t,world,opts){
  const p=pal(world), u=size/16;
  t=t||0;
  const H=Math.round(heightOf(domainId)*16);               // 逻辑总高
  const b=R(ctx,x-16*u,y-H*u,u);                           // 32×H 域, 地面线 y=H

  ctx.save();
  if(locked)ctx.globalAlpha=0.68;

  if(domainId==='beacon'){                                 // 信标塔 4格
    b('rgba(20,28,38,.30)',8,H-1.5,16,2.5);
    slab(b,p,10,10,12,H,5);
    b(p.dim,15,3,2,7); b(p.dim,11,7,10,1);                 // 天线
    const bl=0.5+0.5*Math.sin(t/240);
    b(rgba(p.acc,0.3+0.6*bl),13,0,6,3);                    // 信标灯
    for(let i=0;i<3;i++){                                  // 观察窗列
      b(p.bg,14,20+i*12,4,4);
      b(rgba(p.hi,0.5),14,20+i*12,4,1);
    }
    b(p.bg,13,H-8,6,8); b(p.dim,12,H-8,1,8); b(p.dim,19,H-8,1,8); // 门
    if(!locked){                                           // 广播环(塔顶)
      const rr=(t/150)%15;
      ctx.strokeStyle=rgba(p.hi,Math.max(0,0.5-rr*0.035));
      ctx.lineWidth=Math.max(1,u*0.6);
      ctx.beginPath(); ctx.arc(x,y-(H-4)*u,Math.max(1,rr*u),0,7); ctx.stroke();
    }
  }
  else if(domainId==='logic'){                             // 逻辑锻造屋 2.5格
    b('rgba(20,28,38,.30)',3,H-1.5,26,2.5);
    slab(b,p,3,14,26,H,6);
    b(rgba(p.hi,0.5),7,26,4,4); b(rgba(p.hi,0.5),22,26,3,4);// 亮窗
    b(p.bg,13,H-8,6,8); b(p.dim,12,H-8,1,8); b(p.dim,19,H-8,1,8); // 门
    slab(b,p,20,3,7,15,2);                                 // NAND 烟囱(高出主体)
    const bl=0.55+0.45*Math.sin(t/300);
    b(rgba(p.hi,bl),22.5,0,2,2);                           // NAND 泡
    const ph=((t/300)|0)%4;                                // 数据烟(溢出楼顶)
    b(rgba(p.hi2,Math.max(0.1,0.55-0.13*ph)),22.5+(ph%2),-2-ph,2,1);
  }
  else if(domainId==='cpu'){                               // 芯片神殿 3格
    b('rgba(20,28,38,.30)',1,H-1.5,30,2.5);
    for(let i=0;i<5;i++){                                  // 侧引脚
      b(p.dim,0,20+i*5,3,2); b(p.dim,29,20+i*5,3,2);
    }
    slab(b,p,3,12,26,H,6);
    for(let i=0;i<4;i++){                                  // 立面引脚柱(凹槽)
      b('rgba(20,28,38,.28)',6+i*6,20,2,H-26); b(p.dim,6+i*6,20,2,1);
    }
    const bl=0.5+0.5*Math.sin(t/300);
    b(rgba(p.hi,0.22+0.5*bl),12,13,8,3.6);                 // 屋顶发光 die
    b(p.hi2,15,14,2,1);
    b(p.dim,6,13.6,4,1); b(p.dim,22,13.6,4,1);             // 顶面走线
    b(p.bg,13,H-8,6,8);                                    // 门
  }
  else if(domainId==='crypto'){                            // 密码地窟 2.5格
    b('rgba(20,28,38,.30)',2,H-1.5,28,2.5);
    slab(b,p,3,18,26,H,5);                                 // 岩基
    slab(b,p,7,10,18,20,4);                                // 中段
    slab(b,p,11,4,10,12,3);                                // 顶冠
    b(p.bg,13,H-16,6,6);                                   // 钥匙孔: 圆部
    b(p.bg,14.5,H-11,3,9);                                 // 钥匙孔: 柄
    const bl=((t/450)|0)%4;
    [[7,H-12],[24,H-13],[8,H-6],[23,H-6]].forEach(function(q,i){
      b(rgba(p.hi,i===bl?0.85:0.22),q[0],q[1],1,2);        // 符文轮闪
    });
  }
  else if(domainId==='db'){                                // 数据库图书馆 3.5格
    b('rgba(20,28,38,.30)',3,H-1.5,26,2.5);
    slab(b,p,4,40,24,H,5);                                 // 叠盘: 底
    slab(b,p,4,22,24,41,5);                                //        中
    slab(b,p,4,4,24,23,5);                                 //        顶
    const ph=((t/350)|0)%3;
    for(let i=0;i<3;i++){                                  // 各盘索引灯
      b(i===ph?p.hi:rgba(p.hi,0.2),11+i*4,33,2,1);
      b(i===ph?rgba(p.hi,0.6):rgba(p.hi,0.15),11+i*4,15,2,1);
    }
    b(p.bg,13,H-7,6,7); b(p.dim,12,H-7,1,7); b(p.dim,19,H-7,1,7); // 门
  }
  else if(domainId==='net'){                               // 网络灯塔 4格
    b('rgba(20,28,38,.30)',7,H-1.5,18,2.5);
    slab(b,p,9,14,14,H,4);                                 // 塔身
    for(let i=0;i<6;i++)b('rgba(20,28,38,.16)',10,21+i*7,12,1.6);// 环带条纹
    b(p.g1,8,10,16,4); b(rgba(p.dim,0.5),8,10,16,4);       // 灯室廊台
    b(p.mid,8,10,16,1);
    b(p.g1,9,4,14,6); b(p.bg,9,4,1,6); b(p.bg,22,4,1,6);   // 灯室
    b(rgba(p.acc,0.9),11,5,10,4);                          // 灯
    b(p.mid,8,2,16,2); b(p.dim,15,0,2,2);                  // 顶盖+尖
    b(p.bg,13,H-7,6,7); b(p.dim,12,H-7,1,7); b(p.dim,19,H-7,1,7); // 门
    if(!locked){                                           // 旋转光束(从灯室射出)
      const a=t/700, cx=x, cy=y-(H-7)*u;
      ctx.save(); ctx.globalAlpha=0.16; ctx.fillStyle=p.hi;
      ctx.beginPath(); ctx.moveTo(cx,cy);
      ctx.lineTo(cx+Math.cos(a-0.22)*26*u, cy+Math.sin(a-0.22)*26*u);
      ctx.lineTo(cx+Math.cos(a+0.22)*26*u, cy+Math.sin(a+0.22)*26*u);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }
  else if(domainId==='algo'){                              // 未排序石阶 3格
    b('rgba(20,28,38,.30)',1,H-1.5,30,2.5);
    const hs=[16,34,22,44,28,18,38];                       // 未排序高度
    for(let i=0;i<7;i++){
      const hh=hs[i], xi=1.4+i*4.4, ty2=H-hh;
      b(p.g1,xi,ty2+2,4,hh-2);                             // 柱立面
      b(rgba(p.dim,0.5),xi,ty2+2,4,hh-2);
      b('rgba(20,28,38,.28)',xi+2.9,ty2+2,1.1,hh-2);          // 右侧影
      b(rgba(p.mid,0.95),xi,ty2,4,2); b(p.hi2,xi,ty2,4,1); // 柱顶面(受光)
      b(p.bg,xi,ty2,0.8,hh); b(p.bg,xi+3.4,ty2,0.6,hh);    // 描边
      if(hash(i,3)>0.5)b(p.g0,xi+0.8,ty2+((hh/2)|0),2.6,1);// 岩缝
    }
    b(p.bg,15,H-6,2.4,6);                                  // 门洞(最高柱)
    const k=((t/500)|0)%7;                                 // 比较指针跳柱顶
    b(p.hi,2.9+k*4.4,H-hs[k]-3,1.2,2);
    b(rgba(p.hi,0.4),2.9+k*4.4,H-hs[k]-4,1.2,1);
  }
  else if(domainId==='os'){                                // 系统机房 3.5格
    b('rgba(20,28,38,.30)',3,H-1.5,26,2.5);
    slab(b,p,5,6,22,H,5);
    b(p.dim,8,7.5,4,1); b(p.dim,15,7.5,4,1);               // 顶面散热栅
    for(let i=0;i<6;i++){                                  // 机架槽
      b(p.bg,8,14+i*6,16,3);
      for(let j=0;j<4;j++){
        const on=hash(i,j,(t/280)|0)>0.5;
        b(on?p.hi:rgba(p.hi,0.14),9.5+j*4,15+i*6,1,1);     // LED 阵
      }
    }
    b(p.bg,14,H-6,4,6); b(p.dim,13,H-6,1,6); b(p.dim,18,H-6,1,6); // 门
  }
  else if(domainId==='reboot'){                            // 重启之塔 4格(8段锁)
    const lit=(opts&&opts.lit)|0;
    b('rgba(20,28,38,.30)',7,H-1.5,18,2.5);
    for(let i=0;i<8;i++){                                  // 8 段, 自下而上点亮
      const gy=H-7*(i+1), on=i<lit;
      if(on){ b(rgba(p.hi,0.82),10,gy,12,6.6); b(p.hi2,10,gy,12,1); }
      else{ b(p.g1,10,gy,12,6.6); b(rgba(p.dim,0.3),10,gy,12,6.6); b(p.dim,10,gy,12,1); }
      b('rgba(20,28,38,.28)',19.5,gy+1,2.5,5.6);              // 段右侧影
    }
    b(p.bg,10,H-56,1,56); b(p.bg,21,H-56,1,56);            // 塔身描边
    b(p.g1,10,5,12,3); b(p.mid,10,5,12,1);                 // 顶冠
    b(p.dim,15,0,2,5);                                     // 顶针
    const bl=0.4+0.5*Math.sin(t/200);
    b(rgba(p.acc,bl),14,-1,4,1);
  }
  else{                                                    // 未知 → 通用方楼 3格
    b('rgba(20,28,38,.30)',3,H-1.5,26,2.5);
    slab(b,p,4,10,24,H,6);
    b(p.bg,13,H-7,6,7);
  }
  ctx.restore();

  if(locked){                                              // 锁链贴正立面(下部)
    const c=R(ctx,x-16*u,y-H*u,u), yb=H-24;
    for(let i=0;i<13;i++){                                 // 交叉双链
      const lx=3+i*2, ly=yb+2+i*1.3;
      c(i%2?p.dim:p.mid, lx, ly, 2.4,1.8);
      c(i%2?p.mid:p.dim, 27.6-lx, ly, 2.4,1.8);
      if(i%4===0){c(rgba(p.hi,0.5),lx+0.6,ly+0.4,1,1);
                  c(rgba(p.hi,0.5),28.2-lx,ly+0.4,1,1);}
    }
    c(p.bg,11,H-17,10,9);                                  // 锁底衬
    c(p.g1,12,H-16,8,7); c(rgba(p.dim,0.6),12,H-16,8,7);   // 锁体
    c(p.mid,12,H-16,8,1); c(p.mid,12,H-16,1,7);
    c(p.mid,13,H-19,1,3); c(p.mid,18,H-19,1,3); c(p.mid,13,H-20,6,1); // 锁梁
    const bl=(((t/600)|0)%2)?0.95:0.45;
    c(rgba(p.acc2,bl),15,H-14,2,2); c(rgba(p.acc2,bl),15.5,H-12,1,2); // 红锁眼
  }
}

/* ---------- 7.3 v2 玩家: 正面立绘 2.5头身 ----------
   签名与 v1 一致。永远正面像; left/right 用瞳孔+手臂表达, up 显兜帽背面。 */
function drawPlayer2(ctx,x,y,size,dir,frame,t,world){
  const p=pal(world), u=size/16;
  const r=R(ctx,x-8*u,y-16*u,u);
  const d=(typeof dir==='string')?(DIRS[dir]||0):((dir|0)%4);
  const f=(frame|0)%2, b=f?-1:0;
  t=t||0;
  r('rgba(20,28,38,.28)',3.5,14.6,9,1.4);                     // 软落地影
  if(f){                                                   // 腿: 两帧步态
    r(p.bg,4.6,12.6,2.6,3.4); r(p.bg,8.8,13.2,2.6,2.8);
    r(p.clothD,5.2,13.2,1.4,2.4); r(p.clothD,9.4,13.8,1.4,1.8);
  }else{
    r(p.bg,4.8,13,2.6,3); r(p.bg,8.6,13,2.6,3);
    r(p.clothD,5.4,13.6,1.4,2); r(p.clothD,9.2,13.6,1.4,2);
  }
  r(p.bg,3.6,9+b,8.8,4.6);                                 // 躯干描边
  r(p.cloth,4.5,9.6+b,7,3.6);                              // 天蓝短衣
  r(p.acc,4.5,9.6+b,7,1.2);                                // 暖橙围巾(标志色)
  r(p.bg,2.6,9.8+b+(f?0.8:0),1.4,3);                       // 手臂(摆动)
  r(p.bg,12,9.8+b+(f?0:0.8),1.4,3);
  r(p.bg,2.5,0.4+b,11,9.2);                                // 大头描边
  if(d===3){                                               // 背面: 兜帽后脑
    r(p.hi,3.5,1+b,9,7.6);
    r(rgba(p.hi,0.72),4.5,3.6+b,7,4.6);
    r(p.hi2,7.2,1.6+b,1.6,6);                              // 帽脊线
  }else{
    r(p.hi,3.5,1+b,9,3.6); r(p.hi,3,2.8+b,10,3);           // 兜帽
    r(p.hi2,4.4,4.6+b,7.2,4);                              // 脸
    const eo=d===1?-1:d===2?1:0;                           // 瞳孔看向
    r(p.bg,5.6+eo,5.8+b,1.5,1.7); r(p.bg,8.9+eo,5.8+b,1.5,1.7);
    r(rgba(p.hi2,0.9),5.9+eo,5.8+b,0.6,0.6);               // 眼高光
    r(rgba(p.hi2,0.9),9.2+eo,5.8+b,0.6,0.6);
    r(rgba(p.acc,0.3),4.6,7.4+b,1.2,0.8);                  // 腮红
    r(rgba(p.acc,0.3),10.2,7.4+b,1.2,0.8);
  }
  const bl=0.35+0.4*Math.sin(t/350);                       // 头顶信号点
  r(rgba(p.hi,bl),7.3,-0.6+b,1.4,1);
}

/* ---------- 7.4 v2 NPC: 正面像 2.5头身 ---------- */
function drawNPC2(ctx,x,y,size,kind,t,world){
  const p=pal(world), u=size/16;
  t=t||0;
  const b=Math.sin(t/420+x*0.013)>0?0:-1;
  const r=R(ctx,x-8*u,y-16*u,u);
  r('rgba(20,28,38,.30)',3.5,14.6,9,1.4);

  if(kind==='daemon'){                                     // 守护进程: 圆润小机器人·灯笼精灵
    r(p.dim,7.4,-1.2+b,1.2,1.6);                           // 小天线
    r(rgba(p.acc,0.5+0.5*Math.sin(t/300)),7,-2.2+b,2,1.2); // 天线暖灯
    r(p.bg,3,0.6+b,10,9);                                  // 圆头描边
    r(p.bg,4,-0.2+b,8,1.2);
    r(p.hi2,4,0.6+b,8,8);                                  // 奶白圆壳
    r(p.mid,4,6.4+b,8,2.2);                                // 下巴壳影
    r(p.bg,5.6,3.4+b,1.6,2.4); r(p.bg,8.8,3.4+b,1.6,2.4);  // 圆豆眼
    const bl=0.55+0.45*Math.sin(t/260);
    r(rgba(p.hi,bl),5.9,3.7+b,1,1); r(rgba(p.hi,bl),9.1,3.7+b,1,1); // 眼中暖光
    r(rgba(p.acc,0.35),4.4,6+b,1.2,0.9);                   // 腮红
    r(rgba(p.acc,0.35),10.4,6+b,1.2,0.9);
    r(p.bg,3.6,9.4+b,8.8,5.4);                             // 小圆身描边
    r(p.cloth,4.4,9.8+b,7.2,4.4);                          // 天蓝机身
    r(rgba(p.hi,0.85),5.4,10.8+b,5.2,1);                   // 胸前符文条
    r(p.clothD,4.4,13+b,7.2,1.2);
    r(p.bg,4.6,14.2,1.6,1); r(p.bg,9.8,14.2,1.6,1);        // 小圆脚
  }
  else if(kind==='orphan'){                                // 孤儿进程: 独眼小只
    r(p.dim,7.4,0.6+b,1,2.6);                              // 天线
    r((((t/500)|0)%2)?p.hi:p.dim,7,-0.4+b,1.8,1.2);        // 天线灯
    r(p.bg,3.6,3+b,8.8,8);                                 // 大头描边
    r(p.hi2,4.5,3.6+b,7,5.2);
    r(p.bg,6.4,5+b,3.2,2.8);                               // 大独眼
    r(rgba(p.hi,0.9),6.7,5.3+b,2.6,1.2);
    r(rgba(p.hi2,0.95),6.9,5.4+b,0.8,0.7);                 // 眼高光
    r(p.mid,4.8,8.4+b,6.4,2.6);                            // 头下部机壳
    r(p.bg,5.2,11+b,5.6,3.6); r(p.cloth,5.8,11.4+b,4.4,2.8); // 天蓝小身体
    r(p.bg,5.8,14.4,1.4,1.6); r(p.bg,8.8,14.4,1.4,1.6);    // 小短腿
  }
  else if(kind==='zombie'){                                // 僵尸进程: 缺角+抖动(腐蚀感)
    const j=(((t/800)|0)%5===0)?1:0;
    const z=R(ctx,x-8*u+j*u,y-16*u,u);
    z(p.bg,3.5,0.8,9,8.4);                                 // 大头描边
    z(p.g0,4.4,1.4,7.2,6); z(rgba(p.cor2,0.20),4.4,1.4,7.2,6);
    z(p.bg,9.4,0.8,3.1,3.6);                               // 缺角: 头右上
    z(p.acc2,5.6,4,1.5,1.5);                               // 残存红目
    z(p.bg,8.5,4.2,2,1.1);                                 // 空目
    z(rgba(p.cor2,0.5),4.4,6,7.2,1.4);                     // 面部腐蚀切片
    z(p.bg,4.4,9.2,7.2,5.2);                               // 身描边
    z(p.g0,5.2,9.6,5.6,4.4); z(rgba(p.cor2,0.25),5.2,11.4,5.6,2.6);
    z(p.bg,4.4,12,2,2.4);                                  // 缺角: 身左下
    z(rgba(p.cor2,0.55),3,10.6,8,1);                       // 错位切片(紫蚀)
    z(p.dim,5,14.4,2,1.6); z(p.dim,9,14.6,2,1.2);          // 拖行腿
  }
  else if(kind==='gc'){                                    // GC — 提灯的安静收灯人
    r(p.wood,13,0+b,1,14);                                 // 提灯杖
    r(p.wood,10.6,0+b,3.4,1);                              // 挑臂
    r(p.bg,11.4,1+b,3.2,4.2);                              // 灯笼框
    const gl=0.5+0.45*Math.sin(t/380);
    r(rgba(p.acc,gl),12,1.6+b,2,3);                        // 灯焰(呼吸暖光)
    r(rgba(p.acc,0.20*gl),10.2,0.2+b,5.6,6);               // 灯晕
    r(p.bg,3.4,0.4+b,9.2,9.2);                             // 大兜帽描边
    r(p.g0,4.2,1+b,7.6,4);                                 // 兜帽(暖灰袍)
    r(p.g1,4.2,1+b,7.6,1);
    r(p.hi2,5,3.6+b,6,3.4);                                // 安静的脸
    r(p.bg,5.8,4.8+b,1.6,0.7); r(p.bg,8.6,4.8+b,1.6,0.7);  // 阖目(横线眼)
    r(p.bg,4,9.6+b,8,5);                                   // 罩袍描边
    r(p.g0,4.8,10+b,6.4,4.2); r(rgba(p.g1,0.5),4.8,10+b,6.4,1);
    r(p.g1,4.8,10+b,1,4.2); r(p.g1,10.2,10+b,1,4.2);       // 袍缘
    r(rgba(p.hi,0.5),6.6,11.4+b,2.8,0.8);                  // 胸前符文(被引用者名单)
    r(p.g0,4,13.6,8,1.4); r(rgba(p.bg,0.25),4,13.6,8,1.4); // 触地
  }
  else if(kind==='echo'){                                  // 残响: 半透明幽灵
    const fl=0.72+0.11*Math.sin(t/560);                    // J批: 慢呼吸(≤缓慢渐变), 不再像提示信号频闪
    ctx.save(); ctx.globalAlpha=fl;
    r(p.bg,3.4,1.4+b,9.2,8.4);                             // 大头描边
    r(p.hi2,4.3,2+b,7.4,5.4);
    r(p.bg,5.6,4.2+b,1.5,1.7); r(p.bg,8.9,4.2+b,1.5,1.7);  // 眼
    r(rgba(p.hi,0.85),5,8+b,6,4.4);                        // 飘浮躯体
    r(rgba(p.bg,0.9),4,9.6+b,8,1);                         // 扫描断层
    r(rgba(p.hi,0.5),6.4,12.4+b,3.4,1);                    // 散逸尾
    ctx.restore();
    const ph=((t/200)|0)%4;                                // 上浮粒子
    r(rgba(p.hi2,0.55),5+ph*2,13.4-ph+b,1,1);
  }
  else{                                                    // merchant / 兜底
    r(p.acc,4.6,0.4+b,6.8,2);                              // 帽冠
    r(p.acc,3,2.2+b,10,1.4);                               // 宽檐
    r(p.bg,3.8,3.4+b,8.4,6);                               // 头描边
    r(p.hi2,4.7,3.8+b,6.6,4.4);                            // 脸
    r(p.bg,5.7,5.2+b,1.4,1.5); r(p.bg,8.9,5.2+b,1.4,1.5);  // 眼
    r(p.bg,4.2,9.2+b,7.6,5.2);                             // 大衣描边
    r(p.g1,4.9,9.6+b,6.2,4.4);
    r(p.acc,4.9,9.6+b,1,4.4); r(p.acc,10.1,9.6+b,1,4.4);   // 衣缘
    if((((t/400)|0)%3)===0)r(p.acc,12,9.4+b,2,2);          // 抛币闪光
    r(p.dim,5.4,14,1.6,2); r(p.dim,9,14,1.6,2);            // 腿
  }
}

/* ---------- 7.5 v2 装饰物: 台座立面(高度感) + v1 本体 ----------
   touched(可选第 8 参)透传给 v1 本体: 已交互=变暗+静止。 */
function drawDecor2(ctx,x,y,size,kind,t,world,touched){
  if(kind==='particles'||kind==='cave'||kind==='corruption'
     ||kind==='puzzleStation')                             // 贴地/自带台座类原样
    return drawDecor(ctx,x,y,size,kind,t,world,touched);
  const p=pal(world), u=size/16;
  const w=(kind==='wall')?24:10, x0=8-w/2;                 // 台座宽度
  const r=R(ctx,x-8*u,y-16*u,u);
  r('rgba(20,28,38,.30)',x0-0.5,14.6,w+1,1.6);                 // 影
  r(p.g1,x0,12.4,w,3.6);                                   // 台座立面
  r(rgba(p.dim,0.30),x0,12.4,w,3.6);
  r('rgba(20,28,38,.26)',x0+w-1.6,12.4,1.6,3.6);              // 右侧影
  r(p.g1,x0,11.4,w,1.6); r(rgba(p.mid,0.85),x0,11.4,w,1.6); // 台座顶面(受光)
  r(p.hi2,x0,11.4,w,0.9);                                  // 北棱
  r(p.bg,x0,11.4,0.8,4.6); r(p.bg,x0+w-0.8,11.4,0.8,4.6);  // 描边
  r('rgba(20,28,38,.34)',x0,15.2,w,0.8);                      // 接地
  drawDecor(ctx,x,y-3.4*u,size,kind,t,world,touched);      // 本体立在台座上
}

window.GAME_ART={
  version:'3.0',   /* art v3「阳光下的机器花园」— API 与 2.0 完全兼容 */
  palette:PALETTE, rgba:rgba, hash:hash,
  tileName:TILE_BY_NUM,
  drawTile:drawTile,
  drawPlayer:drawPlayer,
  drawNPC:drawNPC,
  drawBuilding:drawBuilding,
  drawDecor:drawDecor,
  fx:fx,
  /* v2 伪透视升级(增量, 引擎按需切换; 不影响 v1 任何调用) */
  v2:{
    drawWallTall:drawWallTall,
    drawBuildingTall:drawBuildingTall,
    heightOf:heightOf,
    ySortHint:ySortHint,
    drawPlayer:drawPlayer2,
    drawNPC:drawNPC2,
    drawDecor:drawDecor2
  }
};
})();
