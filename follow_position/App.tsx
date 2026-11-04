// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// This app requests location permission, attaches the device's live GPS data
// source once, and makes the camera follow the current position with a linear
// animation.

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  PositionService,
  GemAnimation,
  AnimationType,
  GemError,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// A token from https://developer.magiclane.com removes the watermark and unlocks
// full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

export default function FollowPositionDemo() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [status, setStatus] = useState('Map loading…');
  const [hasLiveDataSource, setHasLiveDataSource] = useState(false);

  const onFollowPosition = async () => {
    if (!gemMap) {
      setStatus('Map not ready yet');
      return;
    }
    // Shows the Android/iOS location-permission dialog (only the first time);
    // the live data source delivers no positions without the permission.
    const permission = await PositionService.requestLocationPermission();
    if (!permission) {
      setStatus('Location permission denied. Allow it in the system settings.');
      return;
    }
    // Attach the live GPS data source only once.
    if (!hasLiveDataSource) {
      // GemError.exist: the live data source is already the current one.
      const err = PositionService.instance.setLiveDataSource();
      if (err !== GemError.success && err !== GemError.exist) {
        setStatus(`Could not start the live position (error ${err}).`);
        return;
      }
      setHasLiveDataSource(true);
    }
    const animation = new GemAnimation({type: AnimationType.linear});
    gemMap.startFollowingPosition({animation});
    setStatus('Following position…');
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
            setStatus('Map ready');
          }
        }}
      />
      <SafeAreaView style={styles.safeOverlay} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.header}>Follow Position</Text>
          <TouchableOpacity style={styles.btnPurple} onPress={onFollowPosition}>
            <Text style={styles.btnText}>Follow Position</Text>
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
  card: {
    margin: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 5,
    alignItems: 'center',
  },
  header: {fontSize: 18, fontWeight: '700', marginBottom: 12, color: '#333'},
  status: {marginTop: 10, color: '#333', textAlign: 'center'},
  btnText: {color: '#fff', fontWeight: '600'},
  btnPurple: {backgroundColor: '#673ab7', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
});
