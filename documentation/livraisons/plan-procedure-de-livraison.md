# Plan — la procédure de livraison d'une adresse

> **Ouvert le 2026-09-15** à la demande de Hugo. 🟡 En construction.

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
| Client : `delivery-address-dialog` ouvert depuis Mon compte, `dialogSide()` centre/bas                                                              | `platform/client/mon-compte/addresses/`, `client/panel-side.ts`                                                          |
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
- **Staff** : `@AdminSurface("b2b_companies")`, mêmes gestes, sans mur de
  membership. Chaque geste staff publie en transaction un fait
  `company.delivery_procedure_edited_by_staff` `{ companyId, addressId, action }`
  (`step_added` / `step_revised` / `step_removed` / `reordered`), comme les
  autres gestes staff sur les adresses.
- Le livreur n'est pas servi ici : pas de rôle livreur aujourd'hui.

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
  - Par étape : **monter / descendre** (boutons, désactivés aux bornes — pas de
    glisser-déposer : il n'existe nulle part dans le dépôt, et deux boutons
    marchent au doigt comme au clavier), **Refaire** (formulaire prérempli),
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
| Client | platform : passerelle, entrée dans Mon compte, dialogue, copies fr/en/it                                                                                                        | pablo     |
