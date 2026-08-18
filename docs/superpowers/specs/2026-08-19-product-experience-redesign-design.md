# Sochle product experience redesign

## Status

Approved design direction for the web app and browser extension. This specification changes presentation, information hierarchy, and interaction design while preserving the deterministic financial engine, stored audit trail, routes, security boundaries, and decision history.

## Goal

Make Sochle answer one question in under five seconds:

> Does this purchase fit without disturbing the commitments and guardrails I care about?

The normal experience must feel like a calm, premium decision companion. It must not feel like a financial dashboard, Fold client, data-cleaning tool, or engineering console.

## Design read

This is a redesign-overhaul of a private consumer product for one primary owner. The visual language is calm, premium, warm, and quietly playful. The existing सोचle wordmark and forest, cream, and rust identity are evolved rather than replaced.

Design dials:

- Design variance: 5/10. Structured with selective asymmetry.
- Motion intensity: 4/10. Fluid state transitions and tactile feedback.
- Visual density: 4/10. Spacious enough to feel calm, compact enough for repeated use.

## Product principles

1. Answer first. Evidence follows only when requested.
2. Describe consequences, not accounting machinery.
3. Exact money appears only when it helps make a purchase decision.
4. A large spending-room number is never the Home hero or a spending target.
5. One problem produces one clear action.
6. Fold is an implementation detail outside connected-account settings.
7. Auditability remains complete but is intentionally separated from normal use.
8. Motion communicates loading, state change, hierarchy, or success. It is never decoration.

## Current-state audit

### Information architecture

The primary navigation exposes Today, Check, Rules, Decisions, Weekly review, Data, and Money Inbox. This mirrors implementation modules instead of the owner's purchase-decision journey.

### Web presentation

- Every page uses the same generic card, metric grid, and table treatment.
- The Today page leads with raw amounts instead of a reassuring qualitative state.
- Data management, export, deletion, reconciliation, and decision context compete for attention.
- Decision history exposes verdict enums, confidence grades, and timestamps in a dense table.
- Decision detail leads into formula versions, snapshot IDs, source evidence, exclusions, JSON, and a daily forecast.
- Empty and setup states describe missing technical prerequisites rather than guiding the next action.

### Extension presentation

- The extension asks users to inspect extraction confidence and financial confidence.
- Results expose projected liquidity, buffer headroom, source freshness, and internal recovery terminology.
- Product, price, decision, evidence, and outcome controls compete inside one visually flat panel.
- The popup emphasizes connection mechanics and the app origin rather than product readiness.

## Information architecture

Primary navigation:

- **Home**: qualitative daily position, quick purchase check, recent decisions, and genuinely actionable changes.
- **Check**: a focused manual purchase check.
- **Decisions**: purchase checks and recorded outcomes.
- **Settings**: guardrails, connected account, browser extension, privacy, export, deletion, and technical details.

Secondary surfaces:

- **Needs attention** appears only when an unresolved item can materially affect a purchase decision.
- **Weekly reflection** appears as a Home insight and a secondary Decisions view rather than permanent primary navigation.
- **Technical details** is a deliberate advanced disclosure inside Settings and decision detail.

Existing route URLs remain valid. Add a Settings entry point that groups the existing routes without breaking their direct URLs.

## Progressive disclosure

Sochle uses four information levels:

1. **Answer**: the purchase verdict and one clear action.
2. **Consequence**: what stays protected, what changes, and the better date when relevant.
3. **Maths**: a small set of human-readable values used in the decision.
4. **Technical details**: formulas, identifiers, raw audit input, source diagnostics, and immutable evidence.

Levels 1 and 2 form the default experience. Level 3 opens explicitly through **See the maths**. Level 4 is visually separated and never opened by default.

## Home experience

### Hero

The Home hero is qualitative:

> You're in a comfortable spot today.

Supporting copy:

> Your upcoming commitments and safety buffer are covered.

The hero state changes with the calculated position:

- Comfortable: **You're in a comfortable spot today.**
- Trade-off: **You have room, but one plan needs attention.**
- Tight: **Today looks a little tight.**
- Not ready: **Let's confirm one thing before checking.**

No exact spending-room number appears as the headline. A secondary **See today's picture** disclosure may show exact values.

