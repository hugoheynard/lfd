import { Injectable } from "@nestjs/common";

import { currentRequestContext } from "../../../platform/context/request-context.store.js";
import {
  PricingFollowJournal,
  type PricingFollowEntry,
} from "../../account/domain/ports/pricing-follow.journal.js";
import { describeFollow, type PricingAct } from "../domain/pricing-act.js";
import type { FollowActKind } from "../domain/pricing-act-summary.js";
import { PricingActWriter } from "./pricing-act.writer.js";

/** L'auteur d'un acte qu'aucun membre du staff n'a posé. */
const SYSTEM_ACTOR = "system";

/**
 * Le suivi d'une mercuriale, écrit au journal des prix sur le compte
 * tarifaire des DEUX sociétés (`plan-sous-comptes.md`, S3) : `started` /
 * `ended` sur le sous-compte, `joined` / `left` sur le principal. Les deux
 * actes et leurs copies générales partent dans la transaction du geste.
 *
 * L'auteur est celui de la requête : le geste est un acte staff, et le
 * contexte de requête est ce qui le nomme (`staff-access.guard.ts`).
 */
@Injectable()
export class PricingFollowJournalWriter extends PricingFollowJournal {
  constructor(private readonly acts: PricingActWriter) {
    super();
  }

  async followStarted(entry: PricingFollowEntry): Promise<void> {
    await this.acts.inscribeAll([
      actOf("started", entry, entry.validFrom, null),
      actOf("joined", entry, entry.validFrom, null),
    ]);
  }

  async followEnded(entry: PricingFollowEntry & { readonly validTo: Date }): Promise<void> {
    await this.acts.inscribeAll([
      actOf("ended", entry, entry.validTo, entry.validTo),
      actOf("left", entry, entry.validTo, entry.validTo),
    ]);
  }
}

/** Le sous-compte cite son principal ; le principal cite son sous-compte. */
function actOf(
  kind: FollowActKind,
  entry: PricingFollowEntry,
  at: Date,
  validTo: Date | null,
): PricingAct {
  const onChild = kind === "started" || kind === "ended";
  const subject = onChild ? entry.child : entry.parent;
  const counterpart = onChild ? entry.parent : entry.child;
  return {
    subjectType: "company",
    subjectId: subject.id,
    kind,
    actor: currentRequestContext()?.actor.id ?? SYSTEM_ACTOR,
    at,
    reason: null,
    summary: describeFollow(kind, counterpart.name, at),
    subjectLabel: subject.name,
    follow: {
      role: onChild ? "parent" : "child",
      counterpart: { id: counterpart.id, name: counterpart.name },
      validFrom: entry.validFrom,
      validTo,
    },
  };
}
