import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent, FoldDateComponent } from 'fold-ng';
import { kbisAgeOf } from '@lfd/contracts';

import { parisToday } from '../../shared/paris-today';
import { FicheClientFacade } from '../informations/fiche-client.facade';

/**
 * Le geste « J'ai vérifié cet extrait », ouvert sous le fichier : il demande la
 * **date de délivrance** lue en tête du KBIS, sans quoi la certification ne
 * dit pas de quel extrait elle parle.
 *
 * Un extrait de plus de 3 mois se certifie quand même : l'avertissement
 * informe, il ne bloque pas — l'agent juge. Un refus du serveur s'affiche ici,
 * et le geste reste ouvert pour corriger la date.
 */
@Component({
  selector: 'app-kbis-certification',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FoldDateComponent],
  templateUrl: './kbis-certification.html',
  styleUrl: './kbis-certification.scss',
})
export class KbisCertification {
  private readonly fiche = inject(FicheClientFacade);

  /** Le jour de l'écran, une fois : borne du sélecteur et repère de l'âge. */
  protected readonly today = parisToday();
  protected readonly issuedOn = signal('');
  protected readonly refusal = signal<string | null>(null);
  protected readonly sending = signal(false);

  protected readonly canSubmit = computed(() => this.issuedOn() !== '' && !this.sending());

  /** L'extrait a-t-il plus de 3 mois ? Seulement une fois la date saisie. */
  protected readonly olderThanFresh = computed(() => {
    const day = this.issuedOn();
    return day !== '' && kbisAgeOf(day, this.today) !== 'fresh';
  });

  protected setIssuedOn(day: string): void {
    this.issuedOn.set(day);
    this.refusal.set(null);
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }
    this.sending.set(true);
    try {
      this.refusal.set(await this.fiche.certifyKbis(this.issuedOn()));
    } finally {
      this.sending.set(false);
    }
  }

  protected cancel(): void {
    this.fiche.certifyingKbis.set(false);
  }
}
