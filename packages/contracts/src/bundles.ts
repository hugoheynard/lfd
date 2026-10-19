import { z } from "zod";

/**
 * ── Les FORMULES — la composition (lot F2a) ─────────────────────────────────
 *
 * Une formule : des groupes, chacun avec ses articles au choix ; le client en
 * prend un par groupe (`documentation/formules/plan-les-formules.md`). Ce lot
 * n'en porte que la COMPOSITION — ni prix, ni mise en vente — et la formule
 * n'est visible nulle part hors du back-office.
 *
 * Ce contrat ne valide que la **forme**. Au moins deux groupes, au moins un
 * choix par groupe, un article une seule fois, des textes non vides et
 * bornés, l'article servi au public et pas réservé aux opérations : tout cela
 * est tenu par l'agrégat `Bundle` et son cas d'usage.
 *
 * Routes (surface `shop_bundles`) :
 *
 * - `GET  /admin/bundles` → `BundleView[]` (retirées comprises, la plus récemment écrite d'abord)
 * - `GET  /admin/bundles/:key` → `BundleView`
 * - `POST /admin/bundles` ← `CreateBundlePayload` → `BundleKeyResponse` (201)
 * - `PUT  /admin/bundles/:key/presentation` ← `EditBundlePresentationPayload` → `BundleKeyResponse`
 * - `PUT  /admin/bundles/:key/composition` ← `SaveBundleCompositionPayload` → `BundleKeyResponse`
 * - `PUT  /admin/bundles/:key/withdraw` → `BundleKeyResponse`
 * - `PUT  /admin/bundles/:key/draft` → `BundleKeyResponse`
 * - `GET  /admin/bundle-choices?q=` → `BundleChoiceCandidateView[]`
 */

/** Les états de ce lot. `on_sale` viendra avec le prix. Une VALEUR de donnée. */
export const BUNDLE_STATUSES = ["draft", "withdrawn"] as const;
export type BundleStatus = (typeof BUNDLE_STATUSES)[number];

/** À qui une formule se vend : le public seulement, pour l'instant (D4). */
export type BundleAudience = "public";

/**
 * Ce qu'un article choisi est aujourd'hui pour une formule. `unknown` = le
 * catalogue ne le connaît plus (retiré) ; les deux autres refus disent
 * pourquoi il ne pourrait plus y être ajouté — il y reste, l'écran le signale.
 */
export const BUNDLE_CHOICE_STANDINGS = [
  "admissible",
  "not_served_to_public",
  "operation_only",
  "unknown",
] as const;
export type BundleChoiceStanding = (typeof BUNDLE_CHOICE_STANDINGS)[number];

const groupChoices = z.array(z.string());

export const createBundlePayloadSchema = z.strictObject({
  name: z.string(),
  description: z.string().nullable(),
  groups: z.array(z.strictObject({ label: z.string(), choices: groupChoices })),
});
export type CreateBundlePayload = z.infer<typeof createBundlePayloadSchema>;

export const editBundlePresentationPayloadSchema = z.strictObject({
  name: z.string(),
  description: z.string().nullable(),
});
export type EditBundlePresentationPayload = z.infer<typeof editBundlePresentationPayloadSchema>;

/**
 * La composition ENTIÈRE, dans l'ordre voulu. `key: null` = un groupe neuf,
 * dont la clé se tire du libellé ; une clé donnée désigne un groupe existant,
 * qui la garde même renommé.
 */
export const saveBundleCompositionPayloadSchema = z.strictObject({
  groups: z.array(
    z.strictObject({ key: z.string().nullable(), label: z.string(), choices: groupChoices }),
  ),
});
export type SaveBundleCompositionPayload = z.infer<typeof saveBundleCompositionPayloadSchema>;

export interface BundleKeyResponse {
  readonly key: string;
}

/** Un article choisi, avec ce que le catalogue en dit aujourd'hui. */
export interface BundleChoiceView {
  readonly sku: string;
  /** `null` quand le catalogue ne le connaît plus (`standing: "unknown"`). */
  readonly name: string | null;
  /** Le rayon (la famille) ; `null` si inconnu. */
  readonly shelf: string | null;
  readonly thumbnailUrl: string | null;
  readonly standing: BundleChoiceStanding;
}

export interface BundleGroupView {
  readonly key: string;
  readonly label: string;
  readonly choices: readonly BundleChoiceView[];
}

export interface BundleView {
  /** L'identité dans l'URL : tirée du nom à la création, puis immuable. */
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly audience: BundleAudience;
  readonly status: BundleStatus;
  readonly groups: readonly BundleGroupView[];
  /** Instants ISO. */
  readonly createdAt: string;
  readonly writtenAt: string;
  /** Le membre de l'équipe qui l'a écrite en dernier (`StaffUser.id`), ou `null`. */
  readonly writtenBy: string | null;
}

/** Un article qu'on peut ajouter à une formule : servi au public, pas réservé aux opérations. */
export interface BundleChoiceCandidateView {
  readonly sku: string;
  readonly name: string;
  readonly shelf: string;
  readonly thumbnailUrl: string | null;
}
