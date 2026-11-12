/**
 * **L'acteur d'une intention de la boutique** : le client résolu en base,
 * préfixé par sa nature (`documentation/ops/l-idempotence-des-ecritures.md`,
 * § 7). Le registre des intentions est partagé avec le staff, et une clé ne
 * se partage pas entre deux personnes : le préfixe empêche qu'un identifiant
 * de client et une fiche du staff se confondent.
 *
 * Jamais le `sub` du fournisseur d'identité, jamais une adresse : l'identifiant
 * de NOTRE base, celui que le `Principal` porte.
 */
export function customerIntentActor(userId: string): string {
  return `${CUSTOMER_ACTOR_PREFIX}${userId}`;
}

const CUSTOMER_ACTOR_PREFIX = "customer:";

/**
 * **L'acteur d'une intention d'un visiteur** (formulaire public « Nous
 * écrire ») : un littéral, faute de personne résolue en base. La clé est un
 * UUID que la page fabrique, unique en pratique ; le préfixe distinct garde
 * l'espace des visiteurs à part de celui des clients et du staff. Une clé
 * rejouée par un autre visiteur sur un autre contenu est refusée (le sujet
 * porte l'empreinte du contenu), jamais rendue.
 */
export const VISITOR_INTENT_ACTOR = "visitor:public";
