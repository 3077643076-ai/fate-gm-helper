package com.fategmhelper.backend.web.dto;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;

@Data
@Builder
public class CharacterStatusResponse {

    private Long id;
    private Long characterCardId;
    private String characterCardCode;
    private String characterCardClassName;
    private Long campaignId;
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
    private java.util.List<com.fategmhelper.backend.domain.StatusEffect> statusEffectsList;

    // 特殊标记
    private String notes;

    private Instant createdAt;
    private Instant updatedAt;
}
