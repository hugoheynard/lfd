import { CommandBus } from "@nestjs/cqrs";

import { Clock } from "../../../../../platform/time/clock.js";
import {
  CatalogRevisionRepository,
  type RevisionPublication,
} from "../../../../catalogue/revision/domain/ports/catalog-revision.repository.js";
import { Test } from "@nestjs/testing";
import { CATALOG_SNAPSHOT_VERSION, type CatalogSnapshot } from "@lfd/catalog-sync";

import type { ProductRecord } from "../../../../catalogue/product/domain/ports/product.repository.js";
import { PimPrismaService } from "../../../../infra/database/pim-prisma.service.js";
import { B2bCatalogDriver, DryRunB2bCatalogDriver } from "../driver.js";
import { B2bCatalogFeedPreview } from "../feed-preview.js";
import { IncoProjector } from "../../../../allergens/domain/services/inco-projector.js";
import { projectCatalog } from "../projection.js";
import { B2bCatalogPushService } from "../push.service.js";
import { projectionFingerprint } from "../../../shared/domain/canonical-projection.js";
import { ProjectionDriftError } from "../../../shared/domain/errors/projection-errors.js";

/** Un snapshot vide mais valide — ce que le port rend quand rien n'est publié. */
function emptySnapshot(generatedAt: string): CatalogSnapshot {
  return {
    version: CATALOG_SNAPSHOT_VERSION,
    generatedAt,
    categories: [],
    products: [],
  };
}

/**
 * Ce que ces tests éprouvent : ce que le push **estampille**, et quand. C'est là
 * que se joue l'honnêteté de l'écran — un `lastPushedAt` posé trop tôt fait
 * passer un échec pour un catalogue en ligne.
 */

function product(over: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: "prd_1",
    sku: "VIE-001",
    name: { fr: "Croissant" },
    slug: { fr: "croissant" },
    kind: "daily",
    categoryId: "cat_vien",
    status: "published",
    vatByContext: {},
    channelOverride: null,
    variants: [
      {
        id: "var_1",
        sku: "VIE-001-1",
        name: { fr: "Croissant" },
        options: {},
        isDefault: true,
        isDiscontinued: false,
        position: 0,
        priceCents: 200,
        weightGrams: null,
        regulatoryFollowsDefault: false,
        pricingFollowsDefault: false,
        allergens: null,
        nutrition: null,
      },
    ],
    ...over,
  };
}

const category = {
  id: "cat_vien",
  name: { fr: "Viennoiseries" },
  slug: { fr: "viennoiseries" },
  parentId: null,
  position: 0,
  vatByContext: { takeaway: 5.5, b2b: 5.5 },
};

/** Enregistre les `updateMany` pour dire QUI a été estampillé. */
class SpyBindings {
  readonly stamped: string[][] = [];

  updateMany(args: { where: { productId: { in: string[] } } }): Promise<{ count: number }> {
    this.stamped.push(args.where.productId.in);
    return Promise.resolve({ count: args.where.productId.in.length });
  }
}

/**
 * Ajoute au double l'empreinte que le VRAI port calcule — même fonction, même
 * entrée. C'est la seule façon que la garde de dérive soit éprouvée contre le
 * mécanisme réel plutôt que contre une chaîne choisie par le test.
 */
function withFingerprint<T extends { snapshot: CatalogSnapshot }>(
  preview: T,
): T & { fingerprint: string } {
  return { ...preview, fingerprint: projectionFingerprint(preview.snapshot) };
}

interface Harness {
  readonly service: B2bCatalogPushService;
  readonly bindings: SpyBindings;
  readonly sent: CatalogSnapshot[];
  readonly publications: RevisionPublication[];
  /** Les ancres prises pendant le passage — une simulation ne doit en prendre aucune. */
  readonly revisions: unknown[];
}

