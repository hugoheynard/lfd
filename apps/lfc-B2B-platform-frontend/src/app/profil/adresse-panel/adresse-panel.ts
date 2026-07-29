import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import {
  FoldButtonComponent,
  FoldCheckboxComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import type { Adresse, AdresseKind } from '../../data/profil.model';
import { type AdresseDraft, ProfilService } from '../../data/profil.service';

/** Charge d'ouverture : le type d'adresse et, en édition, l'adresse visée. */
export interface AdressePanelData {
  readonly kind: AdresseKind;
  /** Adresse à éditer ; `null` = création (livraison uniquement). */
  readonly address: Adresse | null;
}

/**
 * Panneau **Adresse** — crée ou édite une adresse de facturation (unique) ou de
 * livraison (plusieurs, une par défaut). Le drapeau « par défaut » n'apparaît
 * que pour les livraisons.
 */
@Component({
  selector: 'app-adresse-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldInputComponent,
    FoldCheckboxComponent,
    FoldButtonComponent,
  ],
  templateUrl: './adresse-panel.html',
  styleUrl: './adresse-panel.scss',
})
export class AdressePanel {
  private readonly profil = inject(ProfilService);
  private readonly ref = inject(FoldPanelRef);

  readonly data = input<AdressePanelData | undefined>(undefined);

  private readonly source = computed(() => this.data()?.address ?? null);

  protected readonly kind = computed<AdresseKind>(() => this.data()?.kind ?? 'livraison');
  protected readonly isLivraison = computed(() => this.kind() === 'livraison');
  protected readonly isCreate = computed(() => this.source() === null);

  protected readonly label = signal('');
  protected readonly ligne1 = signal('');
  protected readonly ligne2 = signal('');
  protected readonly codePostal = signal('');
  protected readonly ville = signal('');
  protected readonly pays = signal('France');
  protected readonly isDefaut = signal(false);

  constructor() {
    // Préremplit les champs quand une adresse est fournie (édition). L'input est
    // fixé à l'ouverture et ne change plus : l'effet sème une seule fois.
    effect(() => {
      const src = this.source();
      if (src === null) {
        return;
      }
      this.label.set(src.label);
      this.ligne1.set(src.ligne1);
      this.ligne2.set(src.ligne2);
      this.codePostal.set(src.codePostal);
      this.ville.set(src.ville);
      this.pays.set(src.pays);
      this.isDefaut.set(src.isDefaut);
    });
  }

  protected readonly heading = computed(() => {
    if (this.kind() === 'facturation') {
      return 'Adresse de facturation';
    }
    return this.isCreate() ? 'Nouvelle adresse de livraison' : "Modifier l'adresse de livraison";
  });

  protected readonly canSubmit = computed(
    () =>
      this.ligne1().trim() !== '' && this.codePostal().trim() !== '' && this.ville().trim() !== '',
  );

  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    const draft: AdresseDraft = {
      label: this.label().trim(),
      ligne1: this.ligne1().trim(),
      ligne2: this.ligne2().trim(),
      codePostal: this.codePostal().trim(),
      ville: this.ville().trim(),
      pays: this.pays().trim(),
      isDefaut: this.isDefaut(),
    };
    if (this.kind() === 'facturation') {
      this.profil.updateBillingAddress(draft);
    } else {
      this.profil.saveDeliveryAddress(draft, this.source()?.id ?? null);
    }
    this.ref.close(true);
  }

  protected cancel(): void {
    this.ref.close();
  }
}
