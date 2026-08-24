import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import { CompanyIdentityFields, type CompanyIdentityDraft } from '@lfd/b2b-ui/company';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { AdminCompaniesService } from '../../../comptes-clients/admin-companies.service';

/** Charge d'ouverture : la société + l'identité souple courante (à préremplir). */
export interface AdminIdentitePanelData {
  readonly companyId: string;
  readonly enseigne: string;
  readonly vatNumber: string;
  /** Vide quand le compte a été ouvert sans papiers — le panneau les réclame alors. */
  readonly raisonSociale: string;
  readonly formeJuridique: string;
  readonly siret: string;
}

/**
 * Panneau **Identité** côté staff — édite l'identité d'une société à la place du
 * client (Porte B).
 *
 * Les cinq champs sont **toujours** présents et **tous** modifiables : côté
 * back-office le serveur corrige (`correctLegalIdentity`) là où le client ne
 * fait que compléter. Une faute de frappe saisie au comptoir se répare donc
 * ici, SIRET compris.
 *
 * Les champs eux-mêmes viennent de `lfd-company-identity-fields`, le fragment
 * que le formulaire client utilise déjà : deux copies avaient divergé, et
 * celle-ci affirmait encore que « la forme juridique impose un numéro de TVA »
 * sur un écran où aucune forme n'était choisie.
 */
@Component({
  selector: 'app-admin-identite-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldCalloutComponent,
    FoldButtonComponent,
    CompanyIdentityFields,
  ],
  templateUrl: './identite-panel.html',
  styleUrl: './identite-panel.scss',
})
export class AdminIdentitePanel {
  /**
   * Nature du panneau : tiroir latéral au large, **bottom-sheet** sur étroit
   * (`side: 'auto'`). Un tiroir de 490 px sur un téléphone, c'est un plein
   * écran qui feint d'être un côté ; la feuille par le bas dit ce qu'elle est
   * et laisse le pouce à portée du pied de panneau.
   *
   * Déclaré ICI : le côté appartient à la nature du panneau, pas au geste qui
   * l'ouvre — six call-sites répétant `side` finissent par diverger.
   */
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto' };

  private readonly service = inject(AdminCompaniesService);
  private readonly ref = inject(FoldPanelRef);
  private readonly notify = inject(NotifyService);

  readonly data = input.required<AdminIdentitePanelData>();

  protected readonly draft = signal<CompanyIdentityDraft>({
    raisonSociale: '',
    enseigne: '',
    formeJuridique: '',
    siret: '',
    vatNumber: '',
  });
  protected readonly submitting = signal(false);

  /**
   * Le compte a-t-il été ouvert sans ses papiers ? Se lit sur la donnée
   * **reçue**, jamais sur le brouillon : sinon l'avertissement disparaîtrait à
   * la première frappe, avant que quoi que ce soit soit enregistré.
   */
  protected readonly legalMissing = computed(() => {
    const data = this.data();
    return (
      data.raisonSociale.trim() === '' ||
      data.formeJuridique.trim() === '' ||
      data.siret.trim() === ''
    );
  });

  constructor() {
    // Préremplit à l'ouverture — **tous** les champs, y compris ceux du greffe.
    // Ne semer que l'enseigne et la TVA affichait des champs vides devant des
    // valeurs déjà enregistrées : le commercial croyait n'avoir rien saisi, et
    // renvoyait des chaînes vides pour ce qui existait déjà.
    effect(() => {
      const data = this.data();
      this.draft.set({
        raisonSociale: data.raisonSociale,
        enseigne: data.enseigne,
        formeJuridique: data.formeJuridique,
        siret: data.siret,
        vatNumber: data.vatNumber,
      });
    });
  }

  protected async submit(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    this.submitting.set(true);
    try {
      const draft = this.draft();
      await this.service.updateIdentity(this.data().companyId, {
        enseigne: draft.enseigne.trim(),
        vatNumber: draft.vatNumber.trim(),
        raisonSociale: draft.raisonSociale.trim(),
        formeJuridique: draft.formeJuridique.trim(),
        siret: draft.siret.trim(),
      });
      this.notify.success('Identité mise à jour.');
      this.ref.close(true);
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.submitting.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
