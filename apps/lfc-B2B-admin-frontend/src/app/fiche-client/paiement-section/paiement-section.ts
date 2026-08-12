import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  DEFERRED_TERM_LABELS,
  deferredTermSchema,
  MANDATE_STATUS_LABELS,
  type DeferredTerm,
  type PaymentMandateView,
} from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDangerZoneComponent,
  FoldInlineConfirmComponent,
  FoldPageSectionComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { MandatPanel } from '../mandat/mandat-panel/mandat-panel';
import { MandatesService } from '../mandat/mandates.service';

/** Une ligne de la section : un moyen de règlement, et où il en est. */
interface PaymentMeanRow {
  readonly term: DeferredTerm;
  readonly label: string;
  readonly granted: boolean;
  /** Le client l'a demandé et il n'est pas encore accordé. */
  readonly requested: boolean;
}

/**
 * Un retrait possible, tel que la zone de danger l'affiche.
 *
 * `key` est soit un terme accordé, soit le mandat : une seule liste plutôt que
 * deux blocs, parce que du point de vue du client ce sont les mêmes dégâts —
 * quelque chose qu'il avait ne l'est plus.
 */
interface DangerousAction {
  readonly key: DeferredTerm | 'mandate';
  readonly label: string;
  readonly consequence: string;
  readonly question: string;
  /** Le mot exact à taper pour confirmer. */
  readonly match: string;
}

/**
 * Section **Moyens de paiement** d'une fiche client (staff).
 *
 * Les moyens sont **cumulatifs**. Payer à la commande n'est pas un réglage :
 * c'est le socle, offert à tout le monde, et il ne se retire pas. Ce qui
 * s'accorde, ce sont des **crédits** — régler plus tard —, et les accorder
 * n'enlève rien : un client au mensuel doit pouvoir régler une commande
 * ponctuelle à part. Dès qu'un crédit est accordé, il devient le **défaut** à
 * l'encaissement : c'est le régime négocié.
 *
 * Facturer au terme suppose de savoir encaisser : la section porte donc aussi
 * le **mandat de prélèvement**. Elle le charge et le mute elle-même plutôt que
 * de le faire remonter à la fiche — le mandat n'intéresse personne d'autre, et
 * la page qui l'héberge est déjà longue.
 *
 * Tout ce qui **retire** quelque chose au client est rassemblé en bas, dans une
 * zone de danger à saisie confirmée. Un « Retirer » posé à côté d'un
 * « Débloquer » finit par être cliqué, et le client ne l'apprend qu'à la
 * commande suivante — ou à l'échéance.
 */
@Component({
  selector: 'app-paiement-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FoldPageSectionComponent,
    FoldCardComponent,
    FoldCalloutComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldDangerZoneComponent,
    FoldInlineConfirmComponent,
  ],
  templateUrl: './paiement-section.html',
  styleUrl: './paiement-section.scss',
})
export class PaiementSection {
  private readonly mandates = inject(MandatesService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);

  /** La société concernée ; `null` tant qu'elle n'existe pas (mode ouverture). */
  readonly companyId = input<string | null>(null);
  /** Raison sociale — rappelée dans le panneau, pour ne pas mandater le mauvais compte. */
  readonly companyName = input('');
  /** E-mail du détenteur — préremplit le champ que Stripe exige sur un mandat SEPA. */
  readonly holderEmail = input('');
  /** Les crédits accordés — vide veut dire « paie à la commande », comme tout le monde. */
  readonly grantedTerms = input.required<readonly DeferredTerm[]>();
  /** Le crédit **demandé** par le client, en attente d'arbitrage ; `null` = aucun. */
  readonly requestedTerm = input<DeferredTerm | null>(null);

  /** Le staff change l'ensemble complet des crédits accordés. */
  readonly grantedTermsChange = output<readonly DeferredTerm[]>();

  protected readonly mandate = signal<PaymentMandateView | null>(null);
  /** Clé publique Stripe, rendue avec le mandat ; vide si le canal n'est pas configuré. */
  private readonly publishableKey = signal('');
  protected readonly busy = signal(false);

  constructor() {
    effect(() => {
      const id = this.companyId();
      if (id !== null) {
        void this.load(id);
      }
    });
  }

  protected readonly rows = computed<readonly PaymentMeanRow[]>(() => {
    const granted = this.grantedTerms();
    return deferredTermSchema.options.map((term) => ({
      term,
      label: DEFERRED_TERM_LABELS[term],
      granted: granted.includes(term),
      requested: this.requestedTerm() === term && !granted.includes(term),
    }));
  });

