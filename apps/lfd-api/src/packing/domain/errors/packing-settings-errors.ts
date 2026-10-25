import { BusinessError } from "../../../platform/shared/errors/app-error.js";

/**
 * Le geste « Partager une moitié » est fermé dans Réglages › Colisage (fermé
 * par défaut, Hugo, 2026-10-25). Le poste ne montre plus le bouton : ce refus
 * ne se lit que sur un poste resté ouvert pendant qu'on fermait le réglage.
 */
export class HalfSharingDisabledError extends BusinessError {
  constructor() {
    super(
      "packing.half_sharing.disabled",
      "Le partage d'une moitié de bac est désactivé dans Réglages › Colisage. Rechargez le poste et déclarez un bac à la commande, ou demandez à qui règle la livraison de l'activer.",
    );
  }
}
