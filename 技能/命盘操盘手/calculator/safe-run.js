#!/usr/bin/env node
/**
 * safe-run.js · 排盘引擎的健壮性外壳
 *
 * 【为什么需要它】
 * 裸跑 run-chart.js 时，边缘输入 / 环境异常会直接抛堆栈，用户看到的是一堆技术报错。
 * 本外壳把「重试 / 超时 / 降级」三件事真正用代码实现（不只是写在文档里）：
 *
 *   1. 重试机制  —— 默认最多 3 次，指数退避（300ms → 600ms）
 *                   输入类错误不重试（重试也没用，直接返回）
 *   2. 超时处理  —— 默认 15 秒，超时按 TIMEOUT 分类返回，不挂死
 *   3. 结构化错误 —— What-Why-Next 三段式，人话输出，**不甩堆栈**
 *   4. 优雅降级  —— 引擎彻底不可用时返回 degraded 标记，AI 据此走「纯提示词降级档」
 *
 * 【用法】
 *   node safe-run.js --year=2005 --month=3 --day=12 --hour=8 --minute=30 --gender=male
 *   node safe-run.js ... --timeout=20000 --attempts=5     # 可调
 *   SKILLHUB_DEBUG=1 node safe-run.js ...                  # 调试时才带内部 stderr
 *
 * 【输出】
 *   成功 → 原盘面 JSON + _meta{ok,attempts,elapsedMs}
 *   失败 → { ok:false, error:{ category, what, why, next[], degraded:true, ... } }
 *
 * 【退出码】 0=成功  1=输入问题（别重试，改输入）  2=引擎/环境问题（可重试或降级）
 */

const { spawnSync } = require('child_process');
const path = require('path');

const ENGINE = path.join(__dirname, 'dist', 'run-chart.js');

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_ATTEMPTS = 3;

// 外壳专用参数，不透传给引擎（引擎不认识会报错）
const WRAPPER_ONLY = new Set(['timeout', 'attempts']);

/** 解析 --k=v 形式参数 */
function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
      else out[a.slice(2)] = '';
    }
  }
  return out;
}

/** 把外壳专用参数剔除，剩下的原样透传给引擎 */
function filterEngineArgs(argv) {
  const out = [];
  for (const a of argv) {
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    const key = eq > 0 ? a.slice(2, eq) : a.slice(2);
    if (!WRAPPER_ONLY.has(key)) out.push(a);
  }
  return out;
}

/** 错误分类：决定要不要重试、给用户看哪套话术 */
function classify(exitCode, stderr) {
  const s = (stderr || '').toLowerCase();
  // 引擎(run-chart.js)校验失败时会输出结构化 INPUT_VALIDATION，优先按 category 识别
  if (s.indexOf('input_validation') >= 0) return 'INPUT_VALIDATION';
  if (/validatebirthinfo|invalid|out of range|year|month|day|hour|gender|range|非法|无效|范围|不成立/.test(s)) {
    return 'INPUT_VALIDATION';
  }
  if (/etimedout|timeout|超时/.test(s)) return 'TIMEOUT';
  if (/cannot find module|enoent|module not found/.test(s)) return 'ENGINE_MISSING';
  return 'ENGINE_ERROR';
}

