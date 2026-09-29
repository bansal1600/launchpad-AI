# TruckComply

A demo Streamlit app that turns a food truck's basic details into a mock
permit checklist, restriction list, and go-live timeline — entirely from
two local JSON files. **No LLM calls, no web requests, no login, no
database.**

> **DEMO MODE**: every fee, timeline, agency name, and rule shown comes
> from `data/mock_compliance.json`, which is illustrative only. It is not
> real regulatory advice for any actual city, county, or state.

## What it does

1. Pick a sample profile (or type your own city/county/state, what you'll
   serve, and a few checkboxes about your operation).
2. Click **"Scan requirements, restrictions, and timeline"**.
3. See:
   - A summary (counts by level, restriction severity, an estimated
     go-live time range, and a cost breakdown by cost type)
   - A phased go-live roadmap with fast-case and slow-case scheduling,
     a critical path, and a week-by-week chart
   - What you can do in parallel right now (based on which steps you've
     checked off as done)
   - A requirements checklist grouped by level, with linked restrictions
   - What you cannot do, grouped by category, with severity badges
   - Restrictions specific to each selling location you picked
   - Top mistakes to avoid
   - A renewals table
   - An inspection prep checklist and questions to ask each agency
   - A final reminder to confirm everything with the real agencies

## Data files

- `data/mock_compliance.json` — requirements, restrictions, the go-live
  roadmap, inspection prep items, agency questions, and enforcement
  notes. All demo data.
- `data/sample_profiles.json` — a few example truck profiles used to
  prefill the form.

Both files are read-only inputs to `engine.py`; the app never modifies
them.

## Running locally

```bash
pip install -r requirements.txt
streamlit run app.py
```

## Files

- `app.py` — the Streamlit UI (single page, all 10 output sections).
- `engine.py` — pure Python logic: condition mapping, filtering
  requirements/restrictions by `applies_if`, topological sort by
  `prereq`, and the go-live roadmap scheduler (fast/slow case,
  critical path, calendar dates).
- `data/mock_compliance.json`, `data/sample_profiles.json` — the only
  data sources. Nothing in the app is invented outside these files.

## Exporting a result

There is no PDF export button by design — use your browser's
**Print → Save as PDF** to export a scanned result.

## Notes

- If the city/state you enter isn't one of the sample profiles' known
  locations, the app shows a banner: *"Demo data is generic. Real mode
  will look up your exact jurisdiction."*
- Empty required fields (City, County, State, What you'll serve) show a
  friendly inline message instead of running the scan.
