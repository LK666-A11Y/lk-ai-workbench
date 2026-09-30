// 排盘单一入口 — 输入生辰, 输出完整 JSON (Yiqi createChart + enrichBazi)
//
// 用法:
//   npx tsx run-chart.ts --year=2000 --month=1 --day=1 --hour=12 --minute=0 --gender=male
//   可选: --isLunar=true --timeZone=8 --output=path/to/file.json
//
// 不指定 --output 则打印到 stdout

import { createChart, validateBirthInfo } from './yiqi-core/index';
import { getZhiCangGanFull } from './yiqi-core/bazi';
import { enrichBazi } from './bazi-enrich/enrich';
import { computeFlux } from './bazi-enrich/flux';
import * as fs from 'fs';

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

/** 输入有问题的统一出口：What-Why-Next 三段式，人话，不甩堆栈 */
function failInput(what: string, why: string, next: string[]): never {
  console.error(JSON.stringify({
    ok: false,
    error: {
      category: 'INPUT_VALIDATION',
      what, why, next,
      degraded: true,
      hint: 'AI 收到本结构时按 What-Why-Next 说给用户听，不要复述技术字段。',
    },
  }, null, 2));
  process.exit(1);
}

function main() {
  const args = parseArgs();
  const required = ['year','month','day','hour','minute','gender'];
  for (const k of required) {
    if (!args[k]) {
      console.error(`Missing required arg: --${k}=...`);
      console.error('Usage: npx tsx run-chart.ts --year=2000 --month=1 --day=1 --hour=12 --minute=0 --gender=male');
      process.exit(1);
    }
  }
  const gender = args.gender === 'male' || args.gender === 'female' ? args.gender : (args.gender === '男' ? 'male' : 'female');

  const birthInfo = {
    year: +args.year,
    month: +args.month,
    day: +args.day,
    hour: +args.hour,
    minute: +args.minute,
    isLunar: args.isLunar === 'true',
    gender: gender as 'male'|'female',
    timeZone: args.timeZone ? +args.timeZone : 8,
  };

  // ── 输入校验（原本 validateBirthInfo 已实现但从未被调用，这里接上线）──
  const numericKeys = ['year', 'month', 'day', 'hour', 'minute'] as const;
  for (const k of numericKeys) {
    const v = (birthInfo as any)[k];
    // NaN 的大小比较全为 false，能穿透所有范围校验，必须单独拦
    if (!Number.isFinite(v)) {
      failInput(
        `--${k} 得是数字，我读到的是「${args[k]}」。`,
        '生辰要按数字给：年 1900-2100、月 1-12、日 1-31、时辰 0-23、分钟 0-59。',
        [`把 --${k} 改成数字再跑一次`, '不确定时辰就直接说「不知道时辰」，AI 会按正午 12 点默认起盘']
      );
    }
  }

  const v = validateBirthInfo(birthInfo);
  if (!v.valid) {
    failInput(
      '这个生辰不成立——' + v.errors.join('；') + '。',
      '排盘需要真实存在的公历日期：年 1900-2100、月 1-12、日要在当月真实存在' +
      '（2 月平年 28 天 / 闰年 29 天，4、6、9、11 月只有 30 天）、时辰 0-23、分钟 0-59。',
      [
        '核对年月日，尤其注意 2 月没有 30 号、4/6/9/11 月没有 31 号',
        '时辰不确定就说「不知道时辰」，AI 按正午 12 点默认起盘',
        '农历生日给我「年份 + 节日名」（如 `1995 春节`），AI 帮你换算成公历',
      ]
    );
  }

  // Step 1: Yiqi 算法层 — 四柱+紫微+大运+流年
  const chart: any = createChart(birthInfo);

  // 附加地支藏干 (含十神)
  const dm = chart.bazi.dayMaster;
  const z = chart.bazi.siZhu;
  chart.bazi.cangGan = {
    year: getZhiCangGanFull(z.year.zhi, dm),
    month: getZhiCangGanFull(z.month.zhi, dm),
    day:   getZhiCangGanFull(z.day.zhi, dm),
    hour:  getZhiCangGanFull(z.hour.zhi, dm),
  };

  // 补 endAge 字段 (Yiqi 只给了 startAge/endYear, OpenClaw 等下游脚本会查 endAge)
  if (chart.bazi.dayun && Array.isArray(chart.bazi.dayun)) {
    for (const d of chart.bazi.dayun) {
      if (d.startAge !== undefined && d.endAge === undefined) {
        d.endAge = d.startAge + 9;
      }
    }
  }

  // Step 2: enrichBazi 补层 — 格局/旺衰/调候/刑冲合害/盖头
  const siZhuForEnrich = {
    '年': chart.bazi.siZhu.year,
    '月': chart.bazi.siZhu.month,
    '日': chart.bazi.siZhu.day,
    '时': chart.bazi.siZhu.hour,
  };
  chart.bazi.enrichment = enrichBazi(siZhuForEnrich);

  // Step 3: 流年/流月/流日 动态层（参照日默认今天，可用 --ref-date=YYYY-MM-DD 指定）
  const refDate = args.refDate || undefined;
  chart.bazi.flux = computeFlux(chart.bazi.siZhu, chart.bazi.dayMaster, refDate);

  const json = JSON.stringify(chart, null, 2);

  if (args.output) {
    fs.writeFileSync(args.output, json, 'utf-8');
    console.error(`Chart written to ${args.output}`);
  } else {
    process.stdout.write(json);
  }
}

main();
