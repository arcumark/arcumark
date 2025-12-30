# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2025-12-31

### Added

- Core timeline editor with keyframes, snapping, transitions/effects, chroma key, text animation, and speed controls.
- Audio editing features, trimming tools, and playback controls (space key).
- Video export and package publishing support.
- Editor controls for position/scale, detailed color customization, and auto-scroll.
- Project management features: bulk import, copy/move, delete/deselect, and project list page.
- New pages and screens: top, about, license, third-party licenses, loading, and ID error.
- Health/metadata/preset APIs and Cloudflare Workers support.

### Changed

- UI refresh with shadcn/ui, component refactors, and updated editor/timeline design.
- Version management improvements.
- Build tooling migration to bun and monorepo consolidation.
- Improved video export performance.

### Fixed

- Project creation, import, and build errors.
- Lint/CI failures and scroll/overflow issues.
- Audio cutting and text overflow bugs.
- Hover/selected/loading color issues.

### Security

- Applied security updates.

[1.0.0]: https://github.com/arcumark/arcumark/releases/tag/v1.0.0
