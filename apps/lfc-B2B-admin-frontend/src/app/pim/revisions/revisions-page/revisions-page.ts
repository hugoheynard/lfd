import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldOptionComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { RevisionDiff } from '../revision-diff/revision-diff';
import { RevisionsStore } from '../revisions.store';

/** Le format d'une date d'ancre : le jour ET l'heure — on en pose plusieurs par jour. */
const WHEN = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * **Les révisions du catalogue** — poser une ancre, et lire ce qui a changé
 * depuis une autre.
 *
 * Une ancre est une photographie du catalogue entier, nommée et datée. Elle ne
 * publie rien et ne modifie rien : elle enregistre ce que le catalogue ÉTAIT, ce
 * qui est la seule façon de répondre plus tard à « qu'est-ce qui a changé depuis
 * la dernière fois » — la question qu'on se pose devant un client.
 *
 * Poser une ancre sur un catalogue inchangé n'en crée pas une seconde : le
 * serveur rend l'existante, et l'écran le DIT plutôt que d'afficher un succès
 * qui ferait croire à une version de plus.
 */
@Component({
  selector: 'app-revisions-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldOptionComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    RevisionDiff,
  ],
  templateUrl: './revisions-page.html',
  styleUrl: './revisions-page.scss',
})
export class RevisionsPage {
  protected readonly store = inject(RevisionsStore);

  protected readonly label = signal('');

  /**
   * Les deux bornes de la comparaison, en NUMÉROS de version.
   *
   * `null` tant que la liste n'est pas là. Elles se posent d'elles-mêmes sur les
   * deux plus récentes une fois chargée : c'est la comparaison qu'on veut neuf
   * fois sur dix, et l'imposer à la main à chaque ouverture serait un péage.
   */
  protected readonly from = signal<number | null>(null);
  protected readonly to = signal<number | null>(null);

  /**
   * Les révisions telles que les listes déroulantes les proposent.
   *
   * `value` est une CHAÎNE : `fold-listbox` échange des chaînes, comme un
   * `<select>` natif. Les numéros de version restent des nombres dans les
   * signaux — c'est ce qu'ils sont — et la conversion vit à la frontière du
   * composant, pas dans le modèle.
   */
  protected readonly options = computed(() =>
    this.store.revisions().map((revision) => ({
      value: String(revision.version),
      text: `${String(revision.version)} — ${revision.label ?? 'sans nom'} · ${this.when(revision.takenAt)}`,
    })),
  );

  /** Les deux bornes, en chaînes, pour les listes déroulantes. */
  protected readonly fromValue = computed(() => textOf(this.from()));
  protected readonly toValue = computed(() => textOf(this.to()));

  protected readonly canCompare = computed(() => {
    const [from, to] = [this.from(), this.to()];
    return from !== null && to !== null && from !== to;
  });

  constructor() {
    void this.refresh();
  }

  protected when(iso: string): string {
    return WHEN.format(new Date(iso));
  }

  protected async take(): Promise<void> {
    await this.store.take(this.label());
    this.label.set('');
    this.preselect();
  }

  protected async compare(): Promise<void> {
    const [from, to] = [this.from(), this.to()];
    if (from === null || to === null) {
      return;
    }
    await this.store.compare(from, to);
  }

  /**
   * Les listes déroulantes rendent des chaînes ; les versions sont des nombres.
   *
   * `null` traverse aussi — `fold-listbox` peut se vider — et on ne le convertit
   * pas en zéro : une borne absente n'est pas la révision zéro, et le bouton
   * « Comparer » reste désarmé tant qu'il en manque une.
   */
  protected select(target: 'from' | 'to', value: string | null): void {
    const version = value === null ? Number.NaN : Number.parseInt(value, 10);
    (target === 'from' ? this.from : this.to).set(Number.isNaN(version) ? null : version);
  }

  private async refresh(): Promise<void> {
    await this.store.load();
    this.preselect();
  }

  /**
   * De l'avant-dernière à la dernière — la comparaison qu'on vient chercher.
   *
   * La liste arrive de la plus récente à la plus ancienne, donc `to` est la
   * première et `from` la suivante. Poser l'inverse montrerait un diff à
   * l'envers sans que personne l'ait demandé.
   */
  private preselect(): void {
    const revisions = this.store.revisions();
    this.to.set(revisions[0]?.version ?? null);
    this.from.set(revisions[1]?.version ?? null);
  }
}

/** Un numéro de version, tel qu'une liste déroulante le porte. `''` = aucun. */
function textOf(version: number | null): string {
  return version === null ? '' : String(version);
}
