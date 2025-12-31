package com.fategmhelper.backend.domain;

import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Embeddable
public class Stats {
    private Integer level;
    private Integer strength;
    private Integer endurance;
    private Integer agility;
    private Integer mana;
    private Integer luck;
    private Integer noblePhantasm;
}

