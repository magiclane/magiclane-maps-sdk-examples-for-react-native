// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Applies a map style (.style) shipped as an app asset via setMapStyleByBuffer.

import React, {useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Coordinates} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';
import styleBase64 from './assets/basicOldtimeStyle';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

// The web demo fetches assets/Basic_1_Oldtime-1_21_656.style as an
// ArrayBuffer. React Native cannot read a bundled binary asset without a
// file-system module, so the style ships as a generated base64 module
// (assets/basicOldtimeStyle.ts) that is decoded back into the file's bytes.
function loadStyleBuffer(): Uint8Array {
  // Hermes provides atob; React Native's type definitions do not declare it.
  const binary: string = (globalThis as any).atob(styleBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export default function App() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [status, setStatus] = useState('Loading map…');
  const [styleApplied, setStyleApplied] = useState(false);
  // From the press until the style callback: the button is disabled meanwhile,
  // so a second press cannot apply the style again. The ref covers a second tap
  // that lands before the re-render.
  const [isApplying, setIsApplying] = useState(false);
  const isLoading = useRef(false);

  // Load the style bytes, apply them with setMapStyleByBuffer and re-center,
  // as the Flutter example does. The callback reports when the style is live.
  const applyStyle = () => {
    if (!gemMap || styleApplied || isLoading.current) return;
    isLoading.current = true;
    setIsApplying(true);
    setStatus('The map style is loading…');

    let buffer: Uint8Array;
    try {
      buffer = loadStyleBuffer();
    } catch (e) {
      console.error('Could not decode the style asset:', e);
      isLoading.current = false;
      setIsApplying(false);
      setStatus('Could not decode the style asset.');
      return;
    }

    gemMap.registerSetMapStyleCallback(() => {
      isLoading.current = false;
      setIsApplying(false);
      setStatus('Map style applied successfully!');
      setStyleApplied(true);
    });

    gemMap.preferences.setMapStyleByBuffer(buffer);
    // Re-center right away rather than in the callback: called from the
    // JavaScript thread, the style is applied with the next frame the map
    // draws, and this camera move is what asks for that frame.
    gemMap.centerOnCoordinates(
      new Coordinates({latitude: 45, longitude: 20}),
      {zoomLevel: 25},
    );
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
          <Text style={styles.header}>Assets Map Style</Text>
          {!styleApplied ? (
            <TouchableOpacity
              style={[styles.btn, (!gemMap || isApplying) && styles.btnDisabled]}
              onPress={applyStyle}
              disabled={!gemMap || isApplying}>
              <Text style={styles.btnText}>{isApplying ? 'Applying…' : 'Apply Map Style'}</Text>
            </TouchableOpacity>
          ) : null}
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
  status: {marginTop: 10, color: '#333', textAlign: 'center'},
});
