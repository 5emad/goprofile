#!/usr/bin/env bash
# One-time server installation for Ubuntu/Debian. Run as root:
#   bash server-setup.sh you@example.com [version]
# It installs Docker, nginx, certbot, a firewall and fail2ban, creates the
# "deploy" user, clones the repo, issues the TLS certificate, schedules daily
# database backups and finally deploys the given version (default: main).
# Safe to run again: existing data, secrets and certificates are kept.
set -euo pipefail

EMAIL=${1:?usage: server-setup.sh <email-for-letsencrypt> [version]}
REF=${2:-main}
DOMAIN=goprofile.ir
APP_DIR=/opt/goprofile
REPO=${REPO:-git@github.com:5emad/goprofile.git}

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y upgrade
apt-get install -y ca-certificates curl git nginx certbot python3-certbot-nginx ufw fail2ban unattended-upgrades openssl rsync

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

# Firewall: SSH, HTTP and HTTPS only. Database and API stay private.
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# fail2ban for SSH brute force.
cat >/etc/fail2ban/jail.d/goprofile.conf <<'EOF'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
EOF
systemctl restart fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades

# Deploy user with docker access; copy root's authorized keys if present.
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
if [ -f /root/.ssh/authorized_keys ]; then
  install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
  install -m 600 -o deploy -g deploy /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
fi

# Repository (needs a GitHub deploy key for the private repo, see README).
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO" "$APP_DIR"
fi
chown -R deploy:deploy "$APP_DIR"

# Secrets.
if [ ! -f "$APP_DIR/deploy/.env" ]; then
  cp "$APP_DIR/deploy/.env.example" "$APP_DIR/deploy/.env"
  sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -hex 24)|" "$APP_DIR/deploy/.env"
  sed -i "s|^REPLICATION_PASSWORD=.*|REPLICATION_PASSWORD=$(openssl rand -hex 24)|" "$APP_DIR/deploy/.env"
  chmod 600 "$APP_DIR/deploy/.env"
  chown deploy:deploy "$APP_DIR/deploy/.env"
fi

# nginx: get the certificate first with a minimal HTTP server, then the full config.
install -d /var/www/certbot /var/www/goprofile
cat >/etc/nginx/sites-available/goprofile-bootstrap <<EOF
server { listen 80; server_name $DOMAIN www.$DOMAIN; location /.well-known/acme-challenge/ { root /var/www/certbot; } }
EOF
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/goprofile-bootstrap /etc/nginx/sites-enabled/goprofile
nginx -t && systemctl reload nginx
# The domain's DNS A records must already point to this server.
SERVER_IP=$(curl -fsS4 https://api.ipify.org || true)
DNS_IP=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}')
if [ -n "$SERVER_IP" ] && [ "$SERVER_IP" != "$DNS_IP" ]; then
  echo "Warning: $DOMAIN resolves to ${DNS_IP:-nothing}, this server is $SERVER_IP. Fix DNS if certbot fails." >&2
fi
certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" -d "www.$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive --keep-until-expiring

install -m 644 "$APP_DIR/deploy/nginx/goprofile-proxy.conf" /etc/nginx/snippets/goprofile-proxy.conf
install -m 644 "$APP_DIR/deploy/nginx/goprofile.conf" /etc/nginx/sites-available/goprofile
ln -sf /etc/nginx/sites-available/goprofile /etc/nginx/sites-enabled/goprofile
rm -f /etc/nginx/sites-available/goprofile-bootstrap
sed -i 's/# server_tokens off;/server_tokens off;/' /etc/nginx/nginx.conf
nginx -t && systemctl reload nginx
grep -q '^deploy-hook' /etc/letsencrypt/cli.ini 2>/dev/null || echo 'deploy-hook = systemctl reload nginx' >>/etc/letsencrypt/cli.ini
systemctl enable --now certbot.timer 2>/dev/null || true

# Daily database backup at 03:30, kept 30 days (see backup.sh / restore.sh).
install -d -m 750 -o deploy -g deploy /var/backups/goprofile
cat >/etc/cron.d/goprofile-backup <<EOF
30 3 * * * deploy bash $APP_DIR/deploy/scripts/backup.sh daily >>/var/log/goprofile-backup.log 2>&1
EOF
touch /var/log/goprofile-backup.log && chown deploy:deploy /var/log/goprofile-backup.log

chown -R deploy:deploy /var/www/goprofile
su - deploy -c "bash $APP_DIR/deploy/scripts/deploy.sh $REF"
echo "Installed. Open https://$DOMAIN"
echo "Updates later: su - deploy -c 'bash $APP_DIR/deploy/scripts/deploy.sh <version>'"
echo "After confirming SSH key login works, harden SSH with: bash $APP_DIR/deploy/scripts/harden-ssh.sh"
