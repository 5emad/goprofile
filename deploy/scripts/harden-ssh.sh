#!/usr/bin/env bash
# Disables password and root login over SSH. Run as root only after you have
# confirmed that key login works for the deploy user, or you will be locked out.
set -euo pipefail

if [ ! -s /home/deploy/.ssh/authorized_keys ]; then
  echo "No SSH key for deploy user; refusing to disable password login." >&2
  exit 1
fi

cat >/etc/ssh/sshd_config.d/90-goprofile.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
X11Forwarding no
EOF
usermod -aG sudo deploy
sshd -t && systemctl reload ssh || systemctl reload sshd
echo "SSH hardened. Log in as: ssh deploy@goprofile.ir"
