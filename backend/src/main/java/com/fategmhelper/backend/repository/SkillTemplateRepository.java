package com.fategmhelper.backend.repository;

import com.fategmhelper.backend.domain.SkillTemplate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SkillTemplateRepository extends JpaRepository<SkillTemplate, Long> {

    @Query("SELECT s FROM SkillTemplate s WHERE " +
            "(:keyword IS NULL OR :keyword = '' OR " +
            "LOWER(s.name) LIKE LOWER(CONCAT('%', :keyword, '%')) OR " +
            "LOWER(s.rawText) LIKE LOWER(CONCAT('%', :keyword, '%'))) " +
            "AND (:timing IS NULL OR :timing = '' OR s.timing = :timing)")
    Page<SkillTemplate> search(
            @Param("keyword") String keyword,
            @Param("timing") String timing,
            Pageable pageable);
}
