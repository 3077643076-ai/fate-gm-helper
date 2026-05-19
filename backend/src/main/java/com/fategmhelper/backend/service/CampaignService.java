package com.fategmhelper.backend.service;

import com.fategmhelper.backend.domain.Campaign;
import com.fategmhelper.backend.domain.CharacterCard;
import com.fategmhelper.backend.repository.CampaignRepository;
import com.fategmhelper.backend.repository.CharacterCardRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class CampaignService {

    private final CampaignRepository repository;
    private final CharacterCardRepository characterCardRepository;

    @Transactional(readOnly = true)
    public List<Campaign> findAll() {
        return repository.findAll();
    }

    @Transactional(readOnly = true)
    public Campaign findById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Campaign not found: " + id));
    }

    @Transactional
    public Campaign create(String name, String description) {
        Campaign campaign = Campaign.builder()
                .name(name)
                .description(description)
                .build();
        return repository.save(campaign);
    }

    @Transactional
    public void delete(Long id) {
        Campaign campaign = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Campaign not found: " + id));
        
        // 将关联的角色卡的campaign_id设置为null（变成通用角色卡）
        characterCardRepository.clearCampaignFromCards(id);
        
        // 删除战役
        repository.delete(campaign);
    }
}

