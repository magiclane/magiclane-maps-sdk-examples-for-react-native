// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Taps move the cursor and read the name of the street beneath it.

import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet, StatusBar} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Coordinates} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

export default function App() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [streetName, setStreetName] = useState('');

  // Center on Milan, enable the cursor, then read the street on each tap.
  useEffect(() => {
    if (!gemMap) return;
    gemMap.centerOnCoordinates(
      new Coordinates({latitude: 45.472358, longitude: 9.184945}),
      {zoomLevel: 80},
    );
    gemMap.preferences.enableCursor = true;
    gemMap.preferences.enableCursorRender = true;
    gemMap.registerTouchCallback(async (point: {x: number; y: number}) => {
      await gemMap.setCursorScreenPosition(point);
      const streets = gemMap.cursorSelectionStreets();
      setStreetName(
        streets && streets.length > 0
          ? streets[0].name || 'Unnamed street'
          : 'Unnamed street',
      );
    });
    return () => {
      gemMap.registerTouchCallback(null);
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
          <Text style={styles.header}>Cursor Street Name</Text>
          <Text style={styles.hint}>
            {gemMap ? 'Tap the map to read a street' : 'Loading map…'}
          </Text>
        </View>
      </SafeAreaView>
      {streetName ? (
        <SafeAreaView style={styles.bottomOverlay} pointerEvents="none">
          <View style={styles.pill}>
            <Text style={styles.pillText}>{streetName}</Text>
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
    marginBottom: 40,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.95)',
    elevation: 5,
  },
  pillText: {color: '#333', fontSize: 17, fontWeight: '600'},
});
