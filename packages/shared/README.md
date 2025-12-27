# @arcumark/shared

Shared types, validation, and storage abstraction for Arcumark.

## Contents

- **Types**: Timeline, Track, Clip, VideoPreset, MediaRecord, StorageConfig
- **Validation**: Timeline validation logic
- **Presets**: Video export presets
- **Utils**: ID generation utilities
- **Storage**: Storage abstraction layer with File, SQLite, and IndexedDB implementations

## Usage

```typescript
import { Timeline, validateTimeline, VIDEO_PRESETS, createProjectId } from "@arcumark/shared";
import { FileStorage, SQLiteStorage, IndexedDBStorage } from "@arcumark/shared/storage";
```
