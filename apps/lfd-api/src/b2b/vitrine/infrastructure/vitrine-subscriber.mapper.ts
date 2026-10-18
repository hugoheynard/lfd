import type { VitrineSubscriberView } from "@lfd/contracts";

import { VitrineSubscriber } from "../domain/vitrine-subscriber.js";
import { VitrineContents } from "../domain/vitrine-contents.js";

/** La ligne `vitrine_subscribers`, telle que Prisma la rend. */
export interface VitrineSubscriberRowShape {
  readonly id: string;
  readonly name: string;
  readonly endpointUrl: string;
  readonly signingSecretSealed: string;
  readonly readKeyHash: string;
  readonly contents: readonly string[];
  readonly active: boolean;
  readonly failedAt: Date | null;
  readonly lastSequence: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Ligne → agrégat : l'adresse et les cases revalident. */
export function subscriberToDomain(row: VitrineSubscriberRowShape): VitrineSubscriber {
  return VitrineSubscriber.rehydrate(row);
}

/** Ligne → vue de l'écran : jamais le secret scellé, jamais l'empreinte de la clé. */
export function subscriberToView(row: VitrineSubscriberRowShape): VitrineSubscriberView {
  return {
    id: row.id,
    name: row.name,
    endpointUrl: row.endpointUrl,
    contents: VitrineContents.of(row.contents).list(),
    state: !row.active ? "inactive" : row.failedAt !== null ? "failing" : "active",
    failedAt: row.failedAt?.toISOString() ?? null,
    lastSequence: row.lastSequence,
    createdAt: row.createdAt.toISOString(),
  };
}
