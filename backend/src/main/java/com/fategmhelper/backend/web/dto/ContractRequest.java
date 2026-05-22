package com.fategmhelper.backend.web.dto;

import com.fategmhelper.backend.domain.Contract;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class ContractRequest {

    @NotNull
    private Long campaignId;

    @NotNull
    private Contract.ContractType contractType;

    @NotNull
    private Long initiatorCardId;  // 立约人角色卡ID

    @NotNull
    private Long signatoryCardId;  // 签约人角色卡ID

    /** 自定义条款（强制契约等需要） */
    private String terms;
}
