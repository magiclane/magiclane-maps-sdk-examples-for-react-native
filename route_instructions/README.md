# Route Instructions (React Native)

This app calculates a multi-waypoint route (Frankfurt → Karlsruhe → Munich),
renders it, then walks the main route's segments to collect every turn-by-turn
`RouteInstruction` and lists them in a modal.

<img src="screenshot.png" alt="Android: the first instructions of the Frankfurt to Munich route; iPhone: the list scrolled to the last instructions into Munich" width="600">

## What it demonstrates

- Calculating a route through intermediate waypoints with
  `RoutingService.calculateRoute` and styling it with `RouteRenderSettings` /
  `RouteRenderOptions`.
- Extracting instructions from `Route.segments` → `RouteSegment.instructions`.
- Rendering each turn glyph: `RouteInstruction.getTurnImage(...)` returns a PNG
  byte buffer (`Uint8Array`) which is converted to a base64 data URI for `<Image>`.
- Reading `turnInstruction`, `followRoadInstruction` and
  `traveledTimeDistance` per instruction.

## API token

The map renders without a token (with a watermark). A valid token from
[developer.magiclane.com](https://developer.magiclane.com) removes the watermark
and unlocks full functionality. Set it in `App.tsx`:

```ts
const GEMKIT_TOKEN = '<your token>';
```

## Run

Install dependencies first:

```sh
npm install
```

### Android

```sh
npm run android
```

The app is built for the `arm64-v8a` architecture.

To run it on an emulator on a computer with an Intel or AMD processor, which
uses x86_64 system images, add `"x86_64"` to `abiFilters` in
`android/app/build.gradle`:

```groovy
abiFilters "arm64-v8a", "x86_64"
```

### iOS

```sh
cd ios && bundle install && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 bundle exec pod install && cd ..
npm run ios
```

## Notes

The SDK calls are identical to the web example; the only platform difference is
that the map is hosted by the `<GLView>` component (full-window) instead of a DOM
element, with the controls floating on top inside a `SafeAreaView` overlay.
