# Données personnelles du livreur — l'état et ce qui manque

> **État au 2026-10-06 : 🟠 inventaire — l'information du livreur est donnée
> (texte version 2 depuis la position au geste, §5, §7 point 2 et §8).** Ce document rassemble ce que
> l'application traite **sur le livreur** et **sur les personnes que le livreur
> photographie ou fait signer** à la porte. Chaque fait sur le code porte la
> date à laquelle il a été ouvert ; ce qui n'a pas pu être vérifié est dit
> comme tel.
>
> ⚠️ **Ce n'est pas un avis juridique.** Aucune base légale n'est ici acquise :
> celles qui figurent sont **proposées**, et l'ensemble est **à valider par un
> juriste ou un DPO** avant la mise en service des livraisons.

---

## 1. Ce document

- **Périmètre** : la livraison (`apps/lfd-api/src/delivery/`), la remise à la
  porte (`apps/lfd-api/src/handover/`), et ce que le socle staff
  (`apps/lfd-api/src/staff/`) sait d'un livreur.
- **Personnes concernées** :
  - le **livreur** : aujourd'hui toujours un membre du staff avec un compte
    back-office (le livreur sans compte n'est pas bâti —
    [`../livraisons/a-la-porte.md`](../livraisons/a-la-porte.md) §10) ;
  - le **réceptionnaire** : la personne qui reçoit la commande, que le livreur
    nomme, photographie (la marchandise remise) et fait signer ;
  - le **contact de livraison** du client, que le livreur lit sur sa tournée.
- **Hors périmètre** : les données du client en tant qu'acheteur (compte,
  paiement), traitées par
  [`texte-politique-de-confidentialite.md`](texte-politique-de-confidentialite.md).

---

## 2. Les données du livreur

Vérifié le 2026-10-06 dans `apps/lfd-api/prisma/schema/` et le code cité.

