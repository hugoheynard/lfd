import { InvalidIbanError } from "../errors/accounting-errors.js";

/** Bornes de la norme ISO 13616 : le plus court connu fait 15, le plus long 34. */
export const IBAN_MIN_LENGTH = 15;
export const IBAN_MAX_LENGTH = 34;

/** Décalage des lettres dans le calcul mod-97 : `A` vaut 10, `Z` vaut 35. */
const LETTER_OFFSET = 55;

/**
 * **IBAN** — un compte bancaire, normalisé et vérifié par sa clé.
 *
 * Le contrôle **mod-97** (ISO 7064) n'est pas cosmétique : c'est lui qui attrape
 * l'IBAN mal recopié depuis un RIB scanné, avant qu'un lot de prélèvement parte
 * avec une ligne que la banque rejettera cinq jours plus tard. Une lettre
 * transposée, et le reste ne vaut plus 1.
 *
 * Le value object vit dans `accounting` parce que le premier compte du système
 * est celui **du créancier** — le nôtre, celui où l'argent arrive. Le contexte
 * `payments` le réutilisera pour le compte du débiteur : c'est la même règle de
 * forme, et la dupliquer ferait deux vérités sur ce qu'est un IBAN valide.
 *
 * ⚠️ Cette classe valide et normalise. Elle ne dit **rien** de la protection de
 * la valeur : un IBAN de débiteur ne se stocke pas en clair et ne ressort jamais
 * d'une API de lecture (cf. `architecture-prelevement-sepa-direct.md` §4).
 */
export class Iban {
  private constructor(readonly value: string) {}

  static create(raw: string): Iban {
    const normalized = raw.replace(/[\s-]/gu, "").toUpperCase();

    if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/u.test(normalized)) {
      throw new InvalidIbanError(
        raw,
        "attendu : deux lettres de pays, deux chiffres de clé, puis le compte",
      );
    }
    if (normalized.length < IBAN_MIN_LENGTH || normalized.length > IBAN_MAX_LENGTH) {
      throw new InvalidIbanError(
        raw,
        `longueur hors bornes (${normalized.length} caractères, attendu ${IBAN_MIN_LENGTH} à ${IBAN_MAX_LENGTH})`,
      );
    }
    if (mod97(normalized) !== 1) {
      throw new InvalidIbanError(raw, "clé de contrôle invalide (vérifiez la saisie)");
    }

    return new Iban(normalized);
  }

  /** Le pays du compte, en ISO 3166-1 alpha-2. */
  countryCode(): string {
    return this.value.slice(0, 2);
  }

  /**
   * Les quatre derniers caractères — de quoi **reconnaître** un compte à
   * l'écran, jamais de quoi le débiter.
   */
  last4(): string {
    return this.value.slice(-4);
  }

  /** `FR14 2004 1010 0505 0001 3M02 606` — pour l'œil, jamais pour un index. */
  formatted(): string {
    return (this.value.match(/.{1,4}/gu) ?? []).join(" ");
  }

  /** `••••••••2606` — la seule forme qui a le droit d'atteindre un écran. */
  masked(): string {
    return `${"•".repeat(8)}${this.last4()}`;
  }

  toString(): string {
    return this.value;
  }
}

/**
 * ISO 7064 mod-97-10 : les quatre premiers caractères passent à la fin, chaque
 * lettre devient son rang + 9, et le nombre obtenu doit valoir 1 modulo 97.
 *
 * Le reste est calculé **par tranches** plutôt que sur un entier : un IBAN de 34
 * caractères dépasse largement `Number.MAX_SAFE_INTEGER`, et le faire passer par
 * un `Number` rendrait des clés fausses sur les comptes les plus longs — un bug
 * qui ne se voit qu'à l'étranger.
 */
function mod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const character of rearranged) {
    const chunk = /[A-Z]/u.test(character)
      ? String(character.charCodeAt(0) - LETTER_OFFSET)
      : character;
    remainder = Number(`${remainder}${chunk}`) % 97;
  }
  return remainder;
}
