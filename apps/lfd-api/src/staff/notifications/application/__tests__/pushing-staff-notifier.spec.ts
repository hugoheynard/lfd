import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { StaffNoticeStore, type StaffNotice } from "../../domain/ports/staff-notifier.js";
import {
  StaffPushSender,
  StaffPushSubscriptions,
  type PushOutcome,
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
const TABLET: StaffPushTarget = { endpoint: "https://push.example/2", p256dh: "k", auth: "a" };

const NOTHING: PushOutcome = { gone: [], rejected: [] };

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
  failing: string[] = [];
  expiredBefore: Date | null = null;
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
  markFailing(endpoints: readonly string[]): Promise<void> {
    this.failing.push(...endpoints);
    return Promise.resolve();
  }
  forgetFailingSince(before: Date): Promise<number> {
    this.expiredBefore = before;
    return Promise.resolve(0);
  }
}

class SenderDouble extends StaffPushSender {
  pushed: StaffNotice[] = [];
  constructor(
    private readonly key: string | null = "vapid-public",
    private readonly outcome: PushOutcome = NOTHING,
    private readonly boom = false,
  ) {
    super();
  }
  publicKey(): string | null {
    return this.key;
  }
  send(_targets: readonly StaffPushTarget[], n: StaffNotice): Promise<PushOutcome> {
    if (this.boom) {
      return Promise.reject(new Error("service de push injoignable"));
    }
    this.pushed.push(n);
    return Promise.resolve(this.outcome);
  }
}

/**
 * La cloche, plus le point d'attente qui manquait.
 *
 * La poussée part en travail de FOND : `notify` rend la main avant qu'un seul
 * service de push ait répondu. Sans `whenIdle()`, chaque assertion ci-dessous
 * lirait un état encore en vol — et passerait ou non selon l'ordonnancement.
 *
 * Le vrai `BackgroundWork` plutôt qu'un double : c'est lui qui avale les échecs,
 * et c'est précisément ce comportement-là qu'un des tests éprouve.
 */
function build(
  store: StoreDouble,
  subs: SubscriptionsDouble,
  sender: SenderDouble,
): { notifier: PushingStaffNotifier; settled: () => Promise<void> } {
  const work = new BackgroundWork();
  return {
    notifier: new PushingStaffNotifier(store, subs, sender, new FixedClock(AT), work),
    settled: () => work.whenIdle(),
  };
}

/** Émettre, puis attendre que le fond ait fini. */
async function notifyAndSettle(
  store: StoreDouble,
  subs: SubscriptionsDouble,
  sender: SenderDouble,
  notices: readonly StaffNotice[],
): Promise<void> {
  const { notifier, settled } = build(store, subs, sender);
  await notifier.notify(notices);
  await settled();
}

describe("la cloche qui pousse", () => {
  it("ne fait vibrer que sur du NOUVEAU", async () => {
    // Le fait est rejoué : la base l'écarte, donc `save` ne rend rien. Sans
    // cette garantie, l'anti-doublon ne vaudrait que pour l'écran, et chaque
    // rejeu réveillerait toute l'équipe.
    const sender = new SenderDouble();
    const subs = new SubscriptionsDouble();
    await notifyAndSettle(new StoreDouble([]), subs, sender, [notice("k1")]);

    expect(sender.pushed).toEqual([]);
    expect(subs.sent).toEqual([]);
  });

  it("pousse ce qui vient d'être créé, et marque l'envoi", async () => {
    const created = notice("k1");
    const sender = new SenderDouble();
    const subs = new SubscriptionsDouble();
    await notifyAndSettle(new StoreDouble([created]), subs, sender, [created]);

    expect(sender.pushed).toEqual([created]);
    expect(subs.sent).toEqual([PHONE.endpoint]);
  });

  it("oublie un abonnement DÉFINITIVEMENT mort, et ne le marque pas envoyé", async () => {
    const created = notice("k1");
    const sender = new SenderDouble("vapid-public", { gone: [PHONE.endpoint], rejected: [] });
    const subs = new SubscriptionsDouble();
    await notifyAndSettle(new StoreDouble([created]), subs, sender, [created]);

    expect(subs.forgotten).toEqual([PHONE.endpoint]);
    expect(subs.sent).toEqual([]);
  });

  it("enregistre quand même le fait si le service de push est injoignable", async () => {
    // La garantie qui compte : perdre la notification parce qu'un téléphone est
    // éteint serait absurde. L'écran est le canal sûr, le push un bonus.
    const created = notice("k1");
    const store = new StoreDouble([created]);
    const sender = new SenderDouble("vapid-public", NOTHING, true);

    await expect(
      notifyAndSettle(store, new SubscriptionsDouble(), sender, [created]),
    ).resolves.toBeUndefined();
    expect(store.saved).toEqual([created]);
  });

  it("NE désabonne PAS sur un refus — il peut venir de nous", async () => {
    // Le piège : une paire VAPID mal déployée refuse EXACTEMENT comme un
    // abonnement périmé. Oublier au premier 403 viderait la table sur une
    // erreur de configuration, et chaque téléphone devrait réactiver à la main.
    const created = notice("k1");
    const sender = new SenderDouble("vapid-public", { gone: [], rejected: [PHONE.endpoint] });
    const subs = new SubscriptionsDouble();
    await notifyAndSettle(new StoreDouble([created]), subs, sender, [created]);

    expect(subs.forgotten).toEqual([]);
    expect(subs.failing).toEqual([PHONE.endpoint]);
    // Ni marqué envoyé : il ne l'a pas été.
    expect(subs.sent).toEqual([]);
  });

  it("laisse au refus une semaine avant de l'oublier", async () => {
    const created = notice("k1");
    const subs = new SubscriptionsDouble();
    await notifyAndSettle(new StoreDouble([created]), subs, new SenderDouble(), [created]);

    // Le temps est le seul arbitre entre « cet abonnement est périmé » et
    // « notre clé est la mauvaise » : le premier ne guérit jamais, le second se
    // répare dans la journée.
    expect(subs.expiredBefore).toEqual(new Date("2026-08-13T10:00:00.000Z"));
  });

  it("distingue le disparu du refusé dans le même envoi", async () => {
    const created = notice("k1");
    const sender = new SenderDouble("vapid-public", {
      gone: [PHONE.endpoint],
      rejected: [TABLET.endpoint],
    });
    const subs = new SubscriptionsDouble([PHONE, TABLET]);
    await notifyAndSettle(new StoreDouble([created]), subs, sender, [created]);

    expect(subs.forgotten).toEqual([PHONE.endpoint]);
    expect(subs.failing).toEqual([TABLET.endpoint]);
  });

  it("ne lit même pas les abonnements sans paire VAPID", async () => {
    const created = notice("k1");
    const subs = new SubscriptionsDouble();
    await notifyAndSettle(new StoreDouble([created]), subs, new SenderDouble(null), [created]);

    expect(subs.sent).toEqual([]);
  });
});
