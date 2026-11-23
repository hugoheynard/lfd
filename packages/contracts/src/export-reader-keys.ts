import { z } from "zod";

/**
 * **Les clés de lecture de l'export des ventes**, au back-office
 * (`/admin/export-keys`, plan `documentation/commandes/export/plan-export-des-ventes.md`,
 * § 6.1 et § 6.5). Une clé par lecteur, jamais partagée ; le secret n'est
 * montré qu'une fois, à la création.
 */

/** Borne des adresses admises sur une clé : au-delà, c'est une autre clé qu'il faut. */
export const EXPORT_READER_KEY_IPS_MAX = 20;

/**
 * **Créer une clé** (`POST /admin/export-keys`). `allowedIps` vide : toute
 * adresse. La forme seulement : l'échéance dans le passé, une adresse
 * illisible ou un libellé vide sont refusés par la clé elle-même.
 */
export const issueExportReaderKeyPayloadSchema = z.object({
  label: z.string().max(120),
  /** ISO 8601. Obligatoire : une clé oubliée finit par mourir seule. */
  expiresAt: z.iso.datetime({ offset: true }),
  allowedIps: z.array(z.string().max(64)).max(EXPORT_READER_KEY_IPS_MAX),
});
export type IssueExportReaderKeyPayload = z.infer<typeof issueExportReaderKeyPayloadSchema>;

/**
 * Ce que rend la création. `secret` : la clé en clair, montrée cette fois
 * seulement. La même intention rejouée (un double clic) reçoit un 409 : le
 * secret n'est gardé nulle part.
 */
export interface IssuedExportReaderKeyResponse {
  readonly id: string;
  readonly secret: string;
}

/** Une clé, telle que l'écran la liste — jamais son secret ni son haché. */
export interface ExportReaderKeyView {
  readonly id: string;
  readonly label: string;
  /** ISO. */
  readonly createdAt: string;
  readonly createdByStaffId: string;
  /** ISO. */
  readonly expiresAt: string;
  /** ISO, ou `null` tant qu'elle n'est pas révoquée. */
  readonly revokedAt: string | null;
  readonly revokedByStaffId: string | null;
  /** Vide : toute adresse. */
  readonly allowedIps: readonly string[];
}
