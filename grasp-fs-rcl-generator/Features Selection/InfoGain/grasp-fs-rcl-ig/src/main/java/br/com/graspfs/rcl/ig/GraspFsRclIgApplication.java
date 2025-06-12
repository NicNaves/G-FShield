package br.com.graspfs.rcl.ig;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;


@EnableAsync
@SpringBootApplication
public class GraspFsRclIgApplication {

	public static void main(String[] args) {
		SpringApplication.run(GraspFsRclIgApplication.class, args);
	}

}
