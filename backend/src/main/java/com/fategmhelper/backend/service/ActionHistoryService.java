package com.fategmhelper.backend.service;

import com.fategmhelper.backend.domain.ActionHistory;
import com.fategmhelper.backend.domain.Campaign;
import com.fategmhelper.backend.repository.ActionHistoryRepository;
import com.fategmhelper.backend.repository.CampaignRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ActionHistoryService {

    private final ActionHistoryRepository actionHistoryRepository;
    private final CampaignRepository campaignRepository;

    @Transactional
    public ActionHistory saveSnapshot(Long campaignId,
                                      Integer roundNumber,
                                      Instant closedAt,
                                      String actionOrderJson,
                                      String servantActionsJson,
                                      String masterActionsJson) {
        Campaign campaign = campaignRepository.findById(campaignId)
                .orElseThrow(() -> new IllegalArgumentException("未找到对应战役：" + campaignId));

        ActionHistory h = ActionHistory.builder()
                .campaign(campaign)
                .roundNumber(roundNumber)
                .closedAt(closedAt)
                .actionOrderJson(actionOrderJson)
                .servantActionsJson(servantActionsJson)
                .masterActionsJson(masterActionsJson)
                .build();
        return actionHistoryRepository.save(h);
    }

    @Transactional(readOnly = true)
    public List<ActionHistory> listByCampaign(Long campaignId) {
        return actionHistoryRepository.findByCampaignIdOrderByRoundNumberDesc(campaignId);
    }
}


