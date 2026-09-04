# -*- coding: utf-8 -*-
"""
空想圣杯 构筑卡 RP 账目验算脚本
用法: python verify_build.py --build 构筑.json

作用：搓卡后自动查账，防止以下错误——
  1. RP 合计和预算对不上（人算容易错，本对话里 AI 就算错过一次）
  2. 属性不是 5 的倍数 / 超过分配上限
  3. 技能/宝具「面向」重复（六技能面向、十一宝具面向各限一个）
  4. 栏位超限（职阶技能栏3 / 保有技能栏3+购买 / 宝具栏1+购买，剑阶宝具栏上限2）
脚本只查账目，不查效果文本是否编造——那部分靠查原文和 GM。
"""

import argparse
import json
import sys

# ── 规则常量（改价格/上限在这里改，会影响所有验算结果）──────────────────

RANK_RP = {"A": 5, "B": 4, "C": 3, "D": 2, "E": 1}   # 技能/宝具等级对应 RP
SKILL_FACES = ["天赋", "技艺", "祝福", "兵器", "荣冠", "魔术"]          # 技能六面向
NP_FACES = ["决战", "即死", "魔剑", "防御", "进攻",
            "增益", "召唤", "状态", "补给", "特殊", "特攻"]             # 宝具十一面向
ATTR_NAMES = ["筋力", "耐久", "敏捷", "魔力", "幸运", "宝具"]
DEFAULT_ALLOC_CAP = 50        # 属性分配单项上限
ATTR_STEP = 5                 # 分配必须是 5 的倍数
RP_PER_10_ATTR = 10           # 1RP = 10 点属性
NP_SLOT_BASE = 1              # 宝具栏基础格数
NP_SLOT_COST = 2              # 每格额外宝具栏 RP
SKILL_SLOT_BASE = 3           # 保有技能栏基础格数
SKILL_SLOT_COST = 2           # 每格额外保有技能栏 RP
CLASS_SKILL_SLOTS = 3         # 职阶技能栏（固定 3 格，职阶技能 E 级白送）

# 各职阶基础属性面板：[筋力, 耐久, 敏捷, 魔力, 幸运, 宝具]（规则书·从者职介）
CLASS_BASE_STATS = {
    "剑": [20, 30, 20, 10, 20, 0],
    "枪": [10, 10, 30, 10, 10, 0],
    "弓": [10, 10, 10, 0, 20, 0],
    "骑": [0, 30, 0, 0, 20, 0],
    "术": [0, 0, 0, 30, 0, 0],
    "杀": [0, 0, 20, 0, 20, 0],
    "狂": [0, 0, 0, 0, 0, 0],
}
# 职阶宝具栏上限（未列出的职阶默认 3）
CLASS_NP_CAP = {"剑": 2}


# ── 工具函数 ────────────────────────────────────────────────────────────

def item_rp(entry):
    """按等级查价格；卡面里直接写 rp 的以 rp 为准（用于 EX/特殊定价）。"""
    if "rp" in entry:
        return entry["rp"]
    return RANK_RP.get(entry.get("rank"), 0)


