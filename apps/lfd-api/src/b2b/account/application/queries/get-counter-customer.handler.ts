import type { CounterCustomerBuyer, CounterCustomerView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CounterCustomerNotFoundError } from "../../domain/errors/counter-errors.js";
import { CompanyAddressReader } from "../../domain/ports/company-address.reader.js";
import {
  CompanyMemberReader,
  type CompanyMemberRecord,
} from "../../domain/ports/company-member.repository.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { CounterCustomerReader } from "../../domain/ports/counter-customer.reader.js";
import { GetCounterCustomerQuery } from "./get-counter-customer.query.js";

/**
 * Sert au Comptoir le détail d'un client **actif** — ce qu'il faut pour lui
 * vendre, rien de plus (`documentation/order/plan-commande-au-comptoir.md`).
 *
 * 🔴 `settlesOnAccount` est rendu par l'**agrégat** (`Company.settlesOnAccount`),
 * pas réécrit ici : la règle — un crédit accordé, un prélèvement non bloqué —
 * a une seule maison, et c'est elle que la passation consulte aussi. Le
 * comptoir n'en reçoit que le verdict, jamais le crédit ni le blocage.
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
    const [addresses, members] = await Promise.all([
      this.addresses.read(query.companyId),
      this.members.listOf(query.companyId),
    ]);
    return {
      id: card.id,
      name: card.name,
      tradeName: card.tradeName,
      reference: card.reference,
      status: company.status,
      settlesOnAccount: company.settlesOnAccount(),
      deliveryAddresses: [...addresses.deliveries],
      buyers: members.filter((member) => member.status === "active").map(toBuyer),
    };
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
