package com.fategmhelper.backend.web;

import com.fategmhelper.backend.service.LeylineService;
import com.fategmhelper.backend.web.dto.LeylineRequest;
import com.fategmhelper.backend.web.dto.LeylineResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/leylines")
@RequiredArgsConstructor
public class LeylineController {

    private final LeylineService service;
    private final com.fategmhelper.backend.repository.LeylineRepository leylineRepository;
    private static final com.fasterxml.jackson.databind.ObjectMapper MAPPER = new com.fasterxml.jackson.databind.ObjectMapper();

    @GetMapping
    public ResponseEntity<Object> list(@RequestParam Long campaignId) {
        // Build response manually to ensure assignedCharacterIds is present
        List<com.fategmhelper.backend.domain.Leyline> leys = leylineRepository.findByCampaignIdOrderByIdAsc(campaignId);
        List<java.util.Map<String, Object>> out = leys.stream().map(ley -> {
            java.util.Map<String, Object> m = new java.util.HashMap<>();
            m.put("id", ley.getId());
            m.put("campaignId", ley.getCampaign() != null ? ley.getCampaign().getId() : null);
            m.put("name", ley.getName());
            m.put("effect", ley.getEffect());
            m.put("description", ley.getDescription());
            m.put("manaAmount", ley.getManaAmount());
            m.put("battlefieldWidth", ley.getBattlefieldWidth());
            m.put("populationFlow", ley.getPopulationFlow());
            java.util.List<Long> assigned = java.util.Collections.emptyList();
            try {
                if (ley.getAssignedCharacterIdsJson() != null && !ley.getAssignedCharacterIdsJson().trim().isEmpty()) {
                    assigned = MAPPER.readValue(ley.getAssignedCharacterIdsJson(), new com.fasterxml.jackson.core.type.TypeReference<java.util.List<Long>>() {});
                }
            } catch (Exception ignore) {
                assigned = java.util.Collections.emptyList();
            }
            m.put("assignedCharacterIds", assigned);
            return m;
        }).toList();
        return ResponseEntity.ok(out);
    }

    @PostMapping
    public ResponseEntity<LeylineResponse> create(@Valid @RequestBody LeylineRequest req) {
        return ResponseEntity.ok(service.create(req));
    }

    @PutMapping("/{id}")
    public ResponseEntity<LeylineResponse> update(@PathVariable Long id,
                                                  @Valid @RequestBody LeylineRequest req) {
        return ResponseEntity.ok(service.update(id, req));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok().build();
    }
}


