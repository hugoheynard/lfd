import { Injectable } from "@nestjs/common";

import { UserStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { GuestBuyerRegistrar, type GuestBuyer } from "../domain/ports/guest-buyer.registrar.js";

/**
 * Inscrit l'invité dans l'annuaire des clients — **sans identité de connexion**.
 *
 * ## Les trois colonnes qui comptent, et pourquoi chacune vaut ce qu'elle vaut
 *
 * - **`auth0Sub` absent, donc `NULL`.** C'est ce qui FAIT l'invité (plan
 *   `plan-commande-sans-compte.md`, D1) : se connecter lui est inexprimable,
 *   plutôt que refusé. Rien à écrire pour ça — c'est l'absence qui porte le
 *   sens.
 * - **`status: active`, et c'est le piège à garder sous les yeux.** D1 l'impose :
 *   pas de quatrième valeur d'énuméré. `invited` dirait l'inverse de la vérité —
 *   « nous l'avons provisionné, il n'a pas encore posé son mot de passe » —
 *   alors qu'il n'a rien à quoi en poser un. On ne déduit donc JAMAIS « peut se
 *   connecter » d'un statut.
 * - **`emailVerified: false`.** Personne ne lui a fait confirmer quoi que ce
 *   soit. Le laisser à faux est ce qui empêchera, plus tard, de lui rattacher
 *   une société sur la seule foi d'une adresse tapée au panier.
 *
 * ## Toujours une ligne neuve
 *
 * Aucune recherche par adresse, et c'est **deux décisions à la fois**. D2 tranche
 * « deux lignes, deux histoires » — cohérent avec l'existant, où `email` n'a
 * aucune unicité. Et retrouver quelqu'un par son e-mail depuis une surface
 * publique serait la voie 3.2 du plan, écartée pour raison de sécurité : ce
 * serait laisser n'importe qui commander sous le compte d'un autre en tapant son
 * adresse.
 *
 * ## Ce que cet adaptateur écrit, et où il vit
 *
 * Il écrit dans `users`, que possède `b2b/account`. Le contexte `orders` y lit
 * déjà par son propre port étroit — `PrismaOrderRecipientReader` fait exactement
 * cela pour trouver le destinataire d'un courriel (vérifié le 2026-09-17) : même
 * bloc, port déclaré ici, adaptateur ici. C'est le voisinage qu'on suit.
 */
@Injectable()
export class PrismaGuestBuyerRegistrar extends GuestBuyerRegistrar {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async register(buyer: GuestBuyer): Promise<string> {
    const created = await this.prisma.user.create({
      data: {
        email: buyer.email,
        firstName: buyer.firstName,
        // Un visiteur ne donne pas son nom de famille : la boutique en demande
        // trois, et le nom n'en fait pas partie. Vide, comme partout ailleurs
        // dans ce schéma pour une absence.
        lastName: "",
        phone: buyer.phone,
        status: UserStatus.active,
        emailVerified: false,
      },
      select: { id: true },
    });
    return created.id;
  }
}
