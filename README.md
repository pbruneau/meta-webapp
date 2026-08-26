# Meta Webapp

Docker Compose deployment for the Meta Webapp services. Two deployment profiles
are supported:

- `lan`: local network access on port `6080`, without Authelia.
- `open`: HTTPS access through Nginx and Authelia.

## Local deployment profiles

Deployment profiles are local files and are not tracked. Create them from the
committed examples:

```bash
cp .env.lan.example .env.lan
cp .env.open.example .env.open
```

`deploy.sh` validates the selected profile and copies it to the ignored `.env`
file consumed by Docker Compose. Open mode requires `PUBLIC_DOMAIN` and
`CERTBOT_EMAIL`.

The open Nginx and Authelia configuration currently contains the production
domain in structural settings that cannot be supplied through simple environment
variables. Changing the domain therefore also requires updates to
`nginx/nginx-open.conf` and `authelia/configuration.yml`.

## Runtime data and secrets

The following paths are local runtime state and must remain outside Git:

| Path | Purpose |
| --- | --- |
| `.env`, `.env.lan`, `.env.open` | Active local deployment profiles |
| `authelia/secrets/` | Reset JWT, session, and storage encryption secrets |
| `authelia/users_database.yml` | Real identities and password verifiers |
| `authelia/db.sqlite3*` | Authelia persistent state and SQLite sidecars |
| `authelia/notification.txt` | Filesystem notification output and reset links |
| `filebrowser/` | FileBrowser configuration, database, and managed files |
| `pdf-reader/data/` | PDF Reader SQLite state |

TLS certificates remain outside the repository under `/etc/letsencrypt` and
`/var/www/certbot`.

### Migrating an existing Authelia configuration

The migration helper accepts a pre-refactor configuration as its source and moves
the three inline values into mode `0600` files without printing, changing, or
rotating them. During a clean-repository cutover, the old configuration is
supplied from the backup while the target defaults to the new repository:

```bash
./migrate-authelia-secrets.sh \
  ../meta-webapp-pi-backup/authelia/configuration.yml
```

Because the storage encryption key is copied unchanged, the existing Authelia
database remains compatible. A future key rotation must use Authelia's
`storage encryption change-key` command.

### New Authelia installation

1. Copy `authelia/users_database.example.yml` to the ignored
   `authelia/users_database.yml` and replace all example data.
2. Create these non-empty files under `authelia/secrets/`:

   ```text
   reset-password-jwt-secret
   session-secret
   storage-encryption-key
   ```

3. Set the directory to mode `0700` and each secret file to mode `0600`.

Open-mode deployment stops during preflight when any required Authelia runtime
file is missing or unreadable.

## FileBrowser initialization

Existing FileBrowser databases require no provisioning during repository
migration. For a new database, create the ignored identity list and run the
interactive setup:

```bash
cp filebrowser-users.example filebrowser-users.conf
docker compose up -d filebrowser
./setup-filebrowser.sh
```

The identity file contains one `username role` pair per line. Supported roles are
`admin` and `user`. Passwords are requested with hidden terminal input and are not
written to disk by the script.

## Deployment and destruction

```bash
./deploy.sh lan --build
./deploy.sh open --build
```

LAN mode is available at `http://HOST:6080/`. The configured open deployment is
available at `https://pbruneau.ddns.net/`.

To stop and remove the deployment across all profiles, run:

```bash
./destroy.sh
```

The destruction script removes the Compose containers, project network, orphaned
containers, and any Docker-managed named or anonymous volumes. Bind-mounted
runtime data, local deployment profiles, TLS certificates, and cached images are
preserved.

## Fresh Git history and Raspberry Pi cutover

The clean-history repository should contain only the sanitized tracked tree. The
full-history repository remains an offline archive and must never be pushed.

Before the clean repository's initial commit, inspect both commands carefully:

```bash
git status --ignored
git add -n .
```

No local profile, Authelia secret, real user database, SQLite file, PDF, or
FileBrowser runtime file should appear in the staged preview.

For the Raspberry Pi cutover:

1. Stop the current Compose deployment.
2. Rename the existing directory to `meta-webapp-pi-backup` rather than deleting
   it.
3. Clone the clean GitHub repository into a new `meta-webapp` directory.
4. Restore the Pi-owned runtime paths from the backup:

   ```text
   filebrowser/
   pdf-reader/data/
   authelia/db.sqlite3*
   authelia/notification.txt
   authelia/users_database.yml
   authelia/secrets/
   .env.open
   ```

5. Confirm ownership for UID and GID `1000`.
6. Run `./deploy.sh open --build`.
7. Verify Authelia login, FileBrowser files and accounts, PDF reading state, and
   hosted files before removing the backup.

Only the clean repository belongs on the Pi. The full-history archive contains
retired credentials and remains on the Mac.

## PDF Reader

The PDF Reader provides a shared browser-based magazine library with synchronized
document, page, and normalized on-page position state. PDF files are managed in
FileBrowser's root-level `Magazines` directory. The reader mounts that directory
read-only and stores reading state in `pdf-reader/data/pdf-reader.sqlite3`.

The developer reference is available in `pdf-reader/README.md`.

Stockfish scope cp interpretation:
https://github.com/official-stockfish/Stockfish/issues/5783
