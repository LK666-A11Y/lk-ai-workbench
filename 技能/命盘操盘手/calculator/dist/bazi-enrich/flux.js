"use strict";
// 流年 / 流月 / 流日 计算 + 与命局四柱的刑冲合害分析
//
// 输入：命局四柱(siZhu) + 日主(dayMaster) + 参照日期(refDate, 默认今天)
// 输出：流年/流月/流日 的干支、天干十神、天干五合、地支与命局四支的刑冲合害三合三会
//
// 用途：给"趋势提醒器"提供"当下这一刻"的动态层——
//   大运/流年(已有)是 decade/year 级趋势，流月/流日是 month/day 级的"现在进行式"。
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeFlux = computeFlux;
const lunar_typescript_1 = require("lunar-typescript");
const tables_1 = require("./tables");
const zhi_relations_1 = require("./zhi-relations");
// 天干五合: 甲己 乙庚 丙辛 丁壬 戊癸
const GAN_HE = {
    甲: '己', 己: '甲', 乙: '庚', 庚: '乙', 丙: '辛', 辛: '丙', 丁: '壬', 壬: '丁', 戊: '癸', 癸: '戊'
};
function todayStr() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
// 取参照日当天的 年/月/日 柱（节气校正由 lunar-typescript 内部处理）
// 注意：lunar-typescript 的 getYear()/getMonth()/getDay() 返回完整干支(2字)，
// 单字须用 getXxxGan()/getXxxZhi()。
function getGanZhiOf(solar, kind) {
    const ec = solar.getLunar().getEightChar();
    let g = '';
    let z = '';
    if (kind === '流年') {
        g = ec.getYearGan();
        z = ec.getYearZhi();
    }
    else if (kind === '流月') {
        g = ec.getMonthGan();
        z = ec.getMonthZhi();
    }
    else {
        g = ec.getDayGan();
        z = ec.getDayZhi();
    }
    return { gan: g, zhi: z };
}
function pairHit(a, b, table) {
    return table.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}
// 流X地支 与 命局四支 的关系
function relateFluxZhi(fluxZhi, mingList) {
    const out = [];
    // 1) 两两 六冲 / 六合 / 六害
    for (const mk of mingList) {
        if (pairHit(fluxZhi, mk.zhi, zhi_relations_1.LIU_CHONG))
            out.push({ type: '六冲', with: mk.pillar, zhi: mk.zhi });
        if (pairHit(fluxZhi, mk.zhi, zhi_relations_1.LIU_HE))
            out.push({ type: '六合', with: mk.pillar, zhi: mk.zhi });
        if (pairHit(fluxZhi, mk.zhi, zhi_relations_1.LIU_HAI))
            out.push({ type: '六害', with: mk.pillar, zhi: mk.zhi });
    }
    // 2) 相刑（子卯 / 丑戌未 / 寅巳申）
    for (const xing of zhi_relations_1.XIANG_XING) {
        const inFlux = xing.zhi.includes(fluxZhi);
        if (!inFlux)
            continue;
        const mingHit = mingList.filter(m => xing.zhi.includes(m.zhi));
        if (mingHit.length >= 1) {
            const all = [fluxZhi, ...mingHit.map(m => m.zhi)];
            const distinct = new Set(all);
            out.push({
                type: '相刑',
                with: mingHit.map(m => m.pillar).join('+'),
                zhi: fluxZhi,
                note: xing.name + (distinct.size >= xing.zhi.length ? '(全)' : '(半)')
            });
        }
    }
    // 3) 三合 / 三会 / 拱合 / 拱会
    const checkTriple = (triples) => {
        for (const t of triples) {
            if (!t.zhi.includes(fluxZhi))
                continue;
            const mingHit = mingList.filter(m => t.zhi.includes(m.zhi));
            const present = new Set([fluxZhi, ...mingHit.map(m => m.zhi)]);
            if (present.size < 2)
                continue;
            const missing = t.zhi.find(z => !present.has(z));
            if (missing) {
                out.push({ type: '拱' + t.label, with: mingHit.map(m => m.pillar).join('+'), zhi: fluxZhi, note: `拱${missing}` });
            }
            else {
                out.push({ type: t.label, with: mingHit.map(m => m.pillar).join('+'), zhi: fluxZhi });
            }
        }
    };
    checkTriple(zhi_relations_1.SAN_HE.map(s => ({ zhi: s.zhi, label: '三合' })));
    checkTriple(zhi_relations_1.SAN_HUI.map(s => ({ zhi: s.zhi, label: '三会' })));
    return out;
}
/**
 * 计算流年/流月/流日 及其与命局关系
 * @param siZhu 命局四柱
 * @param dayMaster 日主
 * @param refDate 参照日期 YYYY-MM-DD（不传默认今天）
 */
function computeFlux(siZhu, dayMaster, refDate) {
    const dateStr = refDate && /^\d{4}-\d{2}-\d{2}$/.test(refDate) ? refDate : todayStr();
    const [y, m, d] = dateStr.split('-').map(Number);
    const solar = lunar_typescript_1.Solar.fromYmd(y, m, d);
    const mingList = [
        { pillar: '年', zhi: siZhu.year.zhi },
        { pillar: '月', zhi: siZhu.month.zhi },
        { pillar: '日', zhi: siZhu.day.zhi },
        { pillar: '时', zhi: siZhu.hour.zhi },
    ];
    const mingGans = [siZhu.year.gan, siZhu.month.gan, siZhu.day.gan, siZhu.hour.gan];
    const items = [];
    for (const kind of ['流年', '流月', '流日']) {
        const gz = getGanZhiOf(solar, kind);
        const ganShiShen = (0, tables_1.getShiShen)(dayMaster, gz.gan);
        // 天干五合
        let ganHe;
        for (const mg of mingGans) {
            if (GAN_HE[gz.gan] === mg) {
                ganHe = mg;
                break;
            }
        }
        const zhiRelations = relateFluxZhi(gz.zhi, mingList);
        items.push({
            kind,
            refDate: dateStr,
            ganZhi: gz.gan + gz.zhi,
            gan: gz.gan,
            zhi: gz.zhi,
            ganShiShen,
            ganHe,
            zhiRelations,
        });
    }
    return { refDate: dateStr, items };
}
