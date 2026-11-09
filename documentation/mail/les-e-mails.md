# Les e-mails — ce qui existe, et ce qui reste à faire

> 🟡 **Doc d'état, écrit le 2026-11-07** à partir des trois journaux de chantier
> et vérifié dans le code le même jour (branche `dev`). Les journaux gardent
> le détail, les écarts et les raisons de chaque lot :
> [`plan-service-e-mails.md`](plan-service-e-mails.md) (le service, lots S0 à
> S8), [`plan-editeur-par-blocs.md`](plan-editeur-par-blocs.md) (l'éditeur,
> S4, S5, R1–R2, C1–C3) et [`README.md`](README.md) (la note doc-first
> d'origine). **Ce document-ci dit l'état et le reste à faire** ; quand il
> contredit un journal, c'est lui qui a été relu dans le code.

> Ajout du 2026-11-08 : la police du texte de la charte (vérifiée dans le
> code ce jour-là, `@lfd/mail-blocks` `charter-settings.ts`, `@lfd/mailer`
> `charter-styles.ts`).

> Ajout du 2026-11-09 : la nature des e-mails (transactionnel ou marketing),
> l'accord marketing, la désinscription et l'identité d'envoi par nature ont
> leur doc d'état, [`la-desinscription-et-l-accord.md`](la-desinscription-et-l-accord.md)
> (✅ en production depuis le 2026-11-09).

## Partie 1 — En simple

### Le service d'envoi

Tous les e-mails de l'API passent par **un seul service**, le bloc `mail`.
Un autre bloc (commandes, comptes, comptabilité, fournil, équipe…) ne sait
plus fabriquer un e-mail : il **demande** « l'e-mail _commande passée_, à
cette personne, avec ces données », et le bloc `mail` compose, envoie et
garde la trace.

Il y a deux façons de demander :

- **Envoi différé** (`mail.send`, le cas normal) : la demande est écrite en
  même temps que le geste. Si le geste est annulé, aucun e-mail ne part. Si
  le geste réussit, l'e-mail part juste après, et il est **relancé** tout
  seul en cas de panne (toutes les 5 minutes, pendant 23 h).
- **Envoi immédiat** (`mail.sendAndAwaitReceipt`) : réservé à quelques gestes
  de l'équipe qui doivent lire le résultat à l'écran (« lien envoyé »), à
  l'essai d'un e-mail et à la sonde. La liste est fermée et tenue par une
  porte.

```mermaid
sequenceDiagram
    participant B as Bloc métier (ex. commandes)
    participant M as Bloc mail
    participant O as Boîte d'envoi
    participant R as Resend
    B->>M: mail.send (dans la transaction du geste)
    M->>O: écrit la demande et le fait mail.requested
    Note over B,O: le geste est validé, ou tout est annulé
    O->>M: après validation, le fait est livré
    M->>M: compose avec le modèle publié et la charte de l'espace
    M->>R: envoie, avec une clé anti-doublon
    R-->>M: identifiant d'envoi
    M->>M: la demande passe à « envoyée »
    Note over M: en échec, le balayeur relance toutes les 5 minutes
```

**Le suivi** : chaque demande laisse une ligne (modèle, destinataire, état,
identifiant Resend). Elle doit être effacée au bout d'un an ; la purge existe
mais tourne **à blanc** tant que Hugo ne l'active pas.

**Le suivi des envois** : chaque e-mail a une fiche — demandé, accepté par
Resend, puis remis, rebondi ou spam —, lisible dans Email Templates › Suivi
des envois, l'adresse masquée et sa consultation tracée. Détail :
[`le-suivi-des-e-mails.md`](le-suivi-des-e-mails.md).

**La sonde et la veille** : à chaque déploiement, la sonde envoie un e-mail
immédiat **et** un e-mail différé, et le déploiement échoue si le second
n'est pas parti en 75 s. En continu, une veille regarde toutes les 5 minutes
s'il reste des e-mails coincés depuis plus de 15 minutes ou en échec
définitif, et **sonne la cloche** du back-office. Elle ne prévient jamais par
e-mail : c'est ce qui serait en panne.

L'e-mail de la sonde (`ops.deploy-check`) est un contrôle technique : il
part, mais il n'est **pas dans l'éditeur** (ni dans la liste, ni dans un
espace ; l'ouvrir rend un 404 nommé) — Hugo, 2026-11-07. Il porte
`outOfEditor` dans sa déclaration (`team-mail-layouts.ts`). Les routes
d'écriture des textes refusent ses textes (`MAIL_COPY_OUT_OF_EDITOR`, 409), et
le compte des changements à publier (`copyPendingCount`) ne les compte pas.

### Les espaces

Les e-mails sont rangés en **deux espaces** :

- **La Folie Coffee — clients** : tous les e-mails aux clients ;
- **La Folie Douce — équipe** : les e-mails à l'équipe, et les quatre
  e-mails internes (rangés sous « Interne »).

Chaque espace a :

- **sa charte** : logo, couleurs (claires et sombres), couleur du bandeau,
  police des titres, police du texte, pied de page. Elle se publie comme un
  e-mail (brouillon, publier, historique), et le contraste est contrôlé avant
  publication. Tant qu'aucune charte n'est publiée, les e-mails partent
  exactement comme avant ;
- **ses polices** (2026-11-08) : une police web pour les titres, une pour
  le texte, chacune avec sa **police de secours**, obligatoire. Gmail — la
  messagerie la plus répandue — et certaines applications n'affichent pas
  les polices web et montrent le secours ; Apple Mail, l'iPhone et Outlook
  pour Mac affichent la police. Le secours doit donc être proche et toujours
  lisible : l'aperçu montre la police, un essai reçu dans Gmail montre le
  secours. Sur la page Charte de La Folie Coffee, **« Utiliser les polices
  de la boutique »** remplit les deux (Chunk pour les titres, Pogonia pour
  le texte) dans le brouillon ; rien ne part avant la publication. Sans
  police du texte, le texte garde la police du système, comme avant ;
- **son expéditeur** : nom, adresse d'envoi, adresse de réponse. C'est une
  donnée réglée à l'écran, pas une variable de déploiement. Une adresse dont
  le domaine n'est pas vérifié chez Resend est refusée, et un essai part à
  l'enregistrement. Sans réglage, l'espace envoie sous l'adresse par défaut
  (`no-reply@lafoliecoffee.info`).

### L'éditeur

Au back-office, page **« E-mails »** (`/emails`), une carte par espace, puis
la liste de ses e-mails. Ouvrir un e-mail montre **l'e-mail lui-même** au
milieu de l'écran : chaque bloc est la vraie portion d'e-mail.

- **On écrit en cliquant sur le texte.** Les valeurs qui changent d'un
  client à l'autre (référence, prénom, jour…) sont des **pastilles** qu'on
  ne casse pas en tapant.
- **Les ressources** (panneau de gauche) : ce que l'e-mail fournit pour
  chaque destinataire — des valeurs, des liens (posés sur un bouton), des
  blocs de données (récapitulatif, QR de retrait, itinéraire). Chacune a un
  nom lisible, une description et un exemple. On ne fabrique jamais une
  ressource, on la pose.
- **Les blocs** (panneau de droite) : titre, paragraphe, encadré, bouton,
  séparateur, colonnes, **image**. On ajoute, déplace, supprime les blocs
  libres ; les blocs du modèle se déplacent mais ne se suppriment pas.
- **Les images** viennent de la médiathèque, et d'elle seule. On choisit un
  **format** (originale, 3:2, 2:1, 1:1) et un **point focal** ; à la
  publication, le serveur recadre et range sa propre copie (voir « Les images
  d'un e-mail » plus bas).
- **Les conditions d'affichage** : un bloc qui n'apparaît que dans certains
  cas (par exemple l'itinéraire, seulement pour un retrait dont l'adresse est
  connue) porte un badge « Sous condition » et sa phrase ; l'aperçu se règle en « Retrait » ou
  « Livraison » pour le voir.
- **Les langues** : français, anglais, italien côte à côte.
- **Aperçu** téléphone / ordinateur, clair / sombre ; **essai** envoyé à soi ;
  **publier** ; **historique** ; **revenir au modèle d'origine**.

```mermaid
flowchart LR
    B["Brouillon<br/>enregistré seul en tapant"] --> P{"Publier"}
    P -- "refus : texte manquant,<br/>bloc invalide" --> B
    P -- "accepté" --> C["copie des images<br/>recadrées"]
    C --> V["nouvelle version publiée<br/>gardée à l'historique"]
    V --> E["les e-mails suivants<br/>partent avec elle"]
    V -. "revenir au modèle d'origine" .-> O["le modèle du code"]
```

### Les images d'un e-mail

Une image d'e-mail se **choisit dans la médiathèque** — c'est la seule source
possible, sans réglage pour en ajouter une autre. À la **publication**, le
serveur la télécharge, la recadre au format et au point focal choisis, et en
range une **copie** dans le même bucket que la médiathèque, dans un dossier à
part : `mail/`. L'e-mail envoyé pointe vers cette copie.

Pourquoi une copie : un e-mail parti ne se rappelle pas. Si quelqu'un retire
ou remplace l'image dans la médiathèque, les e-mails déjà envoyés et le
modèle publié gardent la leur. Rien ne supprime jamais une copie.

```mermaid
flowchart LR
    M["Médiathèque<br/>(bucket des médias)"] -- "choisie dans l'éditeur" --> D["Brouillon de l'e-mail<br/>pointe vers l'original"]
    D -- "Publier" --> T["le serveur télécharge<br/>(médiathèque seulement)"]
    T --> R["recadre<br/>format + point focal"]
    R --> C["copie rangée sous<br/>médias / mail / templates"]
    C --> E["l'e-mail envoyé<br/>pointe vers la copie"]
```

**Rien à régler** : le bucket des médias (`R2_MEDIA_*`) suffit. S'il est
incomplet, publier un e-mail avec image est refusé, et le message nomme la
variable qui manque.

**Pleine largeur** (depuis le 2026-11-08, côté serveur ; le réglage à
l'écran est le lot suivant). Une image se règle **dans le texte** (entre
les marges, comme un paragraphe) ou **pleine largeur** : elle va alors d'un
bord de la carte à l'autre, comme le bandeau du haut, en gardant son format
(original, 3:2, 2:1, 1:1). Juste sous le bandeau, elle s'y colle ; tout en
haut d'une carte sans bandeau, ou tout en bas sans pied, elle reprend
l'arrondi de la carte ; ailleurs, un espace la sépare du texte. Une image
pleine largeur ne va pas dans une colonne : l'enregistrement le refuse.

```text
┌──────────── carte ────────────┐
│ bandeau                       │
├───────────────────────────────┤
│ image pleine largeur          │   ← bord à bord
├───────────────────────────────┤
│   Titre                       │   ← marges du corps
│   ┌───────────────────────┐   │
│   │ image dans le texte   │   │
│   └───────────────────────┘   │
└───────────────────────────────┘
```

**Le poids** : la copie est réduite à deux fois la largeur où elle
s'affiche (pour les écrans haute densité), jamais agrandie — 1116 px de
large en pleine largeur, 988 px dans le texte. La même image posée une fois
pleine largeur et une fois dans le texte fait donc deux copies.

L'ancien écran **« Textes des e-mails »** (`/textes-emails`) renvoie
désormais vers `/emails` ; son code est retiré depuis le 2026-11-07. Le droit qui ouvre l'éditeur s'appelle
**« Modèles d'e-mails »**.

### La règle : le staff n'écrit que l'accroche

Décidée par Hugo le 2026-11-07 : **un e-mail pour tout le monde**. Le staff
écrit l'accroche (titre, message, bouton, blocs libres), la même pour tous.
Tout ce qui dépend du client ou de la commande (jour, lieu, règlement,
montants, QR, lien de paiement) est un **bloc de données** que le staff place
sans en réécrire les libellés. Un seul exemple par e-mail, plus de « cas ».

**Aujourd'hui, un seul e-mail suit la règle** : « Commande passée »
(`customer.order-placed`). Les 31 autres attendent la décision de Hugo,
e-mail par e-mail.

## Partie 2 — Technique

Vérifié dans le code le 2026-11-07 sauf mention contraire.

### Le bloc `mail` (`apps/lfd-api/src/mail/`)

| Contexte     | Ce qu'il fait                                                                                                     | Routes                                                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `requests/`  | demandes, envoi après validation, balayeur, purge, veille, sonde                                                  | `POST /admin/mail/requests/sweep`, `…/purge`, `…/watch` (machine, cron `*/5`) ; `POST /admin/ops/mail-check`                         |
| `templates/` | les gabarits, le dictionnaire (`copy/`, trois langues), les sections, les ressources (`resources/`), les exemples | —                                                                                                                                    |
| `copy/`      | les phrases réécrites par l'équipe et leur publication                                                            | `/admin/mail-copy` (écran historique)                                                                                                |
| `documents/` | le document par blocs d'un e-mail : brouillon, publication, retour, aperçus, essai, phrases                       | `/admin/mail-templates/:template` (`draft`, `publications`, `reverts`, `previews`, `block-previews`, `trials`, `history`, `phrases`) |
| `images/`    | la copie recadrée des images (S3d, S5d)                                                                           | — (appelée à la publication)                                                                                                         |
| `charters/`  | la charte d'un espace                                                                                             | `/admin/mail-charters/:space` (`draft`, `publications`, `previews`, `history`)                                                       |
| `senders/`   | l'identité d'envoi d'un espace                                                                                    | `GET`/`PUT /admin/mail-senders/:space`                                                                                               |

- **La porte** : `apps/lfd-api/src/mail/channels/requests/mail.ts` (`Mail`,
  injectée sous le nom `mail`), typée par modèle. La matrice du § 3 de
  `CLAUDE.md` ouvre `→ mail : port uniquement` à tous les blocs métier ; `mail`
  n'importe que `platform` et `staff`.
- **Le contrat des gabarits** : `apps/lfd-api/src/mail/channels/templates/`
  (`b2b-mails.ts`, langue, libellés de l'équipe). Registre :
  `apps/lfd-api/src/mail/templates/mail-templates.ts` — 32 modèles d'après
  les journaux (non recompté).
- **La veille et la carte de santé** : `ops` déclare
  `apps/lfd-api/src/ops/health/mail-backlog-readings.port.ts`, le bloc publie
  `apps/lfd-api/src/mail/channels/requests/mail-backlog-survey.ts`,
  `apps/lfd-api/src/appBootstrap/mail-backlog-readings.module.ts` les relie.
  Le cron vit dans `apps/lfd-api/container/worker.ts` ; la sonde est appelée
  par `.github/workflows/deploy_lfd_api.yml`.
- **La purge du suivi** : réglage `MAIL_REQUEST_PURGE`, `dry-run` par défaut
  (`apps/lfd-api/src/platform/config/app-config.ts`).
- **Les images** : port `MailImageReframer`
  (`apps/lfd-api/src/mail/images/domain/ports/mail-image.reframer.ts`),
  `sharp` dans `apps/lfd-api/src/mail/images/infrastructure/sharp-mail-image.reframer.ts`,
  stockage R2 dans `apps/lfd-api/src/mail/images/infrastructure/r2-mail-image.store.ts`,
  téléchargement borné dans `apps/lfd-api/src/mail/images/infrastructure/fetch-mail-image.downloader.ts`.
  Détail ci-dessous, « Les images : source et stockage ».

### Les images : source et stockage (décidé par Hugo le 2026-11-08)

Deux règles tenues **par construction** — aucune variable ne peut les
desserrer :

| Règle                                                                                        | Où                                                                                                                     | Pourquoi                                                                                                                                               |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| La source admise est l'origine de `R2_MEDIA_PUBLIC_BASE_URL`, et elle seule                  | `AppConfig.mailImageOrigins` (`apps/lfd-api/src/platform/config/app-config.ts`), vérifiée par `MailImageSource.admit`  | Publier un modèle fait télécharger le serveur : sans liste fermée, ce serait un client HTTP ouvert (SSRF). Le téléchargeur ne suit aucune redirection. |
| La copie va dans le bucket des médias, sous `mail/templates/<sha256>.<ext>`, servie immuable | `R2MailImageStore` (`apps/lfd-api/src/mail/images/infrastructure/r2-mail-image.store.ts`), `MAIL_COPIES_ROOT = "mail"` | Un seul bucket, un seul domaine public, aucun réglage propre au mailer. Le dossier `mail/` sépare ce que le bloc écrit de ce que la médiathèque range. |

Conséquences à connaître :

- **« Déjà une copie »** ne vaut que sous `<médias>/mail/`
  (`MailImageAdmission.copiesBaseUrl`, posé par `mail-images.module.ts`).
  Sources et copies partageant le bucket, une règle sur l'adresse des médias
  entière aurait pris toute image de la médiathèque pour une copie, et sauté
  son recadrage. Un test du copieur le tient
  (`mail-image-copier.service.spec.ts`, « hors de `mail/`, se copie bien »).
- **Aucune suppression ne les atteint** : le bloc `mail` n'a pas de verbe
  pour retirer, et la médiathèque (`discard-media.ts`, `sweep-orphan-media.ts`)
  ne supprime que les clés inscrites dans SA table, jamais en parcourant le
  bucket — vérifié le 2026-11-08. Une copie sous `mail/` n'y figure pas.
- **Les accès** : le jeton `R2_MEDIA_*` écrit aussi les copies. R2 donne ses
  droits par bucket, pas par dossier ; un bucket à part ne se justifiait que
  par là, et ce n'est plus le choix retenu.
- **Le refus** : sans `R2_MEDIA_*` complets, la copie refuse en nommant ce qui
  manque ; le bulletin de démarrage le signale déjà sous les médias.
- **La taille des copies** (2026-11-08) : toute copie d'image de document
  passe par `SharpMailImageReframer` avec une `ImageShaping`
  (`imageShapingOf`, `@lfd/mail-blocks`) — le cadrage s'il y en a un, et une
  largeur maximale de `2 × largeur affichée` : `MAIL_CARD_INNER_WIDTH_PX`
  (558) en pleine largeur, `MAIL_BODY_WIDTH_PX` (494) dans le corps, tirées
  de `MAIL_CARD_MAX_WIDTH_PX` (560), `MAIL_CARD_BORDER_PX` (1) et
  `MAIL_BODY_GUTTER_PX` (32) — les mêmes constantes que `html.ts` écrit dans
  la carte. Jamais agrandie ; une image sans cadrage déjà assez étroite garde
  ses octets. Avant cette date, seule une image cadrée était réduite (à
  1200 px) ; une `original` était copiée telle quelle. Le logo d'une charte
  n'est pas concerné (copié tel quel).
- **La police du texte** (2026-11-08) : `MailCharterSettings.textFont`
  (`MailCharterFont | null`, `@lfd/mail-blocks`), validée comme
  `headingFont` (`https://`, nom et secours sans `"`, `;` ni accolade ;
  refus sous `textFont.*`). Une charte rangée avant, ou une charge qui ne la
  porte pas, se relit à `null` (`mail-charter-shape.ts`, `.default(null)`).
  Le rendu (`@lfd/mailer`) n'y touche que si elle est posée :
  `charterTextFontFaceRule` ajoute au `<head>` thémé un `@font-face` par
  graisse déclarée (400 à `url`, 600 et 700 dans `weights`, facultatif), et `textFontStack` écrit `'<famille>',<secours>` en ligne
  sur le `<body>` (et sur l'enseigne quand la charte n'a pas de police des
  titres) ; à `null`, la pile système `TEXT_FONT_STACK`, à l'octet — le
  doré des 32 e-mails n'a pas bougé. Pas de faux gras : une police à une
  seule graisse (Chunk) déclare 600 et 700 vers son unique fichier ; une
  police rangée sans `weights` ne déclare que la 400, comme avant.
- **Les polices de la boutique** : servies sous des noms NON hachés,
  `apps/lfc-ecommerce-frontend/public/brand/fonts/chunk-400.woff2` et
  `pogonia-400/600/700.woff2` (copies de `src/styles/fonts/`), sans en-tête
  particulier (Cloudflare Pages, comme le reste de `public/`) — Pages les
  sert avec `access-control-allow-origin: *` (relevé sur Chunk en production
  le 2026-11-08), ce qui laisse l'aperçu, cadre isolé d'origine nulle, les
  charger. Leurs
  adresses se construisent depuis la racine de la boutique
  (`mail-branding.ts`, `shopFontsOf`), et `GET /admin/mail-charters/lfc` les
  rend sous `shopFonts` ; l'espace `lfd` n'en reçoit pas. Sans
  `CLIENT_BASE_URL` (le poste de dev ne le pose pas), il n'y a pas de racine
  de boutique : le bouton ne s'affiche pas et l'aperçu garde le secours. La
  licence couvre l'envoi en e-mail (Hugo, 2026-11-08).
- **La clé de copie** (`imageCopyKey`) porte la largeur depuis le
  2026-11-08 : `<src>[#<format>@<x>,<y>]~<largeur>w`. Une version publiée
  avant n'a plus de clé correspondante : la republier recopie l'image, une
  fois, à la bonne taille.
- **Le rendu pleine largeur** (`packages/mailer/src/card-rows.ts`,
  `packages/mailer/src/full-width-image.ts`) : le corps de la carte est COUPÉ à l'image — une
  ligne `<tr>` à marges au-dessus, l'image dans sa propre ligne sans
  marges, une autre ligne à marges en dessous. Pas de marges négatives :
  Outlook pour Windows et Gmail les ignorent. L'`<img>` porte
  `width="558"` en attribut (Outlook) et `width:100%;max-width:558px` en
  style (téléphones), `display:block;border:0`, dans une cellule à
  `font-size:0;line-height:0` (pas de liseré sous l'image). Sans image
  pleine largeur, le corps reste une seule cellule, à l'octet comme avant —
  l'empreinte des 32 e-mails n'a pas bougé. Le canevas reçoit la même ligne
  dans sa table, marquée `data-image-width="full"`.
- **Ce qui a disparu** le 2026-11-08 : `MAIL_IMAGE_ORIGINS`, `R2_MAIL_BUCKET`,
  `R2_MAIL_ACCESS_KEY_ID`, `R2_MAIL_SECRET_ACCESS_KEY`, `R2_MAIL_ENDPOINT`,
  `R2_MAIL_PUBLIC_BASE_URL`, et le lecteur de config qui les lisait
  (commits `82d3df1db`, `4f6451f7b`).

### Les tables

| Table                                                               | Schéma   | Rôle                                          |
| ------------------------------------------------------------------- | -------- | --------------------------------------------- |
| `mail_request`                                                      | `mail`   | une demande et son suivi                      |
| `mail_document`, `mail_document_version`                            | `mail`   | le document d'un e-mail et ses versions       |
| `mail_charter`, `mail_charter_version`                              | `mail`   | la charte d'un espace et ses versions         |
| `mail_sender_identity`                                              | `mail`   | l'identité d'envoi d'un espace, par révision  |
| `mail_copy_entries`, `mail_copy_publication`, `mail_section_orders` | `public` | les phrases réécrites (restées dans `public`) |

Schémas : `apps/lfd-api/prisma/schema/mail.prisma` et
`apps/lfd-api/prisma/schema/public/mail-copy.prisma`. La ressource
`mail_templates` (libellé « Modèles d'e-mails »,
`packages/contracts/src/staff-access.ts`) est ajoutée par migration ; le droit
se donne à l'écran des rôles.

### Les paquets

- **`@lfd/mail-blocks`** (`packages/mail-blocks/src/`) : le contrat partagé
  API ↔ back-office — document, validation, ressources, espaces
  (`MAIL_SPACES = ["lfc", "lfd"]`), charte et contraste, identité d'envoi,
  cadrage d'image.
- **`@lfd/mailer`** (`packages/mailer/src/`) : le rendu HTML (coquille,
  document par blocs, charte, thème sombre) et le transport Resend
  (disjoncteur, mode à blanc). Pas de MJML.

### Le back-office

`apps/lfd-backoffice-frontend/src/app/mail-editor/` : routes `emails`,
`emails/espaces/:space/{templates,charte,expediteur}`, `emails/:template` et
`emails/:template/historique` (`apps/lfd-backoffice-frontend/src/app/app.routes.ts`).

### Les portes qui tiennent les e-mails

`mail-through-block` (aucun envoyeur hors du bloc, dette à 0),
`mail-receipt-admitted` (envoi immédiat sur liste admise),
`mail-copy-digest` (manifeste des textes), `mail-key-no-pii` (aucune adresse
dans une clé), `intent-key-gestures` (clé d'intention des gestes du staff),
`log-no-email`, `mail-attachment-by-reference`, `context-boundaries`,
`network-outside-transaction`. Liste et rôle : `pnpm gate --list`.

## Ce qui reste à faire

Une ligne par point ; le lien mène à la section du journal qui le détaille.
« Service » = [`plan-service-e-mails.md`](plan-service-e-mails.md),
« Éditeur » = [`plan-editeur-par-blocs.md`](plan-editeur-par-blocs.md).

### a. À faire par Hugo, hors code

1. Rien à poser pour les images d'e-mail : elles vont dans le bucket des
   médias, sous `mail/` (2026-11-08). Sans `R2_MEDIA_*` complets, publier un
   e-mail avec image est refusé — Service § 24.
2. Vérifier que la clé Resend de prod peut **lire les domaines** (une clé
   « envoi seulement » fait refuser tout réglage d'expéditeur) — Éditeur § 25,
   C3 écarts.
3. ~~Ajouter `lfd-backoffice.com` chez Resend avec ses DNS~~ — fait le
   2026-11-07 (DKIM, `send`, `rsend`, `_dmarc` et le MX de réception posés
   dans Cloudflare ; vérification Resend en attente). Reste : régler
   l'expéditeur de l'espace La Folie Douce après le déploiement de C3 —
   Éditeur § 25, C3.
4. Réception activée chez Resend sur `lfd-backoffice.com` et
   `lafoliecoffee.info` le 2026-11-07 (MX posés, vérification en attente) : les
   e-mails reçus restent dans Resend (« Inboxes ») tant que le chantier
   « Support » n'existe pas.
5. Donner les droits « Modèles d'e-mails » (éditer) et « Suivi des e-mails »
   (lire les envois) aux rôles concernés, à l'écran des rôles — Éditeur § 15,
   [`le-suivi-des-e-mails.md`](le-suivi-des-e-mails.md), règle 11.
6. Activer la purge du suivi (`MAIL_REQUEST_PURGE`) le moment venu — Service § 7.

### b. Avant le prochain push ou déploiement

1. ~~Batterie racine (`pnpm test`, lint, portes, build AOT)~~ — faite le
   2026-11-07 ; ses rouges corrigés (`fd10ad0a9`, `c3a51bb54`), CI de dev
   verte sur `c3a51bb54` — `CLAUDE.md` § 9 bis.
2. ~~`e2e:rebalance`~~ — fait le 2026-11-07, durées commitées (`fd10ad0a9`).
3. Un `docker build` complet de l'API pour `sharp` (seul l'essai isolé a
   tourné). Le 2026-11-08, le contexte de build est passé de 2,6 Go à 124 Mo
   (`.dockerignore` : `.claude/`, `graphify-out`), mais la compilation
   dépasse la mémoire du Docker local (8 Go) : la preuve viendra du build de
   la CI au déploiement — Éditeur § 19, format et point focal.
4. Repasser les migrations du jour (documents, chartes, identité d'envoi) au
   `lecteur-de-migrations` avant `main` : chacune a été relue au commit, la
   règle demande une relecture d'ensemble avant la production — `CLAUDE.md`
   § 9 bis.

### c. Plus tard

Les décisions en suspens, les chantiers notés, les pistes et ce qui reste à
voir en vrai sont rangés dans [`todo-e-mails.md`](todo-e-mails.md) depuis le
2026-11-08. Ce qui y figurait ici et qui est fait (le suivi des envois, le
sens de « envoyé », l'adresse de réponse obligatoire, un seul bouton dans
« Commande passée », le libellé système refusé par le serveur, la charte
dans l'aperçu…) se lit dans les sections au-dessus et dans
[`le-suivi-des-e-mails.md`](le-suivi-des-e-mails.md).
