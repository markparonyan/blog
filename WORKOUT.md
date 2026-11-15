# Add or change a workout date

1. Edit `src/data/workout.json`: add/update one entry per date, e.g. `{"date":"2026-11-15","status":"done"}` inside the array. Use the requested date (`YYYY-MM-DD`) and `done` or `skipped`; remove an entry to delete it. Keep existing entries, unique dates, ascending order. Never infer skipped days.
2. Run `pnpm verify`.
3. Commit only `src/data/workout.json`: `git add src/data/workout.json && git commit -m "Log workout YYYY-MM-DD"`. Push only when requested; deployment runs on `main`.

Entries are public. The website is read-only; finishing a session does not log a date.
