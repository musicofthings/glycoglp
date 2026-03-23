# GLP-1 Glyco-Masking In Silico Program (Reference)

## Objective
Design 2–3 synthesis-priority GLP-1 analogs that:
- Preserve >=70–80% receptor activation
- Reduce early receptor accessibility (proxy for nausea)
- Exhibit delayed activation via glycan masking + linker cleavage

## Multi-Agent Architecture
1. **Planner Agent**: defines phased execution, compute budget, candidate limits
2. **Generator Agent**: creates sequence/glycan/linker/mutation variants
3. **Evaluator Agent**: runs structure, MD, SASA, docking, kinetics, PK simulations
4. **Scorer Agent**: normalizes metrics and computes weighted final score
5. **Controller Agent**: enforces hard gates and progression/termination

## Global Stage Limits
- Candidate limits by stage: **50 -> 10 -> 5 -> 3**
- No expensive simulations before passing prior gates
- Every phase requires ranked outputs and hard-gate pass

## Scoring Function
`final_score = (0.30 * masking_score) + (0.25 * timing_score) + (0.25 * binding_score) + (0.20 * stability_score)`

Where:
- `masking_score`: SASA suppression (%)
- `timing_score`: delayed activation quality
- `binding_score`: normalized docking/FEP proxy
- `stability_score`: MD stability proxy

## Phase Plan

### Phase 1 — Masking Feasibility
- Generate glycan variants (mono/bi/reduced) at positions 2/3
- Run fast structure screen + short MD surrogate + SASA(7–14)
- **Gate 1**: SASA suppression >=50% and no permanent binding disruption
- Keep top 10

### Phase 2 — Linker Timing
- Add linker variants (<=20)
- Estimate cleavage t1/2 + activation curves
- **Gate 2**: t1/2 in 1–6 h and delayed activation confirmed
- Keep top 5

### Phase 3 — Receptor Activation
- Mutate positions 13–22 (<=50 variants across top Phase 2 designs)
- Docking + short MD
- **Gate 3**: predicted efficacy >=70% and no major binding loss
- Keep top 3

### Phase 4 — Temporal PK Model
- Simulate activation(t) from cleavage kinetics + binding threshold
- Compare early (0–2h) vs late (2–24h)
- **Gate 4**: Late/Early activation ratio improved vs baseline GLP-1

### Phase 5 — Final Selection
- Rank with weighted score
- Select top 2–3 for synthesis prioritization

## Candidate Set From Prior Draft (Illustrative)
1. **GLY-17** (Rank 1): biantennary sialylated glycan, position-3 attachment, Val-Cit-PABC linker, mutations E15Q/A18V/K20R
2. **GLY-09** (Rank 2): mono-sialylated glycan, position-2 attachment, Gly-Phe-Leu-Gly linker, mutations L14H/Q17E
3. **GLY-27** (Rank 3): reduced-core glycan, position-3 attachment, hydrazone linker, mutations E15D/A18L

> Note: The above scores were blueprint/mock values for workflow demonstration, not yet computed from actual simulations.

## Failure Conditions
Terminate program if any of:
- No meaningful masking achieved
- Linker timing fails to land in target window
- Binding lost across all candidates

## Immediate Next Step
- Probe local environment for the least-complex available tool (e.g., PyRosetta/OpenMM/RDKit)
- Run a minimal executable test and report computed (not mocked) output

## Environment Validation (Current Container)
- Attempted package installs for `rdkit-pypi`, `openmm`, `mdtraj`, and `numpy` via `pip`.
- Result: install failed due outbound proxy/index restriction (`403 Forbidden` to package index), so no new scientific packages could be installed in this session.
- Existing availability check also showed `pyrosetta`, `openmm`, `rdkit`, `mdtraj`, `MDAnalysis` were not preinstalled.

## Reproducible Probe Script
- Added: `scripts/env_probe.py`
- Purpose: quickly test module availability, binary availability (`gmx`, `vina`, `obabel`), and pip index reachability for key packages.
- Run with:
  - `python scripts/env_probe.py`
