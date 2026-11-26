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
import type { InHouseRecapSummaryView, PayerInHouseRecapsView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { longDay } from '../../comptabilite/collection-month-wording';
import { NotifyService } from '../../notify.service';
import { saveBlob } from '../../shared/download/save-blob';
import { GestureIntents } from '../../shared/gesture-intents';
import { InHousePayerService } from '../in-house-payer-card/in-house-payer.service';
import { InHouseRecapsService } from './in-house-recaps.service';

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

/** `2026-10` → « octobre 2026 ». Découpé à la main : un mois n'a pas de fuseau. */
export function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  const name = MONTHS[Number(month) - 1];
  return name === undefined || year === undefined ? key : `${name} ${year}`;
}

/** Un récapitulatif tel que la carte le montre : ses mots sont écrits ici, une fois. */
export interface InHouseRecapRow {
  readonly recap: InHouseRecapSummaryView;
  readonly title: string;
  readonly meta: string;
  readonly replaced: boolean;
  /** « 2 BL révisés depuis l'émission », ou `null`. */
  readonly revised: string | null;
}

export function recapRow(recap: InHouseRecapSummaryView): InHouseRecapRow {
  const notes = `${String(recap.noteCount)} BL`;
  const count = recap.revisedNoteCount;
  return {
    recap,
    title: `${recap.number} · ${monthLabel(recap.month)}`,
    meta: `${notes} · émis le ${longDay(recap.issuedAt)}${recap.hasDocument ? '' : ' · PDF pas encore rangé'}`,
    replaced: recap.replacedById !== null,
    revised:
      count === 0
        ? null
        : `${String(count)} BL ${count > 1 ? 'révisés' : 'révisé'} depuis l’émission : réémettez pour que le récapitulatif dise les quantités remises.`,
  };
}

/**
 * **Les récapitulatifs des BL** d'un restaurant maison
 * (`comptabilite/facturation/plan-restaurants-maison.md`, D8–D10) : à la
 * place des factures, un document par mois, sans montant. La carte liste les
 * récapitulatifs (remplacés compris), les mois vides et les mois manqués,
 * signale les BL révisés, et porte le PDF, « Renvoyer l'e-mail » et
 * « Réémettre » — les deux gestes sous `b2b_in_house_payers:write`.
 *
 * Muette pour un client qui n'est pas maison et ne l'a jamais été : il n'a
 * rien à y lire. Les refus du serveur s'affichent tels quels.
 */
@Component({
  selector: 'app-in-house-recaps-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './in-house-recaps-card.html',
  styleUrl: './in-house-recaps-card.scss',
})
export class InHouseRecapsCard {
  readonly companyId = input.required<string>();

  private readonly api = inject(InHouseRecapsService);
  private readonly payers = inject(InHousePayerService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);
  private readonly intents = new GestureIntents();

  protected readonly view = signal<PayerInHouseRecapsView | null>(null);
  protected readonly inHouse = signal(false);
  protected readonly loadError = signal(false);
  /** Le récapitulatif dont un geste ou un téléchargement est en cours. */
  protected readonly busy = signal<string | null>(null);

  protected readonly canWrite = computed(() => this.permissions.can('b2b_in_house_payers:write'));
  protected readonly rows = computed(() => (this.view()?.recaps ?? []).map(recapRow));
  protected readonly emptyMonths = computed(() =>
    (this.view()?.emptyMonths ?? []).map(monthLabel).join(', '),
  );
  protected readonly missedMonths = computed(() =>
    (this.view()?.missedMonths ?? []).map(monthLabel).join(', '),
  );
  /** Maison aujourd'hui, ou l'ayant été : un récapitulatif, un mois vide ou manqué. */
  protected readonly visible = computed(() => {
    const view = this.view();
    return (
      this.inHouse() ||
      (view !== null && view.recaps.length + view.emptyMonths.length + view.missedMonths.length > 0)
    );
  });
  protected readonly subtitle = computed(() => {
    const revised = this.rows().filter((row) => row.revised !== null).length;
    return revised === 0 ? 'Quantités remises, sans montant' : `${String(revised)} à réémettre`;
  });

  constructor() {
    effect(() => {
      const id = this.companyId();
      untracked(() => void this.load(id));
    });
  }

  protected retry(): void {
    void this.load(this.companyId());
  }

  protected async download(recap: InHouseRecapSummaryView): Promise<void> {
    this.busy.set(recap.id);
    try {
      saveBlob(await this.api.document(recap.id), `${recap.number}.pdf`);
    } catch (error) {
      this.notify.error(
        error,
        `Le PDF du récapitulatif ${recap.number} n’a pas pu être téléchargé.`,
      );
    } finally {
      this.busy.set(null);
    }
  }

  protected async resend(recap: InHouseRecapSummaryView): Promise<void> {
    await this.gesture(recap, 'resend', async (key) => {
      await this.api.resend(recap.id, key);
      this.notify.success(`Le récapitulatif ${recap.number} est reparti par e-mail.`);
    });
  }

  protected async reissue(recap: InHouseRecapSummaryView): Promise<void> {
    await this.gesture(recap, 'reissue', async (key) => {
      await this.api.reissue(recap.id, key);
      this.notify.success(
        `Un rectificatif remplace le récapitulatif ${recap.number} ; il part par e-mail.`,
      );
    });
  }

  /** Un geste sous la clé d'intention de son sujet ; la liste est relue après. */
  private async gesture(
    recap: InHouseRecapSummaryView,
    kind: 'resend' | 'reissue',
    run: (intentKey: string) => Promise<void>,
  ): Promise<void> {
    if (this.busy() !== null) {
      return;
    }
    const subject = `${kind}:${recap.id}`;
    this.busy.set(recap.id);
    try {
      await run(this.intents.keyFor(subject));
      this.intents.done(subject);
      await this.load(this.companyId());
    } catch (error) {
      this.notify.error(
        error,
        kind === 'resend'
          ? `Le récapitulatif ${recap.number} n’a pas pu être renvoyé.`
          : `Le récapitulatif ${recap.number} n’a pas pu être réémis.`,
      );
    } finally {
      this.busy.set(null);
    }
  }

  private async load(companyId: string): Promise<void> {
    this.loadError.set(false);
    try {
      const [view, payer] = await Promise.all([
        this.api.ofCompany(companyId),
        this.payers.read(companyId),
      ]);
      this.view.set(view);
      this.inHouse.set(payer.inHouse);
    } catch {
      this.loadError.set(true);
    }
  }
}
