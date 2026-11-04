// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Demonstrates the road-map UPDATE flow (distinct from a first download):
//   1. Ask the content store whether newer map data exists
//      (`ContentStore.checkForUpdate`). The answer arrives asynchronously via
//      `registerOnWorldwideRoadMapSupportStatus` as a `MapStatus`.
//   2. If the on-device maps are old/expired, create a `ContentUpdater`, run it
//      (download the newer maps), and `apply()` it once it is ready (this swaps
//      the old maps for the new ones and bumps the map version).
//
// The app shows whatever status the SDK reports for the maps actually on the
// device; an update is only offered when they are out of date. See README.md.

import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  SdkSettings,
  ServiceGroupType,
  ContentStore,
  ContentType,
  ContentStoreItem,
  ContentStoreItemStatus,
  ContentUpdater,
  ContentUpdaterStatus,
  MapStatus,
  GemError,
} from '@magiclane/maps-sdk';
import {GLView, MagicLaneReactNativeSDK} from '@magiclane/maps-sdk-react-native';

// A token from https://developer.magiclane.com and an internet connection are
// required to query the store and download updated map data.
const GEMKIT_TOKEN = '';

const updaterIsReady = (s: ContentUpdaterStatus) =>
  s === ContentUpdaterStatus.fullyReady || s === ContentUpdaterStatus.partiallyReady;

function describeMapStatus(s: MapStatus | null): string {
  switch (s) {
    case MapStatus.UpToDate:
      return 'Maps are up to date';
    case MapStatus.OldData:
      return 'Newer map data available (one version behind)';
    case MapStatus.ExpiredData:
      return 'Map data expired - update required';
    default:
      return 'Checking for updates…';
  }
}

