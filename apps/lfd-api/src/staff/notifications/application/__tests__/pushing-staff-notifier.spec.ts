import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { StaffNoticeStore, type StaffNotice } from "../../domain/ports/staff-notifier.js";
import {
  StaffPushSender,
  StaffPushSubscriptions,
  type StaffPushTarget,
} from "../../domain/ports/staff-push.js";
import { PushingStaffNotifier } from "../pushing-staff-notifier.js";

const AT = new Date("2026-08-20T10:00:00.000Z");

function notice(key: string): StaffNotice {
  return {
    kind: "alert.account",
    subject: "Une société à regarder",
    body: "Le KBIS est expiré.",
    link: "/comptes-clients/abc/alertes",
    idempotencyKey: key,
    occurredAt: AT,
  };
}

const PHONE: StaffPushTarget = { endpoint: "https://push.example/1", p256dh: "k", auth: "a" };

class StoreDouble extends StaffNoticeStore {
  constructor(private readonly created: readonly StaffNotice[]) {
    super();
  }
  saved: readonly StaffNotice[] = [];
  save(notices: readonly StaffNotice[]): Promise<readonly StaffNotice[]> {
    this.saved = notices;
    return Promise.resolve(this.created);
  }
}

class SubscriptionsDouble extends StaffPushSubscriptions {
  forgotten: string[] = [];
  sent: string[] = [];
  constructor(private readonly targets: readonly StaffPushTarget[] = [PHONE]) {
    super();
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  forget(endpoint: string): Promise<void> {
    this.forgotten.push(endpoint);
    return Promise.resolve();
  }
  all(): Promise<readonly StaffPushTarget[]> {
    return Promise.resolve(this.targets);
  }
  markSent(endpoints: readonly string[]): Promise<void> {
    this.sent.push(...endpoints);
    return Promise.resolve();
  }
}

class SenderDouble extends StaffPushSender {
  pushed: StaffNotice[] = [];
  constructor(
    private readonly key: string | null = "vapid-public",
    private readonly dead: readonly string[] = [],
    private readonly boom = false,
  ) {
    super();
  }
  publicKey(): string | null {
    return this.key;
  }
  send(_targets: readonly StaffPushTarget[], n: StaffNotice): Promise<readonly string[]> {
    if (this.boom) {
      return Promise.reject(new Error("service de push injoignable"));
    }
    this.pushed.push(n);
    return Promise.resolve(this.dead);
  }
}

function build(
  store: StoreDouble,
  subs: SubscriptionsDouble,
  sender: SenderDouble,
): PushingStaffNotifier {
  return new PushingStaffNotifier(store, subs, sender, new FixedClock(AT));
}

describe("la cloche qui pousse", () => {
  it("ne fait vibrer que sur du NOUVEAU", async () => {
    // Le fait est rejoué : la base l'écarte, donc `save` ne rend rien. Sans
    // cette garantie, l'anti-doublon ne vaudrait que pour l'écran, et chaque
    // rejeu réveillerait toute l'équipe.
    const sender = new SenderDouble();
    const subs = new SubscriptionsDouble();
    await build(new StoreDouble([]), subs, sender).notify([notice("k1")]);

    expect(sender.pushed).toEqual([]);
    expect(subs.sent).toEqual([]);
  });

  it("pousse ce qui vient d'être créé, et marque l'envoi", async () => {
    const created = notice("k1");
    const sender = new SenderDouble();
    const subs = new SubscriptionsDouble();
    await build(new StoreDouble([created]), subs, sender).notify([created]);

    expect(sender.pushed).toEqual([created]);
    expect(subs.sent).toEqual([PHONE.endpoint]);
  });

  it("oublie un abonnement DÉFINITIVEMENT mort, et ne le marque pas envoyé", async () => {
    const created = notice("k1");
    const sender = new SenderDouble("vapid-public", [PHONE.endpoint]);
    const subs = new SubscriptionsDouble();
    await build(new StoreDouble([created]), subs, sender).notify([created]);

    expect(subs.forgotten).toEqual([PHONE.endpoint]);
    expect(subs.sent).toEqual([]);
  });

  it("enregistre quand même le fait si le service de push est injoignable", async () => {
    // La garantie qui compte : perdre la notification parce qu'un téléphone est
    // éteint serait absurde. L'écran est le canal sûr, le push un bonus.
    const created = notice("k1");
    const store = new StoreDouble([created]);
    const sender = new SenderDouble("vapid-public", [], true);

    await expect(
      build(store, new SubscriptionsDouble(), sender).notify([created]),
    ).resolves.toBeUndefined();
    expect(store.saved).toEqual([created]);
  });

  it("ne lit même pas les abonnements sans paire VAPID", async () => {
    const created = notice("k1");
    const subs = new SubscriptionsDouble();
    await build(new StoreDouble([created]), subs, new SenderDouble(null)).notify([created]);

    expect(subs.sent).toEqual([]);
  });
});
