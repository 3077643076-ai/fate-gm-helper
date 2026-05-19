package com.fategmhelper.backend.web.dto;

import com.fategmhelper.backend.domain.CharacterCard;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

@Data
public class CharacterCardRequest {
    @NotBlank
    private String code;

    @NotBlank
    private String className;

    @NotBlank
    private String rawText;

    @NotNull
    private CharacterCard.CardType cardType;

    private Long campaignId;  // null表示通用角色卡

    @NotNull @Valid
    private StatsDto totalStats;
    @NotNull @Valid
    private StatsDto baseStats;
    @NotNull @Valid
    private StatsDto correctionStats;

    @Valid
    private List<SkillItemDto> classSkills;
    @Valid
    private List<SkillItemDto> personalSkills;
    @Valid
    private List<SkillItemDto> noblePhantasms;

    // 御主角色卡专用字段
    @Valid
    private List<SkillItemDto> workshops;  // 工坊
    @Valid
    private List<SkillItemDto> craftEssences;  // 礼装
}

