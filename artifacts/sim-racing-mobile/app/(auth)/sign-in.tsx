import { useSignIn, useSSO } from "@clerk/expo";
import * as AuthSession from "expo-auth-session";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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

WebBrowser.maybeCompleteAuthSession();

function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

export default function SignInScreen() {
  useWarmUpBrowser();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { signIn, errors, fetchStatus } = useSignIn();
  const { startSSOFlow } = useSSO();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [code, setCode] = React.useState("");

  const handleEmailSignIn = async () => {
    const { error } = await signIn.password({ emailAddress: email, password });
    if (error) return;
    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: ({ decorateUrl }) => {
          const url = decorateUrl("/");
          if (url.startsWith("http")) {
            // handled natively
          } else {
            router.replace("/(home)/(tabs)");
          }
        },
      });
    }
  };

  const handleVerify = async () => {
    await signIn.mfa.verifyEmailCode({ code });
    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: () => {
          router.replace("/(home)/(tabs)");
        },
      });
    }
  };

  const handleGoogleSignIn = useCallback(async () => {
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: AuthSession.makeRedirectUri(),
      });
      if (createdSessionId && setActive) {
        setActive({
          session: createdSessionId,
          navigate: () => {
            router.replace("/(home)/(tabs)");
          },
        });
      }
    } catch (err) {
      console.error(err);
    }
  }, [startSSOFlow, router]);

  const s = makeStyles(colors, insets);

  if (signIn.status === "needs_client_trust") {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.logo}>SIM RACING HQ</Text>
          <Text style={s.subtitle}>Verify your identity</Text>
        </View>
        <TextInput
          style={s.input}
          value={code}
          placeholder="Verification code"
          placeholderTextColor={colors.mutedForeground}
          onChangeText={setCode}
          keyboardType="numeric"
          autoFocus
        />
        {errors?.fields?.code && (
          <Text style={s.errorText}>{errors.fields.code.message}</Text>
        )}
        <Pressable
          style={({ pressed }) => [s.primaryButton, pressed && s.pressed]}
          onPress={handleVerify}
          disabled={fetchStatus === "fetching"}
        >
          {fetchStatus === "fetching" ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={s.primaryButtonText}>Verify</Text>
          )}
        </Pressable>
        <Pressable onPress={() => signIn.mfa.sendEmailCode()} style={s.linkBtn}>
          <Text style={s.linkText}>Resend code</Text>
        </Pressable>
        <Pressable onPress={() => signIn.reset()} style={s.linkBtn}>
          <Text style={s.linkText}>Start over</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}>
          <View style={s.logoMark}>
            <Ionicons name="flag-sharp" size={32} color={colors.primary} />
          </View>
          <Text style={s.logo}>SIM RACING HQ</Text>
          <Text style={s.subtitle}>Sign in to your account</Text>
        </View>

        <Pressable
          style={({ pressed }) => [s.oauthButton, pressed && s.pressed]}
          onPress={handleGoogleSignIn}
        >
          <Ionicons name="logo-google" size={20} color={colors.foreground} />
          <Text style={s.oauthText}>Continue with Google</Text>
        </Pressable>

        <View style={s.divider}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>or</Text>
          <View style={s.dividerLine} />
        </View>

        <Text style={s.label}>Email</Text>
        <TextInput
          style={s.input}
          value={email}
          placeholder="your@email.com"
          placeholderTextColor={colors.mutedForeground}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
          testID="email-input"
        />
        {errors?.fields?.identifier && (
          <Text style={s.errorText}>{errors.fields.identifier.message}</Text>
        )}

        <Text style={s.label}>Password</Text>
        <View style={s.passwordRow}>
          <TextInput
            style={[s.input, { flex: 1, marginBottom: 0 }]}
            value={password}
            placeholder="Password"
            placeholderTextColor={colors.mutedForeground}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            testID="password-input"
          />
          <Pressable
            onPress={() => setShowPassword((v) => !v)}
            style={s.eyeBtn}
          >
            <Ionicons
              name={showPassword ? "eye-off" : "eye"}
              size={20}
              color={colors.mutedForeground}
            />
          </Pressable>
        </View>
        {errors?.fields?.password && (
          <Text style={s.errorText}>{errors.fields.password.message}</Text>
        )}

        <Pressable
          style={({ pressed }) => [
            s.primaryButton,
            (!email || !password || fetchStatus === "fetching") && s.disabled,
            pressed && s.pressed,
          ]}
          onPress={handleEmailSignIn}
          disabled={!email || !password || fetchStatus === "fetching"}
          testID="sign-in-button"
        >
          {fetchStatus === "fetching" ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={s.primaryButtonText}>Sign In</Text>
          )}
        </Pressable>

        <View style={s.footer}>
          <Text style={s.footerText}>No account? </Text>
          <Pressable onPress={() => router.push("/(auth)/sign-up")}>
            <Text style={s.footerLink}>Sign up</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) {
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  return StyleSheet.create({
    scrollContent: {
      flexGrow: 1,
      paddingTop: topPad + 32,
      paddingBottom: bottomPad + 32,
      paddingHorizontal: 24,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      paddingTop: topPad + 32,
      paddingHorizontal: 24,
      backgroundColor: colors.background,
    },
    header: {
      alignItems: "center",
      marginBottom: 40,
    },
    logoMark: {
      width: 64,
      height: 64,
      borderRadius: 16,
      backgroundColor: colors.redDim,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 16,
    },
    logo: {
      fontSize: 22,
      fontWeight: "800" as const,
      color: colors.foreground,
      letterSpacing: 3,
      fontFamily: "Inter_700Bold",
    },
    subtitle: {
      fontSize: 14,
      color: colors.mutedForeground,
      marginTop: 6,
      fontFamily: "Inter_400Regular",
    },
    oauthButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingVertical: 14,
      marginBottom: 20,
    },
    oauthText: {
      color: colors.foreground,
      fontSize: 15,
      fontWeight: "600" as const,
      fontFamily: "Inter_600SemiBold",
    },
    divider: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 20,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    dividerText: {
      color: colors.mutedForeground,
      paddingHorizontal: 12,
      fontSize: 13,
      fontFamily: "Inter_400Regular",
    },
    label: {
      color: colors.grayLight,
      fontSize: 12,
      fontWeight: "600" as const,
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
      paddingVertical: 13,
      color: colors.foreground,
      fontSize: 15,
      marginBottom: 16,
      fontFamily: "Inter_400Regular",
    },
    passwordRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 16,
    },
    eyeBtn: {
      position: "absolute",
      right: 14,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingVertical: 15,
      alignItems: "center",
      marginTop: 4,
      marginBottom: 24,
    },
    primaryButtonText: {
      color: colors.primaryForeground,
      fontSize: 15,
      fontWeight: "700" as const,
      letterSpacing: 0.5,
      fontFamily: "Inter_700Bold",
    },
    disabled: {
      opacity: 0.4,
    },
    pressed: {
      opacity: 0.8,
    },
    footer: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
    },
    footerText: {
      color: colors.mutedForeground,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
    },
    footerLink: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: "600" as const,
      fontFamily: "Inter_600SemiBold",
    },
    errorText: {
      color: colors.primary,
      fontSize: 12,
      marginBottom: 12,
      marginTop: -8,
      fontFamily: "Inter_400Regular",
    },
    linkBtn: {
      alignItems: "center",
      paddingVertical: 12,
    },
    linkText: {
      color: colors.primary,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
    },
  });
}
