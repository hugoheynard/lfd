import { LogBuffer, type RecordedLog } from "../log-buffer.js";

function line(message: string, at = "2026-08-16T13:00:00.000Z"): RecordedLog {
  return { at, level: "error", context: "Test", message };
}

describe("LogBuffer", () => {
  it("rend les lignes les plus récentes d'abord", () => {
    // Un incident se lit à l'envers du temps : on part de ce qui vient
    // d'échouer, pas de ce qui allait bien il y a une heure.
    const buffer = new LogBuffer(10);
    buffer.record(line("première"));
    buffer.record(line("seconde"));

    expect(buffer.recent(10).map((entry) => entry.message)).toEqual(["seconde", "première"]);
  });

  it("oublie les plus anciennes au-delà de sa capacité", () => {
    // Borné PAR CONSTRUCTION : un tampon qui grandit sans fin dans un process
    // qui ne redémarre pas est une fuite mémoire déguisée en outil.
    const buffer = new LogBuffer(2);
    buffer.record(line("a"));
    buffer.record(line("b"));
    buffer.record(line("c"));

    expect(buffer.size()).toBe(2);
    expect(buffer.recent(10).map((entry) => entry.message)).toEqual(["c", "b"]);
  });

  it("ne rend jamais plus que ce qu'on lui demande", () => {
    const buffer = new LogBuffer(10);
    buffer.record(line("a"));
    buffer.record(line("b"));

    expect(buffer.recent(1).map((entry) => entry.message)).toEqual(["b"]);
  });

  it("supporte une demande nulle ou plus grande que le contenu", () => {
    const buffer = new LogBuffer(10);
    buffer.record(line("seule"));

    expect(buffer.recent(0)).toEqual([]);
    expect(buffer.recent(99)).toHaveLength(1);
  });

  it("est vide tant que rien n'a échoué", () => {
    expect(new LogBuffer(10).recent(5)).toEqual([]);
  });
});
