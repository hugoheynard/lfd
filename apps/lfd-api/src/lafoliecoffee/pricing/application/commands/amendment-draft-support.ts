import type { AmendCompanyMercurialePayload } from "@lfd/contracts";

import type { MercurialeAmendmentDraft } from "../../domain/entities/company-mercuriale.js";
import type { PromotionAdmission } from "../../domain/entities/mercuriale-promotion-policy.js";
import { generalDiscountOf } from "./general-discount-support.js";

/**
 * **Le contrat d'un avenant → l'intention du domaine**, partagé par l'avenant
 * qui s'enregistre et par son aperçu : les deux doivent soumettre à `amend`
 * exactement le même brouillon, sans quoi l'aperçu annoncerait d'autres refus
 * que l'enregistrement.
 *
 * `validFrom` absent = maintenant (Q2). La politique de promotions arrive déjà
 * vérifiée par `namedPolicy` ; `null` = l'avenant n'en dit rien.
 */
export function amendmentDraftOf(
  payload: AmendCompanyMercurialePayload,
  now: Date,
  promotionPolicy: PromotionAdmission | null,
): MercurialeAmendmentDraft {
  return {
    // Le prix fixe est le seul palier de sa ligne, comme à la pose.
    lines: payload.lines.map((line) => ({
      sku: line.sku,
      tiers: [{ minQuantity: 1, unitPriceMillicents: line.unitPriceMillicents }],
    })),
    endedSkus: payload.endedSkus,
    validFrom: payload.validFrom === undefined ? now : new Date(payload.validFrom),
    validTo: payload.validTo === null ? null : new Date(payload.validTo),
    reason: payload.reason,
    origin: null,
    promotionPolicy,
    ...(payload.generalDiscount === undefined
      ? {}
      : {
          generalDiscount: {
            set:
              payload.generalDiscount.set === null
                ? null
                : generalDiscountOf(payload.generalDiscount.set),
          },
        }),
  };
}
