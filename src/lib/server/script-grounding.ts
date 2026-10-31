/** Normalized comparison text with offsets into the untouched UTF-16 source. */
export interface SourceIndex {
  text: string;
  starts: number[];
  ends: number[];
}
export function indexSource(source: string, offset = 0): SourceIndex {
  const output: string[] = [],
    starts: number[] = [],
    ends: number[] = [];
  let position = offset;
  for (const character of source) {
    const end = position + character.length;
    const normalized = /\s/u.test(character)
      ? " "
      : character
          .replace(/[‘’]/g, "'")
          .replace(/[“”]/g, '"')
          .toLocaleLowerCase("en-US");
    if (normalized === " " && output[output.length - 1] === " ")
      ends[ends.length - 1] = end;
    else
      for (let index = 0; index < normalized.length; index++) {
        output.push(normalized[index]);
        starts.push(position);
        ends.push(end);
      }
    position = end;
  }
  return { text: output.join(""), starts, ends };
}
export function sourceComparisonKey(value: string) {
  return indexSource(value).text.trim();
}
const headingKey = (value: string) =>
  sourceComparisonKey(value).replace(/^\.(?=\S)/, "");

export function findSourceHeading(source: string, heading: string, after = 0) {
  const wanted = headingKey(heading);
  if (!wanted) return null;
  let start = 0;
  for (const line of source.split("\n")) {
    const raw = line.replace(/\r$/, "");
    if (start >= after && headingKey(raw) === wanted)
      return {
        start,
        end: start + raw.length,
        heading: raw.trimEnd(),
        normalized: raw !== heading,
      };
    start += line.length + 1;
  }
  return null;
}
export function findSourceQuote(index: SourceIndex, quote: string) {
  const wanted = sourceComparisonKey(quote);
  if (!wanted) return null;
  const start = index.text.indexOf(wanted);
  if (start < 0) return null;
  return {
    start: index.starts[start],
    end: index.ends[start + wanted.length - 1],
    repeated: index.text.indexOf(wanted, start + 1) >= 0,
  };
}
/** Retain at most one substantial exact excerpt; never stitch omitted spans. */
export function sourceQuoteCandidates(quote: string) {
  const fragments = quote
    .split(/(?:\.{3}|…|\.\s+\.\s+\.)/u)
    .map((value) => value.trim())
    .filter((value) => value.length >= 48 && value.split(/\s+/u).length >= 8)
    .sort((left, right) => right.length - left.length);
  return [
    { quote, repaired: false },
    ...fragments
      .filter((value) => value !== quote)
      .map((value) => ({ quote: value, repaired: true })),
  ];
}
export function findGroundedSourceQuote(index: SourceIndex, quote: string) {
  for (const candidate of sourceQuoteCandidates(quote)) {
    const span = findSourceQuote(index, candidate.quote);
    if (span) return { ...span, repaired: candidate.repaired };
  }
  return null;
}