| Donnée                                                                         | Où                                                                                                                                                    | Pourquoi (finalité)                                                                                             | Qui la voit                                                      | Conservation                                                                                                          | État            |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------- |
| Prénom, nom, e-mail, téléphone, intitulé de poste                              | `public.staff_users` (`first_name`, `last_name`, `email`, `phone`, `job_title`)                                                                       | annuaire, invitation, auteur des gestes                                                                         | droit `staff` de l'annuaire                                      | **aucune** : la fiche n'a pas de fin                                                                                  | bâti            |
| Identifiant Auth0                                                              | `staff_users.auth0_id`                                                                                                                                | relier la connexion à la fiche                                                                                  | aucun écran ; liste admise de lecteurs (`lint:auth0-id-readers`) | **aucune**                                                                                                            | bâti            |
| Statut, rôle, dérogations de droits                                            | `staff_users.status`, `role_key`, tables de permissions                                                                                               | autoriser chaque geste                                                                                          | écran des rôles                                                  | **aucune**                                                                                                            | bâti            |
| Abonnement Web Push de l'appareil (URL du service de push, clés du navigateur) | `public.staff_push_subscriptions` (`endpoint`, `p256dh`, `auth`, `staff_user_id`, `last_sent_at`, `failing_since`)                                    | prévenir l'appareil (cloche du back-office)                                                                     | aucun écran trouvé                                               | oublié après une semaine de refus 403 (commentaire du schéma, non rejoué) ; sinon **aucune**                          | bâti            |
| Affectation à une tournée                                                      | `delivery.delivery_round.driver_staff_id`                                                                                                             | dire à qui est la tournée ; le mur du livreur                                                                   | Tournées (`delivery`)                                            | **aucune**                                                                                                            | bâti            |
| Départ, retour, auteur et nom du retour                                        | `delivery_round.departed_at`, `returned_at`, `returned_by`, `returned_by_name`                                                                        | mesure du temps de tournée, garde des bacs                                                                      | Tournées                                                         | **aucune**                                                                                                            | bâti            |
| « Je suis arrivé »                                                             | `delivery_stop_execution.arrived_at`                                                                                                                  | instant de la porte                                                                                             | Tournées                                                         | **aucune**                                                                                                            | bâti            |
| Chargement d'un bac (qui)                                                      | `delivery_bin_load.loaded_by`                                                                                                                         | garde des bacs                                                                                                  | Tournées                                                         | **aucune**                                                                                                            | bâti            |
| Problème signalé : famille, motif, note ≤ 500 car., photo, auteur et nom figé  | `delivery.delivery_incident` (`reported_by`, `reported_by_name`, `photo_key`) ; photo dans le stockage R2 « production »                              | prévenir le commercial, trancher                                                                                | Tournées, commerciaux notifiés                                   | **aucune** — un fait qui « ne se supprime pas » (commentaire du schéma)                                               | bâti            |
| Auteur d'une pièce de remise                                                   | `production.order_handover_proof.recorded_by`                                                                                                         | qui a remis                                                                                                     | droit `delivery_proofs` (lecture)                                | **aucune** ; purge câblée non planifiée (§7)                                                                          | bâti            |
| Lecture du texte d'information (fiche, version, instant)                       | `delivery.delivery_driver_notice_ack` (`staff_id`, `version`, `acknowledged_at`)                                                                      | prouver que l'information a précédé la tournée                                                                  | aucun écran ; le livreur relit le texte dans « Mes données »     | **aucune**                                                                                                            | bâti            |
| **Position du téléphone au geste** (latitude, longitude, précision)            | `delivery_stop_execution.arrived_lat/lng/accuracy_m` (arrivée) ; `delivery_round_stop.closed_lat/lng/accuracy_m` (remise, dépôt, clôture sans remise) | faciliter les tournées suivantes (adresses justes, où se garer, la bonne porte, l'accès) ; prouver la livraison | aucun écran au 2026-10-06 (§5) ; la base seule                   | **60 jours**, purge nocturne ([`../livraisons/gps-y-aller-et-position.md`](../livraisons/gps-y-aller-et-position.md)) | bâti 2026-10-06 |

⚠️ **Les colonnes `gps_lat` / `gps_lng` de `delivery_stop_execution` ne sont
PAS la position du livreur** (vérifié le 2026-10-06, schéma et migration
`20261001120300_le_depart_fige_le_rang_et_le_point`) : c'est le point GPS de
l'**adresse du carnet**, figé au départ pour la navigation. La position du
téléphone, elle, vit dans les colonnes `arrived_*` et `closed_*` de la ligne
ci-dessus (migration `20261007160000_la_position_au_geste`).

**Bases légales proposées** (à valider) : exécution du contrat de travail pour
la fiche et l'affectation ; intérêt légitime (organisation des tournées, preuve
de livraison) pour les horodatages, les signalements et l'auteur des pièces.

---

## 3. Les tiers vus par le livreur

| Donnée                                                                                                                  | Où                                                                                                                                           | Pourquoi                                | Qui la voit                              | Conservation                                                                                                            | État |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---- |
| Libellé client, adresse livrée, contact convenu (nom, téléphone), fenêtre, note de commande, note livreurs de l'adresse | `delivery.delivery_stop_execution` (`customer_label`, `address`, `contact`, `delivery_window`, `note`, `address_note`) — **figés au départ** | livrer sans relire le commerce en route | le livreur de la tournée (mur), Tournées | **aucune** ; 90 jours proposés pour le snapshot ([`../livraisons/a-la-porte.md`](../livraisons/a-la-porte.md) §10)      | bâti |
| Nom du réceptionnaire (2 à 80 car., nul pour un dépôt)                                                                  | `production.order_handover_proof.receiver_name`                                                                                              | preuve de remise                        | droit `delivery_proofs`                  | **aucune** ; 90 j proposés                                                                                              | bâti |
| Photo de la remise                                                                                                      | `order_handover_proof.photo_key` → stockage R2 « production »                                                                                | preuve de remise                        | droit `delivery_proofs`                  | **aucune** ; 90 j proposés                                                                                              | bâti |
| Signature tracée au doigt                                                                                               | `order_handover_proof.signature_key` → R2 « production »                                                                                     | preuve de remise                        | droit `delivery_proofs`                  | **aucune** ; 90 j proposés                                                                                              | bâti |
| Photo d'un problème à la porte (peut montrer une personne, un lieu)                                                     | `delivery_incident.photo_key` → R2 « production »                                                                                            | trancher le problème                    | Tournées                                 | **aucune**                                                                                                              | bâti |
| Point GPS de l'adresse                                                                                                  | `delivery_stop_execution.gps_lat/lng` ; cache `delivery.delivery_geocode` (empreinte SHA-256 de l'adresse, point, score)                     | situer l'arrêt, naviguer                | Tournées, le livreur                     | cache : 365 j, **purgés chaque nuit** depuis le 2026-10-06 ([`rgpd-purge-du-geocodage.md`](rgpd-purge-du-geocodage.md)) | bâti |

