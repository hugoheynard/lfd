import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { EXPORT_READER_KEY_IPS_MAX } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDateComponent,
  FoldInputComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldTextareaComponent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { parisToday } from '../../shared/paris-today';
import { ExportKeysService } from '../export-keys.service';

/** Borne du libellé, celle du contrat. */
const LABEL_MAX = 120;

/** L'échéance proposée : un an, assez pour une saison, et une clé oubliée meurt seule. */
function inOneYear(now: Date): string {
  const next = new Date(now);
  next.setFullYear(next.getFullYear() + 1);
  return parisToday(next);
}

/** Une adresse par ligne ; les lignes vides ne comptent pas. */
function ipLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/**
 * **Créer une clé d'export** — un libellé, une échéance, les adresses admises.
 * Sur un succès, le panneau montre le secret UNE fois, avec de quoi le copier ;
 * le fermer l'efface de la mémoire du composant. Le serveur reste juge de la
 * forme d'une adresse et d'une échéance passée.
 */
@Component({
  selector: 'app-export-key-issue-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDateComponent,
    FoldInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './export-key-issue-panel.html',
  styleUrl: './export-key-issue-panel.scss',
})
export class ExportKeyIssuePanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  private readonly api = inject(ExportKeysService);
  private readonly panel = inject(FoldPanelRef);
  private readonly notify = inject(NotifyService);

  protected readonly today = parisToday();
  protected readonly label = signal('');
  protected readonly expiresOn = signal(inOneYear(new Date()));
  protected readonly ipsText = signal('');
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);
  /** Le secret, tenu le temps de le coller — et pas plus. */
  protected readonly secret = signal<string | null>(null);

  /** Ce qui empêche l'envoi, en clair — ou `''`. */
  protected readonly issue = computed(() => {
    const label = this.label().trim();
    if (label === '') return 'Nommez le lecteur de la clé (par exemple « Direction »).';
    if (label.length > LABEL_MAX) return `Le libellé tient en ${LABEL_MAX} signes.`;
    if (this.expiresOn() === '') return 'Choisissez une échéance.';
    if (this.expiresOn() <= this.today) return 'L’échéance est un jour à venir.';
    if (ipLines(this.ipsText()).length > EXPORT_READER_KEY_IPS_MAX) {
      return `${EXPORT_READER_KEY_IPS_MAX} adresses au plus : au-delà, créez une autre clé.`;
    }
    return '';
  });

  protected readonly pristine = computed(() => this.label() === '');

  protected async submit(): Promise<void> {
    if (this.issue() !== '' || this.saving()) return;
    this.saving.set(true);
    this.refusal.set(null);
    try {
      const issued = await this.api.issue({
        label: this.label().trim(),
        // Fin du jour choisi, à l'heure du poste : la clé vaut tout ce jour-là.
        expiresAt: new Date(`${this.expiresOn()}T23:59:59`).toISOString(),
        allowedIps: ipLines(this.ipsText()),
      });
      this.secret.set(issued.secret);
    } catch (error) {
      // Un rejeu (409) dit de révoquer et d'en créer une autre : le message du serveur.
      this.refusal.set(httpErrorMessage(error, 'La clé n’a pas pu être créée.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async copy(): Promise<void> {
    const secret = this.secret();
    if (secret === null) return;
    try {
      await navigator.clipboard.writeText(secret);
      this.notify.success('Clé copiée.');
    } catch {
      this.notify.info('Copie refusée par le navigateur : sélectionnez la clé et copiez-la.');
    }
  }

  /** Fermer efface le secret : rien ne le garde après ce panneau. */
  protected close(): void {
    const created = this.secret() !== null;
    this.secret.set(null);
    this.panel.close(created ? 'created' : undefined);
  }
}