### Content order

1. Qualitative daily position.
2. Quick purchase composer.
3. Today's picture.
4. Recent decisions.
5. Worth knowing.

### Quick purchase composer

The composer contains product name and price with one action: **Does this fit?** It may accept a pasted product URL later, but URL parsing is not part of this redesign.

### Today's picture

Only three concepts appear:

- Comfortable to spend
- Already committed
- Safety buffer protected

These values are secondary context, not targets.

### Recent decisions

Each row shows product, price, human verdict, outcome, and relative time. Formula, confidence, and snapshot columns are removed.

### Worth knowing

This section appears only for actionable changes:

- A commitment is approaching.
- Comfortable room changed materially.
- One input must be confirmed.
- A connected account needs an update.

Optional transaction cleanup never appears here.

## Manual check experience

The Check page is a focused version of the Home composer. It contains:

- A concise title.
- Product name.
- Price.
- One primary action.
- A morphing result surface in the same page.

Rules versions, snapshot timestamps, and prerequisites are not shown in the form. Missing setup becomes a guided action such as **Finish your guardrails** or **Connect your account**.

## Extension experience

### Trigger

The passive सोचle trigger remains available on supported product pages above the configured threshold. It must be visually recognizable without competing with the merchant's purchase controls.

### Detected state

The open panel shows:

- Product image when safely available.
- Product title.
- Detected price.
- One action: **Does this fit?**

Title and price fields become editable only when extraction is incomplete or uncertain. The interface never displays an extraction-confidence grade.

Merchant adapters may return an optional HTTPS product-image URL. The URL must be sanitized and limited to hosts already allowed for the merchant page. Missing imagery must not block a check or reduce the usability of the panel.

### Checking state

The panel morphs into a focused loading state. Short messages rotate without delaying the response:

- **Bills ko side mein rakh ke dekh rahe hain.**
- **Buffer safe rahega ya nahi?**
- **Bas ek second, maths chal rahi hai.**

Reduced-motion mode shows one static message.

### Result state

The result contains:

1. Clear answer.
2. One consequence.
3. Suggested action.
4. Quiet recency note.
5. Outcome actions.

Example:

> **Yes, this fits comfortably.**
>
> Your buffer and upcoming commitments stay protected.
>
> You can buy this without moving another plan.

Outcome actions are **Buy**, **Wait**, and **Pass**. **Not relevant** moves into a secondary menu.

### Maths disclosure

**See the maths** may show:

- After this purchase
- Buffer kept aside
- Commitments already covered
- Better buying date

It must not show projected liquidity, headroom, source freshness, confidence grades, or internal issue names.

### Popup

The popup answers:

- Is Sochle ready?
- Can the current page be checked?
- Where can settings be opened?

The app origin, pairing protocol, threshold explanation, and disconnect controls remain secondary. Errors are rewritten into direct recovery actions.

## Decision history and detail

### History

Dense tables become responsive purchase rows or a compact list. Filters use human labels:

- All
- Considering
- Waiting
- Planned
- Bought
- Passed

### Detail

The default order is:

1. Answer.
2. What buying changes.
3. What remains protected.
4. Suggested next action.
5. Outcome controls.
6. See the maths.
7. Technical details.

Immutable evidence remains available but never dominates the page.

## Settings experience

Settings groups existing capabilities:

- **My guardrails**: safety buffer, essential spending, goals, salary, large-purchase threshold, and forecast window.
- **Connected account**: connection health, last update, update action, and provider-specific actions.
- **Browser extension**: paired browsers and revocation.
- **Privacy and data**: export and deletion.
- **Technical details**: source freshness, reconciliation, audit diagnostics, and provider terminology.

The normal Connected account view says **Ready**, **Updating**, or **Update needed**. Fold is named only where the owner must connect, authorize, refresh, or disconnect it.

## Needs attention

The current Money Inbox is replaced in normal language by Needs attention.

Rules:

- Only material blockers appear in the primary queue.
- Optional transaction cleanup moves to Technical details.
- Each item has a plain title, a one-sentence consequence, and one primary action.
- Raw merchant evidence and JSON are hidden behind Technical details.
- Internal issue type, entity ID, materiality amount, and source identifier are not visible by default.

