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
@Table(name = "battle_sheet")
public class BattleSheet {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "campaign_id", nullable = false)
    private Campaign campaign;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "round_id", nullable = false)
    private Round round;

    @Column(name = "blue_positions", columnDefinition = "json")
    private String bluePositions;

    @Column(name = "yellow_positions", columnDefinition = "json")
    private String yellowPositions;

    @Column(name = "activated_skills", columnDefinition = "json")
    private String activatedSkills;

    @Column(name = "battlefield_width")
    @Builder.Default
    private Integer battlefieldWidth = 0;

    @Column(name = "blue_tactic")
    private String blueTactic;

    @Column(name = "yellow_tactic")
    private String yellowTactic;

    @Column(name = "blue_pre_battle_bonus")
    @Builder.Default
    private Integer bluePreBattleBonus = 0;

    @Column(name = "blue_pre_battle_penalty")
    @Builder.Default
    private Integer bluePreBattlePenalty = 0;

    @Column(name = "yellow_pre_battle_bonus")
    @Builder.Default
    private Integer yellowPreBattleBonus = 0;

    @Column(name = "yellow_pre_battle_penalty")
    @Builder.Default
    private Integer yellowPreBattlePenalty = 0;

    @Column(name = "mana_data", columnDefinition = "json")
    private String manaData;

    @Column(name = "group_a_stats", columnDefinition = "json")
    private String groupAStats;

    @Column(name = "group_b_stats", columnDefinition = "json")
    private String groupBStats;

    @Column(name = "win_rate_result", columnDefinition = "json")
    private String winRateResult;

    @Column(name = "settlement_confirmed")
    @Builder.Default
    private Boolean settlementConfirmed = false;

    @Column(name = "confirmed_at")
    private Instant confirmedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;
}
