// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// The default position tracker is replaced with a custom arrow image, then the
// camera follows the device's live position.
//
// The SDK logic (MapSceneObject.customizeDefPositionTracker +
// PositionService.setLiveDataSource + map.startFollowingPosition) is identical to
// the web demo. The only difference is how the icon bytes reach the SDK: the web
// demo fetches ./navArrow.png from the Vite public folder, which has no RN
// equivalent (no dev web server), so the same 48×48 PNG is embedded here as
// base64 and decoded to a byte array at runtime.

import React, {useState} from 'react';
import {View, Text, StyleSheet, StatusBar, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  PositionService,
  MapSceneObject,
  SceneObjectFileFormat,
  GemAnimation,
  AnimationType,
  GemError,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

// The custom position arrow (navArrow.png from the web example's public folder),
// embedded as base64 so it ships with the JS bundle instead of being fetched.
const NAV_ARROW_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAFi0lEQVR4nO2Z7U9TZxjGn5w+5/2cnvbUlkG10wEiVCYvMkUFqWsRSkShiIKvqOCcm1Qqohjd1DjnphGzOHyfVZctCipdsn9gX7YsWbZly/ZhH7YlS+YyXYbWFwTu5ekikVKgRSg14UquT03OuX7pfT/nPvdBaEITikkxFMYeWW9qQwiVoedNDC9dlQzmR7I6CQzmF7tFRT2FniNlMLx0L29jC6jxk+HNU5+CzpTQjSiqEj0Pojnhw6QFlV129yUQtDrweH1Qve994ET5LkKIRzEuCjP8PwWvtYKz+SZghgX3+fYARFL2vF6GE/aiGJdDNlnuluzxAbHWGA8b3jsVANhwpBVYXnyIEFJRrIoVlKtp9o29TwASUjLA1bg/AECcnl/YS/PiERSjkjDN3rfXewPhiRNn22Hxpm19ADWHTwIrSH7SKigGtdGUmNVXPsRpthUwv3xVHwBxQnJaN0LIhWJNDCf9kFO5ty88cUbJZsi0l/QDKNmyAyTV+D2KMaUzgtZPTp6nAbLLGiBtXkE/APf56+RIfYwQsqBYEWaFy8n51Y+fDk+cs2IfJGbk9AMINPPCwl7MMI0oRqTXkOZ1X+oXnjh37WEwT7cOAHDteJuU0a8oFkRRuMlszfcHhycm44TRkjgAYPuFG8BLWlJGU8c7vwYz/K35NccGhCcueP00KKb4AQDEsxY5ATPcuD+Zl2rjpv4bKjzx0/NQsFc0HwZBUf8c1/Q0J36VWdYYMjxx0c5rQLNcSADPxQ7QGuJIGWWOV34rw0v+4l3XBwUo2dMBGg0O1HwoiNyyauAl3YVxSY9Z8VJyXtWAozPYLC/CG62fhASoPXaO/P6APAejnV+PBzk6gy3qJkHd8Quhy8jrA3NKevRHCwrjZvPMgvvDhSdW4iyw/p2TgwI4NzeArMZ9G838GDPc33mbWoYNT2yYMh1WvXV0UAD3+XYQFT1p5tnRAqhQEpIHPTqD/ULSLFjedHBQAI/XB7bVdSAqhi+ikp7hpC+HOjqDPdk6F5Zuax4SoP5cW9T+hUSaFe4X72oPG2Bqhi1Q50MBeLw+KKp1g6DV/0ae7mOWnma5Ey/llj8MNzxx0hwn2NdtGRbAc7EDJqek92CGrx+r/Cym2U7b1jNhhyeekeeC/Mr1wwN4fYHTihUk8uJvGguANaplZmck4YnTFlVD7rKVYQF4vD7IcbpA1Bs/G/X0NC//RF5QIgWY6VgPr5S4wgbYdvYayKqRNPTC0cw/h5PVe87mjogBZjnrIKtwSdgAHq8PlmxtIg39x6g1NM3JN1JfremJNDzxy8W1kF1YGhGA5//tRQ9FUWtGI78JM9yDwoaPIw5PnGqrgtxlVREDVOw8SN4XbpPJ5ZnSazT0gSkZjkcjCU+2FNNmL4YFy9dGDODx+iA+MbUHUVTVs849d/LrPgg/9O4bkFXeBOoUa6cGM49oTvyL4cWHhgRL19zSlbB6//GwAVyN+4FX9M/01maXjZaw5h7H9iswvWDVY4aX/Ywgf40Qqgxap2ezgvYEL+luS3pDV6ajtLdy9yFo+OjmkBCKMZ6cSNkjSk8zzOkZtnXdQwWfX3MUzNaFfrJawaxwhSy5wri0lcJ4n6gYfudEuTursBQ2HT0TEoD0jyDrTo8MgBN/IQFDBz8GqsXaSbYSFIV3IoQMI7oJQhZBq29hBakrp7gc6s+29QNYueddskMiM1LkojS4K3hwK2pqg2k5Sx6Q3qAoqnYUN80mXlE/18WZu8kXnScA5LuCoKh3RnRFhhO/iUuZ65+37gg43Jchu6IZeO2kuzQntI/ZhwqNpoKs4FNzbb1rDrSAo2YryHrTjyO9nERqlRWUnzHN+hle/g4hVIzGXjLNiwcERb3FK/pbZBKIwj0nNKEJoXHQf4SXQhOQSDisAAAAAElFTkSuQmCC';

// Decode base64 to a plain byte array (no Buffer/atob dependency in RN/Hermes).
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64ToBytes(b64: string): number[] {
  const lookup = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64_CHARS.length; i++) lookup[B64_CHARS.charCodeAt(i)] = i;
  const clean = b64.replace(/=+$/, '');
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = lookup[clean.charCodeAt(i)];
    if (v < 0) continue;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return out;
}

