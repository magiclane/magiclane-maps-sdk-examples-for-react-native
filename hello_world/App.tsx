// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Shows the bare minimum: initialize the SDK and display a map.

import React, {useState} from 'react';
import {View, Text, StyleSheet, StatusBar} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

export default function App() {
  const [gemMap, setGemMap] = useState<any>(null);

  // The web demo initializes the SDK and appends a DOM map view. Here the
  // <GLView> component does both: passing apiToken initializes the SDK, and
  // onMapReady hands back the GemMap once the surface is live. GLView fills the
  // whole window (absoluteFill), so its size is final from the first render: on
  // Android a map whose size changes after it is created stops drawing.
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
          <Text style={styles.header}>Hello World</Text>
          <Text style={styles.status}>
            {gemMap ? 'Map Ready' : 'Loading map…'}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  safeOverlay: {position: 'absolute', top: 0, left: 0, right: 0},
  overlay: {
    margin: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 5,
    alignItems: 'center',
  },
  header: {fontSize: 18, fontWeight: '700', marginBottom: 8, color: '#333'},
  status: {marginTop: 4, color: '#333'},
});
