# QuickNotes Architecture

QuickNotes is moving from a browser-only app to an online service for **1 million registered users**. This document sets out the requirements, estimates the load, and describes the architecture that can serve it.

## 1. Requirements

### Functional requirements

- Users can register and log in.
- Users can create, read, update and delete their own notes (title up to 100 characters, optional body).
- Users can add tags to notes and filter their notes by tag.
- Users can search their notes by text.
- Notes are saved on the server, so a user sees the same notes on every device.
- Users never see other users' notes.

### Non-functional requirements

- **Availability:** the service should stay up at least 99.9% of the time, about 9 hours of downtime a year at most.
- **Speed:** listing notes should answer in under 200 ms for most requests.
- **Scalability:** it must handle 1 million users and grow by adding servers, not by rewriting the app.
- **Durability:** a saved note must never be lost, so the data is copied and backed up.
- **Security:** all traffic uses HTTPS, passwords are stored hashed, and every request checks who owns the note.
- **Consistency:** after a user saves a note, they should see it straight away (read-your-own-writes). Other things, such as search results, may be a few seconds behind.

## 2. Load estimate (1 million users)

### Assumptions

- Registered users: **1,000,000**
- Active each day: **20%**, so **200,000 daily active users**
- Each active user opens their notes list **20 times a day** (reads)
- Each active user does **5 writes a day** (for example 3 new notes, 1 edit and 1 delete)
- A stored note, with its tags and database overhead, takes about **2 KB**
- One day is about **100,000 seconds** (a rounded-up estimate of 86,400 seconds)
- **Peak traffic is 5× the average**

### Results

| Measure | Working | Average | Peak (5×) |
| --- | --- | --- | --- |
| Reads per second | 200,000 × 20 = 4,000,000 reads/day ÷ 100,000 | **40 reads/s** | **200 reads/s** |
| Writes per second | 200,000 × 5 = 1,000,000 writes/day ÷ 100,000 | **10 writes/s** | **50 writes/s** |
| New notes per day | 200,000 × 3 = 600,000 notes | | |
| Storage per year | 600,000 notes × 2 KB = 1.2 GB/day × 365 | **about 440 GB/year** | |

**Conclusion:** the load is **read-heavy** (about 4 reads for every write), and it is small by internet standards. A single well-run database can store this and handle the writes. The design adds a cache and a read replica because reads dominate and because we want the service to survive failures, not because the load is extreme. Real storage will be higher once replicas and backups are counted, so plan for at least 3 times the figure above.

## 3. Architecture diagram

```
                         +------------------------+
                         |   Client               |
                         |   (browser / mobile)   |
                         +-----------+------------+
                                     |
                                     | 1. "api.quicknotes.example" -> IP address
                                     v
                         +-----------+------------+
                         |          DNS           |
                         +-----------+------------+
                                     |
                                     v
                         +-----------+------------+
                         |          CDN           |  serves index.html, CSS, JS
                         +-----------+------------+  (API requests pass through)
                                     |
                                     v
                         +-----------+------------+
                         |     Load balancer      |
                         +-----+-----------+------+
                               |           |
                    +----------+--+     +--+----------+
                    | App server 1|     | App server 2|   ... more as needed
                    | (stateless) |     | (stateless) |
                    +--+---+---+--+     +--+---+---+--+
                       |   |   |           |   |   |
          +------------+   |   +-----------+---+   +----------------+
          |                |               |                        |
          v                v               v                        v
   +------+------+   +-----+-----------------------+          +-----+-------+
   |    Cache    |   |   Database primary          |          |    Queue    |
   |   (Redis)   |   |   (all writes)              |          +-----+-------+
   +-------------+   +-----+-----------------------+                |
                           |  copies every change                   v
                           v                              +---------+---------+
                    +------+---------+                    |  Worker(s)        |
                    |  Read replica  |                    |  (background jobs)|
                    | (read queries) |                    +-------------------+
                    +----------------+
```

Reads go to the cache first and then the read replica. Writes go to the primary database. Slow jobs go through the queue to the workers.

## 4. What each component does

