# Plan — « Nous écrire » : les objets réglés à l'admin, le message par dialogue

**Statut** : 📐 plan du 2026-10-09, décidé par Hugo le même jour. Rien n'est bâti.
Ouvre une route d'écriture publique (sans compte) → `vitruve` avant de bâtir.

## 0. La demande (Hugo, 2026-10-09)

> « une page dans Admin / E-commerce LFC pour la contact ; écrire devra être un
> dialog avec un formulaire dont on peut fabriquer l'objet qui ira dans un
> select ».

Arbitrages d'Hugo, le même jour :

- le message est **rangé au back-office** (à traiter / traité) **et** envoyé
  par **e-mail** à l'adresse de l'objet choisi ;
- chaque objet porte : **libellé fr/en/it**, **adresse de destination**,
  **ordre** et **activation**, **public visé** (pros, particuliers, les deux) ;
- **tout le monde** peut écrire, visiteur compris (nom + e-mail saisis) ; un
  client connecté les a pré-remplis.

## 1. L'existant (à relire par le bâtisseur, rien n'est affirmé ici sans lui)

- `SupportRequest` (`prisma/schema/public/support.prisma`) : la demande de
  rappel à l'activation, d'un client connecté. Ce n'est pas le même objet (pas
  d'objet réglable, pas de visiteur) ; on ne la détourne pas.
- La page « Ouverture de la boutique » (E-commerce LFC › Réglages, droit
  `b2b_settings`) est le modèle d'une page de réglage du rayon e-commerce.
- Le courriel passe par `platform/mailer` (Resend, `mail-templates.ts`).
- Le bouton « Écrire » existant de la boutique, s'il existe : à trouver.

## 2. Ce qu'on bâtit

### 2.1 Les objets (back-office, E-commerce LFC › Contact)

- Table `contact_subject` : libellé fr/en/it (fr obligatoire), e-mail de
  destination (valeur-objet `EmailAddress`), ordre, actif, public visé
  (`b2b` | `b2c` | `both`). Archivage plutôt que suppression.
- Page de liste + dialogue fold de création / édition (règles du CLAUDE.md du
  back-office). Droit : une ressource neuve **ajoutée** à `StaffResource`,
  accordée à l'écran (jamais par la migration).

### 2.2 Le message (boutique)

- Dialogue « Nous écrire » (fold, `dialogSide()`) : objet (`fold-listbox` des
  objets actifs du public de l'espace courant, libellé dans la langue de la
  boutique), nom, e-mail, téléphone facultatif, message ; pré-rempli pour un
  client connecté (société incluse si espace société).
- Route publique `POST /contact-messages` (`@Public`), validée Zod, longueurs
  bornées, objet actif et visible pour ce public vérifié côté serveur.
  Anti-abus : limite de débit de la passerelle + un champ piège et un délai
  minimal de saisie ; pas de CAPTCHA.
- Table `contact_message` : objet (snapshot du libellé fr + id), nom, e-mail,
  téléphone, message, société/personne si connecté, traité le / par.
- Courriel à l'adresse de l'objet, `Reply-To` = l'e-mail de l'auteur ; objet du
  courriel assaini (`sanitiseSubject`). Échec d'envoi : le message reste rangé,
  journalisé.

### 2.3 Les messages (back-office)

- Liste « Messages » sous E-commerce LFC › Contact : à traiter / traités,
  détail, « Marquer traité ». Même droit que la page des objets.

## 3. Tests attendus

- Domaine : un objet sans libellé fr ou sans e-mail valide est refusé.
- Route publique : objet inactif ou d'un autre public refusé ; champ piège
  rempli → accepté en apparence, rien rangé ni envoyé ; longueurs bornées.
- e2e : un visiteur écrit → message rangé + courriel (mailer doublé) ; le staff
  le marque traité.
- Front : le dialogue ne propose que les objets du public ; pré-remplissage.

## 4. Ajout d'Hugo (2026-10-09) : la carte de contact

> « dans cette admin, on définira le texte de la contact card b2b b2c et le
> numéro de contact ».

- La même page porte un réglage unique `contact_settings` : le **numéro de
  contact** (affiché et en `tel:`), et le **texte de la carte de contact**
  (`client/shop/contact-band/`) pour les **pros** et pour les **particuliers**
  (titre + phrase, fr/en/it). Aujourd'hui ils sont en dur
  (`client/shop/contact-details.ts`, `accueil-public.copy.ts` §contact) ; ces
  constantes disparaissent, et une valeur vide retombe sur le texte actuel du
  dictionnaire. Route publique de lecture, comme `GET /order-opening`.
- Le bouton « Écrire » de la carte (`mailto:`) ouvre désormais le dialogue
  « Nous écrire » ; les `contact-panel` du legacy aussi, ou ils sont retirés
  s'ils ne sont plus routés (au bâtisseur de le dire).

## 5. Arbitrages après `vitruve` (2026-10-09) — ils l'emportent

1. **Reply-To par message** : `packages/mailer` gagne un `replyTo` facultatif
   dans `SendMailArgs`, qui l'emporte sur celui du mailer ; l'adresse est
   validée (forme e-mail, aucun caractère de contrôle) avant l'en-tête.
   `pnpm test` racine.
2. **Débit** : `@Throttle` explicite sur la route publique, **3 messages par
   10 minutes et par IP** (modèle : `shop-orders.controller.ts`). Le champ
   piège et le délai minimal restent, en plus. Le texte libre est échappé
   (`htmlEscape`) dans le gabarit ; l'objet du courriel est assaini.
3. **RGPD** : durée de conservation par défaut **12 mois** après traitement
   (constante nommée, à confirmer par Hugo) ; à échéance le message est
   **anonymisé** (nom, e-mail, téléphone, texte vidés ; la ligne reste, avec
   son objet et ses dates) par le cron quotidien existant — pas de `DELETE`
   physique ; ligne au registre `documentation/legal/rgpd-registre.json` si
   son format le permet, sinon une TODO datée.
4. **Rangement** : nouveau contexte `apps/lfd-api/src/b2b/contact/`, schéma
   `prisma/schema/public/contact.prisma`.
5. **Cloche staff** : un message reçu sonne la cloche du back-office (le cas
   « demandes de contact (J2) » prévu dans `staff.prisma`).
6. **Droit** : nouvelle ressource `StaffResource` `b2b_contact`, ajoutée par la
   migration SANS l'accorder ; graine `ROLE_GRANTS` pour l'admin (dev, e2e).
   Après déploiement, Hugo l'accorde à l'écran (`/admin/staff-roles`) — à
   écrire dans le runbook.
7. **Agrégat** `ContactMessage` : `markHandled(by, at)` refuse un second
   traitement (`BusinessError` qui le nomme) ; fait journalisé
   `contact_message.handled`. Les objets : CRUD honnête (§3.1), archivage.
