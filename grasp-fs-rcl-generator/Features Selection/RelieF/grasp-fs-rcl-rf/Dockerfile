FROM maven:3.9.4-eclipse-temurin-17@sha256:e3f36fd6d0949541de3b6a32bb3de30331b2bdb6bac8ba365c4f8a5f0fcd3e59 AS builder
WORKDIR /app

COPY pom.xml ./
RUN mvn -q -DskipTests dependency:go-offline

COPY src src
RUN mvn -q clean package -DskipTests

FROM eclipse-temurin:17-jre@sha256:13cc28a6cc72a38ce1f00c906be3580c1a3e604b8984d694f369a96742abc93b
WORKDIR /opt/app
COPY --from=builder /app/target/*.jar app.jar
ENTRYPOINT ["sh", "-c", "java ${JAVA_OPTS:--XX:+UseContainerSupport -XX:InitialRAMPercentage=25 -XX:MaxRAMPercentage=75 -Djava.security.egd=file:/dev/./urandom} -jar /opt/app/app.jar"]
