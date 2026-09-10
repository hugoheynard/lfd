import type { CatalogAdminItemView } from "@lfd/contracts";

/**
 * Le catalogue vendu, **en CSV**, tel qu'on l'ouvre dans un tableur pour relire
 * une grille de prix ou repérer les articles sans taux.
 *
 * ## Trois décisions de format, et aucune n'est cosmétique
 *
 * **Le séparateur est le point-virgule.** Excel en locale française lit une
 * virgule comme un séparateur décimal ; avec des virgules partout, un fichier
 * de prix français s'ouvre en une seule colonne. Le point-virgule est ce que
 * l'outil attend ici, et le fichier est fait pour être ouvert, pas parsé par
 * nous.
 *
 * **Les montants portent une virgule décimale, sans symbole ni séparateur de
 * milliers.** « 2,40 » est un NOMBRE pour le tableur ; « 2 400,00 € » est du
 * texte, et une colonne de texte ne s'additionne pas. Le lecteur qui ouvre ce
 * fichier veut faire une somme.
 *
 * **Un BOM ouvre le fichier.** Sans lui, Excel lit l'UTF-8 comme du Latin-1 et
 * « Crème pâtissière » devient « CrÃ¨me pÃ¢tissiÃ¨re ». C'est trois octets
 * contre un fichier illisible, et le symptôme ne ressemble pas à sa cause.
 *
 * ## Ce que le fichier dit, et qu'un écran dit mal
 *
 * Les **trois** prix, côte à côte : celui du référentiel, celui qu'on a négocié,
 * et celui qui sera facturé. Le troisième se déduit des deux autres, et c'est
 * précisément pour ça qu'il est écrit — la déduction (« B2B s'il existe, PIM
 * sinon ») est une règle du domaine, et la refaire à la main dans un tableur est
 * la façon dont on se trompe d'une ligne sur deux.
 */
const SEPARATOR = ";";

/**
 * Le BOM UTF-8, écrit en **séquence d'échappement** et non en caractère.
 *
 * Collé tel quel, c'est un caractère invisible au milieu d'un fichier source :
 * ESLint le refuse (`no-irregular-whitespace`), et il a raison — un blanc qu'on
 * ne voit pas se déplace, se duplique et se supprime sans que personne ne le
 * remarque. `\uFEFF` dit ce que c'est.
 */
const BOM = "\uFEFF";

const HEADERS = [
  "SKU",
  "Article",
  "Catégorie",
  "Tarif PIM (€ HT)",
  "Prix B2B (€ HT)",
  "Prix appliqué (€ HT)",
  "TVA (%)",
  "État",
] as const;

/** Rend le catalogue entier en CSV, prêt à être servi tel quel. */
export function catalogCsv(items: readonly CatalogAdminItemView[]): string {
  const lines = [HEADERS.join(SEPARATOR), ...items.map(row)];
  // CRLF : la norme du format, et ce qu'attendent les tableurs sous Windows —
  // qui sont ceux qui ouvriront ce fichier.
  return BOM + lines.join("\r\n") + "\r\n";
}

function row(item: CatalogAdminItemView): string {
  return [
    field(item.sku),
    field(item.name),
    field(item.categoryName),
    euros(item.pimPriceMillicents),
    // Vide, et non « 0,00 » : aucune décision n'a été posée sur cet article, et
    // un zéro dirait « négocié à zéro euro ». La colonne d'à côté porte déjà ce
    // qui sera facturé.
    item.b2bPriceMillicents === null ? "" : euros(item.b2bPriceMillicents),
    euros(item.effectivePriceMillicents),
    // Vide aussi, pour la même raison, et celle-ci coûte plus cher : la famille
    // n'a pas de régime de TVA dans le référentiel. Écrire « 0 » ferait lire un
    // article exonéré là où il n'est simplement PAS VENDABLE.
    item.vatRatePercent === null ? "" : decimal(item.vatRatePercent, 2),
    field(state(item)),
  ].join(SEPARATOR);
}

/**
 * L'état, en un mot — et il ne se déduit pas de `isHidden` seul.
 *
 * Un article sans taux de TVA n'est pas masqué et n'est pas vendable pour
 * autant : `CatalogReader` l'écarte de la boutique plutôt que d'inventer 5,5 %.
 * Le confondre avec « en vente » est la seule faute qui compte dans ce fichier,
 * parce qu'elle se lit comme une bonne nouvelle.
 */
function state(item: CatalogAdminItemView): string {
  if (item.isHidden) {
    return "Masqué";
  }
  return item.vatRatePercent === null ? "Sans taux de TVA" : "En vente";
}

/**
 * Millicentimes → euros, virgule décimale, deux décimales.
 *
 * Écrit à la main plutôt que par `Intl` : `Intl` dépend des données de locale de
 * l'hôte, et un serveur qui rendrait « 2.40 » selon son environnement produirait
 * un fichier que le tableur français lit comme du texte. Le format d'un fichier
 * exporté ne doit dépendre de rien d'autre que du code qui l'écrit.
 *
 * ⚠️ Aucune conversion en CENTIMES ici : on passe du millicentime directement à
 * une chaîne d'affichage. Passer par les centimes perdrait la précision sur les
 * prix qui en portent — et c'est exactement ce que la porte `lint:money-units`
 * existe pour empêcher.
 */
function euros(millicents: number): string {
  const negative = millicents < 0;
  const abs = Math.abs(millicents);
  const units = Math.trunc(abs / 100_000);
  // Les cinq décimales du millicentime, dont on ne garde que les deux
  // premières : le fichier montre un prix, il ne sert pas à recalculer.
  const rest = String(abs % 100_000).padStart(5, "0");
  return `${negative ? "-" : ""}${String(units)},${rest.slice(0, 2)}`;
}

/** Un pourcentage, virgule décimale — même raison que les euros. */
function decimal(value: number, places: number): string {
  return value.toFixed(places).replace(".", ",");
}

/**
 * Échappe un champ texte.
 *
 * Un nom d'article contient un point-virgule (« Tarte citron ; meringuée ») plus
 * souvent qu'on ne le croit, et une seule occurrence décale toute la ligne d'une
 * colonne — silencieusement. Le guillemet double se double, c'est la règle du
 * RFC 4180 et ce que les tableurs attendent.
 */
function field(raw: string): string {
  const needsQuotes = /[";\r\n]/u.test(raw);
  return needsQuotes ? `"${raw.replaceAll('"', '""')}"` : raw;
}
