import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { AccountService, type IdentityDraft } from '../../../account/account.service';
import { ClientCopyService } from '../../copy/client-copy.service';

/** Les trois mentions du greffe : le client les COMBLE, il ne les corrige pas. */
const LEGAL_FIELDS = ['raisonSociale', 'formeJuridique', 'siret'] as const;
type LegalField = (typeof LEGAL_FIELDS)[number];

type LegalDraft = Record<LegalField, string>;

const EMPTY_LEGAL: LegalDraft = { raisonSociale: '', formeJuridique: '', siret: '' };

/** Charge d'ouverture : la société visée et ce que la carte en montrait. */
export interface IdentityPanelData extends LegalDraft {
  readonly companyId: string;
  readonly enseigne: string;
  readonly vatNumber: string;
}

/**
 * Le panneau **Identité légale** de `/mon-compte` — le premier de ses panneaux
 * d'édition, et celui que les suivants recopient : un panneau fold ouvert par
 * `FoldPanelHostService`, un `data` typé, Enregistrer armé seulement quand
 * quelque chose a changé, et un refus montré DANS le panneau resté ouvert.
 *
 * ## Deux régimes, et ce sont ceux du serveur
 *
 * L'enseigne et la TVA se réécrivent librement. Raison sociale, forme juridique
 * et SIRET ne sont retenus que s'ils **manquent** : une société peut ouvrir
 * sans papiers, et ils arrivent ensuite. Une mention déjà renseignée est
 * ignorée en silence par l'API (vérifié le 2026-09-14,
 * `update-company-identity.handler.ts`) — la montrer dans un champ laisserait
 * croire qu'on l'a changée. Elle se montre donc en lecture, avec la phrase qui
 * dit par où passer, et le panneau n'en envoie jamais la valeur.
 *
 * ## Pourquoi `saveIdentity` et pas `updateIdentity`
 *
 * Le rappel de `updateIdentity` ne part qu'au succès : sur un refus, le panneau
 * resterait figé sur « enregistrement ». La promesse retombe dans les deux cas,
 * et rend le message du serveur — un SIRET refusé se corrige ici, pas après un
 * toast déjà parti.
 */
@Component({
  selector: 'app-identity-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './identity-panel.html',
  styleUrl: './identity-panel.scss',
})
export class IdentityPanel {
  /**
   * OPAQUE : le verre par défaut laisserait transparaître la page crème et
   * encre derrière un formulaire, qui doit rester lisible. Le côté `right` est
   * celui du bureau ; en pile, la page ouvre en `bottom` au clic
   * (`ComptePage.openIdentity`), et l'appel l'emporte sur ce défaut.
   */
  static readonly foldPanel: FoldPanelDefaults = { side: 'right', width: 'md', surface: 'solid' };

  readonly data = input.required<IdentityPanelData>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly account = inject(AccountService);
  private readonly ref = inject(FoldPanelRef);

  protected readonly enseigne = signal('');
  protected readonly vatNumber = signal('');
  protected readonly legal = signal<LegalDraft>(EMPTY_LEGAL);

  protected readonly saving = signal(false);
  /** Le message du dernier refus, `null` tant qu'il n'y en a pas. */
  protected readonly refusal = signal<string | null>(null);

  /** Les mentions légales, chacune avec sa valeur en base et son régime. */
  protected readonly legalFields = computed(() => {
    const data = this.data();
    const copy = this.t().account;
    const labels: LegalDraft = {
      raisonSociale: copy.identityCompany,
      formeJuridique: copy.identityForm,
      siret: copy.identitySiret,
    };
    return LEGAL_FIELDS.map((key) => {
      const current = data[key].trim();
      return { key, label: labels[key], current, locked: current !== '' };
    });
  });

  protected readonly lockedFields = computed(() => this.legalFields().filter((f) => f.locked));
  protected readonly openFields = computed(() => this.legalFields().filter((f) => !f.locked));

  /** Rien à envoyer tant que le brouillon dit ce que la base dit déjà. */
  protected readonly changed = computed(() => {
    const data = this.data();
    const draft = this.legal();
    return (
      this.enseigne().trim() !== data.enseigne.trim() ||
      this.vatNumber().trim() !== data.vatNumber.trim() ||
      this.openFields().some((field) => draft[field.key].trim() !== '')
    );
  });

  protected readonly canSave = computed(() => !this.saving() && this.changed());

  constructor() {
    // Un effet plutôt que le constructeur : une entrée requise n'est pas encore
    // posée quand celui-ci tourne. Seul `data` est une dépendance légitime.
    effect(() => {
      const data = this.data();
      untracked(() => {
        this.enseigne.set(data.enseigne);
        this.vatNumber.set(data.vatNumber);
        this.legal.set(EMPTY_LEGAL);
      });
    });
  }

  protected setLegal(key: LegalField, value: string): void {
    this.legal.update((draft) => ({ ...draft, [key]: value }));
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    const refusal = await this.account.saveIdentity(this.data().companyId, this.payload());
    this.saving.set(false);
    if (refusal === null) {
      this.ref.close(true);
    } else {
      this.refusal.set(refusal);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }

  /**
   * Ce qui part. Une mention déjà renseignée part VIDE, jamais avec sa valeur :
   * le serveur l'ignorerait de toute façon, et ne rien envoyer est la seule
   * façon de ne pas dépendre de ce qu'il ignore.
   */
  private payload(): IdentityDraft {
    const draft = this.legal();
    const locked = new Set(this.lockedFields().map((field) => field.key));
    const legal = (key: LegalField): string => (locked.has(key) ? '' : draft[key].trim());
    return {
      enseigne: this.enseigne().trim(),
      vatNumber: this.vatNumber().trim(),
      raisonSociale: legal('raisonSociale'),
      formeJuridique: legal('formeJuridique'),
      siret: legal('siret'),
    };
  }
}
