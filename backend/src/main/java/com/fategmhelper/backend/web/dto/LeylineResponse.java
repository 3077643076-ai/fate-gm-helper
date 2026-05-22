package com.fategmhelper.backend.web.dto;

import com.fategmhelper.backend.domain.Leyline;
import lombok.Value;

@Value
public class LeylineResponse {

    Long id;
    Long campaignId;
    String name;
    String effect;
    String description;
    Integer manaAmount;
    Integer battlefieldWidth;
    Integer populationFlow;
    String size;           // 灵脉大小：EMPTY/SMALL/MEDIUM/LARGE
    String sizeLabel;      // 灵脉大小中文：空/小/中/大
    Long ownerCharacterId; // 灵脉所有者角色卡ID
    String ownerCode;      // 灵脉所有者代号（便于GM识别）
    java.util.List<Long> assignedCharacterIds;

    public static LeylineResponse fromEntity(Leyline leyline) {
        java.util.List<Long> assigned = java.util.Collections.emptyList();
        try {
            if (leyline.getAssignedCharacterIdsJson() != null && !leyline.getAssignedCharacterIdsJson().trim().isEmpty()) {
                com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                assigned = mapper.readValue(leyline.getAssignedCharacterIdsJson(), mapper.getTypeFactory().constructCollectionType(java.util.List.class, Long.class));
            }
        } catch (Exception ignore) {
            assigned = java.util.Collections.emptyList();
        }
        return new LeylineResponse(
                leyline.getId(),
                leyline.getCampaign() != null ? leyline.getCampaign().getId() : null,
                leyline.getName(),
                leyline.getEffect(),
                leyline.getDescription(),
                leyline.getManaAmount(),
                leyline.getBattlefieldWidth(),
                leyline.getPopulationFlow(),
                leyline.getSize() != null ? leyline.getSize().name() : null,
                leyline.getSize() != null ? leyline.getSize().getLabel() : null,
                leyline.getOwner() != null ? leyline.getOwner().getId() : null,
                leyline.getOwner() != null ? leyline.getOwner().getCode() : null,
                assigned
        );
    }
}


