/**
 * Les **noms** des champs dont la valeur diffère entre deux états, dans l'ordre
 * de `keys`.
 *
 * C'est la forme qu'un geste du client laisse au journal (plan
 * `documentation/journalisation/plan-journal-d-activite.md` §3, décision 1) :
 * quels champs ont changé, jamais leurs valeurs. Les clés sont passées
 * explicitement plutôt que lues sur l'objet : l'ordre du fait ne dépend alors
 * pas de celui des propriétés, et rien n'est à transtyper.
 */
export function changedFields<K extends string>(
  keys: readonly K[],
  before: Readonly<Record<K, string>>,
  after: Readonly<Record<K, string>>,
): K[] {
  return keys.filter((key) => before[key] !== after[key]);
}
