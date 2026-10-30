import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FoldButtonComponent, FoldEmptyStateComponent, FoldLoadingStateComponent } from 'fold-ng';
import type { CompanyPricingView } from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { PricingFollow } from '../pricing-follow/pricing-follow';
import { CompanyPricingService } from './company-pricing.service';
import { draftFromLines, draftFromView, type DraftPrices } from './draft-prices';
import { MercurialeComposer } from './mercuriale-composer/mercuriale-composer';
import { PosedMercuriale } from './posed-mercuriale/posed-mercuriale';
import { TariffJournalCard } from './tariff-journal-card/tariff-journal-card';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **L'onglet « Tarifs » d'un compte** — ce qu'il paie, et ce qu'on lui accorde.
 *
 * ## Pourquoi le tableau de la tarification, et pas un écran neuf
 *
 * C'est délibérément la MÊME lecture que la grille générale et que celle d'un
 * gabarit : une ligne par article, des colonnes qui se lisent de gauche à droite
 * comme le prix se construit. Le commercial qui négocie avec un client regarde
 * le catalogue de la même façon que celui qui règle les prix publics ; trois
 * mises en page pour la même question auraient obligé à réapprendre où lire la
 * limite à chaque écran.
 *
 * Les colonnes sont celles de la négociation, dans l'ordre où elle se mène :
 * **le tarif catalogue pro** (d'où l'on part), **la limite** (où l'on ne descend
 * pas), **le prix accordé** (ce qu'on décide), **la marge de négoce** (ce qu'on
 * peut encore lâcher) et **l'effort de vente** (ce que la remise oblige ce
 * client à commander).
 *
 * ## Ce que cet écran ne calcule pas
 *
 * Le prix, la limite, la marge et l'effort viennent du **serveur**, qui les
 * dérive avec la fonction qui facture. Ce qui est calculé ici est la seule chose
 * que le serveur ne peut pas connaître : ce qu'un prix **pas encore posé**
 * donnerait — d'où `mercurialeRow`, partagée avec la grille d'un gabarit plutôt
 * que réécrite.
 *
 * ## Un prix, pas des paliers
 *
 * La mercuriale d'un compte est à prix fixe. Les grilles à paliers restent le
 * domaine des gabarits et arriveront ici comme une forme de plus — la séparation
 * est dans le contrat, pas seulement dans l'écran.
 */
@Component({
  selector: 'app-client-tarifs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    MercurialeComposer,
    PosedMercuriale,
    PricingFollow,
    TariffJournalCard,
  ],
  templateUrl: './tarifs-page.html',
  styleUrl: './tarifs-page.scss',
})
export class ClientTarifsPage {
  readonly id = input.required<string>();

  private readonly pricing = inject(CompanyPricingService);
  private readonly permissions = inject(PermissionsStore);

  /**
   * **Poser, préparer, composer, renommer, clore, amender : des écritures.**
   * Sans `b2b_pricing:write`, le serveur les refuse (403) — l'écran ne les
   * offre donc pas, et l'onglet se lit seulement. Le front CACHE, le serveur
   * REFUSE. (Renommer, clore et amender sont gardés là où ils vivent :
   * `PosedMercuriale`, `MercurialeAmendments`.)
   */
  protected readonly canWrite = computed(() => this.permissions.can('b2b_pricing:write'));

  /**
   * **Vrai quand on COMPOSE**, c'est-à-dire quand la grille de saisie est à
   * l'écran.
   *
   * Un drapeau plutôt qu'un état dérivé de la présence d'un brouillon : on
   * ouvre la composition en cliquant, avant qu'aucun brouillon n'existe, et on
   * la quitte sans forcément en avoir enregistré un.
   */
  protected readonly composing = signal(false);

  protected readonly state = signal<LoadState>('loading');
  protected readonly view = signal<CompanyPricingView | null>(null);
  protected readonly draft = signal<DraftPrices>(new Map());

  /** Le libellé et la fenêtre de ce qu'on s'apprête à poser. */
  protected readonly label = signal('');
  protected readonly validFrom = signal('');
  protected readonly validTo = signal('');

