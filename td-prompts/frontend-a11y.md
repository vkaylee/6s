# Target
Own `web/biome.json`, `web/src/components/GlobalDialog.tsx`, `FilterDrawer.tsx`, `LocationCombobox.tsx`, `StatusBar.tsx`, related accessibility tests. Do not redesign App or change API transport.

# Change
Re-enable disabled Biome a11y rules. Implement accessible dialog/drawer semantics, focus trap, Escape close, restore focus, labelledby/aria-modal. Implement combobox/listbox/option semantics, active descendant, keyboard navigation, labels. Add aria-label/sr-only text for icon-only controls. Use existing dependencies; no new library unless already installed.

# Acceptance
Lint passes with rules enabled. Keyboard and screen-reader semantics are testable. Focus never escapes open modal/drawer. Locale strings use i18n. Commit owned files; report any design-system rule that cannot be satisfied without a separate dependency decision.