import type { LateFeeAdjustment } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { OrderLateFeeReader } from "../../domain/ports/order-late-fee.reader.js";
import { OrderCutoffGate } from "./order-cutoff-gate.service.js";
import { ShelfCircuit } from "./shelf-circuit.service.js";

/**
 * **Le verdict de retard qui a un prix** (plan
 * `documentation/pricing/centime-et-tva/le-prix-d-un-panier.md`, § 2.3) —
 * une seule source, lue par la passation (`OrderDrafting`) et par le devis
 * d'une société (`ShopCartQuoting`, plan `le-prix-d-un-panier.md`, T1).
 *
 * En exécution, la dérogation vient du jugement qui la dépense ; en conseil,
 * du même jugement sans dépense ({@link OrderCutoffGate.foresee}). Le montant,
 * lui, ne se décide qu'ici ({@link forWaiver}) : deux copies de « pas de
 * dérogation, pas de surtaxe » finiraient par diverger.
 */
@Injectable()
export class LateFeeJudgement {
  constructor(
    private readonly cutoffGate: OrderCutoffGate,
    private readonly shelf: ShelfCircuit,
    private readonly lateFees: OrderLateFeeReader,
  ) {}

  /**
   * Ce que le retard coûte, **et seulement quand il y a eu retard** — le
   * verdict, pas le montant : `priceBasket` l'applique au sous-total (§ 2.3).
   *
   * `null` de dérogation ⇒ rien à facturer. Réglage absent ⇒ rien non plus :
   * rattraper sans facturer est un choix valable, et inventer un montant
   * facturerait une décision que personne n'a prise. Le taux voyage avec
   * l'ajustement : un montant sans son taux ne se justifie pas devant un comptable.
   * La surtaxe ne se lit QUE si une dérogation a servi : une requête de plus
   * sur chaque commande à l'heure, pour un réglage que la plupart des maisons
   * n'ont pas, se paierait partout.
   */
  async forWaiver(waiverUsed: string | null): Promise<LateFeeAdjustment | null> {
    if (waiverUsed === null) {
      return null;
    }
    const setting = await this.lateFees.current();
    if (setting === null) {
      return null;
    }
    return { adjustment: setting.adjustment, vatRatePercent: setting.vatRatePercent };
  }

  /**
   * **La surtaxe que la passation de ce panier facturerait maintenant** — le
   * jugement de `draft` (marque du circuit, puis heure limite et dérogation
   * pour une commande fabriquée), la dérogation LUE sans être consommée.
   *
   * Rien sans société (une dérogation n'appartient qu'à une société) ni sans
   * jour (le panier est partiel, et `awaiting` le dit déjà). Ne refuse
   * jamais : passé l'heure sans dérogation, la passation refusera ; le devis,
   * lui, ne chiffre rien.
   */
  async foreseen(
    companyId: string | null,
    skus: readonly string[],
    day: string | null,
  ): Promise<LateFeeAdjustment | null> {
    if (companyId === null || day === null) {
      return null;
    }
    // Le client, jamais l'équipe : la marque se décide comme à sa passation.
    const supply = await this.shelf.decide({ placedByStaffId: null }, day, undefined);
    if (supply.supply !== "planned") {
      return null;
    }
    return this.forWaiver(await this.cutoffGate.foresee(skus, day, companyId));
  }
}
