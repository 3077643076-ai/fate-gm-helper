package com.fategmhelper.backend.service;

import com.fategmhelper.backend.domain.BattleSheet;
import com.fategmhelper.backend.domain.Campaign;
import com.fategmhelper.backend.domain.Round;
import com.fategmhelper.backend.repository.BattleSheetRepository;
import com.fategmhelper.backend.repository.CampaignRepository;
import com.fategmhelper.backend.repository.RoundRepository;
import com.fategmhelper.backend.web.dto.BattleSheetRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class BattleSheetService {

    private final BattleSheetRepository battleSheetRepository;
    private final CampaignRepository campaignRepository;
    private final RoundRepository roundRepository;

    @Transactional(readOnly = true)
    public Optional<BattleSheet> findByCampaignAndRound(Long campaignId, Long roundId) {
        return battleSheetRepository.findTopByCampaignIdAndRoundId(campaignId, roundId);
    }

    @Transactional
    public BattleSheet getOrCreate(Long campaignId, Long roundId) {
        return battleSheetRepository.findTopByCampaignIdAndRoundId(campaignId, roundId)
                .orElseGet(() -> createEmpty(campaignId, roundId));
    }

    @Transactional
    public BattleSheet createEmpty(Long campaignId, Long roundId) {
        Campaign campaign = campaignRepository.findById(campaignId)
                .orElseThrow(() -> new IllegalArgumentException("未找到对应战役：" + campaignId));
        Round round = roundRepository.findById(roundId)
                .orElseThrow(() -> new IllegalArgumentException("未找到对应回合：" + roundId));

        BattleSheet sheet = BattleSheet.builder()
                .campaign(campaign)
                .round(round)
                .build();
        return battleSheetRepository.save(sheet);
    }

    @Transactional
    public BattleSheet update(Long id, BattleSheetRequest req) {
        BattleSheet sheet = battleSheetRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("未找到战斗表：" + id));

        if (req.getBluePositions() != null) sheet.setBluePositions(req.getBluePositions());
        if (req.getYellowPositions() != null) sheet.setYellowPositions(req.getYellowPositions());
        if (req.getActivatedSkills() != null) sheet.setActivatedSkills(req.getActivatedSkills());
        if (req.getBattlefieldWidth() != null) sheet.setBattlefieldWidth(req.getBattlefieldWidth());
        if (req.getBlueTactic() != null) sheet.setBlueTactic(req.getBlueTactic().isBlank() ? null : req.getBlueTactic());
        if (req.getYellowTactic() != null) sheet.setYellowTactic(req.getYellowTactic().isBlank() ? null : req.getYellowTactic());
        if (req.getBluePreBattleBonus() != null) sheet.setBluePreBattleBonus(req.getBluePreBattleBonus());
        if (req.getBluePreBattlePenalty() != null) sheet.setBluePreBattlePenalty(req.getBluePreBattlePenalty());
        if (req.getYellowPreBattleBonus() != null) sheet.setYellowPreBattleBonus(req.getYellowPreBattleBonus());
        if (req.getYellowPreBattlePenalty() != null) sheet.setYellowPreBattlePenalty(req.getYellowPreBattlePenalty());
        if (req.getManaData() != null) sheet.setManaData(req.getManaData());
        if (req.getGroupAStats() != null) sheet.setGroupAStats(req.getGroupAStats());
        if (req.getGroupBStats() != null) sheet.setGroupBStats(req.getGroupBStats());
        if (req.getWinRateResult() != null) sheet.setWinRateResult(req.getWinRateResult());
        if (req.getSettlementConfirmed() != null) {
            sheet.setSettlementConfirmed(req.getSettlementConfirmed());
            sheet.setConfirmedAt(req.getSettlementConfirmed() ? Instant.now() : null);
        }

        return battleSheetRepository.save(sheet);
    }

    @Transactional
    public void delete(Long id) {
        if (!battleSheetRepository.existsById(id)) {
            throw new IllegalArgumentException("未找到战斗表：" + id);
        }
        battleSheetRepository.deleteById(id);
    }
}
