package com.fategmhelper.backend.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;

/**
 * 契约系统 — 规则书第四章（6种契约类型）
 * 立约人（initiator）向签约人（signatory）发起契约。
 * 双方可以是御主或从者，取决于契约类型。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "contract",
    uniqueConstraints = {
        // 同一战役下，同一对立约人+签约人+类型的组合只能有一份ACTIVE契约
        @UniqueConstraint(columnNames = {"campaign_id", "initiator_card_id", "signatory_card_id", "contract_type"},
            name = "uk_contract_pair")
    })
public class Contract {

    /** 规则书第四章：6种契约类型 */
    public enum ContractType {
        SAINT_GRAIL("圣杯契约"),     // 御主↔从者，正统召唤绑定
        ALLIANCE("同盟契约"),        // 御主↔御主，建立平等同盟
        NON_AGGRESSION("不战契约"),  // 御主↔御主，互不侵犯
        MANA("魔力契约"),           // 不限→不限，魔力传输桥梁
        FORCED("强制契约"),          // 御主→御主，强制履行命令
        ENSLAVEMENT("奴役契约");     // 御主→御主，从属同盟

        private final String displayName;

        ContractType(String displayName) {
            this.displayName = displayName;
        }

        public String getDisplayName() {
            return displayName;
        }
    }

    /** 契约状态 */
    public enum Status {
        ACTIVE,    // 生效中
        BROKEN,    // 已破除
        SUSPENDED  // 暂时失效
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "campaign_id", nullable = false)
    private Campaign campaign;

    /** 契约类型（6种之一） */
    @Enumerated(EnumType.STRING)
    @Column(name = "contract_type", nullable = false)
    private ContractType contractType;

    /** 立约人（发起契约的一方） */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "initiator_card_id", nullable = false)
    private CharacterCard initiatorCard;

    /** 签约人（接受契约的一方） */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "signatory_card_id", nullable = false)
    private CharacterCard signatoryCard;

    /** 契约状态 */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private Status status = Status.ACTIVE;

    /** 自定义条款（强制契约等的第3条"任意填写"内容） */
    @Column(columnDefinition = "TEXT")
    private String terms;

    @CreationTimestamp
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;
}
