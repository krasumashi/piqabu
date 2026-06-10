# Piqabu Privacy Policy

**Effective: [TO BE FILLED ON PUBLISH]**
**Last updated: [TO BE FILLED ON PUBLISH]**

This Privacy Policy explains what data **Wyetey LTD**, operating under the **Ahtohmoh** brand ("Piqabu", "we"), processes when you use the Piqabu mobile app and related services, why we process it, and your rights over it.

This policy is written to comply with **Ghana's Data Protection Act, 2012 (Act 843)**, and the principles of the EU General Data Protection Regulation (GDPR). Where local law gives you stronger rights, those stronger rights apply.

We collect the minimum we need to operate the service. Where we can avoid collecting personal data, we do.

---

## TL;DR

We collect:

- A random Ghost ID generated on your device.
- Your IP address at the moment of socket connection (held in memory; not persisted to our database).
- The amount and currency of your Pro purchase, plus the transaction reference from Paystack.
- The text of any feedback you submit through Settings → Report Issue.
- An email address — **only if** you choose to provide one at checkout for the Paystack receipt.

We do **not** collect:

- Your real name, phone number, or any other identifier.
- Your message contents (we route them, but we don't read them and we don't persist them past delivery).
- Analytics or telemetry through any third-party SDK. There are no analytics SDKs in the app.
- Crash reports through Firebase or Sentry. There are none.
- Behavioural data — what features you tap, how long you stay, what time of day you use the app.
- Location data — we do not have GPS or location permissions.

---

## 1. What we collect, why, and how long we keep it

### 1.1 Ghost ID

**What it is.** A randomized identifier generated on your device the first time you open Piqabu. On Android 8+, this is derived from your device's `ANDROID_ID` so that clearing app storage does not change it (only uninstalling does).

**Why.** To route messages to your device and to apply your subscription entitlement.

**Where.** Stored on your device (encrypted storage). Sent to our server during socket connection so we can route to you.

**How long.** We keep your Ghost ID in our device registry for as long as you have an active Pro subscription, plus 7 years (for tax record-keeping required by the Ghana Revenue Authority). For Free users, we keep it until 12 months of inactivity, after which it is purged.

### 1.2 IP address at connection

**What it is.** The internet protocol address of your device when it opens a socket connection to our server.

**Why.** Operational. The IP is used by our rate limiter to prevent abuse and by Render's infrastructure to route TCP traffic. We do not store it in our database.

**Where.** Held in memory only by our application server (Render) for the duration of your socket connection. Render's load balancer logs may contain IP addresses for a limited period as part of standard infrastructure operations.

**How long.** Memory-resident only. Render's infrastructure logs are retained per their policy (typically 30 days).

### 1.3 Paystack payment data

**What it is.** When you purchase Piqabu Pro, Paystack (our payment processor) handles your card details. We never see them. After a successful payment, we receive: the transaction reference, the amount, the currency, and the email you supplied at checkout.

**Why.** To grant your subscription, to verify the payment via webhook, and for tax records.

**Where.** Stored in our subscription database (Render).

**How long.** 7 years from the date of payment, as required by Ghanaian tax law.

### 1.4 Email address (optional)

**What it is.** If you provide an email when checking out for Pro, it goes to Paystack as the customer record. If you leave the field blank, we synthesize a placeholder of the form `<first-12-chars-of-ghost-id>@piqabu.live` to satisfy Paystack's requirement. Piqabu does **not** store the email in its own database under any circumstance.

**Why.** Paystack requires an email field on every transaction; it is used by them to issue a receipt.

**Where.** Paystack's records, not ours.

**How long.** Paystack retains it per their own policy. We never have a copy.

### 1.5 Feedback you submit

**What it is.** If you tap **Settings → Report Issue** and submit a message, that message and the Ghost ID it came from are stored in our admin database so our operator can respond to you.

**Why.** Support and improvement.

**Where.** Our admin database (Render).

**How long.** Until you submit a request to delete it, or up to 24 months after resolution, whichever comes first.

### 1.6 Operator audit log

**What it is.** Whenever an operator takes an action (sends a reply to your feedback, blocks a device, toggles maintenance, etc.), we log the action.

**Why.** Internal accountability. We are not the audience for Piqabu's privacy claims; our operators are. The audit log lets us hold them to it.

**Where.** Our admin database.

**How long.** Indefinite (capped to last 500 entries; older entries roll off).

### 1.7 Message contents (rooms)

**What it is.** The text, images, audio, video, and other content you send through a Piqabu room.

**Why.** To deliver them to your conversation partner.

**Where.** Held in memory by the application server only while we are routing them. Image and file uploads are stored in temporary disk storage on Render for at most 30 minutes (room cleanup window), then deleted.

**How long.** Ephemeral. Once the room closes, content is deleted. We do not have a copy of any conversation.

---

## 2. What we do not collect

For clarity, these are absences, not omissions:

