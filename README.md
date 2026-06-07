# imicros-vueform-builder

Service for creating and versioning Vueform forms with Pocket ID auth.

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

## Service URLs and usage

By default the service runs on `http://localhost:3000` (or on the host/port configured by `PORT`).

### Health check

- `GET /health`
- No authentication required
- Returns service status

Example:

```bash
curl http://localhost:3000/health
```

### API authentication

All `/api/*` endpoints require a bearer token:

```bash
TOKEN="******"
AUTH_HEADER="******"
```

Use `AUTH_HEADER` as the value of the `Authorization` header for all `/api/*` requests.
Set `AUTH_HEADER` from `TOKEN` using the ****** before making requests.

### Form endpoints

- `GET /api/forms`  
  List forms available for the authenticated user's groups.
- `GET /api/forms/:id`  
  Get one form by id (if group access is allowed).
- `POST /api/forms`  
  Create a new form version.
- `PUT /api/forms/:id`  
  Update an existing form by creating a new version.

#### Request body for create/update

```json
{
  "groupId": "group-123",
  "description": "Form description",
  "versionRemark": "Why this version was created",
  "form": { "type": "object", "properties": {} }
}
```

`description`, `versionRemark`, and `form` are required.  
`groupId` is required when the authenticated user belongs to more than one group.  
If the authenticated user belongs to exactly one group, `groupId` is optional and will be inferred automatically.
For `PUT /api/forms/:id`, partial updates are not supported: provide all required fields (`description`, `versionRemark`, `form`) in every update request.

Example list request:

```bash
curl http://localhost:3000/api/forms \
  -H "Authorization: ${AUTH_HEADER}"
```

Example create request:

```bash
curl -X POST http://localhost:3000/api/forms \
  -H "Authorization: ${AUTH_HEADER}" \
  -H "Content-Type: application/json" \
  -d '{
    "groupId": "group-1",
    "description": "Contact form",
    "versionRemark": "Initial version",
    "form": { "type": "object", "properties": {} }
  }'
```
