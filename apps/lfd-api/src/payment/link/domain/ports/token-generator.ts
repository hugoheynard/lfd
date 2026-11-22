/**
 * **Le tirage d'un jeton secret** — 32 octets d'aléa cryptographique, en
 * base64url. Un port pour la raison de `IdGenerator` : l'aléa est un effet,
 * et un test le fixe. L'`IdGenerator` ULID ne convient pas : il est
 * prévisible par construction.
 */
export abstract class TokenGenerator {
  abstract next(): string;
}
