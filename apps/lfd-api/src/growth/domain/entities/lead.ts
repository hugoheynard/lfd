import type { LeadStatus } from "@lfd/contracts";

import { InvalidLeadError, LeadTransitionError } from "../errors/lead-errors.js";

/**
 * Agrégat **Lead** (cold / démarchage). À l'inverse de hot/mid (projections du
 * journal, zéro invariant), le lead porte un **état de suivi** avec des règles :
 * son `status` suit un **pipeline explicite** qui **ne recule jamais** (jalon
 * monotone), et `converted` / `lost` sont **terminaux** — « on ne recontacte pas
 * un converti ». C'est ce qui en fait un agrégat `load/save`, pas un read-model.
 *
 * Le **rapprochement** (`linkToUser`) rattache le lead au compte du prospect quand
 * il finit par s'inscrire (match e-mail) : il devient alors `converted`.
 */

/** Rang des étapes **actives** du pipeline (les terminaux sont hors rang). */
const ACTIVE_RANK: Record<string, number> = {
  new: 0,
  contacted: 1,
  qualified: 2,
  negotiating: 3,
};

/** Étapes actives où un contact commercial a eu lieu (⇒ on horodate le contact). */
const CONTACT_STAGES: ReadonlySet<LeadStatus> = new Set<LeadStatus>([
  "contacted",
  "qualified",
  "negotiating",
]);

const TEXT_MAX = 2000;

/** Champs de **saisie** d'un lead (démarchage). Seule la raison sociale est requise. */
export interface CaptureLeadInput {
  readonly businessName: string;
  readonly contactName: string;
  readonly email: string;
  readonly phone: string;
  readonly siret: string;
  readonly notes: string;
}

/** État sérialisé pour **reconstituer** un lead persisté (il porte son id). */
export interface ReconstituteLeadInput extends CaptureLeadInput {
  readonly id: string;
  readonly status: LeadStatus;
  readonly linkedUserId: string | null;
  readonly lastContactedAt: Date | null;
}

export class Lead {
  private constructor(
    private readonly identityId: string | null,
    readonly businessName: string,
    readonly contactName: string,
    readonly email: string,
    readonly phone: string,
    readonly siret: string,
    private statusValue: LeadStatus,
    private notesValue: string,
    private linkedUserIdValue: string | null,
    private lastContactedAtValue: Date | null,
  ) {}

  /** Saisit un nouveau lead cold (`new`, non persisté — id posé à l'écriture). */
  static capture(input: CaptureLeadInput): Lead {
    return new Lead(
      null,
      requiredText(input.businessName, "Raison sociale"),
      cleanText(input.contactName),
      normalizeEmail(input.email),
      cleanText(input.phone),
      cleanText(input.siret),
      "new",
      cleanText(input.notes),
      null,
      null,
    );
  }

  /** Reconstitue un lead depuis la base (déjà valide). */
  static reconstitute(input: ReconstituteLeadInput): Lead {
    return new Lead(
      input.id,
      input.businessName,
      input.contactName,
      input.email,
      input.phone,
      input.siret,
      input.status,
      input.notes,
      input.linkedUserId,
      input.lastContactedAt,
    );
  }

  get id(): string | null {
    return this.identityId;
  }

  get status(): LeadStatus {
    return this.statusValue;
  }

  get notes(): string {
    return this.notesValue;
  }

  get linkedUserId(): string | null {
    return this.linkedUserIdValue;
  }

  get lastContactedAt(): Date | null {
    return this.lastContactedAtValue;
  }

  /** Vrai si le lead est **clos** (converted/lost) — plus aucune transition. */
  get isClosed(): boolean {
    return this.statusValue === "converted" || this.statusValue === "lost";
  }

  /**
   * Fait avancer le lead vers `target`. Garde les invariants : jamais depuis un
   * état clos, jamais en arrière (rang strictement croissant pour une étape
   * active) ; `converted` / `lost` sont atteignables depuis n'importe quel état
   * actif. Un passage à une étape de contact horodate `lastContactedAt`.
   */
  moveTo(target: LeadStatus, now: Date): void {
    if (this.isClosed) {
      throw new LeadTransitionError(this.statusValue, target, "le lead est déjà clos");
    }
    if (target === "new") {
      throw new LeadTransitionError(this.statusValue, target, "on ne revient pas à « new »");
    }
    if (target !== "converted" && target !== "lost") {
      const current = ACTIVE_RANK[this.statusValue] ?? 0;
      const next = ACTIVE_RANK[target] ?? 0;
      if (next <= current) {
        throw new LeadTransitionError(this.statusValue, target, "un lead ne recule pas");
      }
    }
    this.statusValue = target;
    if (CONTACT_STAGES.has(target)) {
      this.lastContactedAtValue = now;
    }
  }

  /**
   * **Rapprochement** : le prospect démarché s'est inscrit → on rattache le lead à
   * son compte et on le passe `converted`. Sur un lead déjà clos, no-op (on ne
   * ressuscite pas un lead perdu ni ne re-convertit un converti).
   */
  linkToUser(userId: string): void {
    if (this.isClosed) {
      return;
    }
    this.linkedUserIdValue = requiredText(userId, "Compte rapproché");
    this.statusValue = "converted";
  }

  /** Édite les notes libres du commercial. */
  editNotes(notes: string): void {
    this.notesValue = cleanText(notes);
  }
}

function cleanText(value: string): string {
  return value.trim().slice(0, TEXT_MAX);
}

function requiredText(value: string, field: string): string {
  const clean = cleanText(value);
  if (clean === "") {
    throw new InvalidLeadError(field, "obligatoire");
  }
  return clean;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
