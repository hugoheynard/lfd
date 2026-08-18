/**
 * Port **SecretGenerator** — la source des jetons qui doivent être **impossibles
 * à deviner**.
 *
 * Distinct d'`IdGenerator` à dessein, et ce n'est pas de la symétrie : le
 * générateur d'identifiants rend des ULID **monotones**, qui incrémentent leur
 * composante aléatoire à l'intérieur d'une même milliseconde. Excellent pour
 * trier un flux ; désastreux pour un secret, puisque connaître un jeton livre
 * ses voisins. Un jeton de remise doit rester opaque même à qui en détient dix.
 *
 * Deux ports, deux propriétés : l'un promet l'**ordre**, l'autre l'**entropie**.
 * Les confondre revient à choisir l'un des deux en croyant avoir les deux.
 */
export abstract class SecretGenerator {
  /** Un nouveau secret imprévisible, sûr en URL. */
  abstract next(): string;
}
