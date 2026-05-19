package com.fategmhelper.backend.repository;

import com.fategmhelper.backend.domain.ActionSubmission;
import com.fategmhelper.backend.domain.ActionSubmission.ActionType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ActionSubmissionRepository extends JpaRepository<ActionSubmission, Long> {

    @Modifying
    @Query("""
            update ActionSubmission a
               set a.current = false
             where a.round.id = :roundId
               and a.servantClass = :servantClass
               and a.actionType = :actionType
               and a.current = true
            """)
    int clearCurrentForSlot(@Param("roundId") Long roundId,
                            @Param("servantClass") String servantClass,
                            @Param("actionType") ActionType actionType);

    java.util.List<ActionSubmission> findByCampaignIdAndCurrentTrue(Long campaignId);
}


