#!/usr/bin/env bash
# Server-side installer for E2E Drop. Run as root:  bash install.sh /path/to/deploy.env
#
# Idempotent and conservative: every step first checks whether it is actually needed and only then
# acts. Re-running updates the app, keeps the database, secrets and TLS certificate, and never
# rewrites configuration that has not changed. It touches only its own files and its own nginx site,
# so it is safe to run on a server that hosts other projects.
set -Eeuo pipefail

ENV_FILE="${1:-}"
# System paths; overridable only for testing (defaults are the real locations).
APP_DIR="${VD_APP_DIR:-/opt/e2e-drop}"
APP_USER=e2edrop
DB_NAME=e2e_drop
DB_USER=e2edrop
SERVICE=e2e-drop
APP_PORT=3000
LOG="${VD_LOG:-/var/log/e2e-drop-install.log}"
NGINX_AVAIL_DIR="${VD_NGINX_AVAIL:-/etc/nginx/sites-available}"
NGINX_ENABLED_DIR="${VD_NGINX_ENABLED:-/etc/nginx/sites-enabled}"
SYSTEMD_DIR="${VD_SYSTEMD:-/etc/systemd/system}"
LE_LIVE_DIR="${VD_LE_LIVE:-/etc/letsencrypt/live}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CURRENT_STEP="подготовка"
step() {
  CURRENT_STEP="$1"
  echo
  echo "==> $1"
}
note() { echo "    $*"; }
skip() { echo "    ✓ $* — уже настроено, пропускаю"; }
fail() {
  echo
  echo "ОШИБКА: $*" >&2
  echo "Полный лог установки: $LOG" >&2
  exit 1
}
on_error() {
  local rc=$? line=$1
  echo
  echo "ОШИБКА на шаге «${CURRENT_STEP}» (строка $line, код $rc)." >&2
  echo "Полный лог установки: $LOG" >&2
  exit "$rc"
}
trap 'on_error $LINENO' ERR
trap '[[ -n "$ENV_FILE" ]] && rm -f "$ENV_FILE"' EXIT

# Writes stdin to a file only when the content differs. Sets WROTE=1 when it changed, else WROTE=0,
# so callers can reload a service only when its configuration actually changed.
WROTE=0
write_if_changed() {
  local path="$1" tmp
  tmp="$(mktemp)"
  cat >"$tmp"
  if [[ -f "$path" ]] && cmp -s "$tmp" "$path"; then
    rm -f "$tmp"
    WROTE=0
  else
    cat "$tmp" >"$path"
    rm -f "$tmp"
    WROTE=1
  fi
}

# Hash of a directory's contents (names + bytes), ignoring build output and dependencies.
dir_hash() {
  (cd "$1" && find . -type f -not -path './node_modules/*' -not -path './dist/*' -print0 \
    | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum | cut -d' ' -f1)
}

[[ $EUID -eq 0 ]] || fail "Скрипт нужно запускать от root (или через sudo)."
[[ -n "$ENV_FILE" && -f "$ENV_FILE" ]] || fail "Не найден файл настроек: ${ENV_FILE:-<не указан>}"

touch "$LOG" && chmod 600 "$LOG"
exec > >(tee -a "$LOG") 2>&1
echo "----- $(date -Is) установка E2E Drop -----"

# ---------------------------------------------------------------------------
step "Проверка параметров"
sed -i 's/\r$//' "$ENV_FILE"
# shellcheck disable=SC1090
source "$ENV_FILE"
# An update may leave the S3 secret key empty: the one already on the server stays in use.
for env_src in "$APP_DIR/.env"; do
  [[ -n "${S3_SECRET_KEY:-}" || ! -f "$env_src" ]] && continue
  S3_SECRET_KEY="$(sed -n "s/^S3_SECRET_KEY='\(.*\)'$/\1/p" "$env_src" | head -n1)"
  [[ -n "$S3_SECRET_KEY" ]] && note "Secret Key не указан — использую сохранённый на сервере"
