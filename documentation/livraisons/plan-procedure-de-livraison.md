# Plan — la procédure de livraison d'une adresse

> **Ouvert le 2026-09-15** à la demande de Hugo. **Statut : ✅ bâti — les trois
> lots (API, UI, client, §3), relu contre le code le 2026-10-07. Reste à
> faire : la vraie vignette** des photos d'étape (§2.6, relevé le 2026-10-06).
>
> Ce que la relecture du 2026-10-07 a corrigé dans ce plan :
>
> - **le mur n'était que dans les lectures** : les écritures de l'adaptateur
>   Prisma passaient par l'`id` seul — murées le 2026-10-07 (B2), §2.1 ;
> - le staff agit sous **`delivery_procedures`** depuis le 2026-10-01, plus sous
>   `b2b_companies` — §2.4 ;
> - le fait est `company.delivery_procedure_edited`, client et staff, à six
>   actions — §2.4 ;
> - **le livreur est servi** — §2.4 ;
> - l'écran client vit dans la boutique, `apps/lfc-ecommerce-frontend` — §1, §3.
>
> Le §1 est l'état d'**avant** le chantier, et n'est plus tenu à jour.

## 0. La demande

> « j'ai besoin qu'on puisse enregistrer pour une adresse de livraison une
> procédure de livraison, c'est à dire un ensemble d'étapes titre numéro de
> l'étape 1 photo (faut pas que ça pèse lourd) et un texte. possibilité de
> supprimer définitivement, si on se trompe on refait l'étape, on doit pouvoir
> réorganiser les étapes en ajouter à postériori etc, faisable côté client et
> admin » — Hugo, 2026-09-15.
>
> « on devrait créer un aggregat procédure de livraison je pense,
> delivery_procedure » — Hugo, 2026-09-15.

## 1. Ce qui existe (vérifié le 2026-09-15)

> ⚠️ **État d'avant le chantier (2026-09-15)**, gardé tel quel : la dernière
> ligne (« aucun concept de procédure ») a cessé d'être vraie avec le lot API.
> Seul un pointeur devenu faux a été repointé, le 2026-10-07.

| Fait                                                                                                                                                | Où                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Une adresse de livraison est une ligne `addresses` (`kind`), archivée et jamais supprimée ; ses consignes (`deliverySpecs`) sont un JSON            | `prisma/schema/public/account.prisma` `model Address`                                                                    |
| Le carnet `DeliveryAddressBook` est chargé **pour une société** : une adresse d'une autre société y est absente, donc introuvable                   | `account/domain/entities/delivery-address-book.ts`, `update-delivery-address.handler.ts`                                 |
| Routes client murées `/companies/:companyId/delivery-addresses/…` : lecture membre, écriture `ensureCompanyAdmin`                                   | `account/http/company-addresses.controller.ts`                                                                           |
| Routes staff `/admin/companies/:companyId/delivery-addresses/…` sous `@AdminSurface("b2b_companies")`, faits `*ByStaffEvent` publiés en transaction | `account/http/admin-company-pieces.controller.ts`, les six `*-by-staff.handler.ts` des adresses (découpés le 2026-09-19) |
| `DocumentStore` (bucket des pièces privées du client) : `save`/`read`/`readIfPresent`/`delete` ; clés `companies/{companyId}/…`                     | `platform/storage/document-store.ts`, `ingest-kbis.ts:62`                                                                |
| Validation d'image par les octets de tête (PNG/JPEG), `imageDimensions` de `@lfd/storage`                                                           | `accounting/domain/value-objects/entity-logo.ts`                                                                         |
| Réduction d'une photo dans le navigateur (canvas, `toBlob` JPEG)                                                                                    | `packages/b2b-ui/src/company/kbis-capture-panel/capture-frame.ts`                                                        |
| Admin : la carte `lfd-company-addresses-card` a un menu par adresse (défaut, modifier, supprimer)                                                   | `b2b-ui/company/company-addresses-card/`                                                                                 |
| Client : `delivery-address-dialog` ouvert depuis Mon compte, `dialogSide()` centre/bas                                                              | `apps/lfc-ecommerce-frontend/src/app/client/mon-compte/addresses/`, `client/panel-side.ts`                               |
| Aucun concept de procédure n'existe encore                                                                                                          | grep `procédure de livraison`, `DeliveryProcedure` : vide                                                                |

