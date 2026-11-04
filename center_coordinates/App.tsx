// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// The map logic (Coordinates + centerOnCoordinates) is identical to the web
// demo; only the host differs: the web demo appends a DOM view, while here the
// map is the <GLView> component. SDK initialization is zero-touch - passing
// apiToken to <GLView> initializes the SDK, so no GemKit.initialize call is
// needed.

import React, {useEffect, useRef, useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, StatusBar} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Coordinates} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

export default function App() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [status, setStatus] = useState('Loading map…');
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (messageTimer.current) clearTimeout(messageTimer.current);
    },
    [],
  );

  const showMessage = (message: string) => {
    setStatus(message);
    if (messageTimer.current) clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => setStatus(''), 3000);
  };

  // Same call as the web example: center on Rome, Italy at zoom level 60.
  const centerOnRome = () => {
    if (!gemMap) {
      showMessage('Map not ready yet');
      return;
    }
    const rome = Coordinates.fromLatLong(41.902782, 12.496366);
    gemMap.centerOnCoordinates(rome, {zoomLevel: 60});
    showMessage('Centering on Rome, Italy');
  };

  // GLView is an absolute full-screen layer, so its size is final from the
  // first render, and the controls float on top inside a SafeAreaView. On
  // Android a map whose size changes after it is created stops drawing (Magic
  // Lane engine 0.2.0), and a map inside the SafeAreaView would be resized
  // when the safe-area insets arrive.
  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <GLView
        style={StyleSheet.absoluteFill}
        apiToken={GEMKIT_TOKEN || undefined}
        onMapReady={event => {
          if (event.gemMap) {
            setGemMap(event.gemMap);
            setStatus('Map Ready');
          }
        }}
      />
      <SafeAreaView style={styles.safeOverlay} pointerEvents="box-none">
        <View style={styles.overlay}>
          <Text style={styles.header}>Center Coordinates</Text>
          <TouchableOpacity
            style={[styles.btn, !gemMap && styles.btnDisabled]}
            onPress={centerOnRome}
            disabled={!gemMap}>
            <Text style={styles.btnText}>Center on Rome, Italy</Text>
          </TouchableOpacity>
          {status ? <Text style={styles.status}>{status}</Text> : null}
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
  header: {fontSize: 18, fontWeight: '700', marginBottom: 12},
  btn: {backgroundColor: '#673ab7', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8},
  btnDisabled: {backgroundColor: '#b0a4d4'},
  btnText: {color: '#fff', fontWeight: '600'},
  status: {marginTop: 10, color: '#333'},
});
