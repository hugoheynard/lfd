import { computed, effect, inject, Injectable, signal } from '@angular/core';

import type { Company } from '../account/account.model';
import { AccountService } from '../account/account.service';

/** Clé de persistance de l'établissement choisi (versionnée). */
const STORAGE_KEY = 'lfc-b2b-commerce-company-v1';

/**
 * Contexte **commerce** partagé par les pages du parcours d'achat (panier,
 * paniers en attente, commandes) : **quel établissement** on regarde. Une seule
 * source pour toutes les pages — on ne re-sélectionne pas à chaque navigation.
 *
 * Le choix survit au reload (localStorage) et retombe sur la 1ʳᵉ entreprise dès
 * qu'elle est connue si rien n'est encore choisi (ou si le choix ne correspond
 * plus à une entreprise du compte).
 */
@Injectable({ providedIn: 'root' })
export class CommerceContextService {
  private readonly account = inject(AccountService);

  readonly companies = this.account.companies;

  private readonly _selectedId = signal<string>(restore());

  readonly selectedId = this._selectedId.asReadonly();

  /** L'entreprise sélectionnée, ou `null` tant qu'aucune n'est résolue. */
  readonly selected = computed<Company | null>(() => {
    const id = this._selectedId();
    return this.companies().find((company) => company.id === id) ?? null;
  });

  readonly hasCompany = computed(() => this.companies().length > 0);

  constructor() {
    // Cale la sélection sur une entreprise valide dès que la liste est connue.
    effect(() => {
      const companies = this.companies();
      if (companies.length === 0) {
        return;
      }
      const current = this._selectedId();
      const stillValid = companies.some((company) => company.id === current);
      if (!stillValid && companies[0]) {
        this.select(companies[0].id);
      }
    });
  }

  select(companyId: string): void {
    this._selectedId.set(companyId);
    persist(companyId);
  }
}

function restore(): string {
  if (typeof localStorage === 'undefined') {
    return '';
  }
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function persist(companyId: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, companyId);
  } catch {
    // Stockage refusé : la sélection reste en mémoire pour la session.
  }
}
