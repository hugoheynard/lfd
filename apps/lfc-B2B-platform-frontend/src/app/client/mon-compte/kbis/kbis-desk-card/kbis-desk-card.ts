import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FoldButtonComponent, FoldIconComponent, FoldPanelHostService } from 'fold-ng';

import { CompletionCallout } from '../../completion/completion-callout/completion-callout';
import type { CompletionItem, CompletionTarget } from '../../completion/completion-items';
import { ClientCompany } from '../../../client-company.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { KbisPanel } from '../kbis-panel/kbis-panel';
import { canUploadKbis, kbisActionLabel, kbisFiledLabel, kbisStateLabel } from '../kbis-section';

/**
 * La carte **KBIS** du bureau : l'état de l'extrait, son fichier et sa date de
 * dépôt. Ses trois gestes d'avant — « Ouvrir », « Remplacer », « Déposer » —
 * n'avaient aucune action ; ils ouvrent désormais le panneau, où le fichier
 * s'ouvre, se télécharge et se remplace pour de vrai.
 *
 * ## 🔴 Elle montrait le KBIS d'une autre société
 *
 * « kbis-marchand-fils.pdf, vérifié le 14/02/2024 par Léa », écrit en dur. Il
 * vient de `GET /me` (`CompanyView.kbis`), qui ne porte ni le valideur, ni la
 * date de vérification, ni la taille : on ne les invente pas.
 */
@Component({
  selector: 'app-kbis-desk-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CompletionCallout, FoldButtonComponent, FoldIconComponent],
  templateUrl: './kbis-desk-card.html',
  styleUrl: './kbis-desk-card.scss',
})
export class KbisDeskCard {
  /** Ce qui manque dans cette carte (plan `plan-mon-compte-a-completer.md` §2.3) — la page le calcule. */
  readonly completion = input<readonly CompletionItem[]>([]);
  /** Compléter un élément : la page ouvre le dialogue de sa cible, le même que la synthèse du haut. */
  readonly completionAction = output<CompletionTarget>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly client = inject(ClientCompany);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly kbis = computed(() => this.client.company()?.kbis ?? null);
  protected readonly state = computed(() => kbisStateLabel(this.kbis(), this.t().account));
  protected readonly canUpload = computed(() => canUploadKbis(this.client.company()));

  protected readonly filed = computed(() => {
    const kbis = this.kbis();
    return kbis === null ? '' : kbisFiledLabel(kbis, this.t().account);
  });

  protected readonly action = computed(() => {
    const company = this.client.company();
    return company === null ? '' : kbisActionLabel(company, this.t().account);
  });

  protected open(): void {
    const company = this.client.company();
    if (company !== null) {
      KbisPanel.open(this.panels, company);
    }
  }
}
