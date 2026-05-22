package com.fategmhelper.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
@Table(name = "campaign_round")
public class Round {

    public enum Status {
        OPEN,
        CLOSED
    }

    /** 昼夜标识（第1回合为降临日，dayOrNight=null；之后按昼/夜交替） */
    public enum DayOrNight {
        DAY,   // 昼
        NIGHT  // 夜
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = jakarta.persistence.FetchType.LAZY)
    @JoinColumn(name = "campaign_id", nullable = false)
    private Campaign campaign;

    @Column(name = "turn_number", nullable = false)
    private Integer turnNumber;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status;

    /** 昼夜标识：第1回合（降临日）为null，之后按turnNumber自动交替 */
    @Enumerated(EnumType.STRING)
    @Column(name = "day_or_night")
    private DayOrNight dayOrNight;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @Column(name = "closed_at")
    private Instant closedAt;
}