#!/usr/bin/env bash
# Disables password login over SSH (root may still log in with a key). Run as root only after you have
# confirmed that key login works for the deploy user, or you will be locked out.
set -euo pipefail

if [ ! -s /home/deploy/.ssh/authorized_keys ]; then
  echo "No SSH key for deploy user; refusing to disable password login." >&2
  exit 1
fi

# sshd keeps the first value it reads and cloud images ship 50-cloud-init.conf, so sort first.
rm -f /etc/ssh/sshd_config.d/90-goprofile.conf
cat >/etc/ssh/sshd_config.d/01-goprofile.conf <<'EOF'
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
X11Forwarding no
EOF
usermod -aG sudo deploy
sshd -t && systemctl reload ssh || systemctl reload sshd
sshd -T | grep -iE "^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication) "
echo "SSH hardened. Log in as: ssh deploy@45.149.79.184 (or root with a key)"
