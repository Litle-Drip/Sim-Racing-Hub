import { useGetSessions } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { F1_TRACKS } from "@/data/tracks";

export default function TracksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data: sessions = [], isLoading } = useGetSessions();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const trackStats = F1_TRACKS.map((track) => {
    const trackSessions = sessions.filter((s: { trackId: string }) => s.trackId === track.id);
    const pb = trackSessions
      .map((s: { bestLap: string }) => s.bestLap)
      .filter(Boolean)
      .sort()[0];
    return {
      ...track,
      sessionCount: trackSessions.length,
      pb: pb ?? null,
    };
  });

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 8,
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: "800" as const,
      color: colors.foreground,
      letterSpacing: 2,
      fontFamily: "Inter_700Bold",
    },
    subtitle: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    divider: { height: 1, backgroundColor: colors.border },
    listContent: {
      padding: 16,
      paddingBottom: botPad + 16,
    },
    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 16,
      marginBottom: 10,
      flexDirection: "row",
      alignItems: "center",
    },
    cardLeft: { flex: 1 },
    trackName: {
      fontSize: 15,
      fontWeight: "600" as const,
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
    },
    trackCountry: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    cardRight: { alignItems: "flex-end", gap: 4 },
    sessionCount: {
      fontSize: 22,
      fontWeight: "800" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
    },
    sessionLabel: {
      fontSize: 10,
      color: colors.mutedForeground,
      letterSpacing: 1,
      fontFamily: "Inter_400Regular",
    },
    pbTime: {
      fontSize: 13,
      color: colors.teal,
      fontFamily: "Inter_600SemiBold",
    },
    activeCard: {
      borderColor: colors.primary + "44",
    },
    notesChevron: {
      marginLeft: 12,
    },
    loadWrap: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
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
        <Text style={s.title}>TRACK BIBLE</Text>
        <Text style={s.subtitle}>{F1_TRACKS.length} circuits · tap for corner notes</Text>
      </View>
      <View style={s.divider} />
      <FlatList
        data={trackStats}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [
              s.card,
              item.sessionCount > 0 && s.activeCard,
              { opacity: pressed ? 0.8 : 1 },
            ]}
            onPress={() => router.push(`/(home)/track/${item.id}`)}
            testID={`track-${item.id}`}
          >
            <View style={s.cardLeft}>
              <Text style={s.trackName}>{item.short}</Text>
              <Text style={s.trackCountry}>{item.name}</Text>
              {item.pb && (
                <Text style={s.pbTime}>PB {item.pb}</Text>
              )}
            </View>
            <View style={s.cardRight}>
              <Text style={s.sessionCount}>{item.sessionCount}</Text>
              <Text style={s.sessionLabel}>SESSIONS</Text>
            </View>
            <View style={s.notesChevron}>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </View>
          </Pressable>
        )}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={true}
      />
    </View>
  );
}