  /** Un crédit accordé signifie « facturé puis encaissé », donc un mandat à avoir. */
  protected readonly settlesOnAccount = computed(() => this.grantedTerms().length > 0);

  /** Un mandat sur lequel on peut prélever aujourd'hui. */
  protected readonly debitable = computed(() => this.mandate()?.status === 'active');

  /** Un mandat actif dont le papier signé manque : actif, mais sans filet. */
  protected readonly unproven = computed(
    () => this.debitable() && this.mandate()?.hasProof === false,
  );

  protected readonly statusLabel = computed(() => {
    const status = this.mandate()?.status;
    return status === undefined ? '' : MANDATE_STATUS_LABELS[status];
  });

  /**
   * Ce qui peut être retiré à ce client, à cet instant. Vide → pas de zone de
   * danger du tout : une section « dangereuse » toujours affichée cesse d'être
   * lue au bout de trois fiches.
   */
  protected readonly dangerous = computed<readonly DangerousAction[]>(() => {
    const credits = this.grantedTerms().map((term) => ({
      key: term,
      label: `Retirer le crédit « ${DEFERRED_TERM_LABELS[term]} »`,
      consequence: 'Le client devra régler à la commande, dès la prochaine.',
      question: `Retirer « ${DEFERRED_TERM_LABELS[term]} » à ce client ?`,
      match: DEFERRED_TERM_LABELS[term],
    }));
    const current = this.mandate();
    if (current === null || current.status !== 'active') {
      return credits;
    }
    return [
      ...credits,
      {
        key: 'mandate' as const,
        label: `Révoquer le mandat ••••${current.last4}`,
        consequence: 'Plus aucun prélèvement ne pourra partir sur ce compte.',
        question: 'Retirer l’autorisation de prélever ?',
        // Les 4 chiffres du compte : taper autre chose signifie qu'on ne
        // regardait pas la bonne fiche.
        match: current.last4,
      },
    ];
  });

  /** Accorde un crédit — l'ensemble complet part au serveur. */
  protected toggle(term: DeferredTerm): void {
    const granted = this.grantedTerms();
    const next = granted.includes(term)
      ? granted.filter((candidate) => candidate !== term)
      : [...granted, term];
    this.grantedTermsChange.emit(next);
  }

  /** Exécute un retrait confirmé de la zone de danger. */
  protected async runDanger(key: DeferredTerm | 'mandate'): Promise<void> {
    if (key === 'mandate') {
      await this.revoke();
      return;
    }
    this.toggle(key);
  }

  /** Ouvre la saisie d'IBAN, puis recharge : l'écran reflète ce qui a été écrit. */
  protected openMandatePanel(): void {
    const id = this.companyId();
    if (id === null || this.publishableKey() === '') {
      return;
    }
    const closed = this.panels.open(MandatPanel, {
      data: {
        companyId: id,
        companyName: this.companyName(),
        holderEmail: this.holderEmail(),
        publishableKey: this.publishableKey(),
      },
    }).closed;
    void closed.then(() => this.load(id));
  }

  protected async uploadProof(event: Event): Promise<void> {
    const picker = event.target as HTMLInputElement;
    const file = picker.files?.[0];
    const id = this.companyId();
    if (file === undefined || id === null) {
      return;
    }
    picker.value = '';
    await this.run(id, () => this.mandates.uploadProof(id, file), 'Mandat signé déposé.');
  }

  private async revoke(): Promise<void> {
    const id = this.companyId();
    if (id === null) {
      return;
    }
    await this.run(id, () => this.mandates.revoke(id), 'Mandat révoqué.');
  }

  /** Mute, annonce, recharge — le trio est le même pour les deux gestes. */
  private async run(companyId: string, mutate: () => Promise<void>, done: string): Promise<void> {
    this.busy.set(true);
    try {
      await mutate();
      this.notify.success(done);
      await this.load(companyId);
    } catch (error) {
      this.notify.error(error, "L'opération a échoué.");
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Charge le mandat courant. Un échec laisse la section **muette** plutôt que
   * bruyante : le mandat est un à-côté de la fiche, et un canal Stripe non
   * configuré ne doit pas couvrir l'écran d'erreurs à chaque ouverture.
   */
  private async load(companyId: string): Promise<void> {
    try {
      const section = await this.mandates.section(companyId);
      this.mandate.set(section.mandate);
      this.publishableKey.set(section.publishableKey);
    } catch {
      this.mandate.set(null);
      this.publishableKey.set('');
    }
  }
}
