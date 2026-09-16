package br.com.graspfs.ls.iwssr;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = "spring.kafka.listener.auto-startup=false")
class GraspFsDlsIwrApplicationTests {

	@Test
	void contextLoads() {
	}

}