done
for var in S3_BUCKET S3_ACCESS_KEY S3_SECRET_KEY S3_REGION; do
  [[ -n "${!var:-}" ]] || fail "Не задан параметр $var"
done
DOMAIN="${DOMAIN:-}"
LE_EMAIL="${LE_EMAIL:-}"
S3_ENDPOINT="${S3_ENDPOINT:-}"
S3_FORCE_PATH_STYLE="${S3_FORCE_PATH_STYLE:-true}"
for var in DOMAIN LE_EMAIL S3_ENDPOINT S3_REGION S3_BUCKET S3_ACCESS_KEY S3_SECRET_KEY; do
  [[ "${!var}" != *"'"* && "${!var}" != *$'\n'* ]] || fail "Параметр $var не должен содержать кавычку ' или перевод строки"
done
if [[ -n "$DOMAIN" && ! "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]]; then
  fail "Некорректный домен: $DOMAIN"
fi
echo "Домен: ${DOMAIN:-<нет, доступ по IP>}"
echo "S3: bucket=$S3_BUCKET endpoint=${S3_ENDPOINT:-AWS} region=$S3_REGION"
[[ -d "$APP_DIR" ]] && note "Режим обновления: приложение уже установлено в $APP_DIR" || note "Режим установки: первый запуск"

# ---------------------------------------------------------------------------
step "Проверка операционной системы"
[[ -f /etc/os-release ]] || fail "Не удалось определить ОС"
# shellcheck disable=SC1091
. /etc/os-release
case "${ID:-}" in
  ubuntu | debian) echo "ОС: $PRETTY_NAME" ;;
  *) fail "Поддерживаются только Ubuntu и Debian (обнаружено: ${PRETTY_NAME:-неизвестно})" ;;
esac
command -v systemctl >/dev/null || fail "Требуется systemd"

# ---------------------------------------------------------------------------
step "Системные пакеты"
export DEBIAN_FRONTEND=noninteractive
APT=(apt-get -y -o DPkg::Lock::Timeout=600)
PACKAGES=(curl ca-certificates gnupg openssl rsync tar nginx postgresql)
[[ -n "$DOMAIN" && -n "$LE_EMAIL" ]] && PACKAGES+=(certbot python3-certbot-nginx)
MISSING=()
for pkg in "${PACKAGES[@]}"; do
  dpkg -s "$pkg" >/dev/null 2>&1 || MISSING+=("$pkg")
