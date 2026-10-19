/**
 * E2E des **annonces aux abonnés de la vitrine** (doc
 * `documentation/webhooks/vitrine.md`, Hugo 2026-10-18 et 2026-10-19) — vrai
 * Postgres, mailer doublé (le seul tiers).
 *
 * Ce que seul ce niveau prouve : la clé d'idempotence tenue par l'index
 * unique (un double clic n'écrit qu'une annonce et n'envoie qu'une fois), un
 * e-mail par adresse sans aucune autre en copie, l'aperçu qui n'écrit rien,
 * le journal relu à l'écran avec l'auteur et l'issue par destinataire, et le
 * refus d'un abonné sans contact ; l'auteur nommé par l'annuaire ; la
 * reprise d'une annonce interrompue, qui n'écrit qu'aux pas tentés.
 */
import type {
  VitrineCredentialsView,
  VitrineNoticePreviewView,
  VitrineNoticeView,
} from "@lfd/contracts";

import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

interface SentMail {
  readonly to: string;
  readonly template: string;
  readonly data: unknown;
  readonly idempotencyKey?: string;
}
const sentMails: SentMail[] = [];
const recordingMailer = {
  enabled: true,
  send: (args: SentMail): Promise<{ providerId: null }> => {
    sentMails.push(args);
    return Promise.resolve({ providerId: null });
  },
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, { token: MAILER, value: recordingMailer }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  sentMails.splice(0);
});

const staff = (): ReturnType<E2eContext["http"]> => ctx.asSub(E2E_STAFF_SUB);
const KEY = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

async function subscribe(name: string, contactEmail: string | null): Promise<string> {
  const created = jsonBody<VitrineCredentialsView>(
    await staff()
      .post("/admin/vitrine/subscribers")
      .send({ name, endpointUrl: "https://agence.e2e.test/hook", contents: [], contactEmail })
      .expect(201),
  );
  return created.id;
}

const draft = { subject: "Le catalogue d'automne", message: "Bonjour,\n<b>nouveautés</b>." };

async function notices(): Promise<readonly VitrineNoticeView[]> {
  return jsonBody<readonly VitrineNoticeView[]>(
    await staff().get("/admin/vitrine/notices").expect(200),
  );
}

describe("annoncer aux abonnés", () => {
  it("l'aperçu rend l'e-mail et ses adresses, sans rien écrire ni envoyer", async () => {
    await subscribe("Agence", "Web@Agence.fr");
    await subscribe("Sans contact", null);
    const preview = jsonBody<VitrineNoticePreviewView>(
      await staff()
        .post("/admin/vitrine/notices/preview")
        .send({ ...draft, subscriberIds: null })
        .expect(200),
    );
    expect(preview.subject).toBe(draft.subject);
    expect(preview.html).toContain("&lt;b&gt;nouveautés&lt;/b&gt;");
    expect(preview.recipients.map((r) => r.contactEmail)).toEqual(["web@agence.fr"]);
    expect(sentMails).toHaveLength(0);
    expect(await notices()).toHaveLength(0);
  });

  it("un e-mail par adresse, coupé compris ; un double clic n'envoie rien de plus", async () => {
    const first = await subscribe("Agence", "web@agence.fr");
    const cut = await subscribe("Coupée", "coupee@agence.fr");
    await staff()
      .put(`/admin/vitrine/subscribers/${cut}/active`)
      .send({ active: false })
      .expect(204);
    const body = { ...draft, subscriberIds: null, idempotencyKey: KEY };

    const [a, b] = await Promise.all([
      staff().post("/admin/vitrine/notices").send(body).expect(201),
      staff().post("/admin/vitrine/notices").send(body).expect(201),
    ]);
    const again = await staff().post("/admin/vitrine/notices").send(body).expect(201);

    const id = jsonBody<{ id: string }>(a).id;
    expect(jsonBody<{ id: string }>(b).id).toBe(id);
    expect(jsonBody<{ id: string }>(again).id).toBe(id);
    expect(sentMails.map((m) => m.to).sort()).toEqual(["coupee@agence.fr", "web@agence.fr"]);
    expect(sentMails.every((m) => m.template === "agency.vitrine-notice")).toBe(true);

    const [notice, ...others] = await notices();
    expect(others).toHaveLength(0);
    expect(notice?.id).toBe(id);
    expect(notice?.authorStaffId).not.toBe("");
    expect(notice?.authorName).toBe("Opérateur E2E");
    expect(notice?.recipients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subscriberId: first, mailSent: true }),
        expect.objectContaining({ subscriberId: cut, mailSent: true }),
      ]),
    );
  });

  it("refuse un abonné sans contact choisi, en le nommant", async () => {
    const mute = await subscribe("Muette", null);
    const response = await staff()
      .post("/admin/vitrine/notices")
      .send({ ...draft, subscriberIds: [mute], idempotencyKey: KEY })
      .expect(409);
    expect(JSON.stringify(response.body)).toContain("Muette");
    expect(sentMails).toHaveLength(0);
    expect(await notices()).toHaveLength(0);
  });

  it("refuse une clé d'idempotence qui n'est pas un UUID", async () => {
    await subscribe("Agence", "web@agence.fr");
    await staff()
      .post("/admin/vitrine/notices")
      .send({ ...draft, subscriberIds: null, idempotencyKey: "abc" })
      .expect(400);
  });
});

describe("reprendre l'envoi d'une annonce interrompue", () => {
  /**
   * Régression (2026-10-19) : un envoi coupé au milieu laissait des
   * destinataires « pas tentés », sans geste pour les relancer.
   *
   * L'interruption (processus tué entre deux e-mails) ne se produit pas par
   * une route : on remet en base un destinataire à « pas tenté », l'état
   * exact qu'elle laisse.
   */
  it("n'écrit qu'aux pas tentés, sous la même clé, puis refuse quand il n'en reste aucun", async () => {
    await subscribe("Agence", "web@agence.fr");
    const cut = await subscribe("Coupée", "coupee@agence.fr");
    const id = jsonBody<{ id: string }>(
      await staff()
        .post("/admin/vitrine/notices")
        .send({ ...draft, subscriberIds: null, idempotencyKey: KEY })
        .expect(201),
    ).id;
    await ctx.prisma.vitrineNoticeRecipient.update({
      where: { noticeId_subscriberId: { noticeId: id, subscriberId: cut } },
      data: { mailSent: null, attemptedAt: null },
    });
    sentMails.splice(0);

    await staff().post(`/admin/vitrine/notices/${id}/resume`).expect(204);

    expect(sentMails.map((m) => [m.to, m.idempotencyKey])).toEqual([
      ["coupee@agence.fr", `vitrine-notice:${id}:${cut}`],
    ]);
    const [notice] = await notices();
    expect(notice?.recipients.every((r) => r.mailSent === true)).toBe(true);

    const refused = await staff().post(`/admin/vitrine/notices/${id}/resume`).expect(409);
    expect(jsonBody<{ code: string }>(refused).code).toBe("vitrine.notice.nothing_to_resume");
    expect(sentMails).toHaveLength(1);
  });

  it("une annonce inconnue répond 404", async () => {
    await staff().post("/admin/vitrine/notices/absente/resume").expect(404);
  });
});
