#!/usr/bin/env bash

set -euo pipefail

SOURCE_CONFIG=${1:-authelia/configuration.yml}
TARGET_DIRECTORY=${2:-authelia/secrets}

if [ ! -f "$SOURCE_CONFIG" ]; then
    echo "Authelia configuration not found: $SOURCE_CONFIG" >&2
    exit 1
fi

extract_scalar() {
    local key=$1
    local value

    value=$(awk -v expected_key="$key" '
        $1 == expected_key ":" {
            sub(/^[^:]+:[[:space:]]*/, "")
            print
            exit
        }
    ' "$SOURCE_CONFIG")

    if [ -z "$value" ]; then
        echo "Inline Authelia value not found: $key" >&2
        exit 1
    fi

    if [[ "$value" == \"*\" ]] || [[ "$value" == \'*\' ]]; then
        value=${value:1:${#value}-2}
    fi

    printf '%s' "$value"
}

write_secret() {
    local key=$1
    local filename=$2
    local value
    local target

    value=$(extract_scalar "$key")
    target="$TARGET_DIRECTORY/$filename"

    if [ -e "$target" ]; then
        if [ "$(<"$target")" != "$value" ]; then
            echo "Refusing to overwrite a different secret: $target" >&2
            exit 1
        fi
        chmod 600 "$target"
        echo "Existing secret verified: $target"
        return
    fi

    printf '%s' "$value" > "$target"
    chmod 600 "$target"
    echo "Secret migrated: $target"
}

umask 077
mkdir -p "$TARGET_DIRECTORY"
chmod 700 "$TARGET_DIRECTORY"

write_secret jwt_secret reset-password-jwt-secret
write_secret secret session-secret
write_secret encryption_key storage-encryption-key

echo "Authelia secrets migrated without rotation."
