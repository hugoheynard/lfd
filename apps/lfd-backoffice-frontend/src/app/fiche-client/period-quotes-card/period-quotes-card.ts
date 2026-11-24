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
import { RouterLink } from '@angular/router';
import {
  instantToLocal,
  type CompanyPeriodQuoteState,
  type CompanyPeriodQuoteView,
  type CompanyPeriodQuotesView,
} from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { day, euros, instant, signedEuros } from '../../comptabilite/invoice-dossier-format';
import { PeriodQuotesService } from '../../comptabilite/period-quotes.service';
import { NotifyService } from '../../notify.service';
import { saveBlob } from '../../shared/download/save-blob';
import { GestureIntents } from '../../shared/gesture-intents';
import {
  PeriodQuoteCommitmentPanel,
  type PeriodQuoteCommitmentPanelData,
  type PeriodQuoteCommitmentResult,
} from '../period-quote-commitment-panel/period-quote-commitment-panel';

/** Ce que l'état d'une version dit, et sur quel ton. */
const STATES: Readonly<
  Record<CompanyPeriodQuoteState, { readonly label: string; readonly tone: 'warning' | 'success' }>
> = {
  awaiting: { label: 'En attente de l’engagement', tone: 'warning' },
  invoiced: { label: 'Facturé', tone: 'success' },
};

/** Une version telle que la carte la montre : ses mots sont écrits ici, une fois. */
export interface PeriodQuoteRow {
  readonly quote: CompanyPeriodQuoteView;
  readonly title: string;
  readonly stateLabel: string;
  readonly stateTone: 'warning' | 'success';
  readonly meta: string;
  /** « Remplace la version 1 (100,00 €) : écart +20,00 € », ou `null` pour une première version. */
  readonly replaced: string | null;
  readonly total: string;
}

/** La facture émise par « Engagement reçu », nommée après la relecture. */
export interface IssuedNotice {
  readonly invoiceId: string;
  readonly invoiceNumber: string;
  readonly quoteNumber: string;
}

/** `D-20261031-1 · version 2`. */
function titleOf(quote: CompanyPeriodQuoteView): string {
  return `${quote.number} · version ${String(quote.version)}`;
}

/** La période, les commandes, le rangement et le code service, en une ligne. */
export function quoteMeta(quote: CompanyPeriodQuoteView): string {
  // Le dernier jour est la veille de la clôture, à Paris.
  const lastDay = instantToLocal(new Date(new Date(quote.periodClosesAt).getTime() - 1)).day;
  const parts = [
    `Période du ${day(instantToLocal(new Date(quote.periodStartsAt)).day)} au ${day(lastDay)}`,
    `${String(quote.orderCount)} commande${quote.orderCount > 1 ? 's' : ''}`,
    `rangé et envoyé le ${instant(quote.createdAt)}`,
  ];
  if (quote.serviceCode !== null) {
    parts.push(`service ${quote.serviceCode}`);
  }
  return parts.join(' · ');
}

/** L'écart avec la version remplacée, lu sur le serveur : rien n'est recalculé ici. */
export function replacedSentence(quote: CompanyPeriodQuoteView): string | null {
  const replaced = quote.replaced;
  if (replaced === null) {
    return null;
  }
  return (
    `Remplace la version ${String(quote.version - 1)} (${euros(replaced.totalCents)}) : ` +
    `écart ${signedEuros(replaced.gapCents)}`
  );
}

export function quoteRow(quote: CompanyPeriodQuoteView): PeriodQuoteRow {
  const state = STATES[quote.state];
  return {
    quote,
    title: titleOf(quote),
    stateLabel: state.label,
    stateTone: state.tone,
    meta: quoteMeta(quote),
    replaced: replacedSentence(quote),
    total: euros(quote.totalCents),
  };
}

/**
 * **Les devis de période** de la fiche (plan
 * `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`,
 * § 6 sexies, QD7) : un organisme public sur devis reçoit, à la clôture, un
 * devis au lieu d'une facture ; la facture part quand son numéro
 * d'engagement revient. La carte liste les versions vivantes, leur état et
 * l'écart avec la version remplacée, et porte les deux gestes de la
 * comptabilité : « Renvoyer le devis » et « Engagement reçu ».
 *
 * Le devis appartient au PAYEUR : sur la fiche d'un site, ce sont ceux du
 * principal, et la carte le dit. Muette sans devis : un client qui n'en a
 * jamais eu n'a rien à y lire. Les refus du serveur s'affichent tels quels.
 */
