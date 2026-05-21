import { useGetTrackNotes, useUpsertTrackNotes } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { getTrackById } from "@/data/tracks";
import type { CornerNote } from "@workspace/api-client-react";

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function CornerCard({
  corner,
  colors,
  onEdit,
}: {
  corner: CornerNote;
  colors: ReturnType<typeof useColors>;
  onEdit: (c: CornerNote) => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        cStyles.card,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
      ]}
      onPress={() => onEdit(corner)}
    >
      <View style={cStyles.header}>
        <View style={[cStyles.cornerNum, { backgroundColor: colors.redDim }]}>
          <Text style={[cStyles.cornerNumText, { color: colors.primary }]}>T{corner.number}</Text>
        </View>
        <Text style={[cStyles.cornerName, { color: colors.foreground }]}>{corner.name || `Turn ${corner.number}`}</Text>
        <Feather name="edit-2" size={14} color={colors.mutedForeground} />
      </View>
      <View style={cStyles.detailRow}>
        {corner.gear ? (
          <View style={cStyles.chip}>
            <Text style={[cStyles.chipLabel, { color: colors.mutedForeground }]}>Gear</Text>
            <Text style={[cStyles.chipValue, { color: colors.teal }]}>{corner.gear}</Text>
          </View>
        ) : null}
        {corner.brakingPoint ? (
          <View style={cStyles.chip}>
            <Text style={[cStyles.chipLabel, { color: colors.mutedForeground }]}>Brake</Text>
            <Text style={[cStyles.chipValue, { color: colors.foreground }]}>{corner.brakingPoint}</Text>
          </View>
        ) : null}
        {corner.lineNotes ? (
          <View style={[cStyles.chip, { flex: 1 }]}>
            <Text style={[cStyles.chipLabel, { color: colors.mutedForeground }]}>Line</Text>
            <Text style={[cStyles.chipValue, { color: colors.foreground }]} numberOfLines={1}>
              {corner.lineNotes}
            </Text>
          </View>
        ) : null}
      </View>
      {corner.myNotes ? (
        <Text style={[cStyles.myNotes, { color: colors.mutedForeground }]} numberOfLines={2}>
          {corner.myNotes}
        </Text>
      ) : null}
    </Pressable>
  );
}

const cStyles = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  cornerNum: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  cornerNumText: { fontSize: 13, fontWeight: "800" as const, fontFamily: "Inter_700Bold" },
  cornerName: { flex: 1, fontSize: 14, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  detailRow: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  chip: { gap: 2 },
  chipLabel: { fontSize: 10, letterSpacing: 1, fontFamily: "Inter_400Regular" },
  chipValue: { fontSize: 13, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  myNotes: { fontSize: 12, fontFamily: "Inter_400Regular", fontStyle: "italic" as const },
});

type EditingCorner = CornerNote & { isNew?: boolean };

