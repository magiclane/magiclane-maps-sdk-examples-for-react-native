# Multiview Map (React Native)

This app shows up to four independent map views in a grid, added and removed at
runtime with the app-bar buttons.

<img src="screenshot.png" alt="Android: four independent map views in the grid; iPhone: the four views panned to different areas" width="600">

## What it demonstrates

- Hosting several independent maps at once - one `<GLView>` per grid cell, the RN
  equivalent of the web demo's per-container `gemKit.createView` calls.
- Adding/removing views dynamically (capped at four).

The SDK usage is the same as on the web; the only platform difference is that each
map is a `<GLView>` laid out in a flex grid instead of a DOM grid.

## API token

The maps render without a token (with a watermark). A token from
[developer.magiclane.com](https://developer.magiclane.com) removes it. Set it in
`App.tsx`:

```ts
const GEMKIT_TOKEN = '<your token>';
```

## Notes

- A `<GLView>` smaller than the full window is expected here, since each map shares
  the screen. On some Android devices multiple simultaneous GL surfaces are
  resource-heavy; reduce the number of views if rendering stutters.

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
