import { Global, Module } from "@nestjs/common";

import { IssuedDraftMandates } from "../b2b/accounting/domain/ports/issued-draft-mandates.js";
import { IssuedMandatesReader } from "../b2b/accounting/domain/ports/issued-mandates.reader.js";
import { IssuerDraftVoiding } from "../b2b/payments/application/issuer-draft-voiding.js";
import { PaymentMandateRepository } from "../b2b/payments/domain/payment-mandate.repository.js";
import { IssuedDraftsReader } from "../b2b/payments/domain/ports/issued-drafts.reader.js";
import { PrismaIssuedDraftsReader } from "../b2b/payments/infrastructure/prisma-issued-drafts.reader.js";
import { PrismaIssuedMandatesReader } from "../b2b/payments/infrastructure/prisma-issued-mandates.reader.js";
import { PrismaPaymentMandateRepository } from "../b2b/payments/infrastructure/prisma-payment-mandate.repository.js";

/**
 * Le fil qui relie **les réglages de l'entité émettrice aux mandats qu'elle a
 * émis** (plan `documentation/comptabilite/plan-mandat-deux-schemas.md` §9 objection 8).
 *
 * La comptabilité déclare deux ports — compter ce qu'elle a émis, rendre caducs
 * ses brouillons — et `payments` y répond, parce qu'il possède les mandats.
 * Même raison que `DebtorMandateModule` d'être ici et `@Global` : le
 * consommateur est `accounting`, qui ne peut pas importer `payments` sans que
 * les deux se tiennent l'un l'autre (`payments` importe déjà `accounting`).
 *
 * ⚠️ Le dépôt des mandats est **redéclaré localement**, non exporté, au lieu
 * d'importer `PaymentsModule` : ce module-là importe `AccountingModule`, qui
 * consomme ce fil — importer l'un depuis l'autre fermerait la boucle au niveau
 * des modules Nest. L'adaptateur est sans état ; deux instances ne divergent
 * pas. Les jetons exportés restent ceux de la comptabilité.
 */
@Global()
@Module({
  providers: [
    { provide: PaymentMandateRepository, useClass: PrismaPaymentMandateRepository },
    { provide: IssuedDraftsReader, useClass: PrismaIssuedDraftsReader },
    { provide: IssuedMandatesReader, useClass: PrismaIssuedMandatesReader },
    { provide: IssuedDraftMandates, useClass: IssuerDraftVoiding },
  ],
  exports: [IssuedMandatesReader, IssuedDraftMandates],
})
export class IssuedMandatesModule {}
