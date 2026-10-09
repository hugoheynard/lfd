/**
 * **Les montants du bon de commande en PDF**, écrits à la main.
 *
 * Sortis de `order-sheet-pdf.ts` le 2026-10-09, quand le bon public a fait
 * grossir le rendu au-delà de ce qu'un fichier se relit d'un bloc. `Intl` est
 * écarté pour la raison qui vaut partout dans ce rendu : il dépend des données
 * de locale de l'hôte, et ce document est archivé.
 */

/**
 * Le signe d'un montant négatif.
 *
 * 🔴 C'était « − » (U+2212, le vrai signe moins mathématique), et il **n'existe
 * pas en WinAnsi** — l'encodage que les polices standard du PDF déclarent. Il
 * sortait en guillemet : « Remise " 58,90 € ». Le générateur maison le
 * traduisait en trait d'union à l'encodage ; `pdfkit` ne le fait pas, et c'est
 * une conversion qu'on ne remarque qu'à l'œil.
 *
 * Le trait d'union ASCII est donc écrit tel quel : il traverse n'importe quel
 * encodage, et sur un document comptable un signe faux vaut moins qu'un signe
 * moins élégant.
 */
export const MINUS = "-";

/** Des centimes → « 1 284,60 € », avec l'espace des milliers. */
export function money(cents: number): string {
  const [units, decimals] = Math.abs(cents / 100)
    .toFixed(2)
    .split(".");
  const grouped = (units ?? "0").replace(/\B(?=(\d{3})+(?!\d))/gu, " ");
  return `${cents < 0 ? `${MINUS} ` : ""}${grouped},${decimals ?? "00"} €`;
}

/**
 * Un prix **unitaire** vit en millicentimes : 1 € = 100 000.
 *
 * 🔴 Cette fonction divisait par 10 — elle affichait donc **cent fois** le prix.
 * La faute n'est pas l'erreur de facteur, c'est d'avoir refait l'arithmétique de
 * l'argent au lieu d'appeler ce qui fait autorité : `MILLICENTS_PER_CENT` vaut
 * 1 000 dans `@lfd/money`, et le front divise par 100 000 pour obtenir des euros.
 *
 * Deux à cinq décimales, comme `formatMillicents` côté front : un prix unitaire
 * dérivé d'une remise n'est pas rond, et l'arrondir au centime ferait que
 * `PU × quantité` ne retombe plus sur le total de ligne — un client le refait à
 * la calculatrice, et il a raison de le faire.
 *
 * ⚠️ Jumeau volontaire de `formatMillicents` (`@lfd/b2b-ui`), qui est Angular et
 * que le serveur ne peut pas importer. `Intl` est écarté ici pour la raison qui
 * vaut partout dans ce fichier : il dépend des données de locale de l'hôte, et
 * ce document est archivé.
 */
export function unitPrice(millicents: number): string {
  const abs = Math.abs(millicents);
  const units = Math.trunc(abs / 100_000);
  const rest = String(abs % 100_000).padStart(5, "0");
  const trimmed = rest.replace(/0+$/u, "");
  const decimals = trimmed.length < 2 ? trimmed.padEnd(2, "0") : trimmed;
  const grouped = String(units).replace(/\B(?=(\d{3})+(?!\d))/gu, " ");
  return `${millicents < 0 ? `${MINUS} ` : ""}${grouped},${decimals} €`;
}
