package br.com.graspfs.rcl.su;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@EnableAsync
@SpringBootApplication
public class GraspFsRclSuApplication {

	public static void main(String[] args) {
		SpringApplication.run(GraspFsRclSuApplication.class, args);
	}

}
