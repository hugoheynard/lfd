import { FixedIdGenerator } from "../fixed-id-generator.js";

/** Générateur déterministe pour les tests : suite prévisible, préfixée, padée. */
describe("FixedIdGenerator", () => {
  it("rend une suite croissante padée", () => {
    const gen = new FixedIdGenerator("evt");
    expect(gen.next()).toBe("evt_000001");
    expect(gen.next()).toBe("evt_000002");
    expect(gen.next()).toBe("evt_000003");
  });

  it("utilise `id` comme préfixe par défaut", () => {
    expect(new FixedIdGenerator().next()).toBe("id_000001");
  });
});
