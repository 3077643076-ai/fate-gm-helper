package com.fategmhelper.backend.repository;

import com.fategmhelper.backend.domain.Campaign;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CampaignRepository extends JpaRepository<Campaign, Long> {
}