done
if ((${#MISSING[@]})); then
  note "Нужно установить: ${MISSING[*]}"
  "${APT[@]}" update || fail "apt-get update завершился с ошибкой — проверьте интернет и источники пакетов на сервере"
  "${APT[@]}" install "${MISSING[@]}" || fail "Не удалось установить пакеты: ${MISSING[*]}"
else
  skip "все нужные пакеты (${PACKAGES[*]}) установлены"
fi

# ---------------------------------------------------------------------------
step "Node.js"
NODE_MAJOR=0
command -v node >/dev/null && NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < 20 )); then
  note "Устанавливаю Node.js 22 (сейчас: ${NODE_MAJOR:-нет})"
  curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh ||
    fail "Не удалось скачать установщик Node.js (deb.nodesource.com)"
  bash /tmp/nodesource_setup.sh || fail "Не удалось подключить репозиторий Node.js"
  rm -f /tmp/nodesource_setup.sh
  "${APT[@]}" install nodejs || fail "Не удалось установить Node.js"
else
  skip "Node.js $(node -v) подходит (нужен ≥ 20)"
fi
echo "Node.js $(node -v), npm $(npm -v)"
NODE_BIN="$(command -v node)"

# ---------------------------------------------------------------------------
step "Копирование приложения в $APP_DIR"
id -u "$APP_USER" >/dev/null 2>&1 ||
  useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR"
CODE_CHANGED=0
for part in server client vqd; do
  [[ -d "$SRC_DIR/$part" ]] || fail "В архиве нет папки $part"
  # -i reports whether rsync transferred anything; we watch for any change to decide on a rebuild/restart.
  out="$(rsync -rlptD --omit-dir-times -i --delete --exclude node_modules --exclude dist --exclude .env "$SRC_DIR/$part/" "$APP_DIR/$part/")"
  [[ -n "$out" ]] && CODE_CHANGED=1
done
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
(( CODE_CHANGED )) && note "Исходники изменились" || skip "исходники не изменились"

# ---------------------------------------------------------------------------
step "PostgreSQL"
systemctl enable --now postgresql >/dev/null 2>&1 || true
for _ in $(seq 1 30); do
  runuser -u postgres -- psql -tAc 'SELECT 1' >/dev/null 2>&1 && break
  sleep 1
done
runuser -u postgres -- psql -tAc 'SELECT 1' >/dev/null 2>&1 || fail "PostgreSQL не запустился (см. journalctl -u postgresql)"

ENV_TARGET="$APP_DIR/.env"
existing() { [[ -f "$ENV_TARGET" ]] && sed -n "s/^$1='\(.*\)'$/\1/p" "$ENV_TARGET" | head -n1 || true; }
DB_PASS="$(existing DB_PASSWORD)"
APP_SECRET="$(existing APP_SECRET)"
SITE_HASH="$(existing SITE_PASSWORD_HASH)"
[[ -n "$DB_PASS" ]] || DB_PASS="$(openssl rand -hex 24)"
[[ -n "$APP_SECRET" ]] || APP_SECRET="$(openssl rand -hex 32)"

psql_admin() { (cd / && runuser -u postgres -- psql -v ON_ERROR_STOP=1 -qtA "$@"); }
if [[ "$(psql_admin -c "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'")" != "1" ]]; then
  note "Создаю роль $DB_USER"
  psql_admin -c "CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS'"
else
  # Keep the role's password in sync with the stored one (no-op when unchanged).
  psql_admin -c "ALTER ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS'"
  skip "роль $DB_USER существует"
fi
if [[ "$(psql_admin -c "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")" != "1" ]]; then
  note "Создаю базу $DB_NAME"
  psql_admin -c "CREATE DATABASE $DB_NAME OWNER $DB_USER"
else
  skip "база $DB_NAME существует"
fi

# ---------------------------------------------------------------------------
# Site password: only its scrypt hash goes into .env; the password itself is dropped right away.
case "${SITE_PASSWORD_MODE:-keep}" in
  set)
    [[ ${#SITE_PASSWORD} -ge 8 ]] || fail "Пароль на вход в сайт короче 8 символов"
    SITE_HASH="$(printf '%s' "$SITE_PASSWORD" | "$NODE_BIN" "$APP_DIR/server/scripts/hash-site-password.js")" ||
      fail "Не удалось вычислить хэш пароля на вход в сайт"
    note "Пароль на вход в сайт задан (все прежние входы сброшены)"
    ;;
  off)
    [[ -n "$SITE_HASH" ]] && note "Пароль на вход в сайт отключён" || skip "пароль на вход в сайт не задан"
    SITE_HASH=""
    ;;
  keep)
    [[ -n "$SITE_HASH" ]] && skip "пароль на вход в сайт не меняется" || skip "пароль на вход в сайт не задан"
    ;;
  *) fail "Неизвестный режим пароля сайта: ${SITE_PASSWORD_MODE}" ;;
esac
unset SITE_PASSWORD

# ---------------------------------------------------------------------------
step "Конфигурация приложения (.env)"
NEW_ENV="$(cat <<EOF
NODE_ENV='production'
HOST='127.0.0.1'
PORT='$APP_PORT'
DB_PASSWORD='$DB_PASS'
DATABASE_URL='postgres://$DB_USER:$DB_PASS@127.0.0.1:5432/$DB_NAME'
APP_SECRET='$APP_SECRET'
S3_ENDPOINT='$S3_ENDPOINT'
S3_REGION='$S3_REGION'
S3_BUCKET='$S3_BUCKET'
S3_ACCESS_KEY='$S3_ACCESS_KEY'
S3_SECRET_KEY='$S3_SECRET_KEY'
S3_FORCE_PATH_STYLE='$S3_FORCE_PATH_STYLE'
SITE_PASSWORD_HASH='$SITE_HASH'
EOF
)"
write_if_changed "$ENV_TARGET" <<<"$NEW_ENV"
ENV_CHANGED=$WROTE
chown root:"$APP_USER" "$ENV_TARGET"
chmod 640 "$ENV_TARGET"
(( ENV_CHANGED )) && note "Настройки обновлены" || skip "настройки не изменились"

# ---------------------------------------------------------------------------
as_app() { runuser -u "$APP_USER" -- env HOME="$APP_DIR" npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false "$@"; }
# Installs dependencies only when the lockfile changed or node_modules is missing. Markers live in
# $APP_DIR root (not inside the rsync'd subfolders), so --delete never wipes them between runs.
npm_install_if_needed() {
  local dir="$1" name="$2"; shift 2
  local marker="$APP_DIR/.deploy-deps-$name.sha" lock="$dir/package-lock.json" want=""
  [[ -f "$lock" ]] && want="$(sha256sum "$lock" | cut -d' ' -f1)"
  if [[ -d "$dir/node_modules" && -n "$want" && -f "$marker" && "$(cat "$marker")" == "$want" ]]; then
    skip "зависимости в $name актуальны"
    return 0
  fi
  note "Устанавливаю зависимости в $name"
  if [[ -f "$lock" ]]; then
    (cd "$dir" && as_app npm ci "$@")
  else
    (cd "$dir" && as_app npm install "$@")
  fi
  [[ -n "$want" ]] && printf '%s' "$want" >"$marker"
}

step "Зависимости сервера"
npm_install_if_needed "$APP_DIR/server" server --omit=dev || fail "npm не смог установить зависимости сервера"

step "Сборка веб-интерфейса"
# Rebuild only when the client/vqd sources changed or the build output is missing.
BUILD_MARKER="$APP_DIR/.deploy-build.sha"
BUILD_WANT="$(dir_hash "$APP_DIR/client")-$(dir_hash "$APP_DIR/vqd")"
if [[ -d "$APP_DIR/client/dist" && -f "$BUILD_MARKER" && "$(cat "$BUILD_MARKER")" == "$BUILD_WANT" ]]; then
  skip "интерфейс уже собран из этих исходников"
else
  npm_install_if_needed "$APP_DIR/client" client || fail "npm не смог установить зависимости клиента"
  note "Собираю интерфейс"
  (cd "$APP_DIR/client" && as_app npm run build) ||
    fail "Сборка интерфейса не удалась (если на сервере мало памяти — добавьте swap)"
  printf '%s' "$BUILD_WANT" >"$BUILD_MARKER"
fi

# ---------------------------------------------------------------------------
step "Проверка доступа к S3"
(cd "$APP_DIR/server" && runuser -u "$APP_USER" -- "$NODE_BIN" --env-file="$ENV_TARGET" scripts/check-s3.js) ||
  fail "Нет доступа к S3-бакету. Проверьте endpoint, регион, имя бакета и ключи, затем запустите развёртывание снова."

# ---------------------------------------------------------------------------
step "Служба systemd"
NEW_UNIT="$(cat <<EOF
[Unit]
Description=E2E Drop
After=network-online.target postgresql.service
Wants=network-online.target postgresql.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/server
EnvironmentFile=$ENV_TARGET
ExecStart=$NODE_BIN src/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR

[Install]
WantedBy=multi-user.target
EOF
)"
write_if_changed "$SYSTEMD_DIR/$SERVICE.service" <<<"$NEW_UNIT"
UNIT_CHANGED=$WROTE
(( UNIT_CHANGED )) && { note "Юнит обновлён"; systemctl daemon-reload; } || skip "юнит не изменился"
systemctl enable "$SERVICE" >/dev/null 2>&1 || true

