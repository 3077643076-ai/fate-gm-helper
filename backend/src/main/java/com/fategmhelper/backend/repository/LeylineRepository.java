package com.fategmhelper.backend.repository;

import com.fategmhelper.backend.domain.Leyline;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LeylineRepository extends JpaRepository<Leyline, Long> {

    List<Leyline> findByCampaignIdOrderByIdAsc(Long campaignId);
}


