# Dataset

**BIG IDEAs Lab Glycemic Variability and Wearable Device Dataset** (Duke University), hosted on PhysioNet.

- Homepage: https://physionet.org/content/big-ideas-glycemic-wearable/
- Version pinned by this project: **1.1.2**
- License: **Open Data Commons Attribution License v1.0 (ODC-BY)** — open access, no credentialing required. Redistribution is permitted with attribution; there is no restriction against committing it (or a derived subset) to a public repository. This project chooses not to, as a data-minimization default — see below.
- Citation (ODC-BY requires attribution — keep this in sync with the README/about page):

  > Cleveland, S., et al. BIG IDEAs Lab Glycemic Variability and Wearable Device Data. PhysioNet. https://doi.org/10.13026/rjjw-yn05

## What's actually used

16 participants (`001`–`016`), each with:

| File | Contents | Used in this project? |
|---|---|---|
| `Dexcom_<id>.csv` | Dexcom G6 CGM export (Dexcom Clarity format), ~5-minute interval EGV readings | **Yes** — the primary data source |
| `Food_Log_<id>.csv` | Self-reported meals with macros | **Yes** — contextual meal events |
| `ACC_<id>.csv`, `BVP_<id>.csv`, `EDA_<id>.csv`, `HR_<id>.csv`, `IBI_<id>.csv`, `TEMP_<id>.csv` | Empatica E4 wearable signals (accelerometry, blood volume pulse, EDA, heart rate, interbeat interval, skin temp) | **Not yet.** These files are large (the accelerometry and BVP files alone are hundreds of MB to low-GB per participant) and out of scope for the MVP. `HR_<id>.csv` is the cheapest one to add first for the "activity correlation" feature in a later phase.

## Why the raw CSVs aren't committed

The license permits it, but this project treats real (de-identified but still per-person) health data as something to fetch on demand rather than check in — smaller repo, and it keeps the "don't commit raw participant data" habit intact even though this particular dataset doesn't legally require it. `data/raw/` and `data/normalized/` are gitignored.

## Dexcom CSV quirks worth knowing before you touch the parser

The file is a Dexcom Clarity export, not a clean CSV of readings:

- Rows 1–12 (varies slightly by participant) are metadata/alert-threshold rows (`FirstName`, `LastName`, `Device`, `Alert` config, etc.) with most columns blank. The actual glucose readings are the rows where `Event Type == EGV`.
- Timestamps are `YYYY-MM-DD HH:mm:ss` with **no timezone** in the file. The dataset's documentation doesn't pin one down further; this project treats them as UTC for the canonical event (`docs/adr/0002-canonical-event-schema.md`) — good enough for a replay demo, explicitly not claimed to be clinically accurate wall-clock time.
- Not every row has a `Glucose Value (mg/dL)` — `Alert` rows and sensor-warmup gaps don't. The parser only emits a canonical event for real `EGV` rows with a numeric value.

## Usage

```bash
# Fetches Dexcom_<id>.csv and Food_Log_<id>.csv for the given participant(s)
# into data/raw/. Network access to physionet.org required.
./data/scripts/download-dataset.sh 001 002 003

# Parses data/raw/Dexcom_<id>.csv into normalized canonical events
npm run parse:dexcom --workspace=@gluconimbus/data-scripts -- 001
# → data/normalized/001/glucose.ndjson

npm run parse:food-log --workspace=@gluconimbus/data-scripts -- 001
# → data/normalized/001/meals.ndjson
```
