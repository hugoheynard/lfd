import { DefaultVariantChangeGate } from "../ports/default-variant-change-gate.js";

/**
 * La porte OUVERTE, reliée depuis la bascule (`plan-defaut-sous-sa-reference.md`,
 * L3) : le défaut se vend sous sa propre référence, et changer de défaut ne
 * déplace plus rien de ce qui est posé sur une référence de vente.
 *
 * La porte fermée (`DefaultVariantChangeClosedUntilSwitch`) reste écrite : un
 * retour arrière de la bascule la relie de nouveau, en une ligne du module.
 */
export class DefaultVariantChangeOpen extends DefaultVariantChangeGate {
  assertOpen(): void {
    // Rien à refuser : le geste est jugé par l'agrégat seul.
  }
}
