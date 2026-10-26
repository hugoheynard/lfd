# Le registre des traceurs de la boutique

> ✅ **Relevé le 2026-10-26** dans le code de `apps/lfc-ecommerce-frontend`
> (`localStorage`, `sessionStorage`, `client/local-store.ts` qui préfixe ses
> clés par `lfc.`, `auth/auth.providers.ts`, `client/stripe-loader.service.ts`).
> C'est la source de la **liste des traceurs** publiée dans la politique
> cookies (mention `cookies`, Réglages › Légal › Cookies). Un traceur ajouté au
> code s'inscrit ici **et** dans la politique **avant** d'être déposé.

## Ce qui est déposé aujourd'hui — tout est strictement nécessaire

| Traceur                                                                      | Éditeur                  | Type                | Finalité                                                         | Durée                                        | Défini dans                                                                                   |
| ---------------------------------------------------------------------------- | ------------------------ | ------------------- | ---------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `lfc.cart`, `lfc.cart.savedAt` (et `lfc.cart.ws.<espace>`)                   | CRAZEATIVITY             | stockage local      | le panier, d'une visite à l'autre, par espace                    | jusqu'à la commande ou suppression           | `client/cart/cart.store.ts`                                                                   |
| `lfc.order.choice`                                                           | CRAZEATIVITY             | stockage local      | retrait ou livraison, créneau                                    | jusqu'à suppression                          | `client/order-context.store.ts`                                                               |
| `lfc.guest.identity`                                                         | CRAZEATIVITY             | stockage local      | brouillon des coordonnées d'une commande sans compte             | jusqu'à suppression                          | `client/cart/guest-identity-form/guest-identity-form.ts`                                      |
| `lfc.orders`, `lfc.order-attempt`, `lfc.cart-awaiting-payment`               | CRAZEATIVITY             | stockage local      | commande en cours de paiement, contre le double paiement         | jusqu'à la fin de la commande ou suppression | `client/client-orders.service.ts`                                                             |
| `lfc-last-connection`                                                        | CRAZEATIVITY             | stockage local      | mode de connexion utilisé                                        | jusqu'à suppression                          | `auth/auth-redirect.ts`                                                                       |
| `lfc-b2b-commerce-company-v1`                                                | CRAZEATIVITY             | stockage local      | espace actif (personnel ou entreprise)                           | jusqu'à suppression                          | `legacy/commerce/commerce-context.service.ts`                                                 |
| `lfc.install-dismissed-at`                                                   | CRAZEATIVITY             | stockage local      | ne pas reproposer l'installation de l'application                | jusqu'à suppression                          | `client/install-prompt.service.ts`                                                            |
| `lfc-invitation-expired`, `lfc-identity-link-required`, `lfd.shop.pro-visit` | CRAZEATIVITY             | stockage de session | messages après une connexion                                     | fermeture de l'onglet                        | `auth/invitation-expired.ts`, `auth/identity-conflict.ts`, `client/shop/pro-visit.service.ts` |
| `@@auth0spajs@@::…`                                                          | Auth0 (authentification) | stockage local      | session de connexion (`cacheLocation: 'localstorage'`)           | session, effacée à la déconnexion            | `auth/auth.providers.ts`                                                                      |
| `__stripe_mid`, `__stripe_sid`                                               | Stripe (paiement)        | cookies             | prévention de la fraude, déposés à l'étape du paiement seulement | 1 an / 30 minutes (documentation Stripe)     | `client/stripe-loader.service.ts`                                                             |
| `auth0.<client>.is.authenticated`, `_legacy_auth0.<client>.is.authenticated` | Auth0 (authentification) | cookies             | indiquent qu'une session existe, sans donnée personnelle         | 1 jour                                       | `@auth0/auth0-spa-js` (`auth/auth.providers.ts`)                                              |

`lfc-dev-signed-out` (`auth/auth.facade.ts`) ne sert qu'en développement et
n'est pas listé.

## Ce qui n'est pas déposé

Aucune mesure d'audience, aucune publicité, aucun réseau social, aucun
traceur de fonctionnalité non indispensable. **Pas de bandeau** : il n'y a
rien à consentir (décision de Hugo du 2026-10-26 : la politique annonce les
catégories et la règle du consentement, pour le jour où on en ajoutera).

## Ajouter un traceur

1. S'il n'est pas strictement nécessaire, **un bandeau de consentement doit
   exister avant** son dépôt (refus en un clic, aucun dépôt avant le choix,
   lien permanent en pied de page) — à bâtir, il n'existe pas.
2. L'inscrire dans ce registre et dans la politique cookies (trois langues).
3. Seulement ensuite, le déposer.

## Relevé dans le navigateur (2026-10-26)

Relevé sur https://lafoliecoffee.info (`cookieStore.getAll()`, Stripe.js chargé
comme l'écran de règlement le fait) :

- `__stripe_mid` : 365 jours, `SameSite=Strict`, `Secure` ; `__stripe_sid` :
  30 minutes — conformes à la documentation de Stripe.
- `auth0.<client>.is.authenticated` (`SameSite=None`) et
  `_legacy_auth0.<client>.is.authenticated` (`SameSite=Lax`) : environ 1 jour —
  **absents de la première liste**, ajoutés à la politique le même jour.
- Aucun cookie Cloudflare (`__cf_bm`) : ni la boutique ni l'API n'en posent
  (`Set-Cookie` absent des réponses).
- Le stockage local d'un ancien visiteur peut encore contenir `lfc-b2b-cart-v1`
  : le code ne l'écrit plus (aucune occurrence dans `src/`), c'est un reste
  d'une version passée, non listé dans la politique.
- Les cookies posés par Auth0 sur son propre domaine (page de connexion) ne
  sont pas listés : ils relèvent d'Auth0.
