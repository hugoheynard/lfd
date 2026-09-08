import { CompanyMercuriale, type CompanyMercurialeDraft } from "../company-mercuriale.js";
import type { PricingContext } from "../../price-rule.js";
import {
  ArchivedMercurialeIsSealedError,
  DuplicateMercurialeSkuError,
  EmptyMercurialeError,
  NonDecreasingMercurialeTiersError,
  ReversedValidityWindowError,
} from "../../pricing-errors.js";

/**
 * **La mercuriale d'un client, en tant qu'agrégat.**
 *
 * Ce qu'on éprouve ici est exactement ce que N règles indépendantes ne pouvaient
 * pas voir : une grille n'est cohérente qu'une fois réunie. Chaque palier pris
 * seul est valide.
 */

const FROM = new Date("2026-01-01T00:00:00.000Z");
const TO = new Date("2026-12-31T00:00:00.000Z");

function draft(overrides: Partial<CompanyMercurialeDraft> = {}): CompanyMercurialeDraft {
  return {
    companyId: "co_folie",
    label: "Mercuriale 2026",
    lines: [{ sku: "VIE-012", tiers: [{ minQuantity: 1, unitPriceMillicents: 173_270 }] }],
    validFrom: FROM,
    validTo: TO,
    ...overrides,
  };
}

const pose = (overrides: Partial<CompanyMercurialeDraft> = {}): CompanyMercuriale =>
  CompanyMercuriale.pose("merc_1", draft(overrides), "staff|marie");

describe("poser", () => {
  it("retient qui l'a posée, et pour qui", () => {
    const posed = pose().toPersistence();

    expect(posed).toMatchObject({ id: "merc_1", companyId: "co_folie", createdBy: "staff|marie" });
  });

  it("accepte un prix fixe — c'est la grille à un seul palier", () => {
    // Le « prix fixe » n'est PAS un cas particulier du modèle : deux chemins de
    // saisie, une seule chose stockée.
    expect(pose().lines[0]?.tiers).toEqual([{ minQuantity: 1, unitPriceMillicents: 173_270 }]);
  });

  it("accepte une fenêtre sans terme", () => {
    expect(() => pose({ validTo: null })).not.toThrow();
  });

  it("refuse une fenêtre qui se ferme avant de s'ouvrir", () => {
    expect(() => pose({ validFrom: TO, validTo: FROM })).toThrow(ReversedValidityWindowError);
  });

  it("refuse une fenêtre qui se ferme à l'instant où elle s'ouvre", () => {
    // Borne haute EXCLUE : une fenêtre de durée nulle n'agit jamais.
    expect(() => pose({ validTo: FROM })).toThrow(ReversedValidityWindowError);
  });
});

