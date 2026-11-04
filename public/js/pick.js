// Picking books by tags. Pure and deterministic: the same answers and the same shelf always give
// the same books in the same order. No AI and no network here.

// Books that share the most wanted tags come first; ties go by title, then ISBN
export function pickBooks(books, wantedTags, limit = 3) {
  const wanted = [...new Set(wantedTags.filter(Boolean))];
  if (!wanted.length) return [];
  return books
    .map((book) => ({ book, score: wanted.filter((t) => book.tags.includes(t)).length }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.book.title.localeCompare(b.book.title, "ja") || a.book.isbn.localeCompare(b.book.isbn))
    .slice(0, limit)
    .map(({ book }) => book);
}

// Questions with only the choices some book can answer; a question left with nothing to pick is dropped
export function visibleQuestions(questions, books) {
  const onShelf = new Set(books.flatMap((b) => b.tags));
  return questions
    .map((q) => ({ ...q, choices: q.choices.filter((c) => c.tag === null || onShelf.has(c.tag)) }))
    .filter((q) => q.choices.some((c) => c.tag !== null));
}
