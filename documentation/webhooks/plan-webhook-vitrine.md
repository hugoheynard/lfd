# Plan — le webhook de la vitrine (lot W)

> 📐 **Doc-first, rien n'est bâti** (décidé le 2026-10-15, rassemblé ici le
> 2026-10-18). Le texte d'origine du lot W, contredit par `vitruve` le
> 2026-10-15, est repris **mot pour mot** au §2 ; le §1 dit ce qui a changé
> dans le dépôt depuis, relu le 2026-10-18. **Frontière de sécurité** (données
> vers un tiers, une clé de lecture, un secret de signature) : `vitruve` à
> nouveau avant de bâtir (CLAUDE.md §9 bis).

## 0. La demande

L'agence web qui fait le **site vitrine** doit recevoir, au fur et à mesure,
ce que nos bureaux changent au catalogue publié : contenus, tarifs publics,
offres, textes, médias — et pouvoir **cocher / décocher** ce qu'elle reçoit.
Webhook **léger** : il prévient, l'agence relit.

## 1. Ce qui a changé depuis le 2026-10-15 (relu le 2026-10-18)

| Changement                                                                                                     | Effet sur le lot W                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Les interrupteurs du catalogue sont retirés, les faits du référentiel vivent en continu (X0–X5, le 2026-10-17) | La condition « W ne voit des changements en continu qu'après la bascule 2b » est **levée** : le catalogue publié change en continu, et l'empreinte (W3′) les voit.                                                                                                                |
| La mise en avant est **par audience** et s'affiche « Incontournable » (2026-10-18)                             | La vue publique porte `isFeatured` pour le **public** seulement (`prisma-catalog.reader.ts`, `featuredFor`) : la vitrine reçoit la mise en avant publique, jamais celle des pros. Le libellé est un texte de la boutique (`product.bestSeller`), donc dans `GET /vitrine/textes`. |
| Les **suggestions** du staff et calculées existent (2026-10-18)                                                | **Hors du lot W** : elles dépendent d'un panier ou d'un client. Ne sortent pas.                                                                                                                                                                                                   |
| Le chiffreur de champs vit à `apps/lfd-api/src/platform/crypto/aes-gcm-field-cipher.ts`                        | Le §2 citait le bon nom de fichier, sans chemin.                                                                                                                                                                                                                                  |
| Le cron `*/5` existe toujours (`apps/lfd-api/container/worker.ts:472`, `KEEP_WARM_CRON`)                       | Le battement de W3′ est disponible.                                                                                                                                                                                                                                               |
| La politique de relance de l'outbox existe (`apps/lfd-api/src/platform/outbox/retry-policy.ts`)                | W2′ la reprend.                                                                                                                                                                                                                                                                   |

La vue que la vitrine lirait est `ShopCatalogueView` (`packages/contracts/src/shop-catalogue.ts:258` :
`shelves`, `items`, `operations`), celle de `GET /shop/catalogue`, publique.

## 2. Le lot W tel que décidé et contredit le 2026-10-15

> « L'agence web qui produit le site vitrine a besoin d'avoir l'update des
> contenus et tarifs et offres, textes, médias, au fur et à mesure que nos
> bureaux updatent le catalogue » ; « pouvoir cocher/décocher son contenu en
> admin ». Puis : webhook **léger** ; les formules plus tard. — Hugo, 2026-10-15

Ouvert avant d'écrire : `b2b/catalog/http/shop-catalogue.controller.ts` — la
boutique publique a **déjà** sa lecture anonyme, `GET /shop/catalogue`,
résolue à `companyId: null` : prix publics, promotions publiques comprises,
mercuriale exclue. La vitrine lit **la même chose**, pas une seconde
projection.

**Principe : notifier, puis laisser relire.** Le webhook ne transporte qu'un
signal ; le contenu ne circule que par une lecture que nous servons.

