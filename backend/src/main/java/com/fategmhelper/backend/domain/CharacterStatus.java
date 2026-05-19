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
@Table(name = "character_status", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"character_card_id", "campaign_id", "round_number"})
})
public class CharacterStatus {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "character_card_id", nullable = false)
    private CharacterCard characterCard;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "campaign_id", nullable = false)
    private Campaign campaign;

    @Column(name = "round_number", nullable = false)
    private Integer roundNumber;

    // 当前魔力值
    @Column(name = "current_mana")
    private Integer currentMana;

    // 当前魔力上限
    @Column(name = "mana_limit")
    private Integer manaLimit;

    // 当前令咒数量
    @Column(name = "current_command_seals")
    private Integer currentCommandSeals;

    // 异常状态（JSON格式存储）
    @Column(columnDefinition = "json")
    private String statusEffects;

    // 异常状态列表（JSON格式存储，支持多层）
    @Column(columnDefinition = "json", name = "status_effects_list")
    private String statusEffectsList;

    // 特殊标记
    @Column(columnDefinition = "TEXT")
    private String notes;

    @CreationTimestamp
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;
}
