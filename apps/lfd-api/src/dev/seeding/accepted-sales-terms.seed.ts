import { audienceOf, type AcceptedSalesTerms } from "@lfd/contracts";

import { SALES_TERMS_ROW_KEYS } from "../../b2b/content/infrastructure/legal-document-file.mapper.js";
import { salesTermsOf } from "../../b2b/orders/domain/services/sales-terms-of.js";
import type { PrismaClient } from "../../platform/database/client/client.js";

/**
 * **Ce que le client du semis coche au panier** (case des CGV, 2026-10-26) :
 * la révision en vigueur pour l'audience de la commande, comme la vitrine la
 * lui aurait montrée — ou `null` si aucun texte n'est rédigé.
 *
 * Le semis passe par le VRAI handler, qui refuse une version périmée : il
 * coche donc ce qui s'applique, lu en base au moment de semer.
 */
export async function acceptedSalesTermsFor(
  prisma: PrismaClient,
  companyId: string | null,
): Promise<AcceptedSalesTerms | null> {
  const company =
    companyId === null
      ? null
      : await prisma.company.findUnique({ where: { id: companyId }, select: { status: true } });
  const key = salesTermsOf(audienceOf(company?.status ?? null));
  const text = await prisma.platformContent.findUnique({
    where: { key: SALES_TERMS_ROW_KEYS[key] },
    select: { revision: true },
  });
  return text === null ? null : { key, revision: text.revision };
}
