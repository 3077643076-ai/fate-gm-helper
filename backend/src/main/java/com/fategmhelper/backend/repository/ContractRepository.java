package com.fategmhelper.backend.repository;

import com.fategmhelper.backend.domain.Contract;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ContractRepository extends JpaRepository<Contract, Long> {

    /** 查询某战役下的全部契约 */
    List<Contract> findByCampaignId(Long campaignId);

    /** 查询某战役下指定状态的契约 */
    List<Contract> findByCampaignIdAndStatus(Long campaignId, Contract.Status status);

    /** 根据立约人+签约人+类型查唯一ACTIVE契约 */
    Optional<Contract> findByCampaignIdAndInitiatorCardIdAndSignatoryCardIdAndContractTypeAndStatus(
            Long campaignId, Long initiatorCardId, Long signatoryCardId,
            Contract.ContractType contractType, Contract.Status status);

    /** 查某角色作为立约人的全部ACTIVE契约 */
    List<Contract> findByCampaignIdAndInitiatorCardIdAndStatus(
            Long campaignId, Long initiatorCardId, Contract.Status status);

    /** 查某角色作为签约人的全部ACTIVE契约 */
    List<Contract> findByCampaignIdAndSignatoryCardIdAndStatus(
            Long campaignId, Long signatoryCardId, Contract.Status status);
}
