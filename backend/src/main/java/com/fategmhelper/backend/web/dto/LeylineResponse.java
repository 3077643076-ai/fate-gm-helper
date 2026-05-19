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
                assigned
        );
    }
}


