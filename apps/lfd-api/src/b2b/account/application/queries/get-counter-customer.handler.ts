import type { CounterCustomerBuyer, CounterCustomerView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import type { Company } from "../../domain/entities/company.js";
import { CounterCustomerNotFoundError } from "../../domain/errors/counter-errors.js";
import { CompanyAddressReader } from "../../domain/ports/company-address.reader.js";
import {
  CompanyMemberReader,
  type CompanyMemberRecord,
} from "../../domain/ports/company-member.repository.js";
import { CompanyFollowsReader } from "../../domain/ports/company-follows.reader.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { CounterCustomerReader } from "../../domain/ports/counter-customer.reader.js";
import { GetCounterCustomerQuery } from "./get-counter-customer.query.js";

/**
 * Sert au Comptoir le détail d'un client **actif** — ce qu'il faut pour lui
 * vendre, rien de plus (`documentation/comptoir/architecture-commande-au-comptoir.md`).
 *
 * 🔴 `settlesOnAccount` est rendu par l'**agrégat** (`Company.settlesOnAccount`),
 * pas réécrit ici : la règle — un crédit accordé, un prélèvement non bloqué —
 * a une seule maison. Le comptoir n'en reçoit que le verdict, jamais le
 * crédit ni le blocage.
 *
 * 🔴 **C'est le PAYEUR qui décide** (plan du jour J, §12 sérieux, lot L6) :
 * la passation lit le crédit de la société que la commande facturera —
 * le principal qu'un site suit en `billing`, sinon la société elle-même
 * (`accountStanding`, `order-settlement.ts` ; `orderPayerOf`, vérifié le
 * 2026-11-02). Lu sur la société seule, un site rattaché verrait « au
 * compte » proposé, puis refusé à la validation — ou l'inverse. Un principal
 * suivi qui n'est pas actif fait refuser la passation : « pas au compte ».
 *
 * Inconnue ou non active → {@link CounterCustomerNotFoundError} (404), un seul
 * refus pour les deux.
 */
@QueryHandler(GetCounterCustomerQuery)
export class GetCounterCustomerHandler implements IQueryHandler<
  GetCounterCustomerQuery,
  CounterCustomerView
> {
  constructor(
    private readonly customers: CounterCustomerReader,
    private readonly companies: CompanyRepository,
    private readonly addresses: CompanyAddressReader,
    private readonly members: CompanyMemberReader,
    private readonly follows: CompanyFollowsReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetCounterCustomerQuery): Promise<CounterCustomerView> {
    const [card, company] = await Promise.all([
      this.customers.activeCard(query.companyId),
      this.companies.load(query.companyId),
    ]);
    // Les deux lectures doivent dire « active » : une société passée entre-temps
    // en suspension ne s'ouvre pas au comptoir sur la foi de la première.
    if (card === null || company?.status !== "active") {
      throw new CounterCustomerNotFoundError(query.companyId);
    }
    const [addresses, members, payer] = await Promise.all([
      this.addresses.read(query.companyId),
      this.members.listOf(query.companyId),
      this.payerOf(company, query.companyId),
    ]);
    return {
      id: card.id,
      name: card.name,
      tradeName: card.tradeName,
      reference: card.reference,
      status: company.status,
      settlesOnAccount: payer?.status === "active" && payer.settlesOnAccount(),
      deliveryAddresses: [...addresses.deliveries],
      buyers: members.filter((member) => member.status === "active").map(toBuyer),
    };
  }

  /**
   * La société que la commande facturerait aujourd'hui : le principal suivi
   * en `billing` à cet instant, sinon elle-même. `null` : principal introuvable.
   */
  private async payerOf(company: Company, companyId: string): Promise<Company | null> {
    const billing = await this.follows.followsAt(companyId, "billing", this.clock.now());
    return billing === null ? company : this.companies.load(billing.parentId);
  }
}

/** Un membre actif, sans téléphone ni date d'entrée : de quoi le choisir. */
function toBuyer(member: CompanyMemberRecord): CounterCustomerBuyer {
  return {
    userId: member.userId,
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email,
    role: member.role,
  };
}
