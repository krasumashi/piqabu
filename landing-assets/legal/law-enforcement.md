# Law Enforcement Response Policy

**Effective: [TO BE FILLED ON PUBLISH]**

This policy describes how **Wyetey LTD** responds to requests for user data from government and law enforcement agencies.

We have written it for two audiences: (1) law enforcement officials who need to know how to validly request data from us, and (2) Piqabu users who want to know what we will and won't do under legal pressure.

We are committed to lawful cooperation. We are equally committed to honest disclosure of what we have, and what we don't.

---

## 1. The short version

- We require **valid legal process** issued by a court in Ghana or competent authority, properly served on us at the address below.
- We produce **only data we actually hold**. By design, that is very little: a Ghost ID, connection timestamps, payment records.
- We **do not have message contents**. The product is built so message contents are ephemeral and not persisted past delivery. We cannot produce what we don't have.
- We **notify affected users** of the request when not prohibited by law from doing so.
- We **publish a Transparency Report** twice a year summarising the requests we received.

---

## 2. What we can produce

The complete list of data tied to a Ghost ID that we can typically produce on lawful request:

| Item | Available? | Notes |
|---|---|---|
| Ghost ID itself | Yes | The opaque identifier |
| First-seen timestamp | Yes | When the device first connected to our service |
| Last-seen timestamp | Yes | When the device most recently connected |
| Subscription tier | Yes | Free or Pro, and Pro expiry date if applicable |
| Payment records | Yes | Transaction reference, amount, currency, date — **for Pro purchases only** |
| Email used at Paystack checkout | No | Not stored by Piqabu (held by Paystack) |
| Real name, phone number, address | No | Never collected by Piqabu |
| IP address history | Generally no | We do not persist IP addresses to our database. Render's infrastructure logs may contain IP records for a limited time per their policy |
| Message content (text) | No | Ephemeral, not persisted past delivery |
| Image / file content | No | Stored on disk for at most 30 minutes during room lifetime, then deleted |
| Voice / audio content | No | Streamed peer-to-peer via WebRTC; not stored on our servers |
| Video / Live Glass content | No | Streamed peer-to-peer via WebRTC; not stored on our servers |
| Conversation history / who-talked-to-whom | No | Rooms are torn down after sessions close; no log retained |
| Location data | No | Never collected |
| Contact list | No | Never collected |
| Device fingerprint beyond Ghost ID | No | Not collected |

For Paystack-specific records (e.g., the card type used, the IP at checkout, etc.), the request should be directed to Paystack, not to us.

---

## 3. What we require

We will respond to requests that meet **all** of the following criteria:

1. **Valid legal process.** A subpoena, court order, warrant, or equivalent legally enforceable instrument, issued by a court or competent authority with proper jurisdiction.
2. **Identification of the requester.** A clearly identified law enforcement officer, prosecutor, or court — with badge / role / credential information sufficient for us to verify.
3. **Specificity.** A specific Ghost ID, transaction reference, or other unambiguous identifier. We will not respond to "fishing" requests that ask for all users meeting vague criteria.
4. **Service.** Properly served on us at **legal@piqabu.live** or at our registered office.
5. **Compliance with applicable law.** The request must comply with the relevant Ghana law and, if applicable, with international comity (for foreign requests, typically via MLAT).

We will challenge requests that do not meet these requirements.

---

## 4. Emergency requests

In genuine emergencies — credible imminent threat of death or serious physical injury — law enforcement may make an emergency request without a court order, provided that:

- The request is made in writing on official letterhead by a sworn officer.
- The request describes the emergency in specific terms.
- The request seeks only the minimum data needed to address the emergency.

We may respond to emergency requests at our discretion, **subject to retroactive validation** by a court order within 7 days. We document every emergency request in our Transparency Report.

---

## 5. User notification

Our default position is to **notify users when their data is sought**, so they have an opportunity to challenge the request through their own counsel.

We will **not** notify in the following circumstances:

- The legal process explicitly prohibits notification (gag order, sealed warrant).
- A specific risk of physical harm to a person would arise from notification.
- The notification itself would obstruct an active investigation we are required to facilitate.

We aim to notify within 7 days of producing data, where lawful.

---

## 6. Foreign law enforcement requests

Piqabu is operated by a Ghana-registered company. We do not respond to direct requests from foreign law enforcement agencies. Foreign requests must be channeled through:

- A **mutual legal assistance treaty (MLAT)** request between the requesting country's authorities and Ghana's Ministry of Justice.
- An **emergency request** from a recognised foreign agency under Section 4, which we may consider at our discretion.

We will provide data in response to foreign requests only after legal review in Ghana.

---

## 7. Civil legal process

For civil cases (defamation, divorce, breach of contract, etc.), we respond only to subpoenas served on us in accordance with civil procedure rules in Ghana. We will not produce user data on the strength of informal requests.

We may charge a reasonable administrative fee for processing civil subpoenas.

---

## 8. Limits on cooperation

To be clear about what we will not do:

- We will **not** build new logging or data-collection capability to comply with a request that would otherwise lack data. The system we have is the system we have.
- We will **not** install monitoring or surveillance software on user devices on behalf of any agency.
- We will **not** weaken the privacy posture of the service to facilitate present or future requests.
- We will **not** provide bulk data, "all users matching pattern X" data, or anything other than data tied to specifically identified Ghost IDs.

If law would compel any of the above, we will pursue all available legal remedies before complying, including challenge in court.

---

## 9. Transparency Reports

We publish a **Transparency Report** every six months (January and July), summarising:

- The number of legal requests received in the period.
- A breakdown by request type (criminal subpoena, civil subpoena, court order, emergency request, MLAT).
- The fulfillment rate (requests responded to vs. challenged vs. produced no data).
- A warrant canary statement (see Section 10).
- Comparable year-over-year statistics.

The most recent report is at [piqabu.live/transparency](https://piqabu.live/transparency) (when published).

---

## 10. Warrant canary

Each Transparency Report will include a statement of the form:

> "As of [date], Wyetey LTD has not received any national security letter, court order, or other instrument requiring us to take action that we have been forbidden from disclosing in this report."

If a future report omits this statement, that omission is meaningful.

---

## Contact

For legal process and law-enforcement correspondence:

Wyetey LTD
Attention: Legal Department
[Registered office address — TO BE FILLED]
Ghana

**legal@piqabu.live**

Acknowledgement of receipt: within 5 business days. Production of records: typically within 30 days unless the request specifies a shorter or longer window.
