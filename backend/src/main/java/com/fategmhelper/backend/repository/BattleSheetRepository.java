package com.fategmhelper.backend.repository;

import com.fategmhelper.backend.domain.BattleSheet;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface BattleSheetRepository extends JpaRepository<BattleSheet, Long> {

    Optional<BattleSheet> findTopByCampaignIdAndRoundId(Long campaignId, Long roundId);
}
