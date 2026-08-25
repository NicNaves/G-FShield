FROM python:3.10-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Copia o script
COPY requirements.txt /app/requirements.txt
COPY main.py /app/main.py

# Dependências mínimas
RUN pip install --no-cache-dir -r /app/requirements.txt

# Vamos usar ENTRYPOINT para o script; os argumentos virão do docker-compose
ENTRYPOINT ["python", "/app/main.py"]
