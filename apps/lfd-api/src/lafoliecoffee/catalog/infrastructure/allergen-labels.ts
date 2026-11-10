import type { PimAllergenLabels } from "../domain/entities/catalog-item.js";

/**
 * **Les mentions d'étiquette relues depuis `jsonb`.**
 *
 * Le référentiel réglementaire n'est **pas** dans le B2B (D6) : la plateforme
 * subit les mentions que le PIM a projetées à l'émission du fil, elle ne les
 * recalcule pas. Ce fichier est donc tout ce que le B2B sait faire d'un
 * allergène — les relire, et refuser ce qui n'a pas la forme.
 *
 * Tout ce qui n'a pas la forme attendue rend `null` — « pas de fiche » plutôt
 * qu'une fiche vide, comme pour les codes. C'est aussi l'état des lignes reçues
 * avant la v5 du fil, que seul un push complet garnit : sur un champ
 * réglementaire, la valeur par défaut est celle qui n'affirme **rien**.
 *
 * Extrait le 2026-09-03 : la même relecture existait en deux exemplaires
 * privés, et le back-office, lui, ne relisait pas du tout — il **recalculait**
 * depuis une table figée de 30 codes, pendant que la boutique lisait le
 * référentiel administrable. Une seule fonction pour une seule vérité.
 */
export function allergenLabelsOf(raw: unknown): PimAllergenLabels | null {
  if (typeof raw !== "object" || raw === null || !("labels" in raw) || !("incomplete" in raw)) {
    return null;
  }
  const { labels, incomplete } = raw;
  if (!Array.isArray(labels) || typeof incomplete !== "boolean") {
    return null;
  }
  // **Une mention illisible fait tomber la fiche entière**, elle n'est pas
  // écartée en silence. Filtrer garderait les bonnes et jetterait la mauvaise
  // sans le dire — c'est-à-dire une liste amputée qui se tait, la seule faute
  // qui compte sur ce champ, et celle qui a déjà été commise une fois sur une
  // surface en service. `null` fait dire aux deux appelants « je ne sais pas »,
  // qui est vrai, plutôt que « voici la liste », qui ne l'est plus.
  if (!labels.every(isLabel)) {
    return null;
  }
  return {
    labels: labels.map((label) => ({ category: label.category, label: label.label })),
    incomplete,
  };
}

/** Une mention bien formée : une catégorie INCO et son libellé, tous deux textuels. */
function isLabel(raw: unknown): raw is { category: string; label: string } {
  return (
    typeof raw === "object" &&
    raw !== null &&
    "category" in raw &&
    "label" in raw &&
    typeof raw.category === "string" &&
    typeof raw.label === "string"
  );
}
