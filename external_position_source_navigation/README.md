# External Position Source Navigation (React Native)

This app feeds the engine synthetic GPS fixes through an external data source
and runs real navigation while pushing positions sampled along the route.

<img src="screenshot.png" alt="Android: navigation driven by synthetic GPS fixes from an external data source, 1.9 km from the destination; iPhone: the same drive 1.4 km from the destination" width="600">

## What it demonstrates

- `DataSource.createExternalDataSource([DataType.position])` and
  `PositionService.instance.setExternalDataSource(...)`.
- Producing fixes with `SenseDataFactory.producePosition(...)` and pushing them
  with `dataSource.pushData(...)`.
- Running `NavigationService.startNavigation` with a live instruction panel.

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
