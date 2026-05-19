package com.fategmhelper.backend.web;

import com.fategmhelper.backend.domain.Round;
import com.fategmhelper.backend.service.RoundService;
import com.fategmhelper.backend.service.ActionHistoryService;
import com.fategmhelper.backend.web.dto.ActionHistoryRequest;
import com.fategmhelper.backend.web.dto.ActionHistoryResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/rounds")
@RequiredArgsConstructor
@Slf4j
public class RoundController {

    private final RoundService roundService;
    private final ActionHistoryService actionHistoryService;
    private final ObjectMapper objectMapper;

    /**
     * 关闭指定战役下当前开放的回合。
     */
    @PostMapping("/close-current")
    public ResponseEntity<java.util.Map<String, Object>> closeCurrent(@RequestParam Long campaignId,
                                                                      @RequestBody(required = false) ActionHistoryRequest req) {
        Round closed = roundService.closeCurrentRound(campaignId);
        java.util.Map<String, Object> out = new java.util.HashMap<>();
        // avoid returning JPA entity proxies directly (Jackson/Hibernate proxy serialization issues)
        java.util.Map<String, Object> roundMap = new java.util.HashMap<>();
        roundMap.put("id", closed.getId());
        roundMap.put("turnNumber", closed.getTurnNumber());
        roundMap.put("status", closed.getStatus() != null ? closed.getStatus().name() : null);
        roundMap.put("closedAt", closed.getClosedAt());
        roundMap.put("createdAt", closed.getCreatedAt());
        out.put("round", roundMap);
        if (req != null) {
            try {
                String ao = req.getActionOrder() != null ? objectMapper.writeValueAsString(req.getActionOrder()) : null;
                String sa = req.getServantActions() != null ? objectMapper.writeValueAsString(req.getServantActions()) : null;
                String ma = req.getMasterActions() != null ? objectMapper.writeValueAsString(req.getMasterActions()) : null;
                com.fategmhelper.backend.domain.ActionHistory saved = actionHistoryService.saveSnapshot(
                        campaignId,
                        closed.getTurnNumber(),
                        closed.getClosedAt(),
                        ao, sa, ma
                );
                ActionHistoryResponse resp = ActionHistoryResponse.fromEntity(saved, objectMapper);
                out.put("history", resp);
            } catch (Exception e) {
                log.error("保存历史动作失败", e);
            }
        }
        return ResponseEntity.ok(out);
    }

    @GetMapping("/history")
    public ResponseEntity<java.util.List<ActionHistoryResponse>> history(@RequestParam Long campaignId) {
        java.util.List<com.fategmhelper.backend.domain.ActionHistory> list = actionHistoryService.listByCampaign(campaignId);
        java.util.List<ActionHistoryResponse> res = list.stream().map(e -> ActionHistoryResponse.fromEntity(e, objectMapper)).toList();
        return ResponseEntity.ok(res);
    }

    @GetMapping("/current")
    public ResponseEntity<java.util.Map<String, Object>> current(@RequestParam Long campaignId) {
        com.fategmhelper.backend.domain.Round r = roundService.getOrCreateCurrentRound(campaignId);
        java.util.Map<String, Object> roundMap = new java.util.HashMap<>();
        roundMap.put("id", r.getId());
        roundMap.put("turnNumber", r.getTurnNumber());
        roundMap.put("status", r.getStatus() != null ? r.getStatus().name() : null);
        roundMap.put("createdAt", r.getCreatedAt());
        roundMap.put("closedAt", r.getClosedAt());
        return ResponseEntity.ok(java.util.Map.of("round", roundMap));
    }

    @PostMapping("/next")
    public ResponseEntity<java.util.Map<String, Object>> next(@RequestParam Long campaignId) {
        com.fategmhelper.backend.domain.Round next = roundService.createNextRound(campaignId);
        java.util.Map<String, Object> roundMap = new java.util.HashMap<>();
        roundMap.put("id", next.getId());
        roundMap.put("turnNumber", next.getTurnNumber());
        roundMap.put("status", next.getStatus() != null ? next.getStatus().name() : null);
        roundMap.put("createdAt", next.getCreatedAt());
        roundMap.put("closedAt", next.getClosedAt());
        return ResponseEntity.ok(java.util.Map.of("round", roundMap));
    }
}


