package com.fategmhelper.backend.repository;

import com.fategmhelper.backend.domain.Campaign;
import com.fategmhelper.backend.domain.CharacterCard;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface CharacterCardRepository extends JpaRepository<CharacterCard, Long> {
    
    @Query("SELECT c FROM CharacterCard c WHERE " +
           "(:keyword IS NULL OR :keyword = '' OR " +
           "LOWER(c.code) LIKE LOWER(CONCAT('%', :keyword, '%')) OR " +
           "LOWER(c.className) LIKE LOWER(CONCAT('%', :keyword, '%'))) " +
           "AND (:campaignId IS NULL OR c.campaign.id = :campaignId OR c.campaign IS NULL)")
    Page<CharacterCard> searchByCodeOrClassName(
            @Param("keyword") String keyword,
            @Param("campaignId") Long campaignId,
            Pageable pageable);
    
    // 按战役ID查询（包含通用角色卡）
    @Query("SELECT c FROM CharacterCard c WHERE " +
           "(:campaignId IS NULL OR c.campaign.id = :campaignId OR c.campaign IS NULL)")
    Page<CharacterCard> findByCampaignIdOrUniversal(
            @Param("campaignId") Long campaignId,
            Pageable pageable);
    
    // 查询指定战役的所有角色卡
    @Query("SELECT c FROM CharacterCard c WHERE c.campaign.id = :campaignId")
    List<CharacterCard> findByCampaignId(@Param("campaignId") Long campaignId);
    
    // 批量更新：将指定战役的角色卡campaign设置为null
    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.transaction.annotation.Transactional
    @Query("UPDATE CharacterCard c SET c.campaign = NULL WHERE c.campaign.id = :campaignId")
    void clearCampaignFromCards(@Param("campaignId") Long campaignId);
}

