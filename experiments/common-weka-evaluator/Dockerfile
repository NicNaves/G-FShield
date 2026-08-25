FROM maven:3.9.6-eclipse-temurin-17@sha256:29a1658b1f3078e07c2b17f7b519b45eb47f65d9628e887eac45a8c5c8f939d4 AS builder
WORKDIR /build
COPY experiments/common-weka-evaluator/pom.xml ./pom.xml
COPY experiments/common-weka-evaluator/src ./src
RUN mvn -q -DskipTests package

FROM maven:3.9.6-eclipse-temurin-17@sha256:29a1658b1f3078e07c2b17f7b519b45eb47f65d9628e887eac45a8c5c8f939d4
WORKDIR /app
COPY --from=builder /build/target/common-weka-evaluator.jar /app/common-weka-evaluator.jar
ENTRYPOINT ["java", "-jar", "/app/common-weka-evaluator.jar"]
