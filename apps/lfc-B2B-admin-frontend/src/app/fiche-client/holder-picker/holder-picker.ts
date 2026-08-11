import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  output,
  signal,
} from '@angular/core';
import type { CustomerLookupView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldSearchComponent,
} from 'fold-ng';

import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';

/** Le temps laissé au commercial pour finir de taper avant d'interroger l'API. */
const SEARCH_DEBOUNCE_MS = 350;

/** En dessous, la recherche rendrait le fichier entier : on n'interroge pas. */
const MIN_TERM_LENGTH = 2;

/**
 * Qui détiendra le compte — soit quelqu'un qu'on connaît déjà, soit quelqu'un
 * qu'on va inscrire.
 */
export interface HolderChoice {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
  /** Le client existant retenu, `null` si on en inscrit un nouveau. */
  readonly existing: CustomerLookupView | null;
}

/**
 * Choix du **détenteur** d'un compte : on cherche d'abord, on inscrit ensuite.
 *
 * L'ordre n'est pas cosmétique. Un formulaire vide invite à saisir, donc à
 * recréer une personne qui existe déjà — et cette personne se retrouve avec deux
 * espaces et deux mots de passe pour une seule boîte e-mail. En ouvrant sur une
 * recherche, le geste par défaut devient « le retrouver », et l'inscription est
 * ce qu'on fait **après avoir constaté** qu'il n'est pas là.
 *
 * Seule l'adresse est exigée pour inscrire quelqu'un : c'est par elle qu'il
 * recevra son mot de passe. Prénom et nom sont utiles, pas nécessaires — le
 * commercial est chez son client, pas en train de remplir un dossier.
 */
@Component({
  selector: 'app-holder-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldSearchComponent, FoldButtonComponent, FoldCalloutComponent, FoldInputComponent],
  templateUrl: './holder-picker.html',
  styleUrl: './holder-picker.scss',
})
export class HolderPicker {
  private readonly service = inject(AdminCompaniesService);

  /** Le détenteur retenu, `null` tant qu'il n'y en a pas. */
  readonly holderChange = output<HolderChoice | null>();

  protected readonly term = signal('');
  protected readonly results = signal<readonly CustomerLookupView[]>([]);
  protected readonly searching = signal(false);

  /** Le client retenu dans les résultats — la société rejoindra son espace. */
  protected readonly chosen = signal<CustomerLookupView | null>(null);

  /** Vrai quand on a basculé sur l'inscription d'un nouveau détenteur. */
  protected readonly creating = signal(false);

  protected readonly draftEmail = signal('');
  protected readonly draftFirstName = signal('');
  protected readonly draftLastName = signal('');
  protected readonly draftPhone = signal('');

  /** Cherché assez longtemps pour que « aucun résultat » veuille dire quelque chose. */
  protected readonly searched = computed(() => this.term().trim().length >= MIN_TERM_LENGTH);

  /** Aucun client trouvé : c'est le moment de proposer d'en inscrire un. */
  protected readonly empty = computed(
    () => this.searched() && !this.searching() && this.results().length === 0,
  );

  constructor() {
    effect((onCleanup) => {
      const term = this.term().trim();
      if (term.length < MIN_TERM_LENGTH) {
        this.results.set([]);
        return;
      }
      this.searching.set(true);
      const timer = setTimeout(() => {
        void this.search(term);
      }, SEARCH_DEBOUNCE_MS);
      onCleanup(() => {
        clearTimeout(timer);
        this.searching.set(false);
      });
    });

    // Le choix remonte d'un seul endroit, quel que soit le chemin par lequel il
    // s'est fait : sélection dans la liste, ou saisie d'un nouveau détenteur.
    effect(() => {
      this.holderChange.emit(this.choice());
    });
  }

  /** Le détenteur courant, ou `null` s'il n'y en a pas encore. */
  private choice(): HolderChoice | null {
    const chosen = this.chosen();
    if (chosen !== null) {
      return {
        email: chosen.email,
        firstName: chosen.firstName,
        lastName: chosen.lastName,
        phone: chosen.phone,
        existing: chosen,
      };
    }
    const email = this.draftEmail().trim();
    if (!this.creating() || email === '') {
      return null;
    }
    return {
      email,
      firstName: this.draftFirstName().trim(),
      lastName: this.draftLastName().trim(),
      phone: this.draftPhone().trim(),
      existing: null,
    };
  }

  /** Retient un client existant. La société rejoindra son espace. */
  protected choose(customer: CustomerLookupView): void {
    this.chosen.set(customer);
    this.creating.set(false);
  }

  /** Revient à la recherche — le choix précédent est abandonné. */
  protected reset(): void {
    this.chosen.set(null);
    this.creating.set(false);
    this.draftEmail.set('');
    this.draftFirstName.set('');
    this.draftLastName.set('');
    this.draftPhone.set('');
  }

  /**
   * Bascule sur l'inscription, en **reprenant** le terme cherché s'il ressemble
   * à une adresse : le commercial vient de le taper, le lui redemander serait de
   * la paperasse.
   */
  protected startCreating(): void {
    const term = this.term().trim();
    if (term.includes('@')) {
      this.draftEmail.set(term);
    }
    this.creating.set(true);
  }

  /** Les sociétés d'un client, nommées — un nom se reconnaît, un compte non. */
  protected companiesOf(customer: CustomerLookupView): string {
    return customer.companies.map((company) => company.raisonSociale).join(', ');
  }

  /**
   * Cherche, **en silence** si ça échoue : cette lecture aide à la saisie, elle
   * ne la remplace pas. Le commercial garde toujours la possibilité d'inscrire
   * un nouveau détenteur.
   */
  private async search(term: string): Promise<void> {
    try {
      this.results.set(await this.service.searchCustomers(term));
    } catch {
      this.results.set([]);
    } finally {
      this.searching.set(false);
    }
  }
}
