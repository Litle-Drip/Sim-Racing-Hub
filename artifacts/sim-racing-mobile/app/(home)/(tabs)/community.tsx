import { useImportSetup, useGetCommunitySetups, getGetSetupsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { getTrackById } from "@/data/tracks";
import type { CommunitySetupRecord } from "@workspace/api-client-react";

function StarDisplay({ avg, count }: { avg: number | null | undefined; count: number }) {
  const filled = Math.round(avg ?? 0);
  const colors = ["#E8002D", "#F5A623", "#F8E71C", "#7ED321", "#00D2BE"];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View style={{ flexDirection: "row", gap: 2 }}>
        {[1, 2, 3, 4, 5].map((s) => (
          <Text key={s} style={{ fontSize: 12, color: s <= filled ? (colors[filled - 1] ?? "#F5A623") : "#333" }}>
            ★
          </Text>
        ))}
      </View>
      {avg != null && (
        <Text style={{ fontSize: 11, color: "#A8A8A8", fontFamily: "Inter_400Regular" }}>
          {avg.toFixed(1)}
        </Text>
      )}
      <Text style={{ fontSize: 11, color: "#555", fontFamily: "Inter_400Regular" }}>({count})</Text>
    </View>
  );
}

function CommunityCard({
  setup,
  colors,
  onImport,
  importing,
}: {
  setup: CommunitySetupRecord;
  colors: ReturnType<typeof useColors>;
  onImport: (id: string) => void;
  importing: boolean;
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
          <View style={[cardStyles.authorRow]}>
            <Feather name="user" size={10} color={colors.mutedForeground} />
            <Text style={[cardStyles.author, { color: colors.mutedForeground }]}>{setup.authorName}</Text>
          </View>
          <StarDisplay avg={setup.avgRating} count={setup.ratingCount} />
        </View>
      </View>

      <View style={[cardStyles.divider, { backgroundColor: colors.border }]} />

      <View style={cardStyles.paramsGrid}>
        {[
          { label: "Front Wing", value: setup.frontWing },
          { label: "Rear Wing", value: setup.rearWing },
          { label: "Brake Bias", value: setup.brakeBias },
          { label: "On Throttle", value: setup.onThrottle },
        ].map(({ label, value }) => (
          <View key={label} style={cardStyles.paramItem}>
            <Text style={[cardStyles.paramLabel, { color: colors.mutedForeground }]}>{label}</Text>
            <Text style={[cardStyles.paramValue, { color: colors.teal }]}>{value || "—"}</Text>
          </View>
        ))}
      </View>

      <Pressable
        style={({ pressed }) => [
          cardStyles.importBtn,
          { backgroundColor: colors.primary, opacity: pressed || importing ? 0.7 : 1 },
        ]}
        onPress={() => {
          if (!importing) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onImport(setup.id);
          }
        }}
        disabled={importing}
      >
        <Feather name="download" size={13} color="#fff" />
        <Text style={cardStyles.importBtnText}>{importing ? "Importing…" : "Import to My Vault"}</Text>
      </Pressable>
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
  topRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  topLeft: { flex: 1, gap: 4 },
  topRight: { alignItems: "flex-end", gap: 6 },
  tagBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 3 },
  tagText: { fontSize: 10, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  label: { fontSize: 15, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  author: { fontSize: 11, fontFamily: "Inter_400Regular" },
  divider: { height: 1 },
  paramsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  paramItem: { minWidth: "22%" as any, gap: 2 },
  paramLabel: { fontSize: 10, letterSpacing: 0.5, fontFamily: "Inter_400Regular" },
  paramValue: { fontSize: 13, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  importBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 6,
  },
  importBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
});

export default function CommunityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [importingId, setImportingId] = useState<string | null>(null);

  const { data: setups = [], isLoading, refetch, isRefetching } = useGetCommunitySetups({});

  const { mutate: importSetup } = useImportSetup({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSetupsQueryKey() });
        setImportingId(null);
      },
      onError: () => {
        setImportingId(null);
      },
    },
  });

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const sorted = [...setups].sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0));

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
    count: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    divider: { height: 1, backgroundColor: colors.border },
    listContent: { padding: 16, paddingBottom: botPad + 16 },
    emptyWrap: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 80 },
    emptyTitle: { fontSize: 16, color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", marginTop: 12 },
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
        <Text style={s.title}>COMMUNITY</Text>
        <Text style={s.count}>{setups.length} shared setup{setups.length !== 1 ? "s" : ""}</Text>
      </View>
      <View style={s.divider} />
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CommunityCard
            setup={item}
            colors={colors}
            onImport={(id) => {
              setImportingId(id);
              importSetup({ id });
            }}
            importing={importingId === item.id}
          />
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
            <Feather name="users" size={40} color={colors.border} />
            <Text style={s.emptyTitle}>No community setups yet</Text>
            <Text style={s.emptyDesc}>Share a setup from the web app to see it here</Text>
          </View>
        }
      />
    </View>
  );
}