export default function App() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [status, setStatus] = useState('Loading map…');
  const [hasLiveDataSource, setHasLiveDataSource] = useState(false);

  const showMessage = (message: string) => setStatus(message);

  // Replace the default position tracker with the custom arrow icon.
  const setPositionTrackerImage = (scale = 1.0) => {
    try {
      const imageData = base64ToBytes(NAV_ARROW_PNG_BASE64);
      MapSceneObject.customizeDefPositionTracker(imageData, SceneObjectFileFormat.tex);
      const positionTracker = MapSceneObject.getDefPositionTracker();
      positionTracker.scale = scale;
    } catch (e) {
      showMessage('Failed to set custom position icon: ' + String(e));
    }
  };

  const onMapReady = (map: any) => {
    setGemMap(map);
    setStatus('Map Ready');
    setPositionTrackerImage(0.7);
  };

  const onFollowPositionButtonPressed = async () => {
    // Shows the Android/iOS location-permission dialog (only the first time);
    // the live data source delivers no positions without the permission.
    const permission = await PositionService.requestLocationPermission();
    if (!permission) {
      showMessage('Location permission denied. Allow it in the system settings.');
      return;
    }

    // Set the live data source only once.
    if (!hasLiveDataSource) {
      // GemError.exist: the live data source is already the current one.
      const err = PositionService.instance.setLiveDataSource();
      if (err !== GemError.success && err !== GemError.exist) {
        showMessage(`Could not start the live position (error ${err}).`);
        return;
      }
      setHasLiveDataSource(true);
    }

    const animation = new GemAnimation({type: AnimationType.linear});
    gemMap?.startFollowingPosition({animation, viewAngle: 0});
    showMessage('Following position...');
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
          <Text style={styles.header}>Custom Position Icon</Text>
          <TouchableOpacity
            style={[styles.btn, styles.btnPurple, !gemMap && styles.btnDisabled]}
            onPress={onFollowPositionButtonPressed}
            disabled={!gemMap}>
            <Text style={styles.btnText}>Follow Position</Text>
          </TouchableOpacity>
          {status ? <Text style={styles.status}>{status}</Text> : null}
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
  btn: {paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnDisabled: {opacity: 0.5},
  btnText: {color: '#fff', fontWeight: '600'},
  btnPurple: {backgroundColor: '#673ab7'},
  status: {marginTop: 10, color: '#333', textAlign: 'center'},
});
