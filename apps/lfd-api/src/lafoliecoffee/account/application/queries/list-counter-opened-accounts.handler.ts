import type { CounterOpenedAccountRow, CounterOpenedAccountsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CounterAccountOrderCountReader } from "../../../orders/domain/ports/counter-account-order-count.reader.js";
import { CounterAccountOutstandingReader } from "../../../orders/domain/ports/counter-account-outstanding.reader.js";
import { AdminCompanyReader } from "../../domain/ports/admin-company.reader.js";
import {
  CounterOpenedAccountsReader,
  type CounterOpenedAccountRecord,
} from "../../domain/ports/counter-opened-accounts.reader.js";
import { activationGate, type ActivationGate } from "../../domain/services/activation-gate.js";
import { ListCounterOpenedAccountsQuery } from "./list-counter-opened-accounts.query.js";

/**
 * Compose la page « Comptes du comptoir » (§ 4) : la liste et ses traces
 * (compte), le dû et le nombre de commandes au compte (commandes, une
 * requête chacune pour toute la page), et **le verdict d'activation de la
 * fiche** — la fonction même qui garde l'activation, pour que « ce qui
 * manque » ne contredise jamais la conversion.
 *
 * Le verdict demande la fiche entière (`AdminCompanyReader.byId`), une par
 * ligne : il croise plusieurs tables et n'a pas de lecture par lot. La page
 * ne liste que les comptes pas encore convertis — une poignée.
 *
 * « Pièce vue par » nomme l'agent qui a ouvert quand c'est lui qui a coché —
 * toujours, par construction de l'ouverture —, sinon `null`.
 */
@QueryHandler(ListCounterOpenedAccountsQuery)
export class ListCounterOpenedAccountsHandler implements IQueryHandler<
  ListCounterOpenedAccountsQuery,
  CounterOpenedAccountsView
> {
  constructor(
    private readonly accounts: CounterOpenedAccountsReader,
    private readonly fiches: AdminCompanyReader,
    private readonly outstanding: CounterAccountOutstandingReader,
    private readonly orderCounts: CounterAccountOrderCountReader,
  ) {}

  async execute(): Promise<CounterOpenedAccountsView> {
    const records = await this.accounts.listOpened();
    const ids = records.map((record) => record.companyId);
    const [owed, counts, verdicts] = await Promise.all([
      this.outstanding.outstandingOf(ids),
      this.orderCounts.countOf(ids),
      Promise.all(ids.map((id) => this.verdictOf(id))),
    ]);
    const accounts = records.map((record, index) =>
      toRow(
        record,
        owed.get(record.companyId) ?? 0,
        counts.get(record.companyId) ?? 0,
        verdicts[index] ?? null,
      ),
    );
    return {
      accounts,
      totalOutstandingCents: accounts.reduce((sum, row) => sum + row.outstandingCents, 0),
    };
  }

  /** `null` : la fiche a disparu entre la liste et sa lecture. */
  private async verdictOf(companyId: string): Promise<ActivationGate | null> {
    const fiche = await this.fiches.byId(companyId);
    return fiche === null ? null : activationGate(fiche);
  }
}

function toRow(
  record: CounterOpenedAccountRecord,
  outstandingCents: number,
  onAccountOrders: number,
  verdict: ActivationGate | null,
): CounterOpenedAccountRow {
  const check = record.identityCheck;
  return {
    companyId: record.companyId,
    reference: record.reference,
    enseigne: record.enseigne,
    contact: record.contact,
    openedAt: record.openedAt.toISOString(),
    openedByName: record.openedByName,
    identityCheck:
      check === null
        ? null
        : {
            seen: check.seen,
            byStaffId: check.byStaffId,
            byName: check.byStaffId === record.openedByStaffId ? record.openedByName : null,
            at: check.at.toISOString(),
          },
    onAccountOrders,
    outstandingCents,
    missing: verdict?.blocking ?? [],
    convertsToActive: verdict !== null && verdict.blocking.length === 0,
  };
}
