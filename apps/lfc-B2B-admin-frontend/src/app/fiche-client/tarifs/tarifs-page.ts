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
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
  FoldElementTitleComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
  type FoldTableTone,
} from 'fold-ng';
import {
  POSED_MERCURIALE_STATUS_LABELS,
  type CompanyPricingView,
  type ItemElasticityView,
  type PosedMercurialeStatus,
  type PosedMercurialeView,
} from '@lfd/contracts';
import { formatEuros } from '@lfd/catalog-ui';

import { MILLICENTS_PER_CENT } from '@lfd/money';

import { NotifyService } from '../../notify.service';
import { nativeValue } from '../../shared/native-input';
import { VolumeEffort } from '../../b2b/tarification/volume-effort/volume-effort';
import { PriceTemplatesService } from '../../commercial/tarification/templates.service';
/** 10⁵ — d'un millicentime à l'euro. Dérivé une fois, jamais réécrit en dur. */
const MILLICENTS_PER_EURO = 100 * MILLICENTS_PER_CENT;
import {
  impactDirection,
  impactLabel,
  mercurialeRow,
  tally,
  type MercurialeRow,
} from '../../commercial/tarification/grille/mercuriale-row';
import { CompanyPricingService } from './company-pricing.service';
import { liveEffort } from './live-effort';
import { openRoomMillicents } from './negotiation-room';
import {
  draftFromView,
  eurosIn,
  millicentsIn,
  toLines,
  withEuros,
  withoutPrice,
  type DraftPrices,
} from './draft-prices';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Une ligne de la table : ce que la grille dérive, **plus** ce que seul le
 * serveur sait — l'effort de vente, mesuré sur les commandes de ce client.
 */
interface TarifRow extends MercurialeRow {
  readonly elasticity: ItemElasticityView | null;
  /**
   * La latitude **avant** toute décision — tarif catalogue moins limite.
   * `null` sans limite posée. Cf. `negotiation-room.ts` pour pourquoi les deux
   * marges cohabitent dans la même colonne, et comment l'écran les distingue.
   */
  readonly openRoomMillicents: number | null;
  /** Le prix accordé **en euros**, tel que le champ le porte. `null` = non tarifé. */
  readonly priceEuros: number | null;
}

/** Un rayon, prêt pour sa table. */
interface TarifShelf {
  readonly id: string;
  readonly name: string;
  readonly rows: readonly TarifRow[];
}

/** La couleur d'un état de mercuriale — jamais l'information seule. */
const STATUS_TONE: Readonly<Record<PosedMercurialeStatus, 'success' | 'neutral' | 'warning'>> = {
  active: 'success',
  scheduled: 'neutral',
  expired: 'neutral',
  suspended: 'warning',
};

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
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
    FoldNumberInputComponent,
    FoldElementTitleComponent,
    VolumeEffort,
  ],
  templateUrl: './tarifs-page.html',
  styleUrl: './tarifs-page.scss',
})
export class ClientTarifsPage {
  readonly id = input.required<string>();

  private readonly pricing = inject(CompanyPricingService);
  private readonly templates = inject(PriceTemplatesService);
  private readonly notify = inject(NotifyService);

  protected readonly euros = formatEuros;
  protected readonly percent = impactLabel;
  protected readonly direction = impactDirection;
  // `nativeValue` et non `$any($event.target)` : le second ment au compilateur.
  protected readonly nativeValue = nativeValue;
  protected readonly statusLabel = POSED_MERCURIALE_STATUS_LABELS;
  protected readonly statusTone = STATUS_TONE;

  protected readonly state = signal<LoadState>('loading');
  protected readonly view = signal<CompanyPricingView | null>(null);
  protected readonly draft = signal<DraftPrices>(new Map());
  protected readonly busy = signal(false);

  /**
   * La mercuriale dépliée. **Une seule à la fois** : deux listes de prix
   * ouvertes côte à côte se confondent, et on ouvre celle-ci pour vérifier ce
   * qu'on a accordé — pas pour comparer.
   */
  protected readonly opened = signal<string | null>(null);

  /** Le libellé et la fenêtre de ce qu'on s'apprête à poser. */
  protected readonly label = signal('');
  protected readonly validFrom = signal('');
  protected readonly validTo = signal('');

  protected readonly categories = computed(() => this.view()?.categories ?? []);
  protected readonly mercuriales = computed(() => this.view()?.mercuriales ?? []);

