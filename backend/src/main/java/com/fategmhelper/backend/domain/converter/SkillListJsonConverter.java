package com.fategmhelper.backend.domain.converter;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fategmhelper.backend.domain.SkillItem;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.Collections;
import java.util.List;

@Converter
public class SkillListJsonConverter implements AttributeConverter<List<SkillItem>, String> {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<List<SkillItem>> TYPE = new TypeReference<>() {};

    @Override
    public String convertToDatabaseColumn(List<SkillItem> attribute) {
        try {
            if (attribute == null) {
                return null;
            }
            return MAPPER.writeValueAsString(attribute);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to write skill list as JSON", e);
        }
    }

    @Override
    public List<SkillItem> convertToEntityAttribute(String dbData) {
        try {
            if (dbData == null || dbData.isBlank()) {
                return Collections.emptyList();
            }
            return MAPPER.readValue(dbData, TYPE);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to read skill list from JSON", e);
        }
    }
}

