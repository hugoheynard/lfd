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
import { sirenFollowingSiret } from '@lfd/b2b-ui/company';
import {
  LEGAL_FORM_OPTIONS,
  legalFormRequiresVat,
  toLegalForm,
  type CompanyView,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { AccountService, type IdentityDraft } from '../../../../account/account.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { dialogSide } from '../../../panel-side';
import { canEditIdentity, legalFormLabelOf } from '../identity-section';

/**
 * Les mentions du greffe : le client les COMBLE, il ne les corrige pas. Le SIREN
 * les a rejointes le 2026-09-15 — sous le SIRET, et au même régime (décision de
 * Hugo : compléter seulement, la correction passe par le commercial).
 */
const LEGAL_FIELDS = ['raisonSociale', 'formeJuridique', 'siret', 'siren'] as const;
type LegalField = (typeof LEGAL_FIELDS)[number];

type LegalDraft = Record<LegalField, string>;

const EMPTY_LEGAL: LegalDraft = { raisonSociale: '', formeJuridique: '', siret: '', siren: '' };

/** Charge d'ouverture : la société visée et ce que la carte en montrait. */
export interface IdentityPanelData extends LegalDraft {
  readonly companyId: string;
  readonly enseigne: string;
  readonly vatNumber: string;
  /**
   * `owner`/`admin` : ceux que l'API laisse écrire. Les autres ouvrent le même
   * panneau en LECTURE — toutes les mentions, aucun champ, aucun Enregistrer.
   */
  readonly editable: boolean;
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
 *
 * ## La forme juridique est une liste, et elle décide de la TVA
 *
 * Le catalogue fermé de `@lfd/contracts`, comme dans l'admin : la valeur
 * écrite est la clé (`sas`, `micro`…), la même que `company-identity-fields`.
 * La forme retenue — choisie ici si elle manque, enregistrée sinon — MARQUE la
 * TVA obligatoire ou facultative. Le marqueur n'est qu'une invitation :
 * aucune écriture d'identité ne refuse l'absence de TVA côté serveur (vérifié
 * le 2026-09-15, `Company` et `update-company-identity.handler.ts`), donc
 * Enregistrer ne l'attend jamais — sans quoi un client sans son numéro sous
 * la main ne pourrait plus poser ni sa forme ni son enseigne.
 */
@Component({
  selector: 'app-identity-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldListboxComponent,
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
   * encre derrière un formulaire, qui doit rester lisible. C'est une SAISIE :
   * dialogue centré au bureau, et en pile {@link IdentityPanel.open} ouvre en
   * `bottom` (`dialogSide()`, règle « Saisir » du `CLAUDE.md` de l'app,
   * 2026-09-14). `md` (490 px) : cinq champs l'un sous l'autre (échelle
   * `FoldPanelSize`). Le nom `*-panel` est d'avant cette règle.
   */
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  /**
   * Ouvre le panneau depuis l'une ou l'autre carte. Les valeurs partent en
   * `data` au moment du clic : le panneau édite ce que la carte montrait, et
   * la relecture de `/me` qui suit un succès ne le réécrit pas sous les doigts.
   */
  static async open(
    panels: FoldPanelHostService,
    company: CompanyView,
    stack = false,
  ): Promise<boolean> {
    const ref = panels.open<IdentityPanelData, boolean>(IdentityPanel, {
      side: dialogSide(),
      stack,
      data: {
        companyId: company.id,
        enseigne: company.enseigne,
        vatNumber: company.vatNumber,
        raisonSociale: company.raisonSociale,
        formeJuridique: company.formeJuridique,
        siret: company.siret,
        siren: company.siren,
        editable: canEditIdentity(company),
      },
    });
    return (await ref.closed) === true;
  }

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
      siren: copy.identitySiren,
    };
    return LEGAL_FIELDS.map((key) => {
      const raw = data[key].trim();
      // La forme se lit par son libellé ; ce que le catalogue ne reconnaît pas, tel quel.
      const current = key === 'formeJuridique' ? legalFormLabelOf(raw) : raw;
      return { key, label: labels[key], current, locked: raw !== '' };
    });
  });

  /** En lecture, tout se lit : l'enseigne et la TVA rejoignent les mentions du greffe. */
  protected readonly readOnlyFacts = computed(() => {
    const data = this.data();
    const copy = this.t().account;
    const shown = (value: string): string => (value.trim() === '' ? copy.identityUnknown : value);
    return [
      { key: 'enseigne', label: copy.identityBrand, current: shown(data.enseigne) },
      { key: 'vatNumber', label: copy.identityVatField, current: shown(data.vatNumber) },
      ...this.legalFields().map((field) => ({ ...field, current: shown(field.current) })),
    ];
  });

  protected readonly lockedFields = computed(() => this.legalFields().filter((f) => f.locked));
  protected readonly openFields = computed(() => this.legalFields().filter((f) => !f.locked));

  /** Les formes du catalogue — la liste vient du contrat, pas de l'écran. */
  protected readonly legalForms = LEGAL_FORM_OPTIONS;

  /** Le choix en cours : seule la liste l'écrit, il est donc toujours une clé du catalogue. */
  protected readonly formChoice = computed(() => toLegalForm(this.legal().formeJuridique));

  private readonly formOpen = computed(() =>
    this.openFields().some((field) => field.key === 'formeJuridique'),
  );

  /** La forme qui décide de la TVA : celle qu'on choisit si elle manque, celle enregistrée sinon. */
  private readonly formForVat = computed(() =>
    this.formOpen() ? this.legal().formeJuridique : this.data().formeJuridique,
  );

  /** La forme retenue, si le catalogue la reconnaît. */
  private readonly knownForm = computed(() => toLegalForm(this.formForVat()));

  /**
   * Obligatoire seulement pour une forme CONNUE et assujettie. Vide ou hors
   * catalogue, le champ reste facultatif : `isVatRequiredFor` y répond `true`
   * par prudence (l'admin en dépend), mais ce serait affirmer une obligation
   * que rien ne permet d'établir.
   */
  protected readonly vatRequired = computed(() => {
    const form = this.knownForm();
    return form !== null && legalFormRequiresVat(form);
  });

  protected readonly vatHint = computed(() => {
    const copy = this.t().account;
    if (this.knownForm() === null) {
      return copy.identityVatUndecidedHint;
    }
    return this.vatRequired() ? copy.identityVatRequiredHint : copy.identityVatOptionalHint;
  });

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

  protected readonly canSave = computed(
    () => this.data().editable && !this.saving() && this.changed(),
  );

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

  /**
   * Le SIRET, et le SIREN qu'il **propose** quand ses neuf premiers chiffres en
   * forment un valide — seulement si le SIREN est encore à compléter, et tant
   * que le client ne l'a pas tapé lui-même (`sirenFollowingSiret`). Le serveur
   * fait foi et refuse une paire qui se contredit.
   */
  protected setSiret(value: string): void {
    const sirenOpen = this.openFields().some((field) => field.key === 'siren');
    this.legal.update((draft) => ({
      ...draft,
      siret: value,
      siren: sirenOpen ? sirenFollowingSiret(draft.siren, draft.siret, value) : draft.siren,
    }));
  }

  /** Le champ tapé : le SIRET passe par {@link setSiret}, qui fait suivre le SIREN. */
  protected type(key: LegalField, value: string): void {
    if (key === 'siret') {
      this.setSiret(value);
    } else {
      this.setLegal(key, value);
    }
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
      siren: legal('siren'),
    };
  }
}
