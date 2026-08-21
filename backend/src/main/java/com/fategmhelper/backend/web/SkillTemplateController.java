package com.fategmhelper.backend.web;

import com.fategmhelper.backend.service.SkillTemplateService;
import com.fategmhelper.backend.web.dto.SkillTemplateRequest;
import com.fategmhelper.backend.web.dto.SkillTemplateResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/skill-templates")
@RequiredArgsConstructor
public class SkillTemplateController {

    private final SkillTemplateService service;

    @PostMapping
    public ResponseEntity<SkillTemplateResponse> create(@Valid @RequestBody SkillTemplateRequest req) {
        return ResponseEntity.ok(service.create(req));
    }

    @GetMapping("/{id}")
    public ResponseEntity<SkillTemplateResponse> findById(@PathVariable Long id) {
        return ResponseEntity.ok(service.findById(id));
    }

    @GetMapping
    public ResponseEntity<Page<SkillTemplateResponse>> search(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String timing
    ) {
        return ResponseEntity.ok(service.search(keyword, timing, page, size));
    }

    @PutMapping("/{id}")
    public ResponseEntity<SkillTemplateResponse> update(
            @PathVariable Long id,
            @Valid @RequestBody SkillTemplateRequest req
    ) {
        return ResponseEntity.ok(service.update(id, req));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok().build();
    }
}
