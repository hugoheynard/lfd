import type { CustomerMandateView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { PaymentMandateRepository } from "../../domain/payment-mandate.repository.js";
import { BankAccountGuardReader } from "../../domain/ports/bank-account-guard.reader.js";
import { CustomerMandateGate } from "../../domain/ports/customer-mandate-gate.js";
import { ensureCustomerMandateAccess } from "../customer-mandate-access.js";
import { GetMyCompanyMandateQuery } from "./get-my-company-mandate.query.js";

/**
 * Rend le mandat courant au client, ou `null` s'il n'en a jamais eu.
 *
 * « Courant » au sens de la fiche staff : l'actif, sinon le brouillon, sinon le
 * dernier connu. Un `revoked` redescend donc tel quel, et c'est l'écran qui le
 * lit « aucun mandat en cours » — le serveur ne décide pas de ce qu'un état
 * veut dire pour un client.
 *
 * Le drapeau garde aussi cette LECTURE : une carte qui montrerait un mandat
 * qu'aucune route ne permet de télécharger ni de renvoyer promettrait un geste
 * que le serveur refuse.
 */
@QueryHandler(GetMyCompanyMandateQuery)
export class GetMyCompanyMandateHandler implements IQueryHandler<
  GetMyCompanyMandateQuery,
  CustomerMandateView | null
> {
  constructor(
    private readonly guard: BankAccountGuardReader,
    private readonly gate: CustomerMandateGate,
    private readonly mandates: PaymentMandateRepository,
  ) {}

  async execute(query: GetMyCompanyMandateQuery): Promise<CustomerMandateView | null> {
    await ensureCustomerMandateAccess(
      { guard: this.guard, gate: this.gate },
      query.actorUserId,
      query.companyId,
    );

    const mandate = await this.mandates.findCurrent(query.companyId);
    return mandate?.toCustomerView() ?? null;
  }
}
