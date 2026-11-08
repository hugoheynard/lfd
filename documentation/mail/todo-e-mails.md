# Les e-mails — ce qui viendra plus tard

> Ouvert le 2026-11-08 à la demande de Hugo : un seul endroit pour ce qui
> n'est **ni fait, ni à faire avant le prochain déploiement**. Ce qui
> presse (les gestes de Hugo, l'avant-déploiement) reste dans
> [`les-e-mails.md`](les-e-mails.md), « Ce qui reste à faire ». Un point pris
> en main quitte cette liste pour son plan ; un point fait n'y reste pas.
>
> « Service » = [`plan-service-e-mails.md`](plan-service-e-mails.md),
> « Éditeur » = [`plan-editeur-par-blocs.md`](plan-editeur-par-blocs.md),
> « Suivi » = [`le-suivi-des-e-mails.md`](le-suivi-des-e-mails.md).

## Décisions à prendre (Hugo)

- **Durcir le DMARC de `lafoliecoffee.info`** (relevé le 2026-11-08 :
  `v=DMARC1; p=none;`, sans adresse de rapports). Poser `rua=` vers une
  adresse qui reçoit les rapports agrégés, les lire quelques semaines, puis
  passer à `p=quarantine`, enfin `p=reject` ; même chose pour
  `lfd-backoffice.com`. Geste DNS de Hugo ; préalable au logo de marque dans
  les messageries (BIMI).

- **« Voir ma commande » d'un invité** mène à la page d'annulation : la
  garder, ou créer une vraie page de consultation — Éditeur § 26, n° 3.
- **Les pièces jointes par URL signée (S3c)**, « à revoir » ; d'ici là le
  bloc `mail` lit le stockage des pièces client — Service § 22.
- **Le dossier du fournil part encore en octets** : ouvrir son stockage au
  bloc `mail`, ou le laisser — Service, revue cas 7.
- **La durée de conservation des mandats** rangés au stockage — Service,
  revue cas 7.

## Chantiers à bâtir

- **L'origine d'un rebond, et l'adresse à vérifier** (Hugo, 2026-11-08 :
  « certains bounce sont liés à l'antispam, il faudrait connaître
  l'origine »). Le genre du retour est déjà rangé (`delivery_kind` =
  `type/subType` de Resend, suivi T1). Trois familles : adresse inexistante
  (`Permanent/General`, `Permanent/NoEmail`) → « adresse à vérifier » sur la
  fiche du client, et seulement elle ; passager (`Transient/*` : boîte
  pleine, message trop gros) → rien au client ; refus par l'anti-spam du
  destinataire (`*/ContentRejected`, `*/AttachmentRejected`) → alerte à
  l'équipe (délivrabilité), jamais au client. Le suivi affiche la famille
  en clair. À bâtir après l'e-mail qui connaît son sujet
  ([`le-sujet-des-e-mails.md`](le-sujet-des-e-mails.md)), dont il lit
  les sujets `account`.
- **La santé de l'envoi** (Hugo, 2026-11-08 : « besoin d'une page de suivi
  dans mails ») : un onglet du suivi des envois avec les taux de remise, de
  rebond et de plaintes sur 7 et 30 jours, par espace et par modèle, et des
  seuils qui sonnent la cloche (plaintes au-delà d'environ 0,3 %, rebonds
  au-delà de quelques pour cent — les seuils des grandes messageries).

- **Les 31 autres e-mails à la règle de l'accroche** (le staff n'écrit que
  l'accroche) : 16 faciles et 4 moyens d'abord, puis les 11 « à discuter »
  ligne par ligne — Éditeur § 23 (relevé) et § 26, n° 6.
- **Le Support** (Hugo, 2026-11-07) : traiter dans le back-office les
  e-mails reçus (`support@lfd-backoffice.com`, puis une adresse client sur
  `lafoliecoffee.info`) — les lire, les relier à leur commande ou à leur
  compte, répondre par le bloc `mail` ; dans Email Templates, l'onglet
  « Expéditeur » deviendrait « Réglages », l'adresse de réponse choisie parmi
  celles que le Support reçoit. ⚠️ **Pas vierge** : le plan
  [`../demandes-client/plan-reponses-par-e-mail.md`](../demandes-client/plan-reponses-par-e-mail.md)
  (2026-10-28, contredit par vitruve) couvre la réception, et le webhook
  remet déjà `email.received` à la boîte des demandes (`b2b/contact`). Le
  relire contre le code avant d'écrire quoi que ce soit ; route publique et
  données personnelles : `vitruve` avant Hugo.
- **Les faits `mail.delivered` / `mail.bounced`** publiés aux autres blocs,
  pour afficher « e-mail reçu » ou « adresse rejetée » sur la fiche d'une
  commande. Il faut d'abord qu'une demande d'e-mail connaisse son sujet
  (commande, compte), ce que `mail.mail_request` ne porte pas — Suivi, « Ce
  qui reste » ; Service, revue cas 5.
