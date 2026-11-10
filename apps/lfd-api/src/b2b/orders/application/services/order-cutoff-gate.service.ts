import type { OrderCutoffDecision } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import type { Instant } from "../../../../platform/context/request-context.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OrderCutoffReader } from "../../domain/ports/order-cutoff.reader.js";
import { OrderCutoffWaiverGate } from "../../domain/ports/order-cutoff-waiver.gate.js";
import {
  decideStrictestOrderCutoff,
  ensureWithinOrderCutoff,
  foreseenWaiver,
  type LineOrderLimit,
} from "../../domain/services/order-cutoff-guard.js";
import { staffViewer } from "../../../catalog/domain/catalog-viewer.js";

/**
 * **L'heure limite opposée à un panier** — extraite d'`OrderDrafting` le
 * 2026-10-23 pour servir aussi la révision (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, R1), sans en faire
 * une seconde copie.
 *
 * **Deux sources.** Chaque article peut porter la sienne, résolue par le
 * référentiel sur son échelle ; celui qui n'en a pas retombe sur la règle du
 * commerce. La garde arbitre : la décision la plus fermée parmi les lignes,
 * parce qu'un panier ne se découpe pas.
 *
 * La passation consulte la dérogation du client ; la révision, non : une
 * modification ne crée ni ne retire de surtaxe (R4), donc elle ne dépense
 * aucune autorisation.
 */
@Injectable()
export class OrderCutoffGate {
  constructor(
    private readonly cutoffs: OrderCutoffReader,
    private readonly catalog: ProductCatalogReader,
    private readonly waivers: OrderCutoffWaiverGate,
    private readonly clock: Clock,
  ) {}

  /**
   * Refuse si l'heure limite de `fulfillmentDate` est passée pour ce panier.
   * Rend la dérogation dépensée (passation seulement), ou `null`.
   *
   * `at` : l'instant du geste (plan S2, R6) — l'horloge pour la passation et
   * M1, la création du projet pour une hausse appliquée plus tard.
   *
   * @throws {OrderCutoffGraceError} la limite est passée, le rattrapage court, sans dérogation.
   * @throws {PastOrderCutoffError} la limite ET le rattrapage sont passés.
   */
  async ensure(
    skus: readonly string[],
    fulfillmentDate: string,
    companyId: string | null,
    { withWaiver, at }: { readonly withWaiver: boolean; readonly at: Instant },
  ): Promise<string | null> {
    return ensureWithinOrderCutoff(
      await this.inputsOf(skus, fulfillmentDate, withWaiver ? companyId : null, at),
    );
  }

  /**
   * **La dérogation que la passation dépenserait**, lue sans être consommée et
   * sans refuser — `null` hors de la grâce ou sans dérogation ouverte. Le devis
   * d'une société s'en sert pour chiffrer la surtaxe prévue (plan
   * `le-prix-d-un-panier.md`, T1) ; `consume` reste à la seule passation.
   */
  async foresee(
    skus: readonly string[],
    fulfillmentDate: string,
    companyId: string,
  ): Promise<string | null> {
    return foreseenWaiver(await this.inputsOf(skus, fulfillmentDate, companyId, this.clock.now()));
  }

  /** Les règles, les limites des articles et la dérogation ouverte, lues ensemble. */
  private async inputsOf(
    skus: readonly string[],
    fulfillmentDate: string,
    waiverOwner: string | null,
    now: Instant,
  ): Promise<Parameters<typeof ensureWithinOrderCutoff>[0]> {
    const [fallback, items, waiver] = await Promise.all([
      this.cutoffs.list(),
      // `pro` : la saisie par le staff exige une société (cf. `place-order-for-customer`).
      this.catalog.resolveMany(skus, staffViewer("pro")),
      // Une commande sans entreprise n'a pas de dérogation possible : elle
      // n'appartient à personne à qui on aurait pu en accorder une.
      waiverOwner === null
        ? Promise.resolve(null)
        : this.waivers.openFor(waiverOwner, fulfillmentDate),
    ]);
    return {
      lines: limitsOf(skus, items),
      fallback,
      fulfillmentDate,
      waiver,
      now,
    };
  }

  /**
   * La MÊME décision, sans refuser : ce que la vue d'une commande dit de sa
   * modification (« jusqu'à quand », ou « trop tard » — plan
   * `documentation/commandes/modification/plan-modifier-une-commande.md`, §6). Aucune
   * dérogation : la révision n'en dépense pas.
   */
  async decide(skus: readonly string[], fulfillmentDate: string): Promise<OrderCutoffDecision> {
    const [fallback, items] = await Promise.all([
      this.cutoffs.list(),
      this.catalog.resolveMany(skus, staffViewer("pro")),
    ]);
    return decideStrictestOrderCutoff({
      lines: limitsOf(skus, items),
      fallback,
      fulfillmentDate,
      now: this.clock.now(),
    });
  }
}

/**
 * Un SKU absent du catalogue n'a pas de limite propre : il retombe sur la
 * règle du commerce. Il est refusé pour ce qu'il est — inconnu — par le
 * chargement, que la passation juge AVANT l'heure limite (rangs 4 et 5 du
 * §2.4, `le-prix-d-un-panier.md`), et jamais ici pour une heure.
 */
function limitsOf(
  skus: readonly string[],
  items: ReadonlyMap<string, { readonly orderTimeLimit: LineOrderLimit["limit"] }>,
): LineOrderLimit[] {
  return skus.map((sku) => ({ sku, limit: items.get(sku)?.orderTimeLimit ?? null }));
}
