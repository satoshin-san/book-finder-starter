// The questions and the tags behind each answer. Write your own: a tag here matches the tags column of data/books.csv.
// A choice whose tag no book has is hidden (see visibleQuestions in pick.js), so no answer leads to an empty shelf.

export const QUESTIONS = [
  {
    id: "mood",
    text: "いまの 気持ちに 近いのは？",
    choices: [
      { label: "元気を 出したい", tag: "cheer" },
      { label: "じっくり 考えたい", tag: "think" },
      { label: "気軽に 読みたい", tag: "easy" },
    ],
  },
  {
    id: "length",
    text: "どのくらいの 長さが いい？",
    choices: [
      { label: "短めが いい", tag: "short" },
      { label: "長くても いい", tag: null },
    ],
  },
];
