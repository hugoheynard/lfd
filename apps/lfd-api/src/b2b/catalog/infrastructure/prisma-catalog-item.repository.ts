import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { allergenLabelsOf } from "./allergen-labels.js";
import { publicByContextOf } from "./public-by-context.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CatalogItem, type CatalogItemState } from "../domain/entities/catalog-item.js";
import { CatalogItemRepository } from "../domain/ports/catalog-item.repository.js";
import { STILL_SOLD } from "./sellable-filter.js";
import { lastRecordedPrices, priceTraceRows } from "./catalog-price-trace.js";
import { pimFactsColumns } from "./catalog-item-columns.js";
import { catalogAudienceOf } from "../domain/served-to.js";
import { DECISION_COLUMNS } from "./catalog-decision-columns.js";

/** La ligne telle que Prisma la rend, décision jointe. Aucun type `Prisma.*` exporté. */
interface ItemRow {
  readonly sku: string;
  readonly productId: string;
  readonly productSku: string;
  readonly name: string;
  readonly kind: string;
  readonly categoryId: string;
  readonly priceMillicents: number;
  readonly weightGrams: number | null;
  readonly isDefault: boolean;
  readonly position: number;
  readonly vatRatePercent: { toNumber(): number } | null;
  readonly publicTtcCents: number | null;
  readonly publicByContext: unknown;
  readonly allergens: unknown;
  readonly allergenLabels: unknown;
  readonly note: string | null;
  readonly imageUrl: string | null;
  readonly thumbnailUrl: string | null;
  readonly thumbnailAlt: string | null;
  readonly thumbnailWidth: number | null;
  readonly thumbnailHeight: number | null;
  readonly imageAlt: string | null;
  readonly imageWidth: number | null;
  readonly imageHeight: number | null;
  readonly imageFocalX: number | null;
  readonly imageFocalY: number | null;
  readonly thumbnailFocalX: number | null;
  readonly thumbnailFocalY: number | null;
  readonly orderLimitDaysBefore: number | null;
  readonly orderLimitTime: string | null;
  readonly orderLimitGraceMinutes: number | null;
  readonly operationOnly: boolean;
  readonly requiresCold: boolean;
  readonly receivedAt: Date;
  readonly withdrawnAt: Date | null;
  readonly audience: string | null;
  readonly publicReviewPending: boolean;
  readonly proReviewPending: boolean;
  readonly override: {
    readonly isHidden: boolean;
    readonly isHiddenPublic: boolean;
    readonly isFeatured: boolean;
    readonly decidedBy: string | null;
  } | null;
}

/**
 * Adaptateur d'écriture : il porte **les deux mappers** et rien d'autre.
 *
 * `toDomain` réhydrate l'agrégat ; `toPersistence()` (côté agrégat) rend l'état
 * à écrire. Aucune règle métier ici — pas même « ne pas recréer un article
 * existant » : c'est `refreshFromPim` qui la tient, dans le domaine.
 */
