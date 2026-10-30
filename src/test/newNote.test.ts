import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "yaml";
import { buildNewNote } from "../newNote";
import { formatModifiedTimestamp } from "../modified";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("creates a fresh UUID and exactly the requested frontmatter with identical local timestamps", () => {
  const date = new Date(2026, 9, 30, 10, 53, 23);
  const note = buildNewNote("a new note", date);
  assert.match(note.id, uuid);
  assert.notEqual(note.id, buildNewNote("a new note", date).id);
  assert.equal(note.contents, `---\nid: ${note.id}\ntitle: a new note\ncreated: ${formatModifiedTimestamp(date)}\nmodified: ${formatModifiedTimestamp(date)}\n---\n\n`);
});

test("preserves special titles as YAML strings without injecting properties", () => {
  for (const title of ["true", "42", "A title: with colon # and comment", 'A "quoted" title', "[a, b]", "O'Reilly", "Résumé 📚"]) {
    const { contents, id } = buildNewNote(`  ${title}  `);
    const data = parse(contents.slice(4, contents.lastIndexOf("---")));
    assert.deepEqual(Object.keys(data), ["id", "title", "created", "modified"]);
    assert.equal(data.id, id);
    assert.equal(data.title, title);
    assert.equal(data.created, data.modified);
  }
});

test("rejects empty or multiline note titles", () => {
  for (const title of ["", "  ", "one\ntwo", "one\rtwo"]) {
    assert.throws(() => buildNewNote(title), /nonempty single line/);
  }
});
