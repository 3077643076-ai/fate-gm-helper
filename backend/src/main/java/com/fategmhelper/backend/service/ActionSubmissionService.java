package com.fategmhelper.backend.service;

import com.fategmhelper.backend.domain.ActionSubmission;
import com.fategmhelper.backend.domain.Campaign;
import com.fategmhelper.backend.domain.Round;
import com.fategmhelper.backend.repository.ActionSubmissionRepository;
import com.fategmhelper.backend.web.dto.ActionSubmissionResponse;
import org.springframework.context.ApplicationEventPublisher;
import com.fategmhelper.backend.repository.CampaignRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ActionSubmissionService {

    private final ActionSubmissionRepository actionSubmissionRepository;
    private final CampaignRepository campaignRepository;
    private final RoundService roundService;
    private final ApplicationEventPublisher eventPublisher;

    @Transactional
    public ActionSubmission submitAction(Long campaignId,
                                         String servantClass,
                                         ActionSubmission.ActionType actionType,
                                         String content,
                                         String submittedBy) {
        Campaign campaign = campaignRepository.findById(campaignId)
                .orElseThrow(() -> new IllegalArgumentException("未找到对应战役：" + campaignId));

        // 获取或创建当前开放回合（如果当前没有开放回合，则自动开启下一回合）
        Round round = roundService.getOrCreateCurrentRound(campaign.getId());

        // 先把该回合下相同阶职 + 行动类型的旧记录标记为非 current
        actionSubmissionRepository.clearCurrentForSlot(round.getId(), servantClass, actionType);

        ActionSubmission submission = ActionSubmission.builder()
                .round(round)
                .campaign(campaign)
                .servantClass(servantClass)
                .actionType(actionType)
                .content(content)
                .submittedBy(submittedBy)
                .current(true)
                .roundNumber(round.getTurnNumber())
                .build();
        ActionSubmission saved = actionSubmissionRepository.save(submission);
        // publish SSE event for subscribers
        try {
            eventPublisher.publishEvent(ActionSubmissionResponse.fromEntity(saved));
        } catch (Exception ignored) {
            // Do not fail submit if publishing fails
        }
        return saved;
    }

    @Transactional(readOnly = true)
    public java.util.List<com.fategmhelper.backend.web.dto.ActionSubmissionResponse> listCurrentByCampaign(Long campaignId) {
        return actionSubmissionRepository.findByCampaignIdAndCurrentTrue(campaignId)
                .stream()
                .map(com.fategmhelper.backend.web.dto.ActionSubmissionResponse::fromEntity)
                .toList();
    }
}


