/**
 * Échappement HTML minimal pour tout texte interpolé dans un gabarit.
 *
 * **Portée** : nœuds de texte et valeurs d'attributs **entre guillemets**. Ne
 * pas s'en servir pour un attribut non quoté, une chaîne JS ou du CSS — ces
 * contextes ont leurs propres règles.
 */
export function htmlEscape(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}
