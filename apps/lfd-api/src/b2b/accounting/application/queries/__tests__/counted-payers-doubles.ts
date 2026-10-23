import type { CollectionMandate } from "../../../domain/ports/collection-mandates.reader.js";
import type { PayerStanding } from "../../../domain/ports/payer-standing.reader.js";
import { PayerStandingsReader } from "../../../domain/ports/payer-standings.reader.js";
import { mandate } from "../../../domain/services/__tests__/collection-fixtures.js";
import type { CountedPayersReaders } from "../../counted-payers-support.js";
import { FakeMandates } from "../../commands/__tests__/collection-doubles.js";

/** Tous les comptes, tels qu'on les lui donne — sans horloge. */
export class AllStandings extends PayerStandingsReader {
  constructor(private readonly accounts: readonly PayerStanding[]) {
    super();
  }
  allAt(): Promise<readonly PayerStanding[]> {
    return Promise.resolve(this.accounts);
  }
}

/** Un compte actif qui règle seul. */
export function activePayer(
  companyId: string,
  overrides: Partial<PayerStanding> = {},
): PayerStanding {
  return { companyId, name: companyId, active: true, follows: [], ...overrides };
}

/** Un mandat actif signé de ce compte chez cette entité — celui que le lot prendrait. */
export function signedMandate(legalEntityId: string, companyId: string): CollectionMandate {
  return mandate(companyId, { creditorId: legalEntityId });
}

/** Les lectures du comptage, sur ces comptes et ces mandats. */
export function countingOf(
  accounts: readonly PayerStanding[],
  mandates: readonly CollectionMandate[],
): CountedPayersReaders {
  const fake = new FakeMandates();
  fake.mandates = [...mandates];
  return { standings: new AllStandings(accounts), mandates: fake };
}

/** Des clients qui comptent tous : actifs, payeurs, chacun son mandat signé chez l'entité. */
export function clientsOf(legalEntityId: string, ids: readonly string[]): CountedPayersReaders {
  return countingOf(
    ids.map((id) => activePayer(id)),
    ids.map((id) => signedMandate(legalEntityId, id)),
  );
}