**Base légale proposée** (à valider) : intérêt légitime du vendeur à prouver la
remise ; exécution du contrat de vente pour l'adresse et le contact. Le
réceptionnaire n'est **pas forcément le client** : il n'a accepté aucune
condition, et l'information qu'il reçoit à la porte est aujourd'hui **nulle**
(§7).

---

## 4. Sous-traitants et flux sortants

| Destinataire                                                       | Ce qui part                                                                       | Vérifié le 2026-10-06                                                                                                                     | À vérifier                                                                                                                                                                         |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth0**                                                          | l'identité de connexion du livreur (e-mail, passkey)                              | `staff_users.auth0_id`                                                                                                                    | région d'hébergement, contrat de sous-traitance (DPA)                                                                                                                              |
| **Cloudflare R2**                                                  | photos de remise, signatures, photos d'incident (usage `production`)              | `R2StorageUsage` dans `apps/lfd-api/src/platform/config/env-readers.ts`                                                                   | région du bucket, DPA                                                                                                                                                              |
| **Base Postgres** (pooler)                                         | tout le reste                                                                     | `prisma/schema/datasource.prisma`                                                                                                         | hébergeur, région, DPA                                                                                                                                                             |
| **Services de push** (Apple, Google, Mozilla, selon le navigateur) | titre et corps de la notification, chiffrés de bout en bout ; l'URL de l'appareil | `web-push` dans `apps/lfd-api/package.json`, `apps/lfd-api/src/staff/notifications/infrastructure/web-push-sender.ts`                     | ce que contiennent les titres/corps envoyés (un nom de client ?) — non relu                                                                                                        |
| **Resend**                                                         | les e-mails au staff (invitation)                                                 | —                                                                                                                                         | non relu pour ce document                                                                                                                                                          |
| **BAN** (`api-adresse.data.gouv.fr`)                               | voie, code postal, ville — un CSV par lot, sans nom ni contact                    | `apps/lfd-api/src/delivery/infrastructure/ban-geocoder.ts`                                                                                | opérateur exact du service ; la valeur de `vars.BAN_GEOCODER_URL` en production (`.github/workflows/deploy_lfd_api.yml`) — sans elle, le géocodeur est éteint (`DisabledGeocoder`) |
| **OSRM** (`apps/lfd-route-planner/`)                               | des points, pas de nom                                                            | auto-hébergé derrière la passerelle                                                                                                       | où il tourne                                                                                                                                                                       |
| **Navigation tierce** (Google, Apple, Waze)                        | l'itinéraire ouvert par le livreur                                                | bâti ([`../livraisons/gps-y-aller-et-position.md`](../livraisons/gps-y-aller-et-position.md)) : un lien, rien n'est envoyé par le serveur | à annoncer avant mise en service (YA-Q4)                                                                                                                                           |

---

## 5. La géolocalisation

**Bâti le 2026-10-06** (YA-D4, [`../livraisons/gps-y-aller-et-position.md`](../livraisons/gps-y-aller-et-position.md)) :
la position du téléphone est relevée **au geste** — « Je suis arrivé », remise,
dépôt, clôture sans remise — par un `getCurrentPosition` ponctuel, jamais
`watchPosition`, jamais en arrière-plan. Une position indisponible (refus du
navigateur, pas de signal, délai de 8 s dépassé) n'empêche aucun geste :
les colonnes restent nulles et l'écran dit « position indisponible ».
**On prévient, on ne demande pas** (Hugo, 2026-10-06) : le texte v2 énonce un
fait, il ne propose pas de refus.

