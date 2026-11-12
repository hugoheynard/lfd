import {
  MalformedExpectedRevisionError,
  parseExpectedRevision,
} from "../expected-revision.decorator.js";

describe("parseExpectedRevision — l'en-tête If-Match d'une fiche", () => {
  it("absent : rien à comparer", () => {
    expect(parseExpectedRevision(undefined)).toBeNull();
  });

  it.each([
    ['"7"', 7],
    ["7", 7],
    [' "0" ', 0],
  ])("lit %s comme la révision %i", (header, revision) => {
    expect(parseExpectedRevision(header)).toBe(revision);
  });

  it.each(["", "*", '"abc"', "-1", "1.5", 'W/"3"'])("refuse %p", (header) => {
    expect(() => parseExpectedRevision(header)).toThrow(MalformedExpectedRevisionError);
  });

  it("refuse un en-tête répété", () => {
    expect(() => parseExpectedRevision(["1", "2"])).toThrow(MalformedExpectedRevisionError);
  });
});
