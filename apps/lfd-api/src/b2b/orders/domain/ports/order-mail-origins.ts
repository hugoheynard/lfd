/**
 * **Les origines des deux applications**, réduites à ce qu'un courriel de
 * commande en fait : un lien vers l'espace client, une URL de QR vers le
 * back-office.
 *
 * Port étroit **exprès**. `AppConfig` porte une trentaine de lectures — base de
 * données, Stripe, stockage objet, Auth0 — et l'abonné n'en appelle que deux.
 * Dépendre de l'ensemble « parce qu'il existe déjà » ferait de chaque test de ce
 * courriel un test qui doit fabriquer une configuration entière, ou la caster —
 * et un doublé casté dérive de ce qu'il joue sans que rien ne rougisse.
 *
 * `null` = origine non configurée. Le courriel omet alors le lien concerné,
 * plutôt que d'en poser un relatif, inerte dans une boîte mail.
 */
export abstract class OrderMailOrigins {
  abstract clientBaseUrl(): string | null;
  abstract adminBaseUrl(): string | null;
}
