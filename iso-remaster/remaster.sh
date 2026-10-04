#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# remaster.sh — Ubuntu 24.04 LTS Desktop ISO Remastering Script
#
# Downloads the official ISO, extracts it, installs extra packages via chroot,
# and rebuilds a hybrid BIOS+UEFI ISO.
#
# Usage: sudo ./remaster.sh [ISO_VERSION]
#   ISO_VERSION defaults to 24.04.2
#
# Prerequisites: xorriso, squashfs-tools, qemu-system-x86, ovmf
#   (see README.md)
###############################################################################

# ── Configuration ────────────────────────────────────────────────────────────
ISO_VERSION="${ISO_VERSION:-24.04.2}"
ISO_NAME="ubuntu-${ISO_VERSION}-desktop-amd64.iso"
ISO_URL="https://releases.ubuntu.com/${ISO_VERSION}/${ISO_NAME}"
SHA256_URL="https://releases.ubuntu.com/${ISO_VERSION}/SHA256SUMS"
PACKAGES="git curl wget htop btop tmux vim neovim jq ripgrep fd-find rsync \
  net-tools dnsutils nmap iperf3 tcpdump build-essential \
  python3-pip python3-venv docker.io docker-compose-v2 \
  openssh-server wireguard-tools vlc remmina"

WORK_DIR="$(mktemp -d -t remaster.XXXXXXXXXX)"
ISO_FILE=""
EXTRACT_DIR=""
CHROOT_DIR=""
IS_LAYERED=0   # 0=single file, 1=layered directory

# ── Logging helpers ──────────────────────────────────────────────────────────
log()  { printf '[*] %s\n' "$*"; }
logok(){ printf '[+] %s\n' "$*"; }
logerr(){ printf '[!] %s\n' "$*" >&2; }

# ── Cleanup trap — unmount & remove temp dir on any exit ─────────────────────
cleanup() {
    log "Cleaning up mount points …"
    local mp
    for mp in \
        "$CHROOT_DIR"/dev/pts \
        "$CHROOT_DIR"/dev    \
        "$CHROOT_DIR"/proc   \
        "$CHROOT_DIR"/sys    \
        "$CHROOT_DIR"/run
    do
        if mountpoint -q "$mp" 2>/dev/null; then
            umount "$mp" 2>/dev/null || true
        fi
    done
    if [[ -d "$WORK_DIR" ]]; then
        rm -rf "$WORK_DIR"
        log "Removed temp directory $WORK_DIR"
    fi
}
trap cleanup EXIT

