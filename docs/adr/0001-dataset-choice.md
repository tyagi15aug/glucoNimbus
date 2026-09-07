# ADR 0001: Use the BIG IDEAs Lab Glycemic Variability dataset

## Context

The project needs a real CGM dataset to replay as a simulated sensor stream (spec Section 4), not synthetic-from-scratch data — the whole point of the simulator/replay architecture is to exercise the ingestion pipeline against data with the actual irregularities (sensor warm-up gaps, alert rows, Dexcom's export quirks) a real device would produce.

Candidates considered: BIG IDEAs Lab Glycemic Variability and Wearable Device Data, CGMacros, OhioT1DM.

## Decision

Use **BIG IDEAs Lab Glycemic Variability and Wearable Device Data v1.1.2** (PhysioNet) as the Phase 1 dataset.

Verified before committing to it (per the spec's own instruction to check license/access before use):

- **License: Open Data Commons Attribution v1.0 — open access**, no PhysioNet credentialing required, no restriction on redistribution beyond attribution. Confirmed directly against the dataset's own license page and content page, not assumed from the spec.
- 16 participants, Dexcom G6 CGM at ~5-minute intervals, Empatica E4 wearable signals (accelerometry, BVP, EDA, HR, IBI, temperature), food logs, and per-participant demographics (HbA1c).
- CGMacros and OhioT1DM remain documented as later options (data/README.md) if the meal/macro-correlation or additional-scenario features get built out.

## Consequences

- No credentialing workflow needed anywhere in this project — a real gap in the CGMacros/OhioT1DM alternative, both of which require a PhysioNet data use agreement.
- The Empatica E4 files are large enough (hundreds of MB to low-GB per participant) that they're deliberately **not** downloaded or used yet — only `Dexcom_<id>.csv` and `Food_Log_<id>.csv`. Activity/heart-rate correlation (spec Section 10) is a later-phase addition, not blocked by license, just scoped out of the MVP.
- Raw CSVs are still kept out of git (`data/raw/`, `.gitignore`) as a data-minimization default, even though the license doesn't require it — see data/README.md.
