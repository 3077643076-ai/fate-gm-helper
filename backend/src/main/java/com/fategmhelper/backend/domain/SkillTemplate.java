package com.fategmhelper.backend.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "skill_template")
public class SkillTemplate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    private String rank;

    @Column(name = "skill_type")
    private String skillType;

    @Column(name = "timing")
    private String timing;

    @Column(name = "position_limit")
    private String positionLimit;

    @Column(name = "mana_cost")
    @Builder.Default
    private Integer manaCost = 0;

    @Column(name = "cooldown")
    @Builder.Default
    private Integer cooldown = 0;

    @Column(name = "stat_modifiers", columnDefinition = "json")
    private String statModifiers;

    @Column(name = "win_rate_modifier")
    @Builder.Default
    private Integer winRateModifier = 0;

    @Column(name = "enemy_win_rate_modifier")
    @Builder.Default
    private Integer enemyWinRateModifier = 0;

    @Column(name = "status_effects", columnDefinition = "json")
    private String statusEffects;

    @Column(name = "raw_text", columnDefinition = "TEXT")
    private String rawText;

    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;
}
