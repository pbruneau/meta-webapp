#!/usr/bin/env bash

set -euo pipefail

USER_CONFIG=${1:-filebrowser-users.conf}
DATABASE_PATH=/database/filebrowser.db

if [ ! -f "$USER_CONFIG" ]; then
    echo "Missing local FileBrowser user configuration: $USER_CONFIG" >&2
    echo "Create it from filebrowser-users.example." >&2
    exit 1
fi

filebrowser() {
    docker compose exec filebrowser /filebrowser -d "$DATABASE_PATH" "$@"
}

prompt_password() {
    local prompt=$1

    IFS= read -r -s -p "$prompt" PASSWORD_INPUT
    printf '\n'
    if [ -z "$PASSWORD_INPUT" ]; then
        echo "An empty password is not allowed." >&2
        exit 1
    fi
}

filebrowser config init

prompt_password "FileBrowser built-in admin password: "
filebrowser users update admin --password "$PASSWORD_INPUT"
unset PASSWORD_INPUT

while read -r username role extra; do
    if [ -z "${username:-}" ] || [[ "$username" == \#* ]]; then
        continue
    fi
    if [ -n "${extra:-}" ] || { [ "$role" != "admin" ] && [ "$role" != "user" ]; }; then
        echo "Invalid FileBrowser user entry: $username ${role:-}" >&2
        exit 1
    fi

    prompt_password "Password for $username: "
    if [ "$role" = "admin" ]; then
        filebrowser users add "$username" "$PASSWORD_INPUT" --perm.admin=true
    else
        filebrowser users add "$username" "$PASSWORD_INPUT" \
            --perm.create=true \
            --perm.rename=true \
            --perm.delete=true \
            --perm.download=true \
            --perm.share=true
    fi
    unset PASSWORD_INPUT
done < "$USER_CONFIG"

echo "FileBrowser users have been configured."
