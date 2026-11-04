# Text Search (React Native)

This app runs a free-text place search around the center of the current map view
and lists the matches; tapping a result highlights and centers the map on it.

<img src="screenshot.png" alt="Android: search result selected, highlighted and centred on the map; iPhone: results for &quot;Museum&quot; listed with their addresses" width="600">

## What it demonstrates

- Searching with `SearchService.search` using `SearchPreferences` (addresses + map POIs) and a reference coordinate taken from the view center via `map.transformScreenToWgs`.
- Rendering results in a native `FlatList` with name and composed address (`AddressField`).
- Highlighting a selected result with `HighlightRenderSettings` / `HighlightOptions` and a search-result pin icon.

The SDK calls are identical to the web example; the only platform difference is
that the map is hosted by the `<GLView>` component instead of a DOM element, and
the chrome (buttons, inputs, result lists) is built from React Native views.

## API token

The map renders without a token (with a watermark); a valid token from [developer.magiclane.com](https://developer.magiclane.com) removes the watermark and unlocks full online functionality. Set it in `App.tsx`:

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
