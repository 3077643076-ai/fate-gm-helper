package com.fategmhelper.backend.web.dto;

import com.fategmhelper.backend.domain.LeylineAssignment;
import lombok.Value;

@Value
public class LeylineAssignmentResponse {
    Long id;
    Long campaignId;
    Long leylineId;
    Long characterCardId;

    public static LeylineAssignmentResponse fromEntity(LeylineAssignment e) {
        return new LeylineAssignmentResponse(
                e.getId(),
                e.getCampaign() != null ? e.getCampaign().getId() : null,
                e.getLeyline() != null ? e.getLeyline().getId() : null,
                e.getCharacterCard() != null ? e.getCharacterCard().getId() : null
        );
    }
}


