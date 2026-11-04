# Display Cursor Street Name (React Native)

Tapping the map moves the cursor and reads the name of the street beneath it.

<img src="screenshot.png" alt="Android: tapped street read back: Via San Simpliciano; iPhone: a tap on another street read back: Via Pontaccio" width="600">

## What it demonstrates

- Enabling the on-map cursor with `map.preferences.enableCursor` /
  `enableCursorRender`.
- Moving the cursor to a tapped point with `map.setCursorScreenPosition` and reading
  the street under it with `map.cursorSelectionStreets`.

The SDK usage is the same as on the web; the only platform difference is that the
map is hosted by `<GLView>` and the street name is shown in a React Native pill.

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
