# Search Category (React Native)

This app filters a POI search around the center of the current map view by one
or more generic categories (plus an optional text filter) and lists the matches;
tapping a result highlights and centers the map on it.

<img src="screenshot.png" alt="Android: results for &quot;Paris&quot; with the Food and Drink category; iPhone: POI results filtered by the Parking category" width="600">

## What it demonstrates

- Loading the generic category list from `GenericCategories.categories` and rendering selectable native chips.
- Restricting `SearchService.searchAroundPosition` to the chosen categories via `SearchPreferences.landmarks.addStoreCategoryId`.
- Highlighting a selected result and centering the camera on it.

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
