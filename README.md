# Magic Lane Maps SDK examples for React Native

Each folder is a standalone React Native app built on
[`@magiclane/maps-sdk-react-native`](https://www.npmjs.com/package/@magiclane/maps-sdk-react-native),
which runs the Magic Lane Maps SDK for TypeScript
([`@magiclane/maps-sdk`](https://www.npmjs.com/package/@magiclane/maps-sdk))
natively on Android and iOS. Most have a web example with the same name in the
[Maps SDK examples for TypeScript](https://github.com/magiclane/magiclane-maps-sdk-examples-for-typescript);
each README says what the app demonstrates.

## Requirements

- Node.js 22.13 or later, an LTS release
- Android: Android Studio with an Android SDK, JDK 17. If the build cannot find
  the SDK, set `ANDROID_HOME`, or put `sdk.dir=/path/to/android/sdk` in the
  example's `android/local.properties`.
- iOS: macOS with Xcode, and CocoaPods through Ruby's bundler

See React Native's
[environment setup](https://reactnative.dev/docs/set-up-your-environment).

## Run an example

```sh
cd hello_world
npm install
npm run android
```

For iOS:

```sh
cd hello_world
npm install
cd ios && bundle install && bundle exec pod install && cd ..
npm run ios
```

`pod install` also fetches the Magic Lane engine for iOS, a Swift package.

## API token

The examples run without a token, with a watermark on the map. A token from
[developer.magiclane.com](https://developer.magiclane.com) removes it and
unlocks online services; set it in the example's `App.tsx`:

```ts
const GEMKIT_TOKEN = '<your token>';
```

## Use the SDK in your own app

```sh
npm install @magiclane/maps-sdk @magiclane/maps-sdk-react-native
```

Then render a map with `<GLView apiToken="…" onMapReady={…} />`; see
`hello_world/App.tsx` and the package README.

## SDK versions

The SDK versions the examples use are set in one place,
[`sdk-versions.json`](sdk-versions.json). After changing it, write them into
every example's `package.json`:

```sh
cd scripts
npm run sync-versions   # Update every example's package.json
npm run check-versions  # Fail if an example differs from sdk-versions.json
```

## Developer Resources

- [TypeScript SDK Documentation](https://developer.magiclane.com/docs/typescript): Detailed guides and API references for the SDK.
- [Magic Lane Developer Portal](https://developer.magiclane.com/api/login): Manage API tokens and create custom styles.
- [Build with AI](https://www.magiclane.com/web/build-with-ai): Accelerate development with AI-powered tools and workflows. Compatible with all AI agents.

## License

```
Copyright (C) 2025-2026 Magic Lane International B.V.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

A copy of the license is available in the repository's `LICENSE` file.

Contact Magic Lane at <info@magiclane.com> for SDK licensing options.