**Finalité écrite** (Hugo, 2026-10-06) : d'abord **faciliter les tournées
suivantes** du livreur — adresses justes, où se garer, la bonne porte, les
consignes d'accès, pour lui et le prochain livreur — puis **prouver la
livraison** en cas de litige. **Jamais** suivre ses déplacements, ni mesurer
sa vitesse ou son temps de travail.

**Purge** : `POSITION_RETENTION_DAYS` = 60, chaque nuit
(`admin/livraison/positions/sweep`, `PurgeStalePositionsHandler`) : les trois
colonnes reviennent à `NULL`, la ligne et l'heure du geste restent.

**Qui la voit** : personne à l'écran au 2026-10-06. L'affichage de l'écart
au bureau est décidé mais non bâti (voir le doc technique, « Reste à faire ») ;
le droit qui le verra est à trancher.

Ce que la CNIL attend d'une géolocalisation de salariés, **à vérifier sur ses
textes** (non ouverts ici) et à faire valider :

- [ ] **information préalable** du livreur, écrite, avant la mise en service
      — fait : version 2 du texte (2026-10-06), réaffichée une fois à chaque
      livreur qui avait accusé la version 1 ;
- [ ] **finalité déterminée** et compatible — à confronter à la phrase
      ci-dessus ;
- [ ] **proportionnalité** : un point au geste plutôt qu'un suivi — à faire
      confirmer comme suffisant ;
- [ ] **durée** : 60 jours, purge nocturne bâtie — la durée reste **à faire
      valider** ;
- [ ] pas de contrôle du temps de travail par la position si un autre moyen
      existe — à vérifier ;
- [ ] information des représentants du personnel s'il y en a — à vérifier.

---

## 6. Ce qui protège déjà

Vérifié le 2026-10-06.

- **Le mur du livreur** : `PrismaDriverRoundWall` lit la tournée par
  `driverStaffId` **et** `id` dans le même `where` ; hors de ses tournées, le
  livreur reçoit `DriverRoundNotFoundError` (une 404), pas un 403 qui
  confirmerait l'existence.
- **Les droits scindés** : voir les preuves demande `delivery_proofs` en
  lecture (`packages/contracts/src/staff-access.ts`) — l'écriture « n'ajoute
  rien » ; voir les commandes ne suffit pas.
- **La pièce de remise ne voyage pas** : le nom du réceptionnaire, la photo
  et la signature sont écrits dans `order_handover_proof` seul ; l'attestation
  publiée ne porte que le mode et l'auteur
  (`apps/lfd-api/src/handover/application/services/handover-doorstep-attestor.ts`).
- **L'effacement est câblé** :
  `PurgeHandoverProofsOlderThanCommand` et `EraseHandoverProofsCommand`
  effacent images puis ligne, et laissent l'attestation de remise.
- **La BAN ne reçoit que l'adresse**, et le cache ne garde qu'une empreinte —
  une pseudonymisation, pas une anonymisation.
- **L'auteur est un identifiant** (`staff_user_id`), et l'`auth0_id` n'est
  jamais écrit dans un message (`lint:auth0-id-readers`).

---

## 7. Ce qui manque, par urgence

1. 🔴 **Publier le paragraphe géocodage** de la politique de confidentialité
   (texte prêt dans
   [`texte-politique-de-confidentialite.md`](texte-politique-de-confidentialite.md),
   à reporter au back-office, document `privacy`). Depuis CA0 (`0aa07eb63`,
   2026-10-06), **chaque commande livrée est géocodée à la passation** dès que
   `BAN_GEOCODER_URL` est posée : c'est **bloquant avant la prochaine promotion
   vers `main`**, ou bien vérifier que la variable est vide en production.
