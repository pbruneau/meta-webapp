#!/bin/bash

set -euo pipefail

# Default to open mode if not specified
MODE=${1:-open}
BUILD_REQUESTED=false
ENV_FILE=".env.$MODE"
PUBLIC_DOMAIN_VALUE=""

read_env_value() {
    local key=$1

    awk -F= -v expected_key="$key" '
        $1 == expected_key {
            sub(/^[^=]+=/, "")
            print
            exit
        }
    ' "$ENV_FILE"
}

if [ "$MODE" != "open" ] && [ "$MODE" != "lan" ]; then
    echo "Usage: ./deploy.sh [open|lan] [--build]"
    echo "  open: Public access with HTTPS and authentication"
    echo "  lan:  Local network access on port 6080 without authentication"
    echo "  --build: Rebuild local service images before starting"
    exit 1
fi

if [ -n "${2:-}" ]; then
    if [ "$2" = "--build" ]; then
        BUILD_REQUESTED=true
    else
        echo "Usage: ./deploy.sh [open|lan] [--build]"
        exit 1
    fi
fi

if [ "$#" -gt 2 ]; then
    echo "Usage: ./deploy.sh [open|lan] [--build]"
    exit 1
fi

echo "Deploying in $MODE mode..."

if [ ! -f "$ENV_FILE" ]; then
    echo "Missing local deployment profile: $ENV_FILE" >&2
    echo "Create it from $ENV_FILE.example before deployment." >&2
    exit 1
fi

if [ "$MODE" = "open" ]; then
    PUBLIC_DOMAIN_VALUE=$(read_env_value PUBLIC_DOMAIN)
    CERTBOT_EMAIL_VALUE=$(read_env_value CERTBOT_EMAIL)
    if [ -z "$PUBLIC_DOMAIN_VALUE" ] || [ -z "$CERTBOT_EMAIL_VALUE" ]; then
        echo "$ENV_FILE must define PUBLIC_DOMAIN and CERTBOT_EMAIL." >&2
        exit 1
    fi

    REQUIRED_AUTHELIA_FILES=(
        authelia/users_database.yml
        authelia/secrets/reset-password-jwt-secret
        authelia/secrets/session-secret
        authelia/secrets/storage-encryption-key
    )
    for required_file in "${REQUIRED_AUTHELIA_FILES[@]}"; do
        if [ ! -r "$required_file" ]; then
            echo "Missing or unreadable Authelia runtime file: $required_file" >&2
            exit 1
        fi
    done
fi

# Keep shared PDF storage and synchronized reader state available to Docker.
mkdir -p filebrowser/data/Magazines pdf-reader/data

# Copy the appropriate environment file
cp "$ENV_FILE" .env

# For LAN mode, ensure we're not using profiles that aren't needed
if [ "$MODE" = "lan" ]; then
    # Stop and remove existing containers
    docker compose --profile "*" down
    
    # Start services without the 'open' profile
    if [ "$BUILD_REQUESTED" = true ]; then
        docker compose up -d --build
    else
        docker compose up -d
    fi
else
    # For open mode, start all services including those with 'open' profile
    if [ "$BUILD_REQUESTED" = true ]; then
        docker compose --profile open up -d --build
    else
        docker compose --profile open up -d
    fi
fi

echo "Deployment complete in $MODE mode!"

if [ "$MODE" = "lan" ]; then
    if [ "$(uname -s)" = "Darwin" ]; then
        LAN_INTERFACE=$(route -n get default | awk '/interface:/{print $2}')
        LAN_ADDRESS=$(ipconfig getifaddr "$LAN_INTERFACE")
    else
        LAN_ADDRESS=$(hostname -I | awk '{print $1}')
    fi
    LAN_ADDRESS=${LAN_ADDRESS:-localhost}
    echo "Access the application at: http://${LAN_ADDRESS}:6080"
else
    echo "Access the application at: https://${PUBLIC_DOMAIN_VALUE}"
fi
