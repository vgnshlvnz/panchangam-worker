# Ubuntu 24.04 LTS ISO Remastering Toolkit

Create a custom Ubuntu 24.04 Desktop ISO with extra software pre-installed — entirely from the command line. No GUI tools required.

## What It Does

1. Downloads the official Ubuntu 24.04 LTS Desktop ISO and verifies its SHA256 checksum
2. Extracts the ISO filesystem and unpacks the live squashfs (handles both single-file and layered formats)
3. Enters a `chroot` environment with proper bind mounts for `/dev`, `/proc`, `/sys`, `/run`
4. Installs your chosen packages inside the chroot
5. Rebuilds the squashfs with xz compression
6. Repacks a hybrid ISO that boots on **both BIOS and UEFI**

## Directory Layout

```
iso-remaster/
├── remaster.sh    # Main remastering script
├── test.sh        # QEMU boot testing script
└── README.md      # This file
```

## Prerequisites

### Packages to install

```bash
sudo apt update
sudo apt install -y \
  xorriso \
  squashfs-tools \
  qemu-system-x86 \
  ovmf \
  libguestfs-tools \
  isohybrid
```

| Tool | Purpose |
|------|---------|
| `xorriso` | ISO extraction and repacking |
| `squashfs-tools` | `unsquashfs` and `mksquashfs` for live filesystem |
| `qemu-system-x86_64` | Virtual machine for testing the remastered ISO |
| `ovmf` | UEFI firmware for QEMU (required for UEFI boot tests) |
| `libguestfs-tools` | (optional) Extra ISO inspection tools |

### Disk space

- **Downloaded ISO:** ~5 GB
- **Extracted workspace:** ~10–15 GB (temporary, cleaned up after)
- **Remastered ISO:** ~6–8 GB (depends on installed packages)

**Recommendation:** At least **25 GB free** on the working partition.

### Memory

- **Minimum:** 2 GB RAM (may be slow)
- **Recommended:** 4 GB+ RAM for chroot operations
- **For QEMU testing:** 4 GB RAM minimum, 8 GB+ recommended

### Permissions

- The remaster script must run as **root** (`sudo`) because it needs to bind-mount pseudo-filesystems and run `chroot`
- QEMU KVM requires your user to be in the `kvm` group: `sudo usermod -aG kvm $USER` (then relogin)

## Usage

### 1. Remaster the ISO

```bash
cd iso-remaster
sudo ./remaster.sh
```

The script will:
- Download the ISO (defaults to 24.04.2)
- Verify its checksum
- Extract, chroot, install packages, and rebuild

You can override the version:

```bash
sudo ISO_VERSION=24.04.1 ./remaster.sh
```

### 2. Test in QEMU

#### UEFI boot (default):
```bash
./test.sh --uefi
```

#### BIOS (Legacy) boot:
```bash
./test.sh --bios
```

#### Specify a custom ISO:
```bash
./test.sh --iso ../my-remastered.iso
```

#### Adjust VM resources:
```bash
./test.sh --uefi --ram 8192 --disk-size 128
```

> **Quit QEMU:** Press `Ctrl+A` then `X`

### 3. Custom package list

Edit the `PACKAGES` variable at the top of `remaster.sh`:

```bash
PACKAGES="git curl vim htop tmux neovim docker.io ..."
```

Then rerun:
```bash
sudo ./remaster.sh
```

## Default Package List

| Category | Packages |
|----------|----------|
| **Utilities** | git, curl, wget, jq, ripgrep, fd-find, rsync |
| **Monitoring** | htop, btop, iperf3, tcpdump, nmap |
| **Networking** | net-tools, dnsutils, wireguard-tools |
| **Dev Tools** | build-essential, python3-pip, python3-venv |
| **Containers** | docker.io, docker-compose-v2 |
| **Remote Access** | openssh-server, remmina |
| **Editor** | vim, neovim, tmux |
| **Media** | vlc |

## Troubleshooting

### "SHA256 verification failed"
- Your network may be intercepting the download (corporate proxy, captive portal)
- Try downloading the ISO manually and passing it to the script:
  ```bash
  curl -LO https://releases.ubuntu.com/24.04/ubuntu-24.04.2-desktop-amd64.iso
  # then modify ISO_URL in remaster.sh or download a cached copy
  ```

### "bind mount /proc failed"
- The script requires root (`sudo`). Run without sudo for other errors too.
- Ensure the kernel supports the required mount types.

### "chroot: failed to run command '/bin/bash': No such file or directory"
- The ISO extraction failed. Verify `EXTRACT_DIR` contains `/bin/bash`.
- Run `xorriso -osirron on -indev your.iso -extract / /tmp/extract_test` to debug.

### Layered squashfs unpack errors
```
unsquashfs: Error: Filesystem error ...
```
- Non-fatal for overlay layers; the script ignores errors from non-base layers.
- If the base layer fails, the ISO may be corrupted — re-download.

### "OVMF firmware not found"
```bash
sudo apt install ovmf
```
- For UEFI testing, you **must** have OVMF installed.
- BIOS mode (`--bios`) does not require OVMF.

### QEMU won't start with KVM error
```
qemu-system-x86_64: ... KVM not available
```
- Verify virtualization is enabled in your BIOS/UEFI
- Check you're in the `kvm` group: `groups $USER`
- For nested VMs (running inside a VM), KVM won't work — use `-cpu host` without `-enable-kvm`

### ISO doesn't boot in UEFI mode
- The script extracts El Torito boot params from the original ISO, so it should work
- If it fails, try the BIOS mode first to confirm the ISO is valid
- Make sure Secure Boot is disabled in your test system's firmware settings

### Disk full during remastering
- The script uses `mktemp` — check available space: `df -h /tmp`
- Specify an alternative temp location: `export TMPDIR=/path/to/larger/disk`

### apt-get update fails inside chroot
- Ensure DNS resolution works: check that `/etc/resolv.conf` was copied
- If behind a proxy, set `http_proxy`/`https_proxy` in the chroot script

### Slow build times
- The squashfs rebuild with xz compression is CPU-intensive
- Use `-comp gzip` in `mksquashfs` (edit the script) for faster builds at the cost of larger ISO
- Consider installing packages one group at a time

## Safety Notes

- The script cleans up its temp directory on exit (via `trap EXIT`)
- SSH host keys and machine-id are removed so each installation generates fresh ones
- No changes are made to your host system beyond the temp directory
- The ISO download is verified against the official Ubuntu SHA256SUMS file

## License

This toolkit is provided as-is. Ubuntu and its derivatives are licensed under the GPL. The scripts here are released under the MIT License.