2. ✅ **Informer les livreurs** — fait le 2026-10-06 (non commité à
   l'écriture de cette ligne). Le texte, version 2 depuis la position au
   geste, vit à une seule source :
   `apps/lfd-api/src/delivery/domain/value-objects/driver-information-notice.ts`.
   Au premier appui sur « Commencer ma tournée », un dialogue le présente en
   entier — « J'ai compris » enregistre l'accusé
   (`delivery.delivery_driver_notice_ack`) puis démarre, « Plus tard » ne
   démarre pas. Une nouvelle version le réaffiche une fois. « Mes données »
   (`/coursier/mes-donnees`) le relit à tout moment. Une **information**, pas
   un consentement : l'accusé prouve que le texte a été montré, il n'autorise
   rien. Ce qui reste :
   - 🔴 **le contact** pour exercer ses droits : le texte affiche
     « [À COMPLÉTER : contact] », faute d'adresse dans les documents légaux ;
   - ✅ **la position au geste** : bâtie, annoncée par la version 2
     (2026-10-06), avec sa durée de 60 jours ;
   - **les autres durées** : le texte dit « en cours de définition » ; les
     fixer demande une nouvelle version.
   - le serveur ne refuse PAS un départ sans accusé : le dialogue est côté
     écran, et la porte du chargeur (`tournees/:roundId/depart`) n'en a pas.
3. 🟠 **Informer le réceptionnaire** à la porte (une ligne à l'écran de
   signature, qui renvoie à la politique) — aujourd'hui rien.
4. 🟠 **Tenir le registre des traitements** — brouillon de la ligne en
   annexe.
5. 🟠 **Planifier les purges** et écrire les durées tenues : pièces de remise
   (90 j proposés), snapshot du départ (90 j), cache de géocodage (365 j — purge bâtie le 2026-10-06, [`rgpd-purge-du-geocodage.md`](rgpd-purge-du-geocodage.md)),
   incidents (aucune durée proposée — à décider), abonnements push muets.
6. 🟠 **Contrats de sous-traitance** : Auth0, Cloudflare, hébergeur Postgres,
   Resend — récupérer et classer les DPA, noter les régions.
7. 🟡 **Départ d'un livreur** : couper ses abonnements push (le schéma le
   prévoit, geste non trouvé), désactiver puis anonymiser la fiche, supprimer
   l'utilisateur Auth0 ; les noms figés (`reported_by_name`,
   `returned_by_name`) restent — à décider.
8. 🟡 **Exercice des droits** : aucun export ni effacement à la demande pour un
   livreur ou un réceptionnaire ; `EraseHandoverProofsCommand` n'a ni route ni
   écran. Écrire la procédure (par e-mail, comme pour les clients).
9. 🟡 **DPO** : désigner ou écrire pourquoi il n'est pas obligatoire — à
   valider par un juriste.

---

## 8. Ce que la porte tient

Depuis le 2026-10-06, l'inventaire des §2 et §3 a une forme machine :
[`rgpd-registre.json`](rgpd-registre.json), une entrée par colonne
`schéma.table.colonne` (personne, catégorie, finalité, conservation, purge,
information). `pnpm lint:rgpd-staff` (`dev-toolbox/gates/rgpd-staff.mjs`) le
confronte au schéma Prisma à chaque exécution de `lint:gates`.

- **Colonnes candidates**, détectées par leur nom Postgres (`@map` compris) :
  `*_by`, `*_by_name`, `*_staff_id`, `driver_*`, `receiver_name`, `photo_key`,
  `signature_key`, et `*_lat` / `*_lng` / `*_accuracy_m` dans le schéma
  `delivery` seulement. Une candidate absente du registre fait échouer.
- **Registre périmé** : une entrée ou une exclusion qui ne nomme aucune colonne
  existante fait échouer. Le registre porte aussi des colonnes que les motifs
  ne voient pas (fiche `staff_users`, abonnements push, `departed_at`,
  `returned_at`, `arrived_at`).
- **Champs** : obligatoires et aux valeurs admises ; une `purge` cite un
  fichier qui existe.
