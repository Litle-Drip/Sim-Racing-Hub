import { useAuth } from "@clerk/expo";
import { Redirect, Stack } from "expo-router";
import { useEffect } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

export default function HomeLayout() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const colors = useColors();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        headerTitleStyle: {
          color: colors.foreground,
          fontFamily: "Inter_700Bold",
          fontSize: 16,
        },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="log-session"
        options={{
          presentation: "modal",
          headerShown: true,
          headerTitle: "LOG SESSION",
          headerStyle: { backgroundColor: colors.card },
          headerTitleStyle: {
            color: colors.foreground,
            fontFamily: "Inter_700Bold",
            fontSize: 14,
          },
        }}
      />
      <Stack.Screen
        name="create-setup"
        options={{
          presentation: "modal",
          headerShown: true,
          headerTitle: "SAVE SETUP",
          headerStyle: { backgroundColor: colors.card },
          headerTitleStyle: {
            color: colors.foreground,
            fontFamily: "Inter_700Bold",
            fontSize: 14,
          },
        }}
      />
      <Stack.Screen
        name="track/[id]"
        options={{
          headerShown: true,
          headerTitle: "TRACK NOTES",
        }}
      />
    </Stack>
  );
}
