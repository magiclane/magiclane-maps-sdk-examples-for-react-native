// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Shows a full-screen background map with a smaller, independent map
// overlapping it.

import React from 'react';
import {View, Text, StyleSheet, StatusBar} from 'react-native';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

// The safe-area insets are known before the maps mount (SafeAreaProvider renders its
// children once it has them), so each map is created at its final size: on Android a
// map whose size changes after it is created stops drawing (Magic Lane engine 0.2.0).
export default function App() {
  return (
    <SafeAreaProvider>
      <OverlappedMaps />
    </SafeAreaProvider>
  );
}

function OverlappedMaps() {
  const insets = useSafeAreaInsets();
  // Two independent GLView instances, exactly like the web demo's two
  // gemKit.createView calls into stacked containers.
  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      {/* Large background map fills the window. */}
      <GLView
        style={StyleSheet.absoluteFill}
        apiToken={GEMKIT_TOKEN || undefined}
        onMapReady={() => {}}
      />
      {/* Title and the smaller overlapped map, near the top-left, both
          below the status bar. */}
      <View
        style={[
          styles.overlaySafe,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
        pointerEvents="box-none">
        <View style={styles.titleBar}>
          <Text style={styles.title}>Overlapped Maps</Text>
        </View>
        <View style={styles.smallMap}>
          <GLView
            style={styles.fill}
            apiToken={GEMKIT_TOKEN || undefined}
            onMapReady={() => {}}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  overlaySafe: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0},
  smallMap: {
    marginTop: 20,
    marginLeft: 20,
    width: '40%',
    height: '35%',
    borderWidth: 2,
    borderColor: '#222',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  fill: {flex: 1},
  titleBar: {
    marginTop: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(69,39,160,0.95)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  title: {color: '#fff', fontSize: 16, fontWeight: '600'},
});
