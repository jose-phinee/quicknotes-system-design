# QuickNotes Data Model

QuickNotes stores four entities: **users**, **notes**, **tags** and **note_tags**. The SQL below uses SQLite-style syntax (for PostgreSQL, change `INTEGER PRIMARY KEY AUTOINCREMENT` to `BIGSERIAL PRIMARY KEY` and the date columns to `TIMESTAMPTZ`).

## Entities and columns

### users

| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER | **Primary key** |
| `email` | TEXT | Required, **unique** |
| `name` | TEXT | Required |
| `password_hash` | TEXT | Required (never the plain password) |
| `created_at` | TEXT (date and time) | Required, set automatically |

### notes

| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER | **Primary key** |
| `user_id` | INTEGER | **Foreign key** to `users(id)`, required |
| `title` | TEXT | Required, 1 to 100 characters |
| `body` | TEXT | Optional |
| `created_at` | TEXT (date and time) | Required, set automatically |
| `updated_at` | TEXT (date and time) | Required, set automatically |

### tags

| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER | **Primary key** |
| `user_id` | INTEGER | **Foreign key** to `users(id)`, required |
| `name` | TEXT | Required; unique for each user |

### note_tags (join table)

| Column | Type | Notes |
| --- | --- | --- |
| `note_id` | INTEGER | **Foreign key** to `notes(id)`; part of the primary key |
| `tag_id` | INTEGER | **Foreign key** to `tags(id)`; part of the primary key |

The primary key of `note_tags` is the pair (`note_id`, `tag_id`), which stops the same tag being attached to the same note twice.

## Relationships

- **users to notes: one-to-many.** One user has many notes, and each note belongs to exactly one user (`notes.user_id`).
- **users to tags: one-to-many.** One user has many tags, and each tag belongs to one user (`tags.user_id`).
- **notes to tags: many-to-many.** One note can have many tags (for example "study" and "urgent"), and one tag can be on many notes.

**Why `note_tags` is needed:** a relational table can't store a list of values in a single column. Putting a list of tags inside `notes`, or a list of notes inside `tags`, would make searching, counting and updating very hard. The join table turns the many-to-many relationship into two one-to-many relationships: one note has many `note_tags` rows, and one tag has many `note_tags` rows.

## CREATE TABLE statements

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  title      TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  body       TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE tags (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name    TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  UNIQUE (user_id, name)
);

CREATE TABLE note_tags (
  note_id INTEGER NOT NULL,
  tag_id  INTEGER NOT NULL,
  PRIMARY KEY (note_id, tag_id),
  FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)  REFERENCES tags (id)  ON DELETE CASCADE
);

-- Indexes (see the reasons below)
CREATE INDEX idx_notes_user_created ON notes (user_id, created_at DESC);
CREATE INDEX idx_note_tags_tag_id   ON note_tags (tag_id);
```

`ON DELETE CASCADE` means that deleting a note also deletes its `note_tags` rows, so no orphan rows are left behind.

## Example queries

**1. A user's 10 newest notes** (this is what `GET /notes` runs)

```sql
SELECT id, title, body, created_at
FROM notes
WHERE user_id = 1
ORDER BY created_at DESC
LIMIT 10;
```

**2. All notes with a given tag, with a JOIN** (this is what `GET /notes?tag=study` runs)

```sql
SELECT notes.id, notes.title, notes.created_at
FROM notes
JOIN note_tags ON note_tags.note_id = notes.id
JOIN tags      ON tags.id = note_tags.tag_id
WHERE notes.user_id = 1
  AND tags.name = 'study'
ORDER BY notes.created_at DESC;
```

**3. How many notes each tag has, including tags with none**

```sql
SELECT tags.name, COUNT(note_tags.note_id) AS note_count
FROM tags
LEFT JOIN note_tags ON note_tags.tag_id = tags.id
WHERE tags.user_id = 1
GROUP BY tags.id, tags.name
ORDER BY note_count DESC;
```

**4. Delete one of the user's notes** (the `user_id` check stops one user deleting another user's note)

```sql
DELETE FROM notes
WHERE id = 3 AND user_id = 1;
```

## Indexes

- **`idx_notes_user_created` on `notes (user_id, created_at DESC)`.** Almost every request asks for "this user's newest notes". Without the index, the database would read every note of every user to find them. With it, the database jumps straight to the user's notes, already sorted by date, which makes `GET /notes` fast even with millions of rows. The cost is slightly slower inserts, because the index must be updated.
- **`idx_note_tags_tag_id` on `note_tags (tag_id)`.** The primary key (`note_id`, `tag_id`) already makes "tags for a note" fast. This extra index makes the opposite lookup, "notes for a tag", fast too, which `GET /notes?tag=study` needs.

The `UNIQUE` columns (`users.email` and `tags (user_id, name)`) also get indexes automatically.

## SQL or NoSQL?

I would choose **SQL** (a relational database such as PostgreSQL) for QuickNotes. The data is highly structured and full of relationships: users own notes and tags, and notes and tags link in a many-to-many way. A relational database enforces the rules we need, including unique emails, foreign keys that stop a note pointing to a user who doesn't exist, and `ON DELETE CASCADE` that cleans up related rows. It also handles JOINs and counts well, which we need for tag filtering and tag totals. Transactions keep changes safe: creating a note and its tags either fully succeeds or not at all. At 1 million users, the load (roughly 10 writes per second on average) is small enough for one primary database with read replicas, so we don't need NoSQL's ability to spread data across many servers. If the app later needed to store huge volumes of loosely structured data, such as activity logs, we could add a NoSQL store beside the SQL database for that data only.