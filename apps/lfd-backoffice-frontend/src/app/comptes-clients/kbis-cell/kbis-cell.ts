import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FoldBadgeComponent, type FoldBadgeVariant } from 'fold-ng';
import { kbisAgeOf, type AdminKbisView } from '@lfd/contracts';

import { kbisAgeNote, kbisAgeTone } from '../kbis-age-wording';

/**
 * La case « KBIS » de la liste des comptes : absent, déposé, ou certifié — et,
 * pour un certifié, son âge. Le fond de la case prend le ton de l'âge, et la
 * mention écrite le dit en clair : la couleur n'est jamais le seul signal.
 */
@Component({
  selector: 'app-kbis-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent],
  templateUrl: './kbis-cell.html',
  styleUrl: './kbis-cell.scss',
  host: {
    '[attr.data-tone]': 'tone()',
    '[attr.title]': 'ageNote()',
  },
})
export class KbisCell {
  readonly kbis = input.required<AdminKbisView | null>();
  /** Le jour de l'écran (AAAA-MM-JJ), calculé une fois par la page. */
  readonly today = input.required<string>();

  protected readonly badge = computed((): { label: string; variant: FoldBadgeVariant } => {
    const kbis = this.kbis();
    if (kbis === null) {
      return { label: 'Absent', variant: 'neutral' };
    }
    return kbis.certified
      ? { label: 'Certifié', variant: 'success' }
      : { label: 'Déposé', variant: 'info' };
  });

  /** L'âge ne se lit que sur un extrait certifié : c'est lui qui engage. */
  private readonly age = computed(() => {
    const kbis = this.kbis();
    return kbis === null || !kbis.certified ? null : kbisAgeOf(kbis.issuedOn, this.today());
  });

  protected readonly ageNote = computed(() => {
    const age = this.age();
    return age === null ? null : kbisAgeNote(age);
  });

  protected readonly tone = computed(() => {
    const age = this.age();
    return age === null ? null : kbisAgeTone(age);
  });
}