@Injectable()
export class PrismaCatalogItemRepository extends CatalogItemRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {
    super();
  }

  async load(sku: string): Promise<CatalogItem | null> {
    const row = await this.prisma.catalogItem.findUnique({
      where: { sku, ...STILL_SOLD },
      include: { override: { select: DECISION_COLUMNS } },
    });
    return row === null ? null : toDomain(row);
  }

  async loadAll(): Promise<CatalogItem[]> {
    const rows = await this.prisma.catalogItem.findMany({
      where: { ...STILL_SOLD },
      include: { override: { select: DECISION_COLUMNS } },
    });
    return rows.map(toDomain);
  }

  /**
   * Les articles d'un produit — **retirés compris**, et c'est la seconde
   * échappatoire au filtre du retrait.
   *
   * Elle est nommée et non tacite : recevoir une photo n'est pas revenir au
   * catalogue. Un article retiré dont on corrige le visuel doit garder son
   * visuel à jour, sinon il reviendrait un jour en vente sous une photo
   * périmée et personne ne saurait d'où elle vient.
   *
   * ⚠️ Elle n'écrit rien : c'est l'appelant qui mute l'agrégat par
   * `showVisuals` et le repasse à `saveMany`.
   */
  async loadByProduct(productId: string): Promise<CatalogItem[]> {
    // withdrawn-filter: exempt — recevoir une photo n'est pas revenir au
    // catalogue : un retiré doit garder son visuel à jour, sinon il
    // reviendrait un jour en vente sous une photo périmée.
    const rows = await this.prisma.catalogItem.findMany({
      where: { productId },
      include: { override: { select: DECISION_COLUMNS } },
    });
    return rows.map(toDomain);
  }

  /**
   * La seule lecture qui voit les retirés — l'**échappatoire nommée** du filtre.
   *
   * Elle est exemptée dans `lint:withdrawn-filter`, qui la compte et l'affiche
   * plutôt que de l'ignorer : une exception qu'on lit à chaque exécution ne
   * dérive pas, une exception tacite si.
   */
  async loadAllIncludingWithdrawn(): Promise<CatalogItem[]> {
    // withdrawn-filter: exempt — l'ingestion doit reconnaître un SKU réintroduit
    // pour lui rendre sa décision commerciale.
    const rows = await this.prisma.catalogItem.findMany({
      include: { override: { select: DECISION_COLUMNS } },
    });
    return rows.map(toDomain);
  }

  /**
   * Écrit les agrégats **dans une transaction**.
   *
   * Un catalogue à moitié écrit vend des articles à des prix qui n'ont jamais
   * été décidés ensemble ; l'atomicité n'est pas un confort ici.
   */
  async saveMany(items: readonly CatalogItem[]): Promise<void> {
    if (items.length === 0) {
      return;
    }
    const states = items.map((item) => item.toPersistence());
    // Le prix déjà tracé, par SKU : c'est à lui qu'on compare pour
    // n'écrire une ligne d'historique que sur un vrai changement.
    const recorded = await lastRecordedPrices(
      this.prisma,
      states.map((state) => state.facts.sku),
    );
    const recordedAt = this.clock.now();

    await this.prisma.$transaction(async (tx) => {
      for (const state of states) {
        const facts = factsRow(state);
        await tx.catalogItem.upsert({
          where: { sku: state.facts.sku },
          create: { sku: state.facts.sku, ...facts },
          update: facts,
        });

        await writeDecision(tx, state);
      }

      // **La trace du tarif, dans la MÊME transaction que le prix.**
      //
      // Ici et non chez les appelants : un push du PIM et un geste du
      // back-office aboutissent tous deux à `saveMany`. Le récepteur des faits
      // du référentiel (lot 2a) est le SECOND écrivain de prix du miroir, et il
      // trace par la même règle (`priceTraceRows`) — c'est la condition pour
      // qu'un port d'écriture séparé n'écrive jamais un prix sans sa trace.
      //
      // Inchangé ⇒ aucune ligne, et « inchangé » porte sur le COUPLE prix +
      // taux : le jour de la bascule d'un taux légal, l'historique doit le dire.
      const changes = priceTraceRows(
        states.map((state) => ({
          sku: state.facts.sku,
          productSku: state.facts.productSku,
          pimPriceMillicents: state.facts.priceMillicents,
          vatRatePercent: state.facts.vatRatePercent,
        })),
        recorded,
        () => this.ids.next(),
        recordedAt,
      );
      if (changes.length > 0) {
        await tx.catalogPriceHistory.createMany({ data: changes });
      }
    });
  }
}

