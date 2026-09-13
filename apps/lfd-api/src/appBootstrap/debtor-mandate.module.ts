import { Global, Module } from "@nestjs/common";

import { DebtorMandateReader } from "../b2b/accounting/domain/ports/debtor-mandate.reader.js";
import { PrismaDebtorMandateReader } from "../b2b/payments/infrastructure/prisma-debtor-mandate.reader.js";

/**
 * Le fil qui relie **le lot de prélèvement aux mandats**.
 *
 * La comptabilité déclare `DebtorMandateReader` — « de qui puis-je débiter, et
 * sur quel compte ? » — et `payments` y répond, parce qu'il possède les deux
 * tables. Le câblage vit ici et pas dans l'un des deux modules : un contexte qui
 * publie un port ne doit pas connaître ceux qui le branchent, sinon la
 * dépendance revient par l'autre bout.
 *
 * `@Global` pour la même raison que les fils du fournil : le consommateur est
 * `accounting`, qui ne peut pas importer le module de `payments` sans se
 * coupler à lui. Le token reste celui de la comptabilité, donc rien de neuf
 * n'est rendu atteignable.
 *
 * ⚠️ **C'est le seul fil du dépôt qui fait sortir des IBAN en clair.** Il existe
 * parce qu'un `pain.008` en porte par construction — on ne peut pas demander à
 * une banque de débiter un compte qu'on lui tairait. Ce qui se tient, c'est que
 * rien d'autre ne les recopie sur le trajet : le CSV de contrôle les masque.
 */
@Global()
@Module({
  providers: [{ provide: DebtorMandateReader, useClass: PrismaDebtorMandateReader }],
  exports: [DebtorMandateReader],
})
export class DebtorMandateModule {}
