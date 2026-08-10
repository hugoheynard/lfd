import { randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { SecretGenerator } from "./secret-generator.js";

/** 26 caractères × 5 bits = 130 bits d'entropie. Un jeton ne tombe pas par hasard. */
const LENGTH = 26;

/**
 * Alphabet **Crockford base32**, sans `I`, `L`, `O` ni `U` : un jeton finit tôt
 * ou tard lu à voix haute au téléphone le jour où une caméra refuse de scanner,
 * et ces quatre lettres sont celles qu'on confond avec `1` et `0` — ou qu'on
 * préfère ne pas voir apparaître au milieu d'un mot.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Adaptateur de production : `randomBytes` de `node:crypto`, jamais
 * `Math.random()` — prévisible, et jamais conçu pour ça.
 *
 * Le rendu est en base32 majuscule : sûr en URL sans échappement, lisible, et
 * dictable. Un octet est réduit modulo 32, ce qui reste **uniforme** puisque 256
 * est un multiple exact de 32 : aucun caractère n'est plus probable qu'un autre.
 * (Le réflexe de vérifier vaut pour tout alphabet — un alphabet de 33 signes
 * biaiserait le premier caractère, et ce biais ne se voit pas à la lecture.)
 */
@Injectable()
export class RandomSecretGenerator extends SecretGenerator {
  next(): string {
    return Array.from(randomBytes(LENGTH), (byte) => ALPHABET.charAt(byte % ALPHABET.length)).join(
      "",
    );
  }
}
