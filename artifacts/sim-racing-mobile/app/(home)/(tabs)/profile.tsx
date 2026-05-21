import { useAuth, useUser } from "@clerk/expo";
import { useGetSessions } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { user } = useUser();
  const { data: sessions = [] } = useGetSessions();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const totalSessions = sessions.length;
  const totalPBs = sessions.filter((s: { isPB?: boolean }) => s.isPB).length;
  const uniqueTracks = new Set(sessions.map((s: { trackId: string }) => s.trackId)).size;

  const handleSignOut = () => {
    if (Platform.OS === "web") {
      signOut();
      return;
    }
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await signOut();
        },
      },
    ]);
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 8,
      paddingHorizontal: 20,
      paddingBottom: 20,
    },
    title: {
      fontSize: 18,
      fontWeight: "800" as const,
      color: colors.foreground,
      letterSpacing: 2,
      fontFamily: "Inter_700Bold",
    },
    divider: { height: 1, backgroundColor: colors.border },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: botPad + 16 },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.redDim,
      justifyContent: "center",
      alignItems: "center",
      alignSelf: "center",
      marginTop: 32,
      marginBottom: 16,
      borderWidth: 2,
      borderColor: colors.primary + "44",
    },
    avatarText: {
      fontSize: 28,
      fontWeight: "800" as const,
      color: colors.primary,
      fontFamily: "Inter_700Bold",
    },
    name: {
      fontSize: 20,
      fontWeight: "700" as const,
      color: colors.foreground,
      textAlign: "center",
      fontFamily: "Inter_700Bold",
    },
    email: {
      fontSize: 13,
      color: colors.mutedForeground,
      textAlign: "center",
      marginTop: 4,
      fontFamily: "Inter_400Regular",
    },
    statsRow: {
      flexDirection: "row",
      paddingHorizontal: 20,
      gap: 12,
      marginTop: 28,
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
      fontSize: 26,
      fontWeight: "800" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
    },
    statLabel: {
      fontSize: 10,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      letterSpacing: 1,
      marginTop: 4,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: "700" as const,
      color: colors.mutedForeground,
      letterSpacing: 2,
      paddingHorizontal: 20,
      marginBottom: 12,
      fontFamily: "Inter_700Bold",
    },
    menuCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      marginHorizontal: 20,
      marginBottom: 20,
      overflow: "hidden",
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
      gap: 14,
    },
    menuItemText: {
      flex: 1,
      fontSize: 15,
      color: colors.foreground,
      fontFamily: "Inter_500Medium",
    },
    menuItemTextDestructive: {
      color: colors.primary,
    },
    menuDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: 16 },
  });

  const initials = user?.firstName?.[0]?.toUpperCase() ?? user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ?? "R";

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>PROFILE</Text>
      </View>
      <View style={s.divider} />
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initials}</Text>
        </View>
        <Text style={s.name}>
          {user?.firstName && user?.lastName
            ? `${user.firstName} ${user.lastName}`
            : user?.firstName ?? "Driver"}
        </Text>
        <Text style={s.email}>{user?.emailAddresses?.[0]?.emailAddress}</Text>

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
            <Text style={s.statValue}>{uniqueTracks}</Text>
            <Text style={s.statLabel}>TRACKS</Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>ACCOUNT</Text>
        <View style={s.menuCard}>
          <View style={s.menuItem}>
            <Feather name="user" size={18} color={colors.mutedForeground} />
            <Text style={s.menuItemText}>{user?.emailAddresses?.[0]?.emailAddress}</Text>
          </View>
          <View style={s.menuDivider} />
          <Pressable
            style={({ pressed }) => [s.menuItem, { opacity: pressed ? 0.7 : 1 }]}
            onPress={handleSignOut}
            testID="sign-out-button"
          >
            <Ionicons name="log-out-outline" size={18} color={colors.primary} />
            <Text style={[s.menuItemText, s.menuItemTextDestructive]}>Sign Out</Text>
            <Feather name="chevron-right" size={18} color={colors.primary} />
          </Pressable>
        </View>

        <Text style={s.sectionTitle}>APP</Text>
        <View style={s.menuCard}>
          <View style={s.menuItem}>
            <Feather name="info" size={18} color={colors.mutedForeground} />
            <Text style={s.menuItemText}>Sim Racing HQ Mobile</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular" }}>v1.0.0</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
