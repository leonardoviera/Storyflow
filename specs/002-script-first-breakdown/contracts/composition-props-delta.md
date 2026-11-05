# Contract: Composition props changes (placeholder slate)

This changes `specs/001-local-video-platform/contracts/composition-props.md`. `schemaVersion` stays
`1`: every new field is optional, so existing projects keep the same canonical props and the same
`inputPropsHash`.

## `ClipProps` additions

```ts
ClipProps = { …001 fields…,
  shotId?: string (≤ 32),                       // source shot of a built clip (traceability only)
  placeholder?: { shotId: string (≤ 32), label: string (1–200) },
}
```

## Rules

- **Validation** (`validateTimeline`):
  - A VISUAL clip with `assetId = null` is valid **only** if `props.placeholder` is set.
  - A clip with an `assetId` MUST NOT have `placeholder`. Filling a placeholder removes it.
- **Rendering** (`StoryComposition` VISUAL layer): a placeholder draws a full-frame **slate**:
  - a neutral background from `style.palette[0]`, or `#1F2937` when there is none;
  - a dashed border;
  - the label in the project font, wrapped and centred;
  - a small "IMAGE NEEDED" tag.

  There is no network access, randomness or time dependence (constitution II).
- **Same in preview and render**: the Player and the render worker draw the slate the same way,
  so rough cuts can be rendered before every placeholder is filled (FR-028).
- **TEXT clips** built from a breakdown use the existing `transform`, `background` and `color`
  fields to sit in the lower third. No new field is needed.

## Tests

- **Deterministic frame hashes**: add one reference composition with a placeholder clip and
  record its sampled frame hashes. The existing references must keep their current hashes.
- **Unit**: `validateTimeline` must accept a placeholder clip with a null asset, and reject a null
  asset with no placeholder or a placeholder together with an asset.