  /**
   * Les mercuriales qui **occupent la place** : celles qu'il faudra clore avant
   * de reposer. Une mercuriale terminée n'en occupe aucune.
   */
  protected readonly blocking = computed(() =>
    this.mercuriales().filter((entry) => entry.status !== 'expired'),
  );

  protected readonly lines = computed(() => toLines(this.draft()));

  /**
   * **Les rayons, dérivés UNE fois par frappe** et non à chaque cycle de
   * détection.
   *
   * Une méthode appelée depuis le gabarit reconstruirait ses lignes à chaque
   * passage — et sur une table dont chaque ligne porte un champ de saisie, des
   * objets neufs à chaque cycle sont exactement ce qui fait perdre le focus sous
   * les doigts. Le `computed` ne recalcule que quand le brouillon ou la lecture
   * changent.
   */
  protected readonly shelves = computed<readonly TarifShelf[]>(() => {
    const draft = this.draft();
    return this.categories().map((category) => ({
      id: category.id,
      name: category.name,
      rows: category.items.map((item) => {
        const row = mercurialeRow(item, millicentsIn(draft, item.sku));
        return {
          ...row,
          // L'effort suit le prix qu'on TAPE, pas celui qui est posé — et il
          // vise le prix FINAL, celui que la limite a relevé s'il le fallait :
          // c'est ce qui sera facturé, donc le seul dont l'effort soit réel.
          elasticity: liveEffort(item.elasticity, row.catalogMillicents, row.finalMillicents),
          openRoomMillicents: openRoomMillicents(row.catalogMillicents, row.floorMillicents),
          priceEuros: eurosIn(draft, item.sku),
        };
      }),
    }));
  });

  /** Ce que la grille pèse — les mêmes chiffres que sur la grille d'un gabarit. */
  protected readonly summary = computed(() => tally(this.shelves().flatMap((shelf) => shelf.rows)));

  /**
   * Les colonnes, de gauche à droite comme la négociation se mène. Aucune n'est
   * triable : l'ordre du catalogue est le seul repère pour retrouver un article
   * deux minutes plus tard, et le perdre coûte plus qu'un tri ne rapporte.
   */
  protected readonly columns: readonly FoldTableColumn<TarifRow>[] = [
    { key: 'article', label: 'Article · tarif catalogue pro' },
    { key: 'limit', label: 'Limite', width: '8rem' },
    { key: 'price', label: 'Prix mercuriale', width: '12rem' },
    { key: 'room', label: 'Marge de négoce', width: '9rem' },
    { key: 'effort', label: 'Effort de vente', width: '12rem' },
  ];

  protected readonly empty: FoldTableEmpty = {
    title: 'Aucun article dans ce rayon',
    subtitle: 'Publiez des produits de cette famille sur le canal B2B.',
  };

  protected readonly rowKey = (row: TarifRow): string => row.sku;

  /**
   * **Le ton de ligne dit que le prix saisi ne sera pas celui facturé.**
   *
   * Ambre quand la limite a relevé la saisie — le seul fait de cette table qui
   * appelle un geste, et le seul moyen de le retrouver dans quatre-vingt-douze
   * lignes. Il est aussi **écrit** dans la cellule, donc la couleur ne le porte
   * jamais seule.
   */
  protected readonly rowTone = (row: TarifRow): FoldTableTone => (row.floored ? 'warning' : null);

  protected readonly canPose = computed(
    () =>
      this.label().trim() !== '' &&
      this.validFrom() !== '' &&
      this.validTo() !== '' &&
      this.lines().length > 0 &&
      !this.busy(),
  );

  constructor() {
    // La vue se recharge quand on change de compte : la coquille garde le même
    // composant d'un onglet à l'autre, mais pas d'une fiche à l'autre.
    effect(() => {
      const companyId = this.id();
      void this.load(companyId);
    });
  }

  /** La clé d'une mercuriale : la même que celle qui la fait exister. */
  protected keyOf(mercuriale: PosedMercurialeView): string {
    return `${mercuriale.label} ${mercuriale.validFrom}`;
  }

  protected toggle(mercuriale: PosedMercurialeView): void {
    const key = this.keyOf(mercuriale);
    this.opened.update((current) => (current === key ? null : key));
  }

