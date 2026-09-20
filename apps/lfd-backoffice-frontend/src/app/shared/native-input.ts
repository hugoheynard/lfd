/**
 * **La valeur d'un champ natif, sans `$any`.**
 *
 * Les gabarits Angular ne savent pas rétrécir un type : `$event.target` y est un
 * `EventTarget | null`, et lire `.value` dessus oblige à passer par `$any(...)` —
 * c'est-à-dire à rouvrir `any` dans le seul endroit du code que le compilateur ne
 * relit pas. Un champ renommé, un événement branché sur le mauvais élément, et
 * la page rend `undefined` en silence.
 *
 * La conversion se fait donc ici, en TypeScript, avec un vrai rétrécissement.
 *
 * Réservé aux champs que **Signal Forms ne pilote pas** : les dates, les
 * `<select>`, les curseurs. Un champ de texte ordinaire passe par `[formField]`
 * et n'a jamais besoin de lire son événement.
 */
export function nativeValue(event: Event): string {
  const target = event.target;
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement
    ? target.value
    : '';
}
