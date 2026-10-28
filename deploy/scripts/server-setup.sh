#!/usr/bin/env bash
# One-time server preparation for Ubuntu/Debian. Run as root:
#   bash server-setup.sh you@example.com
# It installs Docker, nginx, certbot, a firewall and fail2ban, creates the
# "deploy" user, clones the repo and issues the TLS certificate.
set -euo pipefail

EMAIL=${1:?usage: server-setup.sh <email-for-letsencrypt>}
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
certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" -d "www.$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive

install -m 644 "$APP_DIR/deploy/nginx/goprofile-proxy.conf" /etc/nginx/snippets/goprofile-proxy.conf
install -m 644 "$APP_DIR/deploy/nginx/goprofile.conf" /etc/nginx/sites-available/goprofile
ln -sf /etc/nginx/sites-available/goprofile /etc/nginx/sites-enabled/goprofile
rm -f /etc/nginx/sites-available/goprofile-bootstrap
sed -i 's/# server_tokens off;/server_tokens off;/' /etc/nginx/nginx.conf
nginx -t && systemctl reload nginx
echo 'deploy-hook = systemctl reload nginx' >>/etc/letsencrypt/cli.ini

chown -R deploy:deploy /var/www/goprofile
echo "Done. Next: su - deploy -c 'bash $APP_DIR/deploy/scripts/deploy.sh'"
echo "Then harden SSH with: bash $APP_DIR/deploy/scripts/harden-ssh.sh"