/**
 * Les trois colonnes de limite ↔ un objet, ou `null`.
 *
 * **Tout ou rien** : il suffit qu'une des trois manque pour qu'il n'y ait pas de
 * limite. Une limite sans heure ne se compare à rien, et reconstruire un objet
 * partiel donnerait au commerce une règle qu'il croirait pouvoir appliquer.
 * L'ingestion les écrit ensemble ; cette lecture-ci refuse de recoller ce qui
 * aurait été séparé à la main.
 */
function orderTimeLimitOf(row: ItemRow) {
  const { orderLimitDaysBefore, orderLimitTime, orderLimitGraceMinutes } = row;
  if (orderLimitDaysBefore === null || orderLimitTime === null || orderLimitGraceMinutes === null) {
    return null;
  }
  return {
    daysBefore: orderLimitDaysBefore,
    time: orderLimitTime,
    graceMinutes: orderLimitGraceMinutes,
  };
}

/**
 * Le packshot, ou `null`.
 *
 * L'URL commande : sans elle il n'y a rien à afficher, et les trois autres
 * colonnes ne décrivent alors plus rien. Les dimensions, elles, restent
 * légitimement nulles — « pas mesuré » est un état, pas un trou.
 */
function imageOf(row: ItemRow) {
  if (row.imageUrl === null) {
    return null;
  }
  return {
    url: row.imageUrl,
    alt: row.imageAlt ?? "",
    width: row.imageWidth,
    height: row.imageHeight,
    focal: focalOf(row.imageFocalX, row.imageFocalY),
  };
}

/**
 * La vignette de rayon, ou `null`. Même mécanique et même raison que le
 * packshot : l'URL commande.
 */
function thumbnailOf(row: ItemRow) {
  if (row.thumbnailUrl === null) {
    return null;
  }
  return {
    url: row.thumbnailUrl,
    alt: row.thumbnailAlt ?? "",
    width: row.thumbnailWidth,
    height: row.thumbnailHeight,
    focal: focalOf(row.thumbnailFocalX, row.thumbnailFocalY),
  };
}

/** Ligne ↔ agrégat. La décision absente devient « rien décidé », pas `undefined`. */
function toDomain(row: ItemRow): CatalogItem {
  return CatalogItem.reconstitute({
    facts: {
      sku: row.sku,
      productId: row.productId,
      productSku: row.productSku,
      name: row.name,
      kind: row.kind,
      categoryId: row.categoryId,
      priceMillicents: row.priceMillicents,
      weightGrams: row.weightGrams,
      isDefault: row.isDefault,
      position: row.position,
      // `Decimal` → `number` : le domaine ne connaît pas le type de l'ORM.
      vatRatePercent: row.vatRatePercent === null ? null : row.vatRatePercent.toNumber(),
      publicTtcCents: row.publicTtcCents,
      publicByContext: publicByContextOf(row.publicByContext),
      allergens: allergensOf(row.allergens),
      allergenLabels: allergenLabelsOf(row.allergenLabels),
      orderTimeLimit: orderTimeLimitOf(row),
      note: row.note,
      image: imageOf(row),
      thumbnail: thumbnailOf(row),
      operationOnly: row.operationOnly,
      requiresCold: row.requiresCold,
      receivedAt: row.receivedAt,
    },
    withdrawnAt: row.withdrawnAt,
    placement: {
      audience: catalogAudienceOf(row.audience),
      publicReviewPending: row.publicReviewPending,
      proReviewPending: row.proReviewPending,
    },
    decision:
      row.override === null
        ? null
        : {
            isHidden: row.override.isHidden,
            isHiddenPublic: row.override.isHiddenPublic,
            isFeatured: row.override.isFeatured,
            decidedBy: row.override.decidedBy,
          },
  });
}

/** Le client de transaction, tel que `saveMany` le reçoit — jamais exporté. */
type Tx = Parameters<Parameters<PrismaService["$transaction"]>[0]>[0];

