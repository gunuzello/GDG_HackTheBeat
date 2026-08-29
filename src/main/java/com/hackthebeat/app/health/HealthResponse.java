package com.hackthebeat.app.health;

import java.time.Instant;

public record HealthResponse(String status, String message, Instant timestamp) {
}
