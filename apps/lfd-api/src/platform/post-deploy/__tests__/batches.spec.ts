import { boundedSample, inBatches } from "../batches.js";

describe("inBatches", () => {
  it("découpe dans l'ordre, le dernier lot plus court", () => {
    expect(inBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("une liste vide ne fait aucun lot", () => {
    expect(inBatches([], 3)).toEqual([]);
  });
});

describe("boundedSample", () => {
  it("garde tout sous la borne", () => {
    expect(boundedSample(["a", "b"], 2)).toEqual(["a", "b"]);
  });

  it("au-delà, dit combien ont été tues", () => {
    expect(boundedSample(["a", "b", "c"], 2)).toEqual(["a", "b", "… et 1 autre(s)."]);
  });
});
