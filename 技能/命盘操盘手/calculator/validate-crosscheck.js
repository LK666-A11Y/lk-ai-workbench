#!/usr/bin/env node
/**
 * 交叉验证脚本 · 命盘操盘手引擎
 *
 * 目的：用「独立于引擎实现的算法」对引擎排盘结果做交叉校验，
 *       证明排盘结果可复现、可验证，而非自说自话。
 *
 * 三重独立验证：
 *   1. 日柱 —— 用 JDN(儒略日) 天文算法独立推算，与引擎日柱对拍
 *   2. 月干 —— 用《五虎遁》经典规则从年干独立推算，与引擎月干对拍
 *   3. 时干 —— 用《五鼠遁》经典规则从日干独立推算，与引擎时干对拍
 *
 * 用法： node validate-crosscheck.js
 */

const { execFileSync } = require('child_process');
const path = require('path');

const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/**
 * 公历转儒略日 JDN（Gregorian）
 * 标准天文算法，与引擎实现完全独立
 */
function toJDN(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return (
    d +
    Math.floor((153 * mm + 2) / 5) +
    365 * yy +
    Math.floor(yy / 4) -
    Math.floor(yy / 100) +
    Math.floor(yy / 400) -
    32045
  );
}

/**
 * 独立推算日柱干支
 * 公式：干支序号 = (JDN + 49) mod 60，0 = 甲子
 *
 * 常数 49 由两个独立历史锚点交叉确认：
 *   锚点1 1949-10-01（JDN 2433191）→ 序号 0 = 甲子日（史料公认）
 *   锚点2 2000-01-01（JDN 2451545）→ 序号 54 = 戊午日
 *   两者推得的常数均为 49，互相印证
 */
function expectedDayPillar(y, m, d, hour) {
  // 晚子时次日派：23:00-23:59 日柱按次日算
  const jdnBase = toJDN(y, m, d);
  const jdn = hour >= 23 ? jdnBase + 1 : jdnBase;
  const idx = ((jdn + 49) % 60 + 60) % 60;
  return GAN[idx % 10] + ZHI[idx % 12];
}

/**
 * 独立推算月干 —— 五虎遁（年上起月）
 * 甲己之年丙作首，乙庚之岁戊为头，
 * 丙辛之岁寻庚起，丁壬壬位顺行流，戊癸之年甲好求。
 * 即：寅月(正月)天干由年干决定，之后每月天干顺推一位
 */
const WU_HU_DUN = { 甲: '丙', 己: '丙', 乙: '戊', 庚: '戊', 丙: '庚', 辛: '庚', 丁: '壬', 壬: '壬', 戊: '甲', 癸: '甲' };

function expectedMonthGan(yearGan, monthZhi) {
  // 月支顺序：寅(正月) 起，寅=2 in ZHI index
  const startGanChar = WU_HU_DUN[yearGan];
  if (!startGanChar) return null;
  // 寅月为起点，月支在 ZHI 中的偏移
  const zhiIdx = ZHI.indexOf(monthZhi);
  const offset = ((zhiIdx - ZHI.indexOf('寅')) % 12 + 12) % 12;
  const startIdx = GAN.indexOf(startGanChar);
  return GAN[(startIdx + offset) % 10];
}

/**
 * 独立推算时干 —— 五鼠遁（日上起时）
 * 甲己还加甲，乙庚丙作初，
 * 丙辛从戊起，丁壬庚子居，戊癸何方发，壬子是真途。
 * 即：子时天干由日干决定，之后每时辰天干顺推一位
 */
const WU_SHU_DUN = { 甲: '甲', 己: '甲', 乙: '丙', 庚: '丙', 丙: '戊', 辛: '戊', 丁: '庚', 壬: '庚', 戊: '壬', 癸: '壬' };

