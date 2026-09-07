import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { Test, type TestingModule } from "@nestjs/testing";

import { AppModule } from "../../src/appBootstrap/app.module.js";
import { BackgroundWork } from "../../src/platform/events/background-work.js";
import { EstablishmentDirectory } from "../../src/b2b/account/domain/ports/establishment-directory.js";
import { DocumentStore } from "../../src/platform/storage/document-store.js";
import { PrincipalResolver } from "../../src/platform/auth/principal.resolver.js";
import type { Actor } from "../../src/platform/context/request-context.js";
import { runWithRequestContext } from "../../src/platform/context/request-context.store.js";
import { newTraceId } from "../../src/platform/context/trace-context.js";
import { PrismaService } from "../../src/platform/database/prisma.service.js";
import { PaymentGateway } from "../../src/b2b/payments/domain/payment-gateway.js";
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
  /**
   * 🔴 Ce champ était typé `CustomerUserResolver`, **une classe qui n'existe
   * plus** : le port a été renommé `PrincipalResolver` en changeant de couche.
   * Les seeds tournant en `TS_NODE_TRANSPILE_ONLY`, rien ne l'a rougi — c'est
   * l'entrée de `prisma/` dans `tsconfig.seed.json` qui l'a rendu.
   */
  readonly resolver: PrincipalResolver;
  readonly prisma: PrismaService;
  runAt<T>(now: Date, actor: Actor, fn: () => Promise<T>): Promise<T>;
  /**
   * Draine le travail de fond, **puis** ferme le module.
   *
   * 🔴 Il ne drainait pas jusqu'au 2026-09-07, et ça se voyait : un semis sur
   * deux finissait par `Cannot use a pool after calling end on the pool`. Une
   * commande passée par le bus publie des faits dont les abonnés écrivent en
   * arrière-plan ; fermer le module leur retirait la base sous les pieds.
   *
   * Le semis avait donc l'air d'échouer alors qu'il avait tout posé — le pire
   * des deux mondes, parce qu'on cherche l'erreur dans ce qu'on vient d'écrire.
   */
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
    resolver: module.get(PrincipalResolver, { strict: false }),
    prisma: module.get(PrismaService, { strict: false }),
    runAt: <T>(now: Date, actor: Actor, fn: () => Promise<T>): Promise<T> =>
      runWithRequestContext({ now, traceId: newTraceId(), actor }, fn),
    close: async () => {
      await module.get(BackgroundWork, { strict: false }).whenIdle();
      await module.close();
    },
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
