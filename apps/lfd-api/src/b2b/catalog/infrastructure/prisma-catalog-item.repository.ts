import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { CatalogItem, CatalogItemState } from "../domain/entities/catalog-item.js";
import { CatalogItemRepository } from "../domain/ports/catalog-item.repository.js";
import { STILL_SOLD } from "./sellable-filter.js";
import { lastRecordedPrices, priceTraceRows } from "./catalog-price-trace.js";
import { pimFactsColumns } from "./catalog-item-columns.js";
import { DECISION_COLUMNS } from "./catalog-decision-columns.js";
import { writeReviewStates } from "./catalog-review-states.js";
import { toDomain } from "./catalog-item-rows.js";
import { upsertCatalogItems, type ItemUpsertRow } from "./catalog-item-upsert.js";
import { writeDecisions } from "./catalog-decision-writes.js";

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

  async loadMany(skus: readonly string[]): Promise<CatalogItem[]> {
    if (skus.length === 0) {
      return [];
    }
    const rows = await this.prisma.catalogItem.findMany({
      where: { sku: { in: [...skus] }, ...STILL_SOLD },
      include: { override: { select: DECISION_COLUMNS } },
    });
    return rows.map(toDomain);
  }

  async saveReviewStates(items: readonly CatalogItem[]): Promise<void> {
    await writeReviewStates(this.prisma, items);
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
   * Écrit les agrégats **dans une transaction**, en un nombre de requêtes qui
   * ne croît pas avec le lot : une lecture des prix tracés, un upsert des
   * articles, deux écritures de décision au plus, une de trace au plus.
   *
   * Un catalogue à moitié écrit vend des articles à des prix qui n'ont jamais
   * été décidés ensemble ; l'atomicité n'est pas un confort ici. Un `upsert`
   * et une décision PAR ARTICLE allongeaient la transaction interactive avec
   * le lot — ce qui a fait expirer la validation en production (P2028,
   * 2026-10-17).
   */
  async saveMany(items: readonly CatalogItem[]): Promise<void> {
    // Un agrégat cité deux fois ne s'écrit qu'une — le dernier, comme la
    // boucle d'avant le laissait en base.
    const states = [...new Map(items.map((item) => [item.sku, item.toPersistence()])).values()];
    if (states.length === 0) {
      return;
    }
    // Le prix déjà tracé, par SKU : c'est à lui qu'on compare pour
    // n'écrire une ligne d'historique que sur un vrai changement.
    const recorded = await lastRecordedPrices(
      this.prisma,
      states.map((state) => state.facts.sku),
    );
    const now = this.clock.now();

    await this.prisma.$transaction(async (tx) => {
      await upsertCatalogItems(tx, states.map(factsRow));
      await writeDecisions(tx, states, now);

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
        now,
      );
      if (changes.length > 0) {
        await tx.catalogPriceHistory.createMany({ data: changes });
      }
    });
  }
}

/** Les colonnes de faits, et le retrait — celles qu'un push remplace, et elles seules. */
function factsRow(state: CatalogItemState): ItemUpsertRow {
  return {
    sku: state.facts.sku,
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
