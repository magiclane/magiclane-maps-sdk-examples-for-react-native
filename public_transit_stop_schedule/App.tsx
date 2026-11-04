// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Tapping a public-transport stop on the map queries its schedule via
// OverlayItem.getPTStopInfo, resolves the stop's local time with
// TimezoneService, and shows the departing trips in a bottom sheet; tapping a
// trip lists its stop times.

import React, {useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Coordinates,
  GemError,
  CommonOverlayId,
  TimezoneService,
  PTStopInfo,
  PTTrip,
  PTStopTime,
  PTRouteType,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

// Emoji icon for a public-transport route type.
function getTransportIcon(type: PTRouteType): string {
  switch (type) {
    case PTRouteType.Bus:
      return '🚌';
    case PTRouteType.Underground:
      return '🚇';
    case PTRouteType.Railway:
      return '🚆';
    case PTRouteType.Tram:
      return '🚊';
    case PTRouteType.WaterTransport:
      return '⛴️';
    default:
      return '🚌';
  }
}

function formatTime(date: Date): string {
  return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function timeDifference(now: Date, trip: PTTrip): string {
  if (!trip.departureTime) {
    return '–';
  }
  const diffMinutes = Math.floor(
    (trip.departureTime.getTime() - now.getTime()) / (1000 * 60),
  );
  return `${diffMinutes} min`;
}

// Resolve the local time at a coordinate (used to compute "x min" to departure).
function getLocalTime(coords: Coordinates): Date {
  try {
    const result = TimezoneService.getTimezoneInfoFromCoordinatesSync({
      coords,
      time: new Date(),
    });
    if (result) {
      return result.localTime;
    }
  } catch {}
  return new Date();
}

export default function App() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [status, setStatus] = useState('Tap a public transit stop…');
  const [stopInfo, setStopInfo] = useState<PTStopInfo | null>(null);
  const [localTime, setLocalTime] = useState<Date>(new Date());
  const [selectedTrip, setSelectedTrip] = useState<PTTrip | null>(null);
  const busy = useRef(false);

  const onMapReady = (map: any) => {
    setGemMap(map);
    // Start close in over Barcelona, where the map shows transit stops.
    map.centerOnCoordinates(
      Coordinates.fromLatLong(41.40377426147461, 2.173604965209961),
      {zoomLevel: 95},
    );
    // Tap a transit stop marker to query its schedule.
    map.registerTouchCallback(async (pos: {x: number; y: number}) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      try {
        await map.setCursorScreenPosition(pos);
        const items = map.cursorSelectionOverlayItemsByType(
          CommonOverlayId.PublicTransport,
        );
        const coords: Coordinates = map.transformScreenToWgs(pos);
        for (const item of items) {
          const info: PTStopInfo | null = await item.getPTStopInfo();
          if (info) {
            setLocalTime(getLocalTime(coords));
            setSelectedTrip(null);
            setStopInfo(info);
            setStatus(`${info.trips.length} trips`);
            break;
          }
        }
      } catch (e: any) {
        setStatus(`Error: ${String(e?.message || e)}`);
      } finally {
        busy.current = false;
      }
    });
  };

  const closeSheet = () => {
    setStopInfo(null);
    setSelectedTrip(null);
    setStatus('Tap a public transit stop…');
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <GLView
        style={StyleSheet.absoluteFill}
        apiToken={GEMKIT_TOKEN || undefined}
        onMapReady={event => {
          if (event.gemMap) {
            onMapReady(event.gemMap);
          }
        }}
      />
      <SafeAreaView style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.appBar}>
          <Text style={styles.appBarText}>Public Transit Stops</Text>
        </View>
        <View style={styles.hint}>
          <Text style={styles.hintText}>{status}</Text>
        </View>
      </SafeAreaView>

      {stopInfo ? (
        <View style={styles.sheet}>
          <SafeAreaView edges={['bottom']} style={styles.sheetInner}>
            <View style={styles.sheetHeader}>
              {selectedTrip ? (
                <TouchableOpacity onPress={() => setSelectedTrip(null)}>
                  <Text style={styles.sheetNav}>←</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.sheetNavSpacer} />
              )}
              <Text style={styles.sheetTitle}>
                {selectedTrip
                  ? `Stops for ${selectedTrip.route.routeShortName || ''}`
                  : 'Select a Trip'}
              </Text>
              <TouchableOpacity onPress={closeSheet}>
                <Text style={styles.sheetNav}>✕</Text>
              </TouchableOpacity>
            </View>

            {!selectedTrip ? (
              <FlatList
                data={stopInfo.trips}
                keyExtractor={(_, i) => String(i)}
                renderItem={({item}) => (
                  <TouchableOpacity
                    style={styles.tripItem}
                    onPress={() => setSelectedTrip(item)}>
                    <View style={styles.tripLeft}>
                      <Text style={styles.tripIcon}>
                        {getTransportIcon(item.route.routeType)}
                      </Text>
                      <View style={styles.tripInfo}>
                        <Text style={styles.tripBadge}>
                          {item.route.routeShortName || 'None'}
                        </Text>
                        <Text style={styles.tripName} numberOfLines={1}>
                          {item.route.heading ||
                            item.route.routeLongName ||
                            'N/A'}
                        </Text>
                        <Text style={styles.tripSub}>
                          {item.departureTime
                            ? `Scheduled • ${formatTime(item.departureTime)}`
                            : 'Scheduled'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.tripEta}>
                      {timeDifference(localTime, item)}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            ) : (
              <FlatList
                data={selectedTrip.stopTimes}
                keyExtractor={(_, i) => String(i)}
                renderItem={({item}: {item: PTStopTime}) => (
                  <View style={styles.stopItem}>
                    <View style={styles.stopLeft}>
                      <Text style={styles.stopName} numberOfLines={1}>
                        {item.stopName}
                      </Text>
                      {item.departureTime ? (
                        <Text style={styles.stopStatus}>
                          {item.departureTime > localTime
                            ? 'Scheduled'
                            : 'Departed'}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.stopTime}>
                      {item.departureTime ? formatTime(item.departureTime) : '–'}
                    </Text>
                  </View>
                )}
              />
            )}
          </SafeAreaView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  topOverlay: {position: 'absolute', top: 0, left: 0, right: 0},
  appBar: {
    backgroundColor: '#4527a0',
    paddingVertical: 14,
    alignItems: 'center',
    elevation: 4,
  },
  appBarText: {color: '#fff', fontSize: 18, fontWeight: '600'},
  hint: {
    alignSelf: 'center',
    marginTop: 12,
    backgroundColor: '#ff9800',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    elevation: 3,
  },
  hintText: {color: '#fff', fontWeight: '600'},
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    elevation: 12,
  },
  sheetInner: {flex: 1},
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  sheetNav: {fontSize: 20, color: '#333', width: 32, textAlign: 'center'},
  sheetNavSpacer: {width: 32},
  sheetTitle: {flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: '#000'},
  tripItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  tripLeft: {flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1},
  tripIcon: {fontSize: 24},
  tripInfo: {flex: 1, gap: 2},
  tripBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#4caf50',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 2,
    borderRadius: 14,
    fontWeight: '600',
    overflow: 'hidden',
  },
  tripName: {color: '#000'},
  tripSub: {fontSize: 12, color: '#666'},
  tripEta: {fontWeight: '600', color: '#000', marginLeft: 8},
  stopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  stopLeft: {flex: 1, gap: 2},
  stopName: {fontWeight: '500', color: '#000'},
  stopStatus: {fontSize: 12, color: '#666'},
  stopTime: {fontWeight: '500', color: '#000', marginLeft: 8},
});
