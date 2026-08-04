# Tea Lab MVP Product Rules

| Field | Value |
|---|---|
| Status | Accepted for implementation |
| Decision date | August 3, 2026 |
| Applies to | Tea Lab foundation and Solo Tasting Session MVP |
| Current production baseline | Vintage Fork Tasting 1.1.0 |
| Architecture decision | [ADR-0001: Tea Lab Data Sources, Ownership, and Privacy Boundaries](./ADR-0001-TEA-LAB-DATA-AND-PRIVACY.md) |
| Release procedure | [Tea Lab MVP Release Runbook](./TEA_LAB_RELEASE_RUNBOOK.md) |

## 1. Decision summary

Tea Lab will extend the authenticated customer workspace without replacing or rewriting the live-event system.

The first release delivers one dependable loop:

> Choose a tea → record the brew → taste and photograph → document → complete → open the card from Journal or Passport

The MVP includes a shared Journal presentation layer, solo tasting sessions, private tasting photos, private manual tea records, structured flavor descriptors, reliable draft recovery, a reusable digital tasting-card view, and a distinct solo Passport seal. Blending, recipes, community data, rewards, barcode scanning, and multi-infusion entry are later releases.

## 2. Product boundary

Tea Lab is the customer's private working space for documenting and revisiting tea knowledge. It is not the application-wide dashboard and does not absorb staff or commerce functions.

Tea Lab includes:

- starting and resuming solo tasting sessions;
- recording tea, brewing, sensory, rating, and private-note information;
- taking or selecting private photos while a solo tasting is in progress;
- reviewing solo and live-event tasting history in one Journal;
- reusing saved and personally entered teas;
- viewing source-specific Passport seals; and
- deleting or archiving customer-owned solo records.

Tea Lab does not include:

- event creation, hosting, trivia, or host-controlled progression;
- account administration or staff analytics;
- shopping cart, checkout, inventory management, or product fulfilment;
- public profiles, public cards, public recipes, or social feeds;
- community aggregation without a separately approved consent system; or
- medical, chemical, safety, or flavor guarantees.

## 3. Canonical terminology

| Term | Meaning | MVP rule |
|---|---|---|
| Tasting session | An occasion during which a customer tastes tea | Solo MVP contains exactly one card; the foundation permits more later |
| Tasting card | The documented experience of one tea inside a session | One card belongs to exactly one session |
| Live-event response | The existing guest/customer response attached to an event flight item | Remains authoritative in the existing event model |
| Personal tea record | A private, reusable description of a manually entered tea | Never becomes a permanent Vintage Fork catalogue tea automatically |
| Canonical tea | A tea maintained by Vintage Fork administrators | Customers may reference but cannot alter it |
| Flavor descriptor | A controlled sensory term with a stable identifier | Used for computational features; private prose remains separate |
| Blend draft | A proposed combination that has not necessarily been brewed | Deferred |
| Recipe version | A preserved, repeatable formula linked to trials | Deferred |

## 4. Source-of-truth rules

1. Existing `events`, `event_flight_items`, `participants`, and `tea_responses` remain the source of truth for live tastings.
2. Tea Lab does not copy, export, re-parent, or rewrite completed live-event responses.
3. New Tea Lab tables are the source of truth only for customer-created Tea Lab sessions.
4. Journal is a read model that presents live-event responses and Tea Lab cards through one customer-facing shape.
5. The permanent `teas` library remains administrator-managed. Manual customer entry creates a private personal tea record.
6. A confirmed server record is the durable source of truth. An offline device record is a protected working copy until synchronization succeeds.
7. Event setup and audit state remain locked under the existing event rules. Existing post-event customer actions, including permitted private-note and saved-tea changes, are not reclassified as immutable event setup.

## 5. Customer access and ownership

- A customer must be signed in to create or synchronize a Tea Lab session.
- Every Tea Lab session, card, personal tea, brew setup, observation, and private note has one owning customer.
- Customers can read and change only their own Tea Lab data.
- Staff access is not implied by a staff role. No staff surface may expose Tea Lab private prose.
- Service-level access may be used only by protected server operations that first authenticate the customer and verify ownership.
- Device drafts must be namespaced by authenticated user so one account cannot see another account's drafts on a shared device.

## 6. Privacy rules

### 6.1 Private by default

The following are private to the owning customer:

- first impressions;
- personal notes;
- manually entered tea details;
- solo brewing records;
- solo ratings and observations;
- incomplete or archived sessions; and
- photos attached to solo tasting cards.

There is no public or community visibility setting in the MVP.

### 6.2 Structured descriptors

Structured descriptors are visible to the owner and may support the owner's future Tea Lab tools. They must not enter community or staff-level aggregation until a separately approved feature provides:

- clear opt-in consent;
- a versioned explanation of the data use;
- a stored consent timestamp and policy version;
- withdrawal behavior; and
- minimum sample-size and de-identification rules.

