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
@Table(name = "action_submission")
public class ActionSubmission {

    /** 行动者类别：从者行动 / 御主行动 */
    public enum ActionType {
        SERVANT_ACTION,
        MASTER_ACTION
    }

    /** 结算类别（规则书9种行动阶段，按结算顺序排列） */
    public enum PhaseType {
        MANEUVER("机动行动"),
        SOUL_EAT("魂食行动"),
        INTERFERE("干涉行动"),
        LIBERATE("解放行动"),
        CREATE("制造行动"),
        INTEL("信息行动"),
        REST("休整行动"),
        ASSIST("协助行动"),
        INTERVENE("介入行动");

        private final String displayName;

        PhaseType(String displayName) {
            this.displayName = displayName;
        }

        public String getDisplayName() {
            return displayName;
        }

        /** 根据行动内容文本自动检测结算类别（用于玩家未指定类别时的兜底） */
        public static PhaseType detectFromText(String text) {
            if (text == null || text.isBlank()) return INTERFERE;
            String t = text.toLowerCase();
            if (containsAny(t, "移动", "机动", "逃跑", "撤退", "追", "转移")) return MANEUVER;
            if (containsAny(t, "魂食", "捕食", "吸收")) return SOUL_EAT;
            if (containsAny(t, "攻击", "战斗", "防御", "干涉", "阻拦", "狙击")) return INTERFERE;
            if (containsAny(t, "宝具", "解放", "真名")) return LIBERATE;
            if (containsAny(t, "制造", "工坊", "礼装", "道具", "结界")) return CREATE;
            if (containsAny(t, "侦察", "感知", "情报", "搜索", "观察", "信息")) return INTEL;
            if (containsAny(t, "休整", "恢复", "治疗", "休息", "冥想")) return REST;
            if (containsAny(t, "协助", "支援", "帮助", "辅佐")) return ASSIST;
            if (containsAny(t, "介入", "参战", "加入")) return INTERVENE;
            return INTERFERE; // 默认归入干涉
        }

        private static boolean containsAny(String text, String... keywords) {
            for (String kw : keywords) {
                if (text.contains(kw)) return true;
            }
            return false;
        }
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = jakarta.persistence.FetchType.LAZY)
    @JoinColumn(name = "round_id", nullable = false)
    private Round round;

    @Column(name = "round_number", nullable = false)
    private Integer roundNumber;

    @ManyToOne(fetch = jakarta.persistence.FetchType.LAZY)
    @JoinColumn(name = "campaign_id", nullable = false)
    private Campaign campaign;

    @Column(name = "servant_class", nullable = false)
    private String servantClass;

    @Enumerated(EnumType.STRING)
    @Column(name = "action_type", nullable = false)
    private ActionType actionType;

    /** 结算类别（9种行动阶段），玩家提交时可省略，服务端会根据内容文本自动检测 */
    @Enumerated(EnumType.STRING)
    @Column(name = "phase_type")
    private PhaseType phaseType;

    @Column(name = "content", columnDefinition = "TEXT", nullable = false)
    private String content;

    @Column(name = "submitted_by")
    private String submittedBy;

    @Column(name = "is_current", nullable = false)
    private boolean current;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;
}