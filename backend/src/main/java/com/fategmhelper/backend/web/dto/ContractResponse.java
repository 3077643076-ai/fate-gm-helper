package com.fategmhelper.backend.web.dto;

import com.fategmhelper.backend.domain.Contract;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class ContractResponse {

    private Long id;
    private Long campaignId;
    private String contractType;       // 枚举名
    private String contractTypeLabel;  // 中文显示名
    private Long initiatorCardId;
    private String initiatorCode;      // 立约人代号
    private String initiatorClass;     // 立约人职介
    private String initiatorCardType;  // 立约人卡类型（MASTER/SERVANT）
    private Long signatoryCardId;
    private String signatoryCode;      // 签约人代号
    private String signatoryClass;     // 签约人职介
    private String signatoryCardType;  // 签约人卡类型
    private String status;
    private String terms;
    private String createdAt;

    /** 从 Contract 实体构建响应 */
    public static ContractResponse fromEntity(Contract c) {
        return new ContractResponse(
            c.getId(),
            c.getCampaign() != null ? c.getCampaign().getId() : null,
            c.getContractType() != null ? c.getContractType().name() : null,
            c.getContractType() != null ? c.getContractType().getDisplayName() : null,
            c.getInitiatorCard() != null ? c.getInitiatorCard().getId() : null,
            c.getInitiatorCard() != null ? c.getInitiatorCard().getCode() : null,
            c.getInitiatorCard() != null ? c.getInitiatorCard().getClassName() : null,
            c.getInitiatorCard() != null ? c.getInitiatorCard().getCardType().name() : null,
            c.getSignatoryCard() != null ? c.getSignatoryCard().getId() : null,
            c.getSignatoryCard() != null ? c.getSignatoryCard().getCode() : null,
            c.getSignatoryCard() != null ? c.getSignatoryCard().getClassName() : null,
            c.getSignatoryCard() != null ? c.getSignatoryCard().getCardType().name() : null,
            c.getStatus() != null ? c.getStatus().name() : null,
            c.getTerms(),
            c.getCreatedAt() != null ? c.getCreatedAt().toString() : null
        );
    }
}