/** What-Why-Next 三段式话术（绝不甩技术错误给用户） */
const TEMPLATES = {
  INPUT_VALIDATION: {
    what: '这个生辰我读不出来——日期或时间的数值不在能起盘的范围里。',
    why: '排盘需要真实存在的公历日期：年 1900–2100、月 1–12、日要在当月真实存在、时辰 0–23。',
    next: [
      '核对一下年月日，尤其注意 2 月没有 30 号这种',
      '时辰不确定就直接说「不知道时辰」，我按正午 12 点默认起盘',
      '农历生日给我「年份 + 节日名」（如 `1995 春节`），我帮你换算成公历',
    ],
  },
  TIMEOUT: {
    what: '排盘超过时间限制没跑完。',
    why: '通常是这台机器这会儿资源紧张，不是你输入的问题。',
    next: [
      '我已经自动重试过了，你可以再试一次',
      '也可以先用「纯提示词降级档」按你的描述给出身强身弱的粗判方向（精度降一档）',
    ],
  },
  ENGINE_MISSING: {
    what: '排盘引擎文件没找到。',
    why: 'calculator/dist 目录缺失或还没编译。',
    next: [
      '在 calculator/ 目录下跑一次 `npm install && npm run build`',
      '或者先用「纯提示词降级档」按描述给方向',
    ],
  },
  ENGINE_ERROR: {
    what: '排盘引擎这会儿没跑出结果。',
    why: '不是你输入的问题，是引擎内部出错或未安装依赖。',
    next: [
      '我已经自动重试过了，你再说一次生辰我重跑',
      '如果依赖没装，在 calculator/ 下跑 `npm install`',
      '还不行的话，我用「纯提示词降级档」按描述给方向（精度降一档）',
    ],
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const rawArgs = process.argv.slice(2);
  const opts = parseArgs(rawArgs);
  const engineArgs = filterEngineArgs(rawArgs);
  const timeoutMs = Number(opts.timeout) || DEFAULT_TIMEOUT_MS;
  const maxAttempts = Number(opts.attempts) || DEFAULT_ATTEMPTS;

  let last = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const started = Date.now();
    let r;
    try {
      r = spawnSync(process.execPath, [ENGINE, ...engineArgs], {
        cwd: __dirname,
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 32 * 1024 * 1024,
      });
    } catch (e) {
      r = { status: null, stdout: '', stderr: '', error: e };
    }
    const elapsed = Date.now() - started;

    if (r.status === 0 && r.stdout && r.stdout.trim()) {
      try {
        const chart = JSON.parse(r.stdout);
        chart._meta = {
          ok: true,
          attempts: attempt,
          elapsedMs: elapsed,
          engine: 'dist/run-chart.js',
          wrapper: 'safe-run.js',
        };
        process.stdout.write(JSON.stringify(chart));
        return 0;
      } catch (e) {
        last = { code: -1, stderr: '引擎输出不是合法 JSON：' + e.message };
      }
    } else {
      last = {
        code: r.status == null ? -1 : r.status,
        stderr: (r.stderr || '') + (r.error ? ' ' + r.error.message : ''),
      };
    }

    // 输入类 / 缺文件类错误不重试（重试也没用，浪费时间）
    const cat = classify(last.code, last.stderr);
    if (cat === 'INPUT_VALIDATION' || cat === 'ENGINE_MISSING') break;

    if (attempt < maxAttempts) await sleep(300 * attempt); // 指数退避
  }

  const cat = classify(last ? last.code : -1, last ? last.stderr : '');
  const t = TEMPLATES[cat] || TEMPLATES.ENGINE_ERROR;

  const payload = {
    ok: false,
    error: {
      category: cat,
      attempts: maxAttempts,
      what: t.what,
      why: t.why,
      next: t.next,
      degraded: true,
      degradedMode: '纯提示词降级档（精度降一档，但仍能给出身强身弱 / 喜用神方向的粗判）',
      hint: 'AI 收到本结构时：按 What-Why-Next 说给用户听。不要复述 category / attempts / _internal 这些技术字段。',
      _internal: process.env.SKILLHUB_DEBUG ? (last ? String(last.stderr).slice(0, 500) : '') : undefined,
    },
  };
  process.stdout.write(JSON.stringify(payload));
  return cat === 'INPUT_VALIDATION' ? 1 : 2;
}

main()
  .then((code) => process.exit(code))
  .catch(() => {
    process.stdout.write(
      JSON.stringify({
        ok: false,
        error: {
          category: 'ENGINE_ERROR',
          what: '排盘外壳自身出错了。',
          why: '未知异常。',
          next: ['重跑一次', '改用纯提示词降级档'],
          degraded: true,
        },
      })
    );
    process.exit(2);
  });
