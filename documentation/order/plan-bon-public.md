# Plan — le bon de commande « public », et le bon joint à la confirmation

**Statut** : 📐 plan du 2026-10-09, décidé par Hugo le même jour. Rien n'est bâti.
Touche le jeton de retrait (frontière de sécurité) → `vitruve` avant de bâtir.

## 0. La demande (Hugo, 2026-10-09)

> « le pdf devrait être envoyé à tout le monde » · « le pdf public devrait
> contenir le numéro de téléphone niveau client » · « exemplaire chiffré ne
> devrait pas être marqué » · « j'aurais bien aimé avoir le logo folie coffee à
> gauche du header » · « reçu par non plus » · « ce n'est pas une facture non
> plus, trop de détail pour un particulier » · « le QR de retrait devrait être
> dans le bon » · « oui pour le QR et valide la liste, j'ai besoin qu'on ait un
> bon "public" ».

Liste validée pour le particulier : pas de colonne référence (SKU), pas de
phrase « Aucun numéro de série, aucune mention légale… », pas de « révision N »
au pied, pas de « Sous-total HT » / « Total avant TVA » — articles en TTC, total
TTC, TVA incluse.

QR validé à cette condition : **retrait seulement**, jamais une livraison, et
dans le bon archivé.

## 1. L'existant (ouvert le 2026-10-09)

- Rendu : `apps/lfd-api/src/b2b/orders/domain/services/order-sheet-pdf.ts`
  (`renderOrderSheetPdf(sheet: ClientSheet)`, pdfkit, déterministe, archivé sous
  `orders/<id>/bon-de-commande-r<rev>.pdf` par `order-sheet-archive.service.ts`).
  Son JSDoc « Ce qu'il ne porte pas — Aucun QR » est à réécrire, daté.
- Feuille : `clientSheetOf(order, billedCustomer)` dans
  `b2b/orders/domain/services/order-sheet.ts` ; contrat `ClientSheet` dans
  `packages/contracts/src/order-sheet.ts` (customer = `{ tradeName, legalName }`).
- Un particulier = une commande **sans société** : `OrderView.companyId === null`
  (zéro friction, `packages/contracts/src/order.ts`).
- Le QR existe déjà dans le courriel de confirmation :
  `order-placed-mail.service.ts` pose `handoverUrl = ${adminBaseUrl}/retrait/${token}`
  (`OrderView.handoverToken`) ; la lib `qrcode-generator` est une dépendance de
  l'API.
- Pièce jointe : modèle de `platform/mailer/invoice-issued-mail.ts`
  (`attachments: [{ filename, contentBase64, contentType }]`).
- Logo : `apps/lfd-api/assets/logo-la-folie-coffee-noir-et-blanc.png`.

## 2. Ce qu'on bâtit

### 2.1 Le dessin, pour tous

- Logo à gauche de l'en-tête, « BON DE COMMANDE » et la référence à sa droite.
- Retirés pour tous : « EXEMPLAIRE CHIFFRÉ », la phrase « Exemplaire chiffré —
  destiné au client et à sa comptabilité », « Reçu par : ____ », et
  « La Folie Coffee — B2B » (le logo dit qui émet).
- « Ce n'est pas une facture. » reste, pour tous.

### 2.2 Le bon public (commande sans société)

- La feuille porte une variante explicite (`audience`/`variant: "public"` ou
  un champ `isPublic` dans `ClientSheet` — au bâtisseur de choisir la forme qui
  garde la discrimination au type), dérivée de `companyId === null`, jamais
  devinée au rendu.
- Bloc client : le nom de la personne **et son téléphone** (celui du compte qui
  a passé la commande, lu au moment de construire la feuille ; absent = pas de
  ligne, jamais une valeur inventée).
- Tableau sans colonne référence ; prix TTC.
- Pied de totaux : articles…, remise/bon/livraison/surtaxe s'il y a lieu,
  **Total TTC**, puis « dont TVA x % » ; pas de « Sous-total HT » ni de « Total
  avant TVA ».
- Pied de page : « Ce n'est pas une facture. » et la date d'arrêt, sans
  révision ni phrase sur les mentions légales.
- Le bon pro garde tout le reste tel quel (F5 compris : HT seul au compte).

### 2.3 Le QR de retrait

