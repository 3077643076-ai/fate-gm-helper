package com.fategmhelper.backend.web;

import com.fategmhelper.backend.service.CharacterCardService;
import com.fategmhelper.backend.web.dto.CharacterCardRequest;
import com.fategmhelper.backend.web.dto.CharacterCardResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/character-cards")
@RequiredArgsConstructor
public class CharacterCardController {

    private final CharacterCardService service;

    @PostMapping
    public ResponseEntity<CharacterCardResponse> create(@Valid @RequestBody CharacterCardRequest req) {
        return ResponseEntity.ok(service.create(req));
    }

    @GetMapping("/{id}")
    public ResponseEntity<CharacterCardResponse> findById(@PathVariable Long id) {
        return ResponseEntity.ok(service.findById(id));
    }

    @GetMapping
    public ResponseEntity<Page<CharacterCardResponse>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long campaignId
    ) {
        if (keyword != null && !keyword.trim().isEmpty()) {
            return ResponseEntity.ok(service.search(keyword.trim(), campaignId, page, size));
        }
        // 即使没有keyword，也要按campaignId过滤
        if (campaignId != null) {
            return ResponseEntity.ok(service.list(campaignId, page, size));
        }
        return ResponseEntity.ok(service.list(page, size));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok().build();
    }

    @PutMapping("/{id}/retire")
    public ResponseEntity<Void> retire(@PathVariable Long id) {
        service.retire(id);
        return ResponseEntity.ok().build();
    }

    @PutMapping("/{id}/unretire")
    public ResponseEntity<Void> unretire(@PathVariable Long id) {
        service.unretire(id);
        return ResponseEntity.ok().build();
    }
}

