package com.fategmhelper.backend.web;

import com.fategmhelper.backend.domain.BattleSheet;
import com.fategmhelper.backend.service.BattleSheetService;
import com.fategmhelper.backend.web.dto.BattleSheetRequest;
import com.fategmhelper.backend.web.dto.BattleSheetResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/battle-sheets")
@RequiredArgsConstructor
public class BattleSheetController {

    private final BattleSheetService battleSheetService;

    @GetMapping
    public ResponseEntity<BattleSheetResponse> getOrCreate(
            @RequestParam Long campaignId,
            @RequestParam Long roundId) {
        BattleSheet sheet = battleSheetService.getOrCreate(campaignId, roundId);
        return ResponseEntity.ok(BattleSheetResponse.fromEntity(sheet));
    }

    @PutMapping("/{id}")
    public ResponseEntity<BattleSheetResponse> update(
            @PathVariable Long id,
            @RequestBody BattleSheetRequest req) {
        BattleSheet sheet = battleSheetService.update(id, req);
        return ResponseEntity.ok(BattleSheetResponse.fromEntity(sheet));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        battleSheetService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
