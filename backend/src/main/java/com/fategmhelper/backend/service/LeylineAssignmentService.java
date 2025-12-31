package com.fategmhelper.backend.service;

import com.fategmhelper.backend.domain.Campaign;
import com.fategmhelper.backend.domain.CharacterCard;
import com.fategmhelper.backend.domain.Leyline;
import com.fategmhelper.backend.domain.LeylineAssignment;
import com.fategmhelper.backend.repository.CampaignRepository;
import com.fategmhelper.backend.repository.CharacterCardRepository;
import com.fategmhelper.backend.repository.LeylineAssignmentRepository;
import com.fategmhelper.backend.repository.LeylineRepository;
import com.fategmhelper.backend.web.dto.LeylineAssignmentRequest;
import com.fategmhelper.backend.web.dto.LeylineAssignmentResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;

@Service
@RequiredArgsConstructor
public class LeylineAssignmentService {
    private final LeylineAssignmentRepository repository;
    private final CampaignRepository campaignRepository;
    private final LeylineRepository leylineRepository;
    private final CharacterCardRepository characterCardRepository;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Transactional(readOnly = true)
    public List<LeylineAssignmentResponse> listByCampaign(Long campaignId) {
        return repository.findByCampaignId(campaignId).stream()
                .map(LeylineAssignmentResponse::fromEntity)
                .collect(Collectors.toList());
    }

    /**
     * Assign a character to a leyline within a campaign.
     * If req.getLeylineId() == null, this will remove any existing assignment for the character in the campaign.
     */
    @Transactional
    public LeylineAssignmentResponse assign(LeylineAssignmentRequest req) {
        Campaign campaign = campaignRepository.findById(req.getCampaignId())
                .orElseThrow(() -> new IllegalArgumentException("Campaign not found: " + req.getCampaignId()));
        CharacterCard card = characterCardRepository.findById(req.getCharacterCardId())
                .orElseThrow(() -> new IllegalArgumentException("CharacterCard not found: " + req.getCharacterCardId()));

        if (req.getLeylineId() == null) {
            repository.deleteByCampaignIdAndCharacterCardId(campaign.getId(), card.getId());
            return null;
        }

        Leyline ley = leylineRepository.findById(req.getLeylineId())
                .orElseThrow(() -> new IllegalArgumentException("Leyline not found: " + req.getLeylineId()));

        // remove existing assignment for this character in this campaign
        repository.deleteByCampaignIdAndCharacterCardId(campaign.getId(), card.getId());

        LeylineAssignment entity = LeylineAssignment.builder()
                .campaign(campaign)
                .leyline(ley)
                .characterCard(card)
                .build();
        return LeylineAssignmentResponse.fromEntity(repository.save(entity));
    }

    /**
     * Replace all assignments in a campaign with the provided items.
     */
    @Transactional
    public void assignBulk(Long campaignId, List<LeylineAssignmentRequest.AssignmentItem> items) {
        Campaign campaign = campaignRepository.findById(campaignId)
                .orElseThrow(() -> new IllegalArgumentException("Campaign not found: " + campaignId));

        if (items == null || items.isEmpty()) {
            return;
        }

        // Load all leylines for this campaign into memory for efficient updates
        List<Leyline> leylines = leylineRepository.findByCampaignIdOrderByIdAsc(campaignId);

        for (LeylineAssignmentRequest.AssignmentItem it : items) {
            if (it.getCharacterCardId() == null) continue;
            final Long charId = it.getCharacterCardId();

            // validate character exists (optional)
            characterCardRepository.findById(charId)
                    .orElseThrow(() -> new IllegalArgumentException("CharacterCard not found: " + charId));

            if (it.getLeylineId() == null) {
                // remove this character from any leyline in this campaign
                for (Leyline l : leylines) {
                    try {
                        java.util.List<Long> assigned = l.getAssignedCharacterIdsJson() == null || l.getAssignedCharacterIdsJson().trim().isEmpty()
                                ? new java.util.ArrayList<>()
                                : MAPPER.readValue(l.getAssignedCharacterIdsJson(), new TypeReference<java.util.List<Long>>() {});
                        if (assigned.remove(charId)) {
                            l.setAssignedCharacterIdsJson(MAPPER.writeValueAsString(assigned));
                            leylineRepository.save(l);
                        }
                    } catch (Exception e) {
                        // ignore parse errors and continue
                    }
                }
                continue;
            }

            // assign to specific leyline: add charId into that leyline's assigned list if not present
            Leyline target = leylines.stream().filter(x -> x.getId().equals(it.getLeylineId())).findFirst().orElse(null);
            if (target == null) {
                target = leylineRepository.findById(it.getLeylineId())
                        .orElseThrow(() -> new IllegalArgumentException("Leyline not found: " + it.getLeylineId()));
                // ensure belongs to campaign
                if (target.getCampaign() == null || !target.getCampaign().getId().equals(campaignId)) {
                    throw new IllegalArgumentException("Leyline does not belong to campaign: " + it.getLeylineId());
                }
                leylines.add(target);
            }
            try {
                java.util.List<Long> assigned = target.getAssignedCharacterIdsJson() == null || target.getAssignedCharacterIdsJson().trim().isEmpty()
                        ? new java.util.ArrayList<>()
                        : MAPPER.readValue(target.getAssignedCharacterIdsJson(), new TypeReference<java.util.List<Long>>() {});
                if (!assigned.contains(charId)) {
                    assigned.add(charId);
                    target.setAssignedCharacterIdsJson(MAPPER.writeValueAsString(assigned));
                    leylineRepository.save(target);
                }
            } catch (Exception e) {
                // ignore
            }
        }
    }
}


