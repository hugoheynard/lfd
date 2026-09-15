/**
 * Les fixtures partagées par les deux suites e2e de la **procédure de
 * livraison** : le parcours (`delivery-procedure.e2e-spec.ts`) et les refus mot
 * pour mot (`delivery-procedure-refusals.e2e-spec.ts`).
 *
 * Rien ici ne boote l'application : des octets d'image, une adresse à poster,
 * la lecture d'une réponse, et le semis d'une société. Chaque suite garde son
 * propre `bootstrapE2e`.
 */
import type { CreatedAddressResponse } from "@lfd/contracts";
import type request from "supertest";

import { CustomerRole } from "../src/platform/database/client/client.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

/** Un PNG minimal aux dimensions lisibles — `DeliveryStepPhoto` n'exige rien de plus. */
export function pngOf(width: number, height: number): Buffer {
  const header = Buffer.alloc(25);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.write("IHDR", 12, "latin1");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

/** Un JPEG minimal : SOI puis un SOF0 qui porte ses dimensions. */
export function jpegOf(width: number, height: number): Buffer {
  const frame = Buffer.alloc(17);
  frame.writeUInt16BE(0xffc0, 0);
  frame.writeUInt16BE(17, 2);
  frame[4] = 8;
  frame.writeUInt16BE(height, 5);
  frame.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), frame]);
}

/** Une adresse de livraison telle que l'écran la poste. */
export const DELIVERY = {
  label: "Boutique",
  ligne1: "9 rue de la Roquette",
  ligne2: "",
  codePostal: "75011",
  ville: "Paris",
  pays: "France",
  isDefault: false,
  specs: {
    signatureRequired: false,
    note: "",
    slots: { mode: "everyday", slot: null },
    deliveryContact: null,
    gps: null,
  },
};

/** Les octets de la photo servie, et la réponse pour ses en-têtes. */
export async function photoOf(agent: request.Agent, url: string): Promise<request.Response> {
  return agent
    .get(url)
    .buffer()
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    })
    .expect(200);
}

/** Ce qu'un refus montre à l'écran : son code, et le message affiché tel quel. */
export interface Refusal {
  readonly code: unknown;
  readonly message: unknown;
}

/** Le code et le message d'une réponse d'erreur (`AppErrorFilter`). */
export function refusalOf(response: request.Response): Refusal {
  const body = jsonBody<Refusal>(response);
  return { code: body.code, message: body.message };
}

/**
 * Les refus tels qu'ils sortent aujourd'hui — `{ code, message }`, écrits EN
 * CLAIR : importer les classes d'erreur ferait suivre le filet au code qu'il
 * doit tenir immobile.
 */
export const REFUSED = {
  stepNotFound: {
    code: "account.delivery_step.not_found",
    message: "Cette étape n'existe plus dans la procédure de livraison. Rechargez la procédure.",
  },
  noPhoto: {
    code: "account.delivery_step_photo.not_found",
    message: "Cette étape n'a pas de photo.",
  },
  full: {
    code: "account.delivery_procedure.full",
    message:
      "La procédure compte déjà 20 étapes, le maximum. " +
      "Regroupez deux étapes ou supprimez-en une avant d'en ajouter.",
  },
  stale: {
    code: "account.delivery_procedure.order_stale",
    message:
      "La procédure a changé depuis son affichage (une étape a été ajoutée ou supprimée). " +
      "Rechargez-la, puis réordonnez à nouveau.",
  },
  addressNotFound: { code: "account.address.not_found", message: "Adresse introuvable." },
  adminRequired: {
    code: "account.company.admin_required",
    message: "Seul le gestionnaire de l'entreprise peut effectuer cette action.",
  },
  photo: (reason: string) => ({
    code: "account.delivery_step_photo.invalid",
    message: `Photo de l'étape : ${reason}`,
  }),
  ambiguous: {
    code: "account.delivery_step_photo.ambiguous",
    message:
      "La révision demande à la fois de retirer la photo et d'en joindre une nouvelle. " +
      "Joignez la nouvelle photo seule pour la remplacer, ou retirez-la sans en joindre.",
  },
  payload: (detail: string) => ({
    code: "http.payload.invalid",
    message: `Requête invalide : ${detail}`,
  }),
} as const;

/** Une adresse et une étape qui n'existent nulle part. */
export const UNKNOWN_ADDRESS = "01JUNKNOWNADDRESS000000000";
export const GHOST_STEP = "01JGHOSTSTEP00000000000000";

/** Le vérificateur staff doublé : tout jeton devient cet agent synthétique. */
export function staffVerifier(subject: string): {
  verify: () => Promise<{ subject: string; scopes: string[] }>;
} {
  return { verify: () => Promise.resolve({ subject, scopes: [] }) };
}

/** Un PNG valide gonflé jusqu'à `bytes` octets. */
function paddedPng(bytes: number): Buffer {
  const header = pngOf(40, 30);
  return Buffer.concat([header, Buffer.alloc(bytes - header.length)]);
}

/**
 * **Un octet au-dessus du backstop Multer** (`DELIVERY_STEP_UPLOAD_HARD_LIMIT`,
 * 2 Mo) : le fichier est coupé AVANT d'atteindre le value object.
 */
export const OVER_UPLOAD_LIMIT = paddedPng(2 * 1024 * 1024 + 1);

/** Les photos que le value object refuse, et la raison qu'il en donne. */
export const REFUSED_PHOTOS: readonly (readonly [Buffer, string])[] = [
  [
    paddedPng(Math.round(1.5 * 1024 * 1024)),
    "elle pèse 1.5 Mo, la limite est de 1.0 Mo. " +
      "Reprenez-la depuis l'écran de la procédure, qui la réduit avant l'envoi.",
  ],
  [
    Buffer.from("%PDF-1.4", "latin1"),
    "un JPEG ou un PNG est attendu (ni HEIC, ni PDF). " +
      "Enregistrez la photo dans l'un de ces deux formats, puis déposez-la à nouveau.",
  ],
  [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    "l'image est tronquée : ses dimensions ne se lisent pas. Reprenez la photo.",
  ],
];

/**
 * Le corps entier d'une réponse d'erreur, moins `requestId` — qui change à
 * chaque requête et n'est pas ce qu'on fige.
 */
export function bodyWithoutRequestId(response: request.Response): Record<string, unknown> {
  const body = { ...jsonBody<Record<string, unknown>>(response) };
  delete body["requestId"];
  return body;
}

/**
 * Sème une société, son gestionnaire, un simple membre, et une adresse de
 * livraison posée par la route client ; rend les deux identifiants.
 */
export async function seedCompanyWithDelivery(
  ctx: E2eContext,
  adminSub: string,
  memberSub: string,
): Promise<{ readonly companyId: string; readonly addressId: string }> {
  const admin = await createUser(ctx.prisma, { auth0Sub: adminSub });
  const member = await createUser(ctx.prisma, { auth0Sub: memberSub });
  const company = await createCompany(ctx.prisma, { raisonSociale: "Boulangerie du Marais SAS" });
  await attachTo(ctx.prisma, admin.id, company.id, CustomerRole.owner);
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.orders);
  const created = await ctx
    .asSub(adminSub)
    .post(`/companies/${company.id}/delivery-addresses`)
    .send(DELIVERY)
    .expect(201);
  return { companyId: company.id, addressId: jsonBody<CreatedAddressResponse>(created).id };
}
