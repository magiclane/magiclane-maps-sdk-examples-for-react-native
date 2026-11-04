# Better Route Notification (React Native)

This app builds a route, simulates navigation, and reacts to the engine finding
a faster alternative.

<img src="screenshot.png" alt="Android: simulated navigation further on, 6.3 km before taking the exit, with 28.2 km left; iPhone: the same drive earlier, 1.5 km before a right turn, with 31.1 km left" width="600">

## What it demonstrates

- The simulation callbacks `onBetterRouteDetected`, `onBetterRouteInvalidated` and
  `onBetterRouteRejected`.
- Popping a modal with travel time, delay and time saved when a better route
  appears, plus a live instruction panel and trip-stats bar.

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