## 2. Décisions

### 2.1 Un agrégat `DeliveryProcedure`

**Une procédure par adresse de livraison**, racine d'agrégat, avec ses étapes
dessous. Elle a des règles qui peuvent refuser une écriture — le nombre
d'étapes, un ordre qui doit être une permutation exacte, une étape inconnue —
donc agrégat, pas CRUD.

```prisma
model DeliveryProcedure {            // @@map("delivery_procedures")
  id         String  @id
  companyId  String  @map("company_id")     // le mur, dans chaque where
  addressId  String  @unique @map("address_id")  // FK addresses(id)
  createdAt, updatedAt
  steps      DeliveryProcedureStep[]
}
model DeliveryProcedureStep {        // @@map("delivery_procedure_steps")
  id          String @id
  procedureId String @map("procedure_id")  // FK ON DELETE CASCADE
  position    Int                            // 0-based, réécrit au save
  title       String                         // ≤ 80
  body        String @default("")            // ≤ 1000
  photoKey    String? @map("photo_key")
  createdAt, updatedAt
  @@index([procedureId, position])
}
```

> ⚠️ **« Le mur, dans chaque where » n'était vrai que des lectures** (relu le
> 2026-10-07). `PrismaDeliveryProcedureRepository.save` écrivait la procédure
> puis chaque étape par un `upsert` sur leur `id` seul, comme
> `saveDeliveryBook` du carnet d'adresses
> (`prisma-company-address.repository.ts`), que traversent aussi deux routes du
> contrôleur staff de la procédure : « dépôt autorisé » et la règle de la
> porte. Rien ne l'exploitait — les ids viennent de l'`IdGenerator` ou d'une
> lecture murée, et l'agrégat refuse une étape inconnue —, mais un `where` sans
> le mur est un bug de sécurité (`CLAUDE.md` § 3). **Muré le 2026-10-07 (B2)** :
> ces écritures sont gardées par `companyId`, avec celle de l'adresse de
> facturation du même adaptateur (`saveBilling`), et un e2e de non-régression
> vérifie qu'un id d'une autre société ne touche rien.

- Migration **additive** (deux tables neuves), aucune donnée déplacée.
- **Pas d'index unique sur `(procedure_id, position)`** : un réordonnancement
  réécrit toutes les positions, et un unique non différé ferait échouer l'échange
  de deux lignes. L'ordre est tenu par l'agrégat, qui réécrit les positions
  `0..n-1` à chaque `save`.
- La procédure naît **à la première étape** (`DeliveryProcedure.openFor`) ; une
  adresse sans procédure se lit comme une procédure vide.
- Le numéro affiché est `position + 1`, jamais stocké ni saisi.

Méthodes : `addStep(id, fields, photoKey | null)` (ajout en fin), `reviseStep(id,
fields)`, `attachPhoto(stepId, key)` → ancienne clé, `detachPhoto(stepId)` →
ancienne clé, `removeStep(stepId)` → clé de sa photo, `reorder(stepIds)`.
Refus : plus de 20 étapes, titre vide ou trop long, texte trop long, étape
inconnue, ordre qui n'est pas une permutation exacte (409, message qui dit de
recharger).

### 2.2 Suppression définitive — exception écrite au §3

« Pas de DELETE physique sur les agrégats métier. » **La racine ne se supprime
jamais** ; une **étape** se supprime physiquement, avec sa photo, parce que Hugo
l'a demandé explicitement le 2026-09-15 (« possibilité de supprimer
définitivement »). Une consigne d'accès périmée n'a rien d'opposable, et la
garder mettrait sous les yeux du livreur un code de portail changé. Le JSDoc de
`removeStep` porte cette raison.

« Refaire l'étape » = la réviser : titre, texte, photo remplacée ou retirée.

### 2.3 La photo

