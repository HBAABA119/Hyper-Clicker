"""Print the imported DLL names of a Windows PE binary.

Used to explain `error[E0463]: can't find crate for ...` during a release
build: rustc loads the proc-macro DLL, and when that DLL's own imports cannot
be resolved Windows reports ERROR_MOD_NOT_FOUND (126), which surfaces as a
missing crate rather than as the real problem.

    python scripts/pe_imports.py path/to/thing.dll
"""

import struct
import sys

IMAGE_DIRECTORY_ENTRY_IMPORT = 1


def pe_sections(data):
    """Return the section table plus the import-directory RVA and size."""
    pe_offset = struct.unpack_from("<I", data, 0x3C)[0]
    assert data[pe_offset : pe_offset + 4] == b"PE\0\0", "not a PE image"

    coff = pe_offset + 4
    sections_count = struct.unpack_from("<H", data, coff + 2)[0]
    optional_size = struct.unpack_from("<H", data, coff + 16)[0]
    optional = coff + 20
    magic = struct.unpack_from("<H", data, optional)[0]
    assert magic == 0x20B, f"expected PE32+, got {magic:#x}"

    # Data directories start at optional + 112 for PE32+.
    directories = optional + 112
    table_rva, table_size = struct.unpack_from(
        "<II", data, directories + IMAGE_DIRECTORY_ENTRY_IMPORT * 8
    )
    if not table_rva:
        return [], 0, 0

    out = []
    for index in range(sections_count):
        header = optional + optional_size + index * 40
        virtual_size, virtual_address, raw_size, raw_offset = struct.unpack_from(
            "<IIII", data, header + 8
        )
        out.append((virtual_address, virtual_size, raw_offset, raw_size))
    return out, table_rva, table_size


def to_offset(rva, sections):
    for virtual_address, virtual_size, raw_offset, raw_size in sections:
        if virtual_address <= rva < virtual_address + max(virtual_size, raw_size):
            return raw_offset + (rva - virtual_address)
    raise LookupError(f"RVA {rva:#x} is outside every section")


def read_cstring(data, offset):
    end = data.index(b"\0", offset)
    return data[offset:end].decode("ascii", "replace")


def main():
    path = sys.argv[1]
    with open(path, "rb") as fh:
        data = fh.read()

    section_table, table_rva, _ = pe_sections(data)
    cursor = to_offset(table_rva, section_table)

    while True:
        # IMAGE_IMPORT_DESCRIPTOR: 5 dwords, terminated by a zeroed entry.
        descriptor = data[cursor : cursor + 20]
        if len(descriptor) < 20 or descriptor == b"\0" * 20:
            break
        name_rva = struct.unpack_from("<I", descriptor, 12)[0]
        if not name_rva:
            break
        print(read_cstring(data, to_offset(name_rva, section_table)))
        cursor += 20


if __name__ == "__main__":
    main()