FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000 \
    ENVIRONMENT=production \
    PYTHONPATH=/app

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r ./requirements.txt

# Copy backend files and data
COPY . ./backend/
COPY data ./data

# Expose port (Cloud Run sets $PORT dynamically)
EXPOSE 8000

# Start FastAPI uvicorn server on Cloud Run $PORT
CMD exec python -m uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1
