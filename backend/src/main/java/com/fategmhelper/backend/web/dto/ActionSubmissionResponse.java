package com.fategmhelper.backend.web.dto;

import com.fategmhelper.backend.domain.ActionSubmission;
import lombok.Value;

import java.time.Instant;

@Value
public class ActionSubmissionResponse {

    Long id;
    Long campaignId;
    Long roundId;
    String servantClass;
    ActionSubmission.ActionType actionType;
    ActionSubmission.PhaseType phaseType;
    String content;
    String submittedBy;
    boolean current;
    Instant createdAt;
    Integer roundNumber;

    public static ActionSubmissionResponse fromEntity(ActionSubmission entity) {
        return new ActionSubmissionResponse(
                entity.getId(),
                entity.getCampaign() != null ? entity.getCampaign().getId() : null,
                entity.getRound() != null ? entity.getRound().getId() : null,
                entity.getServantClass(),
                entity.getActionType(),
                entity.getPhaseType(),
                entity.getContent(),
                entity.getSubmittedBy(),
                entity.isCurrent(),
                entity.getCreatedAt(),
                entity.getRoundNumber()
        );
    }
}


