package com.fategmhelper.backend.domain;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class StatusEffect {

    private String name;
    private StatusType type;
    private int level; // 层数，1表示一层，2表示两层，以此类推

    public enum StatusType {
        BUFF,       // 强化状态
        DEBUFF,     // 弱化状态
        ABNORMAL    // 异常状态
    }

    // 预定义的状态效果
    public static final String[] BUFF_EFFECTS = {
        "回避", "无敌", "保护", "无敌贯通", "抗性上升", "抗性无效"
    };

    public static final String[] DEBUFF_EFFECTS = {
        "疲惫", "残废", "迟滞", "诅咒", "技能封印", "宝具封印", "封印", "抗性下降"
    };

    public static final String[] ABNORMAL_EFFECTS = {
        "中毒", "灼伤", "感电", "石化", "晕眩", "魅惑", "混乱", "恐惧", "抗性破除", "特性赋予"
    };

    // 获取所有状态效果名称
    public static String[] getAllEffects() {
        String[] all = new String[BUFF_EFFECTS.length + DEBUFF_EFFECTS.length + ABNORMAL_EFFECTS.length];
        System.arraycopy(BUFF_EFFECTS, 0, all, 0, BUFF_EFFECTS.length);
        System.arraycopy(DEBUFF_EFFECTS, 0, all, BUFF_EFFECTS.length, DEBUFF_EFFECTS.length);
        System.arraycopy(ABNORMAL_EFFECTS, 0, all, BUFF_EFFECTS.length + DEBUFF_EFFECTS.length, ABNORMAL_EFFECTS.length);
        return all;
    }

    // 根据名称获取状态类型
    public static StatusType getStatusType(String name) {
        for (String effect : BUFF_EFFECTS) {
            if (effect.equals(name)) return StatusType.BUFF;
        }
        for (String effect : DEBUFF_EFFECTS) {
            if (effect.equals(name)) return StatusType.DEBUFF;
        }
        for (String effect : ABNORMAL_EFFECTS) {
            if (effect.equals(name)) return StatusType.ABNORMAL;
        }
        return StatusType.ABNORMAL; // 默认
    }
}
