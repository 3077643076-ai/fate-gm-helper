package com.fategmhelper.backend.repository;

import com.fategmhelper.backend.domain.LeylineAssignment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface LeylineAssignmentRepository extends JpaRepository<LeylineAssignment, Long> {
    List<LeylineAssignment> findByCampaignId(Long campaignId);
    Optional<LeylineAssignment> findByCampaignIdAndCharacterCardId(Long campaignId, Long characterCardId);
    List<LeylineAssignment> findByLeylineId(Long leylineId);
    void deleteByCampaignIdAndCharacterCardId(Long campaignId, Long characterCardId);
    LeylineAssignment findByCharacterCardId(Long characterCardId);
    void deleteByCharacterCardId(Long characterCardId);
}


