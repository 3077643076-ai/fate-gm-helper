package com.fategmhelper.backend.repository;

import com.fategmhelper.backend.domain.AppSettings;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AppSettingsRepository extends JpaRepository<AppSettings, Long> {
    Optional<AppSettings> findBySettingKey(String settingKey);
}

