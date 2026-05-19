package com.fategmhelper.backend.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "leyline")
public class Leyline {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "campaign_id", nullable = false)
    private Campaign campaign;

    @Column(nullable = false)
    private String name;

    /**
     * 魔力量
     */
    @Column(name = "mana_amount", nullable = false)
    private Integer manaAmount;

    /**
     * 战场宽度
     */
    @Column(name = "battlefield_width", nullable = false)
    private Integer battlefieldWidth;

    /**
     * 人流量
     */
    @Column(name = "population_flow", nullable = false)
    private Integer populationFlow;

    /**
     * 灵脉效果描述（规则相关效果，可选）
     */
    @Column(columnDefinition = "TEXT")
    private String effect;

    /**
     * 额外说明（风味描述等，可选）
     */
    @Column(columnDefinition = "TEXT")
    private String description;

    /**
     * Assigned character IDs stored as JSON array, e.g. [1,2,3]
     * Used for testing purposes to persist which characters are on this leyline.
     */
    @Column(name = "assigned_character_ids", columnDefinition = "TEXT")
    private String assignedCharacterIdsJson;
}


