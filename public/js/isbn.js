// ISBN helpers shared by the page, the relay and the data builder

// ISBN-13 with a correct check digit (hyphens and spaces are dropped), or null
export function normalizeIsbn(raw) {
  const digits = String(raw).replace(/[-\s]/g, "");
  if (!/^97[89]\d{10}$/.test(digits)) return null;
  const sum = [...digits.slice(0, 12)].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(digits[12]) ? digits : null;
}

// ISBN-10 for a 978 book (book pages on Calil use it), or null for 979 books
export function isbn10Of(isbn13) {
  if (!/^978\d{10}$/.test(isbn13)) return null;
  const body = isbn13.slice(3, 12);
  const sum = [...body].reduce((s, d, i) => s + Number(d) * (10 - i), 0);
  const check = (11 - (sum % 11)) % 11;
  return body + (check === 10 ? "X" : String(check));
}
