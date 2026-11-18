# ADR-0003: DM phone app with React Native / Expo

- **Status:** Superseded by ADR-0013
- **Date:** 2026-11-16

## Context
The phone app is mainly an offline planning tool (notes, wiki, light map prep) for Android and iOS. It may use a different technology than the desktop.

## Options considered
1. **React Native / Expo** – TypeScript, shares `core`/`schema`/`storage`/`protocol`; mature mobile platform.
2. **Tauri Mobile** – one codebase with desktop. Con: mobile support younger.
3. **Flutter** – excellent mobile UI. Con: no code sharing (Dart).
4. **Native Kotlin/Swift** – best integration. Con: two apps.

## Decision
Option 1, using Expo dev builds (native modules for folder access).

## Consequences
Mobile cannot use `renderer`/`ui` (web); map view uses React Native Skia. iOS builds need a Mac and an Apple Developer account.
