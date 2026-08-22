/**
 * Les clés de métadonnées d'une **surface admin** — le vocabulaire partagé
 * entre le décorateur qui les pose et le guard qui les lit.
 *
 * Extraites parce qu'elles bouclaient un cycle : le décorateur importe le guard
 * (il l'applique via `UseGuards`), et le guard importait les clés depuis le
 * décorateur. Un cycle ne se voit ni au compilateur ni aux tests ; il se paie à
 * l'initialisation des modules, quand l'un des deux lit l'autre encore vide.
 *
 * Une feuille sans dépendance : les deux côtés la lisent, personne ne la lit
 * en retour.
 */

/** Clé de la ressource déclarée par un contrôleur admin. */
export const ADMIN_RESOURCE_KEY = "admin:resource";

/** Clé de la permission explicitement exigée par une route. */
export const ADMIN_PERMISSION_KEY = "admin:permission";

/** Clé d'une surface qui ne parle que de **soi**. */
export const ADMIN_SELF_KEY = "admin:self";
