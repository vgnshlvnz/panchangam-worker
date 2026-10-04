#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# test.sh — Boot the remastered ISO in QEMU with KVM
#
# Usage:
#   ./test.sh [--bios] [--uefi] [--iso PATH] [--disk-size GB]
#
# Defaults: UEFI, last ISO in working directory, 64 GB disk
###############################################################################

# ── Defaults ─────────────────────────────────────────────────────────────────
MODE="uefi"              # uefi | bios
ISO=""                   # auto-detect
DISK_SIZE="${DISK_SIZE:-64}"   # GB
RAM="${RAM:-4096}"       # MB (4 GB)
DISK_FILE=""
OVMF_CODE=""
OVMF_VARS_COPY=""

# ── Help / usage ─────────────────────────────────────────────────────────────
usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Options:
  --bios            Test with BIOS (legacy) boot
  --uefi            Test with UEFI boot (default)
  --iso PATH        Path to remastered ISO (auto-detect if omitted)
  --disk-size N     Virtual disk size in GB (default: 64)
  --ram N           Guest RAM in MB (default: 4096 = 4 GB)
  -h, --help        Show this help

Examples:
  $0                          # UEFI boot, auto-detect ISO
  $0 --bios                   # BIOS (Legacy) boot
  $0 --uefi --iso ./my.iso    # UEFI with specific ISO
EOF
    exit 0
}

# ── Parse arguments ──────────────────────────────────────────────────────────
while (( $# )); do
    case "$1" in
        --bios)      MODE="bios" ;;
        --uefi)      MODE="uefi" ;;
        --iso)       ISO="$2"; shift ;;
        --disk-size) DISK_SIZE="$2"; shift ;;
        --ram)       RAM="$2"; shift ;;
        -h|--help)   usage ;;
        *)           echo "Unknown option: $1"; usage ;;
    esac
    shift
done

# ── Find ISO ─────────────────────────────────────────────────────────────────
if [[ -z "$ISO" ]]; then
    ISO="$(find . -maxdepth 2 -name 'ubuntu-remastered-*.iso' -type f 2>/dev/null \
           | sort -r | head -1)"
    if [[ -z "$ISO" ]]; then
        echo "ERROR: No remastered ISO found. Run remaster.sh first or specify --iso PATH"
        exit 1
    fi
fi

ISO="$(realpath "$ISO")"
if [[ ! -f "$ISO" ]]; then
    echo "ERROR: ISO not found: $ISO"
    exit 1
fi

DISK_FILE="$(mktemp -d)/qemu_disk.qcow2"

# ── Cleanup trap ─────────────────────────────────────────────────────────────
cleanup_test() {
    rm -f "$DISK_FILE" "$OVMF_VARS_COPY" 2>/dev/null || true
}
trap cleanup_test EXIT

# ── Create virtual disk ──────────────────────────────────────────────────────
if [[ ! -f "$DISK_FILE" ]]; then
    qemu-img create -f qcow2 "$DISK_FILE" "${DISK_SIZE}G" 2>/dev/null \
        || echo "  Warning: Could not create virtual disk"
fi

# ── Validate QEMU ────────────────────────────────────────────────────────────
if ! command -v qemu-system-x86_64 >/dev/null 2>&1; then
    echo "ERROR: qemu-system-x86_64 not found"
    echo "Install: sudo apt install qemu-system-x86"
    exit 1
fi

# ── Run QEMU ─────────────────────────────────────────────────────────────────
if [[ "$MODE" == "uefi" ]]; then
    # ── OVMF detection ─────────────────────────────────────────────────────
    ovmf_dir=""
    for _dir in \
        /usr/share/OVMF \
        /usr/share/edk2/ovmf \
        /usr/share/edk2-x86_64-ovmf \
        /usr/share/edk2.git/ovmf-x86_64
    do
        if [[ -d "$_dir" ]]; then
            ovmf_dir="$_dir"
            break
        fi
    done

    if [[ -z "$ovmf_dir" ]]; then
        echo "ERROR: OVMF firmware not found — install one of:"
        echo "  sudo apt install ovmf"
        echo "  sudo apt install edk2-x86-64"
        exit 1
    fi

    # Find code and vars template files
    OVMF_CODE="$(find "$ovmf_dir" -maxdepth 1 -name 'OVMF_CODE.fd' | head -1)"
    ovmf_vars_template="$(find "$ovmf_dir" -maxdepth 1 -name 'OVMF_VARS.fd' | head -1)"

    if [[ -z "$OVMF_CODE" || -z "$ovmf_vars_template" ]]; then
        echo "ERROR: OVMF_CODE.fd or OVMF_VARS.fd not found in $ovmf_dir"
        exit 1
    fi

    # Create a copy of VARS for this run (don't pollute the template)
    OVMF_VARS_COPY="$(mktemp)/OVMF_VARS.fd"
    cp "$ovmf_vars_template" "$OVMF_VARS_COPY"
    chmod 666 "$OVMF_VARS_COPY"

    echo "============================================"
    echo "  UEFI Boot Test"
    echo "  ISO:  $ISO"
    echo "  RAM:  ${RAM} MB"
    echo "  Disk: ${DISK_SIZE} GB"
    echo "  OVMF: $ovmf_dir"
    echo "============================================"
    echo ""
    echo "  Press Ctrl+A then X to quit QEMU"
    echo ""

    # ── QEMU UEFI command ──────────────────────────────────────────────────
    qemu-system-x86_64 \
        -enable-kvm \
        -m "$RAM" \
        -cpu host \
        -machine q35,accel=kvm \
        -drive file="$DISK_FILE",format=qcow2 \
        -drive file="$ISO",format=raw,media=cdrom \
        -boot order=c \
        -vga virtio \
        -netdev user,id=net0 \
        -device virtio-net-pci,netdev=net0 \
        -display gtk,gl=on \
        -bios "$OVMF_CODE" \
        -drive if=pflash,format=raw,readonly=on,file="$OVMF_CODE" \
        -drive if=pflash,format=raw,file="$OVMF_VARS_COPY" \
        2>&1

    echo ""
    echo "  QEMU exited."
else
    # ── BIOS (Legacy) Boot ─────────────────────────────────────────────────
    echo "============================================"
    echo "  BIOS (Legacy) Boot Test"
    echo "  ISO:  $ISO"
    echo "  RAM:  ${RAM} MB"
    echo "  Disk: ${DISK_SIZE} GB"
    echo "============================================"
    echo ""
    echo "  Press Ctrl+A then X to quit QEMU"
    echo ""

    # ── QEMU BIOS command ─────────────────────────────────────────────────
    qemu-system-x86_64 \
        -enable-kvm \
        -m "$RAM" \
        -cpu host \
        -machine q35,accel=kvm \
        -drive file="$DISK_FILE",format=qcow2 \
        -drive file="$ISO",format=raw,media=cdrom \
        -boot order=c \
        -vga virtio \
        -netdev user,id=net0 \
        -device virtio-net-pci,netdev=net0 \
        -display gtk,gl=on \
        2>&1

    echo ""
    echo "  QEMU exited."
fi
