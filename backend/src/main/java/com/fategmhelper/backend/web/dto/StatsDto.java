package com.fategmhelper.backend.web.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class StatsDto {
    @NotNull private Integer level;
    @NotNull private Integer strength;
    @NotNull private Integer endurance;
    @NotNull private Integer agility;
    @NotNull private Integer mana;
    @NotNull private Integer luck;
    @NotNull private Integer noblePhantasm;
}

