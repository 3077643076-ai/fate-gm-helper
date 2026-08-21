package com.fategmhelper.backend.web.dto;

import com.fategmhelper.backend.domain.SkillTemplate;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;

@Data
@Builder
public class SkillTemplateResponse {
    private Long id;
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
    private Instant createdAt;
    private Instant updatedAt;

    public static SkillTemplateResponse fromEntity(SkillTemplate template) {
        return SkillTemplateResponse.builder()
                .id(template.getId())
                .name(template.getName())
                .rank(template.getRank())
                .skillType(template.getSkillType())
                .timing(template.getTiming())
                .positionLimit(template.getPositionLimit())
                .manaCost(template.getManaCost())
                .cooldown(template.getCooldown())
                .statModifiers(template.getStatModifiers())
                .winRateModifier(template.getWinRateModifier())
                .enemyWinRateModifier(template.getEnemyWinRateModifier())
                .statusEffects(template.getStatusEffects())
                .rawText(template.getRawText())
                .notes(template.getNotes())
                .createdAt(template.getCreatedAt())
                .updatedAt(template.getUpdatedAt())
                .build();
    }
}
