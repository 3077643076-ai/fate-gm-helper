package com.fategmhelper.backend.web;

import com.fategmhelper.backend.service.CharacterStatusService;
import com.fategmhelper.backend.web.dto.CharacterStatusRequest;
import com.fategmhelper.backend.web.dto.CharacterStatusResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/character-status")
@RequiredArgsConstructor
public class CharacterStatusController {

    private final CharacterStatusService service;

    /**
     * 更新或创建角色状态
     */
    @PostMapping
    public ResponseEntity<CharacterStatusResponse> updateOrCreate(@Valid @RequestBody CharacterStatusRequest req) {
        CharacterStatusResponse response = service.updateOrCreate(req);
        return ResponseEntity.ok(response);
    }

    /**
     * 获取指定角色卡在指定战役和回合的状态
     */
    @GetMapping("/single")
    public ResponseEntity<CharacterStatusResponse> getByCharacterCardAndCampaignAndRound(
            @RequestParam Long characterCardId,
            @RequestParam Long campaignId,
            @RequestParam Integer roundNumber) {
        CharacterStatusResponse response = service.findByCharacterCardAndCampaignAndRound(characterCardId, campaignId, roundNumber);
        return ResponseEntity.ok(response);
    }

    /**
     * 获取指定战役和回合的所有角色状态
     */
    @GetMapping("/campaign-round")
    public ResponseEntity<List<CharacterStatusResponse>> getByCampaignAndRound(
            @RequestParam Long campaignId,
            @RequestParam Integer roundNumber) {
        List<CharacterStatusResponse> responses = service.findByCampaignAndRound(campaignId, roundNumber);
        return ResponseEntity.ok(responses);
    }

    /**
     * 获取指定角色卡在指定战役的所有状态记录
     */
    @GetMapping("/character-campaign")
    public ResponseEntity<List<CharacterStatusResponse>> getByCharacterCardAndCampaign(
            @RequestParam Long characterCardId,
            @RequestParam Long campaignId) {
        List<CharacterStatusResponse> responses = service.findByCharacterCardAndCampaign(characterCardId, campaignId);
        return ResponseEntity.ok(responses);
    }
}
