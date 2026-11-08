import type { MailBrandCode } from "../../../requests/domain/value-objects/mail-brand.js";

/**
 * **Les espaces du groupe qui envoient du marketing** (plan de
 * désinscription, règle 19) : aujourd'hui AUCUN — `lfd` est l'espace de
 * l'équipe et n'en sera jamais, et `lfc` n'a encore aucun modèle marketing.
 *
 * ⚠️ Le plan les veut « déclarés dans la configuration des espaces » ; cette
 * configuration n'existe pas (lu le 2026-11-08 : `MAIL_SPACES` ne porte que
 * des codes). La liste vit donc ici, et se déplacera avec elle.
 */
export const MARKETING_SPACES: readonly MailBrandCode[] = [];

/** Le seuil de la règle 19 : « partenaires » n'existe qu'à partir de deux espaces marketing. */
const GROUP_MINIMUM = 2;

/**
 * Faut-il proposer « Ne plus rien recevoir du groupe » ? La réponse ne
 * dépend que de la configuration, jamais du jeton : la page reste la même
 * pour tous (pas d'oracle). Le mécanisme est bâti, éteint.
 */
export function groupIsOffered(spaces: readonly MailBrandCode[] = MARKETING_SPACES): boolean {
  return spaces.length >= GROUP_MINIMUM;
}

/**
 * Le groupe tel qu'un service le lit : la liste injectée plutôt que lue en
 * dur, pour qu'un test allume « partenaires » sans toucher la configuration.
 */
export class MarketingGroup {
  constructor(readonly spaces: readonly MailBrandCode[] = MARKETING_SPACES) {}

  isOffered(): boolean {
    return groupIsOffered(this.spaces);
  }

  /** Les AUTRES sociétés du groupe, vues de `from`. */
  partnersOf(from: MailBrandCode): readonly MailBrandCode[] {
    return this.spaces.filter((space) => space !== from);
  }
}
