import { syncProductSchema, syncVariantSchema } from "@lfd/catalog-sync";
import { operationAudienceSchema } from "@lfd/pim-contracts";
import { z } from "zod";

import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import {
  CatalogFactPayloadError,
  catalogFamilyFactSchema,
} from "./catalog-category-changed.fact.js";
import type { CatalogProductFactBody } from "./catalog-facts.js";

/** Nom STABLE du fait, clé de routage vers `@DurableHandler`. */
export const PIM_CATALOG_PRODUCT_CHANGED = "pim.catalog_product_changed";

/**
 * La forme du fait, reprise du fil du push (`syncProductSchema`,
 * `syncVariantSchema`) : un article émis et un article poussé se valident par
 * les mêmes règles — c'est la « validation par article reprise » de 2a4.
 *
 * Deux écarts, voulus : les déclinaisons peuvent être ZÉRO (une fiche inactive,
 * ou dont aucune déclinaison n'est complète, s'émet quand même), et la fiche
 * porte son statut, son audience, ses manques et sa famille.
 */
const payloadSchema = z.object({
  productId: z.string().min(1),
  seq: z.number().int().positive(),
  emittedAt: z.string().datetime({ offset: true }),
  status: z.enum(["inactive", "active", "archived"]),
  audience: operationAudienceSchema,
  product: syncProductSchema.omit({ variants: true }),
  variants: z.array(syncVariantSchema),
  gaps: z.record(z.string(), z.array(z.string().min(1))),
  family: catalogFamilyFactSchema,
});

/**
 * **Une fiche du référentiel a changé** — fait DURABLE que le référentiel
 * DÉCLARE dans son canal vers la plateforme (lot 2a de
 * `documentation/pim/plan-catalogue-synchronise-par-audience.md`, C3, C4).
 *
 * Il porte l'**instantané complet** de la fiche, relu en base sous verrou par
 * `CatalogEmitter` en fin de transaction — pas un diff : il se rejoue seul, et
 * le plus récent gagne (`seq`).
 *
 * ## Ce qu'il n'est pas
 *
 * ⚠️ **Il ne se journalise pas.** Le référentiel trace déjà la DÉCISION
 * (`product.*`) ; ceci en est la conséquence.
 *
 * ⚠️ **Il ne porte pas les règles globales** (limites de commande, rapport
 * pro) : elles voyagent comme règles (C3, lot 4). Un réglage global
 * réémettrait sinon tout le catalogue.
 *
 * ## Pourquoi il vit dans le CANAL
 *
 * Un fait qu'un autre bloc consomme fait partie de la surface publiée, au même
 * titre qu'un port (`lint:context-boundaries`) : `pim → b2b` reste interdit, la
 * plateforme écoute un fait du canal.
 *
 * Clé `pim.catalog_product_changed:<productId>:<seq>`.
 */
export class CatalogProductChangedFact implements DurableEvent {
  constructor(
    readonly productId: string,
    readonly seq: number,
    /** L'instant d'émission, au `Clock` du référentiel — la date de réception côté plateforme. */
    readonly emittedAt: string,
    readonly body: CatalogProductFactBody,
  ) {}

  durableFact(): DurableFact {
    return {
      type: PIM_CATALOG_PRODUCT_CHANGED,
      key: `${PIM_CATALOG_PRODUCT_CHANGED}:${this.productId}:${String(this.seq)}`,
      payload: {
        productId: this.productId,
        seq: this.seq,
        emittedAt: this.emittedAt,
        ...this.body,
      },
    };
  }

  /** @throws {CatalogFactPayloadError} payload hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): CatalogProductChangedFact {
    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new CatalogFactPayloadError(PIM_CATALOG_PRODUCT_CHANGED, parsed.error.message);
    }
    const { productId, seq, emittedAt, ...body } = parsed.data;
    return new CatalogProductChangedFact(productId, seq, emittedAt, body);
  }
}