# ── Prerequisite check ───────────────────────────────────────────────────────
check_prereqs() {
    local missing=()
    local cmd
    for cmd in sha256sum xorriso unsquashfs mksquashfs chroot mount umount \
               curl qemu-system-x86_64; do
        command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
    done
    # Check for OVMF (warn only — BIOS mode doesn't need it)
    if ! ls /usr/share/OVMF/* >/dev/null 2>&1; then
        logerr "Warning: OVMF firmware not found — UEFI testing will fail"
    fi
    if (( ${#missing[@]} )); then
        logerr "Missing prerequisites: ${missing[*]}"
        logerr "Install them — see README.md for details."
        exit 1
    fi
    logok "All prerequisites present"
}

# ══════════════════════════════════════════════════════════════════════════════
# Step 1: Download & verify ISO
# ══════════════════════════════════════════════════════════════════════════════
download_iso() {
    log "=== Step 1: Downloading ISO ==="
    local iso_dir
    iso_dir="$(mktemp -d)"
    ISO_FILE="${iso_dir}/${ISO_NAME}"

    if [[ -f "$ISO_FILE" ]]; then
        log "  ISO already present: $ISO_FILE — skipping download"
    else
        log "  Downloading $ISO_URL"
        curl -fSL --progress-bar -o "$ISO_FILE" "$ISO_URL"
        logok "  Downloaded $(du -h "$ISO_FILE" | cut -f1)"
    fi

    # Verify SHA256 against official checksums
    log "  Verifying SHA256 …"
    local sha_file="${iso_dir}/SHA256SUMS"
    curl -fSL -o "$sha_file" "$SHA256_URL"
    (
        cd "$iso_dir"
        if sha256sum -c SHA256SUMS --ignore-missing 2>&1 \
               | grep -qi ": OK"; then
            logok "  SHA256 verified — ISO is authentic"
        else
            logerr "SHA256 verification FAILED!"
            exit 1
        fi
    )
}

# ══════════════════════════════════════════════════════════════════════════════
# Step 2: Extract ISO with xorriso
# ══════════════════════════════════════════════════════════════════════════════
extract_iso() {
    log "=== Step 2: Extracting ISO ==="
    EXTRACT_DIR="${WORK_DIR}/extracted"
    mkdir -p "$EXTRACT_DIR"

    xorriso -osirron on -indev "$ISO_FILE" \
        -extract / "$EXTRACT_DIR" \
        2>/dev/null
    logok "  Extracted ISO tree to $EXTRACT_DIR"
    log "  Contents: $(ls "$EXTRACT_DIR")"
}

# ══════════════════════════════════════════════════════════════════════════════
# Step 3: Detect & unpack live filesystem (single or layered squashfs)
# ══════════════════════════════════════════════════════════════════════════════
unpack_livefs() {
    log "=== Step 3: Unpacking live filesystem ==="
    CHROOT_DIR="${WORK_DIR}/chroot"
    mkdir -p "$CHROOT_DIR"

    local casper_dir="${EXTRACT_DIR}/casper"

    if [[ -f "${casper_dir}/filesystem.squashfs" ]]; then
        # ── Format A: single filesystem.squashfs file (Ubuntu < 24.04) ──
        log "  Format A: single filesystem.squashfs detected"
        unsquashfs -d "$CHROOT_DIR" \
            "${casper_dir}/filesystem.squashfs" 2>&1 | tail -2
        IS_LAYERED=0
    elif [[ -d "${casper_dir}/filesystem.squashfs" ]]; then
        # ── Format B: layered squashfs directory (Ubuntu 24.04+) ──
        log "  Format B: layered filesystem.squashfs directory detected"
        unpack_layers "$casper_dir"
        IS_LAYERED=1
    else
        logerr "No filesystem.squashfs found in casper/"
        logerr "Directory contents:"
        ls -laR "${casper_dir}/" 2>/dev/null || true
        exit 1
    fi
    logok "  Live filesystem unpacked to $CHROOT_DIR"
    log "  Packed size: $(du -sh "$CHROOT_DIR" | cut -f1)"
}

unpack_layers() {
    local casper_dir="$1"
    local layer first=1
    local -a layers

    # Sort layers numerically so base (0) comes first
    layers=( $(find "${casper_dir}"/filesystem.squashfs \
               -maxdepth 1 -name '*.squashfs' \
               -printf '%f\n' | sort -V | sed "s|^|${casper_dir}/filesystem.squashfs/|") )

    if (( ${#layers[@]} == 0 )); then
        logerr "No .squashfs files found in filesystem.squashfs/"
        ls -la "${casper_dir}/filesystem.squashfs/" || true
        exit 1
    fi

    for layer in "${layers[@]}"; do
        if (( first )); then
            log "    Extracting base layer: $(basename "$layer")"
            unsquashfs -d "$CHROOT_DIR" "$layer" 2>&1 | tail -1
            first=0
        else
            log "    Merging overlay layer: $(basename "$layer")"
            unsquashfs -no-xattrs -no-sparse -d "$CHROOT_DIR" \
                "$layer" 2>/dev/null || true
        fi
    done
    logok "  All layers merged into $CHROOT_DIR"
}

# ══════════════════════════════════════════════════════════════════════════════
# Step 4: Bind-mount filesystems & enter chroot
# ══════════════════════════════════════════════════════════════════════════════
setup_chroot() {
    log "=== Step 4: Setting up chroot ==="

    # Ensure mount points exist
    local dst
    for dst in dev dev/pts proc sys run; do
        mkdir -p "${CHROOT_DIR}/${dst}"
    done

    # Bind-mount host pseudo-filesystems
    for dst in dev/pts dev proc sys; do
        if ! mount --bind "/${dst}" "${CHROOT_DIR}/${dst}" 2>/dev/null; then
            logerr "  bind mount /${dst} skipped (may need root)"
        fi
    done
    # /run may be a symlink; handle carefully
    if ! mount --bind /run "${CHROOT_DIR}/run" 2>/dev/null; then
        logerr "  bind mount /run skipped"
    fi

    # Copy resolv.conf so apt-get update works inside chroot
    if [[ -f /etc/resolv.conf ]]; then
        cp /etc/resolv.conf "${CHROOT_DIR}/etc/resolv.conf"
    fi

    logok "  Bind mounts active"
}

# ══════════════════════════════════════════════════════════════════════════════
# Step 5: Install packages inside chroot
# ══════════════════════════════════════════════════════════════════════════════
install_packages() {
    log "=== Step 5: Installing packages inside chroot ==="

    # Build deduplicated, sorted package list
    local pkg_list
    pkg_list="$(echo "$PACKAGES" | tr ' ' '\n' \
               | awk '!seen[$0]++' \
               | sort \
               | tr '\n' ' ')"

    log "  Installing ${#pkg_list//[^ ]/} unique packages …"

    # Run inside chroot with the package list expanded
    chroot "$CHROOT_DIR" bash -c "
set -euo pipefail

# Fix dpkg if interrupted
dpkg --configure -a 2>/dev/null || true

# Remove machine-id and SSH host keys so they regenerate on first boot
rm -f /etc/machine-id
rm -f /etc/ssh/ssh_host_*_key /etc/ssh/ssh_host_*_key.pub 2>/dev/null || true

export DEBIAN_FRONTEND=noninteractive

# Update package index
apt-get update -y

# Install requested packages
apt-get install -y ${pkg_list}

# Clean up apt cache
apt-get clean
rm -rf /var/lib/apt/lists/*

# Regenerate a fresh machine-id
if command -v systemd-machine-id-setup >/dev/null 2>&1; then
    systemd-machine-id-setup
else
    head -c 32 /dev/urandom | xxd -p | tr -d '\n' > /etc/machine-id
fi
"

    logok "  Packages installed, chroot cleaned"
}

# ══════════════════════════════════════════════════════════════════════════════
# Step 6: Rebuild squashfs, update metadata
# ══════════════════════════════════════════════════════════════════════════════
rebuild_squashfs() {
    log "=== Step 6: Rebuilding squashfs & updating metadata ==="
    local casper_dir="${EXTRACT_DIR}/casper"

    local out_squash
    if (( IS_LAYERED )); then
        # Layered directory — rebuilt squashfs goes inside the directory
        out_squash="${casper_dir}/filesystem.squashfs/filesystem.squashfs"
    else
        out_squash="${casper_dir}/filesystem.squashfs"
    fi

    # Remove any old squashfs files in the layered directory
    if (( IS_LAYERED )); then
        find "${casper_dir}/filesystem.squashfs" -maxdepth 1 \
             -name '*.squashfs' -delete
    fi

    log "  Building filesystem.squashfs (xz, dict=100%) …"
    mksquashfs "$CHROOT_DIR" "$out_squash" \
        -noappend \
        -comp xz \
        -Xdict-size 100% \
        -b 262144 \
        -no-duplicate-inode-resolve \
        -no-progress

    # Update filesystem.size
    local new_size
    new_size=$(stat -c%s "$out_squash")
    echo "$new_size" > "${casper_dir}/filesystem.size"

    # Regenerate md5sum.txt for the ISO tree
    log "  Regenerating md5sum.txt …"
    (
        cd "$EXTRACT_DIR"
        find . -type f ! -name 'md5sum.txt' -printf '%P\n' \
            | LC_ALL=C sort \
            | xargs -r md5sum \
            > md5sum.txt.new
        mv md5sum.txt.new md5sum.txt
    )

    logok "  Squashfs rebuilt ($(du -h "$out_squash" | cut -f1)), metadata updated"
}

# ══════════════════════════════════════════════════════════════════════════════
# Step 7: Repack hybrid ISO (BIOS + UEFI)
# ══════════════════════════════════════════════════════════════════════════════
repack_iso() {
    log "=== Step 7: Repacking hybrid ISO ==="

    # Find ISOLINUX mbr template
    local isolinux_mbr
    isolinux_mbr="/usr/lib/ISOLINUX/isohdpfx.bin"
    if [[ ! -f "$isolinux_mbr" ]]; then
        isolinux_mbr=$(find /usr/lib -name 'isohdpfx.bin' 2>/dev/null | head -1)
    fi
    if [[ -z "${isolinux_mbr}" ]]; then
        logerr "Could not find isohdpfx.bin — BIOS boot may not work"
    fi

    # Create rebuild working copy
    local rebuild_dir="${WORK_DIR}/rebuild"
    mkdir -p "$rebuild_dir"
    cp -a "$EXTRACT_DIR"/. "$rebuild_dir"/

    local output_iso="${WORK_DIR}/ubuntu-remastered-${ISO_VERSION}.iso"

    # Extract original El Torito boot parameters
    local boot_params
    boot_params=$(xorriso -indev "$ISO_FILE" \
        -report_el_torito as_mkisofs 2>/dev/null)

    # Pass boot params via environment so mkisofs reads them
    # Use printf '%q' to properly quote the params for eval
    local boot_args
    boot_args="$(printf '%q' "$boot_params")"

    log "  Repacking ISO …"
    xorriso -as mkisofs \
        ${boot_params} \
        -isohybrid-mbr "${isolinux_mbr}" \
        -c boot.cat \
        -o "$output_iso" \
        "$rebuild_dir" \
        2>&1 | tail -3

    logok "  Remastered ISO written: $output_iso"
    logok "  ISO size: $(du -h "$output_iso" | cut -f1)"

    echo ""
    echo "========================================================"
    echo "  Remastering complete!"
    echo "  Output ISO: $output_iso"
    echo "  Size:       $(du -h "$output_iso" | cut -f1)"
    echo "========================================================"
}

# ══════════════════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════════════════
main() {
    log "========================================================"
    log "  Ubuntu ${ISO_VERSION} ISO Remastering"
    log "  Packages: ${PACKAGES}"
    log "  Work dir: ${WORK_DIR}"
    log "========================================================"
    echo ""

    check_prereqs
    download_iso
    extract_iso
    unpack_livefs
    setup_chroot
    install_packages
    rebuild_squashfs
    repack_iso
}

main "$@"
