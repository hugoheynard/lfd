import {
  ChangeDetectionStrategy,
  ElementRef,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  DEFERRED_TERM_LABELS,
  deferredTermSchema,
  MANDATE_STATUS_LABELS,
  type CompanyBankAccountView,
  type DeferredTerm,
  type PaymentMandateView,
} from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDateComponent,
  FoldCardComponent,
  FoldDangerZoneComponent,
  FoldElementTitleComponent,
  FoldInlineConfirmComponent,
  FoldPanelHostService,
  FoldPageSectionComponent,
  FoldTimelineComponent,
  type FoldTimelineNode,
} from 'fold-ng';

import { saveBlob } from '../../shared/download/save-blob';
import {
  MandatePreviewPanel,
  type MandatePreviewPanelData,
} from '../mandate-preview-panel/mandate-preview-panel';
import { ProofPanel, type ProofPanelData } from '../proof-panel/proof-panel';
import { BankAccountSection } from '../bank-account-section/bank-account-section';
import { MandateOptionsSection } from '../mandate-options-section/mandate-options-section';
import { NotifyService } from '../../notify.service';
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
/**
 * Combien de caractères de la RUM il faut retaper pour révoquer.
 *
 * Six : le tirage final, la partie qui distingue deux mandats du même client le
 * même jour. Recopier les 24 caractères ferait un copier-coller, c'est-à-dire un
 * geste qui ne prouve rien.
 */
const RUM_CONFIRM_LENGTH = 6;

@Component({
  selector: 'app-paiement-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    BankAccountSection,
    MandateOptionsSection,
    FoldPageSectionComponent,
    FoldCardComponent,
    FoldCalloutComponent,
    FoldDateComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldDangerZoneComponent,
    FoldElementTitleComponent,
    FoldInlineConfirmComponent,
    FoldTimelineComponent,
  ],
  templateUrl: './paiement-section.html',
  styleUrl: './paiement-section.scss',
})
export class PaiementSection {
  private readonly mandates = inject(MandatesService);
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
  /**
   * Le RIB du client, remonté par le bloc qui le charge.
   *
   * Il n'est **pas** affiché ici — c'est ce bloc-là qui le montre. Il sert
   * uniquement à dire où en est le dossier sur la frise. Le charger une seconde
   * fois pour l'avoir en propre ferait deux états du même fait, qui
   * divergeraient à la première écriture.
   */
  protected readonly bankAccount = signal<CompanyBankAccountView | null>(null);
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

  /**
   * Les 4 chiffres du compte que le mandat **actif** nomme, `''` sinon.
   *
   * Passé au bloc du RIB pour qu'il puisse avertir quand on s'apprête à
   * enregistrer un autre compte. Seuls les quatre derniers sont disponibles des
   * deux côtés — c'est grossier, et c'est suffisant : l'avertissement invite à
   * vérifier, il ne bloque rien.
   */
  protected readonly mandatedLast4 = computed(() =>
    this.debitable() ? (this.mandate()?.last4 ?? '') : '',
  );

  /**
   * **La frise : les coordonnées, l'autorisation, l'ouverture.**
   *
   * Même idiome que la frise de livraison d'une fiche produit
   * (`pim/catalogue/product-form/b2b-delivery`) : rail **vertical**, aucune
   * icône de statut, et ce sont les **libellés qui portent l'état** — « Aucun RIB
   * enregistré » plutôt qu'une pastille éteinte à côté de « RIB ». Un libellé
   * qui change se lit sans avoir appris le code couleur, et il reste lisible
   * quand on ne voit pas la pastille. Les icônes des nœuds, elles, ne disent
   * pas l'état mais le **sujet** — et ce sont les mêmes que celles des trois
   * titres d'étape en dessous, pour qu'on retrouve d'un coup d'œil à quel bloc
   * chaque ligne de la frise renvoie.
   *
   * ⚠️ `credit-card`, `banknote`, `contracts`, `repeat` : des noms du jeu fold,
   * vérifiés contre `FOLD_BUILTIN_ICONS`. `card` et `file` n'en font PAS partie,
   * et le typecheck ne l'aurait pas dit — seul le build AOT lit les gabarits.
   *
   * 🔴 La frise **décrit**, elle ne commande pas. Aucune étape n'est verrouillée
   * par la précédente : un commercial débloque un crédit devant son client et
   * fait suivre le mandat. Bloquer le geste pour tenir une belle séquence ferait
   * perdre la vente que la séquence sert — c'est ce que le callout « Rien pour
   * encaisser » accompagne, au lieu de l'empêcher.
   */
  protected readonly steps = computed<readonly FoldTimelineNode[]>(() => {
    const account = this.bankAccount();
    const mandate = this.mandate();
    const granted = this.grantedTerms();

    return [
      {
        key: 'rib',
        id: null,
        icon: 'banknote',
        label: account === null ? 'Aucun RIB enregistré' : `RIB enregistré — ••••${account.last4}`,
        done: account !== null,
      },
      {
        key: 'mandate',
        id: null,
        icon: 'contracts',
        label: this.mandateStepLabel(mandate),
        done: this.debitable(),
      },
      {
        key: 'terms',
        id: null,
        icon: 'repeat',
        label:
          granted.length === 0
            ? 'Aucun règlement périodique ouvert'
            : granted.map((term) => DEFERRED_TERM_LABELS[term]).join(', ') + ' — ouvert',
        done: granted.length > 0,
      },
    ];
  });

