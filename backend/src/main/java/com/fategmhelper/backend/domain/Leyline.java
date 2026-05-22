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

    /** 灵脉大小区分（规则书第一章第五节 5.2） */
    public enum LeylineSize {
        /** 空灵脉：基础魔力量为 0 */
        EMPTY("空"),
        /** 小灵脉：基础魔力量 5~10 */
        SMALL("小"),
        /** 中灵脉：基础魔力量 15~30 */
        MEDIUM("中"),
        /** 大灵脉：基础魔力量 35+ */
        LARGE("大");

        private final String label;

        LeylineSize(String label) { this.label = label; }

        public String getLabel() { return label; }

        /** 根据魔力量自动推断灵脉大小 */
        public static LeylineSize inferFromMana(int manaAmount) {
            if (manaAmount <= 0) return EMPTY;
            if (manaAmount <= 10) return SMALL;
            if (manaAmount <= 30) return MEDIUM;
            return LARGE;
        }
    }

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
     * 灵脉大小（空/小/中/大），按基础魔力量区分
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "size")
    @Builder.Default
    private LeylineSize size = LeylineSize.EMPTY;

    /**
     * 灵脉所有者（规则书第一章第五节 5.3：持有所有权才能分配魔力补给、建立工房）
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_character_card_id")
    private CharacterCard owner;

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


