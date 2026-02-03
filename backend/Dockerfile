FROM python:3.10-slim

WORKDIR /app

# Install system dependencies for OpenCV and other libs
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --default-timeout=1000 -r requirements.txt

# Set environment variable for OpenBLAS threading issue
ENV OPENBLAS_NUM_THREADS=1

# Copy application code
COPY . .

# Expose port
EXPOSE 22555

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "22555"]