| #   | Quoi                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W1  | **Ce qui sort, par construction** : la vue publique de la boutique (`ReadShopCatalogueQuery`), rien d'autre. Ni prix pro, ni mercuriale, ni palier, ni client, ni article d'audience `pro`, ni article masqué au public. Aucune case à cocher ne peut l'élargir : les cases ne font que **retirer** des familles de contenu.                                                                                                   |
| W2  | **Abonnés** (plusieurs prévus dès le départ) : `public.vitrine_subscribers` — nom, URL, secret de signature (scellé au repos comme les IBAN, `FIELD_ENCRYPTION_KEY`), clé de lecture, actif, et les familles de contenu reçues : `catalogue`, `operations`, `promotions`, `textes`, `photos`. Écran dans **Gestion Boutique** ; le secret ne s'affiche qu'une fois, à la création ou à la rotation.                            |
| W3  | **Les événements** : un `@DurableHandler` sur la plateforme écoute ce qui change la vue publique — fait fiche et fait famille (lot 2a), opérations reçues, décisions de prix et masquage de la plateforme, règles de prix publiques (promotions), textes de la boutique (`ShopCopyPublication`), visuels (`product_media_changed`). Il écrit, par abonné intéressé, une notification `{ type, id, version }` en boîte d'envoi. |
| W4  | **🔴 Le temps change aussi la vitrine** : une promotion qui commence à minuit change un prix public **sans aucune écriture**. Un passage planifié émet une notification à chaque borne de fenêtre (début et fin de promotion, d'opération, de limite) qui touche la vue publique.                                                                                                                                              |
| W5  | **L'envoi** : `POST` vers l'URL de l'abonné, corps `{ type, id, version, at }`, en-tête de signature HMAC-SHA256 du corps avec horodatage (rejeu refusable par l'agence) ; relances avec délai croissant, puis lettre morte visible. Plusieurs changements de la même fiche dans une courte fenêtre (proposé : 10 s) partent en **une** notification, de la version la plus haute.                                             |
| W6  | **La lecture de l'agence** : `GET /vitrine/catalogue` (tout, pour la première synchronisation et les rattrapages) et `GET /vitrine/produits/:id`, protégées par la clé de lecture de l'abonné (pas un compte staff ni client), passant par la passerelle, limitées en débit ; filtrées selon les cases de l'abonné. Photos en URL publiques Cloudflare, aux tailles déjà servies.                                              |
| W7  | **Le journal des envois** : livré, en échec, en attente ; « renvoyer » une notification ; « tout renvoyer » (une notification par fiche, pour resynchroniser).                                                                                                                                                                                                                                                                 |

**Refondu après `vitruve` (2026-10-15), et c'est ce bloc qui fait foi :**

Quatre BLOQUANT ont le même fond : W3 supposait des faits durables là où il
n'y en a pas (règles de prix, textes, décisions et masquages, vitrine — seuls
`orders/` et `accounting/` publient dans `b2b/`), et la boîte d'envoi ne sait
pas livrer à des abonnés qui sont des lignes en base (`durable-handler.ts:13,41`).
Plutôt que d'ajouter des faits dans cinq contextes, **on compare la vue au
lieu d'écouter ses causes** :

- **W3′ — une empreinte, pas des écouteurs.** À chaque balayage, pour chaque
  abonné actif, le serveur calcule sa vue filtrée (la vue publique, moins les
  familles décochées) et une empreinte **par élément** : article par `sku`,
  opération par `key`, rayon par `id`, texte par clé. Il compare à la dernière
  empreinte **livrée** et notifie ce qui a changé. Ça attrape **toutes** les
  causes — PIM, décisions de la plateforme, promotions, textes — et les
  bornes de temps (W4) sans mécanisme de plus : une promotion qui commence
  change l'empreinte du prix.
- **Le rythme** : le seul battement de l'API est le cron `*/5` du Worker
  (`KEEP_WARM_CRON`). Une route de balayage `RecomputeGuard` s'y ajoute :
  **l'agence est prévenue en 5 minutes au plus**. La coalescence est
  naturelle — dix enregistrements en cinq minutes font une notification.
- **La notification** : `{ subscriber, sequence, at, changed: { items: [sku…],
operations: [key…], shelves: [id…], texts: [clé…] }, removed: {…} }`.
  `sequence` est un compteur par abonné, croissant ; il n'existe pas d'autre
  version commune à toutes les sources.