/**
 * **La décision, écrite sans jamais supprimer de ligne** (lot D,
 * correction BLOQUANT de `vitruve`, 2026-10-15).
 *
 * Une ligne d'override porte peut-être un ancien prix décidé
 * (`price_millicents`, `decided_public_ttc_cents`) : plus lu, plus écrit, mais
 * conservé — rien ne se supprime en production sans ordre (CLAUDE.md §0).
 * Avant le lot D, une décision devenue neutre retirait la ligne ; tout geste
 * qui charge puis sauve l'agrégat (masquer, mettre en avant, valider une
 * arrivée) aurait alors effacé ces prix sans que personne l'ait demandé.
 *
 * - décision posée → `upsert` des seuls drapeaux ;
 * - plus rien de décidé → aucune ligne créée, et les drapeaux d'une ligne
 *   existante remis à `false` — seulement s'il y en avait un de levé, pour ne
 *   pas réécrire `decided_at` à chaque push.
 */
async function writeDecision(tx: Tx, state: CatalogItemState): Promise<void> {
  const sku = state.facts.sku;
  if (state.decision === null) {
    await tx.catalogItemOverride.updateMany({
      where: { sku, OR: [{ isHidden: true }, { isHiddenPublic: true }, { isFeatured: true }] },
      data: { isHidden: false, isHiddenPublic: false, isFeatured: false },
    });
    return;
  }
  // 🔴 **Cet objet est le seul endroit du dépôt où un champ oublié COMPILE et
  // perd une donnée en silence.** Les champs d'un `create`/`update` Prisma sont
  // tous optionnels : une décision absente d'ici n'est simplement jamais
  // écrite, et rien — ni `tsc`, ni ESLint, ni une porte — ne peut le dire.
  //
  // Il est donc l'agrégat ÉTALÉ : une décision ajoutée à `LocalDecision` part
  // automatiquement en base, et si elle n'a pas de colonne, Prisma refuse la
  // clé inconnue. ⚠️ Les deux colonnes de prix n'y figurent plus (lot D) : elles
  // ne sont donc jamais écrites, et gardent ce qu'elles portaient.
  const decision = { ...state.decision };
  await tx.catalogItemOverride.upsert({
    where: { sku },
    create: { sku, ...decision },
    update: decision,
  });
}

/** Les colonnes de faits, et le retrait — celles qu'un push remplace, et elles seules. */
function factsRow(state: CatalogItemState) {
  return {
    ...pimFactsColumns(state.facts),
    // 🔴 Écrit à CHAQUE upsert, et c'est ce qui remet en rayon un article qui
    // revient. Le miroir ne rend plus les retirés, donc un SKU réintroduit
    // repasse par `CatalogItem.receive`, dont le retrait est `null` : la colonne
    // est réécrite et l'article reparaît. L'omettre le laisserait invisible pour
    // toujours, pendant que le push l'annoncerait accepté.
    withdrawnAt: state.withdrawnAt,
    // L'attente de validation, écrite telle que l'agrégat la porte : le push
    // la relit et la rend inchangée (un article reçu par lui naît `false`),
    // la validation la lève. ⚠️ L'AUDIENCE n'est PAS réécrite d'ici : le push
    // ne la connaît pas, et l'écrire effacerait celle qu'un fait a posée.
    publicReviewPending: state.placement.publicReviewPending,
    proReviewPending: state.placement.proReviewPending,
  };
}

/**
 * La colonne `jsonb` relue en liste de codes.
 *
 * Tout ce qui n'est pas un tableau de chaînes rend `null` — « pas de fiche »
 * plutôt qu'une fiche vide. Sur un champ réglementé, la valeur par défaut doit
 * être celle qui n'affirme RIEN.
 */
function allergensOf(raw: unknown): readonly string[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  return raw.filter((code): code is string => typeof code === "string");
}

/** Les deux colonnes du point focal, ou `null` : une moitié de point ne désigne rien. */
function focalOf(x: number | null, y: number | null): { x: number; y: number } | null {
  return x === null || y === null ? null : { x, y };
}
