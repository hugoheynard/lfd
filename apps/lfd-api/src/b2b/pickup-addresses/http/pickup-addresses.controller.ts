import {
  audienceOf,
  type CustomerAudience,
  type PickupAddressView,
  type PublicPickupSlot,
} from "@lfd/contracts";
import { Controller, Get, Param, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { ListPickupAddressesQuery } from "../application/list-pickup-addresses.query.js";
import { ListPublicPickupSlotsQuery } from "../application/list-public-pickup-slots.query.js";

/**
 * Le jour demandé, `AAAA-MM-JJ`. Validé À LA PORTE : passé plus loin, un format
 * libre traverserait jusqu'à la dérivation, qui rendrait une liste vide — un
 * écran lirait « aucun créneau » là où la faute est dans l'appel.
 */
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "jour attendu au format AAAA-MM-JJ");

/** Une route anonyme ne connaît personne : c'est la clientèle d'un visiteur. */
const VISITOR_AUDIENCE = audienceOf(null);

/** La clientèle pro, telle que `audienceOf` la nomme pour une société active. */
const PRO_AUDIENCE: CustomerAudience = "b2b";

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
   * Exposer la liste pro à un anonyme est acceptable : c'est la même vue que
   * la liste particulier (adresse, heures, remise et ses clientèles), sans
   * règle, fermeture ni réglage du back-office ; et la remise reste DÉCIDÉE à
   * la caisse par la société agissante (`audienceOf`) — la lire ici ne donne
   * aucun droit de l'obtenir.
   */
  @Get()
  list(
    @Query("audience", new ZodQuery(listQuerySchema)) audience: "pro" | undefined,
  ): Promise<readonly PickupAddressView[]> {
    return this.queries.execute<ListPickupAddressesQuery, readonly PickupAddressView[]>(
      new ListPickupAddressesQuery(audience === "pro" ? PRO_AUDIENCE : VISITOR_AUDIENCE),
    );
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
