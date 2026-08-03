import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { ActivationPiece, PieceMode, PlatformSettings } from '@lfd/contracts';
import { FoldButtonComponent, FoldCardComponent, FoldSelectComponent } from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { PlatformSettingsService } from '../platform-settings.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Une pièce d'activation présentée en Réglages : sa clé + son libellé. */
interface PieceRow {
  readonly key: ActivationPiece;
  readonly label: string;
  readonly hint: string;
}

const PIECES: readonly PieceRow[] = [
  { key: 'tva', label: 'Numéro de TVA', hint: 'Exigé pour les formes juridiques assujetties.' },
  { key: 'kbis', label: 'Extrait KBIS', hint: "Dépôt de l'extrait KBIS du client." },
  { key: 'billing', label: 'Adresse de facturation', hint: 'Adresse à laquelle facturer.' },
  {
    key: 'delivery',
    label: 'Adresse de livraison',
    hint: "Masquez-la tant que le service de livraison n'existe pas.",
  },
];

const MODES: readonly { readonly value: PieceMode; readonly label: string }[] = [
  { value: 'hidden', label: 'Masquée' },
  { value: 'optional', label: 'Optionnelle' },
  { value: 'required', label: 'Requise' },
];

/**
 * Sous-page **Activation client** des Réglages (staff) — configure les **pièces
 * d'activation** : masquée / optionnelle / requise. Global à la plateforme (pas
 * par société). Pilote le masquage UI (client + admin) et le gate d'activation.
 * Cf. `documentation/architecture-activation-configuration-b2b.md`.
 */
@Component({
  selector: 'app-reglages-activation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldSelectComponent, FoldButtonComponent],
  templateUrl: './reglages-activation-page.html',
  styleUrl: './reglages-activation-page.scss',
})
export class ReglagesActivationPage {
  private readonly service = inject(PlatformSettingsService);
  private readonly notify = inject(NotifyService);

  protected readonly pieces = PIECES;
  protected readonly modes = MODES;

  protected readonly state = signal<LoadState>('loading');
  protected readonly settings = signal<PlatformSettings | null>(null);
  protected readonly saving = signal(false);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.settings.set(await this.service.get());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Change le mode d'une pièce (localement ; la sauvegarde est explicite). */
  protected onMode(key: ActivationPiece, value: string): void {
    const mode = MODES.find((m) => m.value === value);
    const current = this.settings();
    if (mode === undefined || current === null) {
      return;
    }
    this.settings.set({ ...current, [key]: mode.value });
  }

  protected async save(): Promise<void> {
    const settings = this.settings();
    if (settings === null || this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      await this.service.save(settings);
      this.notify.success('Réglages enregistrés.');
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.saving.set(false);
    }
  }
}
