package com.fategmhelper.backend.service;

import com.fategmhelper.backend.domain.Campaign;
import com.fategmhelper.backend.domain.CharacterCard;
import com.fategmhelper.backend.domain.SkillItem;
import com.fategmhelper.backend.domain.Stats;
import com.fategmhelper.backend.repository.CampaignRepository;
import com.fategmhelper.backend.repository.CharacterCardRepository;
import com.fategmhelper.backend.web.dto.CharacterCardRequest;
import com.fategmhelper.backend.web.dto.CharacterCardResponse;
import com.fategmhelper.backend.web.dto.SkillItemDto;
import com.fategmhelper.backend.web.dto.StatsDto;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class CharacterCardService {

    private final CharacterCardRepository repository;
    private final CampaignRepository campaignRepository;

    @Transactional
    public CharacterCardResponse create(CharacterCardRequest req) {
        Campaign campaign = null;
        if (req.getCampaignId() != null) {
            campaign = campaignRepository.findById(req.getCampaignId())
                    .orElseThrow(() -> new IllegalArgumentException("Campaign not found: " + req.getCampaignId()));
        }

        CharacterCard entity = CharacterCard.builder()
                .code(req.getCode())
                .className(req.getClassName())
                .rawText(req.getRawText())
                .cardType(req.getCardType())
                .campaign(campaign)
                .totalStats(toStats(req.getTotalStats()))
                .baseStats(toStats(req.getBaseStats()))
                .correctionStats(toStats(req.getCorrectionStats()))
                .classSkills(toSkillItems(req.getClassSkills()))
                .personalSkills(toSkillItems(req.getPersonalSkills()))
                .noblePhantasms(toSkillItems(req.getNoblePhantasms()))
                .workshops(toSkillItems(req.getWorkshops()))
                .craftEssences(toSkillItems(req.getCraftEssences()))
                .build();

        CharacterCard saved = repository.save(entity);
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public CharacterCardResponse findById(Long id) {
        return repository.findById(id)
                .map(this::toResponse)
                .orElseThrow(() -> new IllegalArgumentException("Character card not found: " + id));
    }

    @Transactional(readOnly = true)
    public Page<CharacterCardResponse> list(int page, int size) {
        return repository.findAll(PageRequest.of(page, size)).map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public Page<CharacterCardResponse> list(Long campaignId, int page, int size) {
        if (campaignId == null) {
            return list(page, size);
        }
        return repository.findByCampaignIdOrUniversal(campaignId, PageRequest.of(page, size))
                .map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public Page<CharacterCardResponse> search(String keyword, Long campaignId, int page, int size) {
        return repository.searchByCodeOrClassName(keyword, campaignId, PageRequest.of(page, size))
                .map(this::toResponse);
    }

    @Transactional
    public void delete(Long id) {
        if (!repository.existsById(id)) {
            throw new IllegalArgumentException("Character card not found: " + id);
        }
        repository.deleteById(id);
    }

    @Transactional
    public void retire(Long id) {
        CharacterCard c = repository.findById(id).orElseThrow(() -> new IllegalArgumentException("Character card not found: " + id));
        c.setRetired(true);
        repository.save(c);
    }

    @Transactional
    public void unretire(Long id) {
        CharacterCard c = repository.findById(id).orElseThrow(() -> new IllegalArgumentException("Character card not found: " + id));
        c.setRetired(false);
        repository.save(c);
    }

    private Stats toStats(StatsDto dto) {
        if (dto == null) return null;
        return Stats.builder()
                .level(dto.getLevel())
                .strength(dto.getStrength())
                .endurance(dto.getEndurance())
                .agility(dto.getAgility())
                .mana(dto.getMana())
                .luck(dto.getLuck())
                .noblePhantasm(dto.getNoblePhantasm())
                .build();
    }

    private StatsDto toStatsDto(Stats stats) {
        if (stats == null) return null;
        StatsDto dto = new StatsDto();
        dto.setLevel(stats.getLevel());
        dto.setStrength(stats.getStrength());
        dto.setEndurance(stats.getEndurance());
        dto.setAgility(stats.getAgility());
        dto.setMana(stats.getMana());
        dto.setLuck(stats.getLuck());
        dto.setNoblePhantasm(stats.getNoblePhantasm());
        return dto;
    }

    private List<SkillItem> toSkillItems(List<SkillItemDto> dtos) {
        if (dtos == null) return null;
        return dtos.stream()
                .map(d -> new SkillItem(d.getName(), d.getRank(), d.getDesc()))
                .toList();
        }

    private List<SkillItemDto> toSkillDtos(List<SkillItem> items) {
        if (items == null) return null;
        return items.stream().map(i -> {
            SkillItemDto dto = new SkillItemDto();
            dto.setName(i.getName());
            dto.setRank(i.getRank());
            dto.setDesc(i.getDesc());
            return dto;
        }).toList();
    }

    private CharacterCardResponse toResponse(CharacterCard entity) {
        return CharacterCardResponse.builder()
                .id(entity.getId())
                .code(entity.getCode())
                .className(entity.getClassName())
                .rawText(entity.getRawText())
                .cardType(entity.getCardType())
                .campaignId(entity.getCampaign() != null ? entity.getCampaign().getId() : null)
                .campaignName(entity.getCampaign() != null ? entity.getCampaign().getName() : null)
                .createdAt(entity.getCreatedAt())
                .totalStats(toStatsDto(entity.getTotalStats()))
                .baseStats(toStatsDto(entity.getBaseStats()))
                .correctionStats(toStatsDto(entity.getCorrectionStats()))
                .classSkills(toSkillDtos(entity.getClassSkills()))
                .personalSkills(toSkillDtos(entity.getPersonalSkills()))
                .noblePhantasms(toSkillDtos(entity.getNoblePhantasms()))
                .workshops(toSkillDtos(entity.getWorkshops()))
                .craftEssences(toSkillDtos(entity.getCraftEssences()))
                .retired(entity.isRetired())
                .build();
    }
}

