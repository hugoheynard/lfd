import type { PickupDiscountAudiences } from '@lfd/contracts';

/**
 * La clientèle d'une remise, telle que la carte d'un point la dit : « · B2B »,
 * « · B2C », ou rien quand elle vise les deux.
 *
 * Rien pour les deux, parce que c'est l'existant : toute requête recevait la
 * remise avant que la clientèle existe, et écrire « · B2B · B2C » sur chaque
 * point ferait lire une restriction là où il n'y en a aucune.
 *
 * ⚠️ Une remise qui ne vise AUCUNE clientèle ne s'enregistre pas (le serveur la
 * refuse, D2 du plan). Ce cas ne rend donc rien ici plutôt qu'une mention
 * inventée pour un état que la base ne peut pas porter.
 */
export function discountAudienceSuffix(audiences: PickupDiscountAudiences): string {
  if (audiences.b2b && !audiences.b2c) {
    return ' · B2B';
  }
  if (audiences.b2c && !audiences.b2b) {
    return ' · B2C';
  }
  return '';
}
