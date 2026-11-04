# Location Wikipedia (React Native)

This app searches for a landmark, fetches its Wikipedia article through the
SDK's external info service, and shows the title, summary and image in a native
card.

<img src="screenshot.png" alt="Android: the Statue of Liberty article with its title, image and summary; iPhone: the same article scrolled to the end of its summary" width="600">

## What it demonstrates

- Finding a landmark with `SearchService.search`, then checking and requesting Wikipedia content with `ExternalInfoService.hasWikiInfo` / `requestWikiInfo`.
- Reading `wikiPageTitle`, `wikiPageDescription` and `getWikiImageUrl` from the returned `ExternalInfo`.
- Rendering the remote article (text + image) with React Native `ScrollView`/`Text`/`Image` instead of browser DOM - the HTML summary is stripped to plain text for display.

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
