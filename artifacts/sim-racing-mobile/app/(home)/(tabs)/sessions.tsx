import { useDeleteSession, useGetSessions } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { getTrackById } from "@/data/tracks";
import type { SessionRecord } from "@workspace/api-client-react";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SessionCard({
  session,
  colors,
  onDelete,
}: {
  session: SessionRecord;
  colors: ReturnType<typeof useColors>;
  onDelete: (id: string) => void;
}) {
  const track = getTrackById(session.trackId);

  return (
    <View style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={cardStyles.topRow}>
        <View style={cardStyles.topLeft}>
          {session.isPB && (
            <View style={[cardStyles.pbBadge, { backgroundColor: colors.success + "22" }]}>
              <Text style={[cardStyles.pbText, { color: colors.success }]}>PB</Text>
            </View>
          )}
          <Text style={[cardStyles.trackName, { color: colors.foreground }]}>
            {track?.short ?? session.trackId}
          </Text>
          <Text style={[cardStyles.subInfo, { color: colors.mutedForeground }]}>
            {session.car} · {session.type} · {session.tires}
          </Text>
        </View>
        <View style={cardStyles.topRight}>
          <Text style={[cardStyles.bestLap, { color: colors.teal }]}>{session.bestLap}</Text>
          <Text style={[cardStyles.dateText, { color: colors.mutedForeground }]}>
            {formatDate(session.date)}
          </Text>
        </View>
      </View>

      <View style={[cardStyles.divider, { backgroundColor: colors.border }]} />

      <View style={cardStyles.bottomRow}>
        <View style={cardStyles.sectorItem}>
          <Text style={[cardStyles.sectorLabel, { color: colors.mutedForeground }]}>S1</Text>
          <Text style={[cardStyles.sectorValue, { color: colors.foreground }]}>{session.s1}</Text>
        </View>
        <View style={cardStyles.sectorItem}>
          <Text style={[cardStyles.sectorLabel, { color: colors.mutedForeground }]}>S2</Text>
          <Text style={[cardStyles.sectorValue, { color: colors.foreground }]}>{session.s2}</Text>
        </View>
        <View style={cardStyles.sectorItem}>
          <Text style={[cardStyles.sectorLabel, { color: colors.mutedForeground }]}>S3</Text>
          <Text style={[cardStyles.sectorValue, { color: colors.foreground }]}>{session.s3}</Text>
        </View>
        <View style={cardStyles.sectorItem}>
          <Text style={[cardStyles.sectorLabel, { color: colors.mutedForeground }]}>Fuel</Text>
          <Text style={[cardStyles.sectorValue, { color: colors.foreground }]}>{session.fuelLoad}kg</Text>
        </View>
        <Pressable
          onPress={() => onDelete(session.id)}
          style={({ pressed }) => [cardStyles.deleteBtn, { opacity: pressed ? 0.6 : 1 }]}
          testID={`delete-session-${session.id}`}
        >
          <Feather name="trash-2" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  topRow: { flexDirection: "row", justifyContent: "space-between" },
  topLeft: { flex: 1, gap: 3 },
  topRight: { alignItems: "flex-end", gap: 3 },
  pbBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    marginBottom: 2,
  },
  pbText: { fontSize: 10, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  trackName: { fontSize: 16, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  subInfo: { fontSize: 12, fontFamily: "Inter_400Regular" },
  bestLap: { fontSize: 16, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  dateText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  divider: { height: 1, marginVertical: 10 },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  sectorItem: { gap: 2 },
  sectorLabel: { fontSize: 10, letterSpacing: 1, fontFamily: "Inter_400Regular" },
  sectorValue: { fontSize: 13, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  deleteBtn: { marginLeft: "auto" as any },
});

export default function SessionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading, refetch, isRefetching } = useGetSessions();
  const { mutate: deleteSession } = useDeleteSession({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      },
    },
  });

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const handleDelete = (id: string) => {
    if (Platform.OS === "web") {
      deleteSession({ id });
      return;
    }
    Alert.alert("Delete Session", "Remove this session?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          deleteSession({ id });
        },
      },
    ]);
  };

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
    addBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      justifyContent: "center",
      alignItems: "center",
    },
    divider: { height: 1, backgroundColor: colors.border },
    listContent: {
      padding: 16,
      paddingBottom: botPad + 16,
    },
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
        <View>
          <Text style={s.title}>SESSIONS</Text>
          <Text style={s.count}>{sessions.length} total</Text>
        </View>
        <Pressable
          style={({ pressed }) => [s.addBtn, { opacity: pressed ? 0.8 : 1 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/(home)/log-session");
          }}
          testID="add-session-button"
        >
          <Ionicons name="add" size={24} color={colors.primaryForeground} />
        </Pressable>
      </View>
      <View style={s.divider} />
      <FlatList
        data={sortedSessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SessionCard session={item} colors={colors} onDelete={handleDelete} />
        )}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!sortedSessions.length}
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
            <Feather name="flag" size={40} color={colors.border} />
            <Text style={s.emptyTitle}>No sessions yet</Text>
            <Text style={s.emptyDesc}>Tap + to log your first session</Text>
          </View>
        }
      />
    </View>
  );
}
