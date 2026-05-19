package com.fategmhelper.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.ComponentScan;

@SpringBootApplication
@ComponentScan(basePackages = "com.fategmhelper.backend")
public class FateGmHelperApplication {
    public static void main(String[] args) {
        SpringApplication.run(FateGmHelperApplication.class, args);
    }
}

