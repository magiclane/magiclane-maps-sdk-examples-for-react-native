// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Animates the camera to frame a predefined rectangular geographic area.

import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Coordinates,
  RectangleGeographicArea,
  GemAnimation,
  AnimationType,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

export default function App() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [status, setStatus] = useState('Loading map…');
  // One timer for all messages: a newer message must not be cleared by the
  // timer of an older one.
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (messageTimer.current) clearTimeout(messageTimer.current);
    },
    [],
  );

  const showMessage = (msg: string) => {
    setStatus(msg);
    if (messageTimer.current) clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => setStatus(''), 3000);
  };

  // Same call as the web example: frame Queens, New York with a 2s animation.
  const centerOnArea = () => {
    if (!gemMap) {
      showMessage('Map not ready yet');
      return;
    }
    const area = new RectangleGeographicArea({
      topLeft: new Coordinates({
        latitude: 40.73254497605159,
        longitude: -73.82536953324063,
      }),
      bottomRight: new Coordinates({
        latitude: 40.723227048410024,
        longitude: -73.77693793474619,
      }),
    });
    const animation = new GemAnimation({
      type: AnimationType.linear,
      duration: 2000,
      onCompleted: () => showMessage('Centered on Queens area'),
    });
    gemMap.centerOnArea(area, {animation});
    showMessage('Centering on Queens, New York area…');
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
            setStatus('Map Ready');
          }
        }}
      />
      <SafeAreaView style={styles.safeOverlay} pointerEvents="box-none">
        <View style={styles.overlay}>
          <Text style={styles.header}>Center on Area</Text>
          <TouchableOpacity
            style={[styles.btn, !gemMap && styles.btnDisabled]}
            onPress={centerOnArea}
            disabled={!gemMap}>
            <Text style={styles.btnText}>Center on Area</Text>
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
  header: {fontSize: 18, fontWeight: '700', marginBottom: 12, color: '#333'},
  btn: {backgroundColor: '#673ab7', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8},
  btnDisabled: {backgroundColor: '#b0a4d4'},
  btnText: {color: '#fff', fontWeight: '600'},
  status: {marginTop: 10, color: '#333'},
});
