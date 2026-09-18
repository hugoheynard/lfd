import { activityQuerySchema } from "../activity-journal.js";

describe("activityQuerySchema — la recherche libre `q`", () => {
  it("est facultative : sans elle, la question reste celle d'hier", () => {
    expect(activityQuerySchema.parse({})).toEqual({ limit: 50 });
  });

  it("garde le texte cherché, débarrassé de ses espaces", () => {
    expect(activityQuerySchema.parse({ q: "  Cécile  " }).q).toBe("Cécile");
  });

  it("refuse un texte trop court une fois rogné — il ramènerait tout le journal", () => {
    expect(activityQuerySchema.safeParse({ q: "a" }).success).toBe(false);
    expect(activityQuerySchema.safeParse({ q: "  a  " }).success).toBe(false);
  });

  it("accepte 2 et 100 caractères, refuse 101", () => {
    expect(activityQuerySchema.safeParse({ q: "ab" }).success).toBe(true);
    expect(activityQuerySchema.safeParse({ q: "x".repeat(100) }).success).toBe(true);
    expect(activityQuerySchema.safeParse({ q: "x".repeat(101) }).success).toBe(false);
  });

  it("laisse passer les jokers SQL tels quels — c'est la lecture qui les neutralise", () => {
    expect(activityQuerySchema.parse({ q: "50%_\\" }).q).toBe("50%_\\");
  });
});
