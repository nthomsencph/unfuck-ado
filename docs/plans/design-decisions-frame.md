# Design decisions — GitHub makeover stage 2, global frame (autonomous run, 2026-11-02)

Decisions made on the user's behalf while building
`docs/specs/2026-11-02-github-frame-design.md`. **PROVISIONAL** entries first
in review.

## F1 — Spec written autonomously from four user answers
- **Context:** user chose: keep the rail (restyled), sub-pages in a
  GitHub-style dropdown from rail items, GitHub search box + `/`, release
  after live check. Everything else in the spec is my call.

## F2 — No GitHub logo
- **Decision:** ADO's logo stays (monochrome). Putting GitHub's mark on ADO
  would misrepresent whose product it is; the frame reads as GitHub through
  material, type and icons instead.

## F3 — Header keeps ADO's 48px height
- **Decision:** GitHub's header is 64px, but ADO's sticky page headers and
  scroll containers are positioned against 48px; changing it risks layout
  breakage across every hub for little visual gain.

## F4 — Dropdown links come from ADO's DOM
- **Decision:** no hard-coded hub URL table and no REST; the menu is built
  from ADO's own rendered sub-hub links, so contributed hubs and permission
  differences come along for free.
