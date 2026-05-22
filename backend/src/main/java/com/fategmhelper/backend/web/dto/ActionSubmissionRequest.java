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

    /** 结算类别（可选），未指定时服务端根据 content 自动检测 */
    private ActionSubmission.PhaseType phaseType;

    @NotBlank
    private String content;

    /**
     * 提交人（可用群昵称 / 用户名）
     */
    private String submittedBy;
}


