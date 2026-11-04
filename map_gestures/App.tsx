// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Registers the full set of map gesture callbacks and surfaces the latest one
// in a pill.

import React, {useEffect, useRef, useState} from 'react';
import {View, Text, StyleSheet, StatusBar} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

export default function App() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [gesture, setGesture] = useState('');
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showGesture = (name: string) => {
    setGesture(name);
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => setGesture(''), 2000);
  };

  // Register the same gesture callbacks as the web example; each one just
  // reports which gesture fired.
  useEffect(() => {
    if (!gemMap) return;
    gemMap.registerMapAngleUpdateCallback(() => showGesture('Rotate Map'));
    gemMap.registerTouchCallback(() => showGesture('Touch'));
    gemMap.registerMoveCallback(() => showGesture('Pan Map'));
    gemMap.registerLongPressCallback(() => showGesture('Long Press'));
    gemMap.registerDoubleTouchCallback(() => showGesture('Double Touch'));
    gemMap.registerPinchCallback(() => showGesture('Pinch to Zoom'));
    gemMap.registerShoveCallback(() => showGesture('Shove (Tilt)'));
    gemMap.registerSwipeCallback(() => showGesture('Swipe'));
    gemMap.registerPinchSwipeCallback(() => showGesture('Pinch & Rotate'));
    gemMap.registerTwoTouchesCallback(() => showGesture('Two Touches'));
    gemMap.registerTouchPinchCallback(() => showGesture('Touch Pinch'));
    return () => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    };
  }, [gemMap]);

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
          <Text style={styles.header}>Map Gestures</Text>
          <Text style={styles.hint}>
            {gemMap ? 'Interact with the map' : 'Loading map…'}
          </Text>
        </View>
      </SafeAreaView>
      {gesture ? (
        <SafeAreaView style={styles.bottomOverlay} pointerEvents="none">
          <View style={styles.pill}>
            <Text style={styles.pillText}>{gesture}</Text>
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
  pill: {
    marginBottom: 30,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 50,
    backgroundColor: 'rgba(33,33,33,0.95)',
  },
  pillText: {color: '#fff', fontSize: 16, fontWeight: '600'},
});
