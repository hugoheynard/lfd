import type { DayVersionView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { CommerceDayVersionReader } from "../../channels/commerce/index.js";
import { InvalidServiceDayError } from "../../domain/errors/delivery-round-errors.js";
import { DeliveryDayVersionReader } from "../../domain/ports/delivery-day-version.reader.js";
import { isCalendarDay } from "../../domain/value-objects/service-day.js";
import { GetMyRoundVersionQuery } from "./get-my-round-version.query.js";

/**
 * **« Ma tournée » a-t-elle bougé ?** (`parcours-du-livreur.md`, PL4) — la
 * page du livreur doit suivre le coliseur : un bac déclaré (journal de la
 * livraison) ou une commande prête (journal du COMMERCE, lu par son port).
 *
 * 🔴 **La version est la SOMME des deux numéros.** Chacun est le `max(id)` d'un
 * journal pour ce jour : il ne décroît jamais tant que le jour n'est pas
 * balayé (sept jours). La somme de deux suites croissantes bouge dès que l'une
 * bouge, et garde le contrat `DayVersionView` que les écrans savent déjà
 * suivre. Opaque : elle se compare par égalité, elle ne compte rien.
 *
 * Ni le livreur ni sa tournée n'y entrent : un numéro de journée ne dit rien
 * d'une tournée, et la page relit sous son mur quand il change. Deux lectures.
 *
 * @throws {InvalidServiceDayError} le jour n'existe pas au calendrier.
 */
@QueryHandler(GetMyRoundVersionQuery)
export class GetMyRoundVersionHandler implements IQueryHandler<
  GetMyRoundVersionQuery,
  DayVersionView
> {
  constructor(
    private readonly delivery: DeliveryDayVersionReader,
    private readonly commerce: CommerceDayVersionReader,
  ) {}

  async execute(query: GetMyRoundVersionQuery): Promise<DayVersionView> {
    if (!isCalendarDay(query.serviceDay)) {
      throw new InvalidServiceDayError(query.serviceDay);
    }
    const [delivery, commerce] = await Promise.all([
      this.delivery.versionOf(query.serviceDay),
      this.commerce.versionOf(query.serviceDay),
    ]);
    return { date: query.serviceDay, version: delivery + commerce };
  }
}