async function build(
  publishedIds: readonly string[],
  products: readonly ProductRecord[],
  options: { readonly sendFails?: boolean } = {},
): Promise<Harness> {
  const bindings = new SpyBindings();
  const sent: CatalogSnapshot[] = [];
  const publications: RevisionPublication[] = [];
  const revisions: unknown[] = [];

  const live = {
    mode: "live" as const,
    send: (snapshot: CatalogSnapshot) => {
      if (options.sendFails === true) {
        return Promise.reject(new Error("la plateforme n'a pas répondu"));
      }
      sent.push(snapshot);
      return Promise.resolve({
        acceptedProducts: snapshot.products.length,
        acceptedVariants: 1,
        acceptedCategories: snapshot.categories.length,
        removedSkus: [],
        appliedAt: snapshot.generatedAt,
      });
    },
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      B2bCatalogPushService,
      DryRunB2bCatalogDriver,
      { provide: B2bCatalogDriver, useValue: live },
      // Le service ne projette plus lui-même : il consomme le port de lecture.
      // Le double est d'autant plus court — c'était le but de l'extraction.
      // Le push FIGE une révision avant d'envoyer, puis y inscrit sa
      // destination : ces trois doublures sont le prix de ce couplage, et il est
      // voulu — une publication qui ne laisse pas d'ancre ne dit pas ce qui est
      // parti.
      {
        provide: CommandBus,
        useValue: {
          execute: (command: unknown) => {
            revisions.push(command);
            return Promise.resolve({ id: "rev_1", version: 1, hash: "h", created: true });
          },
        },
      },
      {
        provide: CatalogRevisionRepository,
        useValue: {
          recordPublication: (publication: RevisionPublication) => {
            publications.push(publication);
            return Promise.resolve();
          },
        },
      },
      { provide: Clock, useValue: { now: () => new Date("2026-08-31T10:00:00.000Z") } },
      {
        provide: B2bCatalogFeedPreview,
        useValue: {
          // ⚠️ Le double calcule l'empreinte **pour de vrai**. Un port doublé qui
          // rendrait une empreinte inventée ferait passer la garde de dérive
          // sans rien prouver — le test dirait vert sur une fiction.
          preview: (generatedAt: string) =>
            Promise.resolve(
              publishedIds.length === 0
                ? withFingerprint({
                    snapshot: emptySnapshot(generatedAt),
                    candidates: 0,
                    excluded: [],
                  })
                : withFingerprint({
                    ...projectCatalog(
                      [...products],
                      [category],
                      // Le taux effectif, résolu en amont — ici celui de la
                      // famille, puisque aucune fiche ne déroge.
                      new Map(products.map((p) => [p.id, category.vatByContext])),
                      // Et les canaux : ces fiches se vendent aux professionnels,
                      // sinon ce canal les écarterait.
                      new Map(
                        products.map((p) => [p.id, [{ pointOfSaleId: "pos_b2b", context: "b2b" }]]),
                      ),
                      // Rapport neutre : ce test parle de PUSH, pas de tarif.
                      10_000,
                      // Référentiel vide : aucune fiche n'est déclarée ici, donc
                      // rien à projeter — ce test parle d'estampille.
                      IncoProjector.from([], "fr"),
                      generatedAt,
                    ),
                    candidates: publishedIds.length,
                  }),
            ),
        },
      },
      {
        provide: PimPrismaService,
        useValue: { b2bChannelBinding: bindings },
      },
    ],
  }).compile();

  return { service: moduleRef.get(B2bCatalogPushService), bindings, sent, publications, revisions };
}

