# Render deployment

## Shared design settings

Design editor settings are stored in the server-side SQLite database. To keep
them across deploys on Render:

1. Add a Render Persistent Disk mounted at `/var/data`.
2. Set `DESIGN_SETTINGS_DB_PATH=/var/data/design-settings.sqlite`.
3. Keep the service at one instance while it uses SQLite. Render disks attach
   to one service instance; multiple instances need a shared database service.

If the configured database does not exist but `data/design-settings.sqlite`
does, the server copies that database to the configured path before opening it.

## Football club and competition logos

Club and competition logos are matched against `football-logo-catalog.json`,
which indexes SVG files from the pinned
`JoseArroyave/football-logos` GitHub repository revision. Keep this catalog
file alongside `server.js` when deploying. The server generates direct
`raw.githubusercontent.com` image URLs from catalog paths; it does not use
GoalAPI or manually configured image URLs as a fallback for club or competition
logos. The site's default logo is used when the catalog has no match.

GoalAPI remains the source for match and football data. National-team flags
continue to use their existing flag source.
