FROM maven:3.9.4-eclipse-temurin-17 AS builder
WORKDIR /app

COPY pom.xml ./
RUN mvn -q -DskipTests dependency:go-offline

COPY src src
RUN mvn -q clean package -DskipTests

FROM eclipse-temurin:17-jre
WORKDIR /opt/app
COPY --from=builder /app/target/*.jar app.jar
ENTRYPOINT ["sh", "-c", "java ${JAVA_OPTS:--XX:+UseContainerSupport -XX:InitialRAMPercentage=25 -XX:MaxRAMPercentage=75 -Djava.security.egd=file:/dev/./urandom} -jar /opt/app/app.jar"]
