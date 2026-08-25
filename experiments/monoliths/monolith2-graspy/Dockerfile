# Imagem leve + Python 3.11
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Compiladores/basics (úteis caso algum wheel falhe)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependências primeiro (melhora cache)
COPY requirements.txt .
RUN pip install -r requirements.txt

# Código
COPY main.py .

# Pastas úteis (logs fora da imagem; dados montados em /data)
VOLUME ["/app/logs", "/data"]

# Por padrão chamamos o script; os args vêm do `docker run`
ENTRYPOINT ["python", "main.py"]
