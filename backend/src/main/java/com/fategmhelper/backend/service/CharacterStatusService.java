package com.fategmhelper.backend.service;

import com.fategmhelper.backend.domain.Campaign;
import com.fategmhelper.backend.domain.CharacterCard;
import com.fategmhelper.backend.domain.CharacterStatus;
import com.fategmhelper.backend.domain.StatusEffect;
import com.fategmhelper.backend.repository.CampaignRepository;
import com.fategmhelper.backend.repository.CharacterCardRepository;
import com.fategmhelper.backend.repository.CharacterStatusRepository;
import com.fategmhelper.backend.web.dto.CharacterStatusRequest;
import com.fategmhelper.backend.web.dto.CharacterStatusResponse;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class CharacterStatusService {

    private final CharacterStatusRepository statusRepository;
    private final CharacterCardRepository characterCardRepository;
    private final CampaignRepository campaignRepository;
    private final ObjectMapper objectMapper;

    @Transactional
    public CharacterStatusResponse updateOrCreate(CharacterStatusRequest req) {
        // 数据验证
        if (req.getCharacterCardId() == null) {
            throw new IllegalArgumentException("角色卡ID不能为空");
        }
        if (req.getCampaignId() == null) {
            throw new IllegalArgumentException("战役ID不能为空");
        }
        if (req.getRoundNumber() == null || req.getRoundNumber() < 1) {
            throw new IllegalArgumentException("回合数必须大于0");
        }

        Campaign campaign = campaignRepository.findById(req.getCampaignId())
                .orElseThrow(() -> new IllegalArgumentException("未找到对应战役：" + req.getCampaignId()));

        CharacterCard characterCard = characterCardRepository.findById(req.getCharacterCardId())
                .orElseThrow(() -> new IllegalArgumentException("未找到对应角色卡：" + req.getCharacterCardId()));

        // 验证角色卡是否属于该战役
        if (characterCard.getCampaign() != null && !characterCard.getCampaign().getId().equals(req.getCampaignId())) {
            throw new IllegalArgumentException("角色卡不属于指定的战役");
        }

        // 查找现有状态记录
        Optional<CharacterStatus> existingStatus = statusRepository
                .findByCharacterCardIdAndCampaignIdAndRoundNumber(
                        req.getCharacterCardId(),
                        req.getCampaignId(),
                        req.getRoundNumber());

        CharacterStatus status;
        if (existingStatus.isPresent()) {
            // 更新现有记录
            status = existingStatus.get();
            updateStatusFromRequest(status, req);
        } else {
            // 创建新记录
            status = CharacterStatus.builder()
                    .characterCard(characterCard)
                    .campaign(campaign)
                    .roundNumber(req.getRoundNumber())
                    .build();
            updateStatusFromRequest(status, req);
        }

        CharacterStatus saved = statusRepository.save(status);
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public CharacterStatusResponse findByCharacterCardAndCampaignAndRound(Long characterCardId, Long campaignId, Integer roundNumber) {
        CharacterStatus status = statusRepository
                .findByCharacterCardIdAndCampaignIdAndRoundNumber(characterCardId, campaignId, roundNumber)
                .orElseThrow(() -> new IllegalArgumentException("未找到角色状态记录"));
        return toResponse(status);
    }

    @Transactional(readOnly = true)
    public List<CharacterStatusResponse> findByCampaignAndRound(Long campaignId, Integer roundNumber) {
        return statusRepository.findByCampaignIdAndRoundNumber(campaignId, roundNumber)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<CharacterStatusResponse> findByCharacterCardAndCampaign(Long characterCardId, Long campaignId) {
        return statusRepository.findByCharacterCardIdAndCampaignId(characterCardId, campaignId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    private void updateStatusFromRequest(CharacterStatus status, CharacterStatusRequest req) {
        if (req.getCurrentMana() != null) {
            status.setCurrentMana(req.getCurrentMana());
        }
        if (req.getManaLimit() != null) {
            status.setManaLimit(req.getManaLimit());
        }
        if (req.getCurrentCommandSeals() != null) {
            status.setCurrentCommandSeals(req.getCurrentCommandSeals());
        }
        if (req.getStatusEffects() != null) {
            status.setStatusEffects(req.getStatusEffects());
        }
        if (req.getStatusEffectsList() != null) {
            try {
                status.setStatusEffectsList(objectMapper.writeValueAsString(req.getStatusEffectsList()));
            } catch (Exception e) {
                // 记录错误但不中断操作
                System.err.println("序列化异常状态列表失败: " + e.getMessage());
            }
        }
        if (req.getNotes() != null) {
            status.setNotes(req.getNotes());
        }
    }

    private CharacterStatusResponse toResponse(CharacterStatus status) {
        List<StatusEffect> statusEffectsList = null;
        if (status.getStatusEffectsList() != null && !status.getStatusEffectsList().trim().isEmpty()) {
            try {
                statusEffectsList = objectMapper.readValue(status.getStatusEffectsList(),
                    new TypeReference<List<StatusEffect>>() {});
            } catch (Exception e) {
                // 记录错误但不中断操作
                System.err.println("反序列化异常状态列表失败: " + e.getMessage());
            }
        }

        return CharacterStatusResponse.builder()
                .id(status.getId())
                .characterCardId(status.getCharacterCard().getId())
                .characterCardCode(status.getCharacterCard().getCode())
                .characterCardClassName(status.getCharacterCard().getClassName())
                .campaignId(status.getCampaign().getId())
                .roundNumber(status.getRoundNumber())
                .currentMana(status.getCurrentMana())
                .manaLimit(status.getManaLimit())
                .currentCommandSeals(status.getCurrentCommandSeals())
                .statusEffects(status.getStatusEffects())
                .statusEffectsList(statusEffectsList)
                .notes(status.getNotes())
                .createdAt(status.getCreatedAt())
                .updatedAt(status.getUpdatedAt())
                .build();
    }
}
