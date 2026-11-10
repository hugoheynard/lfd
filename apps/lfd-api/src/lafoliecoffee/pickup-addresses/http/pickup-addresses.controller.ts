import type { AudiencePickupAddressView, PublicPickupSlot } from "@lfd/contracts";
import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { z } from "zod";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { ListShopPickupsQuery } from "../application/list-shop-pickups.query.js";
import { ListPublicPickupSlotsQuery } from "../application/list-public-pickup-slots.query.js";
import { cachePublicPickups } from "./public-pickup-cache-headers.js";

/**
 * Le jour demandé, `AAAA-MM-JJ`. Validé À LA PORTE : passé plus loin, un format
 * libre traverserait jusqu'à la dérivation, qui rendrait une liste vide — un
 * écran lirait « aucun créneau » là où la faute est dans l'appel.
 */
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "jour attendu au format AAAA-MM-JJ");

/**
 * `?audience=pro` — la SEULE valeur admise. Absent = la clientèle d'un visiteur
 * (le comportement d'avant). Toute autre valeur est refusée (400) plutôt que
 * ramenée au particulier : une faute de frappe ne doit pas afficher en
 * silence les points d'une autre clientèle.
 */
const listQuerySchema = z.enum(["pro"]).optional();

/**
 * Lecture **publique** des points de retrait — ceux d'un **visiteur**, donc
 * ouverts aux particuliers (Hugo, 2026-10-15 : la liste est filtrée au
 * serveur). Un client reconnu lit les siens par `GET /pickup-addresses/mine`,
 * l'équipe par `GET /admin/pickup-addresses`. L'écriture est staff
 * ({@link AdminPickupAddressesController}).
 *
 * Surface anonyme ⇒ throttle resserré (60/min/IP) sous le défaut global : c'est
 * la partie la plus exposée de l'API (aucune auth en amont).
 */
@Controller("pickup-addresses")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class PickupAddressesController {
  constructor(private readonly queries: QueryBus) {}

  /**
   * Sans paramètre : les points du visiteur particulier. Avec `?audience=pro` :
   * les points ouverts aux pros (Hugo, 2026-10-19 — la landing pro publique
   * affiche « je retire au Labo, −x % » à qui n'a pas encore de compte).
   *
   * **Une seule part par appel** (Hugo, 2026-10-31 : « chaque audience n'a le
   * droit qu'à son information ») : chaque point porte la remise de
   * l'audience DÉCLARÉE et elle seule — celle des particuliers, ou celle
   * d'une société active pour la vitrine pro, publique par choix. La vue
   * servie n'a aucun champ par clientèle (`AudiencePickupAddressView`).
   *
   * ⚠️ Jusqu'au 2026-10-31, ce JSDoc tenait pour acceptable de servir ici les
   * trois remises (`b2b`, `b2bPending`, `b2c`, une par acheteur type d'
   * `announcedFor`) à n'importe quel anonyme : un visiteur recevait celle des
   * pros et celle des pros en cours d'inscription. Cette dernière ne sort plus
   * que par `GET /pickup-addresses/mine`, à une société réellement en attente :
   * une audience qui se déclare ne s'établit pas.
   *
   * **Gardée par Workers Cache** (2026-11-05) : `public, max-age=30`, sans
   * `stale-while-revalidate`, étiquetée `reglages-publics` et purgée après
   * chaque écriture d'un point, de ses rôles ou d'une promotion. Une adresse
   * de cache par audience : `?audience=` n'admet que `pro`, le reste est un 400.
   */
  @Get()
  async list(
    @Query("audience", new ZodQuery(listQuerySchema)) audience: "pro" | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<readonly AudiencePickupAddressView[]> {
    const points = await this.queries.execute<
      ListShopPickupsQuery,
      readonly AudiencePickupAddressView[]
    >(new ListShopPickupsQuery(audience === "pro" ? "pro" : "visitor"));
    cachePublicPickups(response);
    return points;
  }

  /**
   * **Les créneaux de retrait public d'un point, pour une journée.**
   *
   * Publique comme la liste elle-même, et pour la même raison : on choisit son
   * heure avant d'avoir un compte. Ce qui sort d'ici, ce sont des HEURES — pas
   * les règles ni les fermetures du point, qui ne regardent que le
   * back-office.
   *
   * Les créneaux sont dérivés à chaque appel, contre l'horloge de la maison :
   * une heure déjà commencée n'est plus offerte, et cette comparaison ne peut
   * pas dépendre du navigateur de qui demande.
   *
   * ⚠️ Le chemin et le paramètre sont en FRANÇAIS, comme sa route sœur
   * `/admin/pickup-addresses/:id/creneaux-publics` et comme la file du retrait
   * (`@Query("jour")`). Un segment d'URL est une valeur de contrat, pas un
   * identifiant : le lexique laisse le choix, l'existant le tranche.
   */
  @Get(":id/creneaux")
  slots(
    @Param("id") id: string,
    @Query("jour", new ZodQuery(daySchema)) day: string,
  ): Promise<readonly PublicPickupSlot[]> {
    return this.queries.execute<ListPublicPickupSlotsQuery, readonly PublicPickupSlot[]>(
      new ListPublicPickupSlotsQuery(id, day),
    );
  }
}
