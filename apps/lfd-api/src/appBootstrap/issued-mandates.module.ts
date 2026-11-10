import { Global, Module } from "@nestjs/common";

import { IssuedDraftMandates } from "../lafoliecoffee/accounting/domain/ports/issued-draft-mandates.js";
import { IssuedMandatesReader } from "../lafoliecoffee/accounting/domain/ports/issued-mandates.reader.js";
import { IssuerDraftVoiding } from "../lafoliecoffee/payments/application/issuer-draft-voiding.js";
import { PaymentMandateRepository } from "../lafoliecoffee/payments/domain/payment-mandate.repository.js";
import { IssuedDraftsReader } from "../lafoliecoffee/payments/domain/ports/issued-drafts.reader.js";
import { PrismaIssuedDraftsReader } from "../lafoliecoffee/payments/infrastructure/prisma-issued-drafts.reader.js";
import { PrismaIssuedMandatesReader } from "../lafoliecoffee/payments/infrastructure/prisma-issued-mandates.reader.js";
import { PrismaPaymentMandateRepository } from "../lafoliecoffee/payments/infrastructure/prisma-payment-mandate.repository.js";

/**
 * Le fil qui relie **les réglages de l'entité émettrice aux mandats qu'elle a
 * émis** (plan `documentation/comptabilite/mandat/mandat-deux-schemas.md` objection 8).
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
