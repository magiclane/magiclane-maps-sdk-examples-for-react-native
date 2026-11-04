// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Renders the SDK compass image, rotates it as the map rotates, and snaps the
// map back to north-up when tapped.

import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {SdkSettings, EngineMisc} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

// Hermes/JSC in React Native has no global btoa, so encode the raw PNG bytes
// returned by the SDK to a base64 data URI ourselves.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[b2 & 63] : '=';
  }
  return out;
}

// Same call as the web example: fetch the compass icon from the SDK and expose
// it as an <Image> source.
function getCompassImage(): string | null {
  const imgData = SdkSettings.getImageById({
    id: EngineMisc.compassEnableSensorON,
    size: {width: 100, height: 100},
  });
  if (!imgData) return null;
  return `data:image/png;base64,${bytesToBase64(imgData)}`;
}

export default function App() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [compassSrc, setCompassSrc] = useState<string | null>(null);
  const [angle, setAngle] = useState(0);
  const mapRef = useRef<any>(null);

  // When the map is ready, grab the compass image and listen for rotation.
  useEffect(() => {
    if (!gemMap) return;
    mapRef.current = gemMap;
    setCompassSrc(getCompassImage());
    gemMap.registerMapAngleUpdateCallback((a: number) => setAngle(a));
    return () => {
      gemMap.registerMapAngleUpdateCallback(null);
    };
  }, [gemMap]);

  const alignNorth = () => {
    mapRef.current?.alignNorthUp();
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <GLView
        style={StyleSheet.absoluteFill}
        apiToken={GEMKIT_TOKEN || undefined}
        onMapReady={event => {
          if (event.gemMap) {
            setGemMap(event.gemMap);
          }
        }}
      />
      <SafeAreaView style={styles.safeOverlay} pointerEvents="box-none">
        {gemMap ? (
          <TouchableOpacity
            style={styles.compassBtn}
            onPress={alignNorth}
            accessibilityLabel="Align map north-up">
            {compassSrc ? (
              <Image
                source={{uri: compassSrc}}
                style={[styles.compassImg, {transform: [{rotate: `${-angle}deg`}]}]}
              />
            ) : (
              <Text style={styles.compassFallback}>N</Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.overlay}>
            <Text style={styles.status}>Loading map…</Text>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  safeOverlay: {position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'flex-end'},
  overlay: {
    margin: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 5,
    alignSelf: 'center',
  },
  status: {color: '#333'},
  compassBtn: {
    margin: 12,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: {width: 0, height: 2},
  },
  compassImg: {width: 40, height: 40},
  compassFallback: {fontSize: 20, fontWeight: '700', color: '#333'},
});
