import { useDeleteSetup, useGetSetups } from "@workspace/api-client-react";
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
import type { SetupRecord } from "@workspace/api-client-react";

function SetupCard({
  setup,
  colors,
  onDelete,
}: {
  setup: SetupRecord;
  colors: ReturnType<typeof useColors>;
  onDelete: (id: string) => void;
}) {
  const track = getTrackById(setup.trackId);

  return (
    <View style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={cardStyles.topRow}>
        <View style={cardStyles.topLeft}>
          {setup.tag ? (
            <View style={[cardStyles.tagBadge, { backgroundColor: colors.redDim }]}>
              <Text style={[cardStyles.tagText, { color: colors.primary }]}>{setup.tag}</Text>
            </View>
          ) : null}
          <Text style={[cardStyles.label, { color: colors.foreground }]}>{setup.label}</Text>
          <Text style={[cardStyles.meta, { color: colors.mutedForeground }]}>
            {setup.car} · {track?.short ?? setup.trackId}
          </Text>
        </View>
        <View style={cardStyles.topRight}>
          <Text style={[cardStyles.date, { color: colors.mutedForeground }]}>
            {new Date(setup.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </Text>
          <Pressable
            onPress={() => onDelete(setup.id)}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, marginTop: 8 }]}
          >
            <Feather name="trash-2" size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      <View style={[cardStyles.divider, { backgroundColor: colors.border }]} />

      <View style={cardStyles.paramsGrid}>
        <View style={cardStyles.paramItem}>
          <Text style={[cardStyles.paramLabel, { color: colors.mutedForeground }]}>Front Wing</Text>
          <Text style={[cardStyles.paramValue, { color: colors.teal }]}>{setup.frontWing}</Text>
        </View>
        <View style={cardStyles.paramItem}>
          <Text style={[cardStyles.paramLabel, { color: colors.mutedForeground }]}>Rear Wing</Text>
          <Text style={[cardStyles.paramValue, { color: colors.teal }]}>{setup.rearWing}</Text>
        </View>
        <View style={cardStyles.paramItem}>
          <Text style={[cardStyles.paramLabel, { color: colors.mutedForeground }]}>Brake Bias</Text>
          <Text style={[cardStyles.paramValue, { color: colors.foreground }]}>{setup.brakeBias}</Text>
        </View>
        <View style={cardStyles.paramItem}>
          <Text style={[cardStyles.paramLabel, { color: colors.mutedForeground }]}>On Throttle</Text>
          <Text style={[cardStyles.paramValue, { color: colors.foreground }]}>{setup.onThrottle}</Text>
        </View>
        <View style={cardStyles.paramItem}>
          <Text style={[cardStyles.paramLabel, { color: colors.mutedForeground }]}>Off Throttle</Text>
          <Text style={[cardStyles.paramValue, { color: colors.foreground }]}>{setup.offThrottle}</Text>
        </View>
        <View style={cardStyles.paramItem}>
          <Text style={[cardStyles.paramLabel, { color: colors.mutedForeground }]}>Brake Press.</Text>
          <Text style={[cardStyles.paramValue, { color: colors.foreground }]}>{setup.brakePressure}</Text>
        </View>
      </View>

      {setup.notes ? (
        <Text style={[cardStyles.notes, { color: colors.mutedForeground }]} numberOfLines={2}>
          {setup.notes}
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
  topRight: { alignItems: "flex-end" },
  tagBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 3,
  },
  tagText: { fontSize: 10, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  label: { fontSize: 16, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  date: { fontSize: 12, fontFamily: "Inter_400Regular" },
  divider: { height: 1 },
  paramsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  paramItem: { minWidth: "28%" as any, gap: 2 },
  paramLabel: { fontSize: 10, letterSpacing: 1, fontFamily: "Inter_400Regular" },
  paramValue: { fontSize: 13, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  notes: { fontSize: 12, fontFamily: "Inter_400Regular", fontStyle: "italic" as const },
});

export default function SetupsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: setups = [], isLoading, refetch, isRefetching } = useGetSetups();
  const { mutate: deleteSetup } = useDeleteSetup({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/setups"] });
      },
    },
  });

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const sortedSetups = [...setups].sort(
    (a: SetupRecord, b: SetupRecord) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const handleDelete = (id: string) => {
    if (Platform.OS === "web") {
      deleteSetup({ id });
      return;
    }
    Alert.alert("Delete Setup", "Remove this setup?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          deleteSetup({ id });
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
          <Text style={s.title}>SETUPS</Text>
          <Text style={s.count}>{setups.length} saved</Text>
        </View>
        <Pressable
          style={({ pressed }) => [s.addBtn, { opacity: pressed ? 0.8 : 1 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/(home)/create-setup");
          }}
          testID="add-setup-button"
        >
          <Ionicons name="add" size={24} color={colors.primaryForeground} />
        </Pressable>
      </View>
      <View style={s.divider} />
      <FlatList
        data={sortedSetups}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SetupCard setup={item} colors={colors} onDelete={handleDelete} />
        )}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={true}
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
            <Feather name="sliders" size={40} color={colors.border} />
            <Text style={s.emptyTitle}>No setups saved</Text>
            <Text style={s.emptyDesc}>Tap + to save your first car setup</Text>
          </View>
        }
      />
    </View>
  );
}
