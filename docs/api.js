// QuickNotes API client.
// Talks to the JSONPlaceholder practice API using fetch, async/await and
// try/catch/finally.
//
// IMPORTANT: JSONPlaceholder is a FAKE API. It accepts POST and DELETE requests
// and answers as if they worked (for example status 201 with the id 101), but it
// never really saves or deletes anything. Every new note also gets the same id,
// 101. So this page keeps its own list of notes (the `notes` array) and updates
// it after each successful response. That list is what the user sees. Each note
// also gets a `localId` that is unique on this page, so we can delete the right
// note even when several created notes share the id 101. Reloading the page or
// clicking "Load notes" again shows the server's original 10 notes.

const API_URL = "https://jsonplaceholder.typicode.com/posts";
const MAX_TITLE_LENGTH = 100;

// ---------- Select elements ----------
const loadBtn = document.querySelector("#load-btn");
const statusMessage = document.querySelector("#status");
const notesList = document.querySelector("#notes-list");
const form = document.querySelector("#note-form");
const titleInput = document.querySelector("#title-input");
const bodyInput = document.querySelector("#body-input");
const submitBtn = document.querySelector("#submit-btn");

// ---------- State ----------
let notes = [];
let nextLocalId = 1;
const deleting = new Set(); // localIds of notes with a DELETE request running

// ---------- Status messages ----------
// type is "loading", "success" or "error" (styled in style.css)
function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = type;
}

function friendlyError(error) {
  if (error instanceof TypeError) {
    return "Could not reach the server. Check your internet connection and try again.";
  }
  return `Something went wrong. ${error.message}`;
}

// ---------- One reusable request function ----------
async function request(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`The server responded with status ${response.status}.`);
  }

  // Some APIs return an empty body (for example 204), so read text first
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
}

// ---------- API functions ----------
function getNotes() {
  return request(`${API_URL}?_limit=10`);
}

function createNote(note) {
  return request(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(note)
  });
}

function deleteNote(id) {
  return request(`${API_URL}/${id}`, { method: "DELETE" });
}

// ---------- Drawing the list (textContent only) ----------
function renderNotes() {
  notesList.replaceChildren();

  if (notes.length === 0) {
    const empty = document.createElement("li");
    empty.classList.add("empty-state");
    empty.textContent = "No notes yet. Click \"Load notes\" or add one above.";
    notesList.appendChild(empty);
    return;
  }

  notes.forEach(function (note) {
    const item = document.createElement("li");
    item.classList.add("note-card");

    const title = document.createElement("h3");
    title.textContent = note.title;

    const body = document.createElement("p");
    body.textContent = note.body || "(no body)";

    item.append(title, body);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.classList.add("delete-btn");
    deleteButton.textContent = "Delete";
    deleteButton.disabled = deleting.has(note.localId);
    deleteButton.addEventListener("click", function () {
      handleDelete(note);
    });
    item.appendChild(deleteButton);

    notesList.appendChild(item);
  });
}

// ---------- GET: load notes ----------
async function handleLoad() {
  loadBtn.disabled = true;
  showStatus("Loading notes...", "loading");

  try {
    const result = await getNotes();
    notes = result.data.map(function (note) {
      return { ...note, localId: nextLocalId++ };
    });
    renderNotes();

    if (notes.length === 0) {
      showStatus("The server returned no notes.", "success");
    } else {
      const word = notes.length === 1 ? "note" : "notes";
      showStatus(`Loaded ${notes.length} ${word} from the server.`, "success");
    }
  } catch (error) {
    showStatus(friendlyError(error), "error");
  } finally {
    loadBtn.disabled = false;
  }
}

// ---------- Validation ----------
// Returns an error message, or "" when the title is fine.
function validateTitle(title) {
  if (title === "") {
    return "Please type a title for your note.";
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return `The title must be ${MAX_TITLE_LENGTH} characters or fewer.`;
  }
  return "";
}

// ---------- POST: create a note ----------
async function handleSubmit(event) {
  event.preventDefault();
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  const problem = validateTitle(title);
  if (problem) {
    showStatus(problem, "error");
    titleInput.focus();
    return;
  }

  submitBtn.disabled = true;
  showStatus("Creating note...", "loading");

  try {
    const result = await createNote({ title: title, body: body, userId: 1 });
    notes.unshift({ ...result.data, localId: nextLocalId++ });
    renderNotes();
    showStatus(`Note created (status ${result.status}, id ${result.data.id}).`, "success");
    form.reset();
    titleInput.focus();
  } catch (error) {
    showStatus(friendlyError(error), "error");
  } finally {
    submitBtn.disabled = false;
  }
}

// ---------- DELETE: remove a note ----------
async function handleDelete(note) {
  deleting.add(note.localId);
  renderNotes(); // shows this note's Delete button as disabled
  showStatus(`Deleting note ${note.id}...`, "loading");

  try {
    await deleteNote(note.id);
    // Remove by localId, not id: created notes all share the id 101
    notes = notes.filter(function (item) {
      return item.localId !== note.localId;
    });
    showStatus(`Note ${note.id} deleted.`, "success");
  } catch (error) {
    showStatus(friendlyError(error), "error");
  } finally {
    deleting.delete(note.localId);
    renderNotes();
  }
}

// ---------- Events ----------
loadBtn.addEventListener("click", handleLoad);
form.addEventListener("submit", handleSubmit);

renderNotes();