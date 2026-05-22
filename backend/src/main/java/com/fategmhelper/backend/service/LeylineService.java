package com.fategmhelper.backend.service;

import com.fategmhelper.backend.domain.Campaign;
import com.fategmhelper.backend.domain.CharacterCard;
import com.fategmhelper.backend.domain.Leyline;
import com.fategmhelper.backend.repository.CampaignRepository;
import com.fategmhelper.backend.repository.CharacterCardRepository;
import com.fategmhelper.backend.repository.LeylineRepository;
import com.fategmhelper.backend.web.dto.LeylineRequest;
import com.fategmhelper.backend.web.dto.LeylineResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
public class LeylineService {

    private final LeylineRepository repository;
    private final CampaignRepository campaignRepository;
    private final CharacterCardRepository characterCardRepository;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Transactional(readOnly = true)
    public List<LeylineResponse> listByCampaign(Long campaignId) {
        return repository.findByCampaignIdOrderByIdAsc(campaignId)
                .stream()
                .map(LeylineResponse::fromEntity)
                .toList();
    }

    /** 解析灵脉大小：优先用请求值，否则按魔力量自动推断 */
    private Leyline.LeylineSize resolveSize(LeylineRequest req) {
        if (req.getSize() != null && !req.getSize().isBlank()) {
            try {
                return Leyline.LeylineSize.valueOf(req.getSize().trim().toUpperCase());
            } catch (IllegalArgumentException ignore) {
                // fall through to infer
            }
        }
        return Leyline.LeylineSize.inferFromMana(req.getManaAmount() != null ? req.getManaAmount() : 0);
    }

    /** 解析灵脉所有者 */
    private CharacterCard resolveOwner(Long ownerCharacterId) {
        if (ownerCharacterId == null) return null;
        return characterCardRepository.findById(ownerCharacterId).orElse(null);
    }

    @Transactional
    public LeylineResponse create(LeylineRequest req) {
        Campaign campaign = campaignRepository.findById(req.getCampaignId())
                .orElseThrow(() -> new IllegalArgumentException("Campaign not found: " + req.getCampaignId()));
        Leyline entity = Leyline.builder()
                .campaign(campaign)
                .name(req.getName())
                .manaAmount(req.getManaAmount())
                .battlefieldWidth(req.getBattlefieldWidth())
                .populationFlow(req.getPopulationFlow())
                .size(resolveSize(req))
                .owner(resolveOwner(req.getOwnerCharacterId()))
                .effect(req.getEffect())
                .description(req.getDescription())
                .build();
        try {
            if (req.getAssignedCharacterIds() != null) {
                entity.setAssignedCharacterIdsJson(MAPPER.writeValueAsString(req.getAssignedCharacterIds()));
            }
        } catch (Exception e) {
            // ignore serialization errors for testing
        }
        return LeylineResponse.fromEntity(repository.save(entity));
    }

    @Transactional
    public LeylineResponse update(Long id, LeylineRequest req) {
        Leyline entity = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Leyline not found: " + id));
        entity.setName(req.getName());
        entity.setManaAmount(req.getManaAmount());
        entity.setBattlefieldWidth(req.getBattlefieldWidth());
        entity.setPopulationFlow(req.getPopulationFlow());
        entity.setSize(resolveSize(req));
        entity.setOwner(resolveOwner(req.getOwnerCharacterId()));
        entity.setEffect(req.getEffect());
        entity.setDescription(req.getDescription());
        try {
            if (req.getAssignedCharacterIds() != null) {
                entity.setAssignedCharacterIdsJson(MAPPER.writeValueAsString(req.getAssignedCharacterIds()));
            }
        } catch (Exception e) {
            // ignore
        }
        return LeylineResponse.fromEntity(repository.save(entity));
    }

    @Transactional
    public void delete(Long id) {
        if (!repository.existsById(id)) {
            throw new IllegalArgumentException("Leyline not found: " + id);
        }
        repository.deleteById(id);
    }
}


