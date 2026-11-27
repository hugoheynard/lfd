import type { PlannedLineBlocking } from "../../../../recurring/channels/commerce/index.js";

/**
 * Les refus de la garde de l'acheteur d'une colonne planifiée, dans les mots
 * du planificateur — servis à l'écran par la vérification ET rendus par la
 * passation : l'avertissement et le refus disent la même phrase.
 */
export const PLANNED_BUYER_LEFT: PlannedLineBlocking = {
  cause: "buyer_left",
  reason:
    "La personne qui a préparé cette colonne n'est plus membre de la société : elle ne se commandera pas. Faites-la reprendre par un membre actuel.",
};

export const PLANNED_PUBLIC_PAYER: PlannedLineBlocking = {
  cause: "order_refused",
  reason:
    "Cette société est un payeur public : ses commandes ne se passent pas par le planificateur. Passez-les une à une, avec leur engagement budgétaire.",
};
