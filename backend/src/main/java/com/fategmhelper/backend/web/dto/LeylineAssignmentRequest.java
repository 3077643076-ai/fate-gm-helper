package com.fategmhelper.backend.web.dto;

import lombok.Data;

import jakarta.validation.constraints.NotNull;
import java.util.List;

@Data
public class LeylineAssignmentRequest {
    @NotNull
    private Long campaignId;

    // for single-assignment requests only; bulk requests should use `items`
    private Long characterCardId;

    private Long leylineId; // nullable 表示解除绑定

    // bulk assignments
    private List<AssignmentItem> items;

    @Data
    public static class AssignmentItem {
        @NotNull
        private Long characterCardId;
        private Long leylineId;
    }
}
