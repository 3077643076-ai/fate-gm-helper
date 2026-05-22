package com.fategmhelper.backend.service;

import com.fategmhelper.backend.domain.Campaign;
import com.fategmhelper.backend.domain.CharacterCard;
import com.fategmhelper.backend.domain.Contract;
import com.fategmhelper.backend.repository.CampaignRepository;
import com.fategmhelper.backend.repository.CharacterCardRepository;
import com.fategmhelper.backend.repository.ContractRepository;
import com.fategmhelper.backend.web.dto.ContractResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ContractService {

    private final ContractRepository contractRepository;
    private final CampaignRepository campaignRepository;
    private final CharacterCardRepository characterCardRepository;

    /** 创建新契约。同一立约人+签约人+类型已有ACTIVE时自动覆盖（旧→BROKEN） */
    @Transactional
    public ContractResponse createContract(Long campaignId, Contract.ContractType contractType,
                                            Long initiatorCardId, Long signatoryCardId, String terms) {
        Campaign campaign = campaignRepository.findById(campaignId)
                .orElseThrow(() -> new IllegalArgumentException("未找到战役：" + campaignId));
        CharacterCard initiator = characterCardRepository.findById(initiatorCardId)
                .orElseThrow(() -> new IllegalArgumentException("未找到立约人角色卡：" + initiatorCardId));
        CharacterCard signatory = characterCardRepository.findById(signatoryCardId)
                .orElseThrow(() -> new IllegalArgumentException("未找到签约人角色卡：" + signatoryCardId));

        // 同一组合同类型已有ACTIVE → 先解除旧契约
        contractRepository.findByCampaignIdAndInitiatorCardIdAndSignatoryCardIdAndContractTypeAndStatus(
                campaignId, initiatorCardId, signatoryCardId, contractType, Contract.Status.ACTIVE)
                .ifPresent(old -> {
                    old.setStatus(Contract.Status.BROKEN);
                    contractRepository.save(old);
                });

        Contract contract = Contract.builder()
                .campaign(campaign)
                .contractType(contractType)
                .initiatorCard(initiator)
                .signatoryCard(signatory)
                .status(Contract.Status.ACTIVE)
                .terms(terms)
                .build();

        return ContractResponse.fromEntity(contractRepository.save(contract));
    }

    /** 破除指定契约（将状态改为BROKEN） */
    @Transactional
    public void breakContract(Long contractId) {
        Contract contract = contractRepository.findById(contractId)
                .orElseThrow(() -> new IllegalArgumentException("未找到契约：" + contractId));
        if (contract.getStatus() == Contract.Status.BROKEN) {
            throw new IllegalArgumentException("契约已被破除");
        }
        contract.setStatus(Contract.Status.BROKEN);
        contractRepository.save(contract);
    }

    /** 破除某角色涉及的全部ACTIVE契约（角色退场时调用） */
    @Transactional
    public void breakAllContractsForCard(Long campaignId, Long cardId) {
        List<Contract> asInitiator = contractRepository
                .findByCampaignIdAndInitiatorCardIdAndStatus(campaignId, cardId, Contract.Status.ACTIVE);
        List<Contract> asSignatory = contractRepository
                .findByCampaignIdAndSignatoryCardIdAndStatus(campaignId, cardId, Contract.Status.ACTIVE);
        for (Contract c : asInitiator) {
            c.setStatus(Contract.Status.BROKEN);
            contractRepository.save(c);
        }
        for (Contract c : asSignatory) {
            c.setStatus(Contract.Status.BROKEN);
            contractRepository.save(c);
        }
    }

    /** 查询战役下全部契约 */
    @Transactional(readOnly = true)
    public List<ContractResponse> listByCampaign(Long campaignId) {
        return contractRepository.findByCampaignId(campaignId)
                .stream()
                .map(ContractResponse::fromEntity)
                .toList();
    }

    /** 查询战役下生效中的契约 */
    @Transactional(readOnly = true)
    public List<ContractResponse> listActiveByCampaign(Long campaignId) {
        return contractRepository.findByCampaignIdAndStatus(campaignId, Contract.Status.ACTIVE)
                .stream()
                .map(ContractResponse::fromEntity)
                .toList();
    }
}
