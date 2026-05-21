import { useCreateSetup } from "@workspace/api-client-react";
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
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { F1_TRACKS } from "@/data/tracks";

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  colors,
  keyboardType = "default",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  colors: ReturnType<typeof useColors>;
  keyboardType?: "default" | "numbers-and-punctuation" | "numeric";
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[fStyles.label, { color: colors.grayLight }]}>{label}</Text>
      <TextInput
        style={[fStyles.input, { backgroundColor: colors.secondary, borderColor: colors.input, color: colors.foreground }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? label.toLowerCase()}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType}
      />
    </View>
  );
}

const fStyles = StyleSheet.create({
  label: {
    fontSize: 11,
    fontWeight: "600" as const,
    letterSpacing: 1,
    marginBottom: 6,
    fontFamily: "Inter_600SemiBold",
  },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});

export default function CreateSetupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const today = new Date().toISOString().split("T")[0];

  const [label, setLabel] = useState("");
  const [car, setCar] = useState("");
  const [trackId, setTrackId] = useState(F1_TRACKS[0].id);
  const [tag, setTag] = useState("");
  const [date, setDate] = useState(today);
  const [frontWing, setFrontWing] = useState("");
  const [rearWing, setRearWing] = useState("");
  const [frontARB, setFrontARB] = useState("");
  const [rearARB, setRearARB] = useState("");
  const [frontRideHeight, setFrontRideHeight] = useState("");
  const [rearRideHeight, setRearRideHeight] = useState("");
  const [frontSprings, setFrontSprings] = useState("");
  const [rearSprings, setRearSprings] = useState("");
  const [brakeBias, setBrakeBias] = useState("");
  const [brakePressure, setBrakePressure] = useState("");
  const [onThrottle, setOnThrottle] = useState("");
  const [offThrottle, setOffThrottle] = useState("");
  const [notes, setNotes] = useState("");

  const { mutate: createSetup, isPending } = useCreateSetup({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/setups"] });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      },
    },
  });

  const handleSubmit = () => {
    if (!label.trim() || !car.trim()) return;
    createSetup({
      data: {
        id: generateId(),
        label: label.trim(),
        car: car.trim(),
        trackId,
        tag: tag.trim(),
        date,
        frontWing: frontWing || "0",
        rearWing: rearWing || "0",
        frontARB: frontARB || "0",
        rearARB: rearARB || "0",
        frontRideHeight: frontRideHeight || "0",
        rearRideHeight: rearRideHeight || "0",
        frontSprings: frontSprings || "0",
        rearSprings: rearSprings || "0",
        brakeBias: brakeBias || "50%",
        brakePressure: brakePressure || "100%",
        onThrottle: onThrottle || "50%",
        offThrottle: offThrottle || "50%",
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
    divider: { height: 1, backgroundColor: colors.border, marginBottom: 20, marginTop: 4 },
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
  });

  return (
    <View style={s.container}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.sectionTitle}>SETUP INFO</Text>

        <Text style={s.label}>SETUP NAME</Text>
        <TextInput
          style={s.input}
          value={label}
          onChangeText={setLabel}
          placeholder="e.g. Monza Low Drag"
          placeholderTextColor={colors.mutedForeground}
          testID="setup-label-input"
        />

        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>CAR</Text>
            <TextInput
              style={[s.input, { marginBottom: 0 }]}
              value={car}
              onChangeText={setCar}
              placeholder="Ferrari SF-24"
              placeholderTextColor={colors.mutedForeground}
              testID="setup-car-input"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>TAG</Text>
            <TextInput
              style={[s.input, { marginBottom: 0 }]}
              value={tag}
              onChangeText={setTag}
              placeholder="Race / Quali"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>
        </View>

        <Text style={[s.label, { marginTop: 16 }]}>DATE</Text>
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

        <View style={s.divider} />
        <Text style={s.sectionTitle}>AERODYNAMICS</Text>

        <View style={s.row}>
          <FieldInput label="FRONT WING" value={frontWing} onChange={setFrontWing} placeholder="1-11" colors={colors} keyboardType="numbers-and-punctuation" />
          <FieldInput label="REAR WING" value={rearWing} onChange={setRearWing} placeholder="1-11" colors={colors} keyboardType="numbers-and-punctuation" />
        </View>

        <View style={s.divider} />
        <Text style={s.sectionTitle}>SUSPENSION</Text>

        <View style={s.row}>
          <FieldInput label="FRONT ARB" value={frontARB} onChange={setFrontARB} placeholder="1-11" colors={colors} keyboardType="numbers-and-punctuation" />
          <FieldInput label="REAR ARB" value={rearARB} onChange={setRearARB} placeholder="1-11" colors={colors} keyboardType="numbers-and-punctuation" />
        </View>
        <View style={s.row}>
          <FieldInput label="FRONT RIDE HEIGHT" value={frontRideHeight} onChange={setFrontRideHeight} placeholder="1-11" colors={colors} keyboardType="numbers-and-punctuation" />
          <FieldInput label="REAR RIDE HEIGHT" value={rearRideHeight} onChange={setRearRideHeight} placeholder="1-11" colors={colors} keyboardType="numbers-and-punctuation" />
        </View>
        <View style={[s.row, { marginBottom: 0 }]}>
          <FieldInput label="FRONT SPRINGS" value={frontSprings} onChange={setFrontSprings} placeholder="1-11" colors={colors} keyboardType="numbers-and-punctuation" />
          <FieldInput label="REAR SPRINGS" value={rearSprings} onChange={setRearSprings} placeholder="1-11" colors={colors} keyboardType="numbers-and-punctuation" />
        </View>

        <View style={[s.divider, { marginTop: 20 }]} />
        <Text style={s.sectionTitle}>BRAKES & DIFFERENTIAL</Text>

        <View style={s.row}>
          <FieldInput label="BRAKE BIAS" value={brakeBias} onChange={setBrakeBias} placeholder="52%" colors={colors} />
          <FieldInput label="BRAKE PRESSURE" value={brakePressure} onChange={setBrakePressure} placeholder="100%" colors={colors} />
        </View>
        <View style={[s.row, { marginBottom: 0 }]}>
          <FieldInput label="ON THROTTLE" value={onThrottle} onChange={setOnThrottle} placeholder="50%" colors={colors} />
          <FieldInput label="OFF THROTTLE" value={offThrottle} onChange={setOffThrottle} placeholder="50%" colors={colors} />
        </View>

        <View style={[s.divider, { marginTop: 20 }]} />
        <Text style={s.label}>NOTES</Text>
        <TextInput
          style={[s.input, { height: 80, textAlignVertical: "top", paddingTop: 12 }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Setup notes, conditions, comments..."
          placeholderTextColor={colors.mutedForeground}
          multiline
          numberOfLines={3}
        />

        <Pressable
          style={({ pressed }) => [
            s.submitBtn,
            (!label.trim() || !car.trim() || isPending) && s.disabledBtn,
            { opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={handleSubmit}
          disabled={!label.trim() || !car.trim() || isPending}
          testID="submit-setup"
        >
          {isPending ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color={colors.primaryForeground} />
              <Text style={s.submitText}>SAVE SETUP</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}
