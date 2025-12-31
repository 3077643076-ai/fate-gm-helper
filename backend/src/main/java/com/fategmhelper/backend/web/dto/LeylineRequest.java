package com.fategmhelper.backend.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class LeylineRequest {

    @NotNull
    private Long campaignId;

    @NotBlank
    private String name;

    /**
     * 魔力量
     */
    @NotNull
    private Integer manaAmount;

    /**
     * 战场宽度
     */
    @NotNull
    private Integer battlefieldWidth;

    /**
     * 人流量
     */
    @NotNull
    private Integer populationFlow;

    /**
     * 灵脉效果描述（规则相关效果，可选）
     */
    private String effect;

    /**
     * 额外说明（风味描述等，可选）
     */
    private String description;
    // assigned character ids (for testing) - optional
    private java.util.List<Long> assignedCharacterIds;
}