function expectedHourGan(dayGan, hourZhi) {
  const startGanChar = WU_SHU_DUN[dayGan];
  if (!startGanChar) return null;
  const offset = ZHI.indexOf(hourZhi) - ZHI.indexOf('子');
  const startIdx = GAN.indexOf(startGanChar);
  return GAN[(((startIdx + offset) % 10) + 10) % 10];
}

/** 调用引擎排盘 */
function runEngine(y, m, d, hh, mm, gender) {
  const args = [
    path.join(__dirname, 'dist', 'run-chart.js'),
    `--year=${y}`, `--month=${m}`, `--day=${d}`,
    `--hour=${hh}`, `--minute=${mm}`, `--gender=${gender}`,
    '--ref-date=2026-08-29',
  ];
  try {
    const out = execFileSync(process.execPath, args, {
      cwd: path.join(__dirname),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 32 * 1024 * 1024,
    });
    return JSON.parse(out);
  } catch (e) {
    return null;
  }
}

// ────────────────────────────────────────────────────────────
// 测试用例集（含历史锚点 / 闰年 / 立春边界 / 跨世纪 / 晚子时 / 示例盘）
// ────────────────────────────────────────────────────────────
const CASES = [
  { y: 1949, m: 10, d: 1, hh: 12, mm: 0, g: 'male', tag: '历史锚点·甲子日' },
  { y: 2000, m: 1, d: 1, hh: 12, mm: 0, g: 'male', tag: '千禧基准·戊午日' },
  { y: 2000, m: 2, d: 29, hh: 12, mm: 0, g: 'male', tag: '闰年2月29' },
  { y: 2020, m: 2, d: 29, hh: 12, mm: 0, g: 'female', tag: '闰年2月29' },
  { y: 2024, m: 2, d: 29, hh: 12, mm: 0, g: 'male', tag: '闰年2月29' },
  { y: 2024, m: 2, d: 3, hh: 12, mm: 0, g: 'male', tag: '立春前一日' },
  { y: 2024, m: 2, d: 4, hh: 12, mm: 0, g: 'male', tag: '立春日' },
  { y: 2024, m: 2, d: 5, hh: 12, mm: 0, g: 'male', tag: '立春后一日' },
  { y: 1999, m: 12, d: 31, hh: 12, mm: 0, g: 'male', tag: '跨世纪前夜' },
  { y: 2000, m: 1, d: 1, hh: 0, mm: 30, g: 'male', tag: '子时' },
  { y: 2000, m: 6, d: 15, hh: 23, mm: 30, g: 'male', tag: '晚子时·应算次日' },
  { y: 2000, m: 6, d: 15, hh: 0, mm: 30, g: 'male', tag: '早子时' },
  { y: 2005, m: 3, d: 12, hh: 8, mm: 30, g: 'male', tag: '文档主示例盘' },
  { y: 2008, m: 2, d: 18, hh: 12, mm: 0, g: 'male', tag: 'showcase演示盘' },
  { y: 2007, m: 9, d: 15, hh: 14, mm: 0, g: 'female', tag: '示例e1' },
  { y: 2004, m: 11, d: 3, hh: 10, mm: 0, g: 'male', tag: '示例e2' },
  { y: 2005, m: 6, d: 20, hh: 20, mm: 0, g: 'female', tag: '示例e3' },
  { y: 2002, m: 1, d: 18, hh: 9, mm: 0, g: 'male', tag: '示例e4' },
  { y: 2008, m: 3, d: 8, hh: 9, mm: 0, g: 'female', tag: '示例e5' },
  { y: 1900, m: 1, d: 1, hh: 12, mm: 0, g: 'male', tag: '年份下界1900' },
  { y: 2100, m: 12, d: 31, hh: 12, mm: 0, g: 'male', tag: '年份上界2100' },
];

// ────────────────────────────────────────────────────────────
// 执行验证
// ────────────────────────────────────────────────────────────
const results = [];

