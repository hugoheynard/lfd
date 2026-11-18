import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type { BudgetCommitmentPayload, BudgetCommitmentRequirementsView } from '@lfd/contracts';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { ClientContext } from '../client-context.service';
import { contextKeyed, type ContextKey, workspaceRequestOf } from '../context-keyed/context-keyed';

/** Ce qui manque à l'engagement pour que la passation l'accepte. */
export type BudgetCommitmentGap = 'number' | 'serviceCode';

/** La saisie d'un espace : le code `null` n'a pas été touché, il suit le défaut de la fiche. */
interface Draft {
  readonly space: string;
  readonly number: string;
  readonly serviceCode: string | null;
}

/**
 * **L'engagement budgétaire d'un organisme public**, au panier (plan
 * `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`,
 * § 6 quater) : le numéro d'engagement de son bon de commande et son code
 * service Chorus Pro, saisis avant de commander et envoyés avec la passation.
 *
 * Les exigences (`GET /me/budget-commitment-requirements`) se lisent par la
 * brique rangée par espace : elles sont celles du PAYEUR de la société
 * affichée. Lues seulement quand le panier en a besoin — un organisme public
 * qui règle au compte —, jamais pour un particulier ni un pro.
 *
 * La saisie est rangée par espace, comme le reste : une bascule ne fait pas
 * partir le bon de commande d'une société avec la commande d'une autre.
 *
 * Des imports de TYPE seulement du baril `@lfd/contracts` : ce service est
 * chargé au démarrage (par `ClientOrders`), et une valeur tirerait zod.
 */
@Injectable({ providedIn: 'root' })
export class ClientBudgetCommitment {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly context = inject(ClientContext);

  /** Avance à chaque réponse ou échec : la brique n'est pas un signal. */
  private readonly answered = signal(0);
  /** L'espace dont la dernière lecture a échoué, `null` sinon. */
  private readonly failedSpace = signal<string | null>(null);
  private readonly draft = signal<Draft | null>(null);

  private readonly keyed = contextKeyed((key) =>
    this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.get<BudgetCommitmentRequirementsView>(
            `${AUTH_CONFIG.apiBaseUrl}/me/budget-commitment-requirements`,
            workspaceRequestOf(key, { Authorization: `Bearer ${token}` }),
          ),
        ),
      ),
  );

  /** Les exigences du payeur de l'espace affiché, `null` tant qu'elles ne sont pas lues. */
  readonly requirements = computed<BudgetCommitmentRequirementsView | null>(() => {
    this.answered();
    const space = this.context.prefix();
    return space === null ? null : (this.keyed.shown(keyOf(space)) ?? null);
  });

  /** La lecture des exigences de l'espace affiché a échoué. */
  readonly failed = computed(() => {
    const space = this.context.prefix();
    return space !== null && this.failedSpace() === space;
  });

  private readonly shownDraft = computed(() => {
    const draft = this.draft();
    return draft !== null && draft.space === this.context.prefix() ? draft : null;
  });

  readonly number = computed(() => this.shownDraft()?.number ?? '');
  /** Le code saisi, sinon celui que la fiche Chorus du payeur propose. */
  readonly serviceCode = computed(
    () => this.shownDraft()?.serviceCode ?? this.requirements()?.defaultServiceCode ?? '',
  );

  /**
   * Ce qui manque pour que la passation l'accepte — `null` si rien, ou tant
   * que les exigences ne sont pas lues (le serveur juge alors seul). Un code
   * exigé ne manque pas quand la fiche en propose un : le serveur le prend.
   */
  readonly gap = computed<BudgetCommitmentGap | null>(() => {
    const requirements = this.requirements();
    if (requirements === null || !requirements.publicPayer) {
      return null;
    }
    if (requirements.commitmentRequired && this.number().trim() === '') {
      return 'number';
    }
    if (
      requirements.serviceCodeRequired &&
      requirements.defaultServiceCode === '' &&
      this.serviceCode().trim() === ''
    ) {
      return 'serviceCode';
    }
    return null;
  });

  /** Lit les exigences de l'espace affiché, si ce n'est pas déjà fait. */
  ensure(): void {
    const space = this.context.prefix();
    if (space === null) {
      return;
    }
    void this.settle(space, this.keyed.ensure(keyOf(space)));
  }

  setNumber(number: string): void {
    this.edit({ number });
  }

  setServiceCode(serviceCode: string): void {
    this.edit({ serviceCode });
  }

  /**
   * **Ce qui part avec la passation** dans l'espace capturé au clic : rien
   * tant que le payeur n'est pas connu pour public — le serveur refuse un
   * engagement envoyé pour un payeur privé.
   */
  payloadFor(workspace: string): { readonly budgetCommitment?: BudgetCommitmentPayload } {
    const requirements = this.keyed.held(keyOf(workspace));
    if (requirements === undefined || !requirements.publicPayer) {
      return {};
    }
    const draft = this.draft();
    const own = draft !== null && draft.space === workspace ? draft : null;
    return {
      budgetCommitment: {
        number: (own?.number ?? '').trim(),
        serviceCode: (own?.serviceCode ?? requirements.defaultServiceCode).trim(),
      },
    };
  }

  /** La commande est passée : le bon de commande suivant repart de zéro. */
  forget(workspace: string): void {
    if (this.draft()?.space === workspace) {
      this.draft.set(null);
    }
  }

  private edit(patch: Partial<Pick<Draft, 'number' | 'serviceCode'>>): void {
    const space = this.context.prefix();
    if (space === null) {
      return;
    }
    const current = this.shownDraft() ?? { space, number: '', serviceCode: null };
    this.draft.set({ ...current, ...patch });
  }

  private async settle(
    space: string,
    reading: Promise<BudgetCommitmentRequirementsView>,
  ): Promise<void> {
    try {
      await reading;
      if (this.failedSpace() === space) {
        this.failedSpace.set(null);
      }
    } catch {
      this.failedSpace.set(space);
    }
    this.answered.update((count) => count + 1);
  }
}

/** La clé d'un espace : sans part propre. */
function keyOf(workspace: string): ContextKey {
  return { workspace, own: '' };
}
