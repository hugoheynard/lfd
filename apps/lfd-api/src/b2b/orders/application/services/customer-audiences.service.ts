import { audienceOf, type CustomerAudience } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { CompanyStatusReader } from "../../domain/ports/company-status.reader.js";

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
    if (companyId === null) {
      return audienceOf(null);
    }
    return audienceOf(await this.companies.companyStatusOf(companyId));
  }
}