describe("la grille, réunie en une décision", () => {
  it("🔴 refuse une grille où commander PLUS coûte plus cher", () => {
    // Le refus qui justifie l'agrégat. Pris isolément, « 0,85 € à partir de
    // 5 000 » est un palier parfaitement valide.
    expect(() =>
      pose({
        lines: [
          {
            sku: "VIE-012",
            tiers: [
              { minQuantity: 1, unitPriceMillicents: 80_000 },
              { minQuantity: 5_000, unitPriceMillicents: 85_000 },
            ],
          },
        ],
      }),
    ).toThrow(NonDecreasingMercurialeTiersError);
  });

  it("refuse deux paliers au même seuil : rien ne les départage", () => {
    expect(() =>
      pose({
        lines: [
          {
            sku: "VIE-012",
            tiers: [
              { minQuantity: 50, unitPriceMillicents: 80_000 },
              { minQuantity: 50, unitPriceMillicents: 70_000 },
            ],
          },
        ],
      }),
    ).toThrow(NonDecreasingMercurialeTiersError);
  });

  it("TRIE les paliers saisis dans le désordre au lieu de les refuser", () => {
    // L'ordre de saisie n'est pas une décision : refuser ferait perdre une
    // grille entière pour une question de présentation.
    const posed = pose({
      lines: [
        {
          sku: "VIE-012",
          tiers: [
            { minQuantity: 100, unitPriceMillicents: 70_000 },
            { minQuantity: 1, unitPriceMillicents: 80_000 },
          ],
        },
      ],
    });

    expect(posed.lines[0]?.tiers.map((tier) => tier.minQuantity)).toEqual([1, 100]);
  });

  it("refuse deux lignes sur le même article", () => {
    expect(() =>
      pose({
        lines: [
          { sku: "VIE-012", tiers: [{ minQuantity: 1, unitPriceMillicents: 80_000 }] },
          { sku: "VIE-012", tiers: [{ minQuantity: 1, unitPriceMillicents: 70_000 }] },
        ],
      }),
    ).toThrow(DuplicateMercurialeSkuError);
  });

  it("refuse une grille vide", () => {
    expect(() => pose({ lines: [] })).toThrow(EmptyMercurialeError);
  });

  it("refuse une ligne sans aucun palier", () => {
    // Un article cité sans prix : la mercuriale prétendrait le viser sans rien
    // lui accorder.
    expect(() => pose({ lines: [{ sku: "VIE-012", tiers: [] }] })).toThrow(EmptyMercurialeError);
  });

  it("accepte un article offert : zéro est un prix", () => {
    expect(() =>
      pose({ lines: [{ sku: "VIE-012", tiers: [{ minQuantity: 1, unitPriceMillicents: 0 }] }] }),
    ).not.toThrow();
  });
});

/**
 * **La conversion en règle** — ce que la résolution voit d'une mercuriale.
 *
 * Ce qui est éprouvé ici est exactement ce qui a tué la v2 du plan : la règle
 * dépend d'une MESURE, donc elle ne peut pas être dérivée au chargement.
 */
describe("vue comme une règle", () => {
  const CONTEXT: PricingContext = {
    at: new Date("2026-06-01T00:00:00.000Z"),
    quantity: 1,
    cumulativeQuantity: null,
    variantSku: "VIE-012",
    productSku: "VIE-012",
    categoryId: "viennoiserie",
    companyId: "co_folie",
    segmentId: null,
  };

  const ladder = (): CompanyMercuriale =>
    pose({
      lines: [
        {
          sku: "VIE-012",
          tiers: [
            { minQuantity: 1, unitPriceMillicents: 173_270 },
            { minQuantity: 500, unitPriceMillicents: 160_000 },
          ],
        },
      ],
    });

  it("pose un PRIX, jamais un pourcentage", () => {
    // Le piège central du modèle : une mercuriale en pourcentage suivrait les
    // hausses du tarif de liste.
    expect(pose().asRuleFor(CONTEXT)).toMatchObject({
      nature: "replace",
      amountMillicents: 173_270,
      stage: "mercuriale",
    });
  });

  it("vise l'article nommément et la société nommément", () => {
    expect(pose().asRuleFor(CONTEXT)).toMatchObject({
      scope: { type: "product", id: "VIE-012" },
      audience: { type: "company", id: "co_folie" },
    });
  });

  it("est transparente sur un article qu'elle ne porte pas", () => {
    // Le silence d'une mercuriale est une information : l'article retombe sur
    // le tarif catalogue et SUIT ses évolutions.
    expect(pose().asRuleFor({ ...CONTEXT, productSku: "VIE-999" })).toBeNull();
  });

  it("🔴 rend AU PLUS UNE règle, même sur une grille à plusieurs paliers", () => {
    // Deux règles de même identifiant à un étage rendaient la résolution
    // ambiguë — 400 sur une commande de 20, déjà payé à l'étage volume. Le
    // palier est donc choisi ici, pas laissé à la résolution.
    const rule = ladder().asRuleFor({ ...CONTEXT, quantity: 800 });

    expect(rule?.minQuantity).toBe(500);
    expect(rule?.amountMillicents).toBe(160_000);
  });

  it("prend le PLUS HAUT palier atteint", () => {
    expect(ladder().asRuleFor({ ...CONTEXT, quantity: 499 })?.amountMillicents).toBe(173_270);
    expect(ladder().asRuleFor({ ...CONTEXT, quantity: 500 })?.amountMillicents).toBe(160_000);
  });

  it("🔴 mesure le CUMUL quand il existe, pas la commande", () => {
    // Un client sous engagement obtient le palier qu'il a négocié dès sa
    // PREMIÈRE commande — c'est tout l'objet de l'engagement.
    const rule = ladder().asRuleFor({ ...CONTEXT, quantity: 10, cumulativeQuantity: 800 });

    expect(rule?.amountMillicents).toBe(160_000);
  });

  it("est transparente sous le premier palier", () => {
    const haut = pose({
      lines: [{ sku: "VIE-012", tiers: [{ minQuantity: 500, unitPriceMillicents: 160_000 }] }],
    });

    expect(haut.asRuleFor(CONTEXT)).toBeNull();
  });

  it("ne se déclare jamais cumulable par-dessus une mercuriale", () => {
    // C'est elle qui scelle : le drapeau ne désignerait rien.
    expect(pose().asRuleFor(CONTEXT)?.stacksOverMercuriale).toBe(false);
  });

  it("porte l'instant où elle a cessé d'agir", () => {
    // La résolution ne distingue pas une pause d'une clôture : les deux disent
    // « n'agit plus ».
    const closed = pose().close("staff|marie", new Date("2026-03-01T00:00:00.000Z"), null);

    expect(closed.asRuleFor(CONTEXT)?.suspendedFrom).toEqual(new Date("2026-03-01T00:00:00.000Z"));
  });
});

