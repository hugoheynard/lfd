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
  EMPTY_MANDATE_OPTIONS_DRAFT,
  MandateOptionsForm,
  mandateOptionsDraftFrom,
  toMandateOptionsPayload,
  type MandateOptionsDraft,
} from '@lfd/b2b-ui/payment';
import type { CompanyBankAccountView } from '@lfd/contracts';
import { FoldButtonComponent, FoldCalloutComponent, FoldPanelHostService } from 'fold-ng';

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
 * Les zones 14 et 19 du modèle EPC : le code que le débiteur veut voir revenir
 * sur son relevé, et le numéro du contrat. La norme les range sous « fournies
 * seulement à titre indicatif » — aucune ne conditionne la validité du mandat,
 * et les laisser vides est parfaitement normal.
 *
 * ⚠️ La **zone 20** (description du contrat) n'est PAS ici : elle décrit ce que
 * nous vendons, pas ce que ce client-là a acheté, et vit donc sur l'entité
 * émettrice. La ressaisir par dossier aurait fait circuler deux formulations
 * chez des clients voisins, qui se parlent.
 *
 * ⚠️ Les zones du **tiers** (15 à 18) ne sont pas offertes à la saisie, et c'est
 * délibéré : les deux premières désignent un tiers débiteur, que seul le
 * signataire connaît ; les deux autres un tiers créancier, qui n'existe pas tant
 * que nous n'encaissons pour personne. Offrir un champ pour ce qu'on ne peut pas
 * savoir fait inventer.
 *
 * ## Le formulaire est partagé
 *
 * Les deux champs sont `lfd-mandate-options-form` de `@lfd/b2b-ui/payment`
 * (depuis le 2026-09-14), le même que le panneau des options de `/mon-compte`.
 * Cette section garde son texte, sa garde « sans RIB », l'aperçu et l'écriture.
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
  imports: [FoldCalloutComponent, FoldButtonComponent, MandateOptionsForm],
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

  protected readonly draft = signal<MandateOptionsDraft>(EMPTY_MANDATE_OPTIONS_DRAFT);

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
      this.draft.set(mandateOptionsDraftFrom(saved));
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
      await this.accounts.saveOptions(id, toMandateOptionsPayload(this.draft()));
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

  /** Une frappe dans le formulaire : elle devient le brouillon, et plus rien ne l'écrase. */
  protected edit(draft: MandateOptionsDraft): void {
    this.draft.set(draft);
    this.markTouched();
  }

  protected markTouched(): void {
    this.touched.set(true);
  }
}