  /**
   * **Ce que l'écran montre**, et il ne montre qu'une chose à la fois.
   *
   * - `composing` — la grille de saisie, parce qu'on est en train de négocier ;
   * - `posed` — l'entête et la table, en LECTURE. Modifier passe par « clore »
   *   puis reposer : c'est déjà la règle du serveur, et c'est ce qui garde
   *   l'histoire de ce qui a été facturé ;
   * - `empty` — ni l'un ni l'autre, donc une invitation à commencer.
   *
   * Les trois ne cohabitent pas : une grille éditable sous une mercuriale posée
   * ferait croire qu'on la retouche, alors qu'enregistrer en poserait une
   * seconde.
   */
  protected readonly mode = computed<'empty' | 'composing' | 'posed'>(() => {
    if (this.composing() && this.canWrite()) {
      return 'composing';
    }
    return this.mercuriales().length > 0 ? 'posed' : 'empty';
  });

  protected readonly categories = computed(() => this.view()?.categories ?? []);
  protected readonly mercuriales = computed(() => this.view()?.mercuriales ?? []);

  /**
   * Les mercuriales qui **occupent la place** : celles qu'il faudra clore avant
   * de reposer. Une mercuriale terminée n'en occupe aucune.
   */
  protected readonly blocking = computed(() =>
    this.mercuriales().filter((entry) => entry.status !== 'expired'),
  );

  constructor() {
    // La vue se recharge quand on change de compte : la coquille garde le même
    // composant d'un onglet à l'autre, mais pas d'une fiche à l'autre.
    effect(() => {
      const companyId = this.id();
      void this.load(companyId);
    });
  }

  protected async load(companyId = this.id()): Promise<void> {
    return this.reload(companyId, true);
  }

  /**
   * @param reseedDraft la grille se **réaligne** sur ce que le serveur rend.
   *
   * 🔴 `false` après une **clôture**, et c'est tout sauf un détail : on clôt
   * précisément parce qu'on vient de saisir la grille qui doit la remplacer, et
   * la réalignement effacerait cette saisie — le serveur ne rend plus rien de
   * scellé. Le commercial aurait à retaper quatre-vingt-douze prix pour avoir
   * suivi l'instruction que l'écran lui donne.
   */
  private async reload(companyId: string, reseedDraft: boolean): Promise<void> {
    this.state.set('loading');
    try {
      const [view, saved] = await Promise.all([
        this.pricing.read(companyId),
        this.pricing.draft(companyId),
      ]);
      this.view.set(view);
      // 🔴 **Un brouillon rouvre la composition.** Une négociation laissée en
      // plan doit se retrouver là où on l'a quittée : la ranger derrière un
      // bouton reviendrait à la cacher, et le prochain à ouvrir la fiche
      // recommencerait la sienne par-dessus.
      // Sans droit d'écriture, la composition ne s'ouvre pas : `mode` l'écarte.
      if (saved !== null) {
        this.composing.set(true);
        this.label.set(saved.label);
        this.validFrom.set(dayOf(saved.validFrom));
        this.validTo.set(dayOf(saved.validTo));
        this.draft.set(draftFromLines(saved.lines));
        this.state.set('ready');
        return;
      }
      if (reseedDraft) {
        // La grille s'ouvre sur ce qui est POSÉ : on négocie à partir de ce
        // qu'on a déjà accordé, jamais d'une page blanche qui ferait retaper
        // une grille entière pour changer trois prix.
        this.draft.set(draftFromView(view));
      }
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /**
   * Une mercuriale a changé (avenant, renommage, clôture) : la vue est relue — c'est elle qui fait foi.
   * La saisie en cours survit, (cf. `reload`).
   */
  protected onAmended(): void {
    void this.reload(this.id(), false);
  }

  /** Une mercuriale est posée : la grille se réaligne sur ce qui est posé. */
  protected onPosed(): void {
    void this.reload(this.id(), true);
  }

  /** Le brouillon est jeté : on referme la composition et on relit. */
  protected onDiscarded(): void {
    this.composing.set(false);
    void this.reload(this.id(), true);
  }

  /**
   * **Commencer une négociation.** On part de ce qui est posé, s'il y a quelque
   * chose : renégocier sur une page blanche ferait retaper une grille entière
   * pour changer trois prix.
   */
  protected compose(): void {
    this.composing.set(true);
  }
}

/** `2026-01-01T…` → `2026-01-01`, ce qu'un `<input type="date">` attend. */
function dayOf(iso: string | null): string {
  return iso === null ? '' : iso.slice(0, 10);
}
