import { useSignUp } from "@clerk/expo";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React from "react";
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

export default function SignUpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { signUp, errors, fetchStatus } = useSignUp();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);

  const handleSignUp = async () => {
    const { error } = await signUp.password({ emailAddress: email, password });
    if (error) return;
    if (!error) await signUp.verifications.sendEmailCode();
  };

  const handleVerify = async () => {
    await signUp.verifications.verifyEmailCode({ code });
    if (signUp.status === "complete") {
      await signUp.finalize({
        navigate: () => {
          router.replace("/(home)/(tabs)");
        },
      });
    }
  };

  const s = makeStyles(colors, insets);

  if (
    signUp.status === "missing_requirements" &&
    signUp.unverifiedFields?.includes("email_address") &&
    signUp.missingFields?.length === 0
  ) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <View style={s.logoMark}>
            <Ionicons name="mail" size={28} color={colors.primary} />
          </View>
          <Text style={s.logo}>Verify Email</Text>
          <Text style={s.subtitle}>Enter the code sent to {email}</Text>
        </View>
        <Text style={s.label}>Verification Code</Text>
        <TextInput
          style={s.input}
          value={code}
          placeholder="000000"
          placeholderTextColor={colors.mutedForeground}
          onChangeText={setCode}
          keyboardType="numeric"
          autoFocus
          textAlign="center"
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
            <Text style={s.primaryButtonText}>Verify & Continue</Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => signUp.verifications.sendEmailCode()}
          style={s.linkBtn}
        >
          <Text style={s.linkText}>Resend code</Text>
        </Pressable>
        <View nativeID="clerk-captcha" />
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
          <Text style={s.subtitle}>Create your account</Text>
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
        />
        {errors?.fields?.emailAddress && (
          <Text style={s.errorText}>{errors.fields.emailAddress.message}</Text>
        )}

        <Text style={s.label}>Password</Text>
        <View style={s.passwordRow}>
          <TextInput
            style={[s.input, { flex: 1, marginBottom: 0 }]}
            value={password}
            placeholder="Min. 8 characters"
            placeholderTextColor={colors.mutedForeground}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
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
          onPress={handleSignUp}
          disabled={!email || !password || fetchStatus === "fetching"}
        >
          {fetchStatus === "fetching" ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={s.primaryButtonText}>Create Account</Text>
          )}
        </Pressable>

        <View style={s.footer}>
          <Text style={s.footerText}>Already have an account? </Text>
          <Pressable onPress={() => router.push("/(auth)/sign-in")}>
            <Text style={s.footerLink}>Sign in</Text>
          </Pressable>
        </View>

        <View nativeID="clerk-captcha" />
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