  /**
   * Le libellé de l'étape du mandat, qui distingue trois états que la seule
   * pastille confondrait : jamais signé, signé et actif, signé puis révoqué.
   *
   * Un mandat révoqué n'est PAS « aucun mandat » : il dit qu'on a eu
   * l'autorisation et qu'on ne l'a plus, ce qui ne se répare pas du même geste.
   */
  private mandateStepLabel(mandate: PaymentMandateView | null): string {
    if (mandate === null) {
      return 'Aucun mandat de prélèvement';
    }
    // Les quatre chiffres n'existent que sur un mandat Stripe ; un mandat frappé
    // ici n'en a pas. On nomme donc par la RUM, qui est toujours renseignée.
    const suffix = mandate.last4 === '' ? mandate.reference : `••••${mandate.last4}`;
    if (mandate.status === 'active') {
      return `Mandat signé, actif — ${suffix}`;
    }
    return `Mandat ${MANDATE_STATUS_LABELS[mandate.status].toLowerCase()} — ${suffix}`;
  }

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
    // 🔴 `draft` AUTANT que `active` (corrigé le 2026-09-13). Un brouillon
    // n'était listé nulle part : impossible de l'abandonner à l'écran, et
    // l'index d'unicité interdit d'en frapper un second. Une société à laquelle
    // on avait frappé un mandat erroné n'avait donc **aucune sortie** — sauf en
    // SQL. L'agrégat sait révoquer un brouillon depuis la veille ; il manquait
    // l'endroit pour le demander.
    if (current === null || (current.status !== 'active' && current.status !== 'draft')) {
      return credits;
    }
    const isDraft = current.status === 'draft';
    return [
      ...credits,
      {
        key: 'mandate' as const,
        label: isDraft
          ? `Abandonner le mandat ${current.reference}`
          : `Révoquer le mandat ${current.reference}`,
        // Deux conséquences, parce que ce ne sont pas les mêmes faits : un
        // brouillon n'a jamais autorisé personne, un actif oui. Dire « plus
        // aucun prélèvement ne partira » d'un mandat qui n'a jamais pu prélever
        // ferait croire qu'on retire quelque chose au client.
        consequence: isDraft
          ? 'Le papier déjà envoyé deviendra sans valeur. Sa référence ne sera pas réutilisée.'
          : 'Plus aucun prélèvement ne pourra partir sur ce compte.',
        question: isDraft
          ? 'Abandonner ce mandat non signé ?'
          : 'Retirer l’autorisation de prélever ?',
        // 🔴 La fin de la RUM, et non les 4 chiffres du compte (corrigé le
        // 2026-09-13). `last4` vient du mandat Stripe ; un mandat que NOUS
        // frappons naît sans — il peut l'être avant même que le RIB soit
        // recopié. Le mot à taper était donc VIDE, la confirmation ne pouvait
        // pas aboutir, et la révocation était inatteignable depuis l'écran
        // sans que rien ne le dise.
        //
        // La RUM est renseignée par construction, elle est affichée juste
        // au-dessus, et c'est elle qui est imprimée sur le papier signé : taper
        // autre chose signifie qu'on ne regarde pas le bon mandat.
        match: current.reference.slice(-RUM_CONFIRM_LENGTH),
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

  /**
   * Frappe le mandat, puis recharge.
   *
   * `run` rend le trio muter / annoncer / relire, et le `void` du retour suffit
   * ici : l'identifiant rendu par le serveur ne sert à rien à l'écran, qui
   * relit la section de toute façon. Le garder pour l'afficher ferait une
   * seconde source de vérité sur ce qu'est le mandat courant.
   */
  protected async mint(): Promise<void> {
    const id = this.companyId();
    if (id === null) {
      return;
    }
    await this.run(
      id,
      async () => {
        await this.mandates.mint(id);
      },
      "Mandat frappé. Il reste à l'imprimer et à le faire signer.",
    );
  }

  /**
   * Peut-on frapper un mandat ? Seulement quand il n'y en a aucun, ou que le
   * dernier est mort.
   *
   * ⚠️ Un mandat `draft` fait dire NON : le serveur refuserait en 409, et un
   * bouton dont la seule issue est un message d'erreur vaut moins que pas de
   * bouton du tout.
   */
  protected readonly mintable = computed(() => {
    const status = this.mandate()?.status;
    return status === undefined || status === 'revoked' || status === 'failed';
  });

  /**
   * Récupère la pièce déposée et la remet à l'utilisateur.
   *
   * 🔴 En TÉLÉCHARGEMENT et non dans un onglet, alors que la route sait servir
   * les deux. Ouvrir un onglet après un `await` se fait bloquer comme une
   * fenêtre surgissante sur une partie des navigateurs : le geste échouerait
   * silencieusement, au pire moment — quelqu'un qui cherche une preuve en
   * contestation. Le fichier descend, et l'onglet reste au choix de qui le veut.
   *
   * Hors de `run` : c'est une LECTURE. La passer par le trio muter / annoncer /
   * relire rechargerait la section pour rien et annoncerait un changement qui
   * n'a pas eu lieu.
   */
  protected async downloadProof(): Promise<void> {
    const id = this.companyId();
    const mandate = this.mandate();
    if (id === null || mandate === null) {
      return;
    }
    this.busy.set(true);
    try {
      saveBlob(await this.mandates.proof(id), mandate.proofFileName || 'mandat-signe.pdf');
    } catch (error) {
      this.notify.error(error, "Le mandat signé n'a pas pu être récupéré.");
    } finally {
      this.busy.set(false);
    }
  }

  private readonly panels = inject(FoldPanelHostService);

  /**
   * Ouvre le mandat émis — le voir, le télécharger, l'envoyer au client.
   *
   * Le panneau relit le mandat lui-même plutôt que de le recevoir : deux écrans
   * l'ouvrent, et faire descendre l'état par les deux aurait donné deux sources
   * de vérité sur « ce document est-il signable ».
   */
  protected openMandate(): void {
    const id = this.companyId();
    if (id === null) {
      return;
    }
    this.panels.open<MandatePreviewPanelData>(MandatePreviewPanel, {
      data: { companyId: id, companyLabel: this.companyName() },
    });
  }

  /** Ouvre le scan déposé — le voir avant de le télécharger. */
  protected openProof(): void {
    const id = this.companyId();
    const mandate = this.mandate();
    if (id === null || mandate === null) {
      return;
    }
    this.panels.open<ProofPanelData>(ProofPanel, {
      data: { companyId: id, fileName: mandate.proofFileName },
    });
  }

  /**
   * Amène la zone de danger sous les yeux, plutôt que d'y dupliquer le geste.
   *
   * La révocation vit en bas de la fiche, derrière un mot à retaper — c'est
   * voulu : une section dangereuse toujours visible cesse d'être lue. Mais elle
   * était **introuvable depuis le mandat**, qui est l'endroit où l'on se pose la
   * question. Le bouton ne révoque donc pas : il conduit.
   *
   * `smooth` et non un saut : un déplacement instantané vers une zone rouge fait
   * croire à un changement d'écran, et on cherche alors ce qu'on vient de
   * casser.
   */
  protected goToRevoke(): void {
    this.dangerZone()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /**
   * ⚠️ `viewChild` et non une référence de gabarit passée en paramètre : la zone
   * de danger vit dans un `@if`, donc dans une vue imbriquée, et sa référence
   * n'est pas visible depuis le bloc du mandat. Le compilateur le dit — encore
   * faut-il ne pas prendre son refus pour un caprice.
   */
  private readonly dangerZone = viewChild('dangerZone', { read: ElementRef<HTMLElement> });

  /** La date saisie pour la signature — `AAAA-MM-JJ`, celle du papier. */
  protected readonly signedAt = signal('');

  /**
   * Un brouillon attend-il sa signature ?
   *
   * Séparé de `mintable()` : les deux sont exclusifs, et les confondre ferait
   * afficher les deux gestes sur le même état.
   */
  protected readonly signable = computed(() => this.mandate()?.status === 'draft');

  /**
   * Déclare le mandat signé.
   *
   * La date part telle que saisie, sans normalisation ici : le serveur en
   * refuse la forme ET le fond (une date à venir, un mandat qui n'est pas un
   * brouillon). Revalider à l'écran ferait une seconde définition de « date
   * acceptable », et c'est celle que l'utilisateur lit qui dériverait.
   */
  protected async sign(): Promise<void> {
    const id = this.companyId();
    const mandate = this.mandate();
    const at = this.signedAt();
    if (id === null || mandate === null || at === '') {
      return;
    }
    await this.run(id, () => this.mandates.sign(id, mandate.id, at), 'Mandat signé et actif.');
    this.signedAt.set('');
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
