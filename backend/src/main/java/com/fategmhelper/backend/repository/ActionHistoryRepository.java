package com.fategmhelper.backend.repository;

import com.fategmhelper.backend.domain.ActionHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ActionHistoryRepository extends JpaRepository<ActionHistory, Long> {
    List<ActionHistory> findByCampaignIdOrderByRoundNumberDesc(Long campaignId);
}


