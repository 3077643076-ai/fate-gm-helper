package com.fategmhelper.backend.web;

import com.fategmhelper.backend.domain.Campaign;
import com.fategmhelper.backend.service.AppSettingsService;
import com.fategmhelper.backend.service.CampaignService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/campaigns")
@RequiredArgsConstructor
public class CampaignController {

    private final CampaignService service;
    private final AppSettingsService appSettingsService;

    @GetMapping
    public ResponseEntity<List<Campaign>> list() {
        return ResponseEntity.ok(service.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Campaign> getById(@PathVariable Long id) {
        Campaign campaign = service.findById(id);
        return ResponseEntity.ok(campaign);
    }

    @PostMapping
    public ResponseEntity<Campaign> create(@RequestBody CreateCampaignRequest req) {
        return ResponseEntity.ok(service.create(req.getName(), req.getDescription()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        // 如果删除的是当前选择的战役，清除选择
        Long selectedId = appSettingsService.getSelectedCampaign();
        if (selectedId != null && selectedId.equals(id)) {
            appSettingsService.setSelectedCampaign(null);
        }
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{id}/select")
    public ResponseEntity<Void> selectCampaign(@PathVariable Long id) {
        appSettingsService.setSelectedCampaign(id);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/selected")
    public ResponseEntity<SelectedCampaignResponse> getSelectedCampaign() {
        Long campaignId = appSettingsService.getSelectedCampaign();
        if (campaignId == null) {
            return ResponseEntity.ok(new SelectedCampaignResponse(null, null));
        }
        Campaign campaign = service.findById(campaignId);
        return ResponseEntity.ok(new SelectedCampaignResponse(campaign.getId(), campaign.getName()));
    }

    @Data
    static class CreateCampaignRequest {
        private String name;
        private String description;
    }

    @Data
    static class SelectedCampaignResponse {
        private Long id;
        private String name;

        public SelectedCampaignResponse(Long id, String name) {
            this.id = id;
            this.name = name;
        }
    }
}

