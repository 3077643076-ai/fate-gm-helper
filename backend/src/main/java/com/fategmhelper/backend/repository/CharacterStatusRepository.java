package com.fategmhelper.backend.repository;

import com.fategmhelper.backend.domain.CharacterStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface CharacterStatusRepository extends JpaRepository<CharacterStatus, Long> {

    // 根据角色卡、战役和回合号查找状态
    Optional<CharacterStatus> findByCharacterCardIdAndCampaignIdAndRoundNumber(
            Long characterCardId, Long campaignId, Integer roundNumber);

    // 获取指定战役和回合的所有角色状态
    @Query("SELECT cs FROM CharacterStatus cs WHERE cs.campaign.id = :campaignId AND cs.roundNumber = :roundNumber")
    List<CharacterStatus> findByCampaignIdAndRoundNumber(
            @Param("campaignId") Long campaignId, @Param("roundNumber") Integer roundNumber);

    // 获取指定战役的所有角色状态（按回合降序）
    @Query("SELECT cs FROM CharacterStatus cs WHERE cs.campaign.id = :campaignId ORDER BY cs.roundNumber DESC, cs.updatedAt DESC")
    List<CharacterStatus> findByCampaignIdOrderByRoundDesc(@Param("campaignId") Long campaignId);

    // 获取指定角色卡在指定战役的所有状态记录
    @Query("SELECT cs FROM CharacterStatus cs WHERE cs.characterCard.id = :characterCardId AND cs.campaign.id = :campaignId ORDER BY cs.roundNumber DESC")
    List<CharacterStatus> findByCharacterCardIdAndCampaignId(
            @Param("characterCardId") Long characterCardId, @Param("campaignId") Long campaignId);
}
