# Address Search (React Native)

This app resolves an address step by step - country, then city, street and house
number - using the guided address search service, then highlights and centers
the map on the final result.

<img src="screenshot.png" alt="Android: guided search resolved to Carrer de Mallorca 401, Barcelona, with the map centred on it; iPhone: the same result with the map panned north over the city" width="600">

## What it demonstrates

- Running a hierarchical guided address search with `GuidedAddressSearchService.getCountryLevelItem` and `GuidedAddressSearchService.search` across `AddressDetailLevel` (city → street → house number).
- Highlighting the resolved landmark with `map.activateHighlight` and animating the camera with `map.centerOnCoordinates` + `GemAnimation`.
- Showing each resolved level in a native results list.

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
