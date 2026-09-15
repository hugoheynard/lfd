/**
 * **À qui s'applique par défaut la remise d'un point de retrait**, sans zod.
 *
 * ⚠️ Séparé de `pickup.ts` pour une raison de POIDS : la boutique lit ce défaut
 * dès le démarrage (le magasin des points de service), et le prendre au baril
 * embarquait zod dans son bundle initial (déploiement de la boutique échoué le
 * 2026-09-15 sur le budget `cloudflare`). `pickup.ts` le réexporte, et son
 * schéma reste l'autorité sur la forme.
 */

/** Les deux clientèles d'une remise — même forme que `pickupDiscountAudiencesSchema`. */
export interface DiscountAudiences {
  b2b: boolean;
  b2c: boolean;
}

/** Une remise sans clientèle déclarée vaut pour les deux : l'existant. */
export const ALL_DISCOUNT_AUDIENCES: DiscountAudiences = { b2b: true, b2c: true };