- Une photo au plus par étape, facultative.
- **Écran** : réduction avant envoi à 1600 px de grand côté, JPEG 0.8 ; si le
  résultat dépasse 1 Mo, une seconde passe à 0.6. Fonction pure testée dans
  `b2b-ui` (taille de trame), le canvas en adaptateur.
- **Serveur** : value object `DeliveryStepPhoto.create(bytes)` — non vide,
  **≤ 1 Mo**, JPEG ou PNG reconnu **aux octets**, dimensions lisibles. Pas de
  taille minimale ni de ratio. Limite multipart dure à 2 Mo (backstop DoS).
- **Stockage** : `DocumentStore` (bucket privé du client — une photo de porte
  avec son code n'est pas publique), clé
  `companies/{companyId}/delivery-procedures/{addressId}/{stepId}-{ulid}`. Le
  ulid change à chaque dépôt ; `photoRevision` en est la valeur.
- **Ordre des gestes** (comme le logo et le KBIS) : valider, ranger, puis
  charger / muter / sauver en unité de travail. Si le `save` échoue, l'objet
  neuf est supprimé (best-effort, journalisé). **Après** commit, l'ancienne clé
  (remplacée, retirée, ou étape supprimée) est supprimée ; un échec se journalise
  et ne fait pas échouer la requête.
- **Lecture** : route qui sert les octets, `Content-Type` relu dans les octets,
  `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=31536000,
immutable` (l'URL côté écran porte `?rev=`).

### 2.4 Qui écrit, qui lit

- **Client** : lecture tout membre ; écriture gestionnaire (`ensureCompanyAdmin`),
  comme les adresses. L'adresse doit appartenir au carnet de la société et ne
  pas être archivée, sinon `CompanyAddressNotFoundError` (404).
- **Staff** : `@AdminSurface("delivery_procedures")`, sa propre ressource
  depuis le 2026-10-01 (`plan-droits-par-geste.md`, DG-D1 ;
  `admin-company-delivery-procedure.controller.ts:75`) ; les routes de
  l'adresse elle-même restent sous `b2b_companies`
  (`admin-company-pieces.controller.ts`). Mêmes gestes, sans mur de
  membership. Le même contrôleur règle aussi « dépôt autorisé » et la règle de
  la porte d'une adresse (`a-la-porte.md`).
- **Le journal** : chaque geste — du staff **et**, depuis le 2026-09-19, du
  client — publie en transaction le fait `company.delivery_procedure_edited`
  (`account-facts.ts:115` ; il s'écrivait `…_edited_by_staff` tant que seul le
  staff était journalisé), charge `{ address, action }` : la société est le
  sujet de la ligne. **Six** actions (`staff-address-acts.event.ts:137-143`) :
  `step_added`, `step_revised`, `step_photo_replaced`, `step_photo_removed`
  (ces deux-là depuis le 2026-10-06 ; une révision qui touchait la photo
  s'écrivait `step_revised`), `step_removed`, `reordered`. La charge dit quel
  geste, jamais ce qui a été écrit : un titre peut porter un code de portail.
- **Le livreur est servi** — ce plan disait le contraire le 2026-09-15, avant
  que le rôle existe. « Ma tournée », sous `delivery_driving`, le seul droit du
  rôle `livreur`, lit la procédure de chaque arrêt **vivante** par le canal
  `delivery/channels/commerce/delivery-procedures.reader.ts`, que le commerce
  implémente sous le mur `(adresse, société)`, et sert la photo d'une étape
  (`my-delivery-round.controller.ts:115`).

### 2.5 Routes

Client sous `/companies/:companyId`, staff sous `/admin/companies/:companyId`,
chemins identiques ensuite :

| Verbe  | Chemin                                                         | Corps                                                      | Réponse                           |
| ------ | -------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------- |
| GET    | `/delivery-addresses/:addressId/procedure`                     | —                                                          | `DeliveryProcedureView`           |
| POST   | `/delivery-addresses/:addressId/procedure/steps`               | multipart `title`, `body`, fichier `photo`?                | 201 `CreatedDeliveryStepResponse` |
| PATCH  | `/delivery-addresses/:addressId/procedure/steps/:stepId`       | multipart `title`, `body`, `removePhoto`, fichier `photo`? | 204                               |
| DELETE | `/delivery-addresses/:addressId/procedure/steps/:stepId`       | —                                                          | 204                               |
| PUT    | `/delivery-addresses/:addressId/procedure/order`               | JSON `DeliveryProcedureOrderPayload`                       | 204                               |
| GET    | `/delivery-addresses/:addressId/procedure/steps/:stepId/photo` | —                                                          | octets de l'image, 404 sans photo |

Contrat : `packages/contracts/src/delivery-procedure.ts` (écrit). La vue
d'adresse gagne `procedureStepCount` (lecteurs client et staff).

### 2.6 Les écrans

- **`b2b-ui`** : composant partagé `lfd-delivery-procedure-editor`, qui parle à
  un port abstrait `DeliveryProcedureGateway` (charger, ajouter, réviser,
  supprimer, réordonner, lire la photo en `Blob`) fourni par chaque app — les
  routes diffèrent, l'écran non. Libellés en entrée avec défaut français (le
  client traduit en fr/en/it).
  - Liste des étapes : numéro, titre, texte, vignette (blob → object URL,
    révoquée à la destruction).
    ⚠️ **Reste à faire (relevé le 2026-10-06)** : cette « vignette » est la
    photo **pleine taille** (jusqu'à 1 Mo, requête authentifiée par étape),
    lourd pour une liste. Les notes du commercial ont une vraie vignette
    (D7 bis, `photoDisplay: thumbnail`, deux objets stockés) ; la procédure
    n'en a pas côté API — ni objet réduit stocké, ni route qui le sert. Le
    brancher est un lot **API** d'abord (stocker une vignette au dépôt, la
    servir), puis passer l'éditeur en `photoDisplay` vignette — la réduction
    côté écran (`PhotoReductionPolicy.thumbnail`) existe déjà.
  - Par étape : **monter / descendre** (boutons, désactivés aux bornes — pas de
    glisser-déposer : il n'existait nulle part dans le dépôt le 2026-09-15 ; le
    CDK l'a apporté depuis aux tournées et au colisage du back-office, pas à
    cet éditeur (vérifié le 2026-10-07) ; et deux boutons marchent au doigt
    comme au clavier), **Refaire** (formulaire prérempli),
    **Supprimer** avec confirmation qui dit « définitivement ».
  - **Ajouter une étape** en fin de liste ; bouton masqué à 20.
  - Formulaire d'étape : titre, texte, choix de photo (`accept="image/*"`),
    aperçu, « Retirer la photo ». Réduction avant envoi.
  - `canEdit` en entrée : sans, lecture seule.
- **Admin** : entrée « Procédure de livraison » dans le menu de chaque adresse
  de `lfd-company-addresses-card` (+ « N étapes » sous l'adresse quand N > 0) ;
  ouvre l'éditeur en panneau.
- **Client** : dans Mon compte, chaque adresse de livraison montre « Procédure de
  livraison · N étapes » ; l'éditeur s'ouvre en dialogue `dialogSide()` (centré
  au bureau, en bas en mobile). Lecture seule pour un rôle qui n'écrit pas.

## 3. Lots

| Lot    | Contenu                                                                                                                                                                         | Agent     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| API    | migration, agrégat + VO photo + erreurs, port/adaptateur Prisma, handlers client et staff, contrôleurs, `procedureStepCount` dans les lecteurs, tests trois niveaux, durées e2e | batisseur |
| UI     | `b2b-ui` : port, réduction de photo, éditeur ; admin : passerelle, entrée dans la carte d'adresses                                                                              | pablo     |
| Client | boutique, `apps/lfc-ecommerce-frontend/src/app/client/mon-compte/addresses/` : passerelle, entrée dans Mon compte, dialogue, copies fr/en/it                                    | pablo     |

Les trois lots sont bâtis (relu le 2026-10-07). Reste la vignette (§2.6) : un
lot **API** d'abord, puis l'éditeur.
