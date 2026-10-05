import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FoldCardComponent, FoldElementTitleComponent } from 'fold-ng';

import {
  JournalActs,
  type JournalSubject,
} from '../../../b2b/tarification/journal-acts/journal-acts';

/**
 * **Le journal du tarif d'un client**, en place dans l'onglet Tarifs
 * (`plan-sous-comptes.md`, S3, T21) : le compte tarifaire de la société
 * (sujet `company`) — « Suit la mercuriale de X depuis le … », « Y suit votre
 * mercuriale depuis le … ». Lecture seule ; la table datée des suivis reste
 * la source de la relecture des prix.
 */
@Component({
  selector: 'app-tariff-journal-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldElementTitleComponent, JournalActs],
  templateUrl: './tariff-journal-card.html',
  styleUrl: './tariff-journal-card.scss',
})
export class TariffJournalCard {
  readonly companyId = input.required<string>();

  /** Un objet STABLE : un littéral dans le gabarit relirait le journal à chaque rendu. */
  protected readonly subject = computed<JournalSubject>(() => ({
    subjectType: 'company',
    subjectId: this.companyId(),
  }));
}
