import { z } from "zod";

/**
 * **Les destinataires des avis** — à qui part un e-mail que le système écrit
 * à l'équipe (doc `documentation/payment/les-liens-de-paiement.md`).
 * Un avis se règle par **rôles** et par **membres**
 * nommés ; sans réglage joignable, il part à la boîte de l'équipe.
 *
 * Seul l'avis « paiement reçu par un lien » se règle ainsi (Hugo,
 * 2026-11-22) : la demande d'aide et l'alerte de compte gardent la boîte.
 * Une valeur de plus ici ouvre un avis à l'écran ; son envoyeur doit alors
 * passer par l'envoi « à l'équipe » du bloc `mail`.
 */
export const STAFF_NOTICE_TEMPLATES = ["staff.link-payment-received"] as const;
export const staffNoticeTemplateSchema = z.enum(STAFF_NOTICE_TEMPLATES);
export type StaffNoticeTemplate = z.infer<typeof staffNoticeTemplateSchema>;

/** Le nom d'un avis, tel que l'équipe le lit à l'écran et au journal. */
export const STAFF_NOTICE_LABELS: Readonly<Record<StaffNoticeTemplate, string>> = {
  "staff.link-payment-received": "Paiement reçu par un lien",
};

/** Borne d'une liste de destinataires : au-delà, c'est un rôle qu'il faut régler. */
export const STAFF_NOTICE_AUDIENCE_MAX = 50;

/**
 * **Régler les destinataires d'un avis** (`PUT /admin/staff-notice-audiences/:template`) :
 * l'ensemble voulu, pas un écart. Deux listes vides : plus personne, l'avis
 * repart à la boîte de l'équipe. Un doublon est ignoré.
 */
export const setStaffNoticeAudiencePayloadSchema = z.object({
  roleKeys: z.array(z.string().min(1).max(80)).max(STAFF_NOTICE_AUDIENCE_MAX),
  staffUserIds: z.array(z.string().min(1).max(80)).max(STAFF_NOTICE_AUDIENCE_MAX),
});
export type SetStaffNoticeAudiencePayload = z.infer<typeof setStaffNoticeAudiencePayloadSchema>;

/** Un rôle, réglé ou proposable. `archived` : il ne se propose plus, mais reste lisible. */
export interface StaffNoticeRoleView {
  readonly key: string;
  readonly label: string;
  readonly archived: boolean;
}

/**
 * Un membre, réglé ou proposable. `reachable` : non suspendu et avec une
 * adresse — un membre réglé qui ne l'est pas ne reçoit rien, et l'écran le dit.
 */
export interface StaffNoticeMemberView {
  readonly staffUserId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly reachable: boolean;
}

/** Le réglage d'un avis, et ce que l'écran peut proposer d'y cocher. */
export interface StaffNoticeAudienceView {
  readonly template: StaffNoticeTemplate;
  readonly label: string;
  /** Les rôles réglés, par libellé. */
  readonly roles: readonly StaffNoticeRoleView[];
  /** Les membres réglés, par nom. */
  readonly members: readonly StaffNoticeMemberView[];
}

/**
 * `GET /admin/staff-notice-audiences` : chaque avis réglable, dans l'ordre de
 * {@link STAFF_NOTICE_TEMPLATES}, et les candidats communs à tous — les rôles
 * non archivés (`superadmin` exclu : il n'a pas de fiche à viser) et les
 * membres non suspendus. Servis ici parce que l'écran vit sous son propre
 * droit, sans `staff_access`.
 */
export interface StaffNoticeAudiencesView {
  readonly notices: readonly StaffNoticeAudienceView[];
  readonly candidates: {
    readonly roles: readonly StaffNoticeRoleView[];
    readonly members: readonly StaffNoticeMemberView[];
  };
}
