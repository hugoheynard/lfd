import { audienceOf, type CustomerAudience } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  CompanyStatusReader,
  type OrderCompanyStatus,
} from "../../domain/ports/company-status.reader.js";

/** La clientèle, et le statut d'où elle est tirée — lus ensemble, une fois. */
export interface CustomerStanding {
  readonly audience: CustomerAudience;
  /** `null` : aucune société, ou une société que la base ne connaît pas. */
  readonly companyStatus: OrderCompanyStatus | null;
}

/**
 * **La clientèle d'une requête**, déduite de la société agissante.
 *
 * Déduite, jamais déclarée : ni un corps ni un en-tête ne la portent (plan
 * `remise-et-livraison-par-clientele`, D1). La règle elle-même est
 * `audienceOf` — B2B pour une société **active** seulement (Q3) — et ce service
 * n'ajoute que la lecture du statut, au serveur, au moment de la question.
 *
 * Partagé par le devis et la caisse pour la raison qui fait exister
 * `CartAdjustments` : deux lectures de « qui est pro » finiraient par annoncer
 * une remise que la commande refuse.
 */
@Injectable()
export class CustomerAudiences {
  constructor(private readonly companies: CompanyStatusReader) {}

  /** `null` = visiteur ou espace perso : B2C, sans lecture. */
  async of(companyId: string | null): Promise<CustomerAudience> {
    return (await this.standingOf(companyId)).audience;
  }

  /**
   * La clientèle ET le statut : les promotions panier lisent le statut (« pro
   * ou pas », pros actifs, en cours d'inscription — plan des promotions,
   * L5), la remise de retrait la clientèle. Une lecture pour les deux.
   */
  async standingOf(companyId: string | null): Promise<CustomerStanding> {
    if (companyId === null) {
      return { audience: audienceOf(null), companyStatus: null };
    }
    const companyStatus = await this.companies.companyStatusOf(companyId);
    return { audience: audienceOf(companyStatus), companyStatus };
  }
}
