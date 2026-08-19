import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { SlotsView } from "@lfd/contracts";

import { Clock } from "../../../../platform/time/clock.js";
import { slotsFor } from "../../domain/availability.js";
import { localToInstant } from "../../domain/paris-time.js";
import { AppointmentRepository } from "../../domain/ports/appointment.repository.js";
import { AvailabilityStore } from "../../domain/ports/availability.store.js";
import { GetSlotsQuery } from "./get-slots.query.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Les créneaux réservables d'une fenêtre — la **même** fonction que celle qui
 * revalide à la réservation et que celle qui alimente l'aperçu admin. Une seule
 * vérité, donc pas de créneau proposé qui serait ensuite refusé.
 */
@QueryHandler(GetSlotsQuery)
export class GetSlotsHandler implements IQueryHandler<GetSlotsQuery, SlotsView> {
  constructor(
    private readonly availability: AvailabilityStore,
    private readonly appointments: AppointmentRepository,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetSlotsQuery): Promise<SlotsView> {
    const config = await this.availability.load();
    // Fenêtre de lecture élargie d'un jour de chaque côté : un rendez-vous qui
    // déborde d'une frontière de journée occupe quand même des créneaux visibles.
    const from = localToInstant(query.from, "00:00") ?? this.clock.now();
    const to = localToInstant(query.to, "00:00") ?? this.clock.now();
    const taken = await this.appointments.bookedBetween(
      new Date(from.getTime() - DAY_MS),
      new Date(to.getTime() + DAY_MS),
    );
    const slots = slotsFor({ from: query.from, to: query.to }, config, taken, this.clock.now());
    return { slots, channels: config.policy.channels, slotMinutes: config.policy.slotMinutes };
  }
}
