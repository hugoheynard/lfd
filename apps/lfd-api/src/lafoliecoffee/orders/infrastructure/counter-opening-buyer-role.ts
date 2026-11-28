import { CompanyStatus } from "../../../platform/database/client/client.js";
import type { PrismaService } from "../../../platform/database/prisma.service.js";
import type { OrderRole } from "../domain/ports/order-guard.reader.js";

/** Le plus étroit des rôles qui commandent. */
const COUNTER_BUYER_ROLE: OrderRole = "orders";

/**
 * Le rôle que porte l'équipe à **l'acheteur d'un compte ouvert au comptoir**
 * (`plan-comptes-du-comptoir.md`, § 3.1) : la fiche invité nommée par la
 * trace d'ouverture, tant que la société est `counter_opened` — rien après
 * la conversion, rien pour une autre personne, rien pour une autre société.
 *
 * `orders`, le plus étroit des rôles qui commandent : il désigne le porteur
 * d'une commande saisie par l'équipe, il n'ouvre aucun accès — la fiche n'a
 * aucun rattachement (`memberships`), et le chemin du client lit
 * `readCompanyStanding`, qui l'ignore.
 */
export async function counterOpeningBuyerRole(
  prisma: PrismaService,
  userId: string,
  companyId: string,
): Promise<OrderRole | null> {
  const opening = await prisma.counterOpeningAttestation.findFirst({
    where: { companyId, buyerUserId: userId },
    select: { companyId: true },
  });
  if (opening === null) {
    return null;
  }
  const company = await prisma.company.findFirst({
    where: { id: companyId, status: CompanyStatus.counter_opened },
    select: { id: true },
  });
  return company === null ? null : COUNTER_BUYER_ROLE;
}
