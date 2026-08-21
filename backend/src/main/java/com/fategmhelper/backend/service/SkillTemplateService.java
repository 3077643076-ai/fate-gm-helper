package com.fategmhelper.backend.service;

import com.fategmhelper.backend.domain.SkillTemplate;
import com.fategmhelper.backend.repository.SkillTemplateRepository;
import com.fategmhelper.backend.web.dto.SkillTemplateRequest;
import com.fategmhelper.backend.web.dto.SkillTemplateResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SkillTemplateService {

    private final SkillTemplateRepository repository;

    @Transactional
    public SkillTemplateResponse create(SkillTemplateRequest req) {
        SkillTemplate template = SkillTemplate.builder().build();
        applyRequest(template, req);
        return SkillTemplateResponse.fromEntity(repository.save(template));
    }

    @Transactional(readOnly = true)
    public SkillTemplateResponse findById(Long id) {
        return repository.findById(id)
                .map(SkillTemplateResponse::fromEntity)
                .orElseThrow(() -> new IllegalArgumentException("未找到技能模板：" + id));
    }

    @Transactional(readOnly = true)
    public Page<SkillTemplateResponse> search(String keyword, String timing, int page, int size) {
        return repository.search(keyword, timing, PageRequest.of(page, size))
                .map(SkillTemplateResponse::fromEntity);
    }

    @Transactional
    public SkillTemplateResponse update(Long id, SkillTemplateRequest req) {
        SkillTemplate template = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("未找到技能模板：" + id));
        applyRequest(template, req);
        return SkillTemplateResponse.fromEntity(repository.save(template));
    }

    @Transactional
    public void delete(Long id) {
        if (!repository.existsById(id)) {
            throw new IllegalArgumentException("未找到技能模板：" + id);
        }
        repository.deleteById(id);
    }

    private void applyRequest(SkillTemplate template, SkillTemplateRequest req) {
        template.setName(req.getName());
        template.setRank(req.getRank());
        template.setSkillType(req.getSkillType());
        template.setTiming(req.getTiming());
        template.setPositionLimit(req.getPositionLimit());
        template.setManaCost(defaultZero(req.getManaCost()));
        template.setCooldown(defaultZero(req.getCooldown()));
        template.setStatModifiers(req.getStatModifiers());
        template.setWinRateModifier(defaultZero(req.getWinRateModifier()));
        template.setEnemyWinRateModifier(defaultZero(req.getEnemyWinRateModifier()));
        template.setStatusEffects(req.getStatusEffects());
        template.setRawText(req.getRawText());
        template.setNotes(req.getNotes());
    }

    private Integer defaultZero(Integer value) {
        return value == null ? 0 : value;
    }
}
