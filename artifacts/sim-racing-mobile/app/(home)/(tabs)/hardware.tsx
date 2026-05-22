import { useGetHardware } from "@workspace/api-client-react";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { getTrackById } from "@/data/tracks";
import type { HardwareRecord } from "@workspace/api-client-react";

const PERIPHERAL_COLORS: Record<string, string> = {
  "Wheel Base": "#E8002D",
  Pedals: "#00D2BE",
  Handbrake: "#FFF200",
  Shifter: "#39B54A",
  "Button Box": "#8888FF",
};

const FFB_FIELDS: { key: keyof HardwareRecord; label: string; unit: string }[] = [
  { key: "ffbStrength", label: "FFB", unit: "%" },
  { key: "maxForce", label: "Max Force", unit: "Nm" },
  { key: "damper", label: "Damper", unit: "%" },
  { key: "friction", label: "Friction", unit: "%" },
  { key: "linearity", label: "Linearity", unit: "%" },
  { key: "steeringRange", label: "Range", unit: "°" },
];

function HardwareCard({
  profile,
  colors,
}: {
  profile: HardwareRecord;
  colors: ReturnType<typeof useColors>;
}) {
  const track = profile.trackId ? getTrackById(profile.trackId) : null;
  const typeColor = PERIPHERAL_COLORS[profile.peripheralType] ?? colors.primary;
  const filledParams = FFB_FIELDS.filter((f) => profile[f.key]);

  return (
    <View style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={cardStyles.topRow}>
        <View style={cardStyles.topLeft}>
          <View style={[cardStyles.typeBadge, { backgroundColor: typeColor + "22", borderColor: typeColor + "55" }]}>
            <Text style={[cardStyles.typeText, { color: typeColor }]}>{profile.peripheralType}</Text>
          </View>
          <Text style={[cardStyles.label, { color: colors.foreground }]}>{profile.label}</Text>
          {(profile.brand || profile.model) ? (
            <Text style={[cardStyles.device, { color: colors.mutedForeground }]}>
              {[profile.brand, profile.model].filter(Boolean).join(" ")}
            </Text>
          ) : null}
        </View>
        <View style={cardStyles.topRight}>
          <Text style={[cardStyles.date, { color: colors.mutedForeground }]}>
            {new Date(profile.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </Text>
          {track && (
            <Text style={[cardStyles.track, { color: colors.mutedForeground }]} numberOfLines={1}>
              {track.short}
            </Text>
          )}
        </View>
      </View>

      {filledParams.length > 0 && (
        <>
          <View style={[cardStyles.divider, { backgroundColor: colors.border }]} />
          <View style={cardStyles.paramsGrid}>
            {filledParams.map(({ key, label, unit }) => (
              <View key={key} style={cardStyles.paramItem}>
                <Text style={[cardStyles.paramLabel, { color: colors.mutedForeground }]}>{label}</Text>
                <Text style={[cardStyles.paramValue, { color: colors.teal }]}>
                  {profile[key]}{unit}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      {profile.notes ? (
        <Text style={[cardStyles.notes, { color: colors.mutedForeground }]} numberOfLines={2}>
          {profile.notes}
        </Text>
      ) : null}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  topRow: { flexDirection: "row", justifyContent: "space-between" },
  topLeft: { flex: 1, gap: 4 },
  topRight: { alignItems: "flex-end", minWidth: 80 },
  typeBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 1,
  },
  typeText: { fontSize: 10, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  label: { fontSize: 16, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  device: { fontSize: 12, fontFamily: "Inter_400Regular" },
  date: { fontSize: 11, fontFamily: "Inter_400Regular" },
  track: { fontSize: 11, fontFamily: "Inter_400Regular", maxWidth: 80 },
  divider: { height: 1 },
  paramsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  paramItem: { minWidth: "28%" as any, gap: 2 },
  paramLabel: { fontSize: 10, letterSpacing: 1, fontFamily: "Inter_400Regular" },
  paramValue: { fontSize: 13, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  notes: { fontSize: 12, fontFamily: "Inter_400Regular", fontStyle: "italic" as const },
});

export default function HardwareScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data: profiles = [], isLoading, refetch, isRefetching } = useGetHardware();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const sorted = [...profiles].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 8,
      paddingHorizontal: 20,
      paddingBottom: 16,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    title: {
      fontSize: 18,
      fontWeight: "800" as const,
      color: colors.foreground,
      letterSpacing: 2,
      fontFamily: "Inter_700Bold",
    },
    count: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    divider: { height: 1, backgroundColor: colors.border },
    listContent: { padding: 16, paddingBottom: botPad + 16 },
    emptyWrap: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: 80,
    },
    emptyTitle: {
      fontSize: 16,
      color: colors.mutedForeground,
      fontFamily: "Inter_600SemiBold",
      marginTop: 12,
    },
    emptyDesc: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 6,
      opacity: 0.7,
      textAlign: "center" as const,
      paddingHorizontal: 24,
    },
    loadWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  });

  if (isLoading) {
    return (
      <View style={[s.container, s.loadWrap]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View>
          <Text style={s.title}>HARDWARE</Text>
          <Text style={s.count}>{profiles.length} saved</Text>
        </View>
      </View>
      <View style={s.divider} />
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <HardwareCard profile={item} colors={colors} />
        )}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Feather name="cpu" size={40} color={colors.border} />
            <Text style={s.emptyTitle}>No hardware profiles</Text>
            <Text style={s.emptyDesc}>
              Add FFB profiles from the web app to see them here
            </Text>
          </View>
        }
      />
    </View>
  );
}
