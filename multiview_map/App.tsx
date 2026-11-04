// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Shows up to four independent map views in a grid, added/removed at runtime.

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

const MAX_VIEWS = 4;

// The safe-area insets are known before the maps mount (SafeAreaProvider renders its
// children once it has them), so each map is created at its final size: on Android a
// map whose size changes after it is created stops drawing (Magic Lane engine 0.2.0).
export default function App() {
  return (
    <SafeAreaProvider>
      <MultiviewMap />
    </SafeAreaProvider>
  );
}

function MultiviewMap() {
  const insets = useSafeAreaInsets();
  // Each GLView instance creates its own independent map, like gemKit.createView
  // did per-container on the web. Removing a view unmounts its GLView, and the
  // native view that owns the map releases it; GemMapRN has no release() for
  // the app to call, unlike the web demo's gemMap.release().
  const [count, setCount] = useState(1);

  const addView = () => setCount(c => Math.min(MAX_VIEWS, c + 1));
  const removeView = () => setCount(c => Math.max(0, c - 1));

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.appBarSafe, {paddingTop: insets.top}]}>
        <View style={styles.appBar}>
          <Text style={styles.title}>Multiview Map</Text>
          <View style={styles.actions}>
            <TouchableOpacity onPress={addView} style={styles.iconBtn}>
              <Text style={styles.iconText}>＋</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={removeView} style={styles.iconBtn}>
              <Text style={styles.iconText}>－</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <View style={styles.grid}>
        {count === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Tap ＋ to add a map view</Text>
          </View>
        ) : (
          Array.from({length: count}).map((_, i) => (
            <View key={i} style={styles.cell}>
              <GLView
                style={styles.fill}
                apiToken={GEMKIT_TOKEN || undefined}
                onMapReady={() => {}}
              />
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#f5f5f5'},
  appBarSafe: {backgroundColor: '#4527a0'},
  appBar: {
    height: 56,
    backgroundColor: '#4527a0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  title: {color: '#fff', fontSize: 18, fontWeight: '600'},
  actions: {flexDirection: 'row'},
  iconBtn: {paddingHorizontal: 10},
  iconText: {color: '#fff', fontSize: 26},
  grid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 5,
  },
  cell: {
    width: '50%',
    height: '50%',
    padding: 5,
  },
  fill: {flex: 1, borderRadius: 10, overflow: 'hidden'},
  empty: {flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%'},
  emptyText: {color: '#777'},
});
