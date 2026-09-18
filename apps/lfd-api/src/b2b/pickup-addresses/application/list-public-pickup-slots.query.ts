/**
 * **Les créneaux publics d'un point, pour UNE journée** — ce qu'un visiteur
 * choisit.
 *
 * 🔴 La dérivation se fait ICI, côté serveur, et jamais dans le navigateur.
 * Trois raisons, et la troisième seule suffirait :
 *
 * - `publicPickupSlotsFor` vit dans un module qui importe zod ; l'appeler
 *   depuis la boutique ramènerait les schémas dans son bundle, dont le budget
 *   de déploiement est déjà en avertissement ;
 * - un créneau **déjà commencé** n'est plus offert, et cette comparaison se
 *   fait contre l'horloge de la MAISON. Ce dépôt a déjà payé la leçon sur la
 *   journée de service, que l'écran calculait depuis `new Date()` du client ;
 * - les règles et les fermetures d'un point n'ont aucune raison d'être
 *   publiées : ce qui regarde un visiteur, ce sont les heures où il peut venir.
 */
export class ListPublicPickupSlotsQuery {
  constructor(
    readonly pickupAddressId: string,
    /** Le jour demandé, `AAAA-MM-JJ` en pendule d'Europe/Paris. */
    readonly day: string,
  ) {}
}
