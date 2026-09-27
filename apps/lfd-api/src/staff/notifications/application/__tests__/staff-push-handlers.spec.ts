import type { StaffNotice } from "../../domain/ports/staff-notifier.js";
import {
  StaffPushSender,
  StaffPushSubscriptions,
  type PushOutcome,
  type StaffPushTarget,
} from "../../domain/ports/staff-push.js";
import { SubscribeStaffPushCommand } from "../commands/subscribe-staff-push.command.js";
import { SubscribeStaffPushHandler } from "../commands/subscribe-staff-push.handler.js";
import { UnsubscribeStaffPushCommand } from "../commands/unsubscribe-staff-push.command.js";
import { UnsubscribeStaffPushHandler } from "../commands/unsubscribe-staff-push.handler.js";
import { GetPushCapabilityHandler } from "../queries/get-push-capability.handler.js";

const PHONE: StaffPushTarget = { endpoint: "https://push.example/1", p256dh: "k", auth: "a" };

class SubscriptionsDouble extends StaffPushSubscriptions {
  readonly saved: { target: StaffPushTarget; staffUserId: string }[] = [];
  readonly forgotten: string[] = [];
  save(target: StaffPushTarget, staffUserId: string): Promise<void> {
    this.saved.push({ target, staffUserId });
    return Promise.resolve();
  }
  forget(endpoint: string): Promise<void> {
    this.forgotten.push(endpoint);
    return Promise.resolve();
  }
  all(): Promise<readonly StaffPushTarget[]> {
    return Promise.resolve([]);
  }
  markSent(): Promise<void> {
    return Promise.resolve();
  }
  markFailing(): Promise<void> {
    return Promise.resolve();
  }
  forgetFailingSince(): Promise<number> {
    return Promise.resolve(0);
  }
}

class SenderDouble extends StaffPushSender {
  constructor(private readonly key: string | null) {
    super();
  }
  send(_targets: readonly StaffPushTarget[], _notice: StaffNotice): Promise<PushOutcome> {
    return Promise.resolve({ gone: [], rejected: [] });
  }
  publicKey(): string | null {
    return this.key;
  }
}

describe("GetPushCapabilityHandler", () => {
  it("rend la clé publique VAPID", async () => {
    const capability = await new GetPushCapabilityHandler(new SenderDouble("vapid")).execute();

    expect(capability).toEqual({ publicKey: "vapid" });
  });

  it("rend null quand l'envoi n'est pas configuré", async () => {
    const capability = await new GetPushCapabilityHandler(new SenderDouble(null)).execute();

    expect(capability).toEqual({ publicKey: null });
  });
});

describe("SubscribeStaffPushHandler", () => {
  it("enregistre l'installation avec la trace de qui l'a abonnée", async () => {
    const subscriptions = new SubscriptionsDouble();

    await new SubscribeStaffPushHandler(subscriptions).execute(
      new SubscribeStaffPushCommand(PHONE, "staff_1"),
    );

    expect(subscriptions.saved).toEqual([{ target: PHONE, staffUserId: "staff_1" }]);
  });
});

describe("UnsubscribeStaffPushHandler", () => {
  it("oublie l'installation par son endpoint", async () => {
    const subscriptions = new SubscriptionsDouble();

    await new UnsubscribeStaffPushHandler(subscriptions).execute(
      new UnsubscribeStaffPushCommand(PHONE.endpoint),
    );

    expect(subscriptions.forgotten).toEqual([PHONE.endpoint]);
  });
});