## Presentation model

UI components must not translate domain enums independently. A shared presentation layer converts decision results and data state into stable user-facing models.

A purchase presentation model contains:

- Tone: comfortable, tradeoff, wait, tight, no, or needs-input.
- Title.
- Consequence.
- Suggested action.
- Recency label.
- Outcome options.
- Optional maths rows.
- Technical-detail reference.

The web app and extension consume the same labels and consequence rules. Domain calculations and persisted audit bundles remain unchanged.

## Language translation

| Internal concept                       | User-facing language            |
| -------------------------------------- | ------------------------------- |
| comfortably_affordable                 | Fits comfortably                |
| affordable_with_tradeoffs              | Fits if you move one plan       |
| wait_until_payday                      | Better after [date]             |
| requires_reducing_investments          | Fits, but it affects your goal  |
| technically_possible_financially_tight | Too tight right now             |
| not_affordable                         | Doesn't fit right now           |
| insufficient_confidence                | We need one detail first        |
| liquid cash                            | Available now                   |
| obligations                            | Already spoken for              |
| buffer headroom                        | Your safety buffer after buying |
| source freshness                       | Last updated                    |
| aging data                             | Good enough for this check      |
| stale or missing source                | Update needed                   |

Forbidden in primary journeys:

- Raw enum names
- Source identifiers such as total_balance
- UUIDs and snapshot IDs
- Formula and rules versions
- Reconciliation and normalization terminology
- Confidence grades
- JSON
- Generic uncaught-error prefixes

## Visual system

### Typography

- Geist Sans is the primary Latin interface face.
- Noto Sans Devanagari supports the सोचle wordmark and Devanagari copy.
- Font assets used by the extension are bundled locally; extension surfaces make no remote font requests.
- Numeric values use tabular figures.
- Display type remains restrained. Product screens do not use cinematic landing-page scale.

### Color

Light theme:

- Canvas: #F3F2EC
- Surface: #FCFBF7
- Primary ink: #162019
- Secondary ink: #5E6861
- Forest action: #183C2A
- Rust accent: #C55A38
- Positive: #2E6A47
- Caution: #8A641F
- Negative: #A33A32
- Border: #DADDD5

Dark theme:

- Canvas: #101511
- Surface: #171D18
- Primary ink: #F0F3ED
- Secondary ink: #AAB3AB
- Forest action: #8FC7A2
- Rust accent: #E47B56
- Border: #2A332C

Forest is the primary interaction color. Rust is the single expressive accent. Status colors retain semantic meaning and are never the only indicator.

### Shape and elevation

- Content surfaces: 16px radius.
- Inputs and compact controls: 10px radius.
- Primary and outcome actions: pill radius.
- Shadows are tinted and reserved for overlays, the extension, and state elevation.
- Flat grouping and whitespace replace unnecessary cards.

### Responsive behavior

- Desktop app content uses a maximum readable width with selective two-column regions.
- Below 768px, every multi-column region becomes a single column.
- Primary navigation becomes a compact mobile navigation pattern.
- Extension width remains bounded and never covers essential merchant controls.
- Viewport-height regions use dynamic viewport units.

## Motion system

Motion communicates state:

- Stateful buttons animate idle, loading, success, and error.
- Purchase result panels morph between input, checking, and result states.
- Numbers roll only when a specific purchase changes a displayed consequence.
- Tabs use a spring-driven active indicator.
- Success confirmations use one short scale-and-fade response.

Implementation adapts only the BeUI Stateful Button, Morphing Modal, Tabs, Number Animation, and Bottom Sheet patterns that materially improve a specified interaction. Needed source is copied into the repository, translated into the existing styling architecture, and restyled to Sochle tokens. Tailwind is not added solely to consume BeUI, and BeUI is not introduced as an opaque runtime dependency.

GSAP scroll pinning, horizontal scroll hijacking, marquees, magnetic controls, and perpetual decorative animation are excluded from product surfaces. Motion respects reduced-motion preferences and animates only transform and opacity.

## Component architecture

Shared web components:

