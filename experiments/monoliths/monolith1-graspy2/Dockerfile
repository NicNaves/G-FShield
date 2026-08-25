FROM python:3.10-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Copia o script
COPY main.py /app/main.py

# Dependências mínimas
RUN pip install --upgrade pip && \
    pip install numpy pandas scikit-learn psutil

# Vamos usar ENTRYPOINT para o script; os argumentos virão do docker-compose
ENTRYPOINT ["python", "/app/main.py"]
