// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Taps select the landmark under the cursor, highlight it, and show its
// name/category.

import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Coordinates} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

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

type Selection = {name: string; category: string; image: string | null};

export default function App() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [selection, setSelection] = useState<Selection | null>(null);

  // Center on Amsterdam, then wire up tap-to-select, mirroring the web demo.
  useEffect(() => {
    if (!gemMap) return;
    gemMap.centerOnCoordinates(
      new Coordinates({latitude: 52.3676, longitude: 4.9041}),
      {zoomLevel: 70},
    );
    gemMap.registerTouchCallback(async (pos: {x: number; y: number}) => {
      await gemMap.setCursorScreenPosition(pos);
      const landmarks = gemMap.cursorSelectionLandmarks();
      await gemMap.resetMapSelection();
      if (landmarks && landmarks.length > 0) {
        gemMap.activateHighlight(landmarks);
        const lm = landmarks[0];
        let image: string | null = null;
        if (lm.getImage) {
          const data = lm.getImage({width: 64, height: 64});
          if (data) {
            image =
              typeof data === 'string'
                ? data
                : `data:image/png;base64,${bytesToBase64(data)}`;
          }
        }
        const category =
          lm.categories && lm.categories.length > 0
            ? lm.categories[0].name
            : 'Location';
        setSelection({name: lm.name, category, image});
        gemMap.centerOnCoordinates(lm.coordinates, {zoomLevel: 70});
      }
    });
    return () => {
      gemMap.registerTouchCallback(null);
    };
  }, [gemMap]);

  const closePanel = () => {
    gemMap?.deactivateAllHighlights();
    setSelection(null);
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
        <View style={styles.overlay}>
          <Text style={styles.header}>Map Selection</Text>
          <Text style={styles.hint}>
            {gemMap ? 'Tap a place on the map' : 'Loading map…'}
          </Text>
        </View>
      </SafeAreaView>
      {selection ? (
        <SafeAreaView style={styles.bottomOverlay} pointerEvents="box-none">
          <View style={styles.panel}>
            <View style={styles.thumb}>
              {selection.image ? (
                <Image source={{uri: selection.image}} style={styles.thumbImg} />
              ) : (
                <Text style={styles.thumbIcon}>📍</Text>
              )}
            </View>
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={1}>
                {selection.name || 'Unnamed'}
              </Text>
              <Text style={styles.category}>{selection.category}</Text>
            </View>
            <TouchableOpacity onPress={closePanel} style={styles.close}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  safeOverlay: {position: 'absolute', top: 0, left: 0, right: 0},
  bottomOverlay: {position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center'},
  overlay: {
    margin: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 5,
    alignItems: 'center',
  },
  header: {fontSize: 18, fontWeight: '700', marginBottom: 4, color: '#333'},
  hint: {color: '#666'},
  panel: {
    margin: 16,
    marginBottom: 30,
    maxWidth: 500,
    width: '90%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 20,
    padding: 16,
    elevation: 6,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#673ab7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImg: {width: 64, height: 64, borderRadius: 16},
  thumbIcon: {fontSize: 28},
  info: {flex: 1, marginLeft: 16},
  name: {fontSize: 18, fontWeight: '700', color: '#222'},
  category: {fontSize: 14, color: '#673ab7', marginTop: 2},
  close: {padding: 8},
  closeText: {fontSize: 18, color: '#666'},
});