- **Client:** the browser or phone app that shows the notes and sends API requests, so users never need to talk to the database directly.
- **DNS:** it turns the name `api.quicknotes.example` into the address of our servers, so users can reach us with a name instead of a number and we can move servers without changing the name.
- **CDN:** it keeps copies of static files (the page, CSS and JavaScript) on servers close to the user, so the app loads quickly and our own servers don't have to send these files.
- **Load balancer:** it spreads requests across the app servers and stops sending requests to a server that is down, so no single server is overloaded and one failure doesn't take the service offline.
- **App servers (two or more):** they run the QuickNotes API logic (login checks, validation, reading and writing notes), and because they keep no user data of their own, we can add more of them as traffic grows.
- **Cache (Redis):** it keeps recent note lists in memory so repeated reads are answered in under a millisecond without touching the database.
- **Primary database:** it is the trusted, durable record of users, notes and tags, and it handles every write so the data stays consistent.
- **Read replica:** it is a live copy of the primary that answers read queries, which takes load off the primary and gives us a ready copy if the primary fails.
- **Queue:** it holds background jobs, so a request can finish immediately and a burst of work can wait in line instead of overloading the servers.
- **Worker:** it takes jobs from the queue and does the slow work, such as updating the search index, sending emails and cleaning up deleted notes, away from the user's request.

## 5. Request flows

### `GET /notes` (list my notes)

1. The client asks DNS for the API address and sends `GET /notes` over HTTPS with its token.
2. The request reaches the **load balancer**, which picks a healthy **app server**.
3. The app server checks the token. If it is invalid, it replies `401`.
4. The app server looks in the **cache** for the key `notes:user:{id}:page1`.
5. **Cache hit:** it returns the cached list straight away with `200 OK`.
6. **Cache miss:** it runs the query on the **read replica** (the user's newest notes, limited to the page size).
7. The app server stores the result in the cache with a short expiry time (for example 60 seconds), then returns it with `200 OK`.

### `POST /notes` (create a note)

1. The client sends `POST /notes` with the JSON body and its token. The request goes through DNS and the load balancer to an **app server**.
2. The app server checks the token (`401` if not valid) and **validates** the body: the title is required and at most 100 characters (`400` if not).
3. In one transaction on the **primary database**, it inserts the note and links any tags in `note_tags`.
4. The app server **deletes the user's cached note lists** from the cache, so the next `GET /notes` doesn't return old data.
5. It adds a job such as "index note 101 for search" to the **queue**.
6. It replies `201 Created` with the new note and a `Location` header. The user does not wait for the queue job.
7. A **worker** takes the job from the queue and updates the search index. If it fails, the job is retried a few times and then logged for review.
8. The primary database copies the change to the **read replica** within moments.

## 6. Trade-offs

1. **Speed vs fresh data (cache and read replica).** The cache and replica make reads fast and protect the primary database, but a read can briefly return old data, because cached lists live for up to a minute and the replica copies changes a moment after they happen. We reduce the problem by deleting the cache when a user writes, and by reading from the primary right after a write if needed, so users always see their own changes. We accept small delays for other data because reads are the most common action.
2. **Fast replies vs instant results (queue and worker).** Moving slow jobs to a queue keeps `POST /notes` quick and lets us survive bursts, but search results are updated a few seconds after the note is saved, and we have extra parts to run and watch. We accept this because search does not need to be instant.
3. **Simple database vs unlimited growth (SQL with one primary).** A single primary keeps data consistent and queries simple, but all writes go through one machine, so it eventually reaches a limit. At about 50 writes per second at peak we are far from that limit. If we ever grew much larger, we could split users across several databases (sharding), at the cost of more complexity.
4. **Cost vs resilience (extra servers).** Running two or more app servers and a replica costs more than one of each, but a single machine failing would take the whole service down. We accept the cost for the reliability.

## 7. Avoiding single points of failure

A single point of failure is one component that, if it fails, stops the whole system. We avoid them like this:

- **App servers:** there are at least two, behind the load balancer, which stops sending traffic to a failed one. They keep no data of their own, so any server can handle any request.
- **Load balancer:** we use a managed load balancer that runs on several machines, or two in a pair, so it isn't a single machine.
- **Primary database:** the read replica receives every change, and if the primary fails it is promoted to be the new primary (automatic failover). We also take regular backups and keep them in a separate place.
- **Cache:** if it fails, app servers fall back to reading from the replica. The service becomes slower, but it stays up. The cache can also run as a pair, a main one with a copy.
- **Queue and workers:** the queue stores jobs safely until a worker has finished them, and we run more than one worker, so if a worker crashes another one takes over.
- **DNS and CDN:** we use providers that run on many servers around the world, and DNS with several name servers.
- **Data centres:** we spread servers across at least two availability zones (separate buildings), so a power or network failure in one doesn't stop the service.