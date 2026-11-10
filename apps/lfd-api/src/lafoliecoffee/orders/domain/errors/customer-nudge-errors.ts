import { instantToLocal } from "@lfd/contracts";

import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/** « 14:30 » à Paris : l'heure que lit le superviseur. */
function parisTimeOf(at: Date): string {
  return instantToLocal(at).time;
}

/**
 * **« Rappel au client » déjà envoyé pour cette commande** — un seul par
 * commande (Hugo, 2026-10-25). `BusinessError` (409) : la demande est bien
 * formée, c'est la trace qui s'y oppose.
 */
export class PickupReminderAlreadySentError extends BusinessError {
  constructor(readonly reference: string) {
    super(
      "orders.pickup_reminder.already_sent",
      `Le rappel a déjà été envoyé au client pour la commande ${reference} : il ne part qu'une fois. Si le client ne vient toujours pas, appelez-le.`,
    );
  }
}

/** **« Avertir le client » déjà fait pour cette commande** — une fois par commande. */
export class DelayWarningAlreadySentError extends BusinessError {
  constructor(readonly reference: string) {
    super(
      "orders.delay_warning.already_sent",
      `Le client a déjà été averti du retard de la commande ${reference} : l'avertissement ne part qu'une fois. Il recevra le courriel « prête » dès que la commande sera déclarée prête.`,
    );
  }
}

/** **Trop tôt pour le rappel** : le délai réglé après la fin du créneau n'est pas écoulé. */
export class PickupReminderTooEarlyError extends BusinessError {
  constructor(
    readonly reference: string,
    readonly availableAt: Date,
  ) {
    super(
      "orders.pickup_reminder.too_early",
      `Le rappel de la commande ${reference} se propose à partir de ${parisTimeOf(availableAt)}, selon le délai réglé après la fin du créneau (Réglages › Commandes › Heure limite). Réessayez à cette heure.`,
    );
  }
}

/** **Trop tôt pour avertir** : le délai réglé après la fin du créneau n'est pas écoulé. */
export class DelayWarningTooEarlyError extends BusinessError {
  constructor(
    readonly reference: string,
    readonly availableAt: Date,
  ) {
    super(
      "orders.delay_warning.too_early",
      `L'avertissement de retard de la commande ${reference} se propose à partir de ${parisTimeOf(availableAt)}, selon le délai réglé après la fin du créneau (Réglages › Commandes › Heure limite). Réessayez à cette heure.`,
    );
  }
}

/**
 * **« Avertir le client » est refusé** — et la phrase dit pourquoi. Même
 * forme que `ReminderRefusedError`, son pendant pour le rappel.
 */
export class DelayWarningRefusedError extends BusinessError {
  constructor(reason: string) {
    super("orders.delay_warning.refused", reason);
  }
}