- **Exclusions**, chacune avec sa raison dans le registre : le point GPS de
  l'adresse (`delivery_stop_execution.gps_lat/lng`), `company_terminations.initiated_by`
  (un rôle, pas une personne), les photos des notes et des procédures d'accès
  d'un client (données du client).
- **Le texte d'information** : `texteInformation` vaut `{ version: 2,
empreinte }` depuis le 2026-10-06 (v1 le matin, v2 avec les six colonnes de
  position, catégorie `position`, conservation 60 jours). L'empreinte des entrées `livreur`
  (colonne et catégorie) doit être celle que le texte a vue : ajouter ou
  recatégoriser une donnée du livreur fait échouer la porte tant qu'on n'a pas
  écrit une nouvelle version (vérifié à la main le 2026-10-06 : une entrée
  passée en `livreur` sans changer de version échoue). Un test
  (`apps/lfd-api/src/delivery/domain/value-objects/__tests__/driver-notice-registry.spec.ts`) tient l'égalité entre la version du
  registre et celle du texte servi. Les entrées `livreur` et `receptionnaire`
  sont toutes en `information: true` ; trois horodatages que le texte annonce
  y sont entrés ce jour-là (`delivery_round_stop.closed_at`,
  `delivery_bin_load.loaded_at`, `delivery_incident.reported_at`), avec les
  deux colonnes de l'accusé.
- **Dette affichée, sans échec** : le nombre d'entrées en `a-decider`, en
  `aucune-limite-decidee` et en `information: false` — cette dernière est
  passée de 130 à 114 le 2026-10-06 : il n'y reste que le staff hors
  livraison, que le texte du livreur ne couvre pas.

Ce qu'elle ne tient pas : une donnée personnelle dans une colonne au nom neutre
(`note`, `contact` du snapshot de départ), ni le contenu des `jsonb`. Le
`contact` convenu, lu par le livreur (§3), n'est pas au registre : il n'est ni
du staff ni le réceptionnaire attesté.

---

## Annexe — brouillon de fiche du registre : « Livraison et preuves de remise »

> Brouillon. Chaque ligne est **à valider par un juriste ou un DPO**.

| Rubrique                  | Contenu proposé                                                                                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsable               | La Folie Douce — [À COMPLÉTER : raison sociale, adresse, contact]                                                                                                                                                                |
| Finalités                 | organiser et exécuter les livraisons ; prouver la remise ; traiter les problèmes à la porte ; relever la position au geste pour faciliter les tournées suivantes et prouver la livraison                                         |
| Bases légales (proposées) | exécution du contrat de travail (livreurs) ; exécution du contrat de vente (adresse, contact) ; intérêt légitime (preuve de remise, photos, signature, position au geste)                                                        |
| Personnes concernées      | livreurs (staff) ; clients ; réceptionnaires                                                                                                                                                                                     |
| Catégories de données     | identité et contact du livreur ; horodatages de tournée ; signalements (note, photo) ; adresse et contact de livraison ; nom, photo et signature du réceptionnaire ; point GPS d'adresse ; position du téléphone au geste (60 j) |
| Destinataires internes    | livreur de la tournée ; Tournées (`delivery`) ; commerciaux notifiés ; détenteurs du droit `delivery_proofs`                                                                                                                     |
| Sous-traitants            | Auth0, Cloudflare (R2), hébergeur Postgres, Resend, services de push des navigateurs ; BAN (service public) — [À VÉRIFIER : régions, DPA]                                                                                        |
| Transferts hors UE        | [À VÉRIFIER pour chaque sous-traitant]                                                                                                                                                                                           |
| Durées (proposées)        | pièces de remise 90 j ; snapshot du départ 90 j ; position 60 j ; cache de géocodage 365 j ; fiche staff : durée du contrat + [À COMPLÉTER] ; incidents [À COMPLÉTER]                                                            |
| Mesures de sécurité       | mur du livreur (404) ; droit dédié aux preuves ; images en stockage objet privé ; empreinte d'adresse vers la BAN ; effacement câblé                                                                                             |
