# Plan — piloter le texte de tous les e-mails

> **Doc-first, 2026-10-23.** Hugo : « dans communication j'ai besoin d'avoir
> une page pour piloter le contenu texte de tous les emails ». Hugo a confié
> les choix à l'assistant le même jour ; chacun porte sa raison. Ne touche ni
> l'argent, ni une migration de données, ni une frontière de sécurité : pas de
> `vitruve`, les affirmations sur l'existant ont été rouvertes à la main.

## 0. Ce qui existe (ouvert le 2026-10-23)

- **28 e-mails**, déclarés dans le registre
  `apps/lfd-api/src/platform/mailer/mail-templates.ts` (`B2bMails`) : 17 pour
  le client (`customer.*`), 10 pour l'équipe (`staff.*` et `ops.deploy-check`),
  1 pour l'agence (`agency.vitrine-notice`).
- **Une partie de leurs textes** est déjà dans un dictionnaire en trois
  langues, `platform/mailer/copy/` (`MAIL_COPY`, `mail-copy.model.ts`, ~140
  lignes par langue) : la confirmation de commande, la tournée partie, la
  facture émise, l'annulation. **Le reste est écrit dans les gabarits** :
  l'avis de prélèvement, l'accès ouvert, les demandes clients, le dossier du
  fournil, les sous-comptes, la vitrine, et la plupart des e-mails de l'équipe
  (`mail-templates.ts`, 928 lignes).
- **Le modèle à suivre existe** pour les textes de la boutique
  ([`plan-textes-de-la-boutique.md`](plan-textes-de-la-boutique.md)) :
  `b2b/shop-copy/` (entrées en brouillon puis publiées, `shop_copy_entries`,
  `shop_copy_publication`), l'écran `textes-boutique/` du back-office, au
  premier niveau de Communication, droit `b2b_storefront`.

## 1. Les choix

- **C1 — Tous les textes d'un e-mail passent par le dictionnaire.** Objet,
  sur-titre, titre, paragraphes, libellés, boutons, pied. Un texte resté dans
  un gabarit ne se pilote pas. Les **données** (numéro, montant, date, nom)
  restent des variables `{ref}`, `{total}`… que le texte place où il veut.
