// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Campsites are rendered with native clustering: a count-bearing cluster layer
// plus a per-type detail layer; tap a cluster to expand it, tap a pin for an
// info panel.
//
// The clustering uses two overlapping MarkerCollections grouped at the same
// zoom, with registerTouchCallback / cursorSelectionMarkers for taps; a tapped
// cluster is expanded with GemMapRN.expandCluster. The campsites are a small
// inline sample dataset, drawn with the SDK's default cluster bubbles and
// markers, and taps drive a React Native info panel overlay.

import React, {useRef, useState} from 'react';
import {View, Text, StyleSheet, StatusBar, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Coordinates,
  Color,
  Marker,
  MarkerCollection,
  MarkerCollectionRenderSettings,
  MarkerJson,
  MarkerRenderSettings,
  MarkerWithRenderSettings,
  MarkerLabelingMode,
  MarkerType,
  GemAnimation,
  AnimationType,
  type MarkerMatch,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

// Continental-US start view, so the whole campground spread is visible.
const US_CENTER = new Coordinates({latitude: 39.5, longitude: -98.35});
const US_ZOOM = 9;
// The zoom a tapped campsite is shown at, or closer if the map already is. Without a zoom level,
// centerOnCoordinates zooms in to street level, where a backcountry campsite shows an empty map.
const PIN_ZOOM = 60;

const COLLECTION_NAME = 'campsites';

// Converts a 0–22 web-map zoom to a Magic Lane zoom level.
function toMagicLaneZoom(appZoom: number): number {
  const clamped = Math.min(Math.max(appZoom, 0), 22);
  return Math.trunc(clamped * 7 + 4);
}

// Cluster (group) markers up to app-zoom 6; break into pins above it.
const CLUSTER_ZOOM = toMagicLaneZoom(6);

type CampsiteMeta = {id?: number; name?: string; bookable?: boolean};

class Campsite {
  constructor(
    readonly id: number,
    readonly name: string,
    readonly isBookable: boolean,
    readonly latitude: number,
    readonly longitude: number,
  ) {}

  // Marker name carried into the SDK, JSON-encoded so a tapped marker can recover
  // its metadata straight from its name (the only per-marker channel the SDK has).
  get markerName(): string {
    return JSON.stringify({id: this.id, name: this.name, bookable: this.isBookable});
  }

  static decodeMarkerName(raw: string): CampsiteMeta | null {
    if (!raw) return null;
    try {
      const decoded = JSON.parse(raw);
      if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
        return decoded as CampsiteMeta;
      }
    } catch {
      // Not our JSON payload (e.g. a cluster bubble).
    }
    return null;
  }
}

// A small inline sample of campsites. A real app would load its data from a
// bundled GeoJSON file or a service.
const SAMPLE_CAMPSITES: Campsite[] = [
  new Campsite(1, 'Yosemite Pines', false, 37.7456, -119.5936),
  new Campsite(2, 'Half Dome Village', true, 37.7402, -119.5583),
  new Campsite(3, 'Grand Canyon North', false, 36.2135, -112.0572),
  new Campsite(4, 'Zion Watchman', true, 37.1986, -112.9852),
  new Campsite(5, 'Yellowstone Madison', false, 44.6457, -110.8599),
  new Campsite(6, 'Yellowstone Canyon', true, 44.7352, -110.4927),
  new Campsite(7, 'Rocky Mountain Moraine', false, 40.3517, -105.6091),
  new Campsite(8, 'Great Smoky Elkmont', true, 35.6586, -83.5836),
  new Campsite(9, 'Acadia Blackwoods', false, 44.3053, -68.2461),
  new Campsite(10, 'Everglades Flamingo', true, 25.1412, -80.9073),
  new Campsite(11, 'Big Sur Pfeiffer', false, 36.2497, -121.7828),
  new Campsite(12, 'Joshua Tree Jumbo', true, 33.9956, -116.0661),
  new Campsite(13, 'Olympic Kalaloch', false, 47.6126, -124.3722),
  new Campsite(14, 'Glacier Apgar', true, 48.5222, -113.9896),
];