describe("l’empreinte relie la relecture à l’envoi", () => {
  /**
   * 🔴 Le trou que ce chantier ferme : la simulation qu'on regarde et le push
   * qui suit étaient deux appels séparés que rien ne rattachait. On relisait un
   * catalogue, on en envoyait un autre, et personne ne le savait.
   */
  it("laisse partir un push dont l’empreinte correspond encore", async () => {
    const { service, sent } = await build(["prd_1"], [product()]);

    const relu = await service.push(true);
    const parti = await service.push(false, relu.fingerprint);

    expect(parti.mode).toBe("live");
    expect(sent).toHaveLength(1);
  });

  it("REFUSE un push dont l’empreinte a bougé, et n’envoie rien", async () => {
    const { service, sent, bindings } = await build(["prd_1"], [product()]);

    await expect(service.push(false, "une-empreinte-d-avant")).rejects.toBeInstanceOf(
      ProjectionDriftError,
    );
    expect(sent).toEqual([]);
    expect(bindings.stamped).toEqual([]);
  });

  /**
   * L'empreinte ne porte pas `generatedAt`. Sans ce cas, la garde serait juste
   * en apparence et refuserait **toujours** : deux projections séparées d'une
   * milliseconde suffiraient à la faire échouer.
   */
  it("ne bouge pas entre deux relectures d’un catalogue inchangé", async () => {
    const { service } = await build(["prd_1"], [product()]);

    const premier = await service.push(true);
    const second = await service.push(true);

    expect(premier.fingerprint).toBe(second.fingerprint);
  });

  /**
   * 🔴 Le cas qui justifie de vérifier AVANT le court-circuit `candidates === 0`.
   * Relire quatre-vingt-quinze articles puis pousser un catalogue devenu vide
   * est la dérive la plus coûteuse qui soit — et c'est exactement celle qui
   * serait sortie en « rien à faire », donc en succès.
   */
  it("refuse un catalogue devenu VIDE depuis la relecture", async () => {
    const plein = await build(["prd_1"], [product()]);
    const relu = await plein.service.push(true);

    const vidé = await build([], []);

    await expect(vidé.service.push(false, relu.fingerprint)).rejects.toBeInstanceOf(
      ProjectionDriftError,
    );
    expect(vidé.sent).toEqual([]);
  });

  /**
   * 🔴 **La dérive que l'aperçu ne montre pas** — et la raison pour laquelle le
   * refus a cessé de promettre un diagnostic.
   *
   * L'empreinte couvre TOUTE la projection ; l'écran n'affiche que le nombre de
   * candidats, les compteurs du rapport et les SKU écartés. Un `weightGrams`
   * corrigé par un collègue pendant qu'on pousse fait donc basculer le haché
   * sans changer une seule ligne de ce que l'opérateur voit.
   *
   * Le message disait « rechargez l'aperçu pour voir ce qui a bougé ». Ce cas
   * est la preuve qu'il envoyait chercher l'introuvable — et que le réflexe
   * enseigné, « re-simuler puis renvoyer », vide la garde de son sens.
   */
  it("refuse une dérive que l’aperçu ne peut PAS montrer", async () => {
    const avant = await build(["prd_1"], [product()]);
    const relu = await avant.service.push(true);

    const lourd = product({
      variants: [
        {
          id: "var_1",
          sku: "VIE-001-1",
          name: { fr: "Croissant" },
          options: {},
          isDefault: true,
          isDiscontinued: false,
          position: 0,
          priceCents: 200,
          // Le SEUL champ qui bouge, et il n'apparaît nulle part à l'écran.
          weightGrams: 65,
          regulatoryFollowsDefault: false,
          pricingFollowsDefault: false,
          allergens: null,
          nutrition: null,
        },
      ],
    });
    const apres = await build(["prd_1"], [lourd]);

    // Le push est bien refusé : la garde fait son travail.
    await expect(apres.service.push(false, relu.fingerprint)).rejects.toBeInstanceOf(
      ProjectionDriftError,
    );

    // Et pourtant, tout ce que l'écran sait afficher est IDENTIQUE.
    const resimule = await apres.service.push(true);
    expect(resimule.candidates).toBe(relu.candidates);
    expect(resimule.excluded).toEqual(relu.excluded);
  });

  /**
   * Le refus nomme le geste que le front impose déjà — re-simuler —, et ne
   * prétend plus dire ce qui a bougé. Un message est lu par du personnel qui
   * n'a pas le code sous les yeux : ce qu'il promet doit être atteignable.
   */
  it("dit de re-simuler, sans promettre de diagnostic", async () => {
    const { service } = await build(["prd_1"], [product()]);

    // Rattrapé par son TYPE plutôt que casté : une assertion de type rendrait le
    // cas vert le jour où le refus change de nature.
    const refus = await service
      .push(false, "une-empreinte-d-avant")
      .then(() => null)
      .catch((error: unknown) => (error instanceof ProjectionDriftError ? error : null));

    expect(refus).not.toBeNull();
    expect(refus?.message).toContain("Simulez à nouveau");
    expect(refus?.message).not.toContain("ce qui a bougé");
  });

  /**
   * Une simulation ne consomme pas l'empreinte : c'est ELLE qui la produit.
   * Refuser un dry-run parce que l'état a changé reviendrait à refuser de
   * montrer l'état actuel — précisément ce qu'on vient chercher.
   */
  it("ne refuse jamais une simulation, même sur une empreinte périmée", async () => {
    const { service } = await build(["prd_1"], [product()]);

    const summary = await service.push(true, "une-empreinte-d-avant");

    expect(summary.mode).toBe("dry-run");
    expect(summary.fingerprint).not.toBe("une-empreinte-d-avant");
  });

  /** Sans empreinte, le push passe : le contrat servi n'est pas cassé (étape 1/3). */
  it("laisse passer un push sans empreinte — le temps que le front l’envoie", async () => {
    const { service, sent } = await build(["prd_1"], [product()]);

    await service.push(false);

    expect(sent).toHaveLength(1);
  });
});

