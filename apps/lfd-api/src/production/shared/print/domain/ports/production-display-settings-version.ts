/**
 * **« Le réglage d'affichage a-t-il changé ? »** — un numéro que la fiche
 * d'atelier met dans l'étiquette de son contenu gardé (`WorksheetContents`) :
 * le réglage n'écrit aucun journal de journée, et sans ce numéro une fiche
 * rangée par rayon resterait servie après la bascule en mode prod.
 *
 * Le numéro est l'instant de la dernière pose, en millisecondes ; `0` tant que
 * personne ne l'a posé. Il ne fait que monter (chaque pose réécrit l'instant
 * du `Clock`), et se compare par égalité, comme tout numéro de version.
 */
export abstract class ProductionDisplaySettingsVersion {
  abstract versionOf(): Promise<number>;
}
