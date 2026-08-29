package com.hackthebeat.app;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class HackTheBeatApplication {
    public static void main(String[] args) {
        SpringApplication.run(HackTheBeatApplication.class, args);
    }
}
