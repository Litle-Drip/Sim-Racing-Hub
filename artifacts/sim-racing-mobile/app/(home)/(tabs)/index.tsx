import { useUser } from "@clerk/expo";
import { useGetSessions } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { getTrackById } from "@/data/tracks";
import type { SessionRecord } from "@workspace/api-client-react";

function formatLapTime(time: string): string {
  return time || "--:--.---";
}

function SessionRow({ session, colors }: { session: SessionRecord; colors: ReturnType<typeof useColors> }) {
  const track = getTrackById(session.trackId);
  return (
    <View style={[rowStyles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={rowStyles.left}>
        {session.isPB && (
          <View style={[rowStyles.pbBadge, { backgroundColor: colors.success + "22" }]}>
            <Text style={[rowStyles.pbText, { color: colors.success }]}>PB</Text>
          </View>
        )}
        <Text style={[rowStyles.track, { color: colors.foreground }]}>{track?.short ?? session.trackId}</Text>
        <Text style={[rowStyles.meta, { color: colors.mutedForeground }]}>
          {session.car} · {session.type}
        </Text>
      </View>
      <View style={rowStyles.right}>
        <Text style={[rowStyles.lapTime, { color: colors.teal }]}>{formatLapTime(session.bestLap)}</Text>
        <Text style={[rowStyles.date, { color: colors.mutedForeground }]}>
          {new Date(session.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </Text>
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  left: { flex: 1, gap: 3 },
  right: { alignItems: "flex-end", gap: 3 },
  pbBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    marginBottom: 2,
  },
  pbText: { fontSize: 10, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  track: { fontSize: 15, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  lapTime: { fontSize: 15, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  date: { fontSize: 12, fontFamily: "Inter_400Regular" },
});

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();

  const { data: sessions = [], isLoading, refetch, isRefetching } = useGetSessions();

  const totalSessions = sessions.length;
  const totalPBs = sessions.filter((s: SessionRecord) => s.isPB).length;
  const recentSessions = [...sessions]
    .sort((a: SessionRecord, b: SessionRecord) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const topTrackId = sessions.length > 0
    ? Object.entries(
        sessions.reduce<Record<string, number>>((acc: Record<string, number>, s: SessionRecord) => {
          acc[s.trackId] = (acc[s.trackId] ?? 0) + 1;
          return acc;
        }, {})
      ).sort((a: [string, number], b: [string, number]) => b[1] - a[1])[0]?.[0]
    : null;
  const topTrack = topTrackId ? getTrackById(topTrackId) : null;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 8,
      paddingHorizontal: 20,
      paddingBottom: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    brand: {
      fontSize: 18,
      fontWeight: "800" as const,
      color: colors.foreground,
      letterSpacing: 2,
      fontFamily: "Inter_700Bold",
    },
    redAccent: { color: colors.primary },
    greeting: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    addBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      justifyContent: "center",
      alignItems: "center",
    },
    divider: { height: 1, backgroundColor: colors.border, marginBottom: 20 },
    statsRow: {
      flexDirection: "row",
      paddingHorizontal: 20,
      gap: 12,
      marginBottom: 28,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 14,
      alignItems: "center",
    },
    statValue: {
      fontSize: 28,
      fontWeight: "800" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
    },
    statLabel: {
      fontSize: 11,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      letterSpacing: 1,
      marginTop: 4,
    },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: "700" as const,
      color: colors.mutedForeground,
      letterSpacing: 2,
      fontFamily: "Inter_700Bold",
    },
    seeAll: {
      fontSize: 12,
      color: colors.primary,
      fontFamily: "Inter_400Regular",
    },
    listContent: {
      paddingHorizontal: 20,
      paddingBottom: botPad + 16,
    },
    emptyWrap: {
      alignItems: "center",
      paddingVertical: 48,
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
    },
    loadWrap: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
  });

  const handleLogSession = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/(home)/log-session");
  };

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
          <Text style={s.brand}>
            SIM <Text style={s.redAccent}>RACING</Text> HQ
          </Text>
          <Text style={s.greeting}>
            {user?.firstName ? `Welcome back, ${user.firstName}` : "Welcome back"}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [s.addBtn, { opacity: pressed ? 0.8 : 1 }]}
          onPress={handleLogSession}
          testID="log-session-fab"
        >
          <Ionicons name="add" size={24} color={colors.primaryForeground} />
        </Pressable>
      </View>

      <View style={s.divider} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statValue}>{totalSessions}</Text>
            <Text style={s.statLabel}>SESSIONS</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: colors.success }]}>{totalPBs}</Text>
            <Text style={s.statLabel}>PBs</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { fontSize: 16 }]}>
              {topTrack?.short ?? "--"}
            </Text>
            <Text style={s.statLabel}>FAV TRACK</Text>
          </View>
        </View>

        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>RECENT SESSIONS</Text>
          {sessions.length > 5 && (
            <Pressable onPress={() => router.push("/(home)/(tabs)/sessions")}>
              <Text style={s.seeAll}>See all</Text>
            </Pressable>
          )}
        </View>

        <View style={s.listContent}>
          {recentSessions.length === 0 ? (
            <View style={s.emptyWrap}>
              <Feather name="flag" size={40} color={colors.border} />
              <Text style={s.emptyTitle}>No sessions yet</Text>
              <Text style={s.emptyDesc}>Tap + to log your first session</Text>
            </View>
          ) : (
            recentSessions.map((session) => (
              <SessionRow key={session.id} session={session} colors={colors} />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
