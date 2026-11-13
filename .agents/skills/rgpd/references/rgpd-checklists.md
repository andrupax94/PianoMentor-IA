# RGPD operational checklists

## Processing activity quick map

- Controller / processor / joint controller role
- Data subjects
- Personal data categories
- Special-category or criminal-offence data
- Purposes
- Lawful basis per purpose
- Data sources
- Recipients and processors
- International transfers and safeguards
- Retention period and deletion trigger
- Security measures
- Cookies, SDKs, pixels, local storage, and similar trackers
- Data-subject rights workflow
- Evidence kept for accountability

## Cookie banner / CMP checklist for Spain/EU

Use this checklist when reviewing or generating cookie consent UI. It is implementation guidance, not legal advice.

### First-layer banner

- Appears at the beginning of navigation, before non-essential cookies or trackers are installed.
- Uses clear, concise language and links to the cookie policy / second layer.
- Provides `Accept`, `Reject`, and `Configure` or equivalent settings actions in the first layer.
- Presents accepting and rejecting at the same level: comparable visibility, placement, weight, and effort.
- Does not preselect non-essential categories.
- Does not treat scrolling, inactivity, continuing to browse, or closing the banner as consent.
- Can be closed without forcing a decision; after close, non-essential categories remain disabled unless the user opts in later.
- Does not use a cookie wall unless a compliant, clearly explained equivalent alternative exists and is validated legally.

### Persistent settings access

- A small cookie settings toggle remains always visible.
- Default position: bottom-left corner.
- Safe-area aware position: `left: max(1rem, env(safe-area-inset-left)); bottom: max(1rem, env(safe-area-inset-bottom));`.
- The toggle reopens the preferences panel from any page and allows withdrawal/change as easily as consent was given.
- The toggle is keyboard-focusable, has an accessible name, and remains visible above common page content without covering primary actions.

### Preferences panel

- Separates necessary, analytics, personalization, and marketing/advertising categories, adjusted to the real trackers in use.
- Necessary cookies are described but not switchable when strictly required.
- Each optional category states purpose, responsible party or third-party involvement, retention, and whether profiling/transfers may occur when applicable.
- Includes save choices, reject all, and accept all actions.
- Updates script loading immediately after the user saves preferences.

### Style adaptation to host page

- Inspect and reuse existing design tokens where available: colors, typography, spacing, radius, shadows, borders, focus ring, and z-index scale.
- Prefer CSS variables that inherit from the host page first and fallback safely:
  - `--rgpd-font: var(--font-family, inherit);`
  - `--rgpd-bg: var(--color-surface, Canvas);`
  - `--rgpd-text: var(--color-text, CanvasText);`
  - `--rgpd-primary: var(--color-primary, #2563eb);`
  - `--rgpd-radius: var(--radius-md, .75rem);`
- Scope component selectors with a stable prefix such as `.rgpd-cookie-*` to avoid collisions.
- Support light/dark mode by inheriting host variables or `color-scheme`.
- Preserve accessible contrast and visible focus even when adapting to a brand palette.

### Consent evidence and script gating

- Store consent state by category, timestamp, policy/cookie-table version, and method of collection.
- Minimize identifiers used for consent evidence.
- Gate analytics, personalization, marketing pixels, embeds, and third-party SDKs until the relevant category is accepted.
- Provide a clear place in code for initializing and disabling each non-essential service.

## DPIA/EIPD trigger signals

Recommend DPO/legal validation when processing includes large-scale monitoring, profiling, special-category data, vulnerable people, minors, systematic surveillance, automated decisions with significant effects, new technologies, or data combinations that increase risk.

## Vendor / DPA review points

- Clear processor instructions
- Confidentiality commitments
- Security measures
- Sub-processor approval and notice
- Assistance with rights requests and DPIAs
- Breach notification timelines and content
- Return/deletion after service end
- Audit or assurance rights
- International transfer mechanism

## Incident triage evidence

- Discovery time and reporter
- Systems affected
- Data categories and approximate volume
- Data subjects affected
- Cause and containment actions
- Risk to rights and freedoms
- Notification decision and rationale
- Communications sent
- Remediation and lessons learned