Private prose is never eligible for flavor aggregation.

### 6.3 Logging and monitoring

Operational logs may contain record IDs, operation types, status codes, timing, and non-sensitive error classifications. Logs must not contain private notes, first impressions, manual tea prose, authentication tokens, or complete request bodies.

## 7. Solo-session lifecycle

The durable session states are:

1. `draft` — created but not yet meaningfully started;
2. `in_progress` — the customer has selected a tea or entered tasting information; and
3. `completed` — the server has accepted the completion requirements.

Archive is represented by `archived_at`; it is not a session state. Deletion removes the record rather than setting a `deleted` state.

Rules:

- The server validates every state transition.
- A completed session has a stable `completed_at` timestamp.
- Repeating the same completion operation returns the already-completed result and does not create another card or seal.
- A customer may correct their own completed solo card. Corrections update its revision but do not change its source, owner, original completion time, or Passport seal class.
- Archiving hides a session from the default Journal view and preserves it for later restoration.
- Permanent deletion cannot be undone.
- Photos may be added or removed only while the solo tasting is in progress. Completion freezes the gallery with the rest of the historical card.

## 8. Completion rules

A solo session can be completed when:

- it has one tasting card;
- the card has a canonical or personal tea reference and a stable tea-name snapshot; and
- the card has a rating from 1 to 5.

The following are optional for completion, but validated when supplied:

- producer, origin, tea type, cultivar, harvest, product identifier, or lot code;
- leaf weight, water volume, water temperature, water source, vessel, or steep time;
- first impression;
- up to five structured descriptors;
- overall intensity; and
- private notes; and
- up to six private JPEG, PNG, or WebP photos, each no larger than 8 MB.

This preserves the rating-based completion rule already used by live tasting while keeping home documentation low-friction.

## 9. Tea selection and personal tea rules

The MVP offers three tea-selection paths:

1. select a tea saved from an existing live tasting;
2. select a Vintage Fork canonical tea available to the customer; or
3. enter a tea manually.

Manual entry:

- requires a tea name;
- creates a private personal tea record;
- may contain optional producer, origin, type, cultivar, harvest, product code, and lot text;
- is reusable in later solo sessions;
- appears in the owner's Library;
- can be archived from Library without changing historical tasting-card snapshots; and
- cannot be promoted into the permanent catalogue without a separate administrator workflow.

Verified batch identity and barcode-to-inventory mapping are deferred. The MVP may store user-entered lot text but must not label it verified.

## 10. Flavor taxonomy rules

- Descriptors have stable identifiers, display labels, categories, aliases, and an active/retired state.
- Existing live responses retain their stored descriptor strings.
- The Journal adapter maps known legacy strings to stable descriptors without rewriting the response.
- Unknown legacy text remains displayable and is marked unmapped for computational use.
- Retiring a descriptor prevents new selection but never erases historical observations.
- The solo selector permits up to five descriptors.

## 11. Journal rules

- Journal displays completed live-event experiences and completed Tea Lab sessions.
- Live events remain grouped as an event containing their tea responses.
- Solo sessions appear as their own session containing one card.
- Each entry has a source-qualified identity, such as `live:<response-id>` or `solo:<card-id>`.
- Journal never creates a second database copy of a live response.
- Drafts appear on Lab, not in the completed Journal.
- Archived solo sessions are excluded by default and available through an archived view.
- Private first impressions and notes are shown only to the owner.
- Each completed tea row provides a right-side **View card** action that opens the same digital card used by Passport.

## 12. Library rules

- The MVP Library replaces the Saved Teas navigation label, not the underlying live-event storage model.
- Existing saved-response flags remain valid.
- The Library read model may group repeated saved references to the same canonical tea without rewriting them.
- A personal tea record is reusable and appears as a private Library item.
- Removing or deleting one live tasting follows the existing participant-scoped deletion behavior; another independently saved reference to the same tea remains valid.
- Saving or remembering a tea never creates a purchase or shopping-cart action.
- Recipes are not shown until the recipe feature ships.

## 13. Passport rules

Passport presentation is derived from completed evidence:

| Seal class | Evidence | MVP treatment |
|---|---|---|
| Live Event Verified | A completed response from the existing controlled live-event flow | Preserve current eligibility and source link |
| Documented Tasting | A completed customer-owned solo card | Add in the Tea Lab MVP |

Rules:

- Solo and live seals must be visibly and textually distinct.
- Retrying synchronization or completion cannot create another seal.
- Archiving a solo session does not remove its seal.
- Permanently deleting a solo session removes its derived seal.
- Selecting a seal opens the completed digital card, including its journal record and private photo slider.
- The MVP does not create points, tiers, rewards, Expert Alignment, or community-status claims.

## 14. Offline and synchronization contract

Tea Lab offline support covers the structured and written solo session, not only private notes. Photo files are the media exception: they require an active connection and are never represented as successfully attached until the private upload is confirmed.