- **W2′ — une boîte à elle** : `public.vitrine_deliveries` (abonné, séquence,
  corps, état, essais, prochain essai) et un relais HTTP sortant à part de
  l'outbox. Il **reprend la politique de relance** de `platform/outbox/retry-policy.ts`
  (même fonction, pas une copie), et ses lettres mortes s'affichent dans le
  journal des envois de l'écran, pas dans celui de l'outbox.
- **W1′ — ce qui sort, borné** : la vue `ShopCatalogueView` (`shelves`,
  `items`, `operations`) **et** les textes **publiés** de la boutique
  (`ShopCopyPublication`, seconde lecture nommée : `GET /vitrine/textes`).
  Rien d'autre ; le contenu des pages `storefront` attendra une décision.
  ⚠️ **Non vérifié, à prouver par test au lot** : que `listSellable("public")`
  exclut l'audience `pro` et les masqués au public, et que
  `catalogPriceMillicents` n'est jamais un tarif pro.
- **Identifiants** : `sku` pour un article, `key` pour une opération, `id`
  pour un rayon. `GET /vitrine/articles/:sku`, `GET /vitrine/catalogue`,
  `GET /vitrine/textes`.

Sérieux intégrés :

- **La clé de lecture n'est pas un gardien** : la vue est déjà publique
  (`GET /shop/catalogue`, `@Public()`). La clé **identifie** l'abonné et
  applique ses cases ; elle est rangée **hachée** (SHA-256), montrée une fois.
- **Le secret de signature est chiffré** (`aes-gcm-field-cipher.ts`), pas
  haché : il faut le relire pour signer. ⚠️ Une rotation de
  `FIELD_ENCRYPTION_KEY` le rend illisible — comme les liens d'annulation
  (`app-config.ts:162`) : la rotation impose de régénérer les secrets
  d'abonnés, et le runbook le dit.
- **SSRF** : l'URL d'un abonné est `https` seulement ; le relais refuse au
  moment de l'envoi (après résolution DNS) toute adresse privée, de bouclage,
  de lien local ou de métadonnées, et ne suit pas les redirections.
- **La passerelle** : `/vitrine/*` est déclarée explicitement dans
  `gateway/src/routes.ts` plutôt que de passer par le préfixe générique ; le
  débit est limité **par clé d'abonné**, pas seulement par IP.
- **Droits** : une ressource `shop_vitrine` (lecture/écriture), routes sous
  `/admin/vitrine/*`, écran en Gestion Boutique. La migration ajoute la
  ressource ; **Hugo l'accorde à l'écran** (`lint:no-role-grants-in-migrations`).
- **RGPD** : rien de personnel ne sort. L'abonné est une organisation (nom,
  URL) ; aucun contact nominatif n'est rangé.
- **Photos** : les URL de la vue sont des variantes Cloudflare Images ; leur
  stabilité pour un tiers qui les met en cache est vérifiée au lot.

**L'audience sort aussi (Hugo, 2026-10-15, option a)** : chaque article
livré à la vitrine porte son audience — `public` ou `both` —, pour que le
site puisse dire « aussi pour les professionnels ». Les articles réservés aux
pros **ne sortent pas** : la vue reste celle d'un particulier.

**Ordre** : W se bâtit après 2a (il en écoute les faits) ; il ne voit des
changements en continu qu'après la bascule 2b. Avant, une notification par
push accepté suffit. Frontière de sécurité (données vers un tiers, une clé de
lecture, un secret de signature) : **`vitruve` avant de bâtir**.

**Plus tard** : les formules (Hugo, 2026-10-15 — « on verra ça plus tard »).

## 3. Questions encore ouvertes

1. **Les familles de contenu cochables** : `catalogue`, `operations`,
   `promotions`, `textes`, `photos` (W2) — est-ce toujours la liste ? Les
   « Incontournables » (mise en avant publique) en font-ils une à part ?
2. **Les pages `storefront`** (vitrine éditoriale de la boutique) : toujours
   « attendront une décision » (W1′) ?
3. **Un seul abonné aujourd'hui** (l'agence) : l'écran multi-abonnés reste-t-il
   dans le premier lot, ou un abonné réglé à la main suffit-il pour démarrer ?
4. **L'agence a-t-elle une préférence** de format (signature, en-têtes,
   délai) ? À lui demander avant de figer W5.
