package com.hackthebeat.app.health;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

@RestController
@RequestMapping("/api/health")
public class HealthController {
    @GetMapping
    public HealthResponse health() {
        return new HealthResponse("UP", "Hack the Beat API is ready", Instant.now());
    }
}
