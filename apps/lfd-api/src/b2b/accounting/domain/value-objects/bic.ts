import { InvalidBicError } from "../errors/accounting-errors.js";

/** ISO 9362 : 8 caractères pour un siège, 11 avec le code d'agence. */
export const BIC_SHORT_LENGTH = 8;
export const BIC_FULL_LENGTH = 11;

/** Le code d'agence qui désigne le siège — celui qu'on sous-entend en écrivant 8. */
const HEAD_OFFICE_BRANCH = "XXX";

/**
 * **BIC** — l'identifiant de la banque, au format ISO 9362.
 *
 * Il vit à côté d'{@link Iban} et obéit à une règle de forme, pas à un calcul :
 * il n'y a **aucune clé de contrôle** dans un BIC. Une faute de frappe qui
 * respecte la grammaire passe donc ici et ne se verra qu'au rejet du lot. C'est
 * une limite du format, pas de cette classe — et c'est pour ça que le BIC se
 * saisit une fois, à la lecture d'un RIB, plutôt qu'à chaque opération.
 *
 * ⚠️ **Le BIC n'est PAS un secret**, contrairement à l'IBAN qu'il accompagne.
 * Il désigne un établissement, pas un compte : il figure sur tout virement reçu,
 * et il est publiquement interrogeable. Il a donc le droit d'être rendu par une
 * API de lecture, là où l'IBAN ne ressort jamais.
 *
 * La forme longue est **normalisée à 11** en complétant par `XXX` : « BNPAFRPP »
 * et « BNPAFRPPXXX » désignent le même établissement, et les garder tels quels
 * ferait deux valeurs pour une seule banque — donc deux lignes différentes dans
 * un fichier que la banque compare.
 */
export class Bic {
  private constructor(readonly value: string) {}

  static create(raw: string): Bic {
    const normalized = raw.replace(/[\s-]/gu, "").toUpperCase();

    if (normalized.length !== BIC_SHORT_LENGTH && normalized.length !== BIC_FULL_LENGTH) {
      throw new InvalidBicError(
        raw,
        `longueur invalide (${normalized.length} caractères, attendu ${BIC_SHORT_LENGTH} ou ${BIC_FULL_LENGTH})`,
      );
    }
    // 4 lettres d'établissement, 2 lettres de pays, puis 2 — et 3 — caractères
    // alphanumériques. Les chiffres ne sont admis QUE dans les deux derniers
    // groupes : un pays ou un établissement qui en porte est une saisie fausse.
    if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/u.test(normalized)) {
      throw new InvalidBicError(
        raw,
        "attendu : 4 lettres d'établissement, 2 lettres de pays, puis le code de localité",
      );
    }

    return new Bic(
      normalized.length === BIC_SHORT_LENGTH ? `${normalized}${HEAD_OFFICE_BRANCH}` : normalized,
    );
  }

  /** Le pays de l'établissement, en ISO 3166-1 alpha-2. */
  countryCode(): string {
    return this.value.slice(4, 6);
  }

  /** Vrai si le BIC désigne le siège (`XXX`) plutôt qu'une agence. */
  isHeadOffice(): boolean {
    return this.value.endsWith(HEAD_OFFICE_BRANCH);
  }

  toString(): string {
    return this.value;
  }
}
