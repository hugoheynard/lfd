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
  LEGAL_FORM_OPTIONS,
  legalFormRequiresVat,
  toLegalForm,
  type LegalForm,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldInputComponent,
  FoldListboxComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldSelectOption,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { AdminCompaniesService } from '../../../comptes-clients/admin-companies.service';

/** Charge d'ouverture : la société + l'identité souple courante (à préremplir). */
export interface AdminIdentitePanelData {
  readonly companyId: string;
  readonly enseigne: string;
  readonly tvaIntracom: string;
  /** Vide quand le compte a été ouvert sans papiers — le panneau les réclame alors. */
  readonly raisonSociale: string;
  readonly formeJuridique: string;
  readonly siret: string;
}

/**
 * Panneau **Identité** côté staff — édite l'identité **souple** d'une société
 * (enseigne + n° de TVA) à la place du client (Porte B).
 *
 * Il réclame **aussi** forme juridique et SIRET quand ils manquent : un compte
 * peut s'ouvrir sans papiers (le commercial est chez le client), et sans eux il
 * ne pourra jamais être activé — un compte ouvert pour rien. Ces deux champs
 * n'apparaissent donc que s'ils sont vides : une fois posés, ils sont figés, et
 * un champ qu'on ne peut pas changer n'a rien à faire dans un formulaire.
 */
@Component({
  selector: 'app-admin-identite-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldButtonComponent,
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

  protected readonly enseigne = signal('');
  protected readonly tvaIntracom = signal('');
  protected readonly raisonSociale = signal('');
  protected readonly formeJuridique = signal('');
  protected readonly siret = signal('');
  protected readonly submitting = signal(false);

  /** Les formes du catalogue — la liste vient du contrat, pas de l'écran. */
  protected readonly legalForms: readonly FoldSelectOption<LegalForm>[] = LEGAL_FORM_OPTIONS.map(
    (option) => ({ value: option.value, label: option.label }),
  );

  /**
   * La TVA est-elle obligatoire pour la forme choisie ? Sans forme reconnue on
   * répond OUI — le même défaut prudent que le serveur : inviter à renseigner
   * plutôt que laisser manquer en silence.
   */
  protected readonly vatRequired = computed(() => {
    const form = toLegalForm(this.formeJuridique());
    return form === null ? true : legalFormRequiresVat(form);
  });

  /**
   * Le compte a-t-il été ouvert sans ses papiers ? Ne commande plus l'affichage
   * des champs — ils sont TOUS là, toujours — seulement le mot qui rappelle que
   * l'activation restera bloquée tant qu'ils manquent.
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
      this.enseigne.set(data.enseigne);
      this.tvaIntracom.set(data.tvaIntracom);
      this.raisonSociale.set(data.raisonSociale);
      this.formeJuridique.set(data.formeJuridique);
      this.siret.set(data.siret);
    });
  }

  protected async submit(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    this.submitting.set(true);
    try {
      await this.service.updateIdentity(this.data().companyId, {
        enseigne: this.enseigne().trim(),
        tvaIntracom: this.tvaIntracom().trim(),
        raisonSociale: this.raisonSociale().trim(),
        formeJuridique: this.formeJuridique().trim(),
        siret: this.siret().trim(),
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
