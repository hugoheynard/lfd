import { Injectable } from "@nestjs/common";

import { promotionsAdmitted, type AdmittedPromotion } from "../domain/live-promotion.js";
import { LinePromotionReader } from "../domain/ports/line-promotion.reader.js";
import { PromotionShadowJournal } from "../domain/ports/promotion-shadow.journal.js";
import { PromotionsSourceReader } from "../domain/ports/promotions-source.reader.js";
import { computesPromotions, type PromotionsSource } from "../domain/promotions-source.js";
import { PREVIEWED_FACTS, type PricedBuyerKind } from "../domain/promotion-targeting.js";
import { PromotionAudienceFactsResolver } from "./promotion-audience-facts.resolver.js";

/** L'acheteur d'un lot, tel que la porte du prix le connaît — établi au serveur. */
export interface LotBuyer {
  /** La société servie ; `null` = particulier, ou le tableau général. */
  readonly companyId: string | null;
  readonly buyerKind: PricedBuyerKind;
}

/** La source en vigueur, et les promotions de ligne qui visent ce client à cet instant. */
export interface LinePromotionsForLot {
  readonly source: PromotionsSource;
  /**
   * Vide en `legacy` : rien n'est lu. Fenêtre, pause et public déjà jugés ;
   * chacune porte le rang de la cible qui admet ce client et le libellé de
   * son audience (L8b) — statut `unknown` ⇒ le libellé commun.
   */
  readonly promotions: readonly AdmittedPromotion[];
  /**
   * Où consigner un écart — sous la source `shadow` seulement. Rendu avec la
   * source pour que celui qui compare ne puisse pas comparer sans consigner.
   */
  readonly journal: PromotionShadowJournal | null;
}

/**
 * **Ce que le chargeur des prix demande aux promotions** (plan des
 * promotions, § 13.5, lot L5) : la source, et — si elle les calcule — les
 * promotions du point ligne admises pour ce lot.
 *
 * En `legacy`, une lecture (la source, sous le cache) et rien d'autre : le
 * nouveau chemin ne coûte rien tant qu'il n'est ni servi ni à l'ombre.
 *
 * L'acheminement n'entre pas ici : une promotion de ligne n'en a pas (CHECK
 * `basket ⇔ fulfillment_kind <> 'any'`, § 13.6). La porte d'entrée
 * (`buyerKind`) arrive de la route depuis le lot L10 — rayon, devis,
 * passation, révision ; `unknown` pour le staff (tableau, projection), et
 * l'aperçu déclaré (`previewed`) ne joue que « tout le monde ».
 */
@Injectable()
export class LinePromotionSupply {
  constructor(
    private readonly sources: PromotionsSourceReader,
    private readonly lines: LinePromotionReader,
    private readonly facts: PromotionAudienceFactsResolver,
    private readonly journal: PromotionShadowJournal,
  ) {}

  async forLot(buyer: LotBuyer, at: Date, replay: boolean): Promise<LinePromotionsForLot> {
    const source = await this.sources.current();
    if (!computesPromotions(source)) {
      return { source, promotions: [], journal: null };
    }
    const all = replay ? await this.lines.liveAt(at) : await this.lines.live();
    const { buyerKind } = buyer;
    const facts =
      buyerKind === "previewed"
        ? PREVIEWED_FACTS
        : await this.facts.factsFor(
            { companyId: buyer.companyId, buyerKind, fulfillment: null },
            all,
          );
    return {
      source,
      promotions: promotionsAdmitted(all, at, facts),
      journal: source === "shadow" ? this.journal : null,
    };
  }
}
