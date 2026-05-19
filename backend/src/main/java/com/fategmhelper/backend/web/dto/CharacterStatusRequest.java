package com.fategmhelper.backend.web.dto;

import com.fategmhelper.backend.domain.StatusEffect;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

@Data
public class CharacterStatusRequest {

    @NotNull
    private Long characterCardId;

    @NotNull
    private Long campaignId;

    @NotNull
    private Integer roundNumber;

    // 当前魔力值
    private Integer currentMana;

    // 当前魔力上限
    private Integer manaLimit;

    // 当前令咒数量
    private Integer currentCommandSeals;

    // 异常状态（JSON格式字符串）
    private String statusEffects;

    // 异常状态列表（结构化数据）
    private List<StatusEffect> statusEffectsList;

    // 特殊标记
    private String notes;
}
