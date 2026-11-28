import type { CounterCustomerBuyer } from "@lfd/contracts";

import type { PrismaService } from "../../../platform/database/prisma.service.js";

/** Le rôle affiché : le plus étroit de ceux qui commandent. */
const OPENING_BUYER_ROLE = "orders";

/**
 * **L'acheteur d'ouverture** d'un compte du comptoir (§ 3.1), tel que le
 * comptoir le propose : la fiche invité nommée par la trace d'ouverture, ou
 * `null` (trace sans acheteur, fiche introuvable). L'appelant ne la demande
 * que pour une société `counter_opened`.
 */
export async function counterOpeningBuyerOf(
  prisma: PrismaService,
  companyId: string,
): Promise<CounterCustomerBuyer | null> {
  const opening = await prisma.counterOpeningAttestation.findUnique({
    where: { companyId },
    select: { buyerUserId: true },
  });
  if (opening === null || opening.buyerUserId === null) {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: opening.buyerUserId },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  return user === null
    ? null
    : {
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: OPENING_BUYER_ROLE,
      };
}
