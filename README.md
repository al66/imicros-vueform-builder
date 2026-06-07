# imicros-vueform-builder

> **⚠️ Important:** This service uses the [Vueform Builder](https://builder.vueform.com/pricing), which requires **at least a White label licence**. Please ensure you have the appropriate licence before using this service.

Service for creating and versioning Vueform forms with Pocket ID auth.

The base route (`/`) serves a Vue.js UI for listing, creating, editing and deleting forms.

## Required environment variables

- `POCKET_ID_ISSUER_URL`
- `POCKET_ID_CLIENT_ID`
- `POCKET_ID_CLIENT_SECRET`
- `POCKET_ID_CALLBACK_URL`
- `POCKET_ID_API_URL`
- `DATABASE_URL`
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

### Authentication flow

The application uses Pocket ID OIDC Authorization Code Flow:

- `GET /auth/login` starts OIDC login and redirects to Pocket ID.
- `GET /auth/callback` handles the authorization code callback.
- `POST /auth/logout` clears the application session.

Users should open the root URL (for example, `https://dev.imicros.de/vueform-builder/`).
The app restores authenticated state from secure HTTP-only session cookies and does not require manual bearer token input.
The default session store is in-memory and should be replaced by a shared persistent store for multi-instance production deployments.

After login, the backend retrieves the user profile through:

`GET {POCKET_ID_API_URL}/api/oidc/userinfo`

using the access token obtained from the token endpoint.

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
curl -b cookies.txt -c cookies.txt http://localhost:3000/api/forms
```

Example create request:

```bash
curl -X POST http://localhost:3000/api/forms \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "groupId": "group-1",
    "description": "Contact form",
    "versionRemark": "Initial version",
    "form": { "type": "object", "properties": {} }
  }'
```
