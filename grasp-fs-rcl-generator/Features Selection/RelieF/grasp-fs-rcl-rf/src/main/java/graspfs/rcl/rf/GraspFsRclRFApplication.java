package graspfs.rcl.rf;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;


@EnableAsync 
@SpringBootApplication
public class GraspFsRclRFApplication {

	public static void main(String[] args) {
		SpringApplication.run(GraspFsRclRFApplication.class, args);
	}

}
