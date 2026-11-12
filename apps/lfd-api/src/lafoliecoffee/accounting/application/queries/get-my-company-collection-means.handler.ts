import type { MyCollectionMeansView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { InvoiceCompanyNotFoundError } from "../../domain/errors/invoice-access-errors.js";
import { SeveralClientCollectionMeansError } from "../../domain/errors/collection-means-errors.js";
import { InvoiceIssuersReader } from "../../domain/ports/invoice-issuers.reader.js";
import { PayerCollectionMeansReader } from "../../domain/ports/payer-collection-means.reader.js";
import { PayerStandingReader } from "../../domain/ports/payer-standing.reader.js";
import { UnpaidAccessReader } from "../../domain/ports/unpaid-access.reader.js";
import { collectionMeansPayerOf } from "../../domain/services/collection-means-payer.js";
import { collectionMeansAt } from "../../domain/services/collection-means-timeline.js";
import {
  type CollectionMeans,
  DEFAULT_COLLECTION_MEANS,
} from "../../domain/value-objects/collection-means.js";
import { GetMyCompanyCollectionMeansQuery } from "./get-my-company-collection-means.query.js";

/**
 * **Comment le compte règle au compte**, pour l'espace client (plan
 * `le-paiement-par-virement.md`, T5) : la boutique dit « par
 * virement à réception de facture » et retire l'espace mandat d'un client au
 * virement. Le moyen d'un site qui suit la facturation de son principal est
 * celui du principal (V1, `collectionMeansPayerOf`), comme pour le staff.
 *
 * Le mur : tout membre de la société lit (le moyen n'est ni un montant ni une
 * coordonnée) ; un non-membre reçoit le 404 non divulguant des factures. Rien
 * de l'entité n'est servi — ni IBAN, ni BIC : ils ne sont que sur la facture.
 *
 * L'entité : celle en service, comme l'émission (`soleSeller`). Aucune : le
 * prélèvement, le défaut du domaine (rien ne sera facturé). Plusieurs qui
 * disent la même chose : celle-là ; qui divergent : refus.
 *
 * @throws {InvoiceCompanyNotFoundError} le demandeur n'est pas membre, ou la société n'existe pas.
 * @throws {SeveralClientCollectionMeansError} des entités en service qui divergent.
 */
@QueryHandler(GetMyCompanyCollectionMeansQuery)
export class GetMyCompanyCollectionMeansHandler implements IQueryHandler<
  GetMyCompanyCollectionMeansQuery,
  MyCollectionMeansView
> {
  constructor(
    private readonly access: UnpaidAccessReader,
    private readonly issuers: InvoiceIssuersReader,
    private readonly standings: PayerStandingReader,
    private readonly payerMeans: PayerCollectionMeansReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetMyCompanyCollectionMeansQuery): Promise<MyCollectionMeansView> {
    if ((await this.access.roleOf(query.actorUserId, query.companyId)) === null) {
      throw new InvoiceCompanyNotFoundError(query.companyId);
    }
    const now = this.clock.now();
    const standing = await this.standings.standingOf(query.companyId, now);
    if (standing === null) {
      throw new InvoiceCompanyNotFoundError(query.companyId);
    }
    const { payer } = collectionMeansPayerOf(standing, now);
    const active = await this.issuers.activeIssuers();
    const means = await Promise.all(
      active.map(async ({ legalEntityId }) =>
        collectionMeansAt(await this.payerMeans.entriesOf(legalEntityId, payer.id), now),
      ),
    );
    return { means: agreedMeans(means.map((inForce) => inForce.means)) };
  }
}

/** Le moyen commun aux entités en service ; le défaut sans aucune. */
function agreedMeans(means: readonly CollectionMeans[]): CollectionMeans {
  const [first, ...others] = means;
  if (first === undefined) {
    return DEFAULT_COLLECTION_MEANS;
  }
  if (others.some((other) => other !== first)) {
    throw new SeveralClientCollectionMeansError(means.length);
  }
  return first;
}