# Restart only when something that affects the running process changed; otherwise just ensure it runs.
if (( UNIT_CHANGED || ENV_CHANGED || CODE_CHANGED )); then
  note "Перезапускаю службу (были изменения)"
  systemctl restart "$SERVICE"
elif ! systemctl is-active --quiet "$SERVICE"; then
  note "Служба не запущена — запускаю"
  systemctl start "$SERVICE"
else
  skip "служба работает, изменений нет — перезапуск не нужен"
fi

echo "Ожидание ответа приложения..."
for _ in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:$APP_PORT/api/health" >/dev/null 2>&1 && break
  sleep 1
done
if ! curl -fsS "http://127.0.0.1:$APP_PORT/api/health" >/dev/null 2>&1; then
  journalctl -u "$SERVICE" -n 40 --no-pager || true
  fail "Приложение не отвечает (лог выше: journalctl -u $SERVICE)"
fi
echo "Приложение отвечает"

# ---------------------------------------------------------------------------
# nginx: we manage ONLY our own site file and never claim other projects' traffic.
#  - with a domain: server_name = DOMAIN, no default_server, other vhosts untouched;
#  - by IP: use default_server only when no other site already is the default on port 80.
step "nginx"
SITE_AVAIL="$NGINX_AVAIL_DIR/$SERVICE"
SITE_ENABLED="$NGINX_ENABLED_DIR/$SERVICE"

