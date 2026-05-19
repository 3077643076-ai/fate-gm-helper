package com.fategmhelper.backend.repository;

import com.fategmhelper.backend.domain.Round;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface RoundRepository extends JpaRepository<Round, Long> {

    Optional<Round> findTopByCampaignIdAndStatusOrderByTurnNumberDesc(Long campaignId, Round.Status status);

    Optional<Round> findTopByCampaignIdOrderByTurnNumberDesc(Long campaignId);
}


