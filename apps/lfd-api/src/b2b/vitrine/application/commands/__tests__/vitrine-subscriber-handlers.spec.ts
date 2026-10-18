import type { VitrineElementKeys } from "@lfd/contracts";

import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import {
  VitrineDeliveryInFlightError,
  VitrineEndpointCarriesSecretError,
  VitrineSubscriberFailingError,
  VitrineSubscriberInactiveError,
  VitrineSubscriberNameInvalidError,
  VitrineSubscriberNotFoundError,
} from "../../../domain/errors/vitrine-errors.js";
import { hashVitrineReadKey } from "../../../domain/services/vitrine-read-key.js";
import { VitrineChanges } from "../../../domain/vitrine-changes.js";
import { VitrineDelivery } from "../../../domain/vitrine-delivery.js";
import { AT, LATER, subscriber } from "../../../domain/__tests__/vitrine-fixtures.js";
import { VitrineRelay } from "../../services/vitrine-relay.js";
import { CreateVitrineSubscriberCommand } from "../create-vitrine-subscriber.command.js";
import { CreateVitrineSubscriberHandler } from "../create-vitrine-subscriber.handler.js";
import { ResendVitrineDeliveryCommand } from "../resend-vitrine-delivery.command.js";
import { ResendVitrineDeliveryHandler } from "../resend-vitrine-delivery.handler.js";
import { ResyncVitrineSubscriberCommand } from "../resync-vitrine-subscriber.command.js";
import { ResyncVitrineSubscriberHandler } from "../resync-vitrine-subscriber.handler.js";
import { RotateVitrineCredentialsCommand } from "../rotate-vitrine-credentials.command.js";
import { RotateVitrineCredentialsHandler } from "../rotate-vitrine-credentials.handler.js";
import { SendVitrineTestCommand } from "../send-vitrine-test.command.js";
import { SendVitrineTestHandler } from "../send-vitrine-test.handler.js";
import { SetVitrineContentsCommand } from "../set-vitrine-contents.command.js";
import { SetVitrineContentsHandler } from "../set-vitrine-contents.handler.js";
import { UpdateVitrineSubscriberIdentityCommand } from "../update-vitrine-subscriber-identity.command.js";
import { UpdateVitrineSubscriberIdentityHandler } from "../update-vitrine-subscriber-identity.handler.js";
import {
  MemoryDeliveries,
  MemoryPrints,
  MemorySubscribers,
  ScriptedPoster,
  testCipher,
  testMint,
} from "./vitrine-doubles.js";

const NONE: VitrineElementKeys = { items: [], operations: [], shelves: [], texts: [] };

describe("déclarer un abonné", () => {
  it("rend le secret et la clé en clair UNE fois, range le secret scellé et la clé hachée", async () => {
    const cipher = testCipher();
    const store = new MemorySubscribers();
    const handler = new CreateVitrineSubscriberHandler(
      store,
      testMint(cipher),
      new FixedIdGenerator("sub"),
      new FixedClock(AT),
    );
    const shown = await handler.execute(
      new CreateVitrineSubscriberCommand("Agence", "https://agence.example/hook", ["catalogue"]),
    );
    const stored = (await store.load(shown.id))?.toPersistence();
    expect(shown.signingSecret).toMatch(/^vtrsec_/);
    expect(shown.readKey).toMatch(/^vtrkey_/);
    expect(stored?.signingSecretSealed).not.toContain(shown.signingSecret);
    expect(cipher.open(stored?.signingSecretSealed ?? "")).toBe(shown.signingSecret);
    expect(stored?.readKeyHash).toBe(hashVitrineReadKey(shown.readKey));
  });

  it("range la description facultative donnée à la création", async () => {
    const store = new MemorySubscribers();
    const shown = await new CreateVitrineSubscriberHandler(
      store,
      testMint(),
      new FixedIdGenerator("sub"),
      new FixedClock(AT),
    ).execute(
      new CreateVitrineSubscriberCommand(
        "Agence",
        "https://a.example/hook",
        [],
        "Le site public.",
        "web@agence.example",
      ),
    );
    expect((await store.load(shown.id))?.toPersistence()).toMatchObject({
      description: "Le site public.",
      contactEmail: "web@agence.example",
    });
  });

  it("refuse une adresse avec un jeton en requête : rien n'est rangé", async () => {
    const store = new MemorySubscribers();
    const handler = new CreateVitrineSubscriberHandler(
      store,
      testMint(),
      new FixedIdGenerator("sub"),
      new FixedClock(AT),
    );
    await expect(
      handler.execute(new CreateVitrineSubscriberCommand("A", "https://a.example/?k=1", [])),
    ).rejects.toThrow(VitrineEndpointCarriesSecretError);
    expect(store.saves).toBe(0);
  });
});

