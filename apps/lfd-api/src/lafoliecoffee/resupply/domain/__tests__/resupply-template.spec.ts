import {
  InvalidResupplyArrivalTimeError,
  ResupplyArrivalOnAsapError,
} from "../resupply-arrival-errors.js";
import { DuplicateBakehouseResupplyDraftLineError } from "../bakehouse-resupply-draft-errors.js";
import { draftContentOf } from "../bakehouse-resupply-draft-content.js";
import { ResupplyTemplate } from "../resupply-template.js";
import { templateLineIssueOf } from "../resupply-template-applicability.js";
import {
  BlankResupplyTemplateSkuError,
  DuplicateResupplyTemplateLineError,
  EmptyResupplyTemplateError,
  ResupplyTemplateArchivedError,
  ResupplyTemplateChangedMeanwhileError,
  ResupplyTemplateKeyTakenError,
  ResupplyTemplateNameRequiredError,
  TooManyResupplyTemplateLinesError,
} from "../resupply-template-errors.js";
import {
  InvalidRequestedQuantityError,
  ResupplyNameTooLongError,
} from "../site-resupply-errors.js";

/** Seule date du fichier, comparée à elle-même : aucune règle ne la confronte à l'horloge. */
const AT = new Date("2026-01-02T16:00:00Z");
const LATER = new Date("2026-01-03T08:00:00Z");
const TRACE = { at: AT, author: { staffUserId: "s1", name: "Lou", role: "counter" } };
const LATER_TRACE = { at: LATER, author: { staffUserId: "s2", name: "Max", role: "counter" } };
const CONTENT = {
  name: "  Base   matin ",
  target: "tomorrow" as const,
  lines: [{ sku: " CRO ", quantity: 4, saleUnit: "piece" as const }],
};

function created(content: Partial<typeof CONTENT> = {}): ResupplyTemplate {
  return ResupplyTemplate.create({
    id: "t1",
    siteId: "site_1",
    content: { ...CONTENT, ...content },
    trace: TRACE,
  });
}

/** Un modèle écrit une fois, relu en version 1. */
function stored(): ResupplyTemplate {
  return ResupplyTemplate.restore({ ...created().snapshot(), version: 1 });
}

describe("un modèle de réassort", () => {
  it("naît en version 0, au point donné, le nom et les SKU rognés", () => {
    const template = created();
    expect(template.version).toBe(0);
    expect(template.nextVersion).toBe(1);
    expect(template.siteId).toBe("site_1");
    expect(template.archived).toBeNull();
    expect(template.content).toEqual({
      name: "Base matin",
      target: "tomorrow",
      arrivalBy: null,
      lines: [{ sku: "CRO", quantity: 4, saleUnit: "piece" }],
    });
  });

  it("exige un nom, et refuse un nom trop long", () => {
    expect(() => created({ name: "   " })).toThrow(ResupplyTemplateNameRequiredError);
    expect(() => created({ name: "x".repeat(61) })).toThrow(ResupplyNameTooLongError);
  });

  it("refuse un modèle vide, trop long, un SKU blanc, une quantité non entière, un doublon", () => {
    const line = (sku: string, quantity = 1) => ({ sku, quantity, saleUnit: "piece" as const });
    expect(() => created({ lines: [] })).toThrow(EmptyResupplyTemplateError);
    const many = Array.from({ length: 201 }, (_, index) => line(`S${String(index)}`));
    expect(() => created({ lines: many })).toThrow(TooManyResupplyTemplateLinesError);
    expect(() => created({ lines: [line("  ")] })).toThrow(BlankResupplyTemplateSkuError);
    expect(() => created({ lines: [line("CRO", 0)] })).toThrow(InvalidRequestedQuantityError);
    expect(() => created({ lines: [line("CRO", 1.5)] })).toThrow(InvalidRequestedQuantityError);
    expect(() => created({ lines: [line("CRO"), line(" CRO")] })).toThrow(
      DuplicateResupplyTemplateLineError,
    );
  });

  it("s'ajuste sous la version lue : le contenu entier remplace le précédent", () => {
    const template = stored();
    template.adjust(
      {
        name: "Base du mardi",
        target: "asap",
        lines: [{ sku: "PAC", quantity: 2, saleUnit: "piece" }],
      },
      1,
      LATER_TRACE,
    );
    expect(template.content.name).toBe("Base du mardi");
    expect(template.content.target).toBe("asap");
    expect(template.content.lines).toEqual([{ sku: "PAC", quantity: 2, saleUnit: "piece" }]);
    expect(template.updated).toBe(LATER_TRACE);
    expect(template.created).toEqual(TRACE);
  });

  it("refuse un ajustement sur une version périmée", () => {
    expect(() => stored().adjust(CONTENT, 0, LATER_TRACE)).toThrow(
      ResupplyTemplateChangedMeanwhileError,
    );
  });

  it("refuse un ajustement invalide sans rien changer", () => {
    const template = stored();
    expect(() => template.adjust({ ...CONTENT, lines: [] }, 1, LATER_TRACE)).toThrow(
      EmptyResupplyTemplateError,
    );
    expect(template.content.name).toBe("Base matin");
    expect(template.updated).toEqual(TRACE);
  });

  it("s'archive une fois, puis ne s'ajuste ni ne s'archive plus", () => {
    const template = stored();
    template.archive(LATER_TRACE);
    expect(template.archived).toBe(LATER_TRACE);
    expect(() => template.archive(LATER_TRACE)).toThrow(ResupplyTemplateArchivedError);
    expect(() => template.adjust(CONTENT, 1, LATER_TRACE)).toThrow(ResupplyTemplateArchivedError);
  });

  it("s'applique tant qu'il est actif, plus une fois archivé", () => {
    const template = stored();
    expect(() => template.assertApplicable()).not.toThrow();
    template.archive(LATER_TRACE);
    expect(() => template.assertApplicable()).toThrow(ResupplyTemplateArchivedError);
  });

  it("ne se rejoue que pour le point qui l'a créé", () => {
    expect(() => stored().assertReplayableFor("site_1")).not.toThrow();
    expect(() => stored().assertReplayableFor("site_2")).toThrow(ResupplyTemplateKeyTakenError);
  });
});

