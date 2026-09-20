import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { DevSeedReport } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldSpinnerComponent,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { DevSeedService } from '../dev-seed.service';

/**
 * **Recharger le jeu de données de développement**, sans quitter le navigateur.
 *
 * Les scripts en ligne de commande font déjà ce travail. Cet écran existe pour
 * le moment où on n'a pas de terminal sous la main : on montre l'application, la
 * journée a tourné, et la « commande de demain » est devenue celle d'hier. Il
 * faut la recaler là, tout de suite.
 *
 * ## Ce qu'il fait, et il le DIT avant
 *
 * ⚠️ Le geste est destructif : il supprime toute société qui n'est pas le client
 * de référence, et repose ses commandes. La page l'annonce en toutes lettres
 * plutôt que derrière un « êtes-vous sûr ? » — une confirmation qui ne dit pas
 * ce qu'elle détruit ne fait que ralentir le même clic.
 *
 * Ce qu'elle ne détruit pas mérite d'être dit aussi : le catalogue, le
 * référentiel, l'annuaire de l'équipe et les règles de prix ne bougent pas.
 *
 * ## Pourquoi un seul bouton
 *
 * Effacer, semer la station, le client, puis ses commandes : les quatre étapes
 * dépendent l'une de l'autre — les commandes visent des adresses et des points
 * que les précédentes posent. Offrir de n'en jouer qu'une produirait des états
 * intermédiaires que personne n'a décrits.
 *
 * ## Cet écran n'existe pas en production
 *
 * Il n'est pas caché derrière un drapeau : il est **absent du bundle**. Rien ne
 * l'importe depuis un build de production — cf. `dev-tools.ts`.
 */
@Component({
  selector: 'app-dev-seed-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldSpinnerComponent,
  ],
  templateUrl: './seed-page.html',
  styleUrl: './seed-page.scss',
})
export class DevSeedPage {
  private readonly seeding = inject(DevSeedService);
  private readonly notify = inject(NotifyService);

  protected readonly running = signal(false);
  protected readonly report = signal<DevSeedReport | null>(null);

  /**
   * Ce que la coupe a emporté, en une phrase.
   *
   * `null` quand rien n'a été supprimé : « 0 société supprimée » se lit comme un
   * échec, alors que c'est le cas NORMAL d'une base déjà propre.
   */
  protected readonly removed = computed(() => {
    const reset = this.report()?.reset;
    if (reset === undefined) {
      return null;
    }
    const parts = [
      count(reset.companies, 'société', 'sociétés'),
      count(reset.people, 'personne', 'personnes'),
      count(reset.pickupPoints, 'point de retrait', 'points de retrait'),
      count(reset.zones, 'zone', 'zones'),
      // Comptées et dites : une décision tarifaire d'essai n'est pas un décor,
      // c'est un prix. En retirer quatre sans le nommer laisserait croire que le
      // catalogue a changé sous les pieds de celui qui recharge.
      count(reset.priceRules, 'règle de prix', 'règles de prix'),
      count(reset.volumeLadders, 'barème de volume', 'barèmes de volume'),
    ].filter((part) => part !== null);
    return parts.length === 0 ? null : parts.join(', ');
  });

  protected async reload(): Promise<void> {
    if (this.running()) {
      return;
    }
    this.running.set(true);
    try {
      this.report.set(await this.seeding.reload());
      this.notify.success('Jeu de données rechargé.');
    } catch (error: unknown) {
      // Le message du serveur, pas le nôtre : c'est lui qui sait si la base
      // n'est pas locale, si le catalogue manque, ou si la porte d'activation
      // a refusé. Le réécrire ici perdrait la seule information utile.
      this.notify.error(error, 'Le rechargement a échoué.');
    } finally {
      this.running.set(false);
    }
  }
}

/** « 3 sociétés », ou `null` quand il n'y en a pas — zéro ne se dit pas. */
function count(value: number, singular: string, plural: string): string | null {
  if (value === 0) {
    return null;
  }
  return `${value} ${value === 1 ? singular : plural}`;
}
