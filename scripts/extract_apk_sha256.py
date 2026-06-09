#!/usr/bin/env python3
"""
extract_apk_sha256.py — extract the SHA256 fingerprint of an APK's
signing certificate.

Tries two paths:
  1. androguard if installed (reads v1/v2/v3 schemes cleanly).
  2. Pure-Python APK Signing Block parser as a fallback (handles
     v2/v3 only — what EAS produces).

Output: colon-separated upper-case hex, the format Google's
assetlinks.json expects.

Usage: python scripts/extract_apk_sha256.py path/to/app.apk
"""
import hashlib
import struct
import sys


APK_SIG_BLOCK_MAGIC = b"APK Sig Block 42"
SIG_V2_ID = 0x7109871a
SIG_V3_ID = 0xf05368c0


def colon_hex(b: bytes) -> str:
    return ":".join(f"{x:02X}" for x in b)


def parse_apk_sig_block(path: str) -> str:
    """Pure-Python v2/v3 parser. Returns the SHA256 colon-hex string."""
    with open(path, "rb") as f:
        # End-of-Central-Directory record is at the tail; before it is
        # (optionally) the APK Signing Block. We scan backwards for the
        # EOCD signature 0x06054b50.
        f.seek(0, 2)
        size = f.tell()
        # EOCD is at most 22 + 65535 bytes from end.
        scan_from = max(0, size - (22 + 65535))
        f.seek(scan_from)
        tail = f.read()
        eocd_off = tail.rfind(b"\x50\x4b\x05\x06")
        if eocd_off < 0:
            raise RuntimeError("Could not find End-of-Central-Directory record")
        # Central Directory offset is at EOCD + 16 (uint32 LE).
        cd_offset = struct.unpack_from("<I", tail, eocd_off + 16)[0]

        # APK Signing Block ends 24 bytes before central directory:
        #   8 bytes size_of_block (uint64 LE)
        #   ...payload...
        #   8 bytes size_of_block (again)
        #   16 bytes magic "APK Sig Block 42"
        f.seek(cd_offset - 24)
        end_block = f.read(24)
        if end_block[8:] != APK_SIG_BLOCK_MAGIC:
            # Try size before magic anyway? Some signers use different
            # offsets — but typically magic is at cd_offset - 16.
            raise RuntimeError("APK Signing Block magic not found")
        size_after = struct.unpack("<Q", end_block[:8])[0]
        block_start = cd_offset - 8 - size_after
        f.seek(block_start)
        block_size_pre = struct.unpack("<Q", f.read(8))[0]
        payload = f.read(block_size_pre - 24)  # exclude trailing size+magic

        # Walk ID-value pairs.
        certs = []
        i = 0
        while i + 12 <= len(payload):
            pair_size = struct.unpack_from("<Q", payload, i)[0]
            if pair_size < 4 or i + 8 + pair_size > len(payload):
                break
            block_id = struct.unpack_from("<I", payload, i + 8)[0]
            value = payload[i + 12 : i + 8 + pair_size]
            i += 8 + pair_size

            if block_id in (SIG_V2_ID, SIG_V3_ID):
                # Format: sequence of length-prefixed signers.
                certs.extend(_extract_certs_from_signers(value, block_id))
                if certs:
                    break

        if not certs:
            raise RuntimeError("No certificates found in APK Signing Block")

        # First cert is the app's primary signer; use that one.
        der = certs[0]
        digest = hashlib.sha256(der).digest()
        return colon_hex(digest)


def _read_lenprefixed(buf: bytes, off: int) -> tuple[bytes, int]:
    """Read uint32 length-prefixed chunk. Returns (chunk, new_offset)."""
    if off + 4 > len(buf):
        raise RuntimeError("Truncated length prefix")
    n = struct.unpack_from("<I", buf, off)[0]
    return buf[off + 4 : off + 4 + n], off + 4 + n


def _extract_certs_from_signers(value: bytes, block_id: int) -> list[bytes]:
    """
    Both v2 and v3 layouts:
      sequence-of-signers (length-prefixed list)
        signer = signed_data || signatures || public_key
          signed_data = digests || certificates || (v3: minSDK/maxSDK) || attrs
            certificates = sequence-of length-prefixed DER X.509
    """
    out: list[bytes] = []
    signers_list, _ = _read_lenprefixed(value, 0)
    so = 0
    while so + 4 <= len(signers_list):
        signer, so = _read_lenprefixed(signers_list, so)
        signed_data, _ = _read_lenprefixed(signer, 0)
        # Inside signed_data: skip digests, then certificates.
        sd = 0
        _digests, sd = _read_lenprefixed(signed_data, sd)
        certs_block, _ = _read_lenprefixed(signed_data, sd)
        co = 0
        while co + 4 <= len(certs_block):
            cert, co = _read_lenprefixed(certs_block, co)
            out.append(cert)
    return out


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    path = sys.argv[1]
    # Try androguard first — handles every signing variant cleanly.
    try:
        from androguard.core.apk import APK  # type: ignore
        a = APK(path)
        certs = a.get_certificates()
        if certs:
            der = certs[0].dump()
            digest = hashlib.sha256(der).digest()
            print(colon_hex(digest))
            return
    except ImportError:
        pass
    except Exception as e:
        print(f"# androguard path failed: {e}", file=sys.stderr)

    # Fallback: pure-Python parser.
    fp = parse_apk_sig_block(path)
    print(fp)


if __name__ == "__main__":
    main()