describe("B2bCatalogPushService", () => {
  it("ne contacte personne quand aucun produit n’est publié", async () => {
    const { service, sent, bindings } = await build([], []);

    const summary = await service.push(false);

    expect(summary.candidates).toBe(0);
    expect(summary.report).toBeNull();
    expect(sent).toEqual([]);
    expect(bindings.stamped).toEqual([]);
  });

  it("envoie le snapshot et estampille en mode réel", async () => {
    const { service, sent, bindings } = await build(["prd_1"], [product()]);

    const summary = await service.push(false);

    expect(summary.mode).toBe("live");
    expect(sent[0]?.products).toHaveLength(1);
    expect(bindings.stamped).toEqual([["prd_1"]]);
  });

  it("une simulation n’estampille RIEN — sinon l’aperçu mentirait sur l’état", async () => {
    const { service, bindings } = await build(["prd_1"], [product()]);

    const summary = await service.push(true);

    expect(summary.mode).toBe("dry-run");
    expect(summary.report?.acceptedProducts).toBe(1);
    expect(bindings.stamped).toEqual([]);
  });

  /**
   * Le cas qui compte pour l'écran : un produit publié mais écarté par la
   * projection ne doit pas repartir « à jour », sinon rien ne signale qu'il n'est
   * pas en vente.
   */
  it("n’estampille que ce qui est réellement parti, pas les candidats", async () => {
    const priceless = product({
      id: "prd_2",
      sku: "VIE-002",
      variants: [
        {
          id: "var_2",
          sku: "VIE-002-1",
          name: { fr: "Sans prix" },
          options: {},
          isDefault: true,
          isDiscontinued: false,
          position: 0,
          priceCents: null,
          weightGrams: null,
          regulatoryFollowsDefault: false,
          pricingFollowsDefault: false,
          allergens: null,
          nutrition: null,
        },
      ],
    });
    const { service, bindings } = await build(["prd_1", "prd_2"], [product(), priceless]);

    const summary = await service.push(false);

    expect(summary.candidates).toBe(2);
    expect(bindings.stamped).toEqual([["prd_1"]]);
    expect(summary.excluded).toContainEqual({
      sku: "VIE-002-1",
      reason: "variant_sans_prix",
    });
  });
});

