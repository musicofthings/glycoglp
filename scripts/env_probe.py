#!/usr/bin/env python3
"""Probe local environment for GLP-1 in silico toolchain readiness.

No third-party dependencies required.
"""
from __future__ import annotations

import importlib
import shutil
import subprocess
import sys
from dataclasses import dataclass


@dataclass
class ProbeResult:
    name: str
    kind: str
    available: bool
    detail: str


def probe_python_module(module: str) -> ProbeResult:
    try:
        importlib.import_module(module)
        return ProbeResult(module, "python_module", True, "import OK")
    except Exception as exc:  # noqa: BLE001
        return ProbeResult(module, "python_module", False, f"{type(exc).__name__}: {exc}")


def probe_binary(binary: str) -> ProbeResult:
    path = shutil.which(binary)
    if path:
        return ProbeResult(binary, "binary", True, f"found at {path}")
    return ProbeResult(binary, "binary", False, "not found on PATH")


def probe_pip_index(pkg: str) -> ProbeResult:
    cmd = [sys.executable, "-m", "pip", "index", "versions", pkg]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if proc.returncode == 0:
        return ProbeResult(pkg, "pip_index", True, "index reachable for package")
    snippet = " ".join(proc.stdout.strip().splitlines()[:2])
    return ProbeResult(pkg, "pip_index", False, snippet or f"pip exited {proc.returncode}")


def main() -> int:
    modules = ["pyrosetta", "openmm", "rdkit", "mdtraj", "MDAnalysis"]
    binaries = ["gmx", "vina", "obabel"]
    pkg_index = ["openmm", "rdkit-pypi", "mdtraj"]

    results = []
    results.extend(probe_python_module(m) for m in modules)
    results.extend(probe_binary(b) for b in binaries)
    results.extend(probe_pip_index(p) for p in pkg_index)

    print("name\tkind\tavailable\tdetail")
    for r in results:
        print(f"{r.name}\t{r.kind}\t{r.available}\t{r.detail}")

    hard_fail = [r for r in results if r.kind in {"python_module", "binary"} and not r.available]
    if hard_fail:
        print(f"\nSummary: {len(hard_fail)} required tool probes unavailable.")
        return 1

    print("\nSummary: core toolchain probes available.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
