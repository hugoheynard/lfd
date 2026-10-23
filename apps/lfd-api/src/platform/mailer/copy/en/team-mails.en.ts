import type { TeamMailsCopy } from "../model/team-mails.model.js";

/** La famille « équipe », en anglais. Traduction du français, pas une variante. */
export const TEAM_MAILS_EN: TeamMailsCopy = {
  "staff.appointment-booked": {
    kicker: "Appointment",
    subject: "New appointment — {contact} · {when}",
    title: "An appointment has just been booked",
    contactLabel: "Contact",
    whenLabel: "When",
    purposeLabel: "Purpose",
    channelLabel: "Channel",
    cta: "Open the appointment",
    footer: "LFC internal alert — sent to the sales team.",
  },
  "staff.account-alert": {
    kicker: "Account alert",
    subject: "Alert — {company} · {rule}",
    title: "{rule} on {company}",
    accountLabel: "Account",
    orderLabel: "Order",
    cta: "Open the account",
  },
  "staff.invited": {
    kicker: "Invitation",
    subject: "Your access to the La Folie Douce back office",
    title: "Welcome to the team, {firstName}",
    titleWithoutName: "Welcome to the team",
    opened: "Access to the back office has just been opened in your name.",
    choosePassword:
      "All that is left is to choose your password. The link below is valid for 7 days; " +
      "after that, ask an administrator to send you a new one.",
    cta: "Choose my password",
    footer: "Not expecting this email? Ignore it: without a chosen password, no access is opened.",
  },
  "staff.password-reset": {
    kicker: "Password",
    subject: "Your password link — La Folie Douce back office",
    title: "New password, {firstName}",
    titleWithoutName: "New password",
    issued: "A password change link has just been issued for your back-office access.",
    linkRules:
      "It is valid for 7 days and can be used once. If you did not ask for it, your " +
      "current password remains valid: just ignore this message.",
    cta: "Choose a new password",
  },
  "staff.access-suspended": {
    kicker: "Access suspended",
    subject: "Your back-office access is suspended",
    title: "Access suspended, {firstName}",
    titleWithoutName: "Access suspended",
    suspended: "Your access to the La Folie Douce back office has been suspended.",
    whatRemains:
      "Your credentials remain valid: nothing has been deleted, and an administrator " +
      "can reopen the access at any time. Until then, sign-in will be refused.",
    footer: "This email informs you of an access change. It requires no action.",
  },
  "staff.access-restored": {
    kicker: "Access restored",
    subject: "Your back-office access is restored",
    title: "Access restored, {firstName}",
    titleWithoutName: "Access restored",
    restored: "Your access to the La Folie Douce back office is open again.",
    howToSignIn:
      "Sign in with your usual password. If you no longer have it, " +
      "ask an administrator for a link.",
    cta: "Open the back office",
  },
  "staff.production-dossier": {
    kicker: "Production file",
    subject: "Production file — plan for {day}",
    subjectCompleted: "Production file completed — plan for {day}",
    greeting: "Hello {firstName},",
    greetingWithoutName: "Hello,",
    arrested: "The production plan for {day} was locked {by} on {at}.",
    arrestedWithoutAuthor: "The production plan for {day} was locked on {at}.",
    completed:
      "The plan for {day} was completed {by} on {at}: " + "new orders have been added to the bake.",
    completedWithoutAuthor:
      "The plan for {day} was completed on {at}: new orders have been added to the bake.",
    attachment:
      "Please find attached the file to print: a summary of what needs to be made, " +
      "then one slip per order.",
    attachmentWithResupplies:
      "Please find attached the file to print: a summary of what needs to be made, " +
      "then one slip per order and per restock.",
    figures: "In figures: {figures}.",
    figuresPlain: "{orders} and {pieces}",
    figuresSplit: "{orders} — {split} — and {pieces}",
    figuresWithResupplies: "{head} — {resupplies} and {share}",
    ordersWithSplit: "{orders} — {split}",
    pickupShare: "{count} for pickup",
    deliveryShare: "{count} for delivery",
    resupplyPieceShare: "{pieces} including {count} for restock",
    orderOne: "{count} order",
    orderMany: "{count} orders",
    pieceOne: "{count} item",
    pieceMany: "{count} items",
    resupplyOne: "{count} restock",
    resupplyMany: "{count} restocks",
    replacesPrevious: "This file replaces the previous one.",
    signature: "La Folie Coffee — Bakehouse",
    footer:
      "This email is sent automatically each time the plan is locked. To stop receiving it, " +
      "ask the team to remove you from the recipients (Production › Settings).",
  },
  "staff.support-requested": {
    kicker: "Support request",
    subject: "Contact request — {contact} · {purpose}",
    title: "A customer asks to be contacted",
    contactLabel: "Contact",
    purposeLabel: "Purpose",
    availabilityLabel: "Availability",
    phoneLabel: "Phone",
    footer: "LFC internal alert — sent to the sales team.",
  },
  "staff.customer-request": {
    kicker: "Customer request",
    subject: "{form} — {reason} · {author}",
    subjectWithOrder: "{form} — {reason} · {order} · {author}",
    urgentSubject: "[Urgent] {subject}",
    title: "A request came in through “{form}”",
    reasonLabel: "Reason",
    orderLabel: "Order",
    photosLabel: "Photos",
    photosValue: "{count} — to be seen in the back office",
    fromLabel: "From",
    emailLabel: "Email",
    phoneLabel: "Phone",
    originLabel: "From area",
    clientLabel: "Customer",
    cta: "Open the request",
    footer:
      "Replying to this email writes directly to its author. The request is filed in the back office, under Sales › Customer requests.",
  },
  "ops.deploy-check": {
    kicker: "Deployment check",
    subject: "[LFC] Mail operational — {revision}",
    title: "Outgoing mail works",
    revisionLabel: "Revision",
    senderLabel: "Sender",
    message:
      "This email was sent by the deployed backend. Its mere presence here proves that " +
      "the Resend key reaches the container, that the sender is on a verified domain, " +
      "and that the message is delivered.",
    footer:
      "Automatic check message, sent on every deployment. " +
      "If it stops arriving, the email channel is down — even if nothing else says so.",
  },
  "agency.vitrine-notice": {
    kicker: "Showcase notice",
    footer:
      "You are receiving this message as the contact of a subscriber to the La Folie Douce showcase webhook.",
  },
};
