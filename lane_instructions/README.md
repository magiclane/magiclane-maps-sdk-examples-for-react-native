# Lane Instructions (React Native)

This app builds a route, simulates navigation, and shows the lane-guidance image
at the bottom of the screen.

<img src="screenshot.png" alt="Android: simulated navigation with the lane-guidance image at the first junction, on Schleißheimer Straße; iPhone: the same drive further on, with the lane image of a later junction" width="600">

## What it demonstrates

- Building a route and running `NavigationService.startSimulation`.
- Rendering lane guidance: `NavigationInstruction.getLaneImage(...)` returns a PNG
  byte buffer (`Uint8Array`) converted to a base64 data URI for `<Image>`.

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
