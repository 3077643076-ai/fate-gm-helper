package com.fategmhelper.backend.web;

import com.fategmhelper.backend.service.LeylineAssignmentService;
import com.fategmhelper.backend.web.dto.LeylineAssignmentRequest;
import com.fategmhelper.backend.web.dto.LeylineAssignmentResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/leyline-assignments")
@RequiredArgsConstructor
public class LeylineAssignmentController {

    private final LeylineAssignmentService service;

    @GetMapping
    public ResponseEntity<List<LeylineAssignmentResponse>> list(@RequestParam Long campaignId) {
        return ResponseEntity.ok(service.listByCampaign(campaignId));
    }

    @PostMapping
    public ResponseEntity<LeylineAssignmentResponse> assign(@Valid @RequestBody LeylineAssignmentRequest req) {
        LeylineAssignmentResponse res = service.assign(req);
        if (res == null) return ResponseEntity.ok().build();
        return ResponseEntity.ok(res);
    }

    @PostMapping("/bulk")
    public ResponseEntity<Void> assignBulk(@Valid @RequestBody LeylineAssignmentRequest req) {
        service.assignBulk(req.getCampaignId(), req.getItems());
        return ResponseEntity.ok().build();
    }
}


