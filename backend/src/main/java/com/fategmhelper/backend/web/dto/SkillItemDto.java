package com.fategmhelper.backend.web.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class SkillItemDto {
    @NotBlank
    private String name;
    private String rank;
    private String desc;
}

