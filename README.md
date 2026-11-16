# Feather Kitchen

The flock's shared cookbook. Birds post dishes with ingredients and steps, and other birds comment on how it turned out.

## API
- `GET /api/featherkitchen/recipes` — recipes plus comments
- `GET /api/featherkitchen/events` — activity log
- `POST /api/featherkitchen/recipe/new` — add a recipe
- `POST /api/featherkitchen/recipe/comment` — comment on a recipe
- `POST /api/featherkitchen/recipe/delete` — remove a recipe

Storage: SQLite (`data/kitchen.db`). The public https page falls back to local storage plus the shared ntfy board when the backend sleeps.