- **C2 — Le code garde les textes par défaut ; l'écran les remplace.** Même
  mécanique que la boutique : une entrée par (clé, langue), en brouillon puis
  **publiée**. Un e-mail lit le texte publié s'il existe, sinon celui du code.
  _(Raison : un e-mail doit partir même si la base ne répond pas sur ce
  point ; et retirer une modification ramène au texte d'origine.)_
- **C3 — Brouillon, aperçu, puis « Publier ».** On modifie plusieurs textes,
  on voit l'e-mail rendu, et un seul geste les met en service. Un e-mail parti
  est parti : l'aperçu passe avant.
- **C4 — Les trois langues, le français en référence**, comme la boutique :
  l'écran signale un français modifié dont une traduction n'a pas suivi.
- **C5 — Les variables sont gardées.** Un texte qui perd une variable
  obligatoire (`{ref}` dans l'objet d'une confirmation) ou qui en invente une
  inconnue est **refusé** à l'enregistrement, avec la liste des variables
  permises. _(Raison : un client qui reçoit « Votre commande {ref} » voit le
  défaut, pas l'écran qui l'a causé.)_
- **C6 — L'aperçu est le vrai gabarit**, rendu avec des **données d'exemple**
  marquées, comme la planche des documents : rien n'est envoyé, rien n'est
  écrit. Un bouton « M'envoyer un essai » envoie l'aperçu à l'adresse du staff
  connecté, et à elle seule.
- **C7 — Le droit** est celui des textes de la boutique, `b2b_storefront`
  (lire pour voir, écrire pour modifier et publier) : même métier, la
  communication. _(Raison : pas de nouvelle ressource à accorder à l'écran
  pour une page du même métier.)_
- **C8 — La page** vit dans Communication, au premier niveau, à côté des
  textes de la boutique : « Textes des e-mails ». Les e-mails y sont rangés
  par destinataire (clients, équipe, agence) puis par moment (commande,
  paiement, livraison, compte…), chacun avec ses textes et son aperçu.

## 2. Les lots

| Lot                                   | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E1** ✅ bâti le 2026-10-23 (§2 bis) | Sortir des gabarits **tous** les textes des 28 e-mails vers le dictionnaire, en trois langues (le français est la vérité ; l'anglais et l'italien reprennent l'existant, sinon une traduction marquée à relire). Aucun changement de rendu : chaque e-mail rend les mêmes octets en français avant et après (tests de non-régression par gabarit). Un manifeste des clés (e-mail, clé, variables permises, texte par défaut) généré depuis le dictionnaire, tenu par une porte comme `lint:shop-copy-digest`. |
| **E2**                                | Le serveur : entrées en brouillon et publiées (migration additive, sur le modèle de `shop_copy_entries`), le texte effectif (défaut + publié), validation des variables (C5), routes admin (lister, modifier, rétablir, publier), aperçu d'un e-mail avec données d'exemple (C6), essai envoyé au staff connecté, fait de journal et ses libellés.                                                                                                                                                            |
| **E3**                                | L'écran du back-office (C3, C4, C8) : la liste, l'éditeur à trois langues, l'aperçu, « M'envoyer un essai », « Publier », sur le modèle de `textes-boutique/`.                                                                                                                                                                                                                                                                                                                                                |

## 2 bis. E1 — bâti le 2026-10-23 (non commité à l'écriture)

- **Le dictionnaire est rangé par e-mail** : `MailCopy` a une section par clé
  du registre (`mailCopyOf(locale)["customer.order-placed"]`…), découpé en
  cinq familles (`copy/model/` : commande, paiement, facturation, compte,
  équipe) et autant de fichiers par langue (`copy/fr/`, `copy/en/`,
  `copy/it/`). Les 28 gabarits ne portent plus de texte ; ce qui leur reste
  est de la mise en page (ordre des blocs, sauts de paragraphe, forme
  « Libellé : valeur » des e-mails internes, guillemets autour d'un message
  saisi, séparateurs de liste). `mandate-to-sign-wording.ts` ne garde que
  son type.
- **Les variables permises** sont déclarées dans `apps/lfd-api/src/platform/mailer/copy/mail-copy.variables.ts`
  (ce que le gabarit passe à `fill`) ; les **obligatoires** sont celles du
  texte français par défaut. `mail-copy.spec.ts` refuse une variable non
  déclarée, dans les trois langues.
- **Le manifeste** `apps/lfd-api/src/platform/mailer/copy/mail-copy-manifest.json`
  (e-mail → clé → variables permises, obligatoires → texte français) est
  généré par `pnpm mail-copy:digest` ; `lint:mail-copy-digest` (47ᵉ porte)
  refuse qu'il retarde. 325 textes, 28 e-mails.
- **Aucun octet changé** : `apps/lfd-api/src/platform/mailer/__tests__/mail-rendering-golden.spec.ts` compare
  81 cas (chaque branche de chaque e-mail, en français) aux empreintes
  capturées AVANT le déménagement (`apps/lfd-api/src/platform/mailer/__tests__/rendering-golden/mail-rendering.golden.json` :
  objet en clair, SHA-256 du HTML et des pièces jointes).

### Traductions neuves à relire (anglais et italien)

Reprises de l'existant : confirmation, mise à disposition, livraison en
route, paiement refusé, paiement expiré, annulation, facture émise. Le texte
alternatif du QR (`qrAlt`) reprend le titre déjà traduit.

**Écrites le 2026-10-23, à relire** — toutes les sections suivantes, en
anglais et en italien :

- `customer.order-placed-with-your-email`, `customer.order-payment-link` ;
- `customer.collection-notice`, `customer.mandate-to-sign` (dont les deux
  pieds de schéma CORE et B2B — mentions SEPA, à relire avec le formulaire
  traduit s'il existe ; « UMR » en anglais pour la RUM) ;
- `customer.access-opened`, `customer.company-attached`,
  `customer.login-method-linked`, `customer.password-reset` ;
- `customer.sub-account-activity`, `customer.sub-account-gesture` (les
  `action` sont des fragments glissés dans « Your site {site} {action}… » :
  l'ordre des mots y est contraint) ;
- les onze e-mails de l'équipe : `staff.*`, `ops.deploy-check`,
  `agency.vitrine-notice` (« Benvenuto » au masculin générique en italien,
  comme le reste du dictionnaire au vouvoiement « Lei »).

## 3. Ce qui n'est pas fait ici

- La **mise en page** des e-mails (couleurs, logo, ordre des blocs) : c'est
  le gabarit, pas le texte.
- Le **choix de la langue** d'un client : rien ne la porte encore
  (`mail-copy.ts`, `DEFAULT_MAIL_LOCALE`) ; les trois langues sont prêtes pour
  le jour où elle existera.
