import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { CompanyBankAccountView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { BankAccountService } from '../bank-account/bank-account.service';
import {
  MandatePreviewPanel,
  type MandatePreviewPanelData,
} from '../mandate-preview-panel/mandate-preview-panel';

/**
 * **Les zones facultatives du mandat**, et l'aperçu qui les montre en place.
 *
 * ## Ce qu'elles sont
 *
 * Les zones 14, 19 et 20 du modèle EPC : le code que le débiteur veut voir
 * revenir sur son relevé, le numéro du contrat, sa description. La norme les
 * range sous « fournies seulement à titre indicatif » — aucune ne conditionne
 * la validité du mandat, et les laisser vides est parfaitement normal.
 *
 * ⚠️ Les zones du **tiers** (15 à 18) ne sont pas offertes à la saisie, et c'est
 * délibéré : les deux premières désignent un tiers débiteur, que seul le
 * signataire connaît ; les deux autres un tiers créancier, qui n'existe pas tant
 * que nous n'encaissons pour personne. Offrir un champ pour ce qu'on ne peut pas
 * savoir fait inventer.
 *
 * ## Pourquoi elles ont leur propre bouton
 *
 * Le `PUT` du RIB exige l'IBAN, qui ne redescend jamais. Les faire passer par
 * lui obligerait à ressaisir un IBAN pour corriger une ligne de texte — le geste
 * qui finit par une faute de frappe sur un compte bancaire.
 */
@Component({
  selector: 'app-mandate-options-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldInputComponent, FoldButtonComponent],
  templateUrl: './mandate-options-section.html',
  styleUrl: './mandate-options-section.scss',
})
export class MandateOptionsSection {
  private readonly accounts = inject(BankAccountService);
  private readonly notify = inject(NotifyService);
  private readonly panels = inject(FoldPanelHostService);

  readonly companyId = input<string | null>(null);
  /** Raison sociale — titre du dialog, et rien d'autre. */
  readonly companyLabel = input('');
  /** Le RIB connu ; `null` tant qu'il n'y en a pas. */
  readonly account = input<CompanyBankAccountView | null>(null);

  protected readonly busy = signal(false);
  private readonly touched = signal(false);

  protected readonly debtorReferenceDraft = signal('');
  protected readonly contractNumberDraft = signal('');
  protected readonly contractDescriptionDraft = signal('');

  constructor() {
    // Le RIB arrive de façon ASYNCHRONE : le bloc voisin le charge et le fait
    // remonter, donc `account()` est `null` au premier rendu. Un effet suit ce
    // qui arrive ; le lire une fois dans le constructeur ne verrait jamais rien.
    //
    // ⚠️ Il ne réécrit pas ce que quelqu'un est en train de taper. Sans cette
    // garde, la relecture qui suit l'enregistrement du RIB voisin écraserait
    // une saisie en cours — et l'écran ne le dirait pas.
    effect(() => {
      const saved = this.account();
      if (saved === null || this.touched()) {
        return;
      }
      this.debtorReferenceDraft.set(saved.debtorReference);
      this.contractNumberDraft.set(saved.contractNumber);
      this.contractDescriptionDraft.set(saved.contractDescription);
    });
  }

  /**
   * Sans RIB, rien de tout ceci n'est possible : ces zones vivent sur la même
   * ligne que lui, et le serveur refuse. Le dire ICI plutôt que laisser cliquer
   * — un refus qu'on pouvait prévoir se lit comme une panne.
   */
  protected readonly ready = computed(() => this.companyId() !== null && this.account() !== null);

  protected async save(): Promise<void> {
    const id = this.companyId();
    if (id === null || !this.ready()) {
      return;
    }

    this.busy.set(true);
    try {
      await this.accounts.saveOptions(id, {
        debtorReference: this.debtorReferenceDraft().trim(),
        contractNumber: this.contractNumberDraft().trim(),
        contractDescription: this.contractDescriptionDraft().trim(),
      });
      this.notify.success('Zones facultatives enregistrées.');
    } catch (error) {
      this.notify.error(error, "Les zones facultatives n'ont pas été enregistrées.");
    } finally {
      this.busy.set(false);
    }
  }

  /** Ouvre l'aperçu du mandat dans un dialog central. */
  protected preview(): void {
    const id = this.companyId();
    if (id === null) {
      return;
    }
    this.panels.open<MandatePreviewPanelData>(MandatePreviewPanel, {
      data: { companyId: id, companyLabel: this.companyLabel() },
    });
  }

  protected markTouched(): void {
    this.touched.set(true);
  }
}