- **No third-party analytics SDK.** The Piqabu app does not include Google Analytics for Firebase, Mixpanel, Amplitude, Segment, AppsFlyer, Branch, Adjust, or any equivalent. No event stream leaves your device for advertising or behavioural analytics purposes.
- **No crash analytics.** No Firebase Crashlytics, no Sentry, no Bugsnag. Crashes are not reported back to us.
- **No location data.** The app does not request location permissions.
- **No microphone access without explicit per-feature consent.** Microphone access is requested only when you tap to start a feature that needs it (Whisper PTT, Live Glass with audio).
- **No camera access without explicit per-feature consent.** Same as above.
- **No contacts access.** The app does not request access to your contacts.
- **No advertising identifiers.** We do not read your Android Advertising ID (AAID) or any equivalent.
- **No cross-app fingerprinting.** Our use of Android's `ANDROID_ID` is scoped to our app's signing key; other apps cannot derive the same Ghost ID for the same device.

---

## 3. How we use what we collect

We use the data described above for these purposes only:

1. **Operational** — routing messages, verifying payment, applying subscriptions, blocking abuse.
2. **Support** — responding to feedback you submit through the in-app helpdesk.
3. **Legal compliance** — retaining payment records for tax purposes, responding to lawful requests from Ghanaian authorities (see Section 7).
4. **Service improvement** — limited to aggregate counts (lifetime devices, active users by day) computed from data we already collect for operational reasons. No per-user behavioural tracking.

We do not use your data for:

- Targeted advertising.
- Profile building.
- Sale to third parties.
- Training of machine learning models that exit our infrastructure.

---

## 4. Who we share data with

We share data with the minimum number of third parties needed to operate. As of this policy's effective date, those are:

| Third party | Why we use them | What they receive | Their location |
|---|---|---|---|
| **Paystack** | Payment processing | Transaction details, email at checkout, your IP at checkout | Nigeria / Ghana (Africa-based) |
| **Render** | Application hosting | All operational traffic + persistence | United States |
| **GitHub** | APK distribution | Anonymous download counts of our APK release assets | United States |
| **Cloudflare / Netlify** | Landing site hosting (piqabu.live) | Visits to our landing pages (per their analytics tier) | United States |

We do not sell data to data brokers. We do not share data with advertising networks.

We may share data with a successor entity in the event of a merger, acquisition, or sale of substantially all our assets, subject to the new entity honouring this policy or providing you with notice and an opportunity to delete your data.

---

## 5. Your rights

Under Ghana's Data Protection Act, 2012 and where applicable under the GDPR, you have the following rights with respect to your personal data:

- **Access** — request a copy of what we hold about you.
- **Correction** — request that we correct inaccurate data.
- **Deletion** — request that we delete data tied to your Ghost ID. We will honour this subject to legal retention obligations (Paystack records must be retained for 7 years).
- **Restriction** — request that we stop a specific use of your data.
- **Portability** — receive your data in a structured machine-readable format.
- **Objection** — object to a specific use of your data.

To exercise any of these rights, email **privacy@piqabu.live** with your Ghost ID (find it in Settings). We will respond within 30 days. We may ask you to confirm a deletion request through a piece of evidence proving control of the Ghost ID (e.g., a short message sent from the app at a time we specify).

You also have the right to lodge a complaint with the **Ghana Data Protection Commission** (dataprotection.org.gh) if you believe we have mishandled your data.

---

## 6. Children

Piqabu is not directed at children under 18. We do not knowingly collect data from anyone under 18. If we discover that a user is under 18, we will block the device and remove any associated data we hold.

---

## 7. Government and law enforcement requests

We may receive requests from government and law enforcement agencies for user data. Our [Law Enforcement Response Policy](./law-enforcement.md) describes how we respond. In short:

- We require valid legal process (warrant, subpoena, or equivalent) issued under Ghanaian law.
- We produce only what we have. By design, that is very little (Ghost ID, connection timestamps, payment records).
- We do not have message contents to produce.
- Where lawful, we notify the affected user.
- We publish periodic transparency reports summarizing the requests we receive.

---

## 8. Security

We protect data using the following measures:

- **Encryption in transit** — all network traffic between the app and our server is encrypted using TLS 1.2 or higher.
- **Encryption at rest** — Ghost IDs and Pro entitlement flags on your device are stored in encrypted SharedPreferences, backed by the Android Keystore on supported devices.
- **Access controls** — only authorized operators can access the admin dashboard, and every action is logged.
- **Minimisation by design** — we built the system around not collecting things we don't need.

No security measure is perfect. If we become aware of a data breach affecting your information, we will notify you and the Data Protection Commission as required by law.

---

## 9. International data transfers

Our application server is hosted in the United States via Render. By using Piqabu you consent to your data being processed in the United States, which is outside the European Economic Area. The United States may have data protection standards different from those in Ghana or the EEA.

We have selected providers that contractually commit to security and confidentiality standards consistent with this policy.

---

## 10. Changes to this policy

We may revise this policy. When we do, we will update the "Last updated" date at the top and, for material changes, surface a notice in the app. Continued use of Piqabu after a material change is your acceptance of the revised policy.

---

## Contact

For questions about this policy or to exercise any of the rights described in Section 5:

Wyetey LTD
**privacy@piqabu.live**
[Registered office address — TO BE FILLED]
Republic of Ghana

For a complaint:
**Ghana Data Protection Commission**
dataprotection.org.gh
