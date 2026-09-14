import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldSurfaceDirective,
  FoldViewToggleComponent,
  FoldLoadingStateComponent,
  type FoldSelectItem,
  type FoldViewToggleOption,
} from 'fold-ng';

import type { WorkshopGroup, WorkshopLine } from '@lfd/contracts';

import { StaffPrefsService } from '../../shared/staff-prefs/staff-prefs.service';
import { narrowViewport } from '../../shared/viewport/narrow-viewport';
import { refreshWhileVisible } from '../periodic-refresh';
import { markKey } from '../worksheet-day';
import { DriftBanner } from './drift-banner/drift-banner';
import { WorkshopDayReader } from './workshop-day.reader';
import { WorkshopGestures } from './workshop-gestures';
import { WorksheetLine } from './worksheet-line/worksheet-line';

/**
 * 🔴 **Le seuil du fournil — 1024 px, pas les 640 px du back-office.**
 *
 * La bascule est structurelle, pas cosmétique : au-dessus, les onglets de
 * catégorie et la colonne d'initiales tiennent ; en dessous, les onglets
 * deviennent un menu qu'on ouvre par erreur les mains sales. C'est la largeur
 * où la barre d'onglets cesse de tenir sur une ligne qui décide.
 *
 * ⚠️ La même valeur est écrite dans `fiche-atelier.scss` (une media query ne lit
 * pas un `const`). Les deux bougent ensemble ou l'écran se coupe en deux.
 */
const WORKSHOP_NARROW = '(max-width: 1023px)';

/**
 * **La fiche d'atelier** — ce que le fournil a à sortir, et ce qui est sorti.
 *
 * Aucun prix, aucun nom de client, aucun total en euros : ce n'est pas une
 * omission, c'est la règle qui définit cet écran, et le contrat la porte dans le
 * TYPE plutôt qu'en consigne — il n'y a pas de champ à laisser vide.
 *
 * 🔴 **L'écran ne calcule rien** (décidé le 2026-09-14,
 * `documentation/production/plan-fiche-atelier.md` §10). La journée, les rayons,
 * les deux listes et tous les comptes viennent du serveur ; l'écran relit après
 * chaque coche acceptée.
 *
 * **Trois responsabilités, trois fichiers**, comme le poste de colisage :
 * - {@link WorkshopDayReader} — CE QU'ON LIT : la journée, les relectures,
 *   l'état montré des cases ;
 * - {@link WorkshopGestures} — CE QU'ON FAIT : cocher, retirer ;
 * - **ce composant — LE CHOIX DE LA FICHE** et sa mise en forme : onglets, rang,
 *   bloc replié du téléphone.
 *
 * **La catégorie ouverte suit la PERSONNE**, dans `nav_prefs` et non dans
 * `localStorage` : le téléphone du pétrin n'est pas la machine du chef, et c'est
 * la personne qui reprend son poste. Un `PATCH` refusé laisse simplement la
 * catégorie à la session.
 */
@Component({
  selector: 'app-fiche-atelier',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DriftBanner,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldSurfaceDirective,
    FoldViewToggleComponent,
    WorksheetLine,
  ],
  // Fournis ICI, pas à la racine : un poste ouvert deux fois ne partage ni sa
  // lecture ni ses envois.
  providers: [WorkshopDayReader, WorkshopGestures],
  templateUrl: './fiche-atelier.html',
  styleUrl: './fiche-atelier.scss',
})
export class FicheAtelier {
  protected readonly day = inject(WorkshopDayReader);
  protected readonly gestures = inject(WorkshopGestures);
  private readonly prefs = inject(StaffPrefsService);

  protected readonly compact = narrowViewport(WORKSHOP_NARROW);

  /** Le bloc des lignes faites, sur téléphone. Replié : on vient voir ce qui reste. */
  protected readonly doneOpen = signal(false);

  /** La fiche choisie. `null` tant que rien n'a été lu ni préféré. */
  private readonly chosen = signal<string | null>(null);

  constructor() {
    // 🔴 Une lecture UNIQUE, et pas un `effect` : la journée est choisie au
    // serveur, rien à l'écran ne la fait changer.
    void this.day.load();
    // Les autres postes cochent aussi : sans relecture, une ligne sortie du four
    // par le voisin resterait « à faire » ici, et on la fabriquerait deux fois.
    refreshWhileVisible(() => this.day.refresh());
    // La préférence n'arrive pas avant la personne : `GET /admin/me` est déjà en
    // vol pour les droits. Si elle n'arrive jamais, la première fiche suffit.
    void this.prefs.worksheetCategory().then((category) => {
      if (category !== null && this.chosen() === null) {
        this.chosen.set(category);
      }
    });
  }

  /** La fiche affichée : celle qu'on a choisie, ou la première s'il n'y a pas de choix. */
  protected readonly current = computed<WorkshopGroup | null>(() => {
    const groups = this.day.groups();
    const key = this.chosen();
    return groups.find((group) => group.key === key) ?? groups[0] ?? null;
  });

  /** Le rang de la fiche dans la liste servie — « fiche 2 sur 5 ». */
  protected readonly rank = computed(() => {
    const current = this.current();
    return current === null ? 0 : this.day.groups().indexOf(current) + 1;
  });

  /** Les onglets du poste fixe : le rayon et son avancement, tels que servis. */
  protected readonly tabs = computed<readonly FoldViewToggleOption[]>(() =>
    this.day.groups().map((group) => ({
      value: group.key,
      label: `${group.label} ${group.doneCount}/${group.lineCount}`,
    })),
  );

  /** Le même choix, sous le pouce : une liste, jamais six onglets de 390 px. */
  protected readonly tabOptions = computed<readonly FoldSelectItem<string>[]>(() =>
    this.day.groups().map((group) => ({
      value: group.key,
      label: `${group.label} · ${group.doneCount}/${group.lineCount}`,
    })),
  );

  /** En cours de production, telle que servie — avec l'état montré des cases en vol. */
  protected readonly todo = computed(() => this.shownLines(this.current()?.pending ?? []));

  /** Production faite, telle que servie — sur téléphone, dans le bloc replié du pied. */
  protected readonly done = computed(() => this.shownLines(this.current()?.done ?? []));

  /** Change de fiche, et le retient pour la personne. */
  protected choose(key: string): void {
    this.chosen.set(key);
    this.doneOpen.set(false);
    void this.prefs.remember({ worksheetCategory: key });
  }

  protected toggleDone(): void {
    this.doneOpen.update((open) => !open);
  }

  /**
   * Recouvre la case d'une ligne par l'état montré le temps de son envoi. Seule
   * la CASE bouge : la ligne reste dans sa liste jusqu'à la relecture.
   */
  private shownLines(lines: readonly WorkshopLine[]): readonly WorkshopLine[] {
    const date = this.day.date();
    const shown = this.day.shown();
    if (date === null || shown.size === 0) {
      return lines;
    }
    return lines.map((line) => {
      const done = shown.get(markKey(date, line.sku));
      return done === undefined ? line : { ...line, done };
    });
  }
}
