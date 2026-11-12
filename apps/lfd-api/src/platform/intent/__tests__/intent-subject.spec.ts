import { intentSubject } from "../intent-subject.js";

describe("intentSubject", () => {
  it("vise la cible et reconnaît le même contenu", () => {
    const first = intentSubject("co_1", { label: "Atelier" }, null);
    expect(first).toBe(intentSubject("co_1", { label: "Atelier" }, null));
    expect(first.startsWith("co_1|")).toBe(true);
  });

  it("distingue un autre contenu, une autre cible, et un autre découpage", () => {
    const base = intentSubject("co_1", "ab", "c");
    expect(base).not.toBe(intentSubject("co_1", "a", "bc"));
    expect(base).not.toBe(intentSubject("co_2", "ab", "c"));
    expect(intentSubject("co_1", Buffer.from("x"))).not.toBe(
      intentSubject("co_1", Buffer.from("y")),
    );
  });

  it("tient dans la colonne du registre, sans recopier le contenu", () => {
    const subject = intentSubject("01J0000000000000000000000", "un très long texte ".repeat(200));
    expect(subject.length).toBeLessThanOrEqual(300);
    expect(subject).not.toContain("texte");
  });
});
