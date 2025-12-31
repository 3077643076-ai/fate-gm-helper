package com.fategmhelper.backend.domain;

import com.fategmhelper.backend.domain.converter.SkillListJsonConverter;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "character_card")
public class CharacterCard {

    public enum CardType {
        SERVANT,  // 从者人物卡
        MASTER    // 御主角色卡
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String code;

    @Column(name = "class_name")
    private String className;

    @Column(columnDefinition = "TEXT")
    private String rawText;

    @Enumerated(EnumType.STRING)
    @Column(name = "card_type", nullable = false)
    private CardType cardType;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "campaign_id")
    private Campaign campaign;  // null表示通用角色卡

    @CreationTimestamp
    private Instant createdAt;

    @Embedded
    @AttributeOverrides({
            @AttributeOverride(name = "level", column = @Column(name = "total_level")),
            @AttributeOverride(name = "strength", column = @Column(name = "total_strength")),
            @AttributeOverride(name = "endurance", column = @Column(name = "total_endurance")),
            @AttributeOverride(name = "agility", column = @Column(name = "total_agility")),
            @AttributeOverride(name = "mana", column = @Column(name = "total_mana")),
            @AttributeOverride(name = "luck", column = @Column(name = "total_luck")),
            @AttributeOverride(name = "noblePhantasm", column = @Column(name = "total_noble_phantasm"))
    })
    private Stats totalStats;

    @Embedded
    @AttributeOverrides({
            @AttributeOverride(name = "level", column = @Column(name = "base_level")),
            @AttributeOverride(name = "strength", column = @Column(name = "base_strength")),
            @AttributeOverride(name = "endurance", column = @Column(name = "base_endurance")),
            @AttributeOverride(name = "agility", column = @Column(name = "base_agility")),
            @AttributeOverride(name = "mana", column = @Column(name = "base_mana")),
            @AttributeOverride(name = "luck", column = @Column(name = "base_luck")),
            @AttributeOverride(name = "noblePhantasm", column = @Column(name = "base_noble_phantasm"))
    })
    private Stats baseStats;

    @Embedded
    @AttributeOverrides({
            @AttributeOverride(name = "level", column = @Column(name = "corr_level")),
            @AttributeOverride(name = "strength", column = @Column(name = "corr_strength")),
            @AttributeOverride(name = "endurance", column = @Column(name = "corr_endurance")),
            @AttributeOverride(name = "agility", column = @Column(name = "corr_agility")),
            @AttributeOverride(name = "mana", column = @Column(name = "corr_mana")),
            @AttributeOverride(name = "luck", column = @Column(name = "corr_luck")),
            @AttributeOverride(name = "noblePhantasm", column = @Column(name = "corr_noble_phantasm"))
    })
    private Stats correctionStats;

    @Convert(converter = SkillListJsonConverter.class)
    @Column(columnDefinition = "json")
    private List<SkillItem> classSkills;

    @Convert(converter = SkillListJsonConverter.class)
    @Column(columnDefinition = "json")
    private List<SkillItem> personalSkills;

    @Convert(converter = SkillListJsonConverter.class)
    @Column(columnDefinition = "json")
    private List<SkillItem> noblePhantasms;

    // 御主角色卡专用字段
    @Convert(converter = SkillListJsonConverter.class)
    @Column(columnDefinition = "json", name = "workshops")
    private List<SkillItem> workshops;  // 工坊

    @Convert(converter = SkillListJsonConverter.class)
    @Column(columnDefinition = "json", name = "craft_essences")
    private List<SkillItem> craftEssences;  // 礼装
    
    @Column(name = "retired", nullable = false)
    private boolean retired = false;
}