function CornerEditor({
  corner,
  colors,
  onSave,
  onCancel,
  insets,
}: {
  corner: EditingCorner;
  colors: ReturnType<typeof useColors>;
  onSave: (c: CornerNote) => void;
  onCancel: () => void;
  insets: ReturnType<typeof useSafeAreaInsets>;
}) {
  const [name, setName] = useState(corner.name);
  const [gear, setGear] = useState(corner.gear);
  const [brakingPoint, setBrakingPoint] = useState(corner.brakingPoint);
  const [lineNotes, setLineNotes] = useState(corner.lineNotes);
  const [myNotes, setMyNotes] = useState(corner.myNotes);

  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  const e = StyleSheet.create({
    overlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.7)",
      justifyContent: "flex-end",
      zIndex: 100,
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: 20,
      paddingBottom: botPad + 20,
    },
    sheetHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 20,
    },
    sheetTitle: {
      fontSize: 14,
      fontWeight: "700" as const,
      color: colors.foreground,
      letterSpacing: 1,
      fontFamily: "Inter_700Bold",
    },
    label: {
      fontSize: 11,
      fontWeight: "600" as const,
      color: colors.mutedForeground,
      letterSpacing: 1,
      marginBottom: 6,
      fontFamily: "Inter_600SemiBold",
    },
    input: {
      backgroundColor: colors.secondary,
      borderWidth: 1,
      borderColor: colors.input,
      borderRadius: 6,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.foreground,
      fontSize: 14,
      marginBottom: 14,
      fontFamily: "Inter_400Regular",
    },
    row: { flexDirection: "row", gap: 12 },
    saveBtn: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 4,
    },
    saveBtnText: {
      color: colors.primaryForeground,
      fontSize: 15,
      fontWeight: "700" as const,
      fontFamily: "Inter_700Bold",
    },
  });

  return (
    <View style={e.overlay}>
      <View style={e.sheet}>
        <View style={e.sheetHeader}>
          <Text style={e.sheetTitle}>TURN {corner.number}</Text>
          <Pressable onPress={onCancel}>
            <Ionicons name="close" size={22} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <Text style={e.label}>CORNER NAME</Text>
        <TextInput
          style={e.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Eau Rouge"
          placeholderTextColor={colors.mutedForeground}
        />

        <View style={e.row}>
          <View style={{ flex: 1 }}>
            <Text style={e.label}>GEAR</Text>
            <TextInput
              style={e.input}
              value={gear}
              onChangeText={setGear}
              placeholder="3rd"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={e.label}>BRAKING POINT</Text>
            <TextInput
              style={e.input}
              value={brakingPoint}
              onChangeText={setBrakingPoint}
              placeholder="100m"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>
        </View>

        <Text style={e.label}>LINE NOTES</Text>
        <TextInput
          style={e.input}
          value={lineNotes}
          onChangeText={setLineNotes}
          placeholder="Late apex, wide entry..."
          placeholderTextColor={colors.mutedForeground}
        />

        <Text style={e.label}>MY NOTES</Text>
        <TextInput
          style={[e.input, { height: 70, textAlignVertical: "top", paddingTop: 10 }]}
          value={myNotes}
          onChangeText={setMyNotes}
          placeholder="Personal observations..."
          placeholderTextColor={colors.mutedForeground}
          multiline
        />

        <Pressable
          style={({ pressed }) => [e.saveBtn, { opacity: pressed ? 0.8 : 1 }]}
          onPress={() => {
            onSave({ ...corner, name, gear, brakingPoint, lineNotes, myNotes });
          }}
        >
          <Text style={e.saveBtnText}>Save Notes</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function TrackDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const track = getTrackById(id ?? "");
  const [editingCorner, setEditingCorner] = useState<EditingCorner | null>(null);
  const [localCorners, setLocalCorners] = useState<CornerNote[]>([]);

  const { data: trackNotes, isLoading } = useGetTrackNotes(id ?? "", {
    query: { enabled: !!id, queryKey: [`/api/track-notes/${id ?? ""}`] },
  });

  const { mutate: upsertNotes, isPending } = useUpsertTrackNotes({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`/api/track-notes/${id}`] });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
    },
  });

  useEffect(() => {
    if (trackNotes?.corners) {
      setLocalCorners(trackNotes.corners);
    } else if (track && !isLoading) {
      const defaultCorners: CornerNote[] = Array.from({ length: track.corners }, (_, i) => ({
        id: generateId(),
        number: i + 1,
        name: `Turn ${i + 1}`,
        gear: "",
        brakingPoint: "",
        lineNotes: "",
        myNotes: "",
      }));
      setLocalCorners(defaultCorners);
    }
  }, [trackNotes, track, isLoading]);

  const handleSaveCorner = (updated: CornerNote) => {
    const newCorners = localCorners.map((c) =>
      c.id === updated.id ? updated : c
    );
    setLocalCorners(newCorners);
    setEditingCorner(null);

    const notesId = trackNotes?.id ?? generateId();
    upsertNotes({
      trackId: id ?? "",
      data: { id: notesId, corners: newCorners },
    });
  };

  const handleAddCorner = () => {
    const newCorner: EditingCorner = {
      id: generateId(),
      number: localCorners.length + 1,
      name: `Turn ${localCorners.length + 1}`,
      gear: "",
      brakingPoint: "",
      lineNotes: "",
      myNotes: "",
      isNew: true,
    };
    setEditingCorner(newCorner);
  };

  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    listContent: {
      padding: 16,
      paddingBottom: botPad + 80,
    },
    trackHeader: {
      padding: 20,
      paddingTop: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    trackName: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    cornersCount: {
      fontSize: 13,
      color: colors.primary,
      fontFamily: "Inter_600SemiBold",
    },
    fab: {
      position: "absolute",
      bottom: botPad + 20,
      right: 20,
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.primary,
      justifyContent: "center",
      alignItems: "center",
    },
    loadWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
    emptyWrap: { alignItems: "center", paddingVertical: 60 },
    emptyText: { fontSize: 15, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 12 },
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
      <Stack.Screen options={{ title: track ? track.short.toUpperCase() : "TRACK NOTES" }} />

      <View style={s.trackHeader}>
        <Text style={s.trackName}>{track?.name ?? id}</Text>
        <Text style={s.cornersCount}>{localCorners.length} turns</Text>
      </View>

      <FlatList
        data={localCorners}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CornerCard corner={item} colors={colors} onEdit={setEditingCorner} />
        )}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Feather name="map-pin" size={40} color={colors.border} />
            <Text style={s.emptyText}>No corner notes yet</Text>
          </View>
        }
      />

      <Pressable
        style={({ pressed }) => [s.fab, { opacity: pressed ? 0.8 : 1 }]}
        onPress={handleAddCorner}
        testID="add-corner-fab"
      >
        {isPending ? (
          <ActivityIndicator color={colors.primaryForeground} size="small" />
        ) : (
          <Ionicons name="add" size={26} color={colors.primaryForeground} />
        )}
      </Pressable>

      {editingCorner && (
        <CornerEditor
          corner={editingCorner}
          colors={colors}
          insets={insets}
          onSave={(updated) => {
            if (editingCorner.isNew) {
              const newCorners = [...localCorners, updated];
              setLocalCorners(newCorners);
              setEditingCorner(null);
              const notesId = trackNotes?.id ?? generateId();
              upsertNotes({
                trackId: id ?? "",
                data: { id: notesId, corners: newCorners },
              });
            } else {
              handleSaveCorner(updated);
            }
          }}
          onCancel={() => setEditingCorner(null)}
        />
      )}
    </View>
  );
}
