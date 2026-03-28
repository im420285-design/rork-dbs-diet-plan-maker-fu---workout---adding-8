import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, ActivityIndicator, Platform, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { X, Camera, StopCircle, Sparkles } from 'lucide-react-native';
import { generateObject } from '@rork/toolkit-sdk';
import { z } from 'zod';
import VideoFrameExtractor from './VideoFrameExtractor';

interface FormCheckModalProps {
  visible: boolean;
  onClose: () => void;
  exerciseName: string;
  exerciseNameAr: string;
}

type TimelineIssue = {
  second: number;
  labelAr: string;
  suggestionAr: string;
  severity: 'low' | 'medium' | 'high';
};

type AnalysisResult = {
  score: number;
  summaryAr: string;
  issuesAr: string[];
  tipsAr: string[];
  timeline: TimelineIssue[];
};

type ExtractedFrame = { uri: string; timeMs: number };

async function uriToBase64(uri: string): Promise<string> {
  const res = await fetch(uri);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function FormCheckModal({ visible, onClose, exerciseName, exerciseNameAr }: FormCheckModalProps) {
  const [permissionResponse, requestPermission] = ImagePicker.useCameraPermissions();
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [frames, setFrames] = useState<ExtractedFrame[]>([]);
  const [sourceVideoUri, setSourceVideoUri] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setIsRecording(false);
      setFrames([]);
      setIsAnalyzing(false);
      setResult(null);
      setErrorText(null);
    }
  }, [visible]);

  const canUseCamera = useMemo(() => {
    if (!permissionResponse) return false;
    return permissionResponse.granted === true;
  }, [permissionResponse]);

  const startSession = useCallback(async () => {
    if (!canUseCamera) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('إذن الكاميرا مطلوب', 'يرجى منح إذن الكاميرا لبدء التحقق');
        return;
      }
    }

    setIsRecording(true);
    setFrames([]);
    setResult(null);
    setErrorText(null);

    try {
      const framesLocal: ExtractedFrame[] = [];
      for (let i = 0; i < 6; i++) {
        const res = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: false,
          quality: 0.6,
          base64: true,
        });
        if (res.canceled) break;
        const asset = res.assets?.[0];
        if (asset?.base64) {
          framesLocal.push({ uri: `data:image/jpeg;base64,${asset.base64}`, timeMs: i * 500 });
        } else if (asset?.uri) {
          try {
            const b64 = await uriToBase64(asset.uri);
            framesLocal.push({ uri: b64, timeMs: i * 500 });
          } catch (err) {
            console.log('convert uri to base64 failed', err);
          }
        }
      }
      setFrames(framesLocal);
    } catch (e) {
      console.log('startSession error', e);
    } finally {
      setIsRecording(false);
    }
  }, [canUseCamera, requestPermission]);

  const analyze = useCallback(async () => {
    if (frames.length === 0) {
      Alert.alert('لا فيديو', 'من فضلك ارفع فيديو أو التقط لقطات أولاً');
      return;
    }

    setIsAnalyzing(true);
    setErrorText(null);

    try {
      const messages = [
        { role: 'user', content: [{ type: 'text', text: `حلل فيديو أداء التمرين: ${exerciseName} (${exerciseNameAr}). قيّم الدقة (0-100). استخرج المشكلات مع توقيتها بالثواني، وقدّم اقتراح تصحيح مختصر لكل مشكلة. أعد إجاباتك بالعربية فقط.` }] },
        {
          role: 'user',
          content: frames.slice(0, 16).map((f) => ({ type: 'image', image: f.uri }))
        }
      ] as any;

      const schema = z.object({
        score: z.number().min(0).max(100),
        summaryAr: z.string(),
        issuesAr: z.array(z.string()),
        tipsAr: z.array(z.string()),
        timeline: z.array(z.object({
          second: z.number().min(0),
          labelAr: z.string(),
          suggestionAr: z.string(),
          severity: z.enum(['low','medium','high'])
        })).default([]),
      });

      const data = await generateObject({ messages, schema });
      const parsed = data as AnalysisResult;
      setResult(parsed);
    } catch (err) {
      console.log('analyze error', err);
      setErrorText('حصل خطأ أثناء التحليل. حاول مرة أخرى.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [frames, exerciseName, exerciseNameAr]);

  const onFramesExtracted = useCallback((extracted: ExtractedFrame[], uri: string) => {
    setFrames(extracted);
    setSourceVideoUri(uri);
  }, []);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.close} testID="formCheckClose">
            <X size={24} color="#111" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>تحقق الأداء</Text>
            <Text style={styles.subtitle}>{exerciseNameAr} • {exerciseName}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.preview}>
            <VideoFrameExtractor onFramesExtracted={onFramesExtracted} />
          </View>

          {frames.length > 0 && (
            <View style={{ gap: 12 }}>
              <View style={styles.framesRow}>
                {frames.slice(0, 12).map((f, idx) => (
                  <View key={idx} style={styles.thumb}>
                    <View accessibilityLabel={`frame-${idx}`} testID={`frame-${idx}`}>
                      <View style={styles.thumbImg} />
                    </View>
                  </View>
                ))}
                <Text style={styles.framesCount}>لقطات: {frames.length}</Text>
              </View>

              {result?.timeline && result.timeline.length > 0 && (
                <View style={styles.timelineBlock}>
                  <Text style={styles.timelineTitle}>شريط التمرين</Text>
                  <View style={styles.timelineBar}>
                    {(() => {
                      const totalSec = Math.max(1, Math.round(Math.max(...frames.map(f => f.timeMs)) / 1000));
                      return result.timeline.map((it, i) => {
                        const leftPct = Math.min(100, Math.max(0, (it.second / totalSec) * 100));
                        const color = it.severity === 'high' ? '#FF3B30' : it.severity === 'medium' ? '#FF9500' : '#34C759';
                        return (
                          <View key={i} style={[styles.marker, { left: `${leftPct}%`, borderColor: color, backgroundColor: color + '20' }]}>
                            <Text style={styles.markerLabel}>{Math.round(it.second)}s</Text>
                          </View>
                        );
                      });
                    })()}
                  </View>
                  <View style={styles.timelineList}>
                    {result.timeline.map((it, i) => (
                      <View key={i} style={styles.timelineItem}>
                        <Text style={styles.timelineTime}>ثانية {Math.round(it.second)}</Text>
                        <Text style={styles.timelineIssue}>• {it.labelAr}</Text>
                        <Text style={styles.timelineTip}>↳ {it.suggestionAr}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}

          <View style={styles.actions}>
            {Platform.OS !== 'web' && (
              <TouchableOpacity
                style={[styles.actionBtn, isRecording ? styles.stop : styles.start]}
                onPress={isRecording ? () => setIsRecording(false) : startSession}
                disabled={isAnalyzing}
                testID="toggleRecord"
              >
                {isRecording ? <StopCircle size={18} color="#fff" /> : <Camera size={18} color="#fff" />}
                <Text style={styles.actionText}>{isRecording ? 'إيقاف الالتقاط' : 'فتح الكاميرا'}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.actionBtn, styles.analyzeBtn]} onPress={analyze} disabled={isAnalyzing} testID="analyzeBtn">
              {isAnalyzing ? <ActivityIndicator color="#fff" /> : <Sparkles size={18} color="#fff" />}
              <Text style={styles.actionText}>{isAnalyzing ? 'جار التحليل...' : 'حلل الفيديو بالذكاء الاصطناعي'}</Text>
            </TouchableOpacity>
          </View>

          {errorText && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorText}</Text>
            </View>
          )}

          {result && (
            <View style={styles.resultBox} testID="analysisResult">
              <Text style={styles.score}>الدقة: {Math.round(result.score)}%</Text>
              <Text style={styles.summary}>{result.summaryAr}</Text>
              {result.issuesAr.length > 0 && (
                <View style={styles.listBox}>
                  <Text style={styles.listTitle}>المشكلات</Text>
                  {result.issuesAr.map((i, idx) => (
                    <Text key={idx} style={styles.listItem}>• {i}</Text>
                  ))}
                </View>
              )}
              {result.tipsAr.length > 0 && (
                <View style={styles.listBox}>
                  <Text style={styles.listTitle}>نصائح لتحسين الأداء</Text>
                  {result.tipsAr.map((t, idx) => (
                    <Text key={idx} style={styles.listItem}>• {t}</Text>
                  ))}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  close: { padding: 8 },
  headerText: { marginLeft: 8 },
  title: { fontSize: 18, fontWeight: '700' as const, color: '#111' },
  subtitle: { fontSize: 12, color: '#666', marginTop: 2 },
  content: { padding: 16, gap: 16 },
  preview: { height: 300, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' },
  nativePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  nativeText: { color: '#fff' },
  actions: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  start: { backgroundColor: '#007AFF' },
  stop: { backgroundColor: '#FF3B30' },
  analyzeBtn: { backgroundColor: '#34C759' },
  actionText: { color: '#fff', fontWeight: '700' as const },
  framesRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const },
  thumb: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#eee', overflow: 'hidden' },
  thumbImg: { flex: 1, borderRadius: 8, backgroundColor: '#ddd' },
  framesCount: { marginLeft: 8, color: '#555' },
  timelineBlock: { gap: 8 },
  timelineTitle: { fontSize: 14, fontWeight: '700' as const, color: '#111' },
  timelineBar: { height: 10, backgroundColor: '#E6EEF9', borderRadius: 999, position: 'relative' as const },
  marker: { position: 'absolute' as const, top: -6, width: 2, height: 22, borderWidth: 2, borderRadius: 2 },
  markerLabel: { position: 'absolute' as const, top: 18, left: -14, fontSize: 10, color: '#666' },
  timelineList: { gap: 8 },
  timelineItem: { backgroundColor: '#F7FAFF', borderWidth: 1, borderColor: '#E6EEF9', borderRadius: 10, padding: 10 },
  timelineTime: { fontSize: 12, color: '#007AFF', fontWeight: '700' as const, textAlign: 'right' as const },
  timelineIssue: { fontSize: 13, color: '#1a1a1a', textAlign: 'right' as const },
  timelineTip: { fontSize: 12, color: '#444', textAlign: 'right' as const },
  errorBox: { backgroundColor: '#ffe6e6', padding: 12, borderRadius: 10 },
  errorText: { color: '#b00020' },
  resultBox: { backgroundColor: '#f8f9fa', padding: 16, borderRadius: 16, gap: 8 },
  score: { fontSize: 20, fontWeight: '700' as const, color: '#111' },
  summary: { fontSize: 14, color: '#333' },
  listBox: { marginTop: 8, gap: 4 },
  listTitle: { fontSize: 13, fontWeight: '700' as const, color: '#111' },
  listItem: { fontSize: 13, color: '#333' },
});