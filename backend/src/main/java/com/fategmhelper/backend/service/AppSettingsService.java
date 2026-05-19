package com.fategmhelper.backend.service;

import com.fategmhelper.backend.domain.AppSettings;
import com.fategmhelper.backend.repository.AppSettingsRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AppSettingsService {

    private final AppSettingsRepository repository;

    private static final String SELECTED_CAMPAIGN_KEY = "selected_campaign_id";

    @Transactional
    public void setSelectedCampaign(Long campaignId) {
        AppSettings settings = repository.findBySettingKey(SELECTED_CAMPAIGN_KEY)
                .orElse(AppSettings.builder().settingKey(SELECTED_CAMPAIGN_KEY).build());
        settings.setSettingValue(campaignId != null ? campaignId.toString() : null);
        repository.save(settings);
    }

    @Transactional(readOnly = true)
    public Long getSelectedCampaign() {
        return repository.findBySettingKey(SELECTED_CAMPAIGN_KEY)
                .map(AppSettings::getSettingValue)
                .map(value -> {
                    try {
                        return Long.parseLong(value);
                    } catch (NumberFormatException e) {
                        return null;
                    }
                })
                .orElse(null);
    }
}

