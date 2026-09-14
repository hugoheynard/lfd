import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';

import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
} from 'fold-ng';

import type { LegalMention } from '@lfd/contracts/content-values';

import { ClientLegalDocuments } from '../client-legal-documents.service';
import { ClientCopyService } from '../copy/client-copy.service';
import { ClientLocale } from '../client-locale.service';

/**
 * Le dialogue d'une **mention légale**, ouvert depuis le pied de page avec la
 * mention à lire (`open(LegalDocumentPanel, { data: 'privacy' })`).
 *
 * **Un seul composant pour les cinq** : mentions légales, CGV, confidentialité,
 * cookies, accessibilité ont la même forme — un titre, des articles numérotés.
 * Cinq copies auraient divergé au premier correctif de mise en page.
 *
 * `side: 'center'` est le seul côté qui INTERROMPE la page : il la couvre et la
 * voile. C'est ce qu'on veut d'un document qu'on lit pour s'engager — un tiroir
 * latéral laisserait la boutique cliquable derrière et en ferait un aparté.
 *
 * Le registre est **administratif**, et il est voulu : corps justifié avec
 * césure, interlignage large, articles numérotés, titres en petites capitales.
 * Ce n'est pas de la copie de vitrine — aucune illustration, aucune couleur
 * d'accent, rien qui invite à survoler.
 *
 * Le corps défile dans **son propre conteneur** (`.body`), jamais la page
 * derrière : c'est le couple `:host { min-height: 0 }` + `.body { overflow-y:
 * auto }`, le même que `ContactPanel`.
 */
@Component({
  selector: 'app-legal-document-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './legal-document-panel.html',
  styleUrl: './legal-document-panel.scss',
})
export class LegalDocumentPanel {
  static readonly foldPanel: FoldPanelDefaults = {
    side: 'center',
    surface: 'solid',
    width: 'md',
  };

  /** La mention à lire. C'est la seule chose qui distingue un document d'un autre. */
  readonly data = input.required<LegalMention>();

  private readonly documents = inject(ClientLegalDocuments);

  protected readonly t = inject(ClientCopyService).t;
  protected readonly locale = inject(ClientLocale).current;

  /** Le titre du document — il nomme aussi le dialogue pour l'accessibilité. */
  protected readonly title = computed(() => this.documents.titleOf(this.data()));
  protected readonly articles = computed(() => this.documents.articlesOf(this.data()));
  protected readonly status = computed(() => this.documents.statusOf(this.data()));

  constructor() {
    // Le chargement part À L'OUVERTURE, pas au démarrage de l'app : c'est tout
    // l'objet du chargement paresseux, et c'est ici qu'on sait QUELLE mention
    // on lit. Un effet plutôt que le constructeur, parce qu'une entrée requise
    // n'est pas encore posée quand celui-ci tourne.
    //
    // ⚠️ `untracked` n'est pas une précaution : `ensureLoaded` LIT l'état de la
    // mention pour décider, donc sans lui l'effet se réabonne à cet état et se
    // rejoue à chaque transition — une lecture ratée se relancerait toute
    // seule, en boucle. La seule dépendance légitime ici est la mention.
    effect(() => {
      const mention = this.data();
      untracked(() => this.documents.ensureLoaded(mention));
    });
  }

  /** Rejoue la lecture après un échec. Le service sait qu'une lecture ratée se retente. */
  protected retry(): void {
    this.documents.ensureLoaded(this.data());
  }
}
