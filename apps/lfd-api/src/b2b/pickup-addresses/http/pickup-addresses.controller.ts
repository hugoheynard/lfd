import type { PickupAddressView, PublicPickupSlot } from "@lfd/contracts";
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

/**
 * Lecture **publique** des points de retrait — le client (checkout) comme l'admin
 * en ont besoin. Non sensible. L'écriture est staff ({@link AdminPickupAddressesController}).
 *
 * Surface anonyme ⇒ throttle resserré (60/min/IP) sous le défaut global : c'est
 * la partie la plus exposée de l'API (aucune auth en amont).
 */
@Controller("pickup-addresses")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class PickupAddressesController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  list(): Promise<readonly PickupAddressView[]> {
    return this.queries.execute<ListPickupAddressesQuery, readonly PickupAddressView[]>(
      new ListPickupAddressesQuery(),
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