PROXY_BLOCK=$(cat <<EOF
    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
EOF
)

DEFAULT_TOKEN=""
if [[ -z "$DOMAIN" ]]; then
  SERVER_NAME="_"
  # Is another enabled site already the default_server on :80? If so, do not fight it.
  OTHER_DEFAULT="$(grep -RlE 'listen[^;]*\bdefault_server\b' "$NGINX_ENABLED_DIR"/ 2>/dev/null | grep -v "/$SERVICE\$" || true)"
  if [[ -n "$OTHER_DEFAULT" ]]; then
    note "На :80 уже есть default_server ($(basename "$OTHER_DEFAULT")) — не перехватываю его."
    note "Сервис будет отвечать по IP, только если других подходящих сайтов нет."
  else
    DEFAULT_TOKEN=" default_server"
    # Remove the stock Debian default only when we are taking the default and it is the packaged one.
    if [[ -L "$NGINX_ENABLED_DIR/default" ]]; then
      note "Отключаю стандартный сайт nginx (освобождаю default_server)"
      rm -f "$NGINX_ENABLED_DIR/default"
    fi
  fi
else
  SERVER_NAME="$DOMAIN"
fi

LISTEN6_80=""
[[ -s /proc/net/if_inet6 ]] && LISTEN6_80="    listen [::]:80${DEFAULT_TOKEN};"

render_http() { # $1 = redirect-to-https (1/0)
  echo "server {"
  echo "    listen 80${DEFAULT_TOKEN};"
  [[ -n "$LISTEN6_80" ]] && echo "$LISTEN6_80"
  echo "    server_name $SERVER_NAME;"
  # No access log and only critical errors: the server keeps no record of client IP addresses.
  echo "    access_log off;"
  echo "    error_log /var/log/nginx/error.log crit;"
  echo "    client_max_body_size 520m;"
  echo "    server_tokens off;"
  if [[ "$1" == 1 ]]; then
    echo "    location /.well-known/acme-challenge/ { root /var/www/html; }"
    echo "    location / { return 301 https://\$host\$request_uri; }"
  else
    echo "$PROXY_BLOCK"
  fi
  echo "}"
}

