import { syncCategorySchema } from "@lfd/catalog-sync";
import { operationAudienceSchema } from "@lfd/pim-contracts";
import { z } from "zod";

import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";
import type { CatalogFamilyFactBody } from "./catalog-facts.js";
import { catalogTranslationsSchema } from "./translations.js";

/** Nom STABLE du fait, clé de routage vers `@DurableHandler`. */
export const PIM_CATALOG_CATEGORY_CHANGED = "pim.catalog_category_changed";

/**
 * La forme d'une famille dans un fait du catalogue — celle du fait famille et
 * celle qu'une fiche apporte avec elle.
 *
 * Bâtie sur `syncCategorySchema` : une famille émise et une famille poussée se
 * valident par les mêmes règles, et ne peuvent pas diverger.
 */
export const catalogFamilyFactSchema = syncCategorySchema.extend({
  audience: operationAudienceSchema,
  archived: z.boolean(),
  // Lot des langues (2026-10-18) : absent d'un fait émis avant lui, lu `null`.
  nameTranslations: catalogTranslationsSchema,
});

const payloadSchema = z.object({
  categoryId: z.string().min(1),
  seq: z.number().int().positive(),
  emittedAt: z.string().datetime({ offset: true }),
  family: catalogFamilyFactSchema,
});

/**
 * **Une famille du référentiel a changé** — fait DURABLE que le référentiel
 * DÉCLARE dans son canal vers la plateforme (lot 2a de
 * `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`, C3).
 *
 * Écrit dans la transaction du geste, par `CatalogEmitter`, après le verrou de
 * la ligne : son `seq` dit l'ordre dans lequel les écritures ont été validées,
 * et la plateforme n'applique jamais un fait plus ancien que ce qu'elle tient.
 *
 * ⚠️ **Il ne se journalise pas** : le référentiel trace déjà la DÉCISION ; ceci
 * en est la conséquence.
 *
 * Clé `pim.catalog_category_changed:<categoryId>:<seq>` : un numéro n'est tiré
 * qu'une fois, donc un fait par émission.
 */
export class CatalogCategoryChangedFact implements DurableEvent {
  constructor(
    readonly categoryId: string,
    readonly seq: number,
    /** L'instant d'émission, au `Clock` du référentiel — la date de réception côté plateforme. */
    readonly emittedAt: string,
    readonly family: CatalogFamilyFactBody,
  ) {}

  durableFact(): DurableFact {
    return {
      type: PIM_CATALOG_CATEGORY_CHANGED,
      key: `${PIM_CATALOG_CATEGORY_CHANGED}:${this.categoryId}:${String(this.seq)}`,
      payload: {
        categoryId: this.categoryId,
        seq: this.seq,
        emittedAt: this.emittedAt,
        family: this.family,
      },
    };
  }

  /** @throws {CatalogFactPayloadError} payload hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): CatalogCategoryChangedFact {
    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new CatalogFactPayloadError(PIM_CATALOG_CATEGORY_CHANGED, parsed.error.message);
    }
    const { categoryId, seq, emittedAt, family } = parsed.data;
    return new CatalogCategoryChangedFact(categoryId, seq, emittedAt, family);
  }
}

/**
 * Un fait du catalogue illisible : la plateforme garde ce qu'elle tenait.
 *
 * Levé par le récepteur, il fait rejouer la livraison, puis la range en lettre
 * morte : c'est voulu — un fait avalé laisserait la plateforme en retard sans
 * que personne le sache.
 */
export class CatalogFactPayloadError extends TechnicalError {
  constructor(type: string, detail: string) {
    super(
      "pim_catalog_fact.payload_invalid",
      `Le fait « ${type} » reçu par le catalogue marchand est illisible (${detail}) : la ` +
        "plateforme garde ce qu'elle tenait. Le message reste dans la boîte d'envoi ; corriger " +
        "l'émetteur puis le rejouer depuis la carte de santé, ou réémettre la fiche.",
    );
  }
}
