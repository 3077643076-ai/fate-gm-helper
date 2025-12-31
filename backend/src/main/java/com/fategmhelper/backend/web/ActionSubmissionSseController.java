package com.fategmhelper.backend.web;

import com.fategmhelper.backend.web.dto.ActionSubmissionResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@RestController
@RequestMapping("/api/action-submissions")
@Slf4j
public class ActionSubmissionSseController {

    private final Map<Long, List<SseEmitter>> emittersByCampaign = new ConcurrentHashMap<>();

    @GetMapping(path = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@RequestParam Long campaignId) {
        SseEmitter emitter = new SseEmitter(0L); // no timeout
        emittersByCampaign.computeIfAbsent(campaignId, k -> new CopyOnWriteArrayList<>()).add(emitter);

        emitter.onCompletion(() -> removeEmitter(campaignId, emitter));
        emitter.onTimeout(() -> removeEmitter(campaignId, emitter));
        emitter.onError((e) -> removeEmitter(campaignId, emitter));

        // send a welcome/heartbeat event to confirm connection
        try {
            emitter.send(SseEmitter.event().name("connected").data("connected"));
        } catch (IOException ignored) {
        }
        return emitter;
    }

    @EventListener
    public void onNewSubmission(ActionSubmissionResponse submission) {
        if (submission == null || submission.getCampaignId() == null) return;
        List<SseEmitter> list = emittersByCampaign.get(submission.getCampaignId());
        if (list == null || list.isEmpty()) return;
        for (SseEmitter emitter : list) {
            try {
                emitter.send(SseEmitter.event().name("submission").data(submission));
            } catch (Exception e) {
                removeEmitter(submission.getCampaignId(), emitter);
            }
        }
    }

    private void removeEmitter(Long campaignId, SseEmitter emitter) {
        List<SseEmitter> list = emittersByCampaign.get(campaignId);
        if (list != null) {
            list.remove(emitter);
            if (list.isEmpty()) {
                emittersByCampaign.remove(campaignId);
            }
        }
    }
}


