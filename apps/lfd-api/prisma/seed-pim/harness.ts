import { CommandBus } from "@nestjs/cqrs";
import { Test } from "@nestjs/testing";

import { AppModule } from "../../src/appBootstrap/app.module.js";
import type { Actor } from "../../src/platform/context/request-context.js";
import { runWithRequestContext } from "../../src/platform/context/request-context.store.js";
import { newTraceId } from "../../src/platform/context/trace-context.js";
import { B2bMembershipService } from "../../src/pim/channels/b2b-platform/membership/membership.service.js";
import { PrismaService } from "../../src/platform/database/prisma.service.js";
import { DocumentStore } from "../../src/platform/storage/document-store.js";
import { FakeDocumentStore } from "../seed-growth/fake-document-store.js";

/**
 * Harnais du seed du **référentiel** : l'application Nest réelle — vrais
 * `CommandBus`, vrais handlers, vrais dépôts, vrais invariants — devant la base
 * que `DATABASE_LFD_URL` désigne.
 *
 * ## Une seule doublure, et elle est justifiée
 *
 * `DocumentStore` seulement : R2 n'est pas configuré en développement, et un
 * seed n'a rien à écrire dans un bucket. Tout le reste est l'application telle
 * qu'elle tourne — c'est la seule façon que ce qu'on sème soit un état que la
 * production peut atteindre.
 *
 * On ne double NI le domaine, NI la persistance, NI le journal. Doubler l'un
 * des trois ferait un seed qui produit ce que le code refuse.
 *
 * ## Pourquoi pas le harnais de `seed-growth`
 *
 * Le sien double aussi `PaymentGateway` et `EstablishmentDirectory` — dont le
 * cycle du référentiel n'approche jamais — et il **ne compile plus** : il
 * importe `platform/auth/customer-user.resolver.js`, supprimé depuis. Le
 * réparer dépasse ce chantier ; s'appuyer dessus l'aurait bloqué.
 *
 * ## Une seule base
 *
 * Ce harnais ne connaît QUE `DATABASE_LFD_URL`, par `AppConfig`, comme
 * l'application. Il n'a aucun moyen d'atteindre la base d'où le corpus a été
 * extrait : cette URL vit dans un autre processus, et n'est même pas lue ici.
 */
export interface SeedHarness {
  readonly commands: CommandBus;
  readonly prisma: PrismaService;
  /** Le canal B2B n'a pas de commande — cf. `b2b-channel.ts`. */
  readonly membership: B2bMembershipService;
  /** Exécute dans un contexte de requête **daté** — le `Clock` lit ce `now`. */
  runAt<T>(now: Date, actor: Actor, fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * L'acteur du seed. `declare-product-ready` REFUSE un acteur anonyme — signer
 * une fiche sans signataire n'aurait aucun sens — donc le seed en porte un,
 * nommé pour être reconnu dans le journal.
 */
export const SEED_STAFF: Actor = { type: "staff", id: "seed-pim" };

export async function bootstrapHarness(): Promise<SeedHarness> {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DocumentStore)
    .useClass(FakeDocumentStore)
    .compile();
  await module.init();

  return {
    commands: module.get(CommandBus, { strict: false }),
    prisma: module.get(PrismaService, { strict: false }),
    membership: module.get(B2bMembershipService, { strict: false }),
    runAt: <T>(now: Date, actor: Actor, fn: () => Promise<T>): Promise<T> =>
      runWithRequestContext({ now, traceId: newTraceId(), actor }, fn),
    close: () => module.close(),
  };
}
