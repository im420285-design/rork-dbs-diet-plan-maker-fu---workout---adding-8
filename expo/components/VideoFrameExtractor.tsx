import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Platform, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Film, Images, Trash2, Upload } from 'lucide-react-native';

interface ExtractedFrame {
  uri: string;
  timeMs: number;
}

interface VideoFrameExtractorProps {
  onFramesExtracted?: (frames: ExtractedFrame[], sourceVideoUri: string) => void;
}

export default function VideoFrameExtractor({ onFramesExtracted }: VideoFrameExtractorProps) {
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [frames, setFrames] = useState<ExtractedFrame[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const processingRef = useRef<boolean>(false);

  const canExtractOnDevice = Platform.OS === 'web';

  const pickVideo = useCallback(async () => {
    console.log('[VideoFrameExtractor] pickVideo start');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        quality: 1,
        allowsMultipleSelection: false,
      });

      if (result.canceled) {
        console.log('[VideoFrameExtractor] User canceled video picking');
        return;
      }

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        Alert.alert('خطأ', 'تعذر الحصول على رابط الفيديو');
        return;
      }
      console.log('[VideoFrameExtractor] Picked video URI:', asset.uri);
      setVideoUri(asset.uri);
      setFrames([]);

      if (canExtractOnDevice) {
        await extractFramesWeb(asset.uri);
      } else {
        Alert.alert('معلومة', 'استخراج اللقطات التلقائي متاح على الويب الآن. على الجوال سنرفع الفيديو للتحليل في السحابة لاحقاً.');
      }
    } catch (e) {
      console.error('[VideoFrameExtractor] pickVideo error', e);
      Alert.alert('خطأ', 'حدث خطأ أثناء اختيار الفيديو');
    }
  }, [canExtractOnDevice]);

  const clearSelection = useCallback(() => {
    setVideoUri(null);
    setFrames([]);
  }, []);

  const extractFramesWeb = useCallback(async (uri: string) => {
    if (Platform.OS !== 'web') return;
    if (processingRef.current) return;

    setIsProcessing(true);
    processingRef.current = true;

    try {
      console.log('[VideoFrameExtractor] extractFramesWeb start for', uri);
      const video = document.createElement('video');
      video.src = uri;
      video.crossOrigin = 'anonymous';
      video.muted = true;

      await new Promise<void>((resolve, reject) => {
        video.addEventListener('loadedmetadata', () => resolve(), { once: true });
        video.addEventListener('error', () => reject(new Error('فشل تحميل الفيديو')), { once: true });
      });

      const duration = video.duration; // seconds
      console.log('[VideoFrameExtractor] duration(s):', duration);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('تعذر إنشاء canvas');

      // Target width for thumbnails
      const targetW = 240;
      const scale = targetW / (video.videoWidth || targetW);
      canvas.width = Math.max(1, Math.floor(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.floor(video.videoHeight * scale));

      const intervalSec = 0.5; // every 500ms
      const captureTimes: number[] = [];
      for (let t = 0; t <= duration; t += intervalSec) {
        captureTimes.push(Number(t.toFixed(2)));
      }

      const newFrames: ExtractedFrame[] = [];

      for (let i = 0; i < captureTimes.length; i++) {
        const t = captureTimes[i];
        // Seek
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            resolve();
          };
          video.currentTime = t;
          video.addEventListener('seeked', onSeeked, { once: true });
        });

        ctx.drawImage(video as HTMLVideoElement, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        newFrames.push({ uri: dataUrl, timeMs: Math.round(t * 1000) });

        if (i % 8 === 0) {
          setFrames((prev) => [...prev, ...newFrames.splice(0)]);
        }
      }

      if (newFrames.length) setFrames((prev) => [...prev, ...newFrames]);
      const allFrames = [...frames, ...newFrames];
      onFramesExtracted?.(allFrames, uri);
      console.log('[VideoFrameExtractor] extracted frames count:', allFrames.length);
    } catch (e) {
      console.error('[VideoFrameExtractor] extractFramesWeb error', e);
      Alert.alert('خطأ', 'تعذر استخراج لقطات الفيديو على الويب');
    } finally {
      setIsProcessing(false);
      processingRef.current = false;
    }
  }, [onFramesExtracted, frames]);

  const headerNote = useMemo(() => (
    canExtractOnDevice
      ? 'ارفع فيديو وسيتم استخراج اللقطات تلقائياً وتحليله'
      : 'ارفع فيديو. على الجوال سنحلل الفيديو عبر السحابة قريباً'
  ), [canExtractOnDevice]);

  return (
    <View style={styles.container} testID="video-extractor">
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }} />
        <Text style={styles.headerText}>{headerNote}</Text>
      </View>

      {!videoUri ? (
        <TouchableOpacity style={styles.pickButton} onPress={pickVideo} testID="pick-video-btn">
          <Upload color="#fff" size={20} />
          <Text style={styles.pickText}>ارفع فيديو</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={pickVideo} testID="replace-video-btn">
            <Film color="#007AFF" size={18} />
            <Text style={styles.secondaryText}>تبديل الفيديو</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dangerBtn} onPress={clearSelection} testID="clear-video-btn">
            <Trash2 color="#fff" size={18} />
            <Text style={styles.dangerText}>إزالة</Text>
          </TouchableOpacity>
        </View>
      )}

      {isProcessing && (
        <View style={styles.processingRow}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.processingText}>جارٍ استخراج اللقطات...</Text>
        </View>
      )}

      {frames.length > 0 && (
        <View style={styles.framesBlock}>
          <View style={styles.framesHeader}>
            <Images color="#1a1a1a" size={18} />
            <Text style={styles.framesTitle}>لقطات مستخرجة</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.framesScroll} testID="frames-scroll">
            <View style={styles.framesRow}>
              {frames.map((f, idx) => (
                <View key={`${f.timeMs}-${idx}`} style={styles.thumbWrap} testID={`frame-${idx}`}>
                  <Image source={{ uri: f.uri }} style={styles.thumbnail} />
                  <Text style={styles.timeBadge}>{Math.round(f.timeMs / 1000)}s</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F7FAFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E6EEF9',
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'flex-end' as const,
  },
  headerText: {
    color: '#1a1a1a',
    fontSize: 14,
    fontWeight: '600' as const,
    textAlign: 'right' as const,
  },
  pickButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  pickText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  actionsRow: {
    flexDirection: 'row' as const,
    gap: 10,
    justifyContent: 'space-between' as const,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#CCE0FF',
    borderRadius: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    paddingVertical: 10,
  },
  secondaryText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '700' as const,
  },
  dangerBtn: {
    flex: 1,
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    paddingVertical: 10,
  },
  dangerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700' as const,
  },
  processingRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  processingText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  framesBlock: {
    gap: 8,
  },
  framesHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  framesTitle: {
    color: '#1a1a1a',
    fontSize: 14,
    fontWeight: '700' as const,
  },
  framesScroll: {
    maxHeight: 120,
  },
  framesRow: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  thumbWrap: {
    position: 'relative' as const,
    width: 120,
    height: 80,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E6EEF9',
    backgroundColor: '#fff',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover' as const,
  },
  timeBadge: {
    position: 'absolute' as const,
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#fff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: '700' as const,
  },
});