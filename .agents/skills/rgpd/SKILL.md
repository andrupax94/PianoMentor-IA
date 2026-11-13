---
name: rgpd
translation: RGPD
summary: Asiste en revisiones de privacidad, cookies y protección de datos bajo RGPD/LOPDGDD sin sustituir asesoría legal.
description: "Trigger: RGPD, GDPR, privacidad, cookies, banner de cookies, CMP, protección de datos, LOPDGDD, DPIA, DPA. Guía revisiones, UX de consentimiento y documentación de cumplimiento."
license: Apache-2.0
metadata:
  author: senasdesktop
  version: "1.1.0"
---

## Activation Contract

Use this skill when the user asks for help with RGPD/GDPR, LOPDGDD, privacy notices, cookies, consent banners/CMPs, data processing agreements, records of processing, DPIA/EIPD, data subject rights, retention, processors, transfers, or privacy-by-design reviews.

Do not present outputs as legal advice. State when legal counsel or the DPO should validate conclusions, especially for high-risk processing, special-category data, international transfers, minors, automated decisions, regulatory complaints, or final public legal wording.

## Hard Rules

- Work in the user's language and jurisdiction context; default to Spain/EU when unspecified.
- Separate facts, assumptions, risks, and recommendations.
- Ask for missing essentials only when needed: controller/processor role, data categories, purposes, legal bases, recipients, retention, transfers, security measures, cookies/trackers, and data-subject flows.
- Prefer official and current sources for legal claims; if browsing is available, verify recent regulatory changes before final legal wording.
- Minimize personal data in examples; use placeholders or synthetic data.
- Flag uncertainty clearly and avoid guaranteeing compliance.
- For consent UX, never recommend dark patterns, forced acceptance, preselected non-essential choices, or cookie walls without a valid equivalent alternative.

## Decision Gates

| Situation | Action |
|---|---|
| New product/feature | Run privacy-by-design review and identify data flows, purposes, legal bases, retention, processors, transfers, and risks. |
| Privacy notice/cookies | Check transparency, layered information, consent needs, analytics/marketing separation, reject/accept parity, configuration, and withdrawal paths. |
| Cookie banner/CMP implementation | Apply the cookie UX contract: initial banner at first navigation, closable without forcing acceptance, persistent bottom-left settings toggle, equal visibility for accept/reject, and style adaptation to the host page. |
| Processor/vendor | Review DPA clauses, sub-processors, international transfers, security, breach support, audit rights, and deletion/return. |
| High-risk processing | Recommend DPIA/EIPD, DPO/legal review, mitigations, and residual-risk decision. |
| Security incident | Produce a triage checklist, timeline, evidence log, notification decision path, and communications draft. |

## Cookie Banner / CMP UX Contract

When asked to design, review, or implement a cookie banner for Spain/EU, use this default unless the user provides stricter requirements:

1. **Show at the start of navigation**: display the first-layer banner when the user first enters the site or when consent must be refreshed. Do not install non-essential cookies before a valid choice.
2. **Do not force the user**: the site must remain usable unless a lawful, properly explained alternative exists. Do not block navigation just to obtain acceptance.
3. **Offer balanced actions**: show `Accept`, `Reject`, and `Configure`/`Settings` controls in the same layer. Accepting and rejecting must be equally easy and comparably visible.
4. **Closable banner**: allow closing/dismissing the banner without treating the close action as consent. After closing, keep non-essential cookies disabled unless the user later opts in.
5. **Persistent preference access**: keep a small, always-visible toggle/button for cookie settings in the **bottom-left** corner. It must reopen the preferences panel and allow withdrawal/change of consent as easily as giving it.
6. **Granular preferences**: separate at least necessary, analytics, personalization, and marketing/advertising categories. Necessary cookies are informational only; non-essential categories default to off unless valid consent exists.
7. **Host-page styling**: adapt the banner and toggle to the page where the skill output will be used. Reuse design tokens, CSS variables, fonts, border radii, spacing scale, color palette, focus styles, light/dark mode, and z-index conventions. If tokens are unavailable, infer a conservative visual match from the existing CSS and expose variables for overrides.
8. **Accessibility**: ensure keyboard operation, visible focus, ARIA labels, sufficient contrast, readable text, and no focus traps that prevent normal use.
9. **Evidence**: recommend logging consent state, timestamp, version of policy, categories chosen, and method, while minimizing identifiers.
10. **Review note**: label code and text as implementation guidance; request legal/DPO validation before production when wording or consent model is material.

## Implementation Preferences for Generated Code

- Prefer framework-agnostic, progressively enhanced HTML/CSS/JS unless the user names a stack.
- Encapsulate styles with a predictable namespace such as `.rgpd-cookie-*`, but inherit page variables first.
- Use CSS variables with host-friendly fallbacks, e.g. `--rgpd-bg: var(--color-surface, Canvas);` and `--rgpd-font: var(--font-family, inherit);`.
- Keep the settings toggle compact and unobtrusive, fixed at `left: max(1rem, env(safe-area-inset-left)); bottom: max(1rem, env(safe-area-inset-bottom));`.
- Do not create a full-screen modal by default. If a preferences panel is needed, prefer a non-blocking drawer/popover that can be closed and reopened from the toggle.
- Never wire “close”, “continue browsing”, scroll, or inactivity as acceptance.
- Document where non-essential scripts should be gated so they load only after category consent.

## Execution Steps

1. Define the scope: organization role, processing activity, system boundaries, jurisdiction, intended output, and whether cookies/trackers are involved.
2. Build a concise processing map: data subjects, personal data, special categories, purposes, lawful bases, recipients, processors, transfers, retention, cookies/trackers, and security controls.
3. Evaluate RGPD principles: lawfulness, fairness, transparency, purpose limitation, minimization, accuracy, storage limitation, integrity/confidentiality, and accountability.
4. For cookie/CMP work, evaluate the UI against the Cookie Banner / CMP UX Contract before drafting or changing code.
5. Identify gaps and rank them by impact and urgency.
6. Produce practical artifacts: checklist, risk table, clauses, register entry, DPIA outline, privacy notice draft, cookie banner spec/code, or implementation tasks.
7. Add validation notes: assumptions, required evidence, official sources to verify, and legal/DPO review triggers.

## Output Contract

Return:
- Scope and assumptions.
- Findings grouped by risk level.
- Concrete remediation tasks with owners or evidence needed when possible.
- Cookie/CMP outputs that explicitly state: initial banner behavior, close behavior, persistent bottom-left toggle, preference categories, script-gating points, and style-adaptation strategy.
- Draft text only when requested, marked as a draft for review.
- A final note that the output is operational guidance, not legal advice.

## References

- `references/rgpd-checklists.md` — operational checklists and artifact templates.