  protected isOpen(mercuriale: PosedMercurialeView): boolean {
    return this.opened() === this.keyOf(mercuriale);
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
      const view = await this.pricing.read(companyId);
      this.view.set(view);
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
   * Le champ rend des **euros**. Le brouillon, lui, garde des millicentimes —
   * la conversion passe par une chaîne, jamais par une multiplication
   * flottante (cf. `draft-prices.ts`).
   */
  protected setEuros(sku: string, euros: number | null): void {
    this.draft.update((draft) => withEuros(draft, sku, euros));
  }

  /** Partir du tarif catalogue : le champ s'ouvre dessus, il ne s'y verrouille pas. */
  protected priceIt(sku: string, catalogMillicents: number): void {
    this.draft.update((draft) => withEuros(draft, sku, catalogMillicents / MILLICENTS_PER_EURO));
  }

  protected clear(sku: string): void {
    this.draft.update((draft) => withoutPrice(draft, sku));
  }

  /**
   * **Poser.** Le serveur refuse si une mercuriale couvre déjà la période, et le
   * refus la nomme : la sortie est de la clore, ce que le bandeau du haut fait.
   */
  protected async pose(): Promise<void> {
    if (!this.canPose()) {
      return;
    }
    this.busy.set(true);
    try {
      const { affectedRules } = await this.pricing.pose(this.id(), {
        label: this.label().trim(),
        validFrom: new Date(`${this.validFrom()}T00:00:00.000Z`).toISOString(),
        validTo: new Date(`${this.validTo()}T00:00:00.000Z`).toISOString(),
        lines: [...this.lines()],
      });
      this.notify.success(`Mercuriale posée — ${String(affectedRules)} article(s).`);
      await this.reload(this.id(), true);
    } catch (error) {
      this.notify.error(error, "La mercuriale n'a pas pu être posée.");
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * **Clore** une mercuriale : ses règles sont archivées, jamais effacées — une
   * lecture datée d'avant la clôture les retrouve, et ce qu'elles ont facturé
   * reste figé sur les commandes.
   */
  protected async close(mercuriale: PosedMercurialeView): Promise<void> {
    this.busy.set(true);
    try {
      const { affectedRules } = await this.pricing.close(this.id(), {
        label: mercuriale.label,
        validFrom: mercuriale.validFrom,
        validTo: mercuriale.validTo,
        reason: null,
      });
      this.notify.success(`Mercuriale close — ${String(affectedRules)} règle(s) archivée(s).`);
      // La saisie en cours SURVIT : cf. `reload`. On vient de clore pour poser
      // ce qui est à l'écran.
      await this.reload(this.id(), false);
    } catch (error) {
      this.notify.error(error, "La mercuriale n'a pas pu être close.");
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * **Garder la grille comme gabarit**, pour la reposer ailleurs.
   *
   * Elle part sous la forme des gabarits — un palier à partir de 1 par article —
   * parce que c'est ce qu'un gabarit stocke. Ce qui est fixe ici le reste
   * là-bas ; ce n'est pas une conversion, c'est la même grille écrite dans la
   * forme que l'autre écran sait relire.
   */
  protected async saveAsTemplate(): Promise<void> {
    const label = this.label().trim();
    // 🔴 Le refus nomme CE QUI MANQUE, et les deux causes sont dites
    // séparément. Une seule phrase couvrant les deux — « Nommez la grille » —
    // accusait le nom alors que la grille était vide neuf fois sur dix : on
    // nomme sa mercuriale d'abord, puis on la garde, avant d'avoir tapé un
    // prix. Le message envoyait donc corriger le seul champ qui était rempli.
    if (label === '') {
      this.notify.refused(null, 'Nommez la grille avant de la garder comme gabarit.');
      return;
    }
    if (this.lines().length === 0) {
      this.notify.refused(
        null,
        'Aucun prix saisi : un gabarit vide ne se repose nulle part. Renseignez au moins un article.',
      );
      return;
    }
    this.busy.set(true);
    try {
      await this.templates.compose({
        kind: 'mercuriale',
        label,
        lines: this.lines().map((line) => ({
          sku: line.sku,
          tiers: [{ minQuantity: 1, unitPriceMillicents: line.unitPriceMillicents }],
          plannedVolume: null,
        })),
      });
      this.notify.success('Grille enregistrée dans les gabarits de mercuriale.');
    } catch (error) {
      this.notify.error(error, "La grille n'a pas pu être enregistrée.");
    } finally {
      this.busy.set(false);
    }
  }

  /** Une date ISO rendue au jour, pour l'afficher sans heure. */
  protected day(iso: string | null): string {
    return iso === null ? 'sans terme' : new Date(iso).toLocaleDateString('fr-FR');
  }
}