render_https() {
  local v6=""
  [[ -s /proc/net/if_inet6 ]] && v6="    listen [::]:443 ssl;"
  echo "server {"
  echo "    listen 443 ssl;"
  [[ -n "$v6" ]] && echo "$v6"
  echo "    http2 on;"
  echo "    server_name $SERVER_NAME;"
  # No access log and only critical errors: the server keeps no record of client IP addresses.
  echo "    access_log off;"
  echo "    error_log /var/log/nginx/error.log crit;"
  echo "    client_max_body_size 520m;"
  echo "    server_tokens off;"
  echo "    ssl_certificate $LE_LIVE_DIR/$DOMAIN/fullchain.pem;"
  echo "    ssl_certificate_key $LE_LIVE_DIR/$DOMAIN/privkey.pem;"
  [[ -f /etc/letsencrypt/options-ssl-nginx.conf ]] && echo "    include /etc/letsencrypt/options-ssl-nginx.conf;"
  [[ -f /etc/letsencrypt/ssl-dhparams.pem ]] && echo "    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;"
  echo "$PROXY_BLOCK"
  echo "}"
}

cert_valid() {
  [[ -n "$DOMAIN" ]] || return 1
  local pem="$LE_LIVE_DIR/$DOMAIN/fullchain.pem"
  [[ -f "$pem" ]] && openssl x509 -checkend $((30 * 24 * 3600)) -noout -in "$pem" >/dev/null 2>&1
}

reload_nginx_if_changed() {
  ln -sf "$SITE_AVAIL" "$SITE_ENABLED"
  if (( WROTE )); then
    nginx -t || fail "Ошибка в конфигурации nginx (наш сайт не применён, остальные не тронуты)"
    systemctl enable nginx >/dev/null 2>&1 || true
    systemctl reload nginx 2>/dev/null || systemctl restart nginx
    note "Конфигурация nginx обновлена"
  else
    skip "конфигурация nginx не изменилась"
  fi
}

SCHEME=http
WANT_HTTPS=0
[[ -n "$DOMAIN" && -n "$LE_EMAIL" ]] && WANT_HTTPS=1

if (( WANT_HTTPS )) && cert_valid; then
  # Certificate already present and valid: write the full HTTP+HTTPS config straight away.
  write_if_changed "$SITE_AVAIL" <<<"$(render_http 1; echo; render_https)"
  reload_nginx_if_changed
  SCHEME=https
  skip "SSL-сертификат для $DOMAIN уже есть и действует (перевыпуск не нужен)"
else
  # No usable certificate yet (or HTTP-only): write the HTTP site first so the app is reachable.
  write_if_changed "$SITE_AVAIL" <<<"$(render_http 0)"
  reload_nginx_if_changed
fi

if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 'Nginx Full' >/dev/null 2>&1 || true
  note "Файрвол ufw: порты 80/443 открыты"
fi

# ---------------------------------------------------------------------------
if (( WANT_HTTPS )) && ! cert_valid; then
  step "SSL-сертификат Let's Encrypt"
  note "Запрашиваю сертификат для $DOMAIN (certonly — конфиг других сайтов не трогается)"
  # RSA with the chain to ISRG Root X1: link-preview crawlers (Telegram, WhatsApp, Facebook) with older TLS
  # stacks cannot always complete a handshake with an ECDSA-only certificate on the newer chain.
  if certbot certonly --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$LE_EMAIL" --keep-until-expiring \n    --key-type rsa --rsa-key-size 2048 --preferred-chain "ISRG Root X1"; then
    # Certificate obtained: switch our site to HTTP→HTTPS + the HTTPS server.
    write_if_changed "$SITE_AVAIL" <<<"$(render_http 1; echo; render_https)"
    reload_nginx_if_changed
    SCHEME=https
    note "Сертификат получен, HTTPS включён"
  else
    echo "ПРЕДУПРЕЖДЕНИЕ: сертификат получить не удалось. Убедитесь, что A-запись $DOMAIN указывает на этот сервер,"
    echo "и запустите развёртывание ещё раз. Сайт пока работает по HTTP."
  fi
fi

PUBLIC_HOST="${DOMAIN:-$(curl -fsS -4 --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')}"
echo
echo "=============================================="
echo " Готово! E2E Drop доступен по адресу:"
echo "   $SCHEME://$PUBLIC_HOST/"
echo "=============================================="
