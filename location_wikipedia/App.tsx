// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// This app searches for a landmark, asks ExternalInfoService for its Wikipedia
// article, and shows the title, summary and image in a native card. The web
// demo rendered the article in a DOM modal with an <img>; here the same remote
// content is shown with RN <Text>/<ScrollView>/<Image> (no browser DOM).

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Coordinates,
  SearchService,
  ExternalInfoService,
  ExternalInfo,
  Landmark,
  GemError,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

type WikiResult = {title: string; content: string; imageUrl?: string};

// Wikimedia refuses requests without a descriptive User-Agent (HTTP 403), and
// React Native's image loader sends a generic one, so the image request names
// the app.
const WIKIMEDIA_HEADERS = {
  'User-Agent': 'MagicLaneMapsSDKExample (https://developer.magiclane.com)',
};

// The SDK returns the article summary as HTML; strip tags for plain-text display.
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

export default function App() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [status, setStatus] = useState('Loading map…');
  const [loading, setLoading] = useState(false);
  const [wiki, setWiki] = useState<WikiResult | null>(null);

  const onWikipediaTap = async () => {
    if (!gemMap || loading) {
      return;
    }
    setLoading(true);
    setWiki(null);
    setStatus('Searching Wikipedia info…');

    // 1. Search for the landmark (Statue of Liberty).
    const searchResult = await new Promise<Landmark[]>(resolve => {
      SearchService.search({
        textFilter: 'Statue of Liberty',
        referenceCoordinates: new Coordinates({
          latitude: 40.53859,
          longitude: -73.91619,
        }),
        onCompleteCallback: (_err: GemError, lmks: Landmark[]) => resolve(lmks),
      });
    });

    const lmk = searchResult[0];
    if (!lmk || !ExternalInfoService.hasWikiInfo(lmk)) {
      setWiki({
        title: 'Wikipedia info not available',
        content: 'The landmark does not have Wikipedia info.',
      });
      setStatus('No Wikipedia info.');
      setLoading(false);
      return;
    }

    // 2. Request the Wikipedia article for the landmark.
    const externalInfo = await new Promise<ExternalInfo | null>(resolve => {
      ExternalInfoService.requestWikiInfo(
        lmk,
        (_err: GemError, info: ExternalInfo | null) => resolve(info),
      );
    });

    if (!externalInfo) {
      setWiki({
        title: 'Query failed',
        content: 'The request to Wikipedia failed.',
      });
      setStatus('Query failed.');
      setLoading(false);
      return;
    }

    // The image URLs come with the page, so the first one can be read at once.
    // (requestWikiImageInfo would only fetch the image's description text.)
    const imageUrl = externalInfo.getWikiImageUrl(0);

    setWiki({
      title: externalInfo.wikiPageTitle,
      content: stripHtml(externalInfo.wikiPageDescription),
      imageUrl: imageUrl || undefined,
    });
    setStatus('Loaded.');
    setLoading(false);
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
        <View style={styles.card}>
          <Text style={styles.header}>Location Wikipedia</Text>
          <TouchableOpacity
            style={[styles.btnPurple, (!gemMap || loading) && styles.btnDisabled]}
            onPress={onWikipediaTap}
            disabled={!gemMap || loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Wikipedia</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.status}>{status}</Text>

          {wiki ? (
            <ScrollView style={styles.article}>
              <View style={styles.articleHeader}>
                <Text style={styles.articleTitle}>{wiki.title}</Text>
                <TouchableOpacity onPress={() => setWiki(null)}>
                  <Text style={styles.close}>✕</Text>
                </TouchableOpacity>
              </View>
              {wiki.imageUrl ? (
                <Image
                  source={{uri: wiki.imageUrl, headers: WIKIMEDIA_HEADERS}}
                  style={styles.image}
                  resizeMode="cover"
                />
              ) : null}
              <Text style={styles.articleBody}>{wiki.content}</Text>
            </ScrollView>
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
    maxHeight: '85%',
  },
  header: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    color: '#333',
    textAlign: 'center',
  },
  article: {marginTop: 12},
  articleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  articleTitle: {flex: 1, fontSize: 20, fontWeight: '700', color: '#333'},
  close: {fontSize: 18, color: '#666', paddingHorizontal: 8},
  image: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: '#eee',
  },
  articleBody: {fontSize: 15, lineHeight: 22, color: '#555'},
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
