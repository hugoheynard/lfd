import { inject, Injectable, signal } from '@angular/core';

import { StaffPrefsService } from '../../shared/staff-prefs/staff-prefs.service';

import type { SectionFamily } from './product-form/product-form-store';

/**
 * Ce que le filtre des familles peut valoir : une famille, ou « Tout ».
 *
 * Purement présentationnel — il ne change ni ce qui est chargé, ni ce qui est
 * enregistrable, seulement ce qu'on affiche.
 *
 * ⚠️ `'all'` n'existe **pas** au contrat : `productSectionFamily` vaut une des
 * quatre familles ou `null`. La traduction `'all' ↔ null` vit donc ici, et
 * nulle part ailleurs.
 */
export type SectionFilter = 'all' | SectionFamily;

/**
 * **Le filtre de familles appartient à la PERSONNE, pas à la fiche ouverte.**
 *
 * Décision Hugo (2026-09-23) : quelqu'un qui relit les textes de dix produits
 * choisit « Communication » une fois, pas dix. Le réglage ne peut donc pas
 * vivre dans le composant de page, qui meurt à chaque navigation — d'où ce
 * siège unique, fourni à la racine.
 *
 * Il suit désormais la personne **d'une machine à l'autre** : il est rangé dans
 * `nav_prefs` du staff, par `PATCH /admin/me/prefs`.
 */
@Injectable({ providedIn: 'root' })
export class SectionFamilyFilterStore {
  private readonly prefs = inject(StaffPrefsService);

  // ⚠️ Déclaré AVANT `family`, qui le lit : un champ de classe initialisé plus
  // bas vaut `undefined` à l'instant où celui du dessus s'évalue.
  private readonly value = signal<SectionFilter>('all');

  /**
   * La famille regardée. « Tout » tant que personne ne s'est prononcé : un
   * compte qui n'a rien choisi voit la fiche entière.
   *
   * En lecture seule au-dehors : écrire le signal poserait le réglage **sans le
   * retenir**, et le prochain écran repartirait de « Tout » sans que rien ne le
   * dise. {@link choose} est la seule porte.
   */
  readonly family = this.value.asReadonly();

  constructor() {
    void this.hydrate();
  }

  /**
   * Choisit une famille, et la retient pour cette personne.
   *
   * L'écran bascule **tout de suite** ; la mémorisation part derrière et ne dit
   * rien si elle échoue (cf. `StaffPrefsService`). Le prix d'un échec est de
   * rechoisir au prochain poste, jamais un écran bloqué.
   */
  choose(filter: SectionFilter): void {
    this.value.set(filter);
    this.chosen = true;
    void this.prefs.remember({ productSectionFamily: filter === 'all' ? null : filter });
  }

  /**
   * Quelqu'un a-t-il choisi depuis l'ouverture ?
   *
   * 🔴 L'hydratation attend le chargement de l'identité, donc elle arrive
   * **après** le premier rendu — et parfois après un clic. Sans ce drapeau, la
   * préférence d'hier écraserait le choix d'il y a deux secondes, et l'écran
   * changerait tout seul sous les doigts. Le choix présent gagne toujours sur
   * le choix mémorisé.
   */
  private chosen = false;

  private async hydrate(): Promise<void> {
    const saved = await this.prefs.productSectionFamily();
    if (this.chosen || saved === null) {
      return;
    }
    this.value.set(saved);
  }
}
