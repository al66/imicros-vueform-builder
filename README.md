# imicros-vueform-builder

Service for creating and versioning Vueform forms with Pocket ID auth.

The base route (`/`) serves a Vue.js UI for listing, creating, editing and deleting forms.

## Required environment variables

- `POCKET_ID_API_URL`
- `DATABASE_URL`
- `POCKET_ID_API_TOKEN` (optional)
- `PORT` (optional, defaults to `3000`)

## Run

```bash
npm install
npm start
```

## Tests

```bash
npm run test:unit
npm run test:integration
```
