# Google libphonenumber timezone map (pinned)

| Field | Value |
|-------|-------|
| Upstream | https://github.com/google/libphonenumber |
| Tag | **v9.0.42** |
| Commit | `8d8d75272c351b60b87163db5328e439c53a6b56` |
| File | `resources/timezones/map_data.txt` |
| Companion npm | `libphonenumber-js@1.13.15` (exact pin in package.json; used for E.164 parsing, not this map) |

Do not edit `map_data.txt` by hand. Bump the tag/commit together, re-run
`npm run generate:nanp-zones`, and commit the refreshed snapshot.

## Scope (NANP quiet-hours)

Generated NPAs include **all country-code-1 area codes** present in
`map_data.txt` (United States, **Canada**, and NANP territories such as PR,
Guam, CNMI, American Samoa, Caribbean). Canada **is in scope**: Canadian
callers to a US business still need TCPA-safe quiet hours.

Multi-zone NPAs use the **union** of every timezone listed under that NPA
prefix (most conservative: every candidate zone must be open).