export default function MapUpdateDemo() {
  const [status, setStatus] = useState('Initializing…');
  const [mapsStatus, setMapsStatus] = useState<MapStatus | null>(null);
  const [localMaps, setLocalMaps] = useState<ContentStoreItem[]>([]);
  const [updater, setUpdater] = useState<ContentUpdater | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  const canUpdate =
    mapsStatus === MapStatus.OldData || mapsStatus === MapStatus.ExpiredData;

  const refreshLocal = () => {
    try {
      const maps = ContentStore.getLocalContentList(ContentType.roadMap).filter(
        m => m.status === ContentStoreItemStatus.completed,
      );
      setLocalMaps(maps);
    } catch {
      /* store not ready yet */
    }
  };

  const updateSizeMB = () => {
    const local = ContentStore.getLocalContentList(ContentType.roadMap);
    let sum = 0;
    for (const m of local) {
      if (m.isUpdatable && m.status === ContentStoreItemStatus.completed) {
        sum += m.updateSize;
      }
    }
    return (sum / (1024 * 1024)).toFixed(2);
  };

  useEffect(() => {
    let mounted = true;
    let listening = false;
    // One-call SDK init (idempotent; <GLView> calls it too).
    MagicLaneReactNativeSDK.init({
      authorization: GEMKIT_TOKEN || undefined,
    }).then(() => {
      if (!mounted) return;
      try {
        SdkSettings.setAllowOffboardServiceOnExtraChargedNetwork(
          ServiceGroupType.ContentService,
          true,
        );
        SdkSettings.setAllowInternetConnection(true);

        // The update verdict arrives asynchronously here.
        SdkSettings.offBoardListener.registerOnWorldwideRoadMapSupportStatus(
          (s: MapStatus) => {
            setMapsStatus(s);
            setStatus(describeMapStatus(s));
          },
        );
        listening = true;

        // Kick off the check; result comes back through the listener above.
        const code = ContentStore.checkForUpdate(ContentType.roadMap);
        refreshLocal();
        setStatus(
          code === GemError.success
            ? 'Checking for updates…'
            : `checkForUpdate returned ${code}`,
        );
      } catch (e: any) {
        setStatus(`Init failed: ${String(e?.message || e)}`);
      }
    });
    return () => {
      mounted = false;
      if (listening) {
        SdkSettings.offBoardListener.registerOnWorldwideRoadMapSupportStatus(
          undefined,
        );
      }
    };
  }, []);

  const startUpdate = () => {
    if (updater) {
      setStatus('An update is already running');
      return;
    }
    const created = ContentStore.createContentUpdater(ContentType.roadMap);
    const newUpdater = created.first;
    const err = created.second;
    if (err !== GemError.success && err !== GemError.exist) {
      setStatus(`Could not create updater (${err})`);
      return;
    }
    setUpdater(newUpdater);
    setUpdateProgress(0);
    setStatus('Updating maps…');
    newUpdater.update(true, {
      onStatusUpdated: (s: ContentUpdaterStatus) => {
        if (updaterIsReady(s)) {
          // Newer maps downloaded: apply swaps them in and bumps the version.
          const applyErr = newUpdater.apply();
          if (applyErr === GemError.success) {
            setMapsStatus(MapStatus.UpToDate);
            setStatus('Update applied - maps are up to date');
          } else {
            setStatus(`Apply failed (${applyErr})`);
          }
          setUpdateProgress(null);
          setUpdater(null);
          refreshLocal();
        }
      },
      onProgressUpdated: (p: number) => setUpdateProgress(p),
      onCompleteCallback: (e: GemError) => {
        // cancel comes from Cancel update, which updates the status itself.
        if (e !== GemError.success && e !== GemError.cancel) {
          setStatus(`Update finished with error ${e}`);
        }
      },
    });
  };

  const cancelUpdate = () => {
    updater?.cancel();
    setUpdater(null);
    setUpdateProgress(null);
    setStatus('Update cancelled');
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <GLView style={StyleSheet.absoluteFill} apiToken={GEMKIT_TOKEN || undefined} />
      <SafeAreaView style={styles.safeOverlay} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.toggle}
          onPress={() => {
            setShowPanel(p => !p);
            refreshLocal();
          }}>
          <Text style={styles.toggleText}>{showPanel ? 'Hide' : 'Maps'}</Text>
        </TouchableOpacity>

        {showPanel && (
          <View style={styles.card}>
            <Text style={styles.header}>Map Update</Text>
            <Text style={styles.status}>{status}</Text>

            {canUpdate && updateProgress === null && (
              <TouchableOpacity style={styles.btnPurple} onPress={startUpdate}>
                <Text style={styles.btnText}>
                  Update maps ({updateSizeMB()} MB)
                </Text>
              </TouchableOpacity>
            )}
            {updateProgress !== null && (
              <TouchableOpacity style={styles.btnRed} onPress={cancelUpdate}>
                <Text style={styles.btnText}>
                  Cancel update ({Math.round(updateProgress)}%)
                </Text>
              </TouchableOpacity>
            )}

            <Text style={styles.subhead}>On device ({localMaps.length})</Text>
            <ScrollView style={styles.list}>
              {localMaps.length === 0 ? (
                <Text style={styles.empty}>No maps downloaded yet.</Text>
              ) : (
                localMaps.map((m, i) => (
                  <View key={`${m.id}-${i}`} style={styles.listItem}>
                    <Text style={styles.itemName}>{m.name}</Text>
                    <Text style={styles.itemMeta}>
                      {(m.totalSize / (1024 * 1024)).toFixed(1)} MB
                      {m.isUpdatable ? ' · update available' : ''}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  safeOverlay: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0},
  toggle: {
    alignSelf: 'flex-end',
    marginTop: 12,
    marginRight: 12,
    backgroundColor: '#111',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  toggleText: {color: '#fff', fontWeight: '600'},
  card: {
    margin: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    maxHeight: '75%',
    elevation: 5,
  },
  header: {fontSize: 18, fontWeight: '700', color: '#333'},
  subhead: {marginTop: 14, marginBottom: 6, fontWeight: '600', color: '#555'},
  status: {marginTop: 8, color: '#333'},
  list: {maxHeight: 220},
  listItem: {paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0'},
  itemName: {fontSize: 15, fontWeight: '600', color: '#333'},
  itemMeta: {fontSize: 13, color: '#777'},
  empty: {color: '#999', paddingVertical: 10},
  btnText: {color: '#fff', fontWeight: '600'},
  btnPurple: {backgroundColor: '#673ab7', padding: 12, borderRadius: 8, marginTop: 12, alignItems: 'center'},
  btnRed: {backgroundColor: '#f44336', padding: 12, borderRadius: 8, marginTop: 12, alignItems: 'center'},
});