for (const c of CASES) {
  const chart = runEngine(c.y, c.m, c.d, c.hh, c.mm, c.g);
  if (!chart || !chart.bazi || !chart.bazi.siZhu) {
    results.push({ ...c, ok: false, err: '引擎无输出' });
    continue;
  }
  const sz = chart.bazi.siZhu;

  const engineDay = sz.day.gan + sz.day.zhi;
  const engineYearGan = sz.year.gan;
  const engineMonthGan = sz.month.gan;
  const engineMonthZhi = sz.month.zhi;
  const engineDayGan = sz.day.gan;
  const engineHourGan = sz.hour.gan;
  const engineHourZhi = sz.hour.zhi;

  const expDay = expectedDayPillar(c.y, c.m, c.d, c.hh);
  const expMonthGan = expectedMonthGan(engineYearGan, engineMonthZhi);
  const expHourGan = expectedHourGan(engineDayGan, engineHourZhi);

  results.push({
    ...c,
    pillars: `${sz.year.gan}${sz.year.zhi} ${sz.month.gan}${sz.month.zhi} ${sz.day.gan}${sz.day.zhi} ${sz.hour.gan}${sz.hour.zhi}`,
    dayMatch: engineDay === expDay,
    expDay,
    engineDay,
    monthGanMatch: engineMonthGan === expMonthGan,
    expMonthGan,
    engineMonthGan,
    hourGanMatch: engineHourGan === expHourGan,
    expHourGan,
    engineHourGan,
  });
}

// ────────────────────────────────────────────────────────────
// 输出报告
// ────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n, ' ');
const padCJK = (s, n) => {
  // 中文按 2 宽度算
  const w = String(s).replace(/[^\x00-\xff]/g, 'aa').length;
  return String(s) + ' '.repeat(Math.max(0, n - w));
};

console.log('\n══════════ 排盘引擎交叉验证报告 ══════════\n');
console.log(
  padCJK('用例', 22) + padCJK('生辰', 20) + padCJK('引擎四柱', 20) +
  pad('日柱', 8) + pad('月干', 8) + pad('时干', 8) + '结论'
);
console.log('─'.repeat(100));

let pass = 0, fail = 0;
for (const r of results) {
  if (r.err) {
    console.log(padCJK(r.tag, 22) + padCJK(`${r.y}-${r.m}-${r.d}`, 20) + padCJK('—', 20) + '  ' + r.err);
    fail++;
    continue;
  }
  const date = `${r.y}-${String(r.m).padStart(2, '0')}-${String(r.d).padStart(2, '0')} ${String(r.hh).padStart(2, '0')}:${String(r.mm).padStart(2, '0')}`;
  const dOk = r.dayMatch ? '✓' : `✗(${r.expDay})`;
  const mOk = r.monthGanMatch ? '✓' : `✗(${r.expMonthGan})`;
  const hOk = r.hourGanMatch ? '✓' : `✗(${r.expHourGan})`;
  const allOk = r.dayMatch && r.monthGanMatch && r.hourGanMatch;
  if (allOk) pass++; else fail++;
  console.log(
    padCJK(r.tag, 22) + padCJK(date, 20) + padCJK(r.pillars, 20) +
    pad(dOk, 8) + pad(mOk, 8) + pad(hOk, 8) + (allOk ? '通过' : '不符')
  );
}

console.log('─'.repeat(100));
console.log(`\n合计 ${results.length} 例：通过 ${pass}，不符 ${fail}`);
console.log('\n验证方法：');
console.log('  1. 日柱 —— JDN(儒略日) 天文算法独立推算，常数 49 经 1949-10-01(甲子日) 与 2000-01-01(戊午日) 双锚点确认');
console.log('  2. 月干 —— 《五虎遁》年上起月规则独立推算');
console.log('  3. 时干 —— 《五鼠遁》日上起时规则独立推算');
console.log('  4. 晚子时 —— 23:00-23:59 按次日派处理（日柱取次日）\n');

process.exit(fail === 0 ? 0 : 1);
