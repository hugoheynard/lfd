import type { Instant } from "../../../../../platform/context/request-context.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import {
  MailJournal,
  type MailOutcome,
  type MailSendRecord,
} from "../../../../../platform/mailer/journal/mail-journal.port.js";
import type { B2bMailer } from "../../../../../platform/mailer/mailer.tokens.js";
import { Clock } from "../../../../../platform/time/clock.js";
import { OrderPlacedEvent } from "../../../domain/events/order-placed.event.js";
import {
  GuestOrderNoticeReader,
  type GuestOrderNotice,
} from "../../../domain/ports/guest-order-notice.reader.js";
import { SendGuestOrderNotice } from "../send-guest-order-notice.handler.js";

const PROPRIETAIRE: GuestOrderNotice = { email: "camille@exemple.fr", firstName: "Camille" };

const UN_MARDI = new Date("2026-09-15T09:00:00.000Z");
const PLUS_TARD_LE_MEME_JOUR = new Date("2026-09-15T22:30:00.000Z");
const LE_LENDEMAIN = new Date("2026-09-16T09:00:00.000Z");

const EVENT = new OrderPlacedEvent("ord_1", "CMD-0001", "user_guest", null, 1_200);

/** Ce qu'on prévient : à qui, avec quel gabarit, et quoi. */
interface Sent {
  readonly to: string;
  readonly template: string;
  readonly data: unknown;
}

/** Il y a quelqu'un à prévenir, ou personne — la seule question que ce port pose. */
class NoticeStub extends GuestOrderNoticeReader {
  constructor(private readonly notice: GuestOrderNotice | null) {
    super();
  }

  noticeFor(): Promise<GuestOrderNotice | null> {
    return Promise.resolve(this.notice);
  }
}

/**
 * Le registre d'unicité, joué **comme la base le tient** : la première clé est
 * neuve, les suivantes ne le sont plus. C'est un refus, pas une lecture — deux
 * commandes simultanées qui liraient d'abord trouveraient toutes deux le
 * registre vide.
 */
class JournalStub extends MailJournal {
  readonly keys: string[] = [];
  private readonly seen = new Set<string>();

  recordSend(_record: MailSendRecord): Promise<void> {
    return Promise.resolve();
  }

  recordOutcome(_outcome: MailOutcome): Promise<void> {
    return Promise.resolve();
  }

  rememberEvent(provider: string, externalId: string): Promise<boolean> {
    this.keys.push(`${provider}/${externalId}`);
    const fresh = !this.seen.has(externalId);
    this.seen.add(externalId);
    return Promise.resolve(fresh);
  }
}

/** L'heure du SERVEUR, déplaçable à la main — c'est elle qui borne l'envoi. */
class ClockStub extends Clock {
  constructor(private at: Date) {
    super();
  }

  now(): Instant {
    return this.at;
  }

  moveTo(when: Date): void {
    this.at = when;
  }
}

function scene(notice: GuestOrderNotice | null = PROPRIETAIRE) {
  const sent: Sent[] = [];
  const journal = new JournalStub();
  const clock = new ClockStub(UN_MARDI);
  // 🔴 Le VRAI suivi de fond, pas un double : `whenIdle()` est fait pour ça, et
  // un double laisserait dériver ce qu'il prétend jouer — notamment le fait
  // qu'un échec d'envoi est avalé après journalisation.
  const work = new BackgroundWork();
  const mailer: B2bMailer = {
    enabled: true,
    send: (args) => {
      sent.push({ to: args.to, template: String(args.template), data: args.data });
      return Promise.resolve({ providerId: "re_1" });
    },
  };

  const handler = new SendGuestOrderNotice(new NoticeStub(notice), journal, clock, work, mailer);

  return {
    sent,
    keys: journal.keys,
    /** Déclenche l'abonné et ATTEND son travail de fond. */
    async fire(when?: Date): Promise<void> {
      if (when !== undefined) {
        clock.moveTo(when);
      }
      handler.handle(EVENT);
      await work.whenIdle();
    },
  };
}

describe("SendGuestOrderNotice — qui l'on prévient", () => {
  it("écrit au propriétaire du compte qui porte l'adresse", async () => {
    const world = scene();

    await world.fire();

    expect(world.sent).toHaveLength(1);
    expect(world.sent[0]?.to).toBe("camille@exemple.fr");
    expect(world.sent[0]?.template).toBe("customer.order-placed-with-your-email");
  });

  /**
   * Le prénom du COMPTE, pas celui tapé au panier : on salue la personne qu'on
   * prévient, et les deux peuvent différer — c'est toute la raison de cet envoi.
   */
  it("salue le titulaire du compte, jamais celui qui a commandé", async () => {
    const world = scene();

    await world.fire();

    expect(world.sent[0]?.data).toEqual({ firstName: "Camille" });
  });

  /**
   * Le cas NORMAL, et il doit rester silencieux : le porteur n'est pas un
   * invité, ou personne d'autre ne porte cette adresse. On ne réclame alors
   * même pas de clé — rien ne doit s'écrire pour un non-événement.
   */
  it("n'écrit à PERSONNE quand il n'y a personne à prévenir", async () => {
    const world = scene(null);

    await world.fire();

    expect(world.sent).toEqual([]);
    expect(world.keys).toEqual([]);
  });
});

describe("SendGuestOrderNotice — le bornage", () => {
  /**
   * 🔴 **Sans borne, c'est une arme.** L'envoi est déclenché par un anonyme :
   * enchaîner les commandes harcèlerait un vrai client, avec nos e-mails.
   */
  it("ne prévient qu'UNE fois pour la même adresse le même jour", async () => {
    const world = scene();

    await world.fire();
    await world.fire(PLUS_TARD_LE_MEME_JOUR);
    await world.fire(PLUS_TARD_LE_MEME_JOUR);

    expect(world.sent).toHaveLength(1);
  });

  /**
   * La borne est un jour, pas un silence définitif : quelqu'un dont l'adresse
   * sert vraiment tous les jours doit continuer de l'apprendre.
   */
  it("prévient à nouveau le lendemain", async () => {
    const world = scene();

    await world.fire();
    await world.fire(LE_LENDEMAIN);

    expect(world.sent).toHaveLength(2);
  });

  /** La clé porte l'adresse ET le jour, sur son propre canal. */
  it("borne par adresse et par jour", async () => {
    const world = scene();

    await world.fire();

    expect(world.keys).toEqual(["guest-order-notice/camille@exemple.fr:2026-09-15"]);
  });
});
