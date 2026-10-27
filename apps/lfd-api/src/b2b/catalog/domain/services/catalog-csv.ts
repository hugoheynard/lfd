import type { CatalogAdminItemView } from "@lfd/contracts";
import { servedTo } from "../served-to.js";

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
 * ## Les colonnes de prix (lot D, 2026-10-15)
 *
 * Le fichier portait trois prix : celui du référentiel, le « Prix B2B » décidé
 * sur la plateforme, et le « Prix appliqué » (le décidé s'il existait). La
 * plateforme ne décide plus de prix : la colonne « Prix B2B (€ HT) » est
 * retirée, et « Prix appliqué (€ HT) » vaut le prix du référentiel — gardée
 * pour qu'un tableur qui la lisait par son nom la trouve encore.
 *
 * ⚠️ **Un fichier dont les colonnes changent** : un tableur qui lisait les
 * colonnes par leur RANG voit « Prix appliqué » passer de la 6ᵉ à la 5ᵉ.
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
    // Le prix du référentiel, seul prix depuis le lot D.
    euros(item.pimPriceMillicents),
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
  // L'audience D'ABORD : un article que le référentiel ne vend pas aux pros
  // n'est pas « masqué » — personne ici ne l'a décidé, et le démasquer ne le
  // vendrait pas (`servedTo`).
  if (item.audience === "public") {
    return "Pas vendu aux pros";
  }
  if (!servedTo(item, "pro")) {
    return "Masqué";
  }
  // Sans prix pro (2026-10-27), l'article n'est pas servi aux pros.
  if (item.pimPriceMillicents === null) {
    return "Sans prix pro";
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
function euros(millicents: number | null): string {
  // Vide, jamais « 0,00 » : un prix absent n'est pas gratuit (2026-10-27).
  if (millicents === null) {
    return "";
  }
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
