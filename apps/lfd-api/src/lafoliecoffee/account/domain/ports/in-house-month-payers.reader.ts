/**
 * **Lecture publiée** de la nature « maison » (`restaurants-maison.md`) :
 * les payeurs dont une période `[déclarée, retirée[` touche la
 * fenêtre `[from, to[`. Le récapitulatif des BL leur donne une issue, vide
 * s'ils n'ont aucun BL.
 */
export abstract class InHouseMonthPayersReader {
  abstract payersInHouseDuring(window: {
    readonly from: Date;
    readonly to: Date;
  }): Promise<readonly string[]>;
}
