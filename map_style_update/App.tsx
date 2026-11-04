// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Works with map view styles from the content store:
//   1. Configure auto-update so road maps update automatically but view styles
//      are managed manually (`AutoUpdateSettings`).
//   2. List the available view styles (`ContentType.viewStyleHighRes`).
//   3. Tap a style to download it if needed and apply it to the live map
//      (`map.preferences.setMapStyle`).
//   4. Check for newer versions of downloaded styles and update them with a
//      `ContentUpdater` (the same update/apply flow as `map_update`).

import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  SdkSettings,
  ServiceGroupType,
  AutoUpdateSettings,
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
// required to list and download view styles.
const GEMKIT_TOKEN = '';

const updaterIsReady = (s: ContentUpdaterStatus) =>
  s === ContentUpdaterStatus.fullyReady || s === ContentUpdaterStatus.partiallyReady;

// Whether a view style is dark, so the status bar over the map needs light
// content. Satellite styles are; otherwise the background (water) colour from
// the style's content parameters decides, an integer with red in the lowest
// byte. A style with neither counts as light.
function isDarkStyle(item: ContentStoreItem): boolean {
  let params: Record<string, any>[];
  try {
    params = item.contentParameters.asJson();
  } catch {
    return false;
  }
  const values = (key: string) =>
    params.filter(p => p.key === key).map(p => String(p.value));
  // Comma-separated in 'purposes'; newer styles have one 'tag' per purpose.
  const purposes = [...values('purposes'), ...values('tag')]
    .join(',')
    .split(',');
  if (purposes.includes('satellite')) return true;
  const color = Number(values('Background-Color')[0]);
  if (!Number.isFinite(color)) return false;
  const r = color & 0xff;
  const g = (color >> 8) & 0xff;
  const b = (color >> 16) & 0xff;
  // Perceived brightness (ITU-R BT.601), 0-255.
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

export default function MapStyleUpdateDemo() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [status, setStatus] = useState('Initializing…');
  const [styles_, setStyles] = useState<ContentStoreItem[]>([]);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [stylesStatus, setStylesStatus] = useState<MapStatus | null>(null);
  const [updater, setUpdater] = useState<ContentUpdater | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  // The styles list comes from the content store, which needs the SDK
  // initialized: Styles stays disabled until then.
  const [initialized, setInitialized] = useState(false);
  // The map starts with the default style, a light one.
  const [darkStyle, setDarkStyle] = useState(false);

  const canUpdate =
    stylesStatus === MapStatus.OldData || stylesStatus === MapStatus.ExpiredData;

  const loadStyles = () => {
    setStatus('Loading styles…');
    ContentStore.asyncGetStoreContentList(
      ContentType.viewStyleHighRes,
      (err: GemError, items: ContentStoreItem[] | null) => {
        if (err === GemError.success && items) {
          setStyles(items);
          setStatus(`${items.length} styles available`);
        } else {
          setStatus(`Could not load styles (${err}). Check token/connection.`);
        }
      },
    );
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

        // Road maps and resources auto-update; styles are updated manually in
        // this demo. Resources must stay on: new map data needs matching
        // resources, and without them an outdated map is never updated.
        SdkSettings.offBoardListener.autoUpdateSettings = new AutoUpdateSettings({
          isAutoUpdateForRoadMapEnabled: true,
          isAutoUpdateForViewStyleHighResEnabled: false,
          isAutoUpdateForViewStyleLowResEnabled: false,
          isAutoUpdateForResourcesEnabled: true,
        });

        SdkSettings.offBoardListener.registerOnAvailableContentUpdate(
          (type: ContentType, s: MapStatus) => {
            if (
              type === ContentType.viewStyleHighRes ||
              type === ContentType.viewStyleLowRes
            ) {
              setStylesStatus(s);
            }
          },
        );
        // Check for style updates and load the list once the SDK is online:
        // before that, the store answers noConnection.
        SdkSettings.offBoardListener.registerOnConnectionStatusUpdated(
          (isConnected: boolean) => {
            if (!isConnected || !mounted) return;
            ContentStore.checkForUpdate(ContentType.viewStyleHighRes);
            loadStyles();
          },
        );
        listening = true;
        setInitialized(true);
      } catch (e: any) {
        setStatus(`Init failed: ${String(e?.message || e)}`);
      }
    });
    return () => {
      mounted = false;
      if (listening) {
        SdkSettings.offBoardListener.registerOnAvailableContentUpdate(undefined);
        SdkSettings.offBoardListener.registerOnConnectionStatusUpdated(undefined);
      }
    };
  }, []);

  const applyStyle = (item: ContentStoreItem) => {
    if (!gemMap) {
      setStatus('Map not ready yet');
      return;
    }
    // Already on the device: apply immediately.
    if (item.status === ContentStoreItemStatus.completed) {
      gemMap.preferences.setMapStyle(item, true);
      setDarkStyle(isDarkStyle(item));
      setStatus(`Applied style: ${item.name}`);
      return;
    }
    // Otherwise download first, then apply.
    setApplyingId(item.id);
    setStatus(`Downloading style: ${item.name}…`);
    item.asyncDownload(
      (err: GemError) => {
        setApplyingId(null);
        if (err === GemError.success) {
          gemMap.preferences.setMapStyle(item, true);
          setDarkStyle(isDarkStyle(item));
          setStatus(`Applied style: ${item.name}`);
        } else {
          setStatus(`Style download failed (${err})`);
        }
      },
      {allowChargedNetworks: true},
    );
  };

  const startUpdate = () => {
    if (updater) return;
    const created = ContentStore.createContentUpdater(ContentType.viewStyleHighRes);
    const newUpdater = created.first;
    const err = created.second;
    if (err !== GemError.success && err !== GemError.exist) {
      setStatus(`Could not create updater (${err})`);
      return;
    }
    setUpdater(newUpdater);
    setUpdateProgress(0);
    setStatus('Updating styles…');
    newUpdater.update(true, {
      onStatusUpdated: (s: ContentUpdaterStatus) => {
        if (updaterIsReady(s)) {
          const applyErr = newUpdater.apply();
          setStatus(
            applyErr === GemError.success
              ? 'Styles updated'
              : `Apply failed (${applyErr})`,
          );
          if (applyErr === GemError.success) setStylesStatus(MapStatus.UpToDate);
          setUpdateProgress(null);
          setUpdater(null);
          loadStyles();
        }
      },
      onProgressUpdated: (p: number) => setUpdateProgress(p),
      onCompleteCallback: (e: GemError) => {
        if (e !== GemError.success) setStatus(`Update error ${e}`);
      },
    });
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle={darkStyle ? 'light-content' : 'dark-content'} />
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
        <TouchableOpacity
          style={[styles.toggle, !initialized && styles.toggleDisabled]}
          disabled={!initialized}
          onPress={() => {
            setShowPanel(p => !p);
            if (!showPanel) loadStyles();
          }}>
          <Text style={styles.toggleText}>{showPanel ? 'Hide' : 'Styles'}</Text>
        </TouchableOpacity>

        {showPanel && (
          <View style={styles.card}>
            <Text style={styles.header}>Map Styles</Text>
            <Text style={styles.status}>{status}</Text>

            {canUpdate && updateProgress === null && (
              <TouchableOpacity style={styles.btnPurple} onPress={startUpdate}>
                <Text style={styles.btnText}>Update styles</Text>
              </TouchableOpacity>
            )}
            {updateProgress !== null && (
              <Text style={styles.status}>
                Updating… {Math.round(updateProgress)}%
              </Text>
            )}

            <ScrollView style={styles.list}>
              {styles_.length === 0 ? (
                <Text style={styles.empty}>No styles available.</Text>
              ) : (
                styles_.map((item, i) => (
                  <TouchableOpacity
                    key={`${item.id}-${i}`}
                    style={styles.listItem}
                    onPress={() => applyStyle(item)}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {applyingId === item.id ? (
                      <ActivityIndicator color="#673ab7" />
                    ) : (
                      <Text style={styles.itemMeta}>
                        {item.status === ContentStoreItemStatus.completed
                          ? 'on device'
                          : `${(item.totalSize / (1024 * 1024)).toFixed(1)} MB`}
                      </Text>
                    )}
                  </TouchableOpacity>
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
  toggleDisabled: {opacity: 0.5},
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
  status: {marginTop: 8, color: '#333'},
  list: {marginTop: 10, maxHeight: 300},
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemName: {fontSize: 15, fontWeight: '600', color: '#333'},
  itemMeta: {fontSize: 13, color: '#777'},
  empty: {color: '#999', paddingVertical: 10},
  btnText: {color: '#fff', fontWeight: '600'},
  btnPurple: {backgroundColor: '#673ab7', padding: 12, borderRadius: 8, marginTop: 12, alignItems: 'center'},
});
