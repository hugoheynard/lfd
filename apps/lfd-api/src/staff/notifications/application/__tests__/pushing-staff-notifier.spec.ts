import type { StaffPermission } from "@lfd/contracts";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { FixedStaffPermissionHolders } from "../../../directory/domain/__tests__/fixed-staff-permission-holders.js";
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

/** Une installation, et la fiche qui l'a abonnée — la clé de routage (B5). */
interface Owned {
  readonly target: StaffPushTarget;
  readonly staffUserId: string;
}

/** Ana tient la cloche partagée ; c'est elle qui a abonné les appareils par défaut. */
const ANA = "staff_ana";
const owned = (target: StaffPushTarget, staffUserId = ANA): Owned => ({ target, staffUserId });

/** Qui tient quoi, au moment de l'envoi : Ana, la cloche partagée. */
function holders(
  entries: readonly (readonly [StaffPermission, readonly string[]])[] = [
    ["staff_notifications:read", [ANA]],
  ],
): FixedStaffPermissionHolders {
  return new FixedStaffPermissionHolders(
    new Map(
      entries.map(([permission, ids]) => [
        permission,
        ids.map((staffUserId) => ({ staffUserId, firstName: staffUserId, lastName: "" })),
      ]),
    ),
  );
}

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
  /** Les fiches dont on a demandé les installations, envoi par envoi. */
  readonly askedFor: (readonly string[])[] = [];
  constructor(private readonly targets: readonly Owned[] = [owned(PHONE)]) {
    super();
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  forget(endpoint: string): Promise<void> {
    this.forgotten.push(endpoint);
    return Promise.resolve();
  }
  ofStaff(staffUserIds: readonly string[]): Promise<readonly StaffPushTarget[]> {
    this.askedFor.push(staffUserIds);
    return Promise.resolve(
      this.targets
        .filter((entry) => staffUserIds.includes(entry.staffUserId))
        .map((entry) => entry.target),
    );
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
  who: FixedStaffPermissionHolders = holders(),
): { notifier: PushingStaffNotifier; settled: () => Promise<void> } {
  const work = new BackgroundWork();
  return {
    notifier: new PushingStaffNotifier(store, subs, sender, new FixedClock(AT), work, who),
    settled: () => work.whenIdle(),
  };
}

/** Émettre, puis attendre que le fond ait fini. */
async function notifyAndSettle(
  store: StoreDouble,
  subs: SubscriptionsDouble,
  sender: SenderDouble,
  notices: readonly StaffNotice[],
  who?: FixedStaffPermissionHolders,
): Promise<void> {
  const { notifier, settled } = build(store, subs, sender, who);
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
    const subs = new SubscriptionsDouble([owned(PHONE), owned(TABLET)]);
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

/**
 * Le mur de la poussée, dans les deux sens (`plan-a-la-porte.md`, B5 ;
 * `plan-tournee-prete.md`, PL5-D2). Régression : la poussée partait à TOUS
 * les abonnements (`all()`) — un livreur qui abonnait son téléphone aurait
 * reçu toutes les alertes partagées.
 */
describe("la poussée suit le mur de la lecture", () => {
  const DRIVER = "staff_paul";
  const SALES = "staff_lea";
  const DRIVER_PHONE: StaffPushTarget = {
    endpoint: "https://push.example/paul",
    p256dh: "k",
    auth: "a",
  };
  const SALES_PHONE: StaffPushTarget = {
    endpoint: "https://push.example/lea",
    p256dh: "k",
    auth: "a",
  };
  const devices = (): SubscriptionsDouble =>
    new SubscriptionsDouble([owned(PHONE), owned(DRIVER_PHONE, DRIVER), owned(SALES_PHONE, SALES)]);
  const who = (): FixedStaffPermissionHolders =>
    holders([
      ["staff_notifications:read", [ANA, SALES]],
      ["b2b_companies:write", [SALES]],
    ]);

  it("🔴 une notice PARTAGÉE ne part qu'à qui tient encore la cloche — jamais au livreur", async () => {
    const created = notice("k1");
    const subs = devices();
    await notifyAndSettle(new StoreDouble([created]), subs, new SenderDouble(), [created], who());

    expect(subs.askedFor).toEqual([[ANA, SALES]]);
    expect(subs.sent).toEqual([PHONE.endpoint, SALES_PHONE.endpoint]);
  });

  it("🔴 une notice d'AUDIENCE ne part qu'à qui tient le droit visé", async () => {
    const created: StaffNotice = { ...notice("k2"), audience: "b2b_companies:write" };
    const subs = devices();
    const permissions = who();
    await notifyAndSettle(
      new StoreDouble([created]),
      subs,
      new SenderDouble(),
      [created],
      permissions,
    );

    expect(permissions.asked).toEqual(["b2b_companies:write"]);
    expect(subs.sent).toEqual([SALES_PHONE.endpoint]);
  });

  it("personne ne tient le droit : rien ne part, aucun appareil n'est lu", async () => {
    const created: StaffNotice = { ...notice("k3"), audience: "b2b_companies:write" };
    const sender = new SenderDouble();
    const subs = devices();
    await notifyAndSettle(new StoreDouble([created]), subs, sender, [created], holders([]));

    expect(sender.pushed).toEqual([]);
    expect(subs.askedFor).toEqual([[]]);
  });
});
