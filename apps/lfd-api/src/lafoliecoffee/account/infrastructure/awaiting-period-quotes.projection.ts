import type { PrismaService } from "../../../platform/database/prisma.service.js";

/** La valeur de `period_quote.state` d'une version qui attend son engagement. */
const AWAITING = "awaiting";

/**
 * **Depuis quand chaque payeur a un devis de période en attente**, parmi
 * `payerIds` : le rangement de la plus ancienne version `awaiting`. Une
 * lecture pour tout le lot, jamais une par société : la galerie et le
 * compteur du menu parcourent tout le portefeuille.
 *
 * La date est celle du rangement de la version courante : le devis ne range
 * pas sa date d'envoi, et c'est le rangement qui déclenche l'envoi
 * automatique. Le comptage des jours est la règle du domaine
 * (`companyWarnings`), pas celle de la requête.
 */
export async function awaitingQuotesSinceAmong(
  prisma: PrismaService,
  payerIds: readonly string[],
): Promise<ReadonlyMap<string, Date>> {
  if (payerIds.length === 0) {
    return new Map();
  }
  const rows = await prisma.periodQuote.groupBy({
    by: ["payerCompanyId"],
    where: { state: AWAITING, payerCompanyId: { in: [...new Set(payerIds)] } },
    _min: { createdAt: true },
  });
  const since = new Map<string, Date>();
  for (const row of rows) {
    if (row._min.createdAt !== null) {
      since.set(row.payerCompanyId, row._min.createdAt);
    }
  }
  return since;
}
