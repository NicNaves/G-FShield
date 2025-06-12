package br.com.graspfs.rcl.gr;


import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;


@EnableAsync
@SpringBootApplication
public class GraspFsRclGrApplication {
	public static void main(String[] args) {
		SpringApplication.run(GraspFsRclGrApplication.class, args);
	}
}