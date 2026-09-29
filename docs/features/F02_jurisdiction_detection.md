# F02 — Jurisdiction Detection

**Phase:** 1 (Core) · **Depends on:** F01 · **Used by:** F03, F05, F06, F07, F16, F19

## Summary
Given an address, determine exactly which government bodies regulate the business: which incorporated city (San José, Sunnyvale, etc.) or unincorporated Santa Clara County, plus the Census tract used for demographics. This is the foundation of the whole plan — a café at an address that looks like "San José" on the mailing label may actually be in unincorporated county land with a completely different permit path.

## User story
As an owner, I want the tool to know who my local authority is from my address, so I don't follow the wrong city's rules.

## Why it matters
Mailing city ≠ jurisdiction. Santa Clara County has 15 cities plus unincorporated pockets (some surrounded by San José). Getting this wrong silently produces a wrong plan, which destroys trust.

## Scope
**MVP**
- Geocode address → lat/lng + normalized address.
- Resolve incorporated place (city) vs unincorporated.
- Get Census tract GEOID.
- Set `supported = true` only for `san_jose` in the hackathon.

**Later**
- Special districts (downtown business improvement districts, redevelopment areas, Opportunity Zones).
- Zoning district lookup (see "Stretch" below).

## Data sources
1. **US Census Geocoder** — `onelineaddress` endpoint with `benchmark=Public_AR_Current` and `vintage=Current_Current`, `layers=all`. Response includes `Incorporated Places` and `Census Tracts`. Free, no key. (Verify exact parameters in the Census Geocoder docs.)
2. **Fallback:** city boundary GeoJSON from Santa Clara County open data / GIS; use `@turf/boolean-point-in-polygon`.
3. **Stretch — zoning:** San José publishes zoning GIS layers (check the city GIS / open data portal for a zoning FeatureServer). Query by point to get zoning district code.

## Logic
```
geocode(raw) -> { lat, lng, normalized, placeName?, placeGeoid?, tractGeoid }
if placeName exists -> kind='city', cityId=slug(placeName)
else -> kind='unincorporated'
supported = SUPPORTED_CITIES.includes(cityId)
```
- Maintain a `cities.json` map: Census place GEOID → `{ cityId, cityName, supported }` for all 15 Santa Clara County cities.
- Cache geocoding results by normalized address (SQLite table or in-memory LRU).
- If the geocoder returns multiple matches, show a "Did you mean…" picker.

## UI
- Under the address field: a small badge after lookup: "📍 Regulated by: City of San José" or "📍 Unincorporated Santa Clara County".
- Tooltip: "Your mailing city may differ from the government that issues your permits."
- Small map pin preview (reuse F06 map component).

## API
- `GET /api/geocode?address=...` → `{ lat, lng, normalized, jurisdiction: Jurisdiction, candidates? }`

## Build roadmap
- [ ] 1. Write `lib/data/geocode.ts` calling the Census Geocoder; parse place + tract.
- [ ] 2. Create `data/processed/cities.json` for the 15 cities (GEOID, slug, name, supported flag).
- [ ] 3. Add caching.
- [ ] 4. Add boundary GeoJSON fallback with turf if the geocoder fails.
- [ ] 5. Address badge UI + "did you mean" picker.
- [ ] 6. (Stretch) zoning district lookup; store result in `jurisdiction.zoningCode`.

## Acceptance criteria
- 200 E Santa Clara St, San José → `city / san_jose / supported: true`.
- An address in Sunnyvale → `city / sunnyvale / supported: false` with a friendly "coming soon" message; state/county items still returned by F03.
- An unincorporated address → `unincorporated`.
- Lookup under 2 seconds with cache miss; instant with cache hit.

## Edge cases
- PO boxes / incomplete addresses → ask for a street address.
- Addresses on city borders → trust geocoder; show the result and allow "This looks wrong" feedback.
- Geocoder downtime → fallback path, then a clear error.

## Tests
- Fixture test with 6 real addresses (2 SJ, 1 Sunnyvale, 1 Santa Clara, 1 unincorporated, 1 outside county). Record API responses so tests run offline.

## Prompt to give Claude
> Build F02 per this file. Use the US Census Geocoder with recorded fixtures for tests. Produce `cities.json` for all Santa Clara County cities and mark only San José as supported.
