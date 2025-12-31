package com.fategmhelper.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "action_history")
public class ActionHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = jakarta.persistence.FetchType.LAZY)
    @JoinColumn(name = "campaign_id", nullable = false)
    private Campaign campaign;

    @Column(name = "round_number", nullable = false)
    private Integer roundNumber;

    @Column(name = "closed_at")
    private Instant closedAt;

    @Column(name = "action_order", columnDefinition = "TEXT")
    private String actionOrderJson;

    @Column(name = "servant_actions", columnDefinition = "TEXT")
    private String servantActionsJson;

    @Column(name = "master_actions", columnDefinition = "TEXT")
    private String masterActionsJson;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;
}


