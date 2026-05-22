package com.fategmhelper.backend.service;

import com.fategmhelper.backend.domain.Campaign;
import com.fategmhelper.backend.domain.Round;
import com.fategmhelper.backend.domain.Round.Status;
import com.fategmhelper.backend.repository.CampaignRepository;
import com.fategmhelper.backend.repository.RoundRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class RoundService {

    private final RoundRepository roundRepository;
    private final CampaignRepository campaignRepository;

    @Transactional(readOnly = true)
    public Optional<Round> findCurrentOpenRound(Long campaignId) {
        return roundRepository.findTopByCampaignIdAndStatusOrderByTurnNumberDesc(campaignId, Status.OPEN);
    }

    @Transactional
    public Round getOrCreateCurrentRound(Long campaignId) {
        return findCurrentOpenRound(campaignId)
                .orElseGet(() -> createNextRound(campaignId));
    }

    @Transactional
    public Round closeCurrentRound(Long campaignId) {
        Round round = findCurrentOpenRound(campaignId)
                .orElseThrow(() -> new IllegalStateException("当前战役没有处于开放状态的回合"));
        round.setStatus(Status.CLOSED);
        round.setClosedAt(Instant.now());
        return roundRepository.save(round);
    }

    @Transactional
    public Round createNextRound(Long campaignId) {
        Campaign campaign = campaignRepository.findById(campaignId)
                .orElseThrow(() -> new IllegalArgumentException("未找到对应战役：" + campaignId));

        int nextTurn = roundRepository.findTopByCampaignIdOrderByTurnNumberDesc(campaignId)
                .map(Round::getTurnNumber)
                .map(t -> t + 1)
                .orElse(1);

        // 自动计算昼夜：第1回合（降临日）无昼夜，之后奇数turn为昼、偶数turn为夜
        // turnNumber=2 → 第1日昼 → DAY, turnNumber=3 → 第1日夜 → NIGHT, ...
        Round.DayOrNight dayOrNight = null;
        if (nextTurn >= 2) {
            dayOrNight = ((nextTurn - 2) % 2 == 0) ? Round.DayOrNight.DAY : Round.DayOrNight.NIGHT;
        }

        Round round = Round.builder()
                .campaign(campaign)
                .turnNumber(nextTurn)
                .status(Status.OPEN)
                .dayOrNight(dayOrNight)
                .build();

        return roundRepository.save(round);
    }
}


