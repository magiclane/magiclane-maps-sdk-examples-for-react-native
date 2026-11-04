# Public Transit Stop Schedule (React Native)

Tapping a public-transport stop on the map opens its schedule in a bottom sheet:
the departing trips, and the stop times for a selected trip.

<img src="screenshot.png" alt="Android: Sagrada Família stop with its L5 departures; iPhone: stop times of a selected trip" width="600">

## What it demonstrates

- Selecting a stop overlay item with `map.cursorSelectionOverlayItemsByType(CommonOverlayId.PublicTransport)` and querying `OverlayItem.getPTStopInfo`.
- Resolving the stop's local time with `TimezoneService.getTimezoneInfoFromCoordinatesSync` to compute minutes-to-departure.
- Rendering trips (`PTTrip` / `PTRouteInfo` / `PTRouteType`) and their `PTStopTime` entries in a native bottom sheet.

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
