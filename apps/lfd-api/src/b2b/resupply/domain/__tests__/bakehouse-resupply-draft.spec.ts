import { BakehouseResupplyDraft } from "../bakehouse-resupply-draft.js";
import {
  BakehouseResupplyDraftChangedMeanwhileError,
  BakehouseResupplyDraftClosedError,
  DuplicateBakehouseResupplyDraftLineError,
  EmptyBakehouseResupplyDraftError,
  TooManyBakehouseResupplyDraftLinesError,
} from "../bakehouse-resupply-draft-errors.js";
import {
  InvalidRequestedQuantityError,
  ResupplyNameTooLongError,
} from "../site-resupply-errors.js";

/** Seule date du fichier, comparée à elle-même : aucune règle ne la confronte à l'horloge. */
const AT = new Date("2026-01-02T16:00:00Z");
const TRACE = { at: AT, author: { staffUserId: "s", name: "Lou", role: "bakehouse" } };
const CONTENT = {
  siteId: "site_1",
  target: "tomorrow" as const,
  name: "  Vitrine   du matin ",
  lines: [{ sku: " CRO ", quantity: 4 }],
};

/** Un brouillon écrit une fois, relu en version 1. */
function stored(): BakehouseResupplyDraft {
  const fresh = BakehouseResupplyDraft.open({ id: "d1", content: CONTENT, trace: TRACE });
  return BakehouseResupplyDraft.restore({ ...fresh.snapshot(), version: 1 });
}

describe("le brouillon d'un réassort du fournil", () => {
  it("naît ouvert, en version 0, le nom et les SKU rognés", () => {
    const draft = BakehouseResupplyDraft.open({ id: "d1", content: CONTENT, trace: TRACE });
    expect(draft.status).toBe("open");
    expect(draft.version).toBe(0);
    expect(draft.nextVersion).toBe(1);
    expect(draft.content).toEqual({
      siteId: "site_1",
      target: "tomorrow",
      name: "Vitrine du matin",
      lines: [{ sku: "CRO", quantity: 4 }],
    });
  });

  it("refuse un brouillon vide, une quantité nulle, un même article deux fois, un nom trop long", () => {
    const open = (content: Partial<typeof CONTENT> & object) =>
      BakehouseResupplyDraft.open({ id: "d", content: { ...CONTENT, ...content }, trace: TRACE });
    expect(() => open({ lines: [] })).toThrow(EmptyBakehouseResupplyDraftError);
    expect(() => open({ lines: [{ sku: "CRO", quantity: 0 }] })).toThrow(
      InvalidRequestedQuantityError,
    );
    expect(() => open({ lines: [{ sku: "CRO", quantity: 1.5 }] })).toThrow(
      InvalidRequestedQuantityError,
    );
    expect(() =>
      open({
        lines: [
          { sku: "CRO", quantity: 1 },
          { sku: " CRO", quantity: 2 },
        ],
      }),
    ).toThrow(DuplicateBakehouseResupplyDraftLineError);
    expect(() => open({ name: "a".repeat(61) })).toThrow(ResupplyNameTooLongError);
  });

  it("refuse plus de 200 lignes", () => {
    const lines = Array.from({ length: 201 }, (_, index) => ({
      sku: `S${String(index)}`,
      quantity: 1,
    }));
    expect(() =>
      BakehouseResupplyDraft.open({ id: "d", content: { ...CONTENT, lines }, trace: TRACE }),
    ).toThrow(TooManyBakehouseResupplyDraftLinesError);
  });

  it("se réécrit en entier sous la version lue", () => {
    const draft = stored();
    const later = { ...TRACE, author: { ...TRACE.author, name: "Max" } };
    draft.save({ ...CONTENT, name: null, lines: [{ sku: "PAC", quantity: 2 }] }, later, 1);
    expect(draft.content.lines).toEqual([{ sku: "PAC", quantity: 2 }]);
    expect(draft.content.name).toBeNull();
    expect(draft.updated.author.name).toBe("Max");
    expect(draft.created.author.name).toBe("Lou");
  });

  it("refuse une version périmée", () => {
    expect(() => stored().save(CONTENT, TRACE, 2)).toThrow(
      BakehouseResupplyDraftChangedMeanwhileError,
    );
    expect(() => stored().discard(TRACE, 0)).toThrow(BakehouseResupplyDraftChangedMeanwhileError);
  });

  it("supprimé, il passe `discarded` et ne s'écrit plus", () => {
    const draft = stored();
    draft.discard(TRACE, 1);
    expect(draft.status).toBe("discarded");
    expect(draft.closed).toEqual(TRACE);
    expect(() => draft.save(CONTENT, TRACE, 1)).toThrow(BakehouseResupplyDraftClosedError);
    expect(() => draft.discard(TRACE, 1)).toThrow(BakehouseResupplyDraftClosedError);
  });

  it("envoyé, il garde le contenu de l'écran et le réassort né, et ne revient pas en arrière", () => {
    const draft = stored();
    draft.markSent({
      content: { ...CONTENT, lines: [{ sku: "PAC", quantity: 9 }] },
      resupplyId: "rs1",
      trace: TRACE,
      readVersion: 1,
    });
    expect(draft.status).toBe("sent");
    expect(draft.sentResupplyId).toBe("rs1");
    expect(draft.content.lines).toEqual([{ sku: "PAC", quantity: 9 }]);
    expect(() => draft.discard(TRACE, 1)).toThrow(BakehouseResupplyDraftClosedError);
  });

  it("un envoi refusé pour version périmée ne touche à rien", () => {
    const draft = stored();
    expect(() =>
      draft.markSent({ content: CONTENT, resupplyId: "rs1", trace: TRACE, readVersion: 3 }),
    ).toThrow(BakehouseResupplyDraftChangedMeanwhileError);
    expect(draft.status).toBe("open");
    expect(draft.sentResupplyId).toBeNull();
  });
});
