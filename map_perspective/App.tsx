// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Toggles the map between a flat 2D view and a tilted 3D perspective with
// buildings.

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {BuildingsVisibility} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

const VIEW_3D_ANGLE = 30;
const VIEW_2D_ANGLE = 90;

export default function App() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [isPerspective, setIsPerspective] = useState(false);
  const [status, setStatus] = useState('Loading map…');

  // Same logic as the web example: flip buildings visibility and tilt angle.
  const togglePerspective = () => {
    if (!gemMap) return;
    const next = !isPerspective;
    setIsPerspective(next);
    const prefs = gemMap.preferences;
    if (next) {
      prefs.buildingsVisibility = BuildingsVisibility.threeDimensional;
      prefs.tiltAngle = VIEW_3D_ANGLE;
      setStatus('Switched to 3D perspective view');
    } else {
      prefs.buildingsVisibility = BuildingsVisibility.twoDimensional;
      prefs.tiltAngle = VIEW_2D_ANGLE;
      setStatus('Switched to 2D map view');
    }
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
          <Text style={styles.header}>Map Perspective</Text>
          <TouchableOpacity
            style={[styles.btn, !gemMap && styles.btnDisabled]}
            onPress={togglePerspective}
            disabled={!gemMap}>
            <Text style={styles.btnText}>
              {isPerspective ? '2D View' : '3D View'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.status}>{status}</Text>
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
