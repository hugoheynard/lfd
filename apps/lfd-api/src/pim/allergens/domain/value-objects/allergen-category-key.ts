import { AllergenCategoryKeyInvalidError } from "../errors/allergen-errors.js";

/**
 * Minuscules, chiffres, **tirets ou soulignés**.
 *
 * ⚠️ Ce n'est pas tout à fait le `cleanKey` d'`ingredients`, qui n'accepte que
 * le tiret. Les clés officielles sont semées avec des soulignés (`tree_nuts`,
 * `non_eu`) parce qu'elles reprennent les valeurs de l'union `IncoCategory`, et
 * elles sont **inaltérables** : une forme qui les refuserait ferait échouer la
 * relecture des lignes que la migration a écrites. Le plan donne d'ailleurs les
 * deux graphies en exemple — « tree_nuts », « fruits-coque-exotiques ».
 */
const KEY_SHAPE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/u;

/** Une clé plus longue est un libellé déguisé. */
const MAX_LENGTH = 48;

/**
 * **La clé d'une catégorie d'allergène** — son identité stable.
 *
 * Distincte de l'identifiant technique : c'est elle qu'un écran, un export ou
 * une migration future citent, et c'est pour ça qu'elle a une forme plutôt
 * qu'une liberté totale.
 */
export class AllergenCategoryKey {
  private constructor(readonly value: string) {}

  /** @throws {AllergenCategoryKeyInvalidError} la forme n'est pas celle d'une identité. */
  static create(raw: string): AllergenCategoryKey {
    const key = raw.trim();
    if (key.length > MAX_LENGTH || !KEY_SHAPE.test(key)) {
      throw new AllergenCategoryKeyInvalidError(raw);
    }
    return new AllergenCategoryKey(key);
  }

  equals(other: AllergenCategoryKey): boolean {
    return this.value === other.value;
  }
}
