# QuickNotes API Design

This is the REST API the backend team should build for the real QuickNotes service. It is **not** JSONPlaceholder, which is only used for practice in the front-end client.

## Conventions

- **Base URL:** `https://api.quicknotes.example/v1` (the `v1` lets us change the API later without breaking old apps)
- **Format:** every request and response body is JSON (`Content-Type: application/json`)
- **Resources:** plural nouns (`/notes`, `/tags`), never verbs in the path; the HTTP method says what to do
- **Authentication:** every endpoint except login needs the header `Authorization: Bearer <token>`
- **Ownership:** a user can only see and change their own notes and tags
- **Lists:** use `limit` (default 20, maximum 100) and `cursor` for paging, and return `next_cursor` for the next page
- **Times:** ISO 8601 in UTC, for example `2026-10-23T09:30:00Z`

## Endpoints

| Method | Path | Description | Success status |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | Log in with an email and password and receive a token. | `200 OK` |
| `GET` | `/notes` | List the logged-in user's notes, newest first. Optional query parameters: `tag`, `q` (search text), `limit`, `cursor`. | `200 OK` |
| `GET` | `/notes/{id}` | Get one note by its id. | `200 OK` |
| `POST` | `/notes` | Create a new note. | `201 Created` |
| `PUT` | `/notes/{id}` | Replace a note's title, body and tags. | `200 OK` |
| `DELETE` | `/notes/{id}` | Delete a note. | `204 No Content` |
| `GET` | `/tags` | List the user's tags. | `200 OK` |
| `PUT` | `/notes/{id}/tags/{tag_id}` | Attach an existing tag to a note (safe to repeat). | `204 No Content` |
| `DELETE` | `/notes/{id}/tags/{tag_id}` | Remove a tag from a note. | `204 No Content` |

## Examples

### Create a note: `POST /notes`

**Request**

```http
POST /v1/notes
Authorization: Bearer eyJhbGciOi...
Content-Type: application/json
```

```json
{
  "title": "Buy milk",
  "body": "Two litres of fresh milk and bread",
  "tags": ["personal", "shopping"]
}
```

- `title` is required, 1 to 100 characters.
- `body` is optional.
- `tags` is optional. It is a list of tag names, and any tag that does not exist yet is created.

**Response: `201 Created`**

```http
Location: /v1/notes/101
```

```json
{
  "id": 101,
  "title": "Buy milk",
  "body": "Two litres of fresh milk and bread",
  "tags": [
    { "id": 4, "name": "personal" },
    { "id": 9, "name": "shopping" }
  ],
  "created_at": "2026-10-23T09:30:00Z",
  "updated_at": "2026-10-23T09:30:00Z"
}
```

### List notes: `GET /notes?limit=2`

**Request**

```http
GET /v1/notes?limit=2
Authorization: Bearer eyJhbGciOi...
```

**Response: `200 OK`**

```json
{
  "data": [
    {
      "id": 101,
      "title": "Buy milk",
      "body": "Two litres of fresh milk and bread",
      "tags": [
        { "id": 4, "name": "personal" },
        { "id": 9, "name": "shopping" }
      ],
      "created_at": "2026-10-23T09:30:00Z",
      "updated_at": "2026-10-23T09:30:00Z"
    },
    {
      "id": 100,
      "title": "Revise SQL joins",
      "body": "",
      "tags": [{ "id": 2, "name": "study" }],
      "created_at": "2026-10-22T18:05:00Z",
      "updated_at": "2026-10-22T18:05:00Z"
    }
  ],
  "next_cursor": "eyJpZCI6MTAwfQ"
}
```

When there are no more notes, `next_cursor` is `null`. If the user has no notes at all, `data` is an empty list (`[]`) and the status is still `200 OK`.

## Error responses

Every error uses the same body, so the client can handle them in one place:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The title is required and must be 100 characters or fewer.",
    "details": [
      { "field": "title", "issue": "must be between 1 and 100 characters" }
    ]
  }
}
```

| Status | Name | When it happens | Example `error.code` |
| --- | --- | --- | --- |
| `400` | Bad Request | The request is invalid, such as a missing title, a title over 100 characters, broken JSON or a non-numeric id. | `VALIDATION_ERROR` |
| `401` | Unauthorized | The token is missing, wrong or expired, so we don't know who is asking. | `UNAUTHENTICATED` |
| `403` | Forbidden | The token is valid, but the note belongs to a different user. | `FORBIDDEN` |
| `404` | Not Found | The note or tag does not exist, for example `GET /notes/99999`. | `NOT_FOUND` |
| `429` | Too Many Requests | The client sent too many requests in a short time. | `RATE_LIMITED` |
| `500` | Internal Server Error | Something broke on our side, such as the database being unreachable. | `INTERNAL_ERROR` |

**Example `401`:**

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Your session has expired. Please log in again."
  }
}
```

**Example `403`:** user 7 tries `DELETE /notes/55`, but note 55 belongs to user 9.

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to change this note."
  }
}
```

**Example `404`:**

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Note 99999 was not found."
  }
}
```

**Example `500`:** this body never includes internal details such as stack traces or SQL.

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Something went wrong on our side. Please try again later."
  }
}
```