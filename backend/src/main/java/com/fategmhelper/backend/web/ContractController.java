package com.fategmhelper.backend.web;

import com.fategmhelper.backend.service.ContractService;
import com.fategmhelper.backend.web.dto.ContractRequest;
import com.fategmhelper.backend.web.dto.ContractResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/contracts")
@RequiredArgsConstructor
public class ContractController {

    private final ContractService contractService;

    /** 创建契约 */
    @PostMapping
    public ResponseEntity<ContractResponse> create(@Valid @RequestBody ContractRequest req) {
        ContractResponse response = contractService.createContract(
                req.getCampaignId(),
                req.getContractType(),
                req.getInitiatorCardId(),
                req.getSignatoryCardId(),
                req.getTerms()
        );
        return ResponseEntity.ok(response);
    }

    /** 破除契约 */
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, String>> breakContract(@PathVariable Long id) {
        contractService.breakContract(id);
        return ResponseEntity.ok(Map.of("message", "契约已破除"));
    }

    /** 查询战役下全部契约 */
    @GetMapping
    public ResponseEntity<List<ContractResponse>> list(@RequestParam Long campaignId) {
        return ResponseEntity.ok(contractService.listByCampaign(campaignId));
    }
}
