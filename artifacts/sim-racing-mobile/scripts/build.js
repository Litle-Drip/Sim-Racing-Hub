const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const STATIC_BUILD = path.join(projectRoot, "static-build");
const basePath = (process.env.BASE_PATH || "/").replace(/\/+$/, "");

function stripProtocol(domain) {
  let urlString = domain.trim();
  if (!/^https?:\/\//i.test(urlString)) {
    urlString = `https://${urlString}`;
  }
  return new URL(urlString).host;
}

function getDeploymentDomain() {
  if (process.env.REPLIT_INTERNAL_APP_DOMAIN) {
    return stripProtocol(process.env.REPLIT_INTERNAL_APP_DOMAIN);
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return stripProtocol(process.env.REPLIT_DEV_DOMAIN);
  }
  if (process.env.EXPO_PUBLIC_DOMAIN) {
    return stripProtocol(process.env.EXPO_PUBLIC_DOMAIN);
  }
  const replSlug = process.env.REPL_SLUG;
  const replOwner = process.env.REPL_OWNER;
  if (replSlug && replOwner) {
    const domain = `${replSlug}-${replOwner}.replit.app`;
    console.log(`Derived production domain from REPL_SLUG/REPL_OWNER: ${domain}`);
    return domain;
  }
  console.warn(
    "SKIP: No deployment domain found (not a Replit environment). " +
    "Set REPLIT_INTERNAL_APP_DOMAIN, REPLIT_DEV_DOMAIN, or EXPO_PUBLIC_DOMAIN to build the mobile app.",
  );
  return null;
}

function prepareDirectories() {
  console.log("Preparing build directories...");
  if (fs.existsSync(STATIC_BUILD)) {
    fs.rmSync(STATIC_BUILD, { recursive: true });
  }
}

function createManifestDirs() {
  fs.mkdirSync(path.join(STATIC_BUILD, "ios"), { recursive: true });
  fs.mkdirSync(path.join(STATIC_BUILD, "android"), { recursive: true });
}

function runExpoExport(domain) {
  console.log("Running expo export (this may take several minutes)...");
  const env = {
    ...process.env,
    EXPO_PUBLIC_DOMAIN: domain,
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.CLERK_PUBLISHABLE_KEY ||
      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      "",
    CI: "1",
    EXPO_NO_TELEMETRY: "1",
  };

  execSync(
    `pnpm exec expo export --platform ios --platform android --output-dir "${STATIC_BUILD}" --clear`,
    {
      cwd: projectRoot,
      stdio: "inherit",
      env,
      timeout: 20 * 60 * 1000,
    },
  );
  console.log("Expo export complete");
}

function buildManifest(platform, metadata, domain, appJson) {
  const platformMeta = metadata.fileMetadata[platform];
  if (!platformMeta) {
    throw new Error(`No metadata for platform: ${platform}`);
  }

  const bundlePath = platformMeta.bundle;
  const bundleUrl = `https://${domain}${basePath}/${bundlePath}`;

  const bundleHashMatch = bundlePath.match(/entry-([a-f0-9]+)/);
  const bundleHash = bundleHashMatch ? bundleHashMatch[1] : Date.now().toString(16);

  const expoConfig = appJson.expo || {};
  const version = expoConfig.version || "1.0.0";
  const sdkVersion = "54.0.0";

  const assets = (platformMeta.assets || []).map((asset) => {
    let contentType = "application/octet-stream";
    if (asset.ext === "ttf" || asset.ext === "otf") contentType = "font/ttf";
    else if (asset.ext === "png") contentType = "image/png";
    else if (asset.ext === "jpg" || asset.ext === "jpeg") contentType = "image/jpeg";
    else if (asset.ext === "gif") contentType = "image/gif";
    else if (asset.ext === "webp") contentType = "image/webp";

    const assetHash = asset.path.split("/").pop();
    return {
      hash: assetHash,
      key: asset.path.replace(/\//g, "-"),
      contentType,
      url: `https://${domain}${basePath}/${asset.path}`,
    };
  });

  const manifest = {
    id: bundleHash,
    createdAt: new Date().toISOString(),
    runtimeVersion: `exposdk:${sdkVersion}`,
    launchAsset: {
      hash: bundleHash,
      key: `bundle-${bundleHash}`,
      contentType: "application/javascript",
      url: bundleUrl,
    },
    assets,
    metadata: {},
    extra: {
      expoClient: {
        name: expoConfig.name || "App",
        slug: expoConfig.slug || "app",
        version,
        orientation: expoConfig.orientation || "portrait",
        icon: expoConfig.icon,
        userInterfaceStyle: expoConfig.userInterfaceStyle || "automatic",
        splash: expoConfig.splash,
        ios: expoConfig.ios,
        android: expoConfig.android,
        sdkVersion,
        platforms: ["ios", "android"],
        currentFullName: `@anonymous/${expoConfig.slug || "app"}`,
        originalFullName: `@anonymous/${expoConfig.slug || "app"}`,
      },
      expoGo: {
        developer: { tool: "expo-cli" },
        packagerOpts: { dev: false },
        debuggerHost: `${domain}${basePath}/${platform}`,
        mainModuleName: "node_modules/expo-router/entry",
      },
    },
  };

  return manifest;
}

function main() {
  console.log("Building static Expo Go deployment...");

  const domain = getDeploymentDomain();
  if (!domain) {
    return;
  }
  console.log(`Using domain: ${domain}`);

  prepareDirectories();
  runExpoExport(domain);
  createManifestDirs();

  const metadataPath = path.join(STATIC_BUILD, "metadata.json");
  if (!fs.existsSync(metadataPath)) {
    console.error("ERROR: metadata.json not found after expo export");
    process.exit(1);
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
  const appJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "app.json"), "utf-8"),
  );

  console.log("Building manifests...");
  for (const platform of ["ios", "android"]) {
    const manifest = buildManifest(platform, metadata, domain, appJson);
    const manifestPath = path.join(STATIC_BUILD, platform, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`${platform} manifest written`);
  }

  console.log(`Build complete! Deploy to: https://${domain}`);
}

try {
  main();
} catch (error) {
  console.error("Build failed:", error.message);
  process.exit(1);
}
