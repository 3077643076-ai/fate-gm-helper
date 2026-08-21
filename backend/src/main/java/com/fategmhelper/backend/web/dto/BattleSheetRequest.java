package com.fategmhelper.backend.web.dto;

import lombok.Data;

@Data
public class BattleSheetRequest {
    private Long campaignId;
    private Long roundId;
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
}
