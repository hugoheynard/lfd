/**
 * **Plié pour la comparaison** : sans casse, sans accent, et sans variété
 * d'espaces.
 *
 * 🔴 L'insécable est le piège, et il a été vu à l'écran : une heure s'écrit
 * « 14 h 00 » avec des espaces INSÉCABLES, et personne n'en tape une. Les
 * accents suivent la même logique : on tape vite et sans diacritiques, et
 * « boulangerie marin » doit trouver « Boulangerie Marín ».
 *
 * Sorti de la file du comptoir le 2026-09-28, quand la Supervision a eu besoin
 * du même pli : deux recherches qui ne plient pas pareil trouvent des choses
 * différentes pour la même frappe.
 */
export function searchKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/gu, ' ')
    .toLowerCase()
    .trim();
}