def check(build):
    """跑全部检查，返回 (是否通过, 结果清单)。"""
    errors, notes = [], []
    kind = build.get("type", "servant")
    budget = build.get("budget", 24 if kind == "servant" else 24)

    # 1) RP 账目：宝具 + 保有技能 + 职阶技能升级 + 各种栏位 + 属性 + 杂项 − 卖技能返点
    np_rp = sum(item_rp(x) for x in build.get("nps", []))
    skill_rp = sum(item_rp(x) for x in build.get("skills", []))
    class_skill_rp = sum(item_rp(x) for x in build.get("class_skills", []))
    np_slot_rp = build.get("extra_np_slots", 0) * NP_SLOT_COST
    skill_slot_rp = build.get("extra_skill_slots", 0) * SKILL_SLOT_COST
    attrs = build.get("attributes", {})
    attr_total = sum(attrs.values())
    attr_rp = attr_total / RP_PER_10_ATTR
    misc_rp = sum(x.get("rp", 0) for x in build.get("extra_costs", []))
    sold = build.get("sold_class_skill", {})
    sold_refund = sold.get("rp_gain", 0)

    spend = np_rp + skill_rp + class_skill_rp + np_slot_rp + skill_slot_rp + attr_rp + misc_rp
    balance = budget + sold_refund - spend
    if balance != 0:
        errors.append(f"RP 账不平：预算 {budget} + 卖技能返 {sold_refund} − 花费 {spend:g} = {balance:+g}")
    else:
        notes.append(f"RP 账平：花费 {spend:g} / 可用 {budget + sold_refund}")

    # 2) 属性分配：5 的倍数、单项不超上限、合计能被 10 整除（否则 RP 会出现小数）
    caps = {a: DEFAULT_ALLOC_CAP + build.get("cap_overrides", {}).get(a, 0)
            for a in ATTR_NAMES}
    for name, val in attrs.items():
        if name not in ATTR_NAMES:
            errors.append(f"未知属性名：{name}")
        if val % ATTR_STEP != 0:
            errors.append(f"{name} 分配 {val} 不是 {ATTR_STEP} 的倍数")
        if val > caps.get(name, DEFAULT_ALLOC_CAP):
            errors.append(f"{name} 分配 {val} 超过上限 {caps.get(name, DEFAULT_ALLOC_CAP)}")
    if attr_total % RP_PER_10_ATTR != 0:
        errors.append(f"属性合计 {attr_total} 不能被 {RP_PER_10_ATTR} 整除，RP 会出现小数")

    # 3) 面向查重：技能六面向、宝具十一面向，各至多一个
    faces = [x.get("face", "?") for x in build.get("skills", [])]
    dup = {f for f in faces if faces.count(f) > 1 and f in SKILL_FACES}
    if dup:
        errors.append(f"保有技能面向重复：{sorted(dup)}（六面向各限 1 个）")
    np_faces = [x.get("face", "?") for x in build.get("nps", [])]
    dup = {f for f in np_faces if np_faces.count(f) > 1 and f in NP_FACES}
    if dup:
        errors.append(f"宝具面向重复：{sorted(dup)}（十一面向各限 1 个）")

    # 4) 栏位数量
    if len(build.get("class_skills", [])) > CLASS_SKILL_SLOTS:
        errors.append(f"职阶技能 {len(build['class_skills'])} 个，超过 {CLASS_SKILL_SLOTS} 格")
    max_skills = SKILL_SLOT_BASE + build.get("extra_skill_slots", 0)
    if len(build.get("skills", [])) > max_skills:
        errors.append(f"保有技能 {len(build['skills'])} 个，超过 {max_skills} 格（基础3+购买）")
    max_np = NP_SLOT_BASE + build.get("extra_np_slots", 0)
    if len(build.get("nps", [])) > max_np:
        errors.append(f"宝具 {len(build['nps'])} 个，超过 {max_np} 格（基础1+购买）")

    # 5) 职阶宝具栏上限（剑=2，其余默认 3；御主卡跳过）
    if kind == "servant":
        cls = build.get("class", "")
        cap = CLASS_NP_CAP.get(cls, 3)
        if len(build.get("nps", [])) > cap:
            errors.append(f"{cls}阶宝具栏上限 {cap}，当前 {len(build['nps'])} 个")

    # ── 三围结算表（基础面板 + 分配），仅供参考不算错 ──
    base = build.get("class_base_stats")
    if base is None and kind == "servant" and build.get("class") in CLASS_BASE_STATS:
        base = dict(zip(ATTR_NAMES, CLASS_BASE_STATS[build["class"]]))
    if base:
        line = {a: base.get(a, 0) + attrs.get(a, 0) for a in ATTR_NAMES}
        notes.append("最终三围：" + " / ".join(f"{a}{line[a]}" for a in ATTR_NAMES))

    return (len(errors) == 0), errors, notes


def main():
    parser = argparse.ArgumentParser(description="空想圣杯构筑卡 RP 验算")
    parser.add_argument("--build", required=True, help="构筑 JSON 文件路径")
    args = parser.parse_args()

    with open(args.build, encoding="utf-8") as f:
        build = json.load(f)

    ok, errors, notes = check(build)
    print(f"== 验算：{build.get('name', '未命名')}（{build.get('type', 'servant')}）==")
    for n in notes:
        print(" [OK]", n)
    for e in errors:
        print(" [FAIL]", e)
    print("结果：", "PASS ✓" if ok else "FAIL ✗（改卡后重跑）")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
