/**
 * **La langue de la commande** (lot A3) : les trois langues de la boutique,
 * et la case des commandes qui n'en portent pas — toutes celles d'avant le
 * 2026-10-18, jamais rattrapées, et les saisies de l'équipe.
 */
export const ORDER_LOCALE_CELLS = [
  { key: "fr", label: "Français" },
  { key: "en", label: "Anglais" },
  { key: "it", label: "Italien" },
  { key: "unknown", label: "Non renseignée" },
] as const;