describe("renommer", () => {
  it("change le libellé sans toucher aux prix", () => {
    const renamed = pose().rename("Mercuriale Club Med");

    expect(renamed.label).toBe("Mercuriale Club Med");
    expect(renamed.lines).toEqual(pose().lines);
  });

  it("rend une NOUVELLE instance : l'appelant tient l'avant et l'après", () => {
    // Ce dont le journal a besoin pour dire ce qui a changé.
    const before = pose();
    const after = before.rename("Autre nom");

    expect(before.label).toBe("Mercuriale 2026");
    expect(after).not.toBe(before);
  });

  it("🔴 refuse de renommer une mercuriale close", () => {
    // Une décision terminée garde la phrase qu'elle portait : la relire six
    // mois plus tard doit rendre ce qui a été écrit, pas ce qu'on préférerait.
    const closed = pose().close("staff|marie", TO, "Renégociée");

    expect(() => closed.rename("Trop tard")).toThrow(ArchivedMercurialeIsSealedError);
  });
});

describe("clore", () => {
  it("passe l'état à `archived` et retient qui, quand, pourquoi", () => {
    const closed = pose().close("staff|marie", TO, "Renégociée");

    expect(closed.status).toBe("archived");
    expect(closed.toPersistence().lifecycle).toMatchObject({
      archivedBy: "staff|marie",
      archiveReason: "Renégociée",
    });
  });

  it("accepte un motif absent", () => {
    expect(() => pose().close("staff|marie", TO, null)).not.toThrow();
  });

  it("fait cesser d'agir à l'instant de la clôture", () => {
    // C'est ce que la résolution lit : elle ne distingue pas une pause d'une
    // clôture, les deux disent « n'agit plus ».
    expect(pose().close("staff|marie", TO, null).suspendedFrom).toEqual(TO);
  });

  it("refuse de clore deux fois", () => {
    // Deux personnes peuvent avoir le même écran ouvert : celle qui arrive
    // seconde mérite de savoir que son geste n'a rien fait.
    const closed = pose().close("staff|marie", TO, null);

    expect(() => closed.close("staff|paul", TO, null)).toThrow(ArchivedMercurialeIsSealedError);
  });
});
