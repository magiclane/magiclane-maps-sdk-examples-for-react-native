// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// This app requests the device location (falling back to a default), then
// searches all generic POI categories around that position and lists what is
// nearby with distances; tapping a result highlights and centers the map on it.

import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Coordinates,
  GemPosition,
  GemPositionListener,
  PositionService,
  SearchService,
  SearchPreferences,
  Landmark,
  LandmarkCategory,
  GemError,
  GemAnimation,
  AnimationType,
  GenericCategories,
  HighlightRenderSettings,
  HighlightOptions,
  GemIcon,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

// How long to wait for the first live position before using the default.
const POSITION_TIMEOUT_MS = 15000;

// Default position: Brasov, Romania.
const defaultPosition = new Coordinates({
  latitude: 45.6427,
  longitude: 25.5887,
  altitude: 0.0,
});

function convertDistance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`;
}

// Search all generic POI categories around a position.
function getNearbyLocations(position: Coordinates): Promise<Landmark[]> {
  return new Promise(resolve => {
    try {
      const preferences = SearchPreferences.create({
        searchAddresses: false,
        maxMatches: 50,
      });

      const genericCategories = GenericCategories.categories;
      if (genericCategories && preferences.landmarks) {
        genericCategories.forEach((category: LandmarkCategory) => {
          if (category.landmarkStoreId && category.id) {
            preferences.landmarks.addStoreCategoryId(
              category.landmarkStoreId,
              category.id,
            );
          }
        });
      }

      SearchService.searchAroundPosition({
        position,
        preferences,
        onCompleteCallback: (err: GemError, results: Landmark[]) => {
          const found = err === GemError.success || err === GemError.reducedResult;
          resolve(found && results ? results : []);
        },
      });
    } catch {
      resolve([]);
    }
  });
}

export default function App() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [status, setStatus] = useState('Loading map…');
  const [results, setResults] = useState<Landmark[]>([]);
  const [scanning, setScanning] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<Coordinates | null>(
    null,
  );

  // Once the map is ready, center on the default position and try to acquire the
  // live device position: ask for permission, switch to the live data source,
  // then wait (up to POSITION_TIMEOUT_MS) for the first fix.
  useEffect(() => {
    if (!gemMap) {
      return;
    }
    gemMap.centerOnCoordinates(defaultPosition, {zoomLevel: 50});
    let cancelled = false;
    let listener: GemPositionListener | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const stopWaiting = () => {
      if (listener) {
        PositionService.instance.removeListener(listener);
        listener = null;
      }
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const onPosition = (position: GemPosition) => {
      if (cancelled || !position.hasCoordinates) {
        return;
      }
      stopWaiting();
      setCurrentPosition(position.coordinates);
      const animation = new GemAnimation({type: AnimationType.linear});
      gemMap.startFollowingPosition({animation});
      setStatus('Location access granted.');
    };

    (async () => {
      try {
        const granted = await PositionService.requestLocationPermission();
        if (cancelled) {
          return;
        }
        if (!granted) {
          setStatus('Location permission denied. Using default.');
          return;
        }
        // GemError.exist: the live data source is already the current one.
        const err = PositionService.instance.setLiveDataSource();
        if (err !== GemError.success && err !== GemError.exist) {
          setStatus(`Could not start live location (${err}). Using default.`);
          return;
        }
        const current = PositionService.instance.position;
        if (current?.hasCoordinates) {
          onPosition(current);
          return;
        }
        setStatus('Waiting for position…');
        listener = PositionService.instance.addPositionListener(onPosition);
        timer = setTimeout(() => {
          stopWaiting();
          if (!cancelled) {
            setStatus('No position received. Using default.');
          }
        }, POSITION_TIMEOUT_MS);
      } catch (e) {
        console.error('Location error:', e);
        if (!cancelled) {
          setStatus('Error accessing location. Using default.');
        }
      }
    })();

    return () => {
      cancelled = true;
      stopWaiting();
    };
  }, [gemMap]);

  const performSearch = async () => {
    if (!gemMap) {
      return;
    }
    setScanning(true);
    setResults([]);
    setStatus('Scanning area…');

    const searchPosition = currentPosition || defaultPosition;
    const normalized = new Coordinates({
      latitude: searchPosition.latitude,
      longitude: searchPosition.longitude,
      altitude: 0.0,
    });

    const nearby = await getNearbyLocations(normalized);
    setResults(nearby);
    setScanning(false);
    setStatus(nearby.length ? `${nearby.length} nearby` : 'No locations nearby.');
  };

  const selectResult = (landmark: Landmark) => {
    if (!gemMap || !landmark.coordinates) {
      return;
    }
    gemMap.centerOnCoordinates(landmark.coordinates, {zoomLevel: 70});
    try {
      const renderSettings = new HighlightRenderSettings({
        options: new Set([HighlightOptions.showLandmark]),
      });
      try {
        landmark.setImageFromIcon(GemIcon.searchResultsPin);
      } catch {}
      gemMap.activateHighlight([landmark], {renderSettings});
    } catch {
      gemMap.activateHighlight([landmark]);
    }
  };

  const nameOf = (landmark: Landmark): string =>
    landmark.name ||
    (landmark.categories && landmark.categories.length > 0
      ? landmark.categories[0].name
      : 'Unknown');

  const distanceOf = (landmark: Landmark): string => {
    const base = currentPosition || defaultPosition;
    return landmark.coordinates
      ? convertDistance(landmark.coordinates.distance(base))
      : '';
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
          }
        }}
      />
      <SafeAreaView style={styles.safeOverlay} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.header}>What's Nearby</Text>
          <TouchableOpacity
            style={[styles.btnPurple, (!gemMap || scanning) && styles.btnDisabled]}
            onPress={performSearch}
            disabled={!gemMap || scanning}>
            {scanning ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>What's Nearby</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.status}>{status}</Text>
          {results.length > 0 ? (
            <FlatList
              style={styles.list}
              data={results}
              keyExtractor={(_, i) => String(i)}
              renderItem={({item}) => (
                <TouchableOpacity
                  style={styles.resultItem}
                  onPress={() => selectResult(item)}>
                  <Text style={styles.resultName} numberOfLines={1}>
                    {nameOf(item)}
                  </Text>
                  <Text style={styles.resultDist}>{distanceOf(item)} away</Text>
                </TouchableOpacity>
              )}
            />
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  safeOverlay: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0},
  card: {
    margin: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 5,
    maxHeight: '80%',
  },
  header: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    color: '#333',
    textAlign: 'center',
  },
  list: {marginTop: 12},
  resultItem: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  resultName: {fontSize: 14, fontWeight: '600', color: '#333'},
  resultDist: {fontSize: 12, color: '#673ab7', fontWeight: '500', marginTop: 2},
  status: {marginTop: 10, color: '#333', textAlign: 'center'},
  btnText: {color: '#fff', fontWeight: '600', textAlign: 'center'},
  btnPurple: {
    backgroundColor: '#673ab7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnDisabled: {opacity: 0.5},
});
