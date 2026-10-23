# Design sources used by LARP

Adopted 23 October 2026.

- **shadcn/ui**: Button, Card and Badge source retrieved from the upstream `apps/v4/registry/new-york-v4/ui/` directory. Adapted the `cn` import to the local utility. MIT notice: `public/licenses/shadcn-ui.txt`. Repository: https://github.com/shadcn-ui/ui.
- **Tailark**: SaaS hero composition adapted from `registry/bases/radix/dusk/blocks/hero-section/one/hero-section.tsx`. Replaced Next.js links/images and unrelated customer logos with LARP navigation, copy and interactive product preview. MIT notice: `public/licenses/tailark.txt`. Repository: https://github.com/tailark/blocks.
- **Magic UI**: BlurFade retrieved from https://magicui.design/r/blur-fade.json. Added reduced-motion handling and use it on the marketing page, not security controls. MIT notice: `public/licenses/magic-ui.txt`. Repository: https://github.com/magicuidesign/magicui.
- **React Flow**: Installed `@xyflow/react` for the read-only device dependency view. Retained its on-canvas attribution. MIT notice: `public/licenses/react-flow.txt`. Repository: https://github.com/xyflow/xyflow.
- **Shadcn Admin**: Layout reference for navigation spacing, dashboard summary cards and task density. No template source, router, identity system or sample records were copied. Repository: https://github.com/satnaing/shadcn-admin.
- **Manrope**: Bundled through `@fontsource-variable/manrope`, with its font license in `public/licenses/manrope.txt`.

Tremor and 21st are optional research candidates and were not installed. The existing shadcn MCP and Context7 were used; this change does not register a new global MCP server or provision a paid design service.

The dependency lockfile records installed library versions. Upstream source snapshots are retained in the local component files; upgrading them is a deliberate code change, not a runtime fetch.
