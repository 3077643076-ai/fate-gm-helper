package com.fategmhelper.backend.web.dto;

import com.fategmhelper.backend.domain.BattleSheet;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BattleSheetResponse {
    private Long id;
    private Long campaignId;
    private Long roundId;
    private Integer turnNumber;
    private String bluePositions;
    private String yellowPositions;
    private String activatedSkills;
    private Integer battlefieldWidth;
    private String blueTactic;
    private String yellowTactic;
    private Integer bluePreBattleBonus;
    private Integer bluePreBattlePenalty;
    private Integer yellowPreBattleBonus;
    private Integer yellowPreBattlePenalty;
    private String manaData;
    private String groupAStats;
    private String groupBStats;
    private String winRateResult;
    private Boolean settlementConfirmed;
    private Instant confirmedAt;
    private Instant createdAt;
    private Instant updatedAt;

    public static BattleSheetResponse fromEntity(BattleSheet sheet) {
        return BattleSheetResponse.builder()
                .id(sheet.getId())
                .campaignId(sheet.getCampaign().getId())
                .roundId(sheet.getRound().getId())
                .turnNumber(sheet.getRound().getTurnNumber())
                .bluePositions(sheet.getBluePositions())
                .yellowPositions(sheet.getYellowPositions())
                .activatedSkills(sheet.getActivatedSkills())
                .battlefieldWidth(sheet.getBattlefieldWidth())
                .blueTactic(sheet.getBlueTactic())
                .yellowTactic(sheet.getYellowTactic())
                .bluePreBattleBonus(sheet.getBluePreBattleBonus())
                .bluePreBattlePenalty(sheet.getBluePreBattlePenalty())
                .yellowPreBattleBonus(sheet.getYellowPreBattleBonus())
                .yellowPreBattlePenalty(sheet.getYellowPreBattlePenalty())
                .manaData(sheet.getManaData())
                .groupAStats(sheet.getGroupAStats())
                .groupBStats(sheet.getGroupBStats())
                .winRateResult(sheet.getWinRateResult())
                .settlementConfirmed(Boolean.TRUE.equals(sheet.getSettlementConfirmed()))
                .confirmedAt(sheet.getConfirmedAt())
                .createdAt(sheet.getCreatedAt())
                .updatedAt(sheet.getUpdatedAt())
                .build();
    }
}
