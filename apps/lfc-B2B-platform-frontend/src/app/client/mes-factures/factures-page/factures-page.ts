import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

import { formatEuro } from '../../cart-total';
import { ClientBannerOutlet } from '../../nav/client-banner';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { ClientChrome } from '../../client-chrome.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import type { LedgerMonth } from '../../mock-statement';
import { MOCK_LEDGER, MOCK_STATEMENT_SUM } from '../../mock-statement';
import { LedgerMonthRow } from '../ledger-month/ledger-month';

/** Une année du relevé — la seule rupture de l'écran. */
interface LedgerYear {
  readonly year: string;
  readonly months: readonly LedgerMonth[];
}

/**
 * `/mes-factures` — le RELEVÉ, et l'écran le dit en première ligne.
 *
 * La plateforme n'émet aucune facture : elle rassemble les commandes telles
 * qu'elles se reportent en comptabilité, et le comptable dépose le PDF après la
 * clôture. Appeler « factures » une liste de commandes ferait chercher un
 * document qui n'existe pas — d'où l'encart d'honnêteté, en tête et non en note
 * de bas de page.
 *
 * Trois montants AVANT toute ligne : c'est ce qu'on vient chercher. Le registre
 * est dessous, pour qui veut la ligne.
 *
 * ⚠️ Une contradiction reste ouverte dans le dossier de design : l'accueil parle
 * d'une « facture de mars » comme d'une action à faire, cet écran affirme
 * qu'aucune facture n'est émise ici. Les deux ne peuvent pas être vrais. Cet
 * écran tient la version prudente — il montre la facture DÉPOSÉE quand elle
 * existe, et ne promet rien quand elle n'existe pas.
 */
@Component({
  selector: 'app-factures-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClientBannerBlock, ClientBannerOutlet, FoldIconComponent, LedgerMonthRow],
  templateUrl: './factures-page.html',
  styleUrl: './factures-page.scss',
})
export class FacturesPage {
  protected readonly t = inject(ClientCopyService).t;
  private readonly chrome = inject(ClientChrome);

  protected readonly openTotal = formatEuro(MOCK_STATEMENT_SUM.openTotal);
  protected readonly openNote = MOCK_STATEMENT_SUM.openNote;
  protected readonly closedTotal = formatEuro(MOCK_STATEMENT_SUM.closedTotal);
  protected readonly closedNote = MOCK_STATEMENT_SUM.closedNote;
  protected readonly perOrderTotal = formatEuro(MOCK_STATEMENT_SUM.perOrderTotal);
  protected readonly perOrderNote = MOCK_STATEMENT_SUM.perOrderNote;

  protected readonly accountGrandTotal = formatEuro(MOCK_STATEMENT_SUM.accountGrandTotal);
  protected readonly perOrderGrandTotal = formatEuro(MOCK_STATEMENT_SUM.perOrderGrandTotal);

  /**
   * Les mois, regroupés par exercice.
   *
   * L'année COUPE, le mois PORTE : c'est une rupture de lecture, pas un niveau
   * de navigation. Le regroupement se dérive de la liste plutôt que d'être
   * écrit dans la donnée — un mois n'a qu'une année, et la redire deux fois
   * serait deux occasions de se contredire.
   */
  protected readonly years = computed<readonly LedgerYear[]>(() => {
    const out: LedgerYear[] = [];
    for (const month of MOCK_LEDGER) {
      const last = out.at(-1);
      if (last === undefined || last.year !== month.year) {
        out.push({ year: month.year, months: [month] });
      } else {
        out[out.length - 1] = { year: last.year, months: [...last.months, month] };
      }
    }
    return out;
  });

  constructor() {
    effect(() => this.chrome.kicker.set(this.t().nav.destinations.invoices));
    this.chrome.back.set(null);
    this.chrome.menu.set(true);
    this.chrome.bell.set(null);
    this.chrome.barOnDesktop.set(true);
  }
}
