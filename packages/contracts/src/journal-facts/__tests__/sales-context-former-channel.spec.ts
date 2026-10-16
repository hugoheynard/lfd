import { checkJournalFact, journalPayloadShapes, type JournalFactType } from "../index.js";

/**
 * Les contextes de vente ont perdu les deux réglages de l'ancien canal de vente
 * en ligne le 2026-10-16, et la migration `20261016200000` a RENOMMÉ leurs clés
 * dans les faits passés. Ces lignes réécrites doivent se relire — sans quoi
 * tout l'historique des contextes s'afficherait comme un fait sans forme — et
 * plus aucune ne doit s'écrire.
 */

function readable(type: JournalFactType, line: unknown): boolean {
  return journalPayloadShapes(type).some((shape) => shape.safeParse(line).success);
}

describe("sales_context.* après le retrait de l'ancien canal", () => {
  it("une ligne .created réécrite (premier niveau) se relit, mais ne s'écrit plus", () => {
    const rewritten = {
      subjectLabel: "Traiteur",
      key: "traiteur",
      label: "Traiteur",
      active: true,
      projectedToFormerChannel: false,
    };

    expect(readable("sales_context.created", rewritten)).toBe(true);
    expect(checkJournalFact("sales_context.created", rewritten)).toMatchObject({
      kind: "invalid_payload",
    });
  });

  it("une ligne .created d'avant les libellés, réécrite, se relit aussi", () => {
    const rewritten = {
      key: "traiteur",
      label: "Traiteur",
      active: true,
      projectedToFormerChannel: true,
    };

    expect(readable("sales_context.created", rewritten)).toBe(true);
  });

  it("une ligne .updated réécrite (sous `changes`) se relit, mais ne s'écrit plus", () => {
    const rewritten = {
      subjectLabel: "Traiteur",
      changes: {
        formerChannelHandleSuffix: { from: "", to: "-traiteur" },
        projectedToFormerChannel: { from: false, to: true },
      },
    };

    expect(readable("sales_context.updated", rewritten)).toBe(true);
    expect(checkJournalFact("sales_context.updated", rewritten)).toMatchObject({
      kind: "invalid_payload",
    });
  });

  it("la forme courante s'écrit sans aucun réglage de canal", () => {
    expect(
      checkJournalFact("sales_context.created", {
        subjectLabel: "Traiteur",
        key: "traiteur",
        label: "Traiteur",
        active: true,
      }),
    ).toBeNull();
    expect(
      checkJournalFact("sales_context.updated", {
        subjectLabel: "Traiteur",
        changes: { label: { from: "Traiteur", to: "Service traiteur" } },
      }),
    ).toBeNull();
  });
});
