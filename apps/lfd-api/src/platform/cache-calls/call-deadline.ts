/** Une promesse tenue à temps, ou abandonnée au délai. */
export type Deadlined<T> =
  { readonly kind: "in_time"; readonly value: T } | { readonly kind: "late" };

/**
 * **Le délai d'un appel à un cache** — un port pour que le repli se teste sans
 * attendre de vraies millisecondes.
 *
 * Une promesse qui REJETTE dans le délai rejette encore : seule la lenteur est
 * traduite en `late`.
 */
export abstract class CallDeadline {
  abstract within<T>(work: Promise<T>, limitMs: number): Promise<Deadlined<T>>;
}

/**
 * Le délai sur un minuteur Node, toujours désarmé : un appel rapide ne laisse
 * rien derrière lui. L'appel abandonné continue sa course (son socket a son
 * propre filet) ; son résultat est ignoré.
 */
export async function withinTimer<T>(work: Promise<T>, limitMs: number): Promise<Deadlined<T>> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<Deadlined<T>>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "late" }), limitMs);
  });
  try {
    return await Promise.race([
      work.then((value): Deadlined<T> => ({ kind: "in_time", value })),
      late,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** {@link CallDeadline} sur un minuteur Node ({@link withinTimer}). */
export class NodeCallDeadline extends CallDeadline {
  within<T>(work: Promise<T>, limitMs: number): Promise<Deadlined<T>> {
    return withinTimer(work, limitMs);
  }
}
