package com.fategmhelper.backend.web.dto;

import com.fategmhelper.backend.domain.CharacterCard;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.List;

@Data
@Builder
public class CharacterCardResponse {
    private Long id;
    private String code;
    private String className;
    private String rawText;
    private CharacterCard.CardType cardType;
    private Long campaignId;
    private String campaignName;
    private Instant createdAt;

    private StatsDto totalStats;
    private StatsDto baseStats;
    private StatsDto correctionStats;

    private List<SkillItemDto> classSkills;
    private List<SkillItemDto> personalSkills;
    private List<SkillItemDto> noblePhantasms;
    private boolean retired;

    // 御主角色卡专用字段
    private List<SkillItemDto> workshops;
    private List<SkillItemDto> craftEssences;
}

