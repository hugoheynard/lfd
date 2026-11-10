/** Une promesse tenue à temps, ou abandonnée au délai. */
export type Deadlined<T> =
  { readonly kind: "in_time"; readonly value: T } | { readonly kind: "late" };

/**
 * **Le délai d'un appel au magasin des rayons** — un port pour que le repli
 * (§ 4 bis du plan du cache) se teste sans attendre de vraies millisecondes.
 *
 * Une promesse qui REJETTE dans le délai rejette encore : seule la lenteur est
 * traduite en `late`.
 */
export abstract class ShelfCallDeadline {
  abstract within<T>(work: Promise<T>, limitMs: number): Promise<Deadlined<T>>;
}
