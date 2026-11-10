/**
 * **Le canal que le retrait publie POUR le colisage** (2026-11-03, Hugo,
 * option b — `documentation/commandes/reliquat/depart-incomplet.md`, §7).
 *
 * | Pièce                  | Nature       | Ce qu'elle porte                           |
 * | ---------------------- | ------------ | ------------------------------------------ |
 * | `OrderHandedOverEvent` | fait durable | un envoi remis — au comptoir ou à la porte |
 *
 * Le même fait que celui que lit le commerce (`../commerce/`), republié ici
 * plutôt que dupliqué : une classe, un contrat, deux lecteurs. Le colisage s'y
 * abonne pour sortir de sa liste la fiche d'un envoi remis sans avoir été
 * colisé — sans quoi fermer le bac ensuite partait en message mort.
 *
 * `lint:context-boundaries` n'autorise `packing → handover` que par ce
 * dossier, et `handover → packing` jamais : le retrait publie, il ne sait pas
 * qui écoute.
 */
export {
  HANDOVER_HANDED_OVER,
  OrderHandedOverEvent,
  OrderHandedOverPayloadError,
} from "../commerce/order-handed-over.event.js";
