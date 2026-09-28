import { dayVersionQuerySchema, dayVersionViewSchema } from "../day-version.js";

describe("dayVersionQuerySchema", () => {
  it("exige une date AAAA-MM-JJ : un veilleur sait toujours quelle journée il regarde", () => {
    expect(dayVersionQuerySchema.safeParse({ date: "2026-10-03" }).success).toBe(true);
    expect(dayVersionQuerySchema.safeParse({ date: "03/10/2026" }).success).toBe(false);
    expect(dayVersionQuerySchema.safeParse({}).success).toBe(false);
  });
});

describe("dayVersionViewSchema", () => {
  it("accepte la version zéro — une journée jamais touchée — et refuse une version négative", () => {
    expect(dayVersionViewSchema.safeParse({ date: "2026-10-03", version: 0 }).success).toBe(true);
    expect(dayVersionViewSchema.safeParse({ date: "2026-10-03", version: -1 }).success).toBe(false);
  });
});
