import { Buffer } from "node:buffer";

import { CustomerRequest, type RequestReception } from "../customer-request.js";
import { RequestPhoto } from "../request-photo.js";
import { RequestReason, type RequestReasonSettings } from "../request-reason.js";

/** Un instant sans calendrier : rien ici n'est comparé à l'horloge du jour. */
export const AT = new Date(0);
export const LATER = new Date(60_000);

/** Un PNG minimal : signature puis IHDR. */
export function pngOf(width: number, height: number): Buffer {
  const header = Buffer.alloc(25);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.write("IHDR", 12, "latin1");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

/** Un WebP VP8X minimal, 40 × 30. */
export function webpOf(): Buffer {
  const bytes = Buffer.alloc(30);
  bytes.write("RIFF", 0, "latin1");
  bytes.write("WEBP", 8, "latin1");
  bytes.write("VP8X", 12, "latin1");
  bytes.writeUIntLE(39, 24, 3);
  bytes.writeUIntLE(29, 27, 3);
  return bytes;
}

export function photo(): RequestPhoto {
  return RequestPhoto.create(pngOf(40, 30));
}

export const CONTACT_SETTINGS: RequestReasonSettings = {
  kind: "contact",
  label: { fr: "Devenir client pro", en: "", it: "" },
  recipientEmail: "commercial@lfc.fr",
  position: 0,
  active: true,
  audience: "b2b",
  priority: "urgent",
};

export function reason(
  overrides: Partial<RequestReasonSettings> & { readonly id?: string } = {},
): RequestReason {
  return RequestReason.create({ id: "r_pro", at: AT, ...CONTACT_SETTINGS, ...overrides });
}

export const RECEPTION: RequestReception = {
  id: "q1",
  reason: { id: "r1", labelFr: "Produit abîmé", priority: "medium" },
  audience: "b2c",
  author: { name: "Jean Martin", email: "jean@exemple.fr", phone: "06 00 00 00 00" },
  body: "Le pain était écrasé.",
  userId: "u1",
  companyId: null,
  at: AT,
};

export const ORDER = { id: "o1", number: "CMD-0001" };

export function orderProblem(overrides: Partial<RequestReception> = {}): CustomerRequest {
  return CustomerRequest.orderProblem({ ...RECEPTION, ...overrides, order: ORDER });
}

export function contactRequest(overrides: Partial<RequestReception> = {}): CustomerRequest {
  return CustomerRequest.contact({
    ...RECEPTION,
    reason: { id: "r_pro", labelFr: "Devenir client pro", priority: "urgent" },
    ...overrides,
  });
}
