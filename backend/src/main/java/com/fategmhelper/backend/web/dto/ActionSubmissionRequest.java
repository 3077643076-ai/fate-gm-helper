package com.fategmhelper.backend.web.dto;

import com.fategmhelper.backend.domain.ActionSubmission;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class ActionSubmissionRequest {

    @NotNull
    private Long campaignId;

    /**
     * 阶职，例如：弓、剑、骑 等
     */
    @NotBlank
    private String servantClass;

    @NotNull
    private ActionSubmission.ActionType actionType;

    @NotBlank
    private String content;

    /**
     * 提交人（可用群昵称 / 用户名）
     */
    private String submittedBy;
}


