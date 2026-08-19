/**
 * Port **IdGenerator** — la seule source d'identifiants opaques du système.
 *
 * L'implémentation de production (`UlidGenerator`) rend des **ULID** : triables
 * par le temps (idéal pour un flux append-only + pagination stable) et sans
 * `Math.random()` disséminé (source de non-déterminisme **et** de collisions).
 * En test, `FixedIdGenerator` rend une suite prévisible.
 */
export abstract class IdGenerator {
  /** Un nouvel identifiant unique et opaque. */
  abstract next(): string;
}
