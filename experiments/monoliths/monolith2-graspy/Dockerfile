FROM maven:3.9.6-eclipse-temurin-17@sha256:29a1658b1f3078e07c2b17f7b519b45eb47f65d9628e887eac45a8c5c8f939d4 AS weka-builder
WORKDIR /build
COPY experiments/common-weka-evaluator/pom.xml ./pom.xml
COPY experiments/common-weka-evaluator/src ./src
RUN mvn -q -DskipTests package

FROM python:3.11-slim@sha256:9c900dea9e8fb7e16277c179b555cc72d29a352dbc33cff48ad5a0412fd5bfc7
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends openjdk-21-jre-headless \
    && rm -rf /var/lib/apt/lists/*
COPY experiments/monoliths/monolith2-graspy/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt
COPY experiments/monoliths/monolith2-graspy/main.py ./main.py
COPY --from=weka-builder /build/target/common-weka-evaluator.jar ./common-weka-evaluator.jar
VOLUME ["/app/logs", "/data"]
ENTRYPOINT ["python", "/app/main.py"]
