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
 * ## Un invité qui revient est RETROUVÉ, jamais recréé (D8, 2026-09-17)
 *
 * ⚠️ Cet adaptateur créait une ligne neuve à chaque commande. Trois conséquences,
 * dont deux que le plan n'avait pas vues : l'historique d'un client fidèle se
 * dispersait, la croissance le comptait comme **N acheteurs distincts**
 * (`on-order-placed.handler` journalise `subjectId: placedByUserId`, et
 * `prisma-order-metrics.reader` agrège sur `user:<id>`), et D6 ne pouvait plus
 * le rattacher à une société — « à défaut, un invité unique » ne tranche pas
 * entre trois.
 *
 * 🔴 **Ce qu'on réutilise est un invité, JAMAIS un compte connectable.** C'est
 * toute la différence avec la voie 3.2, écartée pour raison de sécurité : elle
 * réutilisait une identité **Auth0**, donc elle donnait littéralement le compte
 * d'un autre à qui tapait son adresse. Ici, la ligne retrouvée n'a aucun
 * `auth0Sub` — se connecter dessus est inexprimable, et la réutiliser n'ouvre
 * d'accès à personne.
 *
 * Reste le cas de l'adresse tapée par quelqu'un d'autre : il n'est pas nié, il
 * est traité ailleurs et par le seul canal qui ne fuit pas — D7 prévient **par
 * courriel**, sans qu'aucune route publique ne dise jamais si un compte existe.
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
    const known = await this.guestFor(buyer.email);
    if (known !== null) {
      return known;
    }
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

  /**
   * L'invité **déjà inscrit** sous cette adresse, ou `null`.
   *
   * 🔴 `auth0Sub: null` est la condition qui rend ce geste sûr, et elle n'est
   * pas négociable : on ne retrouve JAMAIS un compte connectable par son
   * adresse depuis une surface publique (plan §3.2). La ligne rendue ici n'a
   * aucune identité de connexion — la réutiliser n'ouvre d'accès à personne.
   *
   * ⚠️ **Le filtre est refait en mémoire**, et ce n'est pas une ceinture de
   * plus : `mode: "insensitive"` compile en `ILIKE` **sans échapper** `_` ni
   * `%` (constaté le 2026-09-14, Prisma 7.8), et `jean_dupont@x.fr` y trouvait
   * `jeanXdupont@x.fr` — la boîte de quelqu'un d'autre. C'est la même
   * précaution que `findAccountByEmail`, pour la même raison.
   *
   * Le **plus ancien** fait foi quand plusieurs existent : ce sont les lignes
   * créées avant cette règle, et c'est celle-là qui porte le plus d'histoire.
   */
  private async guestFor(email: string): Promise<string | null> {
    const candidates = await this.prisma.user.findMany({
      where: { auth0Sub: null, email: { equals: email, mode: "insensitive" } },
      select: { id: true, email: true },
      orderBy: { createdAt: "asc" },
    });
    const target = normalizeEmail(email);
    return candidates.find((user) => normalizeEmail(user.email) === target)?.id ?? null;
  }
}

/**
 * Forme de comparaison d'une adresse : la casse et les blancs ne font pas une
 * autre boîte.
 *
 * ⚠️ Recopiée de `b2b/account/infrastructure/prisma-company-member.repository.ts`
 * plutôt qu'importée : elle y est privée, et la faire traverser deux
 * infrastructures de contextes différents coûterait plus cher que ces trois
 * mots. Si une troisième copie apparaît, c'est qu'il faut la faire remonter.
 */
function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
