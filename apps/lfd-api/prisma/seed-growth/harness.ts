import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { Test, type TestingModule } from "@nestjs/testing";

import { AppModule } from "../../src/app.module.js";
import { EstablishmentDirectory } from "../../src/account/domain/ports/establishment-directory.js";
import { DocumentStore } from "../../src/infra/storage/document-store.js";
import { CustomerUserResolver } from "../../src/infra/auth/customer-user.resolver.js";
import type { Actor } from "../../src/infra/context/request-context.js";
import { runWithRequestContext } from "../../src/infra/context/request-context.store.js";
import { newTraceId } from "../../src/infra/context/trace-context.js";
import { PrismaService } from "../../src/infra/database/prisma.service.js";
import { PaymentGateway } from "../../src/payments/domain/payment-gateway.js";
import { FakeEstablishmentDirectory } from "./fake-establishment-directory.js";
import { FakeDocumentStore } from "./fake-document-store.js";
import { FakePaymentGateway } from "./fake-payment-gateway.js";

/**
 * Harnais du seed **growth** : un contexte applicatif Nest **réel** (vrais
 * `CommandBus` / resolver / repos) où seul `PaymentGateway` est simulé. On passe
 * par le module de test uniquement pour l'`overrideProvider` — le reste est
 * l'application telle qu'elle tourne. `runAt` exécute une opération dans un
 * **contexte de requête daté** : le `Clock` lit ce `now`, donc les événements du
 * **journal** portent un `occurredAt` historique (⇒ séries temporelles réalistes).
 */
export interface SeedHarness {
  readonly module: TestingModule;
  readonly commands: CommandBus;
  readonly queries: QueryBus;
  readonly resolver: CustomerUserResolver;
  readonly prisma: PrismaService;
  runAt<T>(now: Date, actor: Actor, fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function bootstrapHarness(): Promise<SeedHarness> {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PaymentGateway)
    .useClass(FakePaymentGateway)
    .overrideProvider(DocumentStore)
    .useClass(FakeDocumentStore)
    .overrideProvider(EstablishmentDirectory)
    .useClass(FakeEstablishmentDirectory)
    .compile();
  await module.init();

  return {
    module,
    commands: module.get(CommandBus, { strict: false }),
    queries: module.get(QueryBus, { strict: false }),
    resolver: module.get(CustomerUserResolver, { strict: false }),
    prisma: module.get(PrismaService, { strict: false }),
    runAt: <T>(now: Date, actor: Actor, fn: () => Promise<T>): Promise<T> =>
      runWithRequestContext({ now, traceId: newTraceId(), actor }, fn),
    close: () => module.close(),
  };
}

/** Acteur système (provisioning, avant résolution du principal). */
export const SYSTEM: Actor = { type: "system", id: null };
/** Acteur staff synthétique du seed (démarchage, mutations back-office). */
export const SEED_STAFF: Actor = { type: "staff", id: "seed-staff" };
/** Acteur client pour un utilisateur donné. */
export function customer(userId: string): Actor {
  return { type: "customer", id: userId };
}
