# QuickNotes System Design

QuickNotes is moving from a browser-only app to a real online service for 1 million users. This project has two halves. The first is a small **API client** (HTML, CSS and JavaScript) that proves the front end can talk to an API, using the free JSONPlaceholder practice API. The second is a set of **design documents** that the backend team can build the real service from: the API design, the data model and the architecture.

## Features of the API client

- Load 10 notes from the server with a GET request
- Create a note with a POST request (title required, up to 100 characters; body optional)
- Delete a note with a DELETE request
- Loading, success, error and empty states shown on the page
- Buttons are disabled while a request is running
- User text is inserted with `textContent` only, never `innerHTML`

JSONPlaceholder is a fake API: it replies as if a new note was saved, but it doesn't keep anything. The page therefore keeps its own list of notes and updates it after each successful response (explained in a comment at the top of `api.js`).

## How to run the API client

1. Download or clone this repository.
2. Open the `quicknotes-system-design` folder.
3. Open `index.html` in your browser (double-click it, or use the Live Server extension in VS Code).
4. Click **Load notes**, then try adding and deleting a note. You need an internet connection to reach JSONPlaceholder.

No installation or build step is needed.

## Design documents

- [API design](docs/api-design.md): the REST endpoints, JSON examples and error codes
- [Data model](docs/data-model.md): tables, keys, relationships, SQL, indexes and the SQL vs NoSQL decision
- [Architecture](docs/architecture.md): requirements, load estimates, the diagram, request flows, trade-offs and avoiding single points of failure

## Files

```
quicknotes-system-design/
├── index.html
├── style.css
├── api.js
├── README.md
└── docs/
    ├── api-design.md
    ├── data-model.md
    └── architecture.md
```

## What I learned

- How `fetch` works with `async` / `await`, and why every request needs `try` / `catch` and a check of `response.ok`, because `fetch` only fails by itself when the network is down.
- How to show loading, success, error and empty states, and why disabling a button while a request runs stops duplicate requests.
- That a fake API like JSONPlaceholder doesn't store changes, so the page has to keep its own list of notes and update it after each response.
- How a REST API is designed: plural nouns, the right method for each action, and the correct status codes (201, 204, 400, 401, 403, 404, 500).
- Why a many-to-many relationship needs a join table, and why an index on `(user_id, created_at)` makes the main query fast.
- How to estimate load (reads and writes per second, storage per year) and how a cache, read replica, queue and load balancer work together to avoid single points of failure.