- Seulement si `fulfillment.method === "pickup"` ET un jeton existe ET l'origine
  admin est configurée ; jamais en livraison (le papier voyage dans le carton).
- Il encode exactement l'URL du courriel (`${admin}/retrait/${token}`) — une
  seule fabrique de cette URL, partagée par le courriel et le bon.
- Le jeton entre dans le PDF archivé : stockage privé, jeton consommé au retrait.
  C'est le risque accepté par Hugo, à écrire dans le JSDoc daté.
- Le déterminisme tient : même jeton, même révision → mêmes octets.
- ⚠️ La clé d'archive porte la révision ; un jeton renouvelé sans nouvelle
  révision servirait l'ancien bon. Le bâtisseur vérifie si le jeton peut
  changer sans révision et le signale.

### 2.4 Le bon joint à la confirmation

- `customer.order-placed` porte le PDF du bon (même document que
  l'archive : lire ou fabriquer via `order-sheet-archive.service`), pour pros et
  particuliers. Un échec de rendu n'empêche pas le courriel de partir (journal
  - courriel sans pièce jointe), comme la facture.

## 3. Tests attendus

- Rendu : public sans SKU ni HT, avec téléphone ; pro inchangé (F5) ; QR présent
  en retrait, absent en livraison et sans jeton ; mentions retirées ; déterminisme.
- Feuille : `companyId === null` → public ; société → pro.
- Courriel : pièce jointe présente ; rendu en échec → courriel sans pièce jointe.

## 4. Hors périmètre

Les bons déjà archivés gardent leur dessin. Le courriel lui-même n'est pas
redessiné.

## 5. Arbitrages après `vitruve` (2026-10-09)

- **Le bon ne change pas après la passation**, vérifié : aucun avenant n'existe
  (`REVISION_WITHOUT_AMENDMENTS = 0`, `order-sheet.ts:60`), et l'acheminement
  n'a aucune commande qui le modifie. Le jeton de retrait est posé une fois, à
  la création (`prisma-order.repository.ts:74`). Un bon archivé reste donc vrai.
- **Le nouveau dessin a sa propre clé** : la clé porte une version de dessin
  (`bon-de-commande-r<rev>-d2.pdf`). Les bons déjà rangés restent servis sous
  leur ancienne clé par rien — on ne les relit plus ; ils restent en stockage
  (pas de suppression). Un test le tient.
- **Fabriquer à la passation** renverse la décision écrite dans
  `order-sheet-archive.service.ts:45-48` (« on écrit à la demande ») : son
  JSDoc est réécrit, daté. Chaque commande écrit un PDF (~50 Ko : logo 16 Ko).
- **Le QR n'élargit aucun droit** : il ouvre `/retrait/<jeton>` du back-office,
  qui exige un membre du staff connecté avec le droit du retrait ; le client
  l'a déjà dans son courriel. Un second retrait est refusé par l'état de la
  commande (`markHandedOver`, course fermée en base) — le bâtisseur le relit et
  le cite. Pas de QR si l'origine admin manque au rendu : le bon gelé n'en aura
  jamais, et c'est dit au journal.
- **Public = commande sans société (`companyId === null`)**, y compris la
  commande personnelle d'un pro : c'est un achat de particulier, réglé à la
  commande ; F5 ne vise que le règlement au compte, qu'une commande sans société
  n'a jamais.
- **Forme** : un champ `variant: "pro" | "public"` sur `ClientSheet` (pas une
  nouvelle `audience` : le bon reste celui du client). Contrat partagé →
  `pnpm test` à la racine.
- **Téléphone** : celui de l'**acheteur** (`placedByUserId`, le client — pas le
  staff qui saisit pour lui), lu à la construction ; absent = pas de ligne. Il
  entre dans l'archive : durée de conservation à décider avec le registre RGPD
  (TODO, pas ce lot).
- **Une seule fabrique de l'URL de retrait**, utilisée par
  `send-order-placed-mail.handler.ts`, `order-placed-mail.service.ts`,
  `order-ready-mail.service.ts` et le bon. La pièce jointe part avec
  `customer.order-placed` (les deux expéditeurs qui le posent) ; un échec de
  rendu ou de lecture → courriel sans pièce jointe, journalisé.
