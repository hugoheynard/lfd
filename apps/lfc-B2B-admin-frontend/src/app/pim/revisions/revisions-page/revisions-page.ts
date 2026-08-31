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
   * Les deux bornes de la comparaison, par RÉFÉRENCE.
   *
   * `null` tant que la liste n'est pas là. Elles se posent d'elles-mêmes sur les
   * deux plus récentes une fois chargée : c'est la comparaison qu'on veut neuf
   * fois sur dix, et l'imposer à la main à chaque ouverture serait un péage.
   */
  protected readonly from = signal<string | null>(null);
  protected readonly to = signal<string | null>(null);

  /**
   * Les révisions telles que les listes déroulantes les proposent.
   *
   * `value` est la référence : `fold-listbox` échange des chaînes, comme un
   * `<select>` natif, et une référence en est une. Il n'y a donc plus rien à
   * convertir à la frontière — c'est ce que le numéro de version imposait.
   */
  protected readonly options = computed(() =>
    this.store.revisions().map((revision) => ({
      value: revision.reference,
      text: `${revision.reference} — ${revision.label ?? 'sans nom'} · ${this.when(revision.takenAt)}`,
    })),
  );

  /** Les deux bornes, telles que les listes déroulantes les portent. */
  protected readonly fromValue = computed(() => this.from() ?? '');
  protected readonly toValue = computed(() => this.to() ?? '');

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
   * Une référence traverse telle quelle : c'est déjà une chaîne.
   *
   * `null` aussi — `fold-listbox` peut se vider — et une borne vide laisse
   * « Comparer » désarmé plutôt que d'inventer une valeur.
   */
  protected select(target: 'from' | 'to', value: string | null): void {
    (target === 'from' ? this.from : this.to).set(value === null || value === '' ? null : value);
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
    this.to.set(revisions[0]?.reference ?? null);
    this.from.set(revisions[1]?.reference ?? null);
  }
}
