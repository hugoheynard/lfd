import { UserStatus } from "../../../platform/database/client/client.js";
import type { PrismaService } from "../../../platform/database/prisma.service.js";
import type { ContactSnapshot } from "../domain/value-objects/contact-details.js";

/**
 * **La fiche invité de l'acheteur d'un compte du comptoir** (§ 3.1) : celle
 * qui porte déjà son adresse, sinon une neuve. Toujours une fiche SANS
 * `auth0_sub` — se connecter dessus est inexprimable — et sans rattachement :
 * aucune ligne `memberships` n'est écrite ici.
 *
 * Même règle de réutilisation que l'invité de la boutique
 * (`orders/infrastructure/prisma-guest-buyer.registrar.ts`, lue le
 * 2026-11-28) : la plus ancienne fiche invité de l'adresse, la comparaison
 * refaite en mémoire parce que `mode: "insensitive"` n'échappe ni `_` ni `%`.
 * Une seule fiche par adresse, c'est aussi ce que la reprise par la première
 * connexion (`GuestAccountClaim`) exige pour s'appliquer.
 */
export async function counterBuyerGuestFile(
  prisma: PrismaService,
  contact: ContactSnapshot,
): Promise<string> {
  const target = contact.email.trim().toLowerCase();
  const candidates = await prisma.user.findMany({
    where: { auth0Sub: null, email: { equals: contact.email.trim(), mode: "insensitive" } },
    select: { id: true, email: true },
    orderBy: { createdAt: "asc" },
  });
  const known = candidates.find((user) => user.email.trim().toLowerCase() === target);
  if (known !== undefined) {
    return known.id;
  }
  const created = await prisma.user.create({
    data: {
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      phone: contact.phone,
      // Une fiche invité est `active` : le statut ne dit jamais « peut se
      // connecter », c'est l'absence de `sub` qui le dit.
      status: UserStatus.active,
      // Personne ne lui a fait confirmer son adresse.
      emailVerified: false,
    },
    select: { id: true },
  });
  return created.id;
}
