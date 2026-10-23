import { formatOrderNumber, InvalidOrderNumberRankError } from "../order-number.js";

describe("formatOrderNumber", () => {
  it("écrit le rang sans zéros devant ni année", () => {
    expect(formatOrderNumber(1)).toBe("ORD-1");
    expect(formatOrderNumber(42)).toBe("ORD-42");
    expect(formatOrderNumber(1042)).toBe("ORD-1042");
  });

  it("ne porte qu'un tiret, là où un ancien numéro en porte deux", () => {
    expect(formatOrderNumber(1042).split("-")).toHaveLength(2);
  });

  it.each([0, -1, 1.5, Number.NaN])("refuse un rang qui n'en est pas un (%s)", (rank) => {
    expect(() => formatOrderNumber(rank)).toThrow(InvalidOrderNumberRankError);
  });
});