describe("régler un abonné", () => {
  it("une rotation rend une clé neuve, et l'ancienne ne vaut plus", async () => {
    const store = new MemorySubscribers(subscriber());
    const shown = await new RotateVitrineCredentialsHandler(
      store,
      testMint(),
      new FixedClock(LATER),
    ).execute(new RotateVitrineCredentialsCommand("sub_agence"));
    expect((await store.load("sub_agence"))?.toPersistence().readKeyHash).toBe(
      hashVitrineReadKey(shown.readKey),
    );
  });

  it("change les cases ; un abonné inconnu est nommé", async () => {
    const store = new MemorySubscribers(subscriber());
    const handler = new SetVitrineContentsHandler(store, new FixedClock(LATER));
    await handler.execute(new SetVitrineContentsCommand("sub_agence", ["texts"]));
    expect((await store.load("sub_agence"))?.contents.list()).toEqual(["texts"]);
    await expect(handler.execute(new SetVitrineContentsCommand("inconnu", []))).rejects.toThrow(
      VitrineSubscriberNotFoundError,
    );
  });

  it("renomme et décrit ; un nom vide est refusé sans rien ranger", async () => {
    const store = new MemorySubscribers(subscriber());
    const handler = new UpdateVitrineSubscriberIdentityHandler(store, new FixedClock(LATER));
    await handler.execute(
      new UpdateVitrineSubscriberIdentityCommand(
        "sub_agence",
        "Agence Lumière",
        "Le site public.",
        "web@agence.example",
      ),
    );
    expect((await store.load("sub_agence"))?.toPersistence()).toMatchObject({
      name: "Agence Lumière",
      description: "Le site public.",
      contactEmail: "web@agence.example",
    });
    const saves = store.saves;
    await expect(
      handler.execute(new UpdateVitrineSubscriberIdentityCommand("sub_agence", " ", null, null)),
    ).rejects.toThrow(VitrineSubscriberNameInvalidError);
    expect(store.saves).toBe(saves);
  });

  it("« tout renvoyer » lève l'échec et oublie les empreintes émises", async () => {
    const failing = subscriber();
    failing.markFailed(AT);
    const store = new MemorySubscribers(failing);
    const prints = new MemoryPrints();
    await prints.record("sub_agence", [{ kind: "item", key: "A", fingerprint: "f" }], [], AT);
    await new ResyncVitrineSubscriberHandler(
      store,
      prints,
      new FixedClock(LATER),
      new DirectUnitOfWork(),
    ).execute(new ResyncVitrineSubscriberCommand("sub_agence"));
    expect((await store.load("sub_agence"))?.isDeliverable).toBe(true);
    expect(await prints.load("sub_agence")).toEqual([]);
  });
});

describe("envoyer un test", () => {
  it("part à l'instant, sans séquence, et un refus ne met pas l'abonné en échec", async () => {
    const cipher = testCipher();
    const minted = testMint(cipher).mint();
    const declared = subscriber();
    declared.rotate(minted.stored, AT);
    const store = new MemorySubscribers(declared);
    const deliveries = new MemoryDeliveries();
    const poster = new ScriptedPoster();
    poster.outcome = { kind: "unreachable", reason: "pas de réponse en 5 s" };
    const clock = new FixedClock(AT);
    const id = await new SendVitrineTestHandler(
      store,
      deliveries,
      new VitrineRelay(poster, cipher, clock),
      new FixedIdGenerator("t"),
      clock,
    ).execute(new SendVitrineTestCommand("sub_agence"));

    expect(JSON.parse(poster.received[0]?.body ?? "{}")).toMatchObject({ test: true, sequence: 0 });
    expect((await deliveries.load(id))?.isFailed).toBe(true);
    expect((await store.load("sub_agence"))?.isDeliverable).toBe(true);
  });

  it("refuse un abonné coupé", async () => {
    const off = subscriber();
    off.setActive(false, AT);
    const clock = new FixedClock(AT);
    const handler = new SendVitrineTestHandler(
      new MemorySubscribers(off),
      new MemoryDeliveries(),
      new VitrineRelay(new ScriptedPoster(), testCipher(), clock),
      new FixedIdGenerator("t"),
      clock,
    );
    await expect(handler.execute(new SendVitrineTestCommand("sub_agence"))).rejects.toThrow(
      VitrineSubscriberInactiveError,
    );
  });
});

describe("renvoyer un envoi", () => {
  function sent(id: string, sequence: number): VitrineDelivery {
    const delivery = VitrineDelivery.prepare({
      id,
      subscriberId: "sub_agence",
      sequence,
      changes: VitrineChanges.of({ changed: { ...NONE, items: ["A"] }, removed: NONE }),
      at: AT,
    });
    delivery.recordSuccess(204, AT);
    return delivery;
  }

  function handler(store: MemorySubscribers, deliveries: MemoryDeliveries) {
    return new ResendVitrineDeliveryHandler(
      deliveries,
      store,
      new FixedClock(LATER),
      new DirectUnitOfWork(),
    );
  }

  it("le remet en attente, et refuse s'il en attend déjà un autre", async () => {
    const deliveries = new MemoryDeliveries();
    await deliveries.save(sent("d1", 1));
    await deliveries.save(sent("d2", 2));
    const resend = handler(new MemorySubscribers(subscriber()), deliveries);

    await resend.execute(new ResendVitrineDeliveryCommand("d1"));
    expect((await deliveries.load("d1"))?.isPending).toBe(true);
    await expect(resend.execute(new ResendVitrineDeliveryCommand("d2"))).rejects.toThrow(
      VitrineDeliveryInFlightError,
    );
  });

  it("refuse tant que l'abonné est en échec : « tout renvoyer » d'abord", async () => {
    const failing = subscriber();
    failing.markFailed(AT);
    const deliveries = new MemoryDeliveries();
    await deliveries.save(sent("d1", 1));
    await expect(
      handler(new MemorySubscribers(failing), deliveries).execute(
        new ResendVitrineDeliveryCommand("d1"),
      ),
    ).rejects.toThrow(VitrineSubscriberFailingError);
  });
});
