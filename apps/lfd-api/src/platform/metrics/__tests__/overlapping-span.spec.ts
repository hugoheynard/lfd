import { OverlappingSpan } from "../overlapping-span.js";

describe("OverlappingSpan", () => {
  it("additionne des lectures séquentielles", () => {
    const span = new OverlappingSpan("catalogue");
    span.enter(0);
    span.leave(10);
    span.enter(20);
    span.leave(25);
    expect(span.marksAt(30)).toEqual([
      { name: "catalogue", durationMs: 15 },
      { name: "catalogue-reads", durationMs: 0, description: "2" },
    ]);
  });

  it("ne compte qu'une fois le temps de lectures parallèles", () => {
    const span = new OverlappingSpan("catalogue");
    span.enter(0);
    span.enter(2);
    span.enter(4);
    span.leave(8);
    span.leave(9);
    span.leave(12);
    expect(span.marksAt(20)[0]).toEqual({ name: "catalogue", durationMs: 12 });
    expect(span.marksAt(20)[1]?.description).toBe("3");
  });

  it("compte l'union de chevauchements partiels séparés par un creux", () => {
    const span = new OverlappingSpan("catalogue");
    span.enter(0);
    span.enter(5);
    span.leave(6);
    span.leave(10);
    span.enter(30);
    span.leave(31);
    expect(span.marksAt(40)[0]?.durationMs).toBe(11);
  });

  it("inclut une lecture encore ouverte au moment d'écrire l'en-tête", () => {
    const span = new OverlappingSpan("catalogue");
    span.enter(10);
    expect(span.marksAt(14)[0]?.durationMs).toBe(4);
  });

  it("ignore une sortie sans entrée", () => {
    const span = new OverlappingSpan("catalogue");
    span.leave(5);
    expect(span.marksAt(5)).toEqual([
      { name: "catalogue", durationMs: 0 },
      { name: "catalogue-reads", durationMs: 0, description: "0" },
    ]);
  });
});