@Component({
  selector: 'app-period-quotes-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './period-quotes-card.html',
  styleUrl: './period-quotes-card.scss',
})
export class PeriodQuotesCard {
  readonly companyId = input.required<string>();

  private readonly api = inject(PeriodQuotesService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);
  private readonly intents = new GestureIntents();

  protected readonly view = signal<CompanyPeriodQuotesView | null>(null);
  protected readonly loadError = signal(false);
  /** La version dont un geste ou un téléchargement est en cours. */
  protected readonly busy = signal<string | null>(null);
  protected readonly issued = signal<IssuedNotice | null>(null);

  protected readonly canWrite = computed(() => this.permissions.can('b2b_accounting:write'));
  protected readonly rows = computed(() => (this.view()?.quotes ?? []).map(quoteRow));
  /** Le payeur, quand la fiche est celle d'un site qui le suit ; `null` sur sa propre fiche. */
  protected readonly payerOfSite = computed(() => {
    const view = this.view();
    return view === null || view.payerCompanyId === this.companyId()
      ? null
      : { id: view.payerCompanyId, name: view.payerName };
  });
  protected readonly subtitle = computed(() => {
    const awaiting = this.rows().filter((row) => row.quote.state === 'awaiting').length;
    return awaiting === 0 ? 'Aucun en attente' : `${String(awaiting)} en attente de l’engagement`;
  });

  constructor() {
    effect(() => {
      const id = this.companyId();
      untracked(() => {
        this.issued.set(null);
        void this.load(id);
      });
    });
  }

  protected retry(): void {
    void this.load(this.companyId());
  }

  protected async download(quote: CompanyPeriodQuoteView): Promise<void> {
    this.busy.set(quote.quoteId);
    try {
      saveBlob(
        await this.api.document(quote.quoteId),
        `${quote.number}-v${String(quote.version)}.pdf`,
      );
    } catch (error) {
      this.notify.error(error, `Le PDF du devis ${quote.number} n’a pas pu être téléchargé.`);
    } finally {
      this.busy.set(null);
    }
  }

  protected async resend(quote: CompanyPeriodQuoteView): Promise<void> {
    if (this.busy() !== null) {
      return;
    }
    this.busy.set(quote.quoteId);
    try {
      const sent = await this.api.resend(quote.quoteId, this.intents.keyFor(quote.quoteId));
      this.intents.done(quote.quoteId);
      this.notify.success(
        sent.quoteId === quote.quoteId
          ? `Le devis ${quote.number} est reparti.`
          : `Les commandes avaient changé : une nouvelle version du devis ${quote.number} est rangée et envoyée.`,
      );
      await this.load(this.companyId());
    } catch (error) {
      this.notify.error(error, `Le devis ${quote.number} n’a pas pu être renvoyé.`);
    } finally {
      this.busy.set(null);
    }
  }

  protected async receiveCommitment(quote: CompanyPeriodQuoteView): Promise<void> {
    const view = this.view();
    if (view === null) {
      return;
    }
    const data: PeriodQuoteCommitmentPanelData = {
      quoteId: quote.quoteId,
      number: quote.number,
      version: quote.version,
      payerName: view.payerName,
      totalCents: quote.totalCents,
    };
    const result = await this.panels.open<
      PeriodQuoteCommitmentPanelData,
      PeriodQuoteCommitmentResult
    >(PeriodQuoteCommitmentPanel, { data, width: 'md' }).closed;
    if (result === undefined) {
      return;
    }
    await this.load(this.companyId());
    const invoiced = this.view()?.quotes.find(
      (candidate) => candidate.invoice?.invoiceId === result.invoiceId,
    );
    const invoiceNumber = invoiced?.invoice?.number ?? null;
    this.issued.set(
      invoiceNumber === null
        ? null
        : { invoiceId: result.invoiceId, invoiceNumber, quoteNumber: quote.number },
    );
    this.notify.success(
      invoiceNumber === null
        ? `Engagement enregistré : la facture du devis ${quote.number} est émise.`
        : `Engagement enregistré : la facture ${invoiceNumber} est émise.`,
    );
  }

  private async load(companyId: string): Promise<void> {
    this.loadError.set(false);
    try {
      this.view.set(await this.api.ofCompany(companyId));
    } catch {
      this.loadError.set(true);
    }
  }
}
