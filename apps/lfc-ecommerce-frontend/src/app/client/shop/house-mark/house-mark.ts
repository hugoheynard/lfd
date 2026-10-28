import { computed, Directive, input } from '@angular/core';

/**
 * Le logo de la maison — le bonhomme au croissant, sans texte — servi depuis
 * `public/brand/`. C'est le repli de TOUT article de la boutique sans photo
 * (Hugo, 2026-10-28) : il remplace les illustrations de rayon dessinées.
 */
export const HOUSE_MARK = 'brand/lfc-mark.png';

/** Le retrait du logo par rapport aux bords du cadre, pour qu'il respire. */
const MARK_INSET = '12%';

/** Vrai quand l'URL est le repli, et non une photo. */
export function isHouseMark(url: string): boolean {
  return url === HOUSE_MARK;
}

/**
 * Pose sur une `<img>` d'article le cadrage du repli quand c'est le logo
 * qu'elle montre : centré, entier (`contain`), en retrait des bords, sur le fond
 * que l'emplacement prévoit déjà pour la photo. Une vraie photo n'est pas
 * touchée — elle garde le `cover` et le point focal de son composant.
 *
 * Styles en ligne : ils l'emportent sur le `object-fit: cover` de chaque
 * emplacement sans que dix feuilles de style aient à recopier la règle.
 */
@Directive({
  selector: 'img[appHouseMark]',
  host: {
    '[attr.data-house-mark]': "shown() ? '' : null",
    '[style.object-fit]': "shown() ? 'contain' : null",
    '[style.padding]': 'shown() ? inset : null',
    '[style.box-sizing]': "shown() ? 'border-box' : null",
  },
})
export class HouseMark {
  /** L'URL que l'image affiche (avant ou après dimensionnement : le logo n'est jamais redimensionné). */
  readonly appHouseMark = input.required<string>();

  protected readonly shown = computed(() => isHouseMark(this.appHouseMark()));
  protected readonly inset = MARK_INSET;
}
