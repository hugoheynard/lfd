import { ChangeDetectionStrategy, Component, computed, inject, type OnInit } from '@angular/core';
import type {
  AccessibilityAuditView,
  AccessibilityCorrectionStatus,
  AccessibilityCorrectionView,
} from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldCalloutComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { ClientAccessibilityFollowUp } from '../client-accessibility-follow-up.service';
import { ClientLocale, type LocaleCode } from '../client-locale.service';
import { fill } from '../copy/client-copy.service';
import {
  accessibilityFollowUpCopy,
  type AccessibilityFollowUpCopy,
} from '../copy/screens/accessibility-follow-up.copy';
import { screenCopy } from '../copy/shop-copy-composer';

const BADGE_VARIANT = {
  done: 'success',
  in_progress: 'info',
  planned: 'neutral',
} as const satisfies Record<AccessibilityCorrectionStatus, string>;

/** Une ligne du tableau, déjà dite dans la langue courante. */
export interface FollowUpRow {
  readonly key: number;
  readonly theme: string;
  readonly correction: string;
  readonly date: string;
  readonly status: AccessibilityCorrectionStatus;
  readonly statusLabel: string;
  /** La teinte de la pastille — le mot, lui, dit le statut. */
  readonly badge: (typeof BADGE_VARIANT)[AccessibilityCorrectionStatus];
}

/** Un jour `AAAA-MM-JJ` ou un mois `AAAA-MM`, mis en forme à midi UTC : aucun fuseau ne le décale. */
function formatCalendar(value: string, locale: LocaleCode, withDay: boolean): string {
  const instant = new Date(`${withDay ? value : `${value}-01`}T12:00:00.000Z`);
  if (Number.isNaN(instant.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    ...(withDay ? { day: 'numeric' } : {}),
  }).format(instant);
}

/** Les lignes du tableau : thématique traduite, date mise en forme, statut en mots. */
export function followUpRows(
  corrections: readonly AccessibilityCorrectionView[],
  copy: AccessibilityFollowUpCopy,
  locale: LocaleCode,
): readonly FollowUpRow[] {
  const statusLabels: Record<AccessibilityCorrectionStatus, string> = {
    done: copy.correctionDone,
    in_progress: copy.correctionInProgress,
    planned: copy.correctionPlanned,
  };
  return corrections.map((entry, index) => ({
    key: index,
    theme:
      entry.theme === null
        ? copy.wholeSite
        : `${entry.theme}. ${copy.rgaaThemes[entry.theme - 1] ?? ''}`.trim(),
    correction: entry.label[locale],
    date: entry.date === null ? copy.dateToCome : formatCalendar(entry.date, locale, true),
    status: entry.status,
    statusLabel: statusLabels[entry.status],
    badge: BADGE_VARIANT[entry.status],
  }));
}

/** La phrase qui dit l'état de l'audit complet. */
export function auditLine(
  audit: AccessibilityAuditView,
  copy: AccessibilityFollowUpCopy,
  locale: LocaleCode,
): string {
  if (audit.completedOn !== null) {
    return fill(copy.auditDone, { date: formatCalendar(audit.completedOn, locale, true) });
  }
  if (audit.plannedFor !== null) {
    return fill(copy.auditPlanned, { month: formatCalendar(audit.plannedFor, locale, false) });
  }
  return copy.auditNotPlanned;
}

/**
 * **Le suivi des corrections d'accessibilité**, sous la déclaration (Hugo,
 * 2026-10-26) — un tableau qui dit ce qui est fait, en cours et prévu, et
 * l'état de l'audit complet. Aucun taux : l'audit n'est pas fait. Le second
 * mode du contrat (`conformity`) n'est pas affiché ici tant qu'il vaut `null`,
 * et il le vaudra jusqu'à la fin de l'audit.
 *
 * Différé par le dialogue (`@defer`) : ni ce composant, ni la table fold, ni
 * ses textes ne partent au démarrage.
 *
 * Un échec de lecture n'abîme jamais la déclaration : il se dit dans un
 * `fold-callout` discret, sous le texte.
 */
@Component({
  selector: 'app-accessibility-follow-up',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldCalloutComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
  ],
  templateUrl: './accessibility-follow-up.html',
  styleUrl: './accessibility-follow-up.scss',
})
export class AccessibilityFollowUp implements OnInit {
  private readonly source = inject(ClientAccessibilityFollowUp);
  private readonly locale = inject(ClientLocale).current;

  protected readonly c = screenCopy('accessibilityFollowUp', accessibilityFollowUpCopy);
  protected readonly status = this.source.status;

  protected readonly columns = computed<readonly FoldTableColumn<FollowUpRow>[]>(() => {
    const copy = this.c();
    return [
      { key: 'theme', label: copy.columnTheme, value: (row) => row.theme },
      { key: 'correction', label: copy.columnCorrection, value: (row) => row.correction },
      { key: 'date', label: copy.columnDate, value: (row) => row.date },
      { key: 'status', label: copy.columnStatus },
    ];
  });

  protected readonly rows = computed(() =>
    followUpRows(this.source.followUp()?.corrections ?? [], this.c(), this.locale()),
  );

  protected readonly audit = computed(() => {
    const view = this.source.followUp();
    return view === null ? '' : auditLine(view.audit, this.c(), this.locale());
  });

  protected readonly rowKey = (row: FollowUpRow): number => row.key;

  ngOnInit(): void {
    this.source.ensureLoaded();
  }
}
