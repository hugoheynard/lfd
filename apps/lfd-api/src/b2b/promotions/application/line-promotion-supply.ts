import { Injectable } from "@nestjs/common";

import { promotionsAdmitted, type AdmittedPromotion } from "../domain/live-promotion.js";
import { LinePromotionReader } from "../domain/ports/line-promotion.reader.js";
import { PREVIEWED_FACTS, type PricedBuyerKind } from "../domain/promotion-targeting.js";
import { PromotionAudienceFactsResolver } from "./promotion-audience-facts.resolver.js";

/** L'acheteur d'un lot, tel que la porte du prix le connaît — établi au serveur. */
export interface LotBuyer {
  /** La société servie ; `null` = particulier, ou le tableau général. */
  readonly companyId: string | null;
  readonly buyerKind: PricedBuyerKind;
}

/**
 * **Ce que le chargeur des prix demande aux promotions** (plan des
 * promotions, § 13.5, lot L5) : les promotions du point ligne admises pour
 * ce lot — fenêtre, pause et public jugés ; chacune porte le rang de la
 * cible qui admet ce client et le libellé de son audience (L8b), statut
 * `unknown` ⇒ le libellé commun. Depuis L12, la seule source.
 *
 * L'acheminement n'entre pas ici : une promotion de ligne est « dans le prix
 * affiché », sans critère d'acheminement (CHECK `promotions_point_follows_modes`,
 * `documentation/promotions/promotions.md`, § 2.14). La porte d'entrée
 * (`buyerKind`) arrive de la route depuis le lot L10 — rayon, devis,
 * passation, révision ; `unknown` pour le staff (tableau, projection), et
 * l'aperçu déclaré (`previewed`) ne joue que « tout le monde ».
 */
@Injectable()
export class LinePromotionSupply {
  constructor(
    private readonly lines: LinePromotionReader,
    private readonly facts: PromotionAudienceFactsResolver,
  ) {}

  async forLot(buyer: LotBuyer, at: Date, replay: boolean): Promise<readonly AdmittedPromotion[]> {
    const all = replay ? await this.lines.liveAt(at) : await this.lines.live();
    const { buyerKind } = buyer;
    const facts =
      buyerKind === "previewed"
        ? PREVIEWED_FACTS
        : await this.facts.factsFor(
            { companyId: buyer.companyId, buyerKind, fulfillment: null },
            all,
          );
    return promotionsAdmitted(all, at, facts);
  }
}
