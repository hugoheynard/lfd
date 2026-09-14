import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { CompanyView, KbisView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldFileDropzoneComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';
import { firstValueFrom } from 'rxjs';

import { AccountService } from '../../../../account/account.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { panelSide } from '../../../panel-side';
import { canUploadKbis, kbisFiledLabel, kbisStateLabel } from '../kbis-section';

/** Le temps laissé à l'onglet ou au téléchargement pour lire le blob avant de le libérer. */
const OBJECT_URL_TTL_MS = 60_000;

/** Charge d'ouverture : la société, son extrait, et si l'on peut en déposer un. */
export interface KbisPanelData {
  readonly companyId: string;
  readonly kbis: KbisView | null;
  /** `owner`/`admin` : ceux que l'API laisse déposer (`ensureCompanyAdmin`). */
  readonly canManage: boolean;
}

/**
 * Le panneau **KBIS** de `/mon-compte` : l'état de l'extrait, le fichier à
 * ouvrir ou télécharger — pour tout membre —, et la zone de dépôt pour qui
 * gère la société.
 *
 * Ouvrir et télécharger passent par un **blob** : l'endpoint est authentifié,
 * un `<a href>` ne porterait pas le jeton. Un dépôt refusé reste affiché ici,
 * où l'on redépose ; un dépôt accepté ferme le panneau, et la relecture de
 * `/me` met la carte à jour.
 */
@Component({
  selector: 'app-kbis-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldFileDropzoneComponent,
    FoldPanelBodyComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './kbis-panel.html',
  styleUrl: './kbis-panel.scss',
})
export class KbisPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'right', width: 'md', surface: 'solid' };

  /** Ouvre le panneau depuis l'une ou l'autre carte, sur l'extrait tel que `/me` le porte. */
  static open(panels: FoldPanelHostService, company: CompanyView): void {
    panels.open(KbisPanel, {
      side: panelSide(),
      data: { companyId: company.id, kbis: company.kbis, canManage: canUploadKbis(company) },
    });
  }

  readonly data = input.required<KbisPanelData>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly account = inject(AccountService);
  private readonly ref = inject(FoldPanelRef);

  protected readonly saving = signal(false);
  /** Le message du dernier refus de dépôt, `null` tant qu'il n'y en a pas. */
  protected readonly refusal = signal<string | null>(null);
  protected readonly fetchFailed = signal(false);

  protected readonly kbis = computed(() => this.data().kbis);

  protected readonly state = computed(() => kbisStateLabel(this.kbis(), this.t().account));

  protected readonly filed = computed(() => {
    const kbis = this.kbis();
    return kbis === null ? '' : kbisFiledLabel(kbis, this.t().account);
  });

  protected readonly dropLabel = computed(() =>
    this.kbis() === null ? this.t().account.kbisDrop : this.t().account.kbisReplace,
  );

  protected async upload(files: readonly File[]): Promise<void> {
    const [file] = files;
    if (file === undefined || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    const refusal = await this.account.saveKbis(this.data().companyId, file);
    this.saving.set(false);
    if (refusal === null) {
      this.ref.close(true);
    } else {
      this.refusal.set(refusal);
    }
  }

  /** Ouvre l'extrait dans un nouvel onglet : le navigateur affiche le PDF. */
  protected open(): Promise<void> {
    return this.withBlob((url) => window.open(url, '_blank', 'noopener'));
  }

  /** Télécharge l'extrait sous son nom de dépôt. */
  protected download(): Promise<void> {
    const name = this.kbis()?.fileName ?? 'kbis.pdf';
    return this.withBlob((url) => {
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
    });
  }

  private async withBlob(use: (objectUrl: string) => void): Promise<void> {
    this.fetchFailed.set(false);
    try {
      const blob = await firstValueFrom(this.account.fetchKbis(this.data().companyId));
      const url = URL.createObjectURL(blob);
      use(url);
      setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_TTL_MS);
    } catch {
      this.fetchFailed.set(true);
    }
  }
}
