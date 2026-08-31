import { AllergenCodeInvalidError } from "../errors/allergen-errors.js";

/**
 * La forme d'un code de stockage — majuscules, chiffres, tirets et soulignés.
 *
 * Les 30 codes officiels sont les codes GS1 T4078 (`UW`, `SH`, `BWD`) : deux ou
 * trois majuscules. La forme les accepte tous sans se limiter à eux, parce
 * qu'un code maison est libre — mais elle reste une forme de CODE, jamais un
 * libellé : ce que le staff saisit ici part tel quel en GDSN et se retrouve
 * dans les déclarations déjà écrites.
 */
const CODE_SHAPE = /^[A-Z0-9]+(?:[-_][A-Z0-9]+)*$/u;

/** Au-delà, ce n'est plus un code : c'est une phrase rangée dans une colonne. */
const MAX_LENGTH = 24;

/**
 * **Le code d'une entrée d'allergène** — l'identité de stockage.
 *
 * Il ne change jamais, officiel ou non (cf. le tableau « ce qui est permanent »
 * du plan) : les déclarations réglementaires déjà enregistrées le citent en
 * clair, et le renommer réécrirait des étiquettes sans que personne ne l'ait
 * décidé.
 *
 * La casse n'est pas normalisée, elle est **exigée**. Remonter `sh` en `SH`
 * silencieusement ferait entrer deux graphies du même code dans les
 * déclarations stockées, dont une que le référentiel ne reconnaîtrait pas.
 *
 * ⚠️ Il porte le nom que `allergen-mapping.ts` donne aujourd'hui à un alias
 * (`type AllergenCode = string`). C'est le même concept ; l'alias disparaît
 * avec la constante au déploiement « resserrer ».
 */
export class AllergenCode {
  private constructor(readonly value: string) {}

  /**
   * Nettoie puis valide — et c'est la version nettoyée qui est rendue, donc
   * celle qui part en base et celle qu'un appelant doit vérifier libre.
   *
   * @throws {AllergenCodeInvalidError} la forme n'est pas celle d'un code.
   */
  static create(raw: string): AllergenCode {
    const code = raw.trim();
    if (code.length > MAX_LENGTH || !CODE_SHAPE.test(code)) {
      throw new AllergenCodeInvalidError(raw);
    }
    return new AllergenCode(code);
  }

  equals(other: AllergenCode): boolean {
    return this.value === other.value;
  }
}
