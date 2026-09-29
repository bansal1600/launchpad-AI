# F15 — Rule Change Monitoring

**Phase:** Roadmap · **Depends on:** F03, F07, F14

## Summary
Keeps the rule library trustworthy over time. A scheduled job fetches every rule's `sourceUrl`, detects meaningful changes to the page (fees, requirements, program status), and opens a review task for a human. When a verified change is published, affected owners get a notification: "The fee for X changed" or "A new grant is available for your location."

## User story
As the product team, we want to know when a government page changes so our plans stay accurate. As an owner, I want to be told when a rule affecting me changes.

## Why it matters
Stale data is the biggest trust risk for this product. Human-in-the-loop monitoring is also a defensible moat: the verified rule library becomes the core asset.

## Scope
**MVP:** nightly fetch, text extraction, normalized hash + diff, LLM summary of what changed (flagged for human review, never auto-applied), admin review queue.
**Later:** agency RSS/meeting agenda monitoring (city council fee schedule updates), owner notifications.

## Logic
```
for rule in all rules:
  html = fetch(sourceUrl) (respect robots.txt, rate-limit)
  text = extract main content (readability)
  if hash(normalize(text)) != stored hash:
     diff = textDiff(old, new)
     summary = LLM("Summarize changes relevant to fees, requirements, eligibility, status")
     create ReviewTask(ruleId, diff, summary)
admin approves -> edit rule JSON -> bump lastVerified -> notify affected profiles (jsonLogic match)
```

## Data model (propose)
- `SourceSnapshot(ruleId, url, hash, text, fetchedAt)`
- `ReviewTask(id, ruleId, diff, summary, status, reviewer, resolvedAt)`

## Build roadmap
- [ ] 1. Snapshot store + fetcher (polite, cached, handles PDFs).
- [ ] 2. Normalization (strip dates/nav) to avoid false positives.
- [ ] 3. Diff + LLM summary.
- [ ] 4. Admin review page.
- [ ] 5. Notification of affected owners.
- [ ] 6. "Stale" badge on rules with lastVerified > 90 days.

## Acceptance criteria
- Changing a fixture page triggers exactly one review task with a readable summary.
- Unchanged pages with only a date/footer change produce no task.

## Prompt to give Claude
> Build F15 per this file: snapshotting, normalized diffing, LLM change summaries for human review, and an admin queue. Never auto-edit rules.
