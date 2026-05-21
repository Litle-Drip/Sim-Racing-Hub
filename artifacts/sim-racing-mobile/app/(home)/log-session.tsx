import { useCreateSession } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { F1_TRACKS, TIRE_COMPOUNDS, SESSION_TYPES, CONDITIONS, ASSISTS } from "@/data/tracks";

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function OptionPicker<T extends string>({
  label,
  options,
  value,
  onChange,
  colors,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[pickerStyles.label, { color: colors.grayLight }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={pickerStyles.optionRow}>
          {options.map((opt) => (
            <Pressable
              key={opt}
              onPress={() => onChange(opt)}
              style={[
                pickerStyles.option,
                {
                  backgroundColor: value === opt ? colors.primary : colors.secondary,
                  borderColor: value === opt ? colors.primary : colors.input,
                },
              ]}
            >
              <Text
                style={[
                  pickerStyles.optionText,
                  { color: value === opt ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {opt}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: "600" as const,
    letterSpacing: 1,
    marginBottom: 8,
    fontFamily: "Inter_600SemiBold",
  },
  optionRow: { flexDirection: "row", gap: 8 },
  option: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  optionText: {
    fontSize: 13,
    fontWeight: "500" as const,
    fontFamily: "Inter_500Medium",
  },
});

function LapTimeInput({
  label,
  value,
  onChange,
  colors,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[pickerStyles.label, { color: colors.grayLight }]}>{label}</Text>
      <TextInput
        style={{
          backgroundColor: colors.secondary,
          borderWidth: 1,
          borderColor: colors.input,
          borderRadius: 6,
          paddingHorizontal: 12,
          paddingVertical: 11,
          color: colors.teal,
          fontSize: 14,
          fontFamily: "Inter_600SemiBold",
        }}
        value={value}
        onChangeText={onChange}
        placeholder="1:23.456"
        placeholderTextColor={colors.mutedForeground}
        keyboardType="numbers-and-punctuation"
      />
    </View>
  );
}

export default function LogSessionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const today = new Date().toISOString().split("T")[0];

  const [date, setDate] = useState(today);
  const [trackId, setTrackId] = useState<string>(F1_TRACKS[0].id);
  const [car, setCar] = useState("");
  const [type, setType] = useState<string>(SESSION_TYPES[0]);
  const [bestLap, setBestLap] = useState("");
  const [avgLap, setAvgLap] = useState("");
  const [worstLap, setWorstLap] = useState("");
  const [s1, setS1] = useState("");
  const [s2, setS2] = useState("");
  const [s3, setS3] = useState("");
  const [tires, setTires] = useState<string>(TIRE_COMPOUNDS[0]);
  const [fuelLoad, setFuelLoad] = useState("50");
  const [conditions, setConditions] = useState<string>(CONDITIONS[0]);
  const [assists, setAssists] = useState<string>(ASSISTS[0]);
  const [rating, setRating] = useState(3);
  const [notes, setNotes] = useState("");

  const { mutate: createSession, isPending } = useCreateSession({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      },
    },
  });

  const handleSubmit = () => {
    if (!car.trim() || !bestLap.trim()) return;
    createSession({
      data: {
        id: generateId(),
        date,
        trackId,
        car: car.trim(),
        type,
        bestLap,
        avgLap: avgLap || bestLap,
        worstLap: worstLap || bestLap,
        s1: s1 || "--",
        s2: s2 || "--",
        s3: s3 || "--",
        tires,
        fuelLoad: parseFloat(fuelLoad) || 50,
        conditions,
        assists,
        rating,
        notes: notes.trim(),
      },
    });
  };

  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.card },
    scroll: { flex: 1 },
    scrollContent: {
      padding: 20,
      paddingBottom: botPad + 20,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: "700" as const,
      color: colors.mutedForeground,
      letterSpacing: 2,
      marginBottom: 16,
      marginTop: 8,
      fontFamily: "Inter_700Bold",
    },
    divider: { height: 1, backgroundColor: colors.border, marginBottom: 20 },
    label: {
      fontSize: 12,
      fontWeight: "600" as const,
      color: colors.grayLight,
      letterSpacing: 1,
      marginBottom: 8,
      fontFamily: "Inter_600SemiBold",
    },
    input: {
      backgroundColor: colors.secondary,
      borderWidth: 1,
      borderColor: colors.input,
      borderRadius: 6,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.foreground,
      fontSize: 15,
      marginBottom: 16,
      fontFamily: "Inter_400Regular",
    },
    row: { flexDirection: "row", gap: 12, marginBottom: 16 },
    ratingRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
    ratingBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
    },
    ratingText: {
      fontSize: 16,
      fontWeight: "700" as const,
      fontFamily: "Inter_700Bold",
    },
    submitBtn: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingVertical: 16,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
    },
    submitText: {
      color: colors.primaryForeground,
      fontSize: 16,
      fontWeight: "700" as const,
      letterSpacing: 1,
      fontFamily: "Inter_700Bold",
    },
    disabledBtn: { opacity: 0.4 },
    trackGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 16,
    },
    trackOption: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 6,
      borderWidth: 1,
    },
    trackText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
    },
  });

  return (
    <View style={s.container}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.sectionTitle}>SESSION INFO</Text>

        <Text style={s.label}>DATE</Text>
        <TextInput
          style={s.input}
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.mutedForeground}
        />

        <Text style={s.label}>TRACK</Text>
        <View style={s.trackGrid}>
          {F1_TRACKS.map((track) => (
            <Pressable
              key={track.id}
              onPress={() => setTrackId(track.id)}
              style={[
                s.trackOption,
                {
                  backgroundColor: trackId === track.id ? colors.primary : colors.secondary,
                  borderColor: trackId === track.id ? colors.primary : colors.input,
                },
              ]}
            >
              <Text
                style={[
                  s.trackText,
                  { color: trackId === track.id ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {track.short}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={s.label}>CAR</Text>
        <TextInput
          style={s.input}
          value={car}
          onChangeText={setCar}
          placeholder="e.g. Ferrari SF-24"
          placeholderTextColor={colors.mutedForeground}
          testID="car-input"
        />

        <OptionPicker
          label="SESSION TYPE"
          options={SESSION_TYPES}
          value={type}
          onChange={setType}
          colors={colors}
        />

        <View style={s.divider} />
        <Text style={s.sectionTitle}>LAP TIMES</Text>

        <View style={s.row}>
          <LapTimeInput label="BEST LAP" value={bestLap} onChange={setBestLap} colors={colors} />
          <LapTimeInput label="AVG LAP" value={avgLap} onChange={setAvgLap} colors={colors} />
          <LapTimeInput label="WORST LAP" value={worstLap} onChange={setWorstLap} colors={colors} />
        </View>

        <View style={s.row}>
          <LapTimeInput label="S1" value={s1} onChange={setS1} colors={colors} />
          <LapTimeInput label="S2" value={s2} onChange={setS2} colors={colors} />
          <LapTimeInput label="S3" value={s3} onChange={setS3} colors={colors} />
        </View>

        <View style={s.divider} />
        <Text style={s.sectionTitle}>CONDITIONS</Text>

        <OptionPicker
          label="TIRES"
          options={TIRE_COMPOUNDS}
          value={tires}
          onChange={setTires}
          colors={colors}
        />
        <OptionPicker
          label="CONDITIONS"
          options={CONDITIONS}
          value={conditions}
          onChange={setConditions}
          colors={colors}
        />
        <OptionPicker
          label="ASSISTS"
          options={ASSISTS}
          value={assists}
          onChange={setAssists}
          colors={colors}
        />

        <Text style={s.label}>FUEL LOAD (kg)</Text>
        <TextInput
          style={s.input}
          value={fuelLoad}
          onChangeText={setFuelLoad}
          keyboardType="numeric"
          placeholder="50"
          placeholderTextColor={colors.mutedForeground}
        />

        <View style={s.divider} />
        <Text style={s.sectionTitle}>RATING</Text>

        <View style={s.ratingRow}>
          {[1, 2, 3, 4, 5].map((r) => (
            <Pressable
              key={r}
              onPress={() => setRating(r)}
              style={[
                s.ratingBtn,
                {
                  backgroundColor: rating >= r ? colors.redDim : colors.secondary,
                  borderColor: rating >= r ? colors.primary : colors.input,
                },
              ]}
            >
              <Text style={[s.ratingText, { color: rating >= r ? colors.primary : colors.mutedForeground }]}>
                {r}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={s.label}>NOTES</Text>
        <TextInput
          style={[s.input, { height: 80, textAlignVertical: "top", paddingTop: 12 }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Session notes, setup changes, observations..."
          placeholderTextColor={colors.mutedForeground}
          multiline
          numberOfLines={3}
        />

        <Pressable
          style={({ pressed }) => [
            s.submitBtn,
            (!car.trim() || !bestLap.trim() || isPending) && s.disabledBtn,
            { opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={handleSubmit}
          disabled={!car.trim() || !bestLap.trim() || isPending}
          testID="submit-session"
        >
          {isPending ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color={colors.primaryForeground} />
              <Text style={s.submitText}>LOG SESSION</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}
