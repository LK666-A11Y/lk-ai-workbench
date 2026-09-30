// bazi-engine —— 八字排盘引擎（已验证 17/19 命中知识库，两金标准盘逐字一致）
// 2026-08-12 由独立 Skill 合并入「八字紫微」Skill，作为八字底层 + HTML 工具可内联引擎。
// 用法：const { calc } = require('./calculator/bazi-engine/engine.js'); calc(y, m, d, bjH, bjM, lon);
//       lon = 出生地经度（东经，北京约 116.4 / 上海约 121.5）；bjH/bjM 为北京时间 24 小时制。
// 注：示例一律用虚构盘，禁止在注释/文档中出现任何真实生辰（隐私红线）。
const STEMS=["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
const BRAN=["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
const TERMS=[{n:"立春",lon:315,em:2,ed:4,jie:true},{n:"雨水",lon:330,em:2,ed:19},{n:"惊蛰",lon:345,em:3,ed:6,jie:true},{n:"春分",lon:0,em:3,ed:21},{n:"清明",lon:15,em:4,ed:5,jie:true},{n:"谷雨",lon:30,em:4,ed:20},{n:"立夏",lon:45,em:5,ed:6,jie:true},{n:"小满",lon:60,em:5,ed:21},{n:"芒种",lon:75,em:6,ed:6,jie:true},{n:"夏至",lon:90,em:6,ed:21},{n:"小暑",lon:105,em:7,ed:7,jie:true},{n:"大暑",lon:120,em:7,ed:23},{n:"立秋",lon:135,em:8,ed:8,jie:true},{n:"处暑",lon:150,em:8,ed:23},{n:"白露",lon:165,em:9,ed:8,jie:true},{n:"秋分",lon:180,em:9,ed:23},{n:"寒露",lon:195,em:10,ed:8,jie:true},{n:"霜降",lon:210,em:10,ed:23},{n:"立冬",lon:225,em:11,ed:7,jie:true},{n:"小雪",lon:240,em:11,ed:22},{n:"大雪",lon:255,em:12,ed:7,jie:true},{n:"冬至",lon:270,em:12,ed:22},{n:"小寒",lon:285,em:1,ed:6,jie:true},{n:"大寒",lon:300,em:1,ed:20}];
const JIE=TERMS.filter(t=>t.jie);
const JIE_LONG=[315,345,15,45,75,105,135,165,195,225,255,285];
function jdn(y,m,d){if(m<=2){y-=1;m+=12;}var a=Math.floor((14-m)/12);var yy=y+4800-a;var mm=m+12*a-3;return d+Math.floor((153*mm+2)/5)+365*yy+Math.floor(yy/4)-Math.floor(yy/100)+Math.floor(yy/400)-32045;}
function sunLong(jd){var T=(jd-2451545.0)/36525.0;var L0=280.46646+T*(36000.76983+T*0.0003032);var M=357.52911+T*(35999.05029-T*0.0001537);var Mr=M*Math.PI/180;var C=(1.914602-T*(0.004817+T*0.000014))*Math.sin(Mr)+(0.019993-T*0.000101)*Math.sin(2*Mr)+0.000289*Math.sin(3*Mr);var trueLong=L0+C;var Omega=125.04-1934.136*T;var appLong=trueLong-0.00569-0.00478*Math.sin(Omega*Math.PI/180);return((appLong%360)+360)%360;}
function findTermAt(year,target,em,ed){var estJD=jdn(year,em,ed);var lo=estJD-12,hi=estJD+12;function raw(jd){return sunLong(jd)-target;}var rlo=raw(lo),rhi=raw(hi);for(var ext=0;ext<20&&rlo*rhi>0;ext++){lo-=5;hi+=5;rlo=raw(lo);rhi=raw(hi);}for(var b=0;b<60;b++){var mid=(lo+hi)/2;var rm=raw(mid);if((rlo<0&&rm>=0)||(rlo>0&&rm<=0))hi=mid;else lo=mid;}return(lo+hi)/2;}
function findTerm(year,idx){var t=JIE[idx];return findTermAt(year,JIE_LONG[idx],t.em,t.ed);}
function trueSolarHour(bjH,bjM,lon){var bj=bjH*60+bjM;var s=bj-(120-lon)*4;return((s/60)%24+24)%24;}
function branchFromSolarHour(sh){var s=sh*60;if(s>=23*60||s<1*60)return 0;if(s<3*60)return 1;if(s<5*60)return 2;if(s<7*60)return 3;if(s<9*60)return 4;if(s<11*60)return 5;if(s<13*60)return 6;if(s<15*60)return 7;if(s<17*60)return 8;if(s<19*60)return 9;if(s<21*60)return 10;return 11;}
const WUSHU=[[0,1,2,3,4,5,6,7,8,9,0,1],[2,3,4,5,6,7,8,9,0,1,2,3],[4,5,6,7,8,9,0,1,2,3,4,5],[6,7,8,9,0,1,2,3,4,5,6,7],[8,9,0,1,2,3,4,5,6,7,8,9]];
function wuShu(dStem,br){return WUSHU[((dStem%5)+5)%5][br];}
function wuHu(yStem,mb){var base=[2,4,6,8,0][((yStem%5)+5)%5];return(base+((mb-2+12)%12))%10;}
function calc(y,m,d,bjH,bjM,lon){
  var sh=trueSolarHour(bjH,bjM,lon),br=branchFromSolarHour(sh);
  var birthJD=jdn(y,m,d)-0.5+(sh-8+(120-lon)*4/60)/24;
  var realY=(birthJD>=findTerm(y,0))?y:y-1;
  var yg=(realY-4)%10;if(yg<0)yg+=10;var yz=(realY-4)%12;if(yz<0)yz+=12;
  var all=[];for(var iy=y-1;iy<=y+1;iy++)for(var t=0;t<12;t++)all.push({jd:findTerm(iy,t),b:(t+2)%12});
  all.sort(function(a,b){return a.jd-b.jd;});var mb=11;
  for(var i=0;i<all.length;i++)if(all[i].jd<=birthJD)mb=all[i].b;
  var mgz={stem:wuHu(yg,mb),branch:mb};
  var dj=jdn(y,m,d),isZi=(br===0),earlyZi=isZi&&(sh>=23);
  if(earlyZi)dj+=1;
  var dIdx=((dj+49)%60+60)%60,dStem=dIdx%10,dBranch=dIdx%12;
  var hStem;if(isZi){var z=earlyZi?(((jdn(y,m,d)+1+49)%60+60)%60):(((jdn(y,m,d)+49)%60+60)%60);hStem=wuShu(z%10,0);}else hStem=wuShu(dStem,br);
  return STEMS[yg]+BRAN[yz]+" "+STEMS[mgz.stem]+BRAN[mgz.branch]+" "+STEMS[dStem]+BRAN[dBranch]+" "+STEMS[hStem]+BRAN[br];
}
module.exports={calc,trueSolarHour,branchFromSolarHour,STEMS,BRAN,findTerm};
