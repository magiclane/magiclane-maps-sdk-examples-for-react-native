# Map Gestures (React Native)

This app listens for every map gesture and shows the latest one in a pill at the
bottom.

<img src="screenshot.png" alt="Android: a two-finger rotation reported as Rotate Map; iPhone: a one-finger pan reported as Pan Map" width="600">

## What it demonstrates

- Registering the full set of map gesture callbacks: `registerTouchCallback`,
  `registerMoveCallback`, `registerLongPressCallback`, `registerDoubleTouchCallback`,
  `registerPinchCallback`, `registerShoveCallback`, `registerSwipeCallback`,
  `registerPinchSwipeCallback`, `registerTwoTouchesCallback`,
  `registerTouchPinchCallback`, and `registerMapAngleUpdateCallback`.
- Cleaning the listeners up with a `useEffect` cleanup.

The SDK usage is the same as on the web; the only platform difference is that the
map is hosted by `<GLView>` and the gesture label is shown with React Native views
instead of a DOM overlay.

## API token

The map renders without a token (with a watermark). A token from
[developer.magiclane.com](https://developer.magiclane.com) removes it. Set it in
`App.tsx`:

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
