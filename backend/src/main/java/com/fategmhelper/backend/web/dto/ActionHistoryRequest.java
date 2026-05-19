package com.fategmhelper.backend.web.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class ActionHistoryRequest {
    private List<Map<String, Object>> actionOrder;
    private List<String> servantActions;
    private List<String> masterActions;
}


