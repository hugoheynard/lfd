import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  GuestOrderNoticeReader,
  type GuestOrderNotice,
} from "../domain/ports/guest-order-notice.reader.js";

/**
 * Lit, dans l'annuaire des clients, s'il y a quelqu'un à prévenir — plan
 * `documentation/order/plan-commande-sans-compte.md`, D7.
 *
 * Il écrit dans `users`, que possède `b2b/account`, et le lit par un port
 * étroit déclaré ici : c'est le voisinage que `PrismaOrderRecipientReader` suit
 * déjà pour trouver le destinataire d'un courriel (vérifié le 2026-09-17).
 */
@Injectable()
export class PrismaGuestOrderNoticeReader extends GuestOrderNoticeReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async noticeFor(placedByUserId: string): Promise<GuestOrderNotice | null> {
    const buyer = await this.prisma.user.findUnique({
      where: { id: placedByUserId },
      select: { email: true, auth0Sub: true },
    });
    // Le porteur n'est pas un invité : la commande vient d'un compte, qui est
    // son propre destinataire. Il n'y a personne d'autre à prévenir, et écrire
    // à quelqu'un qu'il a commandé lui-même serait du bruit.
    if (buyer === null || buyer.auth0Sub !== null) {
      return null;
    }

    const target = normalizeEmail(buyer.email);
    const owners = await this.prisma.user.findMany({
      // `not: null` — on ne cherche QUE des comptes connectables. Un second
      // invité sous la même adresse n'est pas un propriétaire à prévenir : c'est
      // une ligne d'avant D8, et lui écrire n'apprendrait rien à personne.
      where: { auth0Sub: { not: null }, email: { equals: buyer.email, mode: "insensitive" } },
      select: { email: true, firstName: true },
      // Le plus ancien : celui qui porte le plus d'histoire sous cette adresse.
      orderBy: { createdAt: "asc" },
    });
    // ⚠️ Le filtre est refait en mémoire : `mode: "insensitive"` compile en
    // `ILIKE` **sans échapper** `_` ni `%` (constaté le 2026-09-14, Prisma 7.8),
    // et `jean_dupont@x.fr` y trouvait `jeanXdupont@x.fr` — la boîte de
    // quelqu'un d'autre. Prévenir la mauvaise personne serait exactement la
    // fuite que D7 existe pour éviter.
    const owner = owners.find((user) => normalizeEmail(user.email) === target);
    return owner === undefined ? null : { email: owner.email, firstName: owner.firstName };
  }
}

/**
 * Forme de comparaison d'une adresse : la casse et les blancs ne font pas une
 * autre boîte.
 *
 * ⚠️ Troisième copie de ces trois mots dans le dépôt (avec
 * `prisma-company-member.repository.ts` et `prisma-guest-buyer.registrar.ts`).
 * C'est le seuil que le deuxième s'était fixé : **il faut la faire remonter**,
 * et ce n'est pas le travail de ce lot — écrit ici plutôt que taire.
 */
function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