- **Le filtre « rien reçu du fournisseur »** dans le suivi des envois : l'API
  ne sait pas filtrer un retour nul — Suivi, T3.
- **L'e-mail de vérification d'Auth0** (« Verify your email ») part en
  anglais et hors du suivi du bloc `mail` (constaté le 2026-11-07 sur un
  rebond).

- **Un bloc « Image et texte »** (Hugo, 2026-11-08) : un titre, un texte et
  un bouton posés SUR une image, en vrais textes (éditables, traduits, lus
  par un lecteur d'écran — jamais écrits dans l'image). L'image en fond de
  cellule, avec sa version VML pour Outlook pour Windows (commentaires
  conditionnels `<!--[if mso]>`, que les autres messageries ignorent) ; une
  couleur de repli de la charte si l'image ne s'affiche pas ; un voile
  réglable avec la vérification de contraste ; texte en haut, au centre ou
  en bas ; format et pleine largeur comme une image. Proposé : pleine
  largeur et dans le texte, pas dans les colonnes ; un seul bouton.
- **Une poignée de hauteur** (Hugo, 2026-11-08, en attente de sa réponse) :
  sur une image (rapport libre recadré par le serveur, de 3:1 à 1:2) et un
  bloc « espace » réglable ; jamais sur un texte, dont la hauteur dépend de
  la messagerie.
- **Découper le canevas de l'éditeur** : `mail-canvas.ts` et son spec
  dépassent 900 lignes chacun (relevé le 2026-11-08, pour une règle à 300) —
  le glisser, les colonnes et la pleine largeur s'y sont ajoutés. À couper
  par geste (dépôt, réglages, sélection) avant le prochain ajout.

## Architecture, à mesurer avant de décider

- **Réduire l'envoi immédiat** (Hugo, 2026-11-08) : 10 appelants admis de
  `mail.sendAndAwaitReceipt` (`dev-toolbox/gates/mail-receipt-admitted.mjs`,
  relevé du 2026-11-06). Ceux qui écrivent leur issue à partir de l'accusé
  (avis de prélèvement, mandat SEPA, dossier du fournil, avis de la vitrine)
  pourraient repasser par `mail.send` et lire l'issue dans le suivi des
  envois ([`le-suivi-des-e-mails.md`](le-suivi-des-e-mails.md)) : moins de
  réseau pendant un geste, reprise automatique si Resend est en panne. Les
  gestes où le staff attend la réponse à l'écran, et la réinitialisation du
  mot de passe, gardent l'immédiat. Deux raisons de la liste citent encore
  « PDF en octets » (mandat, dossier du fournil) : celle du mandat est
  périmée depuis qu'il est joint par référence — à corriger au passage.

- **Les demandes suivies entre blocs** : toute demande d'un bloc à un autre
  rend un identifiant de suivi, et son état se lit plus tard ; une porte qui
  fait déclarer à chaque port de canal sa sorte (lecture, fait, demande). Le
  bloc `mail` le fait déjà depuis le suivi. Première étape : compter, en mode
  rapport, les ports qui seraient en dette —
  [`../todos/todo-demandes-suivies.md`](../todos/todo-demandes-suivies.md).

## Pistes, pas maintenant

- **Séparer le transactionnel du marketing** (Hugo, 2026-11-08) : le jour
  où des e-mails promotionnels partent (vitrine, offres), un sous-domaine à
  part, pour qu'une plainte sur une promo ne fasse pas passer les
  confirmations de commande en spam ; et le désabonnement en un clic
  (`List-Unsubscribe`, `List-Unsubscribe-Post`), exigé par Gmail et Yahoo
  pour les envois en nombre depuis 2024.
- **Les tests de rendu dans les vraies messageries** : Litmus ou Email on
  Acid (plus de 90 messageries, payants, branchables par API mais lus à
  l'œil). D'ici là : un essai sur Gmail, Outlook.com et iCloud, et une fois
  mail-tester.com (note anti-spam, SPF, DKIM, DMARC).

- **Colonnes « hybrides »** qui s'empilent sans `@media` (Gmail application,
  certains Outlook) — Hugo : « non pas là » — Éditeur § 24.
- **MJML** : il resterait contenu dans `@lfd/mailer` ; à envisager si on fait
  des colonnes hybrides, si un rendu cassé est constaté dans Outlook ou Gmail
  application, ou pour des blocs complexes — Service § 2, C6.

## À voir en vrai, un jour

- Le glisser-déposer des variables et des blocs, la saisie avec pastilles,
  dans Safari et Firefox — Éditeur § 22.
- Le QR et l'empilement des colonnes en mode sombre de Gmail et d'Outlook —
  Éditeur § 8.
