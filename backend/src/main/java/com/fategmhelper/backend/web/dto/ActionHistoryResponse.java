package com.fategmhelper.backend.web.dto;

import lombok.Value;

import java.time.Instant;
import java.util.List;

@Value
public class ActionHistoryResponse {
    Long id;
    Long campaignId;
    Integer roundNumber;
    Instant closedAt;
    List<Object> actionOrder;
    List<String> servantActions;
    List<String> masterActions;
    Instant createdAt;

    public static ActionHistoryResponse fromEntity(com.fategmhelper.backend.domain.ActionHistory e, com.fasterxml.jackson.databind.ObjectMapper mapper) {
        List<Object> ao = null;
        try {
            ao = e.getActionOrderJson() != null ? mapper.readValue(e.getActionOrderJson(), List.class) : null;
        } catch (Exception ex) { ao = null; }
        List<String> sa = null;
        try { sa = e.getServantActionsJson() != null ? mapper.readValue(e.getServantActionsJson(), List.class) : null; } catch (Exception ex) { sa = null; }
        List<String> ma = null;
        try { ma = e.getMasterActionsJson() != null ? mapper.readValue(e.getMasterActionsJson(), List.class) : null; } catch (Exception ex) { ma = null; }
        return new ActionHistoryResponse(
                e.getId(),
                e.getCampaign() != null ? e.getCampaign().getId() : null,
                e.getRoundNumber(),
                e.getClosedAt(),
                ao,
                sa,
                ma,
                e.getCreatedAt()
        );
    }
}


