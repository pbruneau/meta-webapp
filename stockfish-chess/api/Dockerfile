FROM python:3.9-slim

WORKDIR /app

# Install necessary dependencies for building Stockfish
RUN apt-get update && apt-get install -y \
    git curl wget \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Architecture detection and Stockfish build
ARG TARGETARCH
RUN echo "Building for architecture: ${TARGETARCH}" && \
    git clone https://github.com/official-stockfish/Stockfish.git && \
    cd Stockfish/src && \
    if [ "$TARGETARCH" = "arm64" ] || [ "$TARGETARCH" = "aarch64" ]; then \
        echo "Building for ARM64 (Raspberry Pi 5)"; \
        make -j build ARCH=armv8; \
    elif [ "$TARGETARCH" = "amd64" ] || [ "$TARGETARCH" = "x86_64" ]; then \
        echo "Building for x86_64"; \
        make -j build ARCH=x86-64; \
    else \
        echo "Building for generic architecture"; \
        make -j build ARCH=general-64; \
    fi && \
    cp stockfish /app/ && \
    cd /app && \
    rm -rf Stockfish

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code
COPY app.py .
COPY stress_test.py .

# Expose the port
EXPOSE 6000

# Command to run the application
CMD ["python", "app.py"]