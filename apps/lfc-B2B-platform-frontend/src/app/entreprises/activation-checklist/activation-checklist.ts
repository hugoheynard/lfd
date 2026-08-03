import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FoldPanelHostService } from 'fold-ng';
import { CompanyActivationChecklist, type CompanyActivationStep } from '@lfd/b2b-ui/company';

import type { Company } from '../../account/account.model';
import { AccountService } from '../../account/account.service';
import { AdressePanel, type AdressePanelData } from '../../profil/adresse-panel/adresse-panel';
import { ActivationSupportPanel } from '../activation-support-panel/activation-support-panel';
import { AddressesService } from '../addresses.service';
import { EntrepriseIdentitePanel } from '../entreprise-identite-panel/entreprise-identite-panel';
import { PaymentTermPanel } from '../payment-term-panel/payment-term-panel';

/** Les étapes possibles du dossier d'activation. */
type StepKey = 'tva' | 'kbis' | 'billing' | 'delivery' | 'payment';

/** Une étape à faire, telle que le container la calcule (sans le `kind` d'UI). */
interface Step {
  readonly key: StepKey;
  readonly title: string;
  readonly detail: string;
  readonly cta: string;
}

/**
 * Encart **d'activation** côté **client** — _container_ de
 * `@lfd/b2b-ui/company`. Il calcule les étapes restantes (pièces manquantes),
 * les passe à la checklist présentationnelle et exécute les intentions (ouvrir
 * le bon panneau, déposer le KBIS). Le **récit** propre au client (intro avec le
 * lien boutique, demande de support) est **projeté** dans les slots de la vue —
 * la lib ne connaît ni cette route ni cette copie.
 */
@Component({
  selector: 'app-activation-checklist',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CompanyActivationChecklist],
  templateUrl: './activation-checklist.html',
  styleUrl: './activation-checklist.scss',
})
export class ActivationChecklist {
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly account = inject(AccountService);
  private readonly addresses = inject(AddressesService);

  readonly company = input.required<Company>();

  /** Réservé au gestionnaire pendant l'onboarding (`pending`). */
  protected readonly visible = computed(
    () => this.company().role === 'company_admin' && this.company().status === 'pending',
  );

  private readonly addressesView = this.addresses.view;

  constructor() {
    // S'assure que les adresses sont chargées (idempotent) pour connaître les manquants.
    effect(() => this.addresses.loadFor(this.company().id));
  }

  /** Les étapes restantes (les faites disparaissent). */
  private readonly steps = computed<readonly Step[]>(() => {
    const company = this.company();
    const view = this.addressesView();
    const steps: Step[] = [];

    if (company.vatNumberRequired && company.tvaIntracom.trim() === '') {
      steps.push({
        key: 'tva',
        title: 'Numéro de TVA',
        detail: 'Votre forme juridique nécessite un numéro de TVA intracommunautaire.',
        cta: 'Renseigner la TVA',
      });
    }
    if (company.kbis === null) {
      steps.push({
        key: 'kbis',
        title: 'Extrait KBIS',
        detail: "L'activation de votre compte passe par la réception de votre KBIS.",
        cta: 'Déposer le KBIS',
      });
    }
    if (view !== null && view.billing === null) {
      steps.push({
        key: 'billing',
        title: 'Adresse de facturation',
        detail: 'Renseignez l’adresse à laquelle facturer vos commandes.',
        cta: 'Ajouter la facturation',
      });
    }
    if (view !== null && view.deliveries.length === 0) {
      steps.push({
        key: 'delivery',
        title: 'Adresse de livraison',
        detail: 'Ajoutez au moins un point de livraison.',
        cta: 'Ajouter une livraison',
      });
    }
    // La condition de règlement a toujours un défaut : on invite à confirmer son choix.
    steps.push({
      key: 'payment',
      title: 'Condition de règlement',
      detail: 'Choisissez la condition de règlement souhaitée.',
      cta: 'Choisir la condition',
    });
    return steps;
  });

  /** Étapes projetées vers le view-model de la lib (ajout du `kind` d'UI). */
  protected readonly libSteps = computed<readonly CompanyActivationStep[]>(() =>
    this.steps().map((step) => ({ ...step, kind: step.key === 'kbis' ? 'file' : 'action' })),
  );

  /** Vrai quand il ne reste que la condition de règlement (les pièces sont là). */
  protected readonly ready = computed(() => this.steps().every((step) => step.key === 'payment'));

  /** Exécute l'action d'une étape (ouvre le bon panneau). */
  protected act(key: string): void {
    const company = this.company();
    if (key === 'tva') {
      this.panelHost.open(EntrepriseIdentitePanel, {
        data: {
          companyId: company.id,
          enseigne: company.enseigne,
          tvaIntracom: company.tvaIntracom,
        },
        side: 'right',
      });
    } else if (key === 'billing') {
      const data: AdressePanelData = { companyId: company.id, kind: 'facturation', address: null };
      this.panelHost.open(AdressePanel, { data, side: 'right' });
    } else if (key === 'delivery') {
      const data: AdressePanelData = {
        companyId: company.id,
        kind: 'livraison',
        address: null,
        knownContacts: [company.primaryContact, ...company.contacts].map((contact) => ({
          prenom: contact.firstName,
          nom: contact.lastName,
          telephone: contact.phone,
        })),
      };
      this.panelHost.open(AdressePanel, { data, side: 'right' });
    } else if (key === 'payment') {
      this.panelHost.open(PaymentTermPanel, {
        data: { companyId: company.id, current: company.paymentTerm },
        side: 'right',
      });
    }
  }

  /** Dépôt de fichier d'une étape (`kbis`). */
  protected onFile(payload: { readonly key: string; readonly file: File }): void {
    this.account.uploadKbis(this.company().id, payload.file);
  }

  /** Ouvre la demande de support (rappel / e-mail par l'équipe commerciale). */
  protected openSupport(): void {
    this.panelHost.open(ActivationSupportPanel, {
      data: { companyId: this.company().id },
      side: 'right',
    });
  }
}
