#!/bin/bash

set -euo pipefail

if [ "$#" -ne 0 ]; then
    echo "Usage: ./destroy.sh"
    exit 1
fi

echo "Destroying the Docker Compose deployment..."

docker compose --profile "*" down --volumes --remove-orphans

echo "Docker Compose deployment destroyed."
