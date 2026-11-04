# Speed Watcher (React Native)

This app builds a route, simulates navigation, and shows a live speed indicator
with the current speed and the posted speed limit, highlighting when speeding.

<img src="screenshot.png" alt="Android: live speed of 50 km/h at a 50 km/h limit; iPhone: live speed on another stretch of the route, at a different posted limit" width="600">

## What it demonstrates

- Subscribing to improved-position updates with
  `PositionService.instance.addImprovedPositionListener` and releasing it with
  `removeListener`.
- Reading `GemImprovedPosition.speed` and `.speedLimit` (m/s → km/h). A `speed`
  of -1 means the position has no speed information; the indicator shows `--`.

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
