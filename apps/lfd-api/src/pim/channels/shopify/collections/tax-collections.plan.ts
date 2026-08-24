import { Injectable } from "@nestjs/common";

import type { DesiredCollection } from "@lfd/shopify-admin";

import { VatRateRepository } from "../../../commerce/domain/ports/vat-rate.repository.js";
import { vatCollectionHandle } from "./vat-handle.js";

/** « 5.5 » → « 5,5 % ». Le rendu du taux dans un titre de collection. */
function formatPercent(percent: number): string {
  return `${percent.toString().replace(".", ",")} %`;
}

/**
 * Les collections de taxe que la boutique **devrait** avoir, dérivées du
 * référentiel des taux de TVA.
 *
 * La dérivation vivait dans le front, qui envoyait la liste voulue au backend à
 * chaque appel. Deux problèmes : elle rendait la publication dépendante d'un
 * écran ouvert — rien ne pouvait la déclencher côté serveur — et le titre de la
 * collection se décidait dans un composant Angular.
 *
 * Elle appartient au **canal** et non au commerce : le handle et le titre sont
 * du vocabulaire Shopify. Le commerce rend des taux — un nom et un taux ;
 * c'est ici qu'ils deviennent des collections.
 */
@Injectable()
export class TaxCollectionsPlan {
  constructor(private readonly rates: VatRateRepository) {}

  async desired(): Promise<DesiredCollection[]> {
    const rates = await this.rates.listAll();
    return rates.map((rate) => {
      const { percent } = rate.snapshot();
      return { handle: vatCollectionHandle(percent), title: `TVA ${formatPercent(percent)}` };
    });
  }
}