The client must:

- generate stable UUIDs before the first attempted server write;
- persist the current session and an operation outbox in IndexedDB;
- save after each meaningful field change using a short debounce where appropriate;
- display `Saving`, `Saved`, or `Saved on this device` accurately;
- retry on reconnect, foreground return, and subsequent Tea Lab launch;
- keep unsynchronized data when authentication expires and request sign-in before retrying;
- retain a failed or conflicting operation until the user resolves it; and
- clear only the owning user's device data after confirmed deletion.

The server must:

- authenticate every synchronization request;
- verify ownership independently of client payloads;
- accept client-generated record and operation IDs;
- make repeated operations idempotent;
- validate revisions and reject stale conflicting writes explicitly; and
- perform completion atomically.

The MVP does not promise unattended background synchronization after the browser or device has suspended the application.

## 15. Information architecture

The first-release customer navigation is:

| Section | Purpose |
|---|---|
| Lab | Start or resume a solo session and access recent work |
| Journal | Review completed live and solo sessions |
| Library | Review saved canonical teas and personal tea records |
| Passport | Review source-specific tasting seals and open their digital cards |

Blend is added only when the Blender Canvas is functional. Existing upcoming-event access remains available from Lab.

### Release control

- `TEA_LAB_ENABLED` is a server-side feature flag and must not use the `NEXT_PUBLIC_` prefix.
- Missing, `false`, malformed, or differently cased values leave Tea Lab disabled.
- Only the exact value `true` enables Tea Lab code paths.
- Production and Preview keep the flag `false` until the applicable acceptance gates pass.
- Disabling the flag must restore the shipped customer experience without changing or deleting stored data.

## 16. MVP requirements

| ID | Requirement |
|---|---|
| TL-MVP-001 | A signed-in customer can create a solo session |
| TL-MVP-002 | The customer can select a saved/canonical tea or create a private manual tea |
| TL-MVP-003 | The customer can record optional brewing values |
| TL-MVP-004 | The customer can record the compatible tasting core and complete with a rating |
| TL-MVP-005 | Every meaningful change is recoverable from device storage |
| TL-MVP-006 | Synchronization is idempotent and produces exactly one completed card |
| TL-MVP-007 | The completed solo session appears in Journal beside unchanged live history |
| TL-MVP-008 | Passport distinguishes Documented Tasting from Live Event Verified |
| TL-MVP-009 | Archive is reversible and permanent deletion cascades through solo personal data |
| TL-MVP-010 | Cross-customer access is rejected at both application and database boundaries |
| TL-MVP-011 | Private prose is absent from staff analytics and operational logs |
| TL-MVP-012 | Existing guest, host, administrator, recap, deletion, Saved Teas, and Passport workflows regress neither with the feature disabled nor enabled |
| TL-MVP-013 | A customer can take or select up to six private photos during an active solo tasting |
| TL-MVP-014 | Journal and Passport open the same complete digital tasting card and photo slider |

## 17. Release acceptance scenarios

The MVP is not complete until all of these pass:

1. **Known tea:** complete a solo tasting from a saved Vintage Fork tea and find it once in Journal.
2. **Unknown tea:** enter an unlisted tea, complete it, reuse it later, and verify it did not enter the permanent catalogue.
3. **Offline recovery:** start online, go offline, refresh, finish, reconnect, and receive exactly one completed server card.
4. **Expired session:** finish while offline, encounter expired authentication, sign in, and synchronize without losing the draft.
5. **Repeated completion:** send the same completion operation repeatedly and receive one card and one derived seal.
6. **Two tabs:** edit the same session in two tabs and receive a clear revision conflict rather than silent data loss.
7. **Privacy:** prove that another customer and an ordinary staff client cannot read the solo data.
8. **Deletion:** delete a solo session and verify its brew data, descriptors, private notes, photo metadata and objects, local draft, Journal entry, and derived seal are gone.
9. **Live compatibility:** complete and delete a live tasting using the existing workflows without Tea Lab changing their semantics.
10. **Accessibility:** complete the session with keyboard and screen reader at supported zoom and reduced-motion settings.
11. **Private photo card:** add camera and library photos during an active tasting, complete it, open the same card from Journal and Passport, move through the slider, and prove another customer cannot read the metadata or objects.

## 18. Deferred roadmap

The planned order after this MVP is:

1. multi-infusion ledger;
2. two-tea Blender Canvas using stable descriptor evidence;
3. two-component versioned recipes;
4. multi-component blends and recipes;
5. explicitly consented, de-identified community aggregation; and
6. evidence-based reward rules, if validated by real usage.

Barcode scanning may enter when product and lot mapping are operationally reliable. It must never block manual entry.

## 19. Change control

Changes to ownership, privacy, completion, deletion, consent, source-of-truth, or seal semantics require a new or superseding architecture decision record. Interface wording and visual design may evolve without changing these rules.
