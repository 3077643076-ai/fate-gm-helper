package com.fategmhelper.backend.web.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class SkillTemplateRequest {
    @NotBlank
    private String name;
    private String rank;
    private String skillType;
    private String timing;
    private String positionLimit;
    private Integer manaCost;
    private Integer cooldown;
    private String statModifiers;
    private Integer winRateModifier;
    private Integer enemyWinRateModifier;
    private String statusEffects;
    private String rawText;
    private String notes;
}