- AppShell
- PrimaryNavigation
- DailyPosition
- PurchaseComposer
- DecisionAnswer
- ConsequenceSummary
- MathsDisclosure
- DecisionList
- AttentionCallout
- EmptyState
- SettingsSection
- StatefulAction

Shared presentation utilities:

- Decision-to-view-model translator
- Data-health-to-label translator
- Relative update label
- Money consequence formatter

Extension components:

- ProductSummary
- CheckState
- DecisionResult
- OutcomeActions
- ExtensionPopupStatus

Interactive motion stays in small client components. Data loading and page composition remain server-rendered where possible.

## State design

### First run

Use **Let's set up your guardrails** and a short guided sequence. Never show missing-snapshot or missing-rules exceptions.

### Loading

Use skeletons shaped like the final interface. Purchase checks use contextual loading copy.

### Ready

Show the answer and consequence before supporting detail.

### Needs attention

Show one plain-language issue and one direct action.

### Unavailable

Explain what the user can still do and provide a recovery action. Never expose raw exceptions.

### Empty

Invite the first meaningful action. Do not render empty tables.

### Success

Confirm locally with restrained motion. Avoid stacked toast notifications.

## Accessibility and performance

- WCAG AA minimum contrast for all controls and text.
- Keyboard access and visible focus for navigation, disclosures, tabs, dialogs, and outcome actions.
- Status is expressed by text and structure, not color alone.
- Reduced-motion behavior is tested for every animated component.
- Touch targets are at least 44px.
- No horizontal document overflow at mobile widths.
- Motion libraries are isolated to interactive leaves.
- Product pages remain server-rendered by default.
- Extension interaction remains responsive on complex merchant pages.

## Testing standard

### Unit

- Every domain verdict maps to the approved human title and consequence.
- Every data-health state maps to an approved user label.
- Forbidden internal terms do not appear in primary presentation models.
- Home qualitative states cover comfortable, trade-off, tight, and needs-input cases.

### Component

- Loading, empty, ready, warning, unavailable, and success states.
- Purchase composer validation and state transitions.
- Result disclosure and outcome actions.
- Reduced-motion behavior.
- Keyboard and accessible-name behavior.

### Integration

- Web and extension use the same presentation rules.
- Technical evidence remains complete but hidden from normal views.
- Existing routes, audit bundles, outcomes, export, deletion, pairing, and authorization remain functional.

### End to end

- First-run setup.
- Home qualitative state and quick purchase check.
- Manual check.
- Amazon India, Flipkart, and Myntra extension checks.
- Comfortable, trade-off, wait, tight, no, and needs-input results.
- Decision history and detail.
- Needs attention recovery.
- Settings, update, extension pairing, export, and deletion.
- Desktop, mobile, popup, and injected-card screenshots.

Browser assertions reject forbidden internal terms in primary journeys. Visual snapshots are reviewed for desktop, mobile, extension popup, and injected product-card sizes.

### Completion gate

The repository testing standard remains mandatory: format, lint, typecheck, migrations, unit, integration, coverage, production build, extension security scan, E2E, accessibility review, reduced-motion review, and responsive screenshot review.

## Rollout sequence

1. Build presentation models, semantic tokens, typography, shared controls, and AppShell.
2. Redesign Home and manual Check.
3. Redesign the extension popup and injected purchase panel.
4. Redesign Decisions, Needs attention, and Settings.
5. Complete copy audit, accessibility, responsive states, visual regression, and live merchant smoke tests.

Each sequence ends with unit, integration, and E2E verification before the next begins.

## Non-goals

- No change to affordability formulas or verdict precedence.
- No change to persisted decision immutability.
- No new financial provider.
- No analytics, multi-user accounts, billing, or notifications.
- No public marketing-site redesign in this phase.
- No decorative GSAP scroll experience inside the product.
- No automatic purchase encouragement based on a large spending-room number.

## Success criteria

- A user can understand the extension answer and suggested action within five seconds.
- Home communicates qualitative financial readiness without turning an amount into a target.
- Normal web and extension journeys contain no raw internal identifiers or engineering terminology.
- Exact financial context is available when requested without dominating the decision.
- The same verdict is described consistently across web and extension.
- First-run, loading, empty, error, stale-data, and success states are intentional.
- All existing security, persistence, and decision tests remain green.