describe("une ligne de modèle face au catalogue", () => {
  const LINE = { sku: "CRO", quantity: 4, saleUnit: "piece" as const };
  const ARTICLE = {
    sku: "CRO",
    name: "Croissant",
    categoryId: "fam",
    categoryName: "Viennoiseries",
    family: { id: "fam", name: "Viennoiseries", position: 0 },
    saleUnit: "piece" as const,
  };

  it("s'applique quand l'article est publié dans la même unité", () => {
    expect(templateLineIssueOf(LINE, ARTICLE)).toBeNull();
  });

  it("est retirée quand l'article a quitté le catalogue", () => {
    expect(templateLineIssueOf(LINE, undefined)).toBe("withdrawn");
  });

  it("a changé d'unité quand l'article se vend désormais au poids", () => {
    expect(templateLineIssueOf(LINE, { ...ARTICLE, saleUnit: "weight" })).toBe("sale_unit_changed");
  });
});

describe("la règle des lignes partagée avec le brouillon du fournil", () => {
  it("garde au brouillon ses propres refus", () => {
    const line = { sku: "CRO", quantity: 1, saleUnit: "piece" as const };
    expect(() =>
      draftContentOf({ siteId: "s", target: "asap", name: null, lines: [line, line] }),
    ).toThrow(DuplicateBakehouseResupplyDraftLineError);
  });
});

describe("un modèle de réassort — son heure d'arrivée (H1)", () => {
  const base = {
    name: "Base matin",
    target: "tomorrow" as const,
    lines: [{ sku: "CRO", quantity: 4, saleUnit: "piece" as const }],
  };
  const make = (content: typeof base & { readonly arrivalBy?: string | null }) =>
    ResupplyTemplate.create({ id: "t9", siteId: "site_1", content, trace: TRACE });

  it("est facultative, et se garde telle qu'écrite", () => {
    expect(make(base).content.arrivalBy).toBeNull();
    expect(make({ ...base, arrivalBy: "06:30" }).content.arrivalBy).toBe("06:30");
  });

  it("refuse une heure mal formée et une heure sur « au plus tôt »", () => {
    expect(() => make({ ...base, arrivalBy: "6h30" })).toThrow(InvalidResupplyArrivalTimeError);
    expect(() =>
      ResupplyTemplate.create({
        id: "t9",
        siteId: "site_1",
        content: { ...base, target: "asap", arrivalBy: "06:30" },
        trace: TRACE,
      }),
    ).toThrow(ResupplyArrivalOnAsapError);
  });
});