export default function App() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [status, setStatus] = useState('Loading map…');
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Campsite | null>(null);
  const mapRef = useRef<any>(null);
  // Guards against a second press adding the collections again before the
  // button disappears.
  const loadedRef = useRef(false);

  const showMessage = (message: string) => setStatus(message);

  // Two overlapping SDK-drawn collections grouped at the same zoom:
  //   1. CLUSTER layer - one marker per campsite, collection-level settings only;
  //      the SDK groups them into count bubbles.
  //   2. DETAIL layer - one marker per campsite via the optimised addList path,
  //      carrying the JSON name so a tapped pin recovers its metadata.
  const renderCampsites = (campsites: Campsite[]) => {
    const map = mapRef.current;
    if (!map) return;

    // 1) Cluster layer - count-bearing bubbles.
    const clusterCollection = MarkerCollection.create(
      MarkerType.Point,
      `${COLLECTION_NAME}-clustered`,
    );
    for (const c of campsites) {
      const marker = Marker.fromCoords([
        new Coordinates({latitude: c.latitude, longitude: c.longitude}),
      ]);
      // A campsite outside any cluster is drawn and tapped through this layer,
      // and the tap handler reads the campsite from the marker name.
      marker.name = c.markerName;
      clusterCollection.add(marker);
    }

    const clusterSettings = new MarkerCollectionRenderSettings({
      pointsGroupingZoomLevel: CLUSTER_ZOOM,
      buildPointsGroupConfig: true,
      labelGroupTextSize: 2.7,
      labelingMode: new Set([
        MarkerLabelingMode.GroupLabelVisible,
        MarkerLabelingMode.GroupCenter,
      ]),
      // Custom cluster artwork goes here
      // (lowDensity/mediumDensity/highDensityPointsGroupImage + a transparent
      // image for loose singles). Without it the SDK's default cluster bubble
      // artwork is used.
    });
    // White count on the bubble; the default is transparent (invisible).
    clusterSettings.labelGroupTextColor = new Color(255, 255, 255, 255);
    map.preferences.markers.add(clusterCollection, {settings: clusterSettings});

    // 2) Detail layer - one named marker per campsite via addList.
    const markers: MarkerWithRenderSettings[] = campsites.map(
      c =>
        new MarkerWithRenderSettings(
          new MarkerJson({
            coords: [new Coordinates({latitude: c.latitude, longitude: c.longitude})],
            name: c.markerName,
          }),
          new MarkerRenderSettings({
            // A per-type pin image would go here; without one the default pin
            // is used. The bookable flag rides along in the marker name.
            imageSize: 6,
            labelingMode: new Set([MarkerLabelingMode.IconBottomCenter]),
          }),
        ),
    );

    const detailSettings = new MarkerCollectionRenderSettings({
      pointsGroupingZoomLevel: CLUSTER_ZOOM,
      buildPointsGroupConfig: true,
      labelGroupTextSize: 0,
      labelingMode: new Set([MarkerLabelingMode.IconBottomCenter]),
    });

    map.preferences.markers.addList({
      list: markers,
      settings: detailSettings,
      name: `${COLLECTION_NAME}-detail`,
      markerType: MarkerType.Point,
    });
  };

  const loadCampsites = () => {
    if (!mapRef.current || loadedRef.current) return;
    loadedRef.current = true;
    renderCampsites(SAMPLE_CAMPSITES);
    setLoaded(true);
    showMessage(`Rendered ${SAMPLE_CAMPSITES.length} campsites`);
  };

  // A detail pin carries our JSON name; a cluster-layer marker carries none.
  const campsiteFromMarker = (marker: Marker): Campsite | null => {
    const meta = Campsite.decodeMarkerName(marker.name);
    if (!meta || meta.id === undefined) return null;
    const coords = marker.getCoordinates();
    if (coords.length === 0) return null;
    const point = coords[0];
    return new Campsite(
      meta.id,
      meta.name ?? '',
      meta.bookable === true,
      point.latitude,
      point.longitude,
    );
  };

  // The markers of the matches. getMarker() returns null for a match that no
  // longer exists; that match is skipped.
  const matchedMarkers = (matches: MarkerMatch[]): Marker[] => {
    const markers: Marker[] = [];
    for (const m of matches) {
      const marker = m.getMarker();
      if (marker) markers.push(marker);
    }
    return markers;
  };

  // (The TS SDK's MarkerMatch doesn't expose MarkerMatchType, so a pin is
  // recognised by its name.)
  const findPin = (markers: Marker[]): Campsite | null => {
    for (const marker of markers) {
      const pin = campsiteFromMarker(marker);
      if (pin) return pin;
    }
    return null;
  };

  const registerTapHandler = (map: any) => {
    map.registerTouchCallback(async (pos: {x: number; y: number}) => {
      // A cluster first: expandCluster zooms in until its
      // members separate, or hands them to onMembers when they sit too close for
      // that. It returns false when no cluster is under the tap. A detail-layer
      // cluster is headed by a named marker, so this check must come before the
      // pin lookup.
      let showedMembers = false;
      const expanded = await map.expandCluster(pos, {
        onMembers: (members: Marker[]) => {
          // React Native has no on-screen fan-out: show the first campsite of
          // the group and how many share the spot.
          showedMembers = true;
          setSelected(
            members.map(campsiteFromMarker).find(c => c !== null) ?? null,
          );
          showMessage(`${members.length} campsites at this spot`);
        },
      });
      if (expanded) {
        if (!showedMembers) setSelected(null);
        return;
      }

      // expandCluster already moved the cursor to the tap (setting it is async
      // and must be awaited before reading the selection). A tap whose matches
      // no longer exist does nothing, like a tap on the empty map.
      const markers = matchedMarkers(map.cursorSelectionMarkers() ?? []);
      if (markers.length === 0) return;

      const pin = findPin(markers);

      if (!pin) {
        // Not an expandable group after all - legacy zoom step.
        const target = Math.min(Math.max(map.zoomLevel + 12, 0), 90);
        map.centerOnCoordinates(map.transformScreenToWgs(pos), {
          zoomLevel: Math.trunc(target),
          animation: new GemAnimation({type: AnimationType.linear, duration: 500}),
        });
        setSelected(null);
        return;
      }

      // Otherwise a single campsite → centre on it and show its info panel.
      map.centerOnCoordinates(
        new Coordinates({latitude: pin.latitude, longitude: pin.longitude}),
        {
          zoomLevel: Math.max(map.zoomLevel, PIN_ZOOM),
          animation: new GemAnimation({type: AnimationType.linear, duration: 400}),
        },
      );
      setSelected(pin);
    });
  };

  const onMapReady = (map: any) => {
    mapRef.current = map;
    setGemMap(map);
    setStatus('Tap "Load campsites" to begin.');

    // Enable the (invisible) cursor so tap → marker selection works.
    map.preferences.enableCursor = true;
    map.preferences.enableCursorRender = false;

    map.centerOnCoordinates(US_CENTER, {zoomLevel: US_ZOOM});
    registerTapHandler(map);
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
      <SafeAreaView style={styles.safeOverlay} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.header}>Marker Clustering</Text>
          {!loaded ? (
            <TouchableOpacity
              style={[styles.btn, styles.btnGreen, !gemMap && styles.btnDisabled]}
              onPress={loadCampsites}
              disabled={!gemMap}>
              <Text style={styles.btnText}>📍 Load campsites</Text>
            </TouchableOpacity>
          ) : null}
          {status ? <Text style={styles.status}>{status}</Text> : null}
        </View>
      </SafeAreaView>

      {/* Tapped-pin info panel. */}
      {selected ? (
        <SafeAreaView style={styles.infoWrap} pointerEvents="box-none">
          <View style={styles.infoPanel}>
            <View
              style={[
                styles.dot,
                {backgroundColor: selected.isBookable ? '#DD3137' : '#007228'},
              ]}
            />
            <View style={styles.infoBody}>
              <Text style={styles.infoTitle}>
                {selected.name || `Campsite #${selected.id}`}
              </Text>
              <Text style={styles.infoSub}>
                {selected.isBookable ? 'Bookable' : 'Info only'}
              </Text>
              <Text style={styles.infoCoord}>
                {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSelected(null)}>
              <Text style={styles.closeGlyph}>✕</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      ) : null}
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
  btn: {paddingHorizontal: 18, paddingVertical: 12, borderRadius: 24},
  btnDisabled: {opacity: 0.5},
  btnText: {color: '#fff', fontWeight: '600'},
  btnGreen: {backgroundColor: '#0C4B22'},
  status: {marginTop: 10, color: '#333', textAlign: 'center'},
  infoWrap: {position: 'absolute', left: 0, right: 0, bottom: 0},
  infoPanel: {
    margin: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    elevation: 6,
  },
  dot: {width: 12, height: 12, borderRadius: 6, marginTop: 4, marginRight: 10},
  infoBody: {flex: 1},
  infoTitle: {fontSize: 16, fontWeight: '600', color: '#222'},
  infoSub: {fontSize: 14, color: '#616161', marginTop: 2},
  infoCoord: {fontSize: 13, color: '#757575', marginTop: 2},
  closeGlyph: {fontSize: 18, color: '#616161', paddingHorizontal: 8},
});
