package com.fategmhelper.backend.web;

import com.fategmhelper.backend.domain.ActionSubmission;
import com.fategmhelper.backend.service.ActionSubmissionService;
import com.fategmhelper.backend.web.dto.ActionSubmissionRequest;
import com.fategmhelper.backend.web.dto.ActionSubmissionResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/action-submissions")
@RequiredArgsConstructor
public class ActionSubmissionController {

    private final ActionSubmissionService service;

    @PostMapping
    public ResponseEntity<ActionSubmissionResponse> submit(@Valid @RequestBody ActionSubmissionRequest req) {
        ActionSubmission saved = service.submitAction(
                req.getCampaignId(),
                req.getServantClass(),
                req.getActionType(),
                req.getContent(),
                req.getSubmittedBy()
        );
        return ResponseEntity.ok(ActionSubmissionResponse.fromEntity(saved));
    }

    @GetMapping
    public ResponseEntity<java.util.List<ActionSubmissionResponse>> listCurrent(@RequestParam Long campaignId) {
        return ResponseEntity.ok(service.listCurrentByCampaign(campaignId));
    }
}