/**
 * **Ce que le canal a reçu s'inscrit sur la publication**, et nulle part
 * ailleurs.
 *
 * C'est la seule valeur qui permette un jour de répondre à « le canal a-t-il ce
 * que le référentiel produirait aujourd'hui ? ». L'empreinte de l'ancre ne le
 * peut pas : elle décrit le catalogue, pas ce qu'un canal en tire.
 */
describe("l’empreinte de projection s’inscrit sur la publication", () => {
  it("inscrit exactement celle que le push vient de rendre", async () => {
    const { service, publications } = await build(["prd_1"], [product()]);

    const summary = await service.push(false);

    expect(publications).toHaveLength(1);
    expect(publications[0]).toMatchObject({
      channel: "b2b",
      mode: "live",
      outcome: "sent",
      projectionFingerprint: summary.fingerprint,
    });
  });

  /**
   * 🔴 L'échec l'inscrit AUSSI, et c'est le cas qui compte le plus : le jour où
   * l'envoi n'a pas abouti est le seul où l'on vient demander ce qu'on avait
   * tenté d'envoyer. Ne poser l'empreinte qu'au succès rendrait la trace muette
   * exactement quand on la lit.
   */
  it("inscrit ce qu’on avait tenté d’envoyer, même quand l’envoi échoue", async () => {
    const { service, publications } = await build(["prd_1"], [product()], { sendFails: true });

    await expect(service.push(false)).rejects.toThrow(/pas répondu/);

    expect(publications).toHaveLength(1);
    expect(publications[0]?.outcome).toBe("failed");
    expect(typeof publications[0]?.projectionFingerprint).toBe("string");
  });

  /**
   * 🔴 **Une simulation n'écrit plus rien** — ni ancre, ni ligne de publication.
   *
   * Ce cas affirmait le contraire, et sa raison était réelle : distinguer
   * « jamais tenté » de « tenté à blanc ». Elle a cessé de l'être le jour où
   * regarder a eu sa propre route en lecture (`GET admin/catalog/push-preview`,
   * qui confronte en plus la projection au miroir). Une simulation n'est alors
   * plus une tentative dont on garderait trace : c'est un coup d'œil.
   *
   * Ce qu'elle coûtait, elle : la ligne de publication pend à une ancre, donc
   * chaque simulation en posait une. Une ancre est censée dire ce qu'on
   * s'apprête à publier — cent ancres pour zéro publication ne disent plus rien,
   * et le compte se lit sur l'écran d'ensemble comme sur celui des révisions.
   */
  it("n’inscrit RIEN pour une simulation — ni publication, ni ancre", async () => {
    const { service, publications, revisions } = await build(["prd_1"], [product()]);

    const summary = await service.push(true);

    expect(publications).toHaveLength(0);
    expect(revisions).toHaveLength(0);
    // Le rapport reste cohérent avec ce qui partirait : un aperçu qui annonce
    // zéro n'apprend rien à qui s'apprête à pousser.
    expect(summary.report?.acceptedProducts).toBe(1);
    expect(summary.revisionId).toBeNull();
  });

  /**
   * Deux envois d'un catalogue inchangé portent la MÊME empreinte : c'est ce qui
   * rend la lecture « le canal est-il à jour ? » possible sans comparer des
   * payloads. Si elle bougeait d'un envoi à l'autre, le canal se dirait en écart
   * de lui-même.
   */
  it("rend la même empreinte à deux envois d’un catalogue inchangé", async () => {
    const { service, publications } = await build(["prd_1"], [product()]);

    await service.push(false);
    await service.push(false);

    expect(publications[0]?.projectionFingerprint).toBe(publications[1]?.projectionFingerprint);
  });
});